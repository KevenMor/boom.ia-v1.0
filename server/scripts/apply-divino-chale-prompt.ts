import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import {
  SYSTEM_PROMPT,
  COMMUNICATION_RULES,
  DISPATCHER_PROMPT,
  FOLLOWUP_PROMPT,
} from "../src/services/prompts/divino-chale.ts";

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
  const agentId = "8b9433df-37f2-4ea3-9564-8b3d4f7640cc";
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
    .eq("id", agentId)
    .select("id, name, override_prompts, skip_greeting, always_inject_comm_rules")
    .single();
  if (error) {
    console.error(error);
    process.exit(1);
  }
  console.log(JSON.stringify({ ok: true, data, promptLen: SYSTEM_PROMPT.length }, null, 2));
}

main();
