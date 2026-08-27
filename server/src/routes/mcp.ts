/**
 * mcp.ts — Servidor MCP (Model Context Protocol) do Boom IA
 *
 * Implementa o protocolo JSON-RPC 2.0 conforme a spec MCP (streamable HTTP).
 * Autenticação: Bearer boomia_sk_... (hash SHA-256 validado na tabela tenant_mcp_keys)
 *
 * Rotas:
 *   POST /mcp  → endpoint principal MCP (initialize, tools/list, tools/call)
 *   GET  /mcp  → retorna 200 com info do servidor (discovery)
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { createNexusClient } from "../services/supabase.js";
import { encrypt } from "../services/crypto.js";

/** Calcula SHA-256 de um token */
async function hashToken(token: string): Promise<string> {
  const encoded = new TextEncoder().encode(token);
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Tenta autenticar pelo Bearer token e retorna o tenant_id */
async function authenticateMcpRequest(req: FastifyRequest): Promise<string | null> {
  const auth = (req.headers.authorization as string) || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token.startsWith("boomia_sk_")) return null;

  const supabase = createNexusClient();
  const keyHash = await hashToken(token);

  const { data, error } = await supabase
    .from("tenant_mcp_keys")
    .select("id, tenant_id")
    .eq("key_hash", keyHash)
    .maybeSingle();

  if (error || !data) return null;

  // Atualiza last_used_at em background (não bloqueia a resposta)
  supabase
    .from("tenant_mcp_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id)
    .then(() => {});

  return data.tenant_id as string;
}

// ─── Definição das Tools MCP ────────────────────────────────────────────────

const MCP_TOOLS = [
  {
    name: "list_agents",
    description: "Lista todos os agentes de IA do tenant com nome, modelo, provedor e status.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_agent",
    description: "Retorna a configuração completa de um agente pelo ID ou nome.",
    inputSchema: {
      type: "object",
      properties: {
        agent_id: { type: "string", description: "UUID do agente" },
        name: { type: "string", description: "Nome do agente (busca parcial, case-insensitive)" },
      },
    },
  },
  {
    name: "update_agent_prompts",
    description: "Atualiza os prompts de um agente (system prompt, regras de comunicação, dispatcher prompt, followup prompt). Ativa automaticamente o override_prompts=true.",
    inputSchema: {
      type: "object",
      required: ["agent_id"],
      properties: {
        agent_id: { type: "string", description: "UUID do agente" },
        system_prompt: { type: "string", description: "Instruções de personalidade, escopo e comportamento da IA" },
        communication_rules: { type: "string", description: "Regras de tom, formatação e emojis" },
        dispatcher_prompt: { type: "string", description: "Calibração para o modelo classificador de ferramentas (Phase 1)" },
        followup_prompt: { type: "string", description: "Mensagem de follow-up enviada em tentativas de reengajamento" },
      },
    },
  },
  {
    name: "update_agent_config",
    description: "Atualiza configurações do agente como modelo de IA, temperatura, override de prompts e saudação padrão.",
    inputSchema: {
      type: "object",
      required: ["agent_id"],
      properties: {
        agent_id: { type: "string", description: "UUID do agente" },
        model: { type: "string", description: "Modelo de IA (ex: gpt-4o, gemini-2.0-flash)" },
        status: { type: "string", enum: ["active", "inactive", "test"], description: "Status operacional do agente" },
        temperature: { type: "number", description: "Temperatura de geração (0.0 a 2.0)" },
        override_prompts: { type: "boolean", description: "Se true, usa os prompts do banco em vez do código" },
        always_inject_comm_rules: { type: "boolean", description: "Se true, injeta regras de comunicação mesmo sem ferramentas vinculadas" },
        skip_greeting: { type: "boolean", description: "Se true, não injeta a saudação padrão do sistema" },
      },
    },
  },
  {
    name: "get_tenant_info",
    description: "Retorna informações do tenant atual (nome, slug, módulos ativos, agentes).",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "create_agent",
    description: "Cria um novo agente de IA para o tenant. Retorna o ID e dados do agente criado.",
    inputSchema: {
      type: "object",
      required: ["name"],
      properties: {
        name: { type: "string", description: "Nome do agente (ex: 'Assistente de Vendas')" },
        model: { type: "string", description: "Modelo de IA (ex: gpt-4o, gemini-2.0-flash, claude-3-5-sonnet). Padrão: gemini-2.0-flash" },
        system_prompt: { type: "string", description: "System prompt inicial do agente" },
        description: { type: "string", description: "Descrição interna do agente" },
        temperature: { type: "number", description: "Temperatura de geração (0.0 a 2.0). Padrão: 0.7" },
      },
    },
  },
  {
    name: "delete_agent",
    description: "Remove permanentemente um agente do tenant. Esta operação é irreversível.",
    inputSchema: {
      type: "object",
      required: ["agent_id"],
      properties: {
        agent_id: { type: "string", description: "UUID do agente a ser removido" },
        confirm: { type: "boolean", description: "Deve ser true para confirmar a exclusão" },
      },
    },
  },
  {
    name: "list_agent_tools",
    description: "Lista todas as ferramentas (tools) vinculadas a um agente, com nome, tipo e descrição.",
    inputSchema: {
      type: "object",
      required: ["agent_id"],
      properties: {
        agent_id: { type: "string", description: "UUID do agente" },
      },
    },
  },
  {
    name: "list_available_tools",
    description: "Lista todas as tools disponíveis no sistema para o tenant poder vincular a um agente.",
    inputSchema: {
      type: "object",
      properties: {
        tool_type: { type: "string", description: "Filtrar por tipo (ex: omnibees_availability, inventory_query, marcar_lead, send_notification)" },
      },
    },
  },
  {
    name: "manage_agent_tool",
    description: "Vincula ou desvincula uma tool de um agente. Use action=link para vincular e action=unlink para desvincular.",
    inputSchema: {
      type: "object",
      required: ["agent_id", "tool_id", "action"],
      properties: {
        agent_id: { type: "string", description: "UUID do agente" },
        tool_id: { type: "string", description: "UUID da tool" },
        action: { type: "string", enum: ["link", "unlink"], description: "link para vincular, unlink para desvincular" },
      },
    },
  },
  {
    name: "list_providers",
    description: "Lista o catálogo global de provedores de modelo (sem devolver a API key).",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "upsert_provider",
    description: "Cria ou atualiza um provedor global. Informe provider_id para atualizar.",
    inputSchema: {
      type: "object",
      required: ["name"],
      properties: {
        provider_id: { type: "string", description: "UUID do provedor (omitir para criar)" },
        name: { type: "string" },
        base_url: { type: "string" },
        model_default: { type: "string" },
        status: { type: "string", enum: ["active", "degraded", "offline"] },
        api_key: { type: "string", description: "API key em texto; criptografada no servidor" },
      },
    },
  },
  {
    name: "delete_provider",
    description: "Remove um provedor global do catálogo.",
    inputSchema: {
      type: "object",
      required: ["provider_id"],
      properties: {
        provider_id: { type: "string" },
      },
    },
  },
];

// ─── Executores das Tools ────────────────────────────────────────────────────

async function executeTool(name: string, input: Record<string, unknown>, tenantId: string): Promise<unknown> {
  const supabase = createNexusClient();

  switch (name) {
    case "list_agents": {
      const { data, error } = await supabase
        .from("agents")
        .select("id, name, model, provider_id, system_prompt, override_prompts, status, temperature, description, avatar_url, created_at, updated_at")
        .eq("tenant_id", tenantId)
        .order("name");
      if (error) throw new Error(`Erro ao listar agentes: ${error.message}`);
      return { agents: data };
    }

    case "get_agent": {
      let query = supabase
        .from("agents")
        .select("id, name, model, provider_id, system_prompt, communication_rules, dispatcher_prompt, followup_prompt, override_prompts, always_inject_comm_rules, skip_greeting, temperature, status, description, avatar_url, config, created_at, updated_at")
        .eq("tenant_id", tenantId);

      if (typeof input.agent_id === "string") {
        query = query.eq("id", input.agent_id);
      } else if (typeof input.name === "string") {
        query = query.ilike("name", `%${input.name}%`);
      } else {
        throw new Error("Informe agent_id ou name para buscar o agente.");
      }

      const { data, error } = await query.maybeSingle();
      if (error) throw new Error(`Erro ao buscar agente: ${error.message}`);
      if (!data) throw new Error("Agente não encontrado. Verifique o agent_id ou name.");
      return { agent: data };
    }

    case "update_agent_prompts": {
      const agentId = input.agent_id as string;
      if (!agentId) throw new Error("agent_id é obrigatório.");

      // Verifica que o agente pertence ao tenant antes de atualizar
      const { data: existing } = await supabase
        .from("agents")
        .select("id")
        .eq("id", agentId)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (!existing) throw new Error("Agente não encontrado ou sem permissão.");

      const updates: Record<string, unknown> = { override_prompts: true, updated_at: new Date().toISOString() };
      if (typeof input.system_prompt === "string") updates.system_prompt = input.system_prompt;
      if (typeof input.communication_rules === "string") updates.communication_rules = input.communication_rules;
      if (typeof input.dispatcher_prompt === "string") updates.dispatcher_prompt = input.dispatcher_prompt;
      if (typeof input.followup_prompt === "string") updates.followup_prompt = input.followup_prompt;

      const { error } = await supabase.from("agents").update(updates).eq("id", agentId);
      if (error) throw new Error(`Erro ao atualizar prompts: ${error.message}`);

      return { success: true, agent_id: agentId, fields_updated: Object.keys(updates).filter(k => k !== "updated_at") };
    }

    case "update_agent_config": {
      const agentId = input.agent_id as string;
      if (!agentId) throw new Error("agent_id é obrigatório.");

      const { data: existing } = await supabase
        .from("agents")
        .select("id")
        .eq("id", agentId)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (!existing) throw new Error("Agente não encontrado ou sem permissão.");

      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (typeof input.model === "string") updates.model = input.model;
      if (typeof input.status === "string") {
        const status = input.status.trim().toLowerCase();
        if (status === "active" || status === "inactive" || status === "test") {
          updates.status = status;
        }
      }
      if (typeof input.temperature === "number") updates.temperature = input.temperature;
      if (typeof input.override_prompts === "boolean") updates.override_prompts = input.override_prompts;
      if (typeof input.always_inject_comm_rules === "boolean") updates.always_inject_comm_rules = input.always_inject_comm_rules;
      if (typeof input.skip_greeting === "boolean") updates.skip_greeting = input.skip_greeting;

      const { error } = await supabase.from("agents").update(updates).eq("id", agentId);
      if (error) throw new Error(`Erro ao atualizar configuração: ${error.message}`);

      return { success: true, agent_id: agentId, fields_updated: Object.keys(updates).filter(k => k !== "updated_at") };
    }

    case "get_tenant_info": {
      const { data: tenant, error: tenantErr } = await supabase
        .from("tenants")
        .select("id, name, slug, plan, status, settings, created_at")
        .eq("id", tenantId)
        .maybeSingle();
      if (tenantErr || !tenant) throw new Error("Erro ao buscar dados do tenant.");

      const { data: agents } = await supabase
        .from("agents")
        .select("id, name, model")
        .eq("tenant_id", tenantId)
        .order("name");

      return { tenant, agents: agents ?? [] };
    }

    case "create_agent": {
      const name = input.name as string;
      if (!name?.trim()) throw new Error("name é obrigatório.");

      const insertData: Record<string, unknown> = {
        tenant_id: tenantId,
        name: name.trim(),
        model: (typeof input.model === "string" && input.model.trim()) ? input.model.trim() : "gemini-2.0-flash",
        temperature: typeof input.temperature === "number" ? input.temperature : 0.7,
        status: "active",
      };
      if (typeof input.system_prompt === "string") insertData.system_prompt = input.system_prompt;
      if (typeof input.description === "string") insertData.description = input.description;

      const { data, error } = await supabase
        .from("agents")
        .insert(insertData)
        .select("id, name, model, temperature, status, created_at")
        .single();

      if (error) throw new Error(`Erro ao criar agente: ${error.message}`);
      return { success: true, agent: data };
    }

    case "delete_agent": {
      const agentId = input.agent_id as string;
      if (!agentId) throw new Error("agent_id é obrigatório.");
      if (input.confirm !== true) throw new Error("Para confirmar a exclusão, envie confirm: true. Esta ação é irreversível.");

      // Garante que o agente pertence ao tenant
      const { data: existing } = await supabase
        .from("agents")
        .select("id, name")
        .eq("id", agentId)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (!existing) throw new Error("Agente não encontrado ou sem permissão.");

      const { error } = await supabase.from("agents").delete().eq("id", agentId);
      if (error) throw new Error(`Erro ao deletar agente: ${error.message}`);

      return { success: true, deleted_agent: { id: agentId, name: existing.name } };
    }

    case "list_agent_tools": {
      const agentId = input.agent_id as string;
      if (!agentId) throw new Error("agent_id é obrigatório.");

      // Verifica que o agente pertence ao tenant
      const { data: agentCheck } = await supabase
        .from("agents")
        .select("id, name")
        .eq("id", agentId)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (!agentCheck) throw new Error("Agente não encontrado ou sem permissão.");

      const { data, error } = await supabase
        .from("agent_tools")
        .select("tool_id, tools(id, name, description, tool_type)")
        .eq("agent_id", agentId);

      if (error) throw new Error(`Erro ao listar tools do agente: ${error.message}`);

      const tools = (data ?? []).map((row: any) => row.tools).filter(Boolean);
      return { agent_id: agentId, agent_name: agentCheck.name, tools, total: tools.length };
    }

    case "list_available_tools": {
      let query = supabase
        .from("tools")
        .select("id, name, description, tool_type, tenant_id, function_def, created_at")
        .order("name");

      if (typeof input.tool_type === "string" && input.tool_type.trim()) {
        query = query.eq("tool_type", input.tool_type.trim());
      }

      const { data, error } = await query;
      if (error) throw new Error(`Erro ao listar tools: ${error.message}`);
      const tenantTools = (data ?? []).filter((row: { tenant_id?: string | null }) => {
        const tid = row.tenant_id;
        return !tid || tid === tenantId;
      });
      return { tools: tenantTools, total: tenantTools.length };
    }

    case "manage_agent_tool": {
      const agentId = input.agent_id as string;
      const toolId = input.tool_id as string;
      const action = input.action as string;

      if (!agentId) throw new Error("agent_id é obrigatório.");
      if (!toolId) throw new Error("tool_id é obrigatório.");
      if (action !== "link" && action !== "unlink") throw new Error("action deve ser 'link' ou 'unlink'.");

      // Verifica que o agente pertence ao tenant
      const { data: agentCheck } = await supabase
        .from("agents")
        .select("id, name")
        .eq("id", agentId)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (!agentCheck) throw new Error("Agente não encontrado ou sem permissão.");

      if (action === "link") {
        const { error } = await supabase
          .from("agent_tools")
          .upsert({ agent_id: agentId, tool_id: toolId }, { onConflict: "agent_id,tool_id" });
        if (error) throw new Error(`Erro ao vincular tool: ${error.message}`);
        return { success: true, action: "linked", agent_id: agentId, tool_id: toolId };
      } else {
        const { error } = await supabase
          .from("agent_tools")
          .delete()
          .eq("agent_id", agentId)
          .eq("tool_id", toolId);
        if (error) throw new Error(`Erro ao desvincular tool: ${error.message}`);
        return { success: true, action: "unlinked", agent_id: agentId, tool_id: toolId };
      }
    }

    case "list_providers": {
      const { data, error } = await supabase
        .from("providers")
        .select("id, name, base_url, model_default, status, created_at, api_key_encrypted")
        .order("name");
      if (error) throw new Error(`Erro ao listar provedores: ${error.message}`);
      const providers = (data ?? []).map((row: Record<string, unknown>) => {
        const { api_key_encrypted, ...rest } = row;
        return { ...rest, has_key: Boolean(api_key_encrypted) };
      });
      return { providers, total: providers.length };
    }

    case "upsert_provider": {
      const providerId = typeof input.provider_id === "string" ? input.provider_id.trim() : "";
      const name = typeof input.name === "string" ? input.name.trim() : "";
      if (!name) throw new Error("name é obrigatório.");
      const row: Record<string, unknown> = {
        name,
        base_url: typeof input.base_url === "string" ? input.base_url.trim() || null : null,
        model_default: typeof input.model_default === "string" ? input.model_default.trim() || null : null,
        status: typeof input.status === "string" && input.status.trim() ? input.status : "active",
      };
      if (typeof input.api_key === "string" && input.api_key.trim()) {
        const encryptionKey = process.env.ENCRYPTION_KEY;
        if (!encryptionKey) throw new Error("ENCRYPTION_KEY não configurada.");
        row.api_key_encrypted = await encrypt(input.api_key.trim(), encryptionKey);
      }
      let saved: Record<string, unknown> | null = null;
      if (providerId) {
        const { data, error } = await supabase.from("providers").update(row).eq("id", providerId).select("id, name, base_url, model_default, status").single();
        if (error) throw new Error(`Erro ao atualizar provedor: ${error.message}`);
        saved = data as Record<string, unknown>;
      } else {
        const { data, error } = await supabase.from("providers").insert(row).select("id, name, base_url, model_default, status").single();
        if (error) throw new Error(`Erro ao criar provedor: ${error.message}`);
        saved = data as Record<string, unknown>;
      }
      return { provider: saved };
    }

    case "delete_provider": {
      const providerId = typeof input.provider_id === "string" ? input.provider_id.trim() : "";
      if (!providerId) throw new Error("provider_id é obrigatório.");
      const { error } = await supabase.from("providers").delete().eq("id", providerId);
      if (error) throw new Error(`Erro ao remover provedor: ${error.message}`);
      return { success: true, deleted_id: providerId };
    }

    default:
      throw new Error(`Tool desconhecida: ${name}`);
  }
}

async function mcpDiscovery(_req: FastifyRequest, reply: FastifyReply) {
  return reply.send({
    name: "Boom IA MCP Server",
    version: "1.0.0",
    description: "Servidor MCP do Boom IA — conecte sua IA ao painel de agentes.",
    protocolVersion: "2024-11-05",
  });
}

async function mcpJsonRpc(req: FastifyRequest, reply: FastifyReply) {
    const tenantId = await authenticateMcpRequest(req);
    if (!tenantId) {
      return reply.code(401).send({
        jsonrpc: "2.0",
        id: null,
        error: { code: -32001, message: "Unauthorized: API key MCP inválida ou ausente." },
      });
    }

    const body = req.body as any;
    const id = body?.id ?? null;
    const method = body?.method as string | undefined;
    const params = body?.params ?? {};

    req.log.info({ method, tenantId }, "[MCP] Request recebida");

    try {
      // ── initialize ──────────────────────────────────────────────────────────
      if (method === "initialize") {
        return reply.send({
          jsonrpc: "2.0",
          id,
          result: {
            protocolVersion: "2024-11-05",
            capabilities: { tools: {} },
            serverInfo: { name: "boom-ia", version: "1.0.0" },
          },
        });
      }

      // ── notifications/initialized (cliente confirma) ─────────────────────
      if (method === "notifications/initialized") {
        return reply.code(204).send();
      }

      // ── tools/list ──────────────────────────────────────────────────────────
      if (method === "tools/list") {
        return reply.send({
          jsonrpc: "2.0",
          id,
          result: { tools: MCP_TOOLS },
        });
      }

      // ── tools/call ──────────────────────────────────────────────────────────
      if (method === "tools/call") {
        const toolName = params?.name as string;
        const toolInput = (params?.arguments ?? {}) as Record<string, unknown>;

        if (!toolName) {
          return reply.send({
            jsonrpc: "2.0",
            id,
            error: { code: -32602, message: "Parâmetro 'name' ausente em tools/call." },
          });
        }

        const result = await executeTool(toolName, toolInput, tenantId);
        return reply.send({
          jsonrpc: "2.0",
          id,
          result: {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          },
        });
      }

      // ── método desconhecido ─────────────────────────────────────────────────
      return reply.send({
        jsonrpc: "2.0",
        id,
        error: { code: -32601, message: `Método desconhecido: ${method}` },
      });
    } catch (err: any) {
      req.log.error(err, "[MCP] Erro ao executar tool");
      return reply.send({
        jsonrpc: "2.0",
        id,
        error: { code: -32000, message: err?.message ?? "Erro interno do servidor MCP." },
      });
    }
}

// ─── Registro das Rotas ──────────────────────────────────────────────────────
// /mcp — acesso direto ao container Node
// /api/mcp — mesmo handler atrás do nginx de produção (só /api e /health são proxied)

export async function mcpRoutes(fastify: FastifyInstance) {
  fastify.get("/mcp", mcpDiscovery);
  fastify.post("/mcp", mcpJsonRpc);
  fastify.get("/api/mcp", mcpDiscovery);
  fastify.post("/api/mcp", mcpJsonRpc);
}
