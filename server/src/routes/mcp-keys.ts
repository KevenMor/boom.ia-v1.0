/**
 * mcp-keys.ts — Gerenciamento de API Keys MCP por Tenant
 *
 * Rotas:
 *   GET    /api/mcp-keys            → lista keys do tenant autenticado
 *   POST   /api/mcp-keys            → gera nova key (retorna o valor completo UMA ÚNICA VEZ)
 *   DELETE /api/mcp-keys/:id        → revoga uma key
 *   GET    /api/mcp-keys/config     → retorna JSON de configuração MCP para download
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { createNexusClient } from "../services/supabase.js";
import { resolveAccessContext } from "../services/authorization.js";

const MCP_SERVER_URL = process.env.MCP_SERVER_URL || "https://api.boom.ia/mcp";

/** Gera um token seguro no formato boomia_sk_<32 bytes hex> */
function generateMcpToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
  return `boomia_sk_${hex}`;
}

/** Calcula SHA-256 do token para armazenar no banco (nunca o token em si) */
async function hashToken(token: string): Promise<string> {
  const encoded = new TextEncoder().encode(token);
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function mcpKeysRoutes(fastify: FastifyInstance) {
  const supabase = createNexusClient();

  /** Valida JWT e retorna o primeiro tenant do usuário autenticado */
  async function resolveUserTenant(req: FastifyRequest, reply: FastifyReply): Promise<{ userId: string; tenantId: string } | null> {
    let ctx;
    try {
      ctx = await resolveAccessContext(req);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const pool = /connection pool|timeout/i.test(msg);
      reply.code(pool ? 503 : 500).send({ error: msg });
      return null;
    }
    if (!ctx) {
      reply.code(401).send({ error: "Não autenticado." });
      return null;
    }
    // Pega o primeiro tenant que o usuário é membro
    const tenantId = ctx.tenantAdminIds[0] ?? ctx.tenantIds[0];
    if (!tenantId) {
      reply.code(403).send({ error: "Usuário não vinculado a nenhum tenant." });
      return null;
    }
    return { userId: ctx.userId, tenantId };
  }

  /** GET /api/mcp-keys — Lista keys do tenant */
  fastify.get("/mcp-keys", async (req: FastifyRequest, reply: FastifyReply) => {
    const resolved = await resolveUserTenant(req, reply);
    if (!resolved) return;

    const { tenantId } = resolved;
    const { data, error } = await supabase
      .from("tenant_mcp_keys")
      .select("id, label, key_preview, created_at, last_used_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false });

    if (error) {
      fastify.log.error(error, "[MCP-Keys] Erro ao listar keys");
      return reply.code(500).send({ error: "Erro ao buscar chaves MCP." });
    }
    return reply.send({ keys: data });
  });

  /** POST /mcp-keys — Gera nova key */
  fastify.post("/mcp-keys", async (req: FastifyRequest, reply: FastifyReply) => {
    const resolved = await resolveUserTenant(req, reply);
    if (!resolved) return;

    const { tenantId } = resolved;
    const body = (req.body as any) || {};
    const label: string = (typeof body.label === "string" && body.label.trim()) ? body.label.trim() : "default";

    // Limitar a 10 keys por tenant
    const { count } = await supabase
      .from("tenant_mcp_keys")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId);

    if ((count ?? 0) >= 10) {
      return reply.code(429).send({ error: "Limite de 10 chaves por tenant atingido. Revogue uma chave antes de gerar nova." });
    }

    const token = generateMcpToken();
    const keyHash = await hashToken(token);
    const keyPreview = token.slice(0, 16) + "...";

    const { data, error } = await supabase
      .from("tenant_mcp_keys")
      .insert({ tenant_id: tenantId, key_hash: keyHash, key_preview: keyPreview, label })
      .select("id, label, key_preview, created_at")
      .single();

    if (error) {
      fastify.log.error(error, "[MCP-Keys] Erro ao criar key");
      return reply.code(500).send({ error: "Erro ao criar chave MCP." });
    }

    // Retorna o token COMPLETO apenas neste momento — nunca mais será acessível
    return reply.code(201).send({ ...data, token });
  });

  /** DELETE /mcp-keys/:id — Revoga uma key */
  fastify.delete("/mcp-keys/:id", async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const resolved = await resolveUserTenant(req, reply);
    if (!resolved) return;

    const { tenantId } = resolved;
    const { id } = req.params;

    const { error } = await supabase
      .from("tenant_mcp_keys")
      .delete()
      .eq("id", id)
      .eq("tenant_id", tenantId); // garante isolamento de tenant

    if (error) {
      fastify.log.error(error, "[MCP-Keys] Erro ao revogar key");
      return reply.code(500).send({ error: "Erro ao revogar chave MCP." });
    }
    return reply.send({ success: true });
  });

  /** GET /mcp-keys/config?token=boomia_sk_... — Gera JSON de configuração MCP */
  fastify.get("/mcp-keys/config", async (req: FastifyRequest<{ Querystring: { token?: string } }>, reply: FastifyReply) => {
    const resolved = await resolveUserTenant(req, reply);
    if (!resolved) return;

    const token = req.query.token;
    if (!token || !token.startsWith("boomia_sk_")) {
      return reply.code(400).send({ error: "Parâmetro 'token' inválido. Passe o token completo como query string: ?token=boomia_sk_..." });
    }

    const config = {
      mcpServers: {
        "boom-ia": {
          type: "http",
          url: MCP_SERVER_URL,
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      },
    };

    reply.header("Content-Type", "application/json");
    reply.header("Content-Disposition", `attachment; filename="boom-ia-mcp-config.json"`);
    return reply.send(JSON.stringify(config, null, 2));
  });
}
