/** Wrapper HTML: injeta key/account_id no iframe interno (servidor → HTML, sem sessionStorage). */
export function renderChatwootEmbedViewHtml(
  frontendBase: string,
  embedKey: string,
  accountId: string,
): string {
  const base = frontendBase.replace(/\/+$/, "");
  const hash = new URLSearchParams({
    key: embedKey,
    account_id: accountId,
  }).toString();
  const innerSrc = `${base}/embed/chatwoot#${hash}`;
  const safeKey = JSON.stringify(embedKey);
  const safeAccountId = JSON.stringify(accountId);
  const safeInnerSrc = JSON.stringify(innerSrc);
  const safeOrigin = JSON.stringify(base);

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Boom IA — Agente</title>
  <style>
    html, body { margin:0; padding:0; height:100%; width:100%; overflow:hidden; background:#0f172a; }
    iframe { display:block; border:0; width:100%; height:100%; }
    .err { color:#fca5a5; font:14px system-ui,sans-serif; padding:24px; text-align:center; }
  </style>
</head>
<body>
  <iframe id="boom-embed-inner" title="Boom IA — Agente" allow="clipboard-write" src=${safeInnerSrc}></iframe>
  <script>
    (function () {
      var key = ${safeKey};
      var accountId = ${safeAccountId};
      var origin = ${safeOrigin};
      var frame = document.getElementById("boom-embed-inner");
      function sendInit() {
        if (!frame || !frame.contentWindow) return;
        try {
          frame.contentWindow.postMessage(
            { type: "boom-ia-embed:init", key: key, account_id: accountId },
            origin
          );
        } catch (e) { console.warn("[Boom IA] postMessage init", e); }
      }
      if (frame) {
        frame.addEventListener("load", sendInit);
        setTimeout(sendInit, 400);
        setTimeout(sendInit, 1200);
      }
    })();
  </script>
</body>
</html>`;
}
