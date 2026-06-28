#!/usr/bin/env node
/**
 * Gera uma cópia personalizada do Dashboard Script com BOOM_URL e EMBED_KEY preenchidos.
 *
 * Uso:
 *   node scripts/chatwoot-generate-dashboard-script.mjs \
 *     --boom-url=https://painel.boom.ia \
 *     --embed-key=SUA_CHAVE \
 *     --account-id=1 \
 *     --out=./meu-script-chatwoot.html
 *
 * Depois cole o conteúdo gerado em Super Admin → Dashboard Scripts (Mega/Chatwoot fork).
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const templatePath = path.join(__dirname, "chatwoot-dashboard-agent-mirror.script.html");

function arg(name, envName, fallback = "") {
  const flag = `--${name}`;
  const withEq = process.argv.find((a) => a.startsWith(flag + "="));
  if (withEq) return withEq.slice(flag.length + 1);
  const idx = process.argv.indexOf(flag);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return process.env[envName] || fallback;
}

const boomUrl = arg("boom-url", "BOOM_URL", "http://localhost:8080");
const embedKey = arg("embed-key", "CHATWOOT_MIRROR_EMBED_KEY", "");
const accountId = arg("account-id", "CHATWOOT_ACCOUNT_ID", "");
const out = arg("out", "OUT", "");

if (!embedKey) {
  console.error("Informe --embed-key (mesma CHATWOOT_MIRROR_EMBED_KEY do server/.env)");
  process.exit(1);
}

let content = fs.readFileSync(templatePath, "utf8");

content = content.replace(
  /BOOM_URL:\s*"[^"]*"/,
  `BOOM_URL: "${boomUrl.replace(/\/+$/, "")}"`,
);
content = content.replace(
  /EMBED_KEY:\s*"[^"]*"/,
  `EMBED_KEY: "${embedKey.replace(/"/g, '\\"')}"`,
);

if (accountId) {
  content = content.replace(/TARGET_ACCOUNT_ID:\s*null,?/, `TARGET_ACCOUNT_ID: ${Number(accountId)},`);
}

const target = out || path.join(process.cwd(), "chatwoot-dashboard-boom-ia.generated.html");
fs.writeFileSync(target, content, "utf8");

console.log("[boom-ia] Script gerado:", target);
console.log("");
console.log("Cole em: Super Admin → Dashboard Scripts");
console.log("URL iframe base:", `${boomUrl.replace(/\/+$/, "")}/embed/chatwoot?key=...&account_id=<da-url>`);
