/**
 * Aplica prompt Lara v1.1.2 no agente Divino Chalé e remove tools indevidas
 * (calendar_query / consultar_evento).
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

  const { data: linked, error: listErr } = await sb
    .from("agent_tools")
    .select("tool_id, tools(id, name, tool_type)")
    .eq("agent_id", AGENT_ID);
  if (listErr) {
    console.error("list agent_tools:", listErr);
    process.exit(1);
  }

  const toRemove = (linked || []).filter((row: { tools?: { tool_type?: string; name?: string } | null }) => {
    const t = row.tools;
    const type = (t?.tool_type || "").toLowerCase();
    const name = (t?.name || "").toLowerCase();
    return (
      type === "calendar_query" ||
      type.includes("calendar") ||
      name.includes("evento") ||
      name.includes("agenda")
    );
  });

  let removed = 0;
  for (const row of toRemove) {
    const { error } = await sb
      .from("agent_tools")
      .delete()
      .eq("agent_id", AGENT_ID)
      .eq("tool_id", row.tool_id);
    if (error) {
      console.error("delete agent_tool:", error);
      process.exit(1);
    }
    removed += 1;
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
    .select("id, name, override_prompts, skip_greeting, always_inject_comm_rules")
    .single();
  if (error) {
    console.error(error);
    process.exit(1);
  }

  const { data: remaining } = await sb
    .from("agent_tools")
    .select("tool_id, tools(name, tool_type)")
    .eq("agent_id", AGENT_ID);

  console.log(
    JSON.stringify(
      {
        ok: true,
        promptVersion: "v1.1.2",
        promptLen: SYSTEM_PROMPT.length,
        toolsRemoved: removed,
        remainingTools: remaining,
        agent: data,
      },
      null,
      2,
    ),
  );
}

main();
