/** Redireciona para o app React (/embed/chatwoot) — mesma UI editável do painel Boom IA. */
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
  </style>
</head>
<body>
  <p>Abrindo painel do agente…</p>
  <script>
    location.replace(${JSON.stringify(base)} + "/embed/chatwoot" + location.search);
  </script>
</body>
</html>`;
}
