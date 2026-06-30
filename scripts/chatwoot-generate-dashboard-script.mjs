#!/usr/bin/env node
/**
 * Gera cópia personalizada do Dashboard Script — espelho do agente (sidebar Mega).
 *
 * Uso:
 *   node scripts/chatwoot-generate-dashboard-script.mjs \
 *     --boom-url=https://ia.agboom.com.br \
 *     --embed-key=SUA_CHAVE \
 *     --account-id=3 \
 *     --tenant-slug=auto-escola-ideal \
 *     --tenant-label="Auto Escola Ideal" \
 *     --agent-name=Beatriz \
 *     --link-text="Auto Escola Ideal — Agente IA" \
 *     --out=scripts/tenants/auto-escola-ideal-dashboard-agent-mirror.script.html
 *
 * Cole em: https://mega.atendai.app/super_admin/app_config?config=internal
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const templatePath = path.join(__dirname, "tenants/ppl-motors-dashboard-agent-mirror.script.html");

function arg(name, envName, fallback = "") {
  const flag = `--${name}`;
  const withEq = process.argv.find((a) => a.startsWith(flag + "="));
  if (withEq) return withEq.slice(flag.length + 1);
  const idx = process.argv.indexOf(flag);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return process.env[envName] || fallback;
}

const boomUrl = arg("boom-url", "BOOM_URL", "https://ia.agboom.com.br").replace(/\/+$/, "");
const embedKey = arg("embed-key", "CHATWOOT_MIRROR_EMBED_KEY", "");
const accountId = arg("account-id", "CHATWOOT_ACCOUNT_ID", "");
const tenantSlug = arg("tenant-slug", "TENANT_SLUG", "");
const tenantLabel = arg("tenant-label", "TENANT_LABEL", "");
const agentName = arg("agent-name", "AGENT_NAME", "");
const linkText = arg("link-text", "LINK_TEXT", "");
const out = arg("out", "OUT", "");

if (!embedKey) {
  console.error("Informe --embed-key (mesma CHATWOOT_MIRROR_EMBED_KEY do server/.env)");
  process.exit(1);
}
if (!tenantSlug) {
  console.error("Informe --tenant-slug (ex.: auto-escola-ideal, dr-iuri, sunset-thermas-park)");
  process.exit(1);
}

const label = tenantLabel || tenantSlug;
const link = linkText || `${label} — Agente IA`;
const scriptKeySuffix = tenantSlug.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "").toLowerCase();
const agentLine = agentName ? ` · Agente: ${agentName}` : "";

let content = fs.readFileSync(templatePath, "utf8");

content = content.replace(
  /<!--[\s\S]*?-->\s*\n<script data-name="[^"]+">/,
  `<!--
  ${label} — Dashboard Script (espelho agente)
  Conta Chatwoot: ${accountId || "CONFIGURE account-id"} (mega.atendai.app)${agentLine}
  Cole em: https://mega.atendai.app/super_admin/app_config?config=internal
  Após colar: salve, recarregue o Mega (Cmd+Shift+R) e confira no console F12:
  "[Boom IA] Dashboard Script v9 carregado"
-->

<script data-name="boom-ia-${scriptKeySuffix}-agent-mirror">`,
);

content = content.replace(
  /const SCRIPT_KEY = "boom_ia_ppl_motors_agent_mirror_" \+ SCRIPT_VERSION;/,
  `const SCRIPT_KEY = "boom_ia_${scriptKeySuffix}_agent_mirror_" + SCRIPT_VERSION;`,
);

content = content.replace(
  /\/\*\* ========== PPL MOTORS \(conta 9\) ========== \*\//,
  `/** ========== ${label.toUpperCase()} ========== */`,
);

content = content.replace(/LINK_TEXT:\s*"[^"]*"/, `LINK_TEXT: "${link.replace(/"/g, '\\"')}"`);
content = content.replace(/BOOM_URL:\s*"[^"]*"/, `BOOM_URL: "${boomUrl}"`);
content = content.replace(
  /EMBED_APP_URL:\s*"[^"]*"/,
  `EMBED_APP_URL: "${boomUrl}/embed/chatwoot"`,
);
content = content.replace(
  /EMBED_VIEW_URL:\s*"[^"]*"/,
  `EMBED_VIEW_URL: "${boomUrl}/api/embed/chatwoot/view"`,
);
content = content.replace(/EMBED_KEY:\s*"[^"]*"/, `EMBED_KEY: "${embedKey.replace(/"/g, '\\"')}"`);

if (accountId) {
  content = content.replace(/TARGET_ACCOUNT_ID:\s*\d+,?/, `TARGET_ACCOUNT_ID: ${Number(accountId)},`);
} else {
  content = content.replace(/TARGET_ACCOUNT_ID:\s*\d+,?/, "TARGET_ACCOUNT_ID: null,");
}

const target =
  out || path.join(process.cwd(), `scripts/tenants/${tenantSlug}-dashboard-agent-mirror.script.html`);
fs.mkdirSync(path.dirname(path.resolve(target)), { recursive: true });
fs.writeFileSync(target, content, "utf8");

console.log("[boom-ia] Script espelho agente gerado:", target);
console.log("");
console.log("Cole em: https://mega.atendai.app/super_admin/app_config?config=internal");
console.log("Conta Chatwoot:", accountId || "(null — edite TARGET_ACCOUNT_ID no CFG)");
console.log("No agente Boom IA: config.chatwoot_account_id =", accountId || "?");
