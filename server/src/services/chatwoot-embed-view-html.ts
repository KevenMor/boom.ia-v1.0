/** Página HTML standalone servida pelo backend — funciona via /api/ sem depender do build React. */
export function renderChatwootEmbedViewHtml(): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Boom IA — Espelho do Agente</title>
  <style>
    :root { color-scheme: light dark; --bg:#f8f9fa; --card:#fff; --text:#111827; --muted:#6b7280; --border:#e5e7eb; --brand:#2563eb; }
    @media (prefers-color-scheme: dark) {
      :root { --bg:#111827; --card:#1f2937; --text:#f3f4f6; --muted:#9ca3af; --border:#374151; }
    }
    * { box-sizing: border-box; }
    body { margin:0; font:14px/1.5 system-ui,-apple-system,sans-serif; background:var(--bg); color:var(--text); }
    .wrap { max-width:960px; margin:0 auto; padding:16px; }
    h1 { font-size:18px; margin:0 0 4px; }
    .sub { color:var(--muted); font-size:12px; margin-bottom:16px; }
    .err { background:#fef2f2; color:#991b1b; border:1px solid #fecaca; padding:12px; border-radius:8px; }
    .card { background:var(--card); border:1px solid var(--border); border-radius:12px; padding:16px; margin-bottom:12px; }
    .head { display:flex; gap:12px; align-items:flex-start; margin-bottom:12px; }
    .avatar { width:48px; height:48px; border-radius:999px; background:color-mix(in srgb, var(--brand) 15%, transparent); display:flex; align-items:center; justify-content:center; font-weight:700; color:var(--brand); flex-shrink:0; overflow:hidden; }
    .avatar img { width:100%; height:100%; object-fit:cover; }
    .badge { display:inline-block; font-size:11px; padding:2px 8px; border-radius:999px; background:color-mix(in srgb, var(--brand) 12%, transparent); color:var(--brand); text-transform:capitalize; }
    section { margin-top:12px; border-top:1px solid var(--border); padding-top:12px; }
    section h3 { margin:0 0 8px; font-size:13px; }
    dl { margin:0; }
    .row { display:grid; grid-template-columns:140px 1fr; gap:8px; padding:6px 0; border-bottom:1px solid var(--border); }
    .row:last-child { border-bottom:0; }
    dt { font-size:11px; text-transform:uppercase; letter-spacing:.04em; color:var(--muted); }
    dd { margin:0; white-space:pre-wrap; word-break:break-word; }
    pre { margin:0; white-space:pre-wrap; font:inherit; }
    .tool { border:1px solid var(--border); border-radius:8px; padding:8px 10px; margin-top:6px; }
    .loading { color:var(--muted); padding:24px; text-align:center; }
    select { margin-bottom:12px; width:100%; padding:8px; border-radius:8px; border:1px solid var(--border); background:var(--card); color:var(--text); }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>Boom IA — Espelho do Agente</h1>
    <p class="sub" id="subtitle">Carregando…</p>
    <div id="root"><div class="loading">Carregando configurações…</div></div>
  </div>
  <script>
    (function () {
      var params = new URLSearchParams(window.location.search);
      var key = params.get("key") || "";
      var accountId = params.get("account_id") || "";
      var root = document.getElementById("root");
      var subtitle = document.getElementById("subtitle");

      function esc(s) {
        return String(s == null ? "" : s)
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;");
      }

      function cfg(agent, k) {
        var c = agent.config || {};
        return c[k];
      }

      function row(label, value) {
        if (value == null || value === "") return "";
        return '<div class="row"><dt>' + esc(label) + '</dt><dd>' + esc(value) + '</dd></div>';
      }

      function section(title, inner) {
        if (!inner) return "";
        return '<section><h3>' + esc(title) + '</h3><dl>' + inner + '</dl></section>';
      }

      function renderAgent(agent) {
        var initials = (agent.name || "?").slice(0, 2).toUpperCase();
        var avatar = agent.avatar_url
          ? '<img src="' + esc(agent.avatar_url) + '" alt="" />'
          : esc(initials);
        var basic = [
          row("Empresa", agent.tenant_name),
          row("Slug", agent.tenant_slug),
          row("ID", agent.id),
          row("Webhook", agent.webhook_url),
        ].join("");
        var model = [
          row("Provider", agent.provider_name),
          row("Modelo", agent.model),
          row("Temperatura", agent.temperature),
          row("Top P", cfg(agent, "top_p")),
          row("Top K", cfg(agent, "top_k")),
          row("Prompt override", agent.system_prompt || "— (registry)"),
          agent.prompt && agent.prompt.uses_registry ? row("Prompt registry", (agent.prompt.slug || "") + " v" + (agent.prompt.version || "?")) : "",
          agent.prompt && agent.prompt.composed_prompt_preview ? row("Prompt composto", agent.prompt.composed_prompt_preview) : "",
        ].join("");
        var integration = [
          row("Chatwoot URL", cfg(agent, "chatwoot_url")),
          row("Chatwoot account", cfg(agent, "chatwoot_account_id")),
          row("Chatwoot token", cfg(agent, "chatwoot_api_token")),
          row("WAHA URL", cfg(agent, "waha_url")),
          row("WAHA session", cfg(agent, "waha_session")),
          row("WAHA key", cfg(agent, "waha_api_key")),
        ].join("");
        var schedule = [
          row("Horário comercial", cfg(agent, "business_hours_enabled") ? "Sim" : "Não"),
          row("Follow-up", cfg(agent, "followup_enabled") ? "Sim" : "Não"),
          row("Follow-up tentativas", cfg(agent, "followup_max_attempts")),
        ].join("");
        var tools = (agent.tools || []).map(function (t) {
          return '<div class="tool"><strong>' + esc(t.name) + '</strong> <span class="badge">' + esc(t.tool_type) + '</span>' +
            (t.description ? '<div style="color:var(--muted);font-size:12px;margin-top:4px">' + esc(t.description) + '</div>' : '') +
            '</div>';
        }).join("");
        return '<div class="card">' +
          '<div class="head"><div class="avatar">' + avatar + '</div><div>' +
          '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">' +
          '<strong style="font-size:17px">' + esc(agent.name) + '</strong>' +
          '<span class="badge">' + esc(agent.status) + '</span></div>' +
          (agent.description ? '<div style="color:var(--muted);margin-top:4px">' + esc(agent.description) + '</div>' : '') +
          '</div></div>' +
          section("Informações básicas", basic) +
          section("Modelo de IA", model) +
          section("Integração", integration) +
          section("Horário e follow-up", schedule) +
          (tools ? section("Tools (" + (agent.tools || []).length + ")", tools) : "") +
          '</div>';
      }

      function render(agents) {
        if (!agents.length) {
          root.innerHTML = '<div class="err">Nenhum agente Boom IA vinculado a esta conta Chatwoot.</div>';
          return;
        }
        if (agents.length === 1) {
          root.innerHTML = renderAgent(agents[0]);
          return;
        }
        var select = '<select id="agentPick">' + agents.map(function (a, i) {
          return '<option value="' + i + '">' + esc(a.name) + '</option>';
        }).join("") + '</select><div id="agentPanel"></div>';
        root.innerHTML = select;
        var panel = document.getElementById("agentPanel");
        var pick = document.getElementById("agentPick");
        function show() { panel.innerHTML = renderAgent(agents[Number(pick.value)]); }
        pick.addEventListener("change", show);
        show();
      }

      if (!key || !accountId) {
        subtitle.textContent = "Parâmetros ausentes";
        root.innerHTML = '<div class="err">Informe key e account_id na URL do iframe.</div>';
        return;
      }

      subtitle.textContent = "Conta Chatwoot " + accountId + " · somente leitura";

      fetch("/api/embed/chatwoot/agents?account_id=" + encodeURIComponent(accountId) + "&key=" + encodeURIComponent(key))
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (_ref) {
          var ok = _ref.ok, j = _ref.j;
          if (!ok) throw new Error(j.error || "Falha ao carregar espelho");
          render(j.agents || []);
        })
        .catch(function (e) {
          root.innerHTML = '<div class="err">' + esc(e.message || "Erro desconhecido") + '</div>';
        });
    })();
  </script>
</body>
</html>`;
}
