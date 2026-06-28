/** Página HTML standalone — busca, renderiza e salva o agente sem depender do React. */
export function renderChatwootEmbedViewHtml(
  _frontendBase: string,
  embedKey: string,
  accountId: string,
  theme: "dark" | "light" = "dark",
): string {
  const safeKey = JSON.stringify(embedKey);
  const safeAccountId = JSON.stringify(accountId);
  const safeTheme = JSON.stringify(theme);

  return `<!DOCTYPE html>
<html lang="pt-BR" data-theme="${theme}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Boom IA — Agente</title>
  <style>
    /* ── tokens dark ─────────────────────────────────────────── */
    :root,[data-theme="dark"]{
      --bg:#0f172a;--card:#1e293b;--card2:#263245;--border:#334155;
      --text:#f1f5f9;--muted:#94a3b8;--brand:#3b82f6;
      --success:#22c55e;--warn:#f59e0b;--err:#ef4444;
      --header-bg:#1e293b;--header-border:#334155;
      --input-bg:#263245;--input-border:#334155;
      --status-active-bg:#166534;--status-active-text:#bbf7d0;
      --status-test-bg:#854d0e;--status-test-text:#fef08a;
      --status-inactive-bg:#374151;--status-inactive-text:#9ca3af;
      --sel-bg:#1e3a5f;--radio-border:#4b5563;
      --tool-item-border:#334155;--warn-box-bg:#422006;--warn-box-border:#92400e;--warn-box-text:#fde68a;
      --toggle-off:#374151;--alert-warn-bg:#422006;--alert-warn-border:#92400e;--alert-warn-text:#fde68a;
      --alert-err-bg:#450a0a;--alert-err-border:#991b1b;--alert-err-text:#fca5a5;
      --shadow:0 4px 24px rgba(0,0,0,.4);
    }
    /* ── tokens light ────────────────────────────────────────── */
    [data-theme="light"]{
      --bg:#f1f5f9;--card:#ffffff;--card2:#f8fafc;--border:#e2e8f0;
      --text:#0f172a;--muted:#64748b;--brand:#2563eb;
      --success:#16a34a;--warn:#d97706;--err:#dc2626;
      --header-bg:#ffffff;--header-border:#e2e8f0;
      --input-bg:#f8fafc;--input-border:#cbd5e1;
      --status-active-bg:#dcfce7;--status-active-text:#166534;
      --status-test-bg:#fef9c3;--status-test-text:#854d0e;
      --status-inactive-bg:#f1f5f9;--status-inactive-text:#64748b;
      --sel-bg:#eff6ff;--radio-border:#94a3b8;
      --tool-item-border:#e2e8f0;--warn-box-bg:#fffbeb;--warn-box-border:#fcd34d;--warn-box-text:#92400e;
      --toggle-off:#94a3b8;--alert-warn-bg:#fffbeb;--alert-warn-border:#fcd34d;--alert-warn-text:#92400e;
      --alert-err-bg:#fef2f2;--alert-err-border:#fca5a5;--alert-err-text:#991b1b;
      --shadow:0 4px 24px rgba(0,0,0,.08);
    }
    /* ── base ────────────────────────────────────────────────── */
    *{box-sizing:border-box;margin:0;padding:0;}
    html,body{height:100%;transition:background .18s,color .18s;}
    body{font:14px/1.5 system-ui,sans-serif;background:var(--bg);color:var(--text);}
    header{position:sticky;top:0;z-index:50;background:var(--header-bg);border-bottom:1px solid var(--header-border);
      padding:10px 16px;display:flex;align-items:center;justify-content:space-between;gap:10px;
      box-shadow:var(--shadow);}
    .logo{display:flex;align-items:center;gap:8px;font-weight:600;font-size:15px;}
    .badge{padding:2px 8px;border-radius:99px;font-size:11px;font-weight:600;text-transform:capitalize;}
    .active{background:var(--status-active-bg);color:var(--status-active-text);}
    .test{background:var(--status-test-bg);color:var(--status-test-text);}
    .inactive{background:var(--status-inactive-bg);color:var(--status-inactive-text);}
    .wrap{max-width:960px;margin:0 auto;padding:16px;}
    .alert{display:flex;gap:8px;border-radius:8px;padding:12px 14px;font-size:13px;margin-bottom:16px;}
    .alert-warn{background:var(--alert-warn-bg);border:1px solid var(--alert-warn-border);color:var(--alert-warn-text);}
    .alert-err{background:var(--alert-err-bg);border:1px solid var(--alert-err-border);color:var(--alert-err-text);}
    .tabs{display:flex;gap:4px;border-bottom:1px solid var(--border);margin-bottom:16px;overflow-x:auto;}
    .tab{padding:8px 14px;border:0;background:none;color:var(--muted);cursor:pointer;font:inherit;font-size:13px;
      border-bottom:2px solid transparent;white-space:nowrap;transition:color .15s;}
    .tab.active{color:var(--brand);border-bottom-color:var(--brand);}
    .tab-panel{display:none;}.tab-panel.active{display:block;}
    .card{background:var(--card);border:1px solid var(--border);border-radius:10px;padding:20px;margin-bottom:14px;
      transition:background .18s,border-color .18s;}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;}
    @media(max-width:600px){.grid{grid-template-columns:1fr;}}
    label{display:block;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);margin-bottom:6px;}
    input,select,textarea{width:100%;padding:8px 10px;border-radius:6px;border:1px solid var(--input-border);
      background:var(--input-bg);color:var(--text);font:inherit;font-size:13px;outline:none;transition:background .18s,border-color .15s,color .18s;}
    input:focus,select:focus,textarea:focus{border-color:var(--brand);}
    textarea{resize:vertical;min-height:100px;}
    .slider-row{display:flex;align-items:center;gap:10px;}
    input[type=range]{flex:1;accent-color:var(--brand);}
    .status-group{display:flex;flex-direction:column;border:1px solid var(--border);border-radius:8px;overflow:hidden;}
    .status-opt{display:flex;gap:10px;align-items:flex-start;padding:10px 12px;cursor:pointer;
      border-bottom:1px solid var(--border);transition:background .15s;}
    .status-opt:last-child{border-bottom:0;}
    .status-opt:hover{background:var(--card2);}
    .status-opt.sel{background:var(--sel-bg);}
    .status-opt input{width:auto;flex-shrink:0;margin-top:3px;accent-color:var(--brand);}
    .status-opt .title{font-size:13px;font-weight:600;}
    .status-opt .desc{font-size:11px;color:var(--muted);}
    .tool-item{border:1px solid var(--tool-item-border);border-radius:6px;padding:8px 10px;margin-top:8px;}
    .tool-name{font-size:13px;font-weight:600;}
    .tool-type{display:inline-block;padding:1px 6px;border-radius:4px;border:1px solid var(--border);font-size:10px;margin-left:6px;color:var(--muted);}
    .tool-desc{font-size:11px;color:var(--muted);margin-top:4px;}
    .field-note{font-size:11px;color:var(--muted);margin-top:6px;}
    .save-bar{display:flex;align-items:center;gap:10px;}
    .btn{padding:8px 18px;border-radius:6px;border:0;font:inherit;font-size:13px;font-weight:600;cursor:pointer;transition:opacity .15s;}
    .btn-primary{background:var(--brand);color:#fff;}.btn-primary:hover{opacity:.9;}
    .btn-primary:disabled{opacity:.5;cursor:not-allowed;}
    .save-msg{font-size:12px;color:var(--success);}
    .save-err-msg{font-size:12px;color:var(--err);}
    .spinner{display:inline-block;width:14px;height:14px;border:2px solid rgba(128,128,128,.3);
      border-top-color:var(--brand);border-radius:50%;animation:spin .7s linear infinite;vertical-align:middle;}
    @keyframes spin{to{transform:rotate(360deg)}}
    .section-title{font-size:13px;font-weight:700;margin-bottom:14px;}
    .avatar{width:56px;height:56px;border-radius:50%;object-fit:cover;background:var(--card2);border:1px solid var(--border);}
    .agent-header{display:flex;gap:14px;align-items:center;margin-bottom:20px;}
    .prompt-pre{width:100%;padding:10px;border-radius:6px;border:1px solid var(--border);background:var(--input-bg);
      color:var(--text);font:13px/1.5 monospace;resize:vertical;min-height:140px;}
    .toggle-wrap{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 0;}
    .toggle{position:relative;display:inline-block;width:40px;height:22px;flex-shrink:0;}
    .toggle input{opacity:0;width:0;height:0;}
    .toggle-slider{position:absolute;inset:0;background:var(--toggle-off);border-radius:11px;cursor:pointer;transition:.2s;}
    .toggle-slider:before{content:"";position:absolute;width:16px;height:16px;left:3px;bottom:3px;background:#fff;border-radius:50%;transition:.2s;}
    input:checked+.toggle-slider{background:var(--brand);}
    input:checked+.toggle-slider:before{transform:translateX(18px);}
    .warn-box{background:var(--warn-box-bg);border:1px solid var(--warn-box-border);border-radius:6px;
      padding:10px 12px;font-size:12px;color:var(--warn-box-text);margin-bottom:10px;}
    #loading-wrap{text-align:center;padding:48px;color:var(--muted);}
  </style>
</head>
<body>
<header>
  <div class="logo">
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M20 21a8 8 0 1 0-16 0"/><path d="M12 12v9"/></svg>
    Boom IA — Agente
  </div>
  <div class="save-bar">
    <span id="acct-label" style="font-size:11px;color:var(--muted)">Conta ${JSON.stringify(accountId)}</span>
    <button class="btn btn-primary" id="save-btn" onclick="saveAgent()" disabled>Salvar</button>
    <span id="save-msg" class="save-msg"></span>
    <span id="save-err" class="save-err-msg"></span>
  </div>
</header>

<div class="wrap">
  <div id="alert-area"></div>
  <div id="loading-wrap">
    <div class="spinner" style="width:24px;height:24px;margin:0 auto 12px;border-width:3px;border-top-color:var(--brand);"></div>
    Carregando agente…
  </div>

  <div id="editor" style="display:none">
    <div class="agent-header">
      <img id="agent-avatar" class="avatar" src="" alt="" onerror="this.style.display='none'"/>
      <div>
        <div style="font-size:18px;font-weight:700" id="agent-name-display"></div>
        <div style="font-size:12px;color:var(--muted);margin-top:2px" id="agent-meta"></div>
      </div>
    </div>

    <div class="tabs">
      <button class="tab active" onclick="switchTab('basic',this)">Básico</button>
      <button class="tab" onclick="switchTab('model',this)">Modelo IA</button>
      <button class="tab" onclick="switchTab('integ',this)">Integração</button>
      <button class="tab" onclick="switchTab('sched',this)">Horário</button>
    </div>

    <!-- BÁSICO -->
    <div id="panel-basic" class="tab-panel active">
      <div class="card">
        <div class="section-title">Informações Básicas</div>
        <div class="grid">
          <div><label>Nome</label><input id="f-name" oninput="markDirty()"/></div>
          <div><label>Descrição</label><input id="f-desc" oninput="markDirty()"/></div>
        </div>
        <div style="margin-top:14px">
          <label>Situação</label>
          <div class="status-group">
            <label class="status-opt" id="so-active" onclick="setStatus('active')">
              <input type="radio" name="status" value="active"/>
              <div><div class="title">Ativo</div><div class="desc">Produção — responde normalmente.</div></div>
            </label>
            <label class="status-opt" id="so-test" onclick="setStatus('test')">
              <input type="radio" name="status" value="test"/>
              <div><div class="title">Teste</div><div class="desc">Responde só para o assignee de teste.</div></div>
            </label>
            <label class="status-opt" id="so-inactive" onclick="setStatus('inactive')">
              <input type="radio" name="status" value="inactive"/>
              <div><div class="title">Inativo</div><div class="desc">Não processa mensagens.</div></div>
            </label>
          </div>
        </div>
      </div>
    </div>

    <!-- MODELO IA -->
    <div id="panel-model" class="tab-panel">
      <div class="card">
        <div class="section-title">Modelo de IA</div>
        <div class="grid">
          <div><label>Provider</label><select id="f-provider" onchange="markDirty()"></select></div>
          <div><label>Modelo</label><input id="f-model" oninput="markDirty()" placeholder="ex: gemini-2.5-flash-lite"/></div>
        </div>
        <div style="margin-top:14px">
          <label>Temperatura · <span id="lbl-temp">0.7</span></label>
          <div class="slider-row"><input type="range" id="f-temp" min="0" max="2" step="0.05" oninput="document.getElementById('lbl-temp').textContent=parseFloat(this.value).toFixed(2);markDirty()"/></div>
        </div>
        <div class="grid" style="margin-top:14px">
          <div>
            <label>Top P · <span id="lbl-topp">0.8</span></label>
            <input type="range" id="f-topp" min="0" max="1" step="0.05" oninput="document.getElementById('lbl-topp').textContent=parseFloat(this.value).toFixed(2);markDirty()"/>
          </div>
          <div>
            <label>Top K · <span id="lbl-topk">40</span></label>
            <input type="range" id="f-topk" min="1" max="100" step="1" oninput="document.getElementById('lbl-topk').textContent=this.value;markDirty()"/>
          </div>
        </div>
        <div id="prompt-registry-note" style="display:none" class="warn-box"></div>
        <div style="margin-top:14px">
          <label>Prompt em produção (preview)</label>
          <textarea id="f-prompt-preview" class="prompt-pre" readonly style="opacity:.7"></textarea>
        </div>
        <div style="margin-top:14px">
          <label>System Prompt do agente (override)</label>
          <textarea id="f-system-prompt" oninput="markDirty()" style="min-height:120px"></textarea>
          <div class="field-note">Complementa o prompt do registry. Pode ficar vazio.</div>
        </div>
      </div>
    </div>

    <!-- INTEGRAÇÃO -->
    <div id="panel-integ" class="tab-panel">
      <div class="card">
        <div class="section-title">Chatwoot</div>
        <div class="grid">
          <div style="grid-column:span 2"><label>URL do Chatwoot</label><input id="f-cw-url" oninput="markDirty()" placeholder="https://mega.atendai.app"/></div>
          <div><label>Account ID</label><input id="f-cw-acct" oninput="markDirty()"/></div>
          <div><label>API Token</label><input id="f-cw-token" type="password" oninput="markDirty()" placeholder="••••"/></div>
        </div>
      </div>
      <div class="card" style="margin-top:0">
        <div class="section-title">Tools vinculadas</div>
        <div id="tools-list"><div style="color:var(--muted);font-size:13px">Sem tools vinculadas.</div></div>
      </div>
    </div>

    <!-- HORÁRIO -->
    <div id="panel-sched" class="tab-panel">
      <div class="card">
        <div class="toggle-wrap">
          <div><div style="font-weight:600;font-size:13px">Horário Comercial</div><div class="field-note">Limita respostas ao horário configurado.</div></div>
          <label class="toggle"><input type="checkbox" id="f-biz-enabled" onchange="markDirty()"/><span class="toggle-slider"></span></label>
        </div>
        <div style="margin-top:10px"><label>Mensagem offline</label><input id="f-offline-msg" oninput="markDirty()" placeholder="Fora do horário de atendimento."/></div>
      </div>
      <div class="card" style="margin-top:0">
        <div class="toggle-wrap">
          <div><div style="font-weight:600;font-size:13px">Follow-up</div><div class="field-note">Retoma contato quando o cliente para de responder.</div></div>
          <label class="toggle"><input type="checkbox" id="f-fu-enabled" onchange="markDirty()"/><span class="toggle-slider"></span></label>
        </div>
        <div style="margin-top:10px"><label>Intervalos de follow-up (minutos, separados por vírgula)</label><input id="f-fu-intervals" oninput="markDirty()" placeholder="10,20,30"/></div>
        <div class="grid" style="margin-top:10px">
          <div><label>Silêncio — início</label><input type="time" id="f-fu-quiet-start" oninput="markDirty()"/></div>
          <div><label>Silêncio — fim</label><input type="time" id="f-fu-quiet-end" oninput="markDirty()"/></div>
        </div>
      </div>
    </div>
  </div>
</div>

<script>
var STATE = { agent: null, providers: [], dirty: false, currentStatus: "inactive" };
var KEY = ${safeKey};
var ACCOUNT_ID = ${safeAccountId};
var API_BASE = "/api";

/* ── tema ─────────────────────────────────────────────────── */
function applyTheme(t) {
  document.documentElement.setAttribute("data-theme", t === "light" ? "light" : "dark");
}
applyTheme(${safeTheme});

window.addEventListener("message", function(e) {
  if (!e.data || typeof e.data !== "object") return;
  if (e.data.type === "boom-ia-embed:theme" && e.data.theme) {
    applyTheme(e.data.theme);
  }
});

/* ── utilidades ───────────────────────────────────────────── */
function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
function switchTab(name, btn) {
  document.querySelectorAll(".tab-panel").forEach(function(p){ p.classList.remove("active"); });
  document.querySelectorAll(".tab").forEach(function(t){ t.classList.remove("active"); });
  var p = document.getElementById("panel-"+name); if(p) p.classList.add("active");
  if(btn) btn.classList.add("active");
}
function markDirty() {
  STATE.dirty = true;
  document.getElementById("save-btn").disabled = false;
  document.getElementById("save-msg").textContent = "";
}
function setStatus(v) {
  ["active","test","inactive"].forEach(function(s) {
    var el = document.getElementById("so-"+s);
    if(el) { el.classList.toggle("sel", s===v); var inp=el.querySelector("input"); if(inp) inp.checked=(s===v); }
  });
  STATE.currentStatus = v; markDirty();
}
function showAlert(msg, type) {
  document.getElementById("alert-area").innerHTML =
    '<div class="alert alert-'+(type||"warn")+'">'+esc(msg)+"</div>";
}
function cfg(key, fallback) {
  var c = STATE.agent ? (STATE.agent.config || {}) : {};
  return c[key] != null ? c[key] : (fallback !== undefined ? fallback : "");
}

/* ── preenchimento do formulário ─────────────────────────── */
function fillForm(agent) {
  STATE.agent = agent;
  document.getElementById("agent-name-display").textContent = agent.name;
  document.getElementById("agent-meta").textContent =
    (agent.tenant_name||"") + " · " + (agent.provider_name||"") + " · " + (agent.model||"");
  var av = document.getElementById("agent-avatar");
  if(agent.avatar_url){ av.src=agent.avatar_url; av.style.display="block"; } else av.style.display="none";
  var badge='<span class="badge '+(agent.status||"inactive")+'">'+(agent.status==="active"?"Ativo":agent.status==="test"?"Teste":"Inativo")+"</span>";
  document.getElementById("acct-label").innerHTML = badge+" &nbsp; Conta "+esc(ACCOUNT_ID);
  document.getElementById("f-name").value = agent.name||"";
  document.getElementById("f-desc").value = agent.description||"";
  setStatus(agent.status||"inactive"); STATE.currentStatus=agent.status||"inactive";
  var provSel=document.getElementById("f-provider"); provSel.innerHTML="";
  STATE.providers.forEach(function(p){ var o=document.createElement("option"); o.value=p.id; o.textContent=p.name; if(p.id===agent.provider_id) o.selected=true; provSel.appendChild(o); });
  document.getElementById("f-model").value=agent.model||"";
  var temp=agent.temperature!=null?agent.temperature:0.7;
  document.getElementById("f-temp").value=temp; document.getElementById("lbl-temp").textContent=parseFloat(temp).toFixed(2);
  var topp=cfg("top_p",0.8); document.getElementById("f-topp").value=topp; document.getElementById("lbl-topp").textContent=parseFloat(topp).toFixed(2);
  var topk=cfg("top_k",40); document.getElementById("f-topk").value=topk; document.getElementById("lbl-topk").textContent=topk;
  document.getElementById("f-system-prompt").value=agent.system_prompt||"";
  if(agent.prompt&&agent.prompt.uses_registry){
    var n=document.getElementById("prompt-registry-note"); n.style.display="block";
    n.textContent="Prompt no registry: "+(agent.prompt.slug||"")+" v"+(agent.prompt.version||"?");
    document.getElementById("f-prompt-preview").value=agent.prompt.composed_prompt_preview||"";
  }
  document.getElementById("f-cw-url").value=String(cfg("chatwoot_url",""));
  document.getElementById("f-cw-acct").value=String(cfg("chatwoot_account_id",""));
  document.getElementById("f-cw-token").value=String(cfg("chatwoot_api_token",""));
  document.getElementById("f-biz-enabled").checked=Boolean(cfg("business_hours_enabled"));
  document.getElementById("f-offline-msg").value=String(cfg("business_hours_offline_message",cfg("offline_message","")));
  document.getElementById("f-fu-enabled").checked=Boolean(cfg("followup_enabled"));
  var iv=cfg("followup_intervals",[10,20,30]);
  document.getElementById("f-fu-intervals").value=Array.isArray(iv)?iv.join(","):String(iv);
  document.getElementById("f-fu-quiet-start").value=String(cfg("followup_quiet_start","22:00"));
  document.getElementById("f-fu-quiet-end").value=String(cfg("followup_quiet_end","08:00"));
  var tl=document.getElementById("tools-list");
  if(agent.tools&&agent.tools.length){ tl.innerHTML=agent.tools.map(function(t){ return'<div class="tool-item"><span class="tool-name">'+esc(t.name)+'</span><span class="tool-type">'+esc(t.tool_type)+"</span>"+(t.description?'<div class="tool-desc">'+esc(t.description)+"</div>":"")+"</div>"; }).join(""); }
}

/* ── salvar ──────────────────────────────────────────────── */
function buildPayload() {
  var iv=document.getElementById("f-fu-intervals").value.split(",").map(function(x){ return parseInt(x.trim(),10); }).filter(function(n){ return !isNaN(n); });
  return {
    name: document.getElementById("f-name").value.trim(),
    description: document.getElementById("f-desc").value.trim()||null,
    status: STATE.currentStatus||"inactive",
    provider_id: document.getElementById("f-provider").value||null,
    model: document.getElementById("f-model").value.trim()||null,
    system_prompt: document.getElementById("f-system-prompt").value.trim()||null,
    temperature: parseFloat(document.getElementById("f-temp").value),
    config: Object.assign({}, STATE.agent?(STATE.agent.config||{}):{}, {
      top_p: parseFloat(document.getElementById("f-topp").value),
      top_k: parseInt(document.getElementById("f-topk").value,10),
      chatwoot_url: document.getElementById("f-cw-url").value||undefined,
      chatwoot_account_id: document.getElementById("f-cw-acct").value||undefined,
      chatwoot_api_token: document.getElementById("f-cw-token").value||undefined,
      business_hours_enabled: document.getElementById("f-biz-enabled").checked,
      business_hours_offline_message: document.getElementById("f-offline-msg").value||undefined,
      followup_enabled: document.getElementById("f-fu-enabled").checked,
      followup_intervals: iv, followup_max_attempts: iv.length,
      followup_quiet_start: document.getElementById("f-fu-quiet-start").value||undefined,
      followup_quiet_end: document.getElementById("f-fu-quiet-end").value||undefined,
    }),
  };
}
function saveAgent() {
  if(!STATE.agent) return;
  var btn=document.getElementById("save-btn"), msgEl=document.getElementById("save-msg"), errEl=document.getElementById("save-err");
  btn.disabled=true; btn.innerHTML='<span class="spinner"></span>';
  msgEl.textContent=""; errEl.textContent="";
  var url=API_BASE+"/embed/chatwoot/agents/"+encodeURIComponent(STATE.agent.id)+"?account_id="+encodeURIComponent(ACCOUNT_ID)+"&key="+encodeURIComponent(KEY);
  fetch(url,{ method:"PATCH", headers:{"Content-Type":"application/json","x-chatwoot-mirror-key":KEY}, body:JSON.stringify(buildPayload()) })
    .then(function(r){ return r.json().then(function(j){ return{ok:r.ok,j:j}; }); })
    .then(function(res){
      btn.innerHTML="Salvar";
      if(!res.ok){ btn.disabled=false; errEl.textContent=res.j.error||"Erro ao salvar"; return; }
      STATE.dirty=false; msgEl.textContent="Salvo ✓"; setTimeout(function(){ msgEl.textContent=""; },3000);
      if(res.j.agent) fillForm(res.j.agent);
    })
    .catch(function(e){ btn.innerHTML="Salvar"; btn.disabled=false; errEl.textContent=e.message||"Erro de rede"; });
}

/* ── carregar ────────────────────────────────────────────── */
function load() {
  if(!KEY||!ACCOUNT_ID){
    document.getElementById("loading-wrap").innerHTML='<div class="alert alert-err">key ou account_id ausente.</div>';
    return;
  }
  fetch(API_BASE+"/embed/chatwoot/agents?account_id="+encodeURIComponent(ACCOUNT_ID)+"&key="+encodeURIComponent(KEY),
    { headers:{"x-chatwoot-mirror-key":KEY} })
    .then(function(r){ return r.json().then(function(j){ return{ok:r.ok,j:j}; }); })
    .then(function(res){
      document.getElementById("loading-wrap").style.display="none";
      if(!res.ok){ showAlert(res.j.error||"Erro","err"); return; }
      var agents=res.j.agents||[]; STATE.providers=res.j.providers||[];
      if(!agents.length){ showAlert(res.j.message||"Nenhum agente vinculado.","warn"); return; }
      document.getElementById("editor").style.display="block";
      fillForm(agents[0]);
    })
    .catch(function(e){
      document.getElementById("loading-wrap").innerHTML='<div class="alert alert-err">'+esc(e.message)+"</div>";
    });
}
load();
</script>
</body>
</html>`;
}
