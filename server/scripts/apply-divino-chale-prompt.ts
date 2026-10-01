/**
 * Aplica prompt Lara + function_def (check_lodging + excluir) e religa a tool.
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

const AGENT_ID = "8b9433df-37f2-4ea3-9564-8b3d4f7640cc";
const TOOL_ID = "5e383e6d-8ddf-404e-a654-77a190227837";

const FUNCTION_DEF = {
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
      description: FUNCTION_DEF.description,
      function_def: FUNCTION_DEF,
    })
    .eq("id", TOOL_ID);
  if (toolErr) {
    console.error("update tool:", toolErr);
    process.exit(1);
  }

  const { data: existingLink } = await sb
    .from("agent_tools")
    .select("tool_id")
    .eq("agent_id", AGENT_ID)
    .eq("tool_id", TOOL_ID)
    .maybeSingle();

  let linked = !!existingLink;
  if (!existingLink) {
    const { error: linkErr } = await sb.from("agent_tools").insert({
      agent_id: AGENT_ID,
      tool_id: TOOL_ID,
    });
    if (linkErr) {
      console.error("link agent_tools:", linkErr);
      process.exit(1);
    }
    linked = true;
  }

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
      updated_at: new Date().toISOString(),
    })
    .eq("id", AGENT_ID)
    .select("id, name, override_prompts")
    .single();
  if (error) {
    console.error(error);
    process.exit(1);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        toolUpdated: true,
        toolLinked: linked,
        actions: ["check_lodging", "sugerir_datas", "excluir"],
        agent: data,
      },
      null,
      2,
    ),
  );
}

main();
