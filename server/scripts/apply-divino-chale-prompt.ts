/**
 * Aplica prompt Lara + tools (calendário, galeria, handoff, notificação grupo)
 * e garante follow-up habilitado no agente.
 *
 * Uso: cd server && npx tsx scripts/apply-divino-chale-prompt.ts
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import {
  SYSTEM_PROMPT,
  COMMUNICATION_RULES,
  DISPATCHER_PROMPT,
  FOLLOWUP_PROMPT,
} from "../src/services/prompts/divino-chale.ts";
import { SUITE_GALLERY_FUNCTION_DEF } from "../src/utils/builtin-agent-tools.ts";

const AGENT_ID = "8b9433df-37f2-4ea3-9564-8b3d4f7640cc";
const TENANT_ID = "7bc760ef-1a32-4552-ad0c-43f5a3e45bc9";
const CALENDAR_TOOL_ID = "5e383e6d-8ddf-404e-a654-77a190227837";

/** Chatwoot Mega account 17 — Gabriella (humano). Nunca 60 (Lara bot). */
const HANDOFF_ASSIGNEE_ID = 1;
/** Grupo WhatsApp "Marketing Divino Chalé" no Chatwoot. */
const NOTIFY_CONVERSATION_ID = 1;

const CALENDAR_FUNCTION_DEF = {
  name: "consultar_evento",
  description:
    "Calendário do Divino Chalé (diárias). Actions: check_lodging (1 data), sugerir_datas (até 3 próximas livres numa chamada), excluir. NÃO varra dia a dia. NÃO use slots de consultório.",
  parameters: {
    type: "object",
    properties: {
      action: {
        type: "string",
        description:
          "check_lodging = 1 diária; sugerir_datas = até 3 próximas livres; excluir = remover da agenda",
        enum: ["check_lodging", "sugerir_datas", "excluir"],
      },
      check_in: {
        type: "string",
        description: "Data de entrada (check-in) YYYY-MM-DD — obrigatório em check_lodging / excluir por período",
      },
      check_out: {
        type: "string",
        description: "Data de saída (check-out) YYYY-MM-DD — dia seguinte ao último pernoite",
      },
      preference: {
        type: "string",
        description: "Só sugerir_datas: any | weekend | weekday",
        enum: ["any", "weekend", "weekday"],
      },
      from_date: {
        type: "string",
        description: "Só sugerir_datas: a partir de YYYY-MM-DD (default: hoje)",
      },
      limit: {
        type: "number",
        description: "Só sugerir_datas: máximo de datas (1–3, default 3)",
      },
      event_id: {
        type: "string",
        description: "UUID do evento (só para action=excluir, se conhecido)",
      },
    },
    required: ["action"],
  },
};

const HANDOFF_FUNCTION_DEF = {
  name: "encaminhar_atendente",
  description:
    "Encaminha o atendimento ao humano no Chatwoot. Use quando Lara precisar passar Pix/link, reserva, reclamação, endereço/acesso, ou o cliente pedir humano. Cancela follow-ups e notifica o grupo automaticamente.",
  parameters: {
    type: "object",
    properties: {
      reason: {
        type: "string",
        description: "Motivo curto: Pagamento | Reserva | Reclamação | Endereço | Setor responsável",
      },
    },
    required: ["reason"],
  },
};

const HANDOFF_EXEC_CONFIG = {
  assignee_id: HANDOFF_ASSIGNEE_ID,
  rules: [
    { label: "Pagamento", assignee_id: HANDOFF_ASSIGNEE_ID },
    { label: "Reserva", assignee_id: HANDOFF_ASSIGNEE_ID },
    { label: "Reclamação", assignee_id: HANDOFF_ASSIGNEE_ID },
    { label: "Endereço", assignee_id: HANDOFF_ASSIGNEE_ID },
    { label: "Setor responsável", assignee_id: HANDOFF_ASSIGNEE_ID },
  ],
};

const NOTIFY_FUNCTION_DEF = {
  name: "enviar_notificacao",
  description: "NÃO chamar manualmente. Notificação automática no handoff (encaminhar_atendente).",
  parameters: {
    type: "object",
    properties: {},
    required: [] as string[],
  },
};

async function ensureAgentToolLink(
  sb: ReturnType<typeof createClient>,
  agentId: string,
  toolId: string,
): Promise<boolean> {
  const { data: existingLink } = await sb
    .from("agent_tools")
    .select("tool_id")
    .eq("agent_id", agentId)
    .eq("tool_id", toolId)
    .maybeSingle();
  if (existingLink) return true;
  const { error: linkErr } = await sb.from("agent_tools").insert({
    agent_id: agentId,
    tool_id: toolId,
  });
  if (linkErr) throw linkErr;
  return true;
}

async function upsertTenantTool(
  sb: ReturnType<typeof createClient>,
  opts: {
    toolType: string;
    name: string;
    description: string;
    functionDef: Record<string, unknown>;
    executionConfig: Record<string, unknown>;
  },
): Promise<string> {
  const { data: existing } = await sb
    .from("tools")
    .select("id")
    .eq("tenant_id", TENANT_ID)
    .eq("tool_type", opts.toolType)
    .maybeSingle();

  if (existing?.id) {
    const { error } = await sb
      .from("tools")
      .update({
        name: opts.name,
        description: opts.description,
        function_def: opts.functionDef,
        execution_config: opts.executionConfig,
      })
      .eq("id", existing.id);
    if (error) throw error;
    return existing.id as string;
  }

  const { data: created, error } = await sb
    .from("tools")
    .insert({
      name: opts.name,
      description: opts.description,
      type: "function",
      tool_type: opts.toolType,
      tenant_id: TENANT_ID,
      function_def: opts.functionDef,
      execution_config: opts.executionConfig,
    })
    .select("id")
    .single();
  if (error || !created) throw error || new Error(`create tool ${opts.name} failed`);
  return created.id as string;
}

async function main() {
  const env = Object.fromEntries(
    readFileSync(new URL("../.env", import.meta.url), "utf8")
      .split("\n")
      .filter((l) => l && !l.startsWith("#") && l.includes("="))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
      }),
  );
  const sb = createClient(env.NEXUS_DB_URL!, env.NEXUS_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

  const { error: toolErr } = await sb
    .from("tools")
    .update({
      name: "consultar_evento",
      description: CALENDAR_FUNCTION_DEF.description,
      function_def: CALENDAR_FUNCTION_DEF,
    })
    .eq("id", CALENDAR_TOOL_ID);
  if (toolErr) {
    console.error("update calendar tool:", toolErr);
    process.exit(1);
  }
  await ensureAgentToolLink(sb, AGENT_ID, CALENDAR_TOOL_ID);

  let { data: galleryTool } = await sb
    .from("tools")
    .select("id")
    .eq("tenant_id", TENANT_ID)
    .eq("tool_type", "suite_gallery_query")
    .maybeSingle();

  if (!galleryTool) {
    const { data: created, error: createErr } = await sb
      .from("tools")
      .insert({
        name: "suite_gallery_query",
        description:
          "Consulta galerias de fotos do Divino Chalé cadastradas no painel Galeria (Markdown).",
        tool_type: "suite_gallery_query",
        tenant_id: TENANT_ID,
        function_def: SUITE_GALLERY_FUNCTION_DEF,
        execution_config: {},
      })
      .select("id")
      .single();
    if (createErr || !created) {
      console.error("create gallery tool:", createErr);
      process.exit(1);
    }
    galleryTool = created;
  } else {
    await sb
      .from("tools")
      .update({
        name: "suite_gallery_query",
        function_def: SUITE_GALLERY_FUNCTION_DEF,
        description:
          "Consulta galerias de fotos do Divino Chalé cadastradas no painel Galeria (Markdown).",
      })
      .eq("id", galleryTool.id);
  }
  await ensureAgentToolLink(sb, AGENT_ID, galleryTool.id);

  const handoffToolId = await upsertTenantTool(sb, {
    toolType: "chatwoot_assign",
    name: "encaminhar_atendente",
    description:
      "Transfere a conversa no Chatwoot para a equipe humana do Divino Chalé (Gabi). Cancela follow-ups e dispara alerta no grupo automaticamente.",
    functionDef: HANDOFF_FUNCTION_DEF,
    executionConfig: HANDOFF_EXEC_CONFIG,
  });
  await ensureAgentToolLink(sb, AGENT_ID, handoffToolId);

  const notifyToolId = await upsertTenantTool(sb, {
    toolType: "send_notification",
    name: "enviar_notificacao",
    description:
      "Config interna: alerta Cliente aguardando atendimento no grupo Chatwoot após handoff. Não chamar pelo LLM.",
    functionDef: NOTIFY_FUNCTION_DEF,
    executionConfig: { conversation_id: NOTIFY_CONVERSATION_ID },
  });
  await ensureAgentToolLink(sb, AGENT_ID, notifyToolId);

  const { data: agentRow, error: fetchErr } = await sb
    .from("agents")
    .select("id, name, config")
    .eq("id", AGENT_ID)
    .single();
  if (fetchErr || !agentRow) {
    console.error("fetch agent:", fetchErr);
    process.exit(1);
  }

  const prevConfig = (agentRow.config || {}) as Record<string, unknown>;
  const nextConfig = {
    ...prevConfig,
    followup_enabled: true,
    followup_intervals: Array.isArray(prevConfig.followup_intervals)
      ? prevConfig.followup_intervals
      : [30, 120, 1440],
    followup_quiet_start: prevConfig.followup_quiet_start || "22:00",
    followup_quiet_end: prevConfig.followup_quiet_end || "08:00",
  };

  const { data, error } = await sb
    .from("agents")
    .update({
      system_prompt: SYSTEM_PROMPT,
      communication_rules: COMMUNICATION_RULES,
      dispatcher_prompt: DISPATCHER_PROMPT,
      followup_prompt: FOLLOWUP_PROMPT,
      override_prompts: true,
      always_inject_comm_rules: true,
      skip_greeting: true,
      config: nextConfig,
      updated_at: new Date().toISOString(),
    })
    .eq("id", AGENT_ID)
    .select("id, name, override_prompts, config")
    .single();
  if (error) {
    console.error(error);
    process.exit(1);
  }

  const cfg = (data?.config || {}) as Record<string, unknown>;
  console.log(
    JSON.stringify(
      {
        ok: true,
        version: "v1.3.10",
        calendarToolId: CALENDAR_TOOL_ID,
        galleryToolId: galleryTool.id,
        handoffToolId,
        notifyToolId,
        handoffAssigneeId: HANDOFF_ASSIGNEE_ID,
        notifyConversationId: NOTIFY_CONVERSATION_ID,
        followup_enabled: cfg.followup_enabled,
        followup_intervals: cfg.followup_intervals,
        actions: [
          "check_lodging",
          "sugerir_datas",
          "excluir",
          "suite_gallery_query",
          "encaminhar_atendente",
          "enviar_notificacao(auto)",
        ],
        agent: { id: data?.id, name: data?.name, override_prompts: data?.override_prompts },
      },
      null,
      2,
    ),
  );
}

main();
