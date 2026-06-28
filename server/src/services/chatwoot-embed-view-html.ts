/** Bootstrap do embed: grava credenciais no sessionStorage e abre o React. */
export function renderChatwootEmbedViewHtml(frontendBase: string): string {
  const base = frontendBase.replace(/\/+$/, "");
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Boom IA — Agente</title>
  <style>
    body { margin:0; font:14px system-ui,sans-serif; display:flex; align-items:center; justify-content:center; min-height:100vh; background:#111827; color:#f3f4f6; }
    .err { color:#fca5a5; padding:16px; text-align:center; }
  </style>
</head>
<body>
  <p id="status">Abrindo painel do agente…</p>
  <script>
    (function () {
      var base = ${JSON.stringify(base)};
      var p = new URLSearchParams(location.search);
      var key = (p.get("key") || "").trim();
      var accountId = (p.get("account_id") || "").trim();
      if (!key) {
        document.getElementById("status").outerHTML =
          '<p class="err">Parâmetro <code>key</code> ausente na URL do bootstrap.</p>';
        return;
      }
      try {
        sessionStorage.setItem("boom_embed_creds", JSON.stringify({ key: key, accountId: accountId }));
      } catch (e) {
        console.warn("[Boom IA] sessionStorage indisponível", e);
      }
      location.replace(base + "/embed/chatwoot");
    })();
  </script>
</body>
</html>`;
}
