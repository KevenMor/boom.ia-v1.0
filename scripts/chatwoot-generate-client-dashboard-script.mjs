#!/usr/bin/env node
/**
 * Gera cópia personalizada do Dashboard Script Cliente CRM (injeção na conversa).
 *
 * Uso:
 *   node scripts/chatwoot-generate-client-dashboard-script.mjs \
 *     --boom-url=https://ia.agboom.com.br \
 *     --embed-key=SUA_CHAVE \
 *     --account-id=9 \
 *     --out=./scripts/tenants/meu-tenant-client-crm.script.html
 *
 * Cole o arquivo gerado em: Mega → Super Admin → Dashboard Scripts
 * Remova o script antigo "PPL Motors — Cliente" da sidebar esquerda, se existir.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const templatePath = path.join(__dirname, "chatwoot-dashboard-client-crm.script.html");

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
const out = arg("out", "OUT", "");

if (!embedKey) {
  console.error("Informe --embed-key (mesma CHATWOOT_MIRROR_EMBED_KEY do server/.env)");
  process.exit(1);
}

let content = fs.readFileSync(templatePath, "utf8");

content = content.replace(/BOOM_URL:\s*"[^"]*"/, `BOOM_URL: "${boomUrl}"`);
content = content.replace(
  /EMBED_CLIENT_URL:\s*"[^"]*"/,
  `EMBED_CLIENT_URL: "${boomUrl}/embed/chatwoot/client"`,
);
content = content.replace(/API_BASE:\s*"[^"]*"/, `API_BASE: "${boomUrl}/api"`);
content = content.replace(/EMBED_KEY:\s*"[^"]*"/, `EMBED_KEY: "${embedKey.replace(/"/g, '\\"')}"`);

if (accountId) {
  content = content.replace(/TARGET_ACCOUNT_ID:\s*null,?/, `TARGET_ACCOUNT_ID: ${Number(accountId)},`);
}

const target = out || path.join(process.cwd(), "chatwoot-client-crm.generated.html");
fs.writeFileSync(target, content, "utf8");

console.log("[boom-ia] Script Cliente CRM gerado:", target);
console.log("");
console.log("Cole em: https://mega.atendai.app/super_admin/app_config?config=internal");
console.log("Remova scripts antigos com item na sidebar esquerda (v9).");
