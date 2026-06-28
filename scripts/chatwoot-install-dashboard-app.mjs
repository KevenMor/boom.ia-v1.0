#!/usr/bin/env node
/**
 * Instala (ou atualiza) o Dashboard App "Boom IA — Espelho do Agente" no Chatwoot.
 *
 * Uso:
 *   node scripts/chatwoot-install-dashboard-app.mjs \
 *     --chatwoot-url=https://chat.suaempresa.com \
 *     --account-id=1 \
 *     --token=SEU_TOKEN_ADMIN_CHATWOOT \
 *     --boom-url=https://painel.boom.ia \
 *     --embed-key=SUA_CHAVE_CHATWOOT_MIRROR_EMBED_KEY
 *
 * Variáveis de ambiente (alternativa aos flags):
 *   CHATWOOT_URL, CHATWOOT_ACCOUNT_ID, CHATWOOT_API_TOKEN, BOOM_URL, CHATWOOT_MIRROR_EMBED_KEY
 *
 * Pré-requisitos no servidor Boom IA (server/.env):
 *   CHATWOOT_MIRROR_EMBED_KEY=<mesma chave do --embed-key>
 *   PUBLIC_API_URL=https://api.boom.ia/api   (opcional — webhook no espelho)
 *   CHATWOOT_EMBED_FRAME_ANCESTORS=https://chat.suaempresa.com  (opcional — CSP iframe)
 *
 * No agente Boom IA, config.chatwoot_account_id deve ser igual ao --account-id.
 *
 * Alternativa (aba na conversa): node scripts/chatwoot-install-dashboard-app.mjs
 * Alternativa (menu lateral): scripts/chatwoot-dashboard-agent-mirror.script.html
 *   → gerar cópia: node scripts/chatwoot-generate-dashboard-script.mjs --boom-url=... --embed-key=...
 */

function arg(name, envName, fallback = "") {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return process.env[envName] || fallback;
}

const chatwootUrl = arg("chatwoot-url", "CHATWOOT_URL").replace(/\/+$/, "");
const accountId = arg("account-id", "CHATWOOT_ACCOUNT_ID");
const token = arg("token", "CHATWOOT_API_TOKEN");
const boomUrl = arg("boom-url", "BOOM_URL").replace(/\/+$/, "");
const embedKey = arg("embed-key", "CHATWOOT_MIRROR_EMBED_KEY");
const appTitle = arg("title", "CHATWOOT_MIRROR_APP_TITLE", "Boom IA — Agente");

if (!chatwootUrl || !accountId || !token || !boomUrl || !embedKey) {
  console.error("Parâmetros obrigatórios: --chatwoot-url --account-id --token --boom-url --embed-key");
  process.exit(1);
}

const iframeUrl = `${boomUrl}/embed/chatwoot#key=${encodeURIComponent(embedKey)}&account_id=${encodeURIComponent(accountId)}`;

const payload = {
  dashboard_app: {
    title: appTitle,
    content: [{ type: "frame", url: iframeUrl }],
  },
};

const apiUrl = `${chatwootUrl}/api/v1/accounts/${accountId}/dashboard_apps`;

async function listApps() {
  const res = await fetch(apiUrl, {
    headers: { api_access_token: token, "Content-Type": "application/json" },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`List dashboard_apps failed (${res.status}): ${text}`);
  }
  return res.json();
}

async function createApp() {
  const res = await fetch(apiUrl, {
    method: "POST",
    headers: { api_access_token: token, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Create dashboard_app failed (${res.status}): ${text}`);
  return JSON.parse(text);
}

async function updateApp(id) {
  const res = await fetch(`${apiUrl}/${id}`, {
    method: "PATCH",
    headers: { api_access_token: token, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Update dashboard_app failed (${res.status}): ${text}`);
  return JSON.parse(text);
}

async function main() {
  console.log("[chatwoot-mirror] URL do iframe:", iframeUrl);
  const existing = await listApps();
  const apps = Array.isArray(existing) ? existing : existing.payload || existing.data || [];
  const found = apps.find((a) => a.title === appTitle);

  const result = found ? await updateApp(found.id) : await createApp();
  console.log("[chatwoot-mirror] Dashboard App instalado:", result.title ?? appTitle, `(id=${result.id ?? "?"})`);
  console.log("");
  console.log("Próximos passos:");
  console.log("1. Confirme CHATWOOT_MIRROR_EMBED_KEY no server/.env");
  console.log("2. No agente Boom IA, chatwoot_account_id =", accountId);
  console.log("3. Abra uma conversa no Chatwoot → aba lateral", appTitle);
}

main().catch((err) => {
  console.error("[chatwoot-mirror]", err.message || err);
  process.exit(1);
});
