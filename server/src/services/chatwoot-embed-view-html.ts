/** Página HTML standalone com visual nativo Chatwoot — tema sincronizado via postMessage. */
export function renderChatwootEmbedViewHtml(
  _frontendBase: string,
  embedKey: string,
  accountId: string,
  theme: "dark" | "light" = "light",
): string {
  const safeKey = JSON.stringify(embedKey);
  const safeAccountId = JSON.stringify(accountId);
  const safeTheme = JSON.stringify(theme);

  return `<!DOCTYPE html>
<html lang="pt-BR" data-theme="${theme}">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Boom IA — Agente</title>
  <style>
    /* ── Chatwoot light (default) ───────────────────────────── */
    :root,[data-theme="light"]{
      --bg:#fafafa;--surface:#fff;--surface2:#f5f6f8;
      --border:#e8ecef;--border-soft:#f0f2f5;
      --text:#3c4858;--muted:#8c9bae;--muted2:#b0bac9;
      --brand:#1f93ff;--brand-hover:#1a7fdb;--brand-light:#e8f4ff;
      --success:#44ce4b;--warn:#ffc532;--err:#f44336;
      --input-bg:#fff;--input-border:#dbdfea;--input-focus:#1f93ff;
      --tab-active:#1f93ff;--tab-bar:#e8ecef;
      --badge-active-bg:#dcfce7;--badge-active-text:#15803d;
      --badge-test-bg:#fef9c3;--badge-test-text:#854d0e;
      --badge-inactive-bg:#f1f5f9;--badge-inactive-text:#64748b;
      --hover:#f0f4f7;--sel:#e8f4ff;
      --shadow:0 2px 8px rgba(0,0,0,.08);
      --toggle-off:#cdd4da;
    }
    /* ── Chatwoot dark ──────────────────────────────────────── */
    [data-theme="dark"]{
      --bg:#151718;--surface:#1c1f20;--surface2:#242729;
      --border:#2c2f30;--border-soft:#242729;
      --text:#d4d6da;--muted:#7a8087;--muted2:#4a4e54;
      --brand:#1f93ff;--brand-hover:#4aabff;--brand-light:#1a2f40;
      --success:#4ade80;--warn:#fbbf24;--err:#f87171;
      --input-bg:#1c1f20;--input-border:#2c2f30;--input-focus:#1f93ff;
      --tab-active:#1f93ff;--tab-bar:#2c2f30;
      --badge-active-bg:#14532d;--badge-active-text:#86efac;
      --badge-test-bg:#422006;--badge-test-text:#fde68a;
      --badge-inactive-bg:#1c1f20;--badge-inactive-text:#6b7280;
      --hover:#242729;--sel:#1a2f40;
      --shadow:0 2px 8px rgba(0,0,0,.4);
      --toggle-off:#3f4347;
    }
    *{box-sizing:border-box;margin:0;padding:0;}
    html,body{height:100%;min-height:100%;background:var(--bg);color:var(--text);
      font:13px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;
      transition:background .2s,color .2s;}
    /* ── header ─────────────────────────────────────────────── */
    .cw-header{position:sticky;top:0;z-index:50;background:var(--surface);
      border-bottom:1px solid var(--border);padding:0 16px;height:52px;
      display:flex;align-items:center;justify-content:space-between;gap:12px;
      box-shadow:var(--shadow);}
    .cw-header-left{display:flex;align-items:center;gap:10px;min-width:0;}
    .cw-header-logo{width:26px;height:26px;flex-shrink:0;border-radius:6px;
      background:var(--brand);display:flex;align-items:center;justify-content:center;}
    .cw-header-logo svg{display:block;}
    .cw-header-title{font-size:14px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
    .cw-header-right{display:flex;align-items:center;gap:8px;flex-shrink:0;}
    /* ── badges ─────────────────────────────────────────────── */
    .cw-badge{display:inline-flex;align-items:center;gap:4px;padding:2px 8px;
      border-radius:99px;font-size:11px;font-weight:600;}
    .cw-badge-dot{width:6px;height:6px;border-radius:50%;background:currentColor;flex-shrink:0;}
    .active{background:var(--badge-active-bg);color:var(--badge-active-text);}
    .test{background:var(--badge-test-bg);color:var(--badge-test-text);}
    .inactive{background:var(--badge-inactive-bg);color:var(--badge-inactive-text);}
    /* ── buttons ─────────────────────────────────────────────── */
    .cw-btn{display:inline-flex;align-items:center;gap:6px;padding:7px 16px;
      border-radius:6px;border:0;font:inherit;font-size:13px;font-weight:500;
      cursor:pointer;transition:background .15s,opacity .15s;}
    .cw-btn-primary{background:var(--brand);color:#fff;}
    .cw-btn-primary:hover{background:var(--brand-hover);}
    .cw-btn-primary:disabled{opacity:.5;cursor:not-allowed;}
    .cw-btn-ghost{background:transparent;color:var(--muted);border:1px solid var(--border);}
    .cw-btn-ghost:hover{background:var(--hover);}
    /* ── tabs ────────────────────────────────────────────────── */
    .cw-tabs{display:flex;border-bottom:1px solid var(--tab-bar);padding:0 16px;
      overflow-x:auto;gap:0;background:var(--surface);}
    .cw-tab{padding:12px 14px;border:0;border-bottom:2px solid transparent;
      background:none;color:var(--muted);font:inherit;font-size:13px;font-weight:500;
      cursor:pointer;white-space:nowrap;transition:color .15s;}
    .cw-tab.active{color:var(--brand);border-bottom-color:var(--brand);}
    .cw-tab:hover:not(.active){color:var(--text);}
    .cw-panel{display:none;}.cw-panel.active{display:block;}
    /* ── content ─────────────────────────────────────────────── */
    .cw-body{max-width:680px;margin:0 auto;padding:20px 16px 40px;}
    .cw-section{background:var(--surface);border:1px solid var(--border);
      border-radius:8px;margin-bottom:12px;overflow:hidden;}
    .cw-section-head{padding:14px 16px 0;border-bottom:1px solid var(--border-soft);
      padding-bottom:12px;margin-bottom:0;}
    .cw-section-title{font-size:13px;font-weight:600;color:var(--text);}
    .cw-section-desc{font-size:11px;color:var(--muted);margin-top:2px;}
    .cw-section-body{padding:14px 16px;}
    /* ── fields ─────────────────────────────────────────────── */
    .cw-field{margin-bottom:14px;}
    .cw-field:last-child{margin-bottom:0;}
    .cw-label{display:block;font-size:11px;font-weight:600;text-transform:uppercase;
      letter-spacing:.04em;color:var(--muted);margin-bottom:5px;}
    .cw-input,.cw-select,.cw-textarea{width:100%;padding:8px 10px;border-radius:6px;
      border:1px solid var(--input-border);background:var(--input-bg);color:var(--text);
      font:inherit;font-size:13px;outline:none;transition:border-color .15s,background .2s;}
    .cw-input:focus,.cw-select:focus,.cw-textarea:focus{border-color:var(--input-focus);}
    .cw-textarea{resize:vertical;min-height:96px;}
    .cw-hint{font-size:11px;color:var(--muted);margin-top:5px;}
    .cw-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;}
    @media(max-width:500px){.cw-grid{grid-template-columns:1fr;}}
    /* ── range sliders ──────────────────────────────────────── */
    .cw-slider-row{display:flex;align-items:center;gap:10px;}
    .cw-range{flex:1;accent-color:var(--brand);}
    .cw-range-val{min-width:36px;text-align:right;font-size:12px;color:var(--muted);}
    /* ── status radio group ──────────────────────────────────── */
    .cw-status-group{display:flex;flex-direction:column;border:1px solid var(--border);border-radius:8px;overflow:hidden;}
    .cw-status-opt{display:flex;gap:10px;align-items:center;padding:10px 12px;cursor:pointer;
      border-bottom:1px solid var(--border-soft);transition:background .12s;}
    .cw-status-opt:last-child{border-bottom:0;}
    .cw-status-opt:hover{background:var(--hover);}
    .cw-status-opt.sel{background:var(--sel);}
    .cw-status-opt input[type=radio]{accent-color:var(--brand);flex-shrink:0;}
    .cw-status-body .cw-status-title{font-size:13px;font-weight:500;}
    .cw-status-body .cw-status-desc{font-size:11px;color:var(--muted);}
    /* ── tool chips ─────────────────────────────────────────── */
    .cw-tool{display:flex;align-items:center;gap:8px;padding:8px 10px;
      border:1px solid var(--border);border-radius:6px;margin-top:8px;}
    .cw-tool-name{font-size:13px;font-weight:500;flex:1;}
    .cw-tool-type{padding:2px 7px;border-radius:4px;background:var(--surface2);
      font-size:10px;font-weight:600;color:var(--muted);}
    .cw-tool-desc{font-size:11px;color:var(--muted);margin-top:2px;}
    /* ── toggle switch ──────────────────────────────────────── */
    .cw-toggle-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:4px 0;}
    .cw-toggle-label .cw-toggle-title{font-size:13px;font-weight:500;}
    .cw-toggle-label .cw-toggle-desc{font-size:11px;color:var(--muted);}
    .cw-toggle{position:relative;width:38px;height:22px;flex-shrink:0;}
    .cw-toggle input{opacity:0;width:0;height:0;}
    .cw-toggle-track{position:absolute;inset:0;background:var(--toggle-off);border-radius:11px;
      cursor:pointer;transition:.2s;}
    .cw-toggle-track:before{content:"";position:absolute;width:16px;height:16px;left:3px;bottom:3px;
      background:#fff;border-radius:50%;transition:.2s;box-shadow:0 1px 3px rgba(0,0,0,.2);}
    input:checked+.cw-toggle-track{background:var(--brand);}
    input:checked+.cw-toggle-track:before{transform:translateX(16px);}
    /* ── avatar ─────────────────────────────────────────────── */
    .cw-avatar{width:48px;height:48px;border-radius:50%;object-fit:cover;
      background:var(--surface2);border:2px solid var(--border);}
    .cw-agent-header{display:flex;gap:12px;align-items:center;padding:14px 16px;
      border-bottom:1px solid var(--border-soft);}
    /* ── alerts ─────────────────────────────────────────────── */
    .cw-alert{padding:10px 14px;border-radius:6px;font-size:12px;margin-bottom:14px;}
    .cw-alert-warn{background:#fffbeb;border:1px solid #fcd34d;color:#92400e;}
    .cw-alert-err{background:#fef2f2;border:1px solid #fca5a5;color:#991b1b;}
    [data-theme="dark"] .cw-alert-warn{background:#422006;border-color:#92400e;color:#fde68a;}
    [data-theme="dark"] .cw-alert-err{background:#450a0a;border-color:#991b1b;color:#fca5a5;}
    /* ── loading ─────────────────────────────────────────────── */
    .cw-spinner{display:inline-block;width:16px;height:16px;border:2px solid rgba(31,147,255,.2);
      border-top-color:var(--brand);border-radius:50%;animation:spin .7s linear infinite;vertical-align:middle;}
    @keyframes spin{to{transform:rotate(360deg)}}
    .cw-loading{display:flex;flex-direction:column;align-items:center;justify-content:center;
      padding:60px 0;gap:10px;color:var(--muted);font-size:13px;}
    /* ── save feedback ───────────────────────────────────────── */
    .cw-save-ok{font-size:12px;color:var(--success);}
    .cw-save-err{font-size:12px;color:var(--err);}
    /* ── registry warning ───────────────────────────────────── */
    .cw-registry-warn{background:var(--brand-light);border:1px solid var(--brand);
      border-radius:6px;padding:10px 12px;font-size:12px;color:var(--brand);margin-bottom:12px;}
  </style>
</head>
<body>
<!-- HEADER -->
<header class="cw-header">
  <div class="cw-header-left">
    <div class="cw-header-logo">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M20 21a8 8 0 1 0-16 0"/></svg>
    </div>
    <span class="cw-header-title" id="header-title">Boom IA — Agente</span>
    <span id="header-badge"></span>
  </div>
  <div class="cw-header-right">
    <span id="save-ok" class="cw-save-ok"></span>
    <span id="save-err" class="cw-save-err"></span>
    <button class="cw-btn cw-btn-primary" id="save-btn" onclick="saveAgent()" disabled>
      Salvar alterações
    </button>
  </div>
</header>

<!-- TABS -->
<div class="cw-tabs" id="cw-tabs">
  <button class="cw-tab active" onclick="switchTab('basic',this)">Informações Básicas</button>
  <button class="cw-tab" onclick="switchTab('model',this)">Modelo de IA</button>
  <button class="cw-tab" onclick="switchTab('integ',this)">Integração</button>
  <button class="cw-tab" onclick="switchTab('sched',this)">Horário e Follow-up</button>
</div>

<div class="cw-body">
  <div id="alert-area"></div>

  <!-- LOADING -->
  <div id="loading-wrap" class="cw-loading">
    <div class="cw-spinner" style="width:24px;height:24px;border-width:3px;"></div>
    Carregando agente…
  </div>

  <div id="editor" style="display:none">

    <!-- BÁSICO -->
    <div id="panel-basic" class="cw-panel active">
      <div class="cw-section">
        <div class="cw-agent-header">
          <img id="agent-avatar" class="cw-avatar" src="" alt="" onerror="this.style.display='none'"/>
          <div>
            <div style="font-size:15px;font-weight:600" id="agent-name-display"></div>
            <div style="font-size:12px;color:var(--muted);margin-top:2px" id="agent-meta"></div>
          </div>
        </div>
        <div class="cw-section-body">
          <div class="cw-grid">
            <div class="cw-field">
              <label class="cw-label">Nome do agente</label>
              <input class="cw-input" id="f-name" oninput="markDirty()"/>
            </div>
            <div class="cw-field">
              <label class="cw-label">Descrição interna</label>
              <input class="cw-input" id="f-desc" oninput="markDirty()"/>
            </div>
          </div>
        </div>
      </div>

      <div class="cw-section">
        <div class="cw-section-head">
          <div class="cw-section-title">Situação do cadastro</div>
          <div class="cw-section-desc">Controla se o agente responde conversas no Chatwoot.</div>
        </div>
        <div class="cw-section-body">
          <div class="cw-status-group">
            <label class="cw-status-opt" id="so-active" onclick="setStatus('active')">
              <input type="radio" name="status" value="active"/>
              <div class="cw-status-body">
                <div class="cw-status-title">Ativo</div>
                <div class="cw-status-desc">Produção — responde normalmente às conversas.</div>
              </div>
            </label>
            <label class="cw-status-opt" id="so-test" onclick="setStatus('test')">
              <input type="radio" name="status" value="test"/>
              <div class="cw-status-body">
                <div class="cw-status-title">Teste</div>
                <div class="cw-status-desc">Ambiente restrito — só responde quando a conversa está atribuída ao assignee de teste.</div>
              </div>
            </label>
            <label class="cw-status-opt" id="so-inactive" onclick="setStatus('inactive')">
              <input type="radio" name="status" value="inactive"/>
              <div class="cw-status-body">
                <div class="cw-status-title">Inativo</div>
                <div class="cw-status-desc">Cadastro desabilitado — não processa mensagens.</div>
              </div>
            </label>
          </div>
        </div>
      </div>
    </div>

    <!-- MODELO IA -->
    <div id="panel-model" class="cw-panel">
      <div class="cw-section">
        <div class="cw-section-head">
          <div class="cw-section-title">Modelo de IA</div>
          <div class="cw-section-desc">Provider e parâmetros de geração de texto.</div>
        </div>
        <div class="cw-section-body">
          <div class="cw-grid" style="margin-bottom:14px">
            <div class="cw-field">
              <label class="cw-label">Provider</label>
              <select class="cw-select" id="f-provider" onchange="markDirty()"></select>
            </div>
            <div class="cw-field">
              <label class="cw-label">Modelo</label>
              <input class="cw-input" id="f-model" oninput="markDirty()" placeholder="ex: gemini-2.5-flash-lite"/>
            </div>
          </div>
          <div class="cw-field">
            <label class="cw-label">Temperatura · <span id="lbl-temp">0.7</span></label>
            <div class="cw-slider-row">
              <input type="range" class="cw-range" id="f-temp" min="0" max="2" step="0.05"
                oninput="document.getElementById('lbl-temp').textContent=parseFloat(this.value).toFixed(2);markDirty()"/>
            </div>
          </div>
          <div class="cw-grid">
            <div class="cw-field">
              <label class="cw-label">Top P · <span id="lbl-topp">0.8</span></label>
              <input type="range" class="cw-range" id="f-topp" min="0" max="1" step="0.05"
                oninput="document.getElementById('lbl-topp').textContent=parseFloat(this.value).toFixed(2);markDirty()"/>
            </div>
            <div class="cw-field">
              <label class="cw-label">Top K · <span id="lbl-topk">40</span></label>
              <input type="range" class="cw-range" id="f-topk" min="1" max="100" step="1"
                oninput="document.getElementById('lbl-topk').textContent=this.value;markDirty()"/>
            </div>
          </div>
        </div>
      </div>
      <div class="cw-section">
        <div class="cw-section-head">
          <div class="cw-section-title">Prompt do sistema</div>
        </div>
        <div class="cw-section-body">
          <div id="registry-warn" style="display:none" class="cw-registry-warn"></div>
          <div class="cw-field">
            <label class="cw-label">Preview do prompt em produção</label>
            <textarea class="cw-textarea" id="f-prompt-preview" readonly style="opacity:.65;min-height:110px;"></textarea>
          </div>
          <div class="cw-field" style="margin-top:12px">
            <label class="cw-label">Override / complemento</label>
            <textarea class="cw-textarea" id="f-system-prompt" oninput="markDirty()" style="min-height:100px;"></textarea>
            <div class="cw-hint">Aplicado em adição ao prompt do registry. Pode ficar vazio.</div>
          </div>
        </div>
      </div>
    </div>

    <!-- INTEGRAÇÃO -->
    <div id="panel-integ" class="cw-panel">
      <div class="cw-section">
        <div class="cw-section-head">
          <div class="cw-section-title">Chatwoot</div>
        </div>
        <div class="cw-section-body">
          <div class="cw-field" style="margin-bottom:14px">
            <label class="cw-label">URL do Chatwoot</label>
            <input class="cw-input" id="f-cw-url" oninput="markDirty()" placeholder="https://mega.atendai.app"/>
          </div>
          <div class="cw-grid">
            <div class="cw-field">
              <label class="cw-label">Account ID</label>
              <input class="cw-input" id="f-cw-acct" oninput="markDirty()"/>
            </div>
            <div class="cw-field">
              <label class="cw-label">API Token</label>
              <input class="cw-input" id="f-cw-token" type="password" oninput="markDirty()" placeholder="••••••••"/>
            </div>
          </div>
        </div>
      </div>
      <div class="cw-section">
        <div class="cw-section-head">
          <div class="cw-section-title">Tools vinculadas</div>
        </div>
        <div class="cw-section-body" id="tools-list">
          <span style="font-size:13px;color:var(--muted)">Sem tools vinculadas.</span>
        </div>
      </div>
    </div>

    <!-- HORÁRIO -->
    <div id="panel-sched" class="cw-panel">
      <div class="cw-section">
        <div class="cw-section-head">
          <div class="cw-section-title">Horário Comercial</div>
          <div class="cw-section-desc">Limita as respostas ao intervalo configurado.</div>
        </div>
        <div class="cw-section-body">
          <div class="cw-toggle-row" style="margin-bottom:12px">
            <div class="cw-toggle-label">
              <div class="cw-toggle-title">Ativar horário comercial</div>
            </div>
            <label class="cw-toggle"><input type="checkbox" id="f-biz-enabled" onchange="markDirty()"/><span class="cw-toggle-track"></span></label>
          </div>
          <div class="cw-field">
            <label class="cw-label">Mensagem fora do horário</label>
            <input class="cw-input" id="f-offline-msg" oninput="markDirty()" placeholder="Nosso atendimento é de segunda a sexta…"/>
          </div>
        </div>
      </div>
      <div class="cw-section">
        <div class="cw-section-head">
          <div class="cw-section-title">Follow-up automático</div>
          <div class="cw-section-desc">Retoma contato quando o cliente para de responder.</div>
        </div>
        <div class="cw-section-body">
          <div class="cw-toggle-row" style="margin-bottom:12px">
            <div class="cw-toggle-label">
              <div class="cw-toggle-title">Ativar follow-up</div>
            </div>
            <label class="cw-toggle"><input type="checkbox" id="f-fu-enabled" onchange="markDirty()"/><span class="cw-toggle-track"></span></label>
          </div>
          <div class="cw-field">
            <label class="cw-label">Intervalos (minutos, separados por vírgula)</label>
            <input class="cw-input" id="f-fu-intervals" oninput="markDirty()" placeholder="10,20,30"/>
          </div>
          <div class="cw-grid" style="margin-top:12px">
            <div class="cw-field">
              <label class="cw-label">Silêncio — início</label>
              <input type="time" class="cw-input" id="f-fu-quiet-start" oninput="markDirty()"/>
            </div>
            <div class="cw-field">
              <label class="cw-label">Silêncio — fim</label>
              <input type="time" class="cw-input" id="f-fu-quiet-end" oninput="markDirty()"/>
            </div>
          </div>
        </div>
      </div>
    </div>

  </div><!-- /editor -->
</div><!-- /cw-body -->

<script>
var STATE={agent:null,providers:[],dirty:false,currentStatus:"inactive"};
var KEY=${safeKey};
var ACCOUNT_ID=${safeAccountId};
var API_BASE="/api";

/* ── tema ─────────────────────────────────────────────────── */
function applyTheme(t,colors){
  document.documentElement.setAttribute("data-theme",t==="dark"?"dark":"light");
  var solidLight={bg:"#fafafa",surface:"#ffffff",text:"#3c4858"};
  var solidDark={bg:"#151718",surface:"#1c1f20",text:"#d4d6da"};
  var base=t==="dark"?solidDark:solidLight;
  document.documentElement.style.setProperty("--bg",base.bg);
  document.documentElement.style.setProperty("--surface",base.surface);
  document.documentElement.style.setProperty("--text",base.text);
  if(!colors) return;
  function opaque(c){if(!c||c==="transparent")return false;var m=String(c).match(/rgba?\(([^)]+)\)/);if(!m)return true;var p=m[1].split(",");if(p.length===4&&parseFloat(p[3])===0)return false;return true;}
  var r=document.documentElement.style;
  if(opaque(colors.bg))      r.setProperty("--bg",colors.bg);
  if(opaque(colors.surface)) r.setProperty("--surface",colors.surface);
  if(opaque(colors.surface2))r.setProperty("--surface2",colors.surface2);
  if(opaque(colors.border))  r.setProperty("--border",colors.border);
  if(opaque(colors.text))    r.setProperty("--text",colors.text);
  if(opaque(colors.muted))   r.setProperty("--muted",colors.muted);
  if(opaque(colors.brand))   r.setProperty("--brand",colors.brand);
}
applyTheme(${safeTheme},null);

window.addEventListener("message",function(e){
  if(!e.data||typeof e.data!=="object") return;
  if(e.data.type==="boom-ia-embed:theme"||e.data.type==="boom-ia-embed:init"){
    applyTheme(e.data.theme||${safeTheme},e.data.colors||null);
  }
});

/* ── util ─────────────────────────────────────────────────── */
function esc(s){return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");}
function switchTab(n,btn){
  document.querySelectorAll(".cw-panel").forEach(function(p){p.classList.remove("active");});
  document.querySelectorAll(".cw-tab").forEach(function(t){t.classList.remove("active");});
  var p=document.getElementById("panel-"+n); if(p) p.classList.add("active");
  if(btn) btn.classList.add("active");
}
function markDirty(){
  STATE.dirty=true;
  document.getElementById("save-btn").disabled=false;
  document.getElementById("save-ok").textContent="";
}
function setStatus(v){
  ["active","test","inactive"].forEach(function(s){
    var el=document.getElementById("so-"+s);
    if(el){el.classList.toggle("sel",s===v); var inp=el.querySelector("input"); if(inp) inp.checked=(s===v);}
  });
  STATE.currentStatus=v; markDirty();
}
function showAlert(msg,type){
  document.getElementById("alert-area").innerHTML='<div class="cw-alert cw-alert-'+(type||"warn")+'">'+esc(msg)+"</div>";
}
function cfg(k,fb){var c=STATE.agent?(STATE.agent.config||{}):{};return c[k]!=null?c[k]:(fb!==undefined?fb:"");}

/* ── fill ─────────────────────────────────────────────────── */
function fillForm(agent){
  STATE.agent=agent;
  document.getElementById("agent-name-display").textContent=agent.name;
  document.getElementById("agent-meta").textContent=(agent.tenant_name||"")+" · "+(agent.provider_name||"")+" · "+(agent.model||"");
  var ht=document.getElementById("header-title"); if(ht) ht.textContent=agent.name;
  var hb=document.getElementById("header-badge");
  if(hb) hb.innerHTML='<span class="cw-badge '+(agent.status||"inactive")+'"><span class="cw-badge-dot"></span>'+(agent.status==="active"?"Ativo":agent.status==="test"?"Teste":"Inativo")+"</span>";
  var av=document.getElementById("agent-avatar");
  if(agent.avatar_url){av.src=agent.avatar_url;av.style.display="block";}else av.style.display="none";
  document.getElementById("f-name").value=agent.name||"";
  document.getElementById("f-desc").value=agent.description||"";
  setStatus(agent.status||"inactive"); STATE.currentStatus=agent.status||"inactive";
  var ps=document.getElementById("f-provider"); ps.innerHTML="";
  STATE.providers.forEach(function(p){var o=document.createElement("option");o.value=p.id;o.textContent=p.name;if(p.id===agent.provider_id)o.selected=true;ps.appendChild(o);});
  document.getElementById("f-model").value=agent.model||"";
  var temp=agent.temperature!=null?agent.temperature:0.7;
  document.getElementById("f-temp").value=temp; document.getElementById("lbl-temp").textContent=parseFloat(temp).toFixed(2);
  var topp=cfg("top_p",0.8); document.getElementById("f-topp").value=topp; document.getElementById("lbl-topp").textContent=parseFloat(topp).toFixed(2);
  var topk=cfg("top_k",40); document.getElementById("f-topk").value=topk; document.getElementById("lbl-topk").textContent=topk;
  document.getElementById("f-system-prompt").value=agent.system_prompt||"";
  if(agent.prompt&&agent.prompt.uses_registry){
    var rw=document.getElementById("registry-warn"); rw.style.display="block";
    rw.textContent="Prompt em produção: "+esc(agent.prompt.slug||"")+" v"+(agent.prompt.version||"?");
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
  if(agent.tools&&agent.tools.length){
    tl.innerHTML=agent.tools.map(function(t){
      return'<div class="cw-tool"><div style="flex:1"><div class="cw-tool-name">'+esc(t.name)+'<span class="cw-tool-type">'+esc(t.tool_type)+"</span></div>"+(t.description?'<div class="cw-tool-desc">'+esc(t.description)+"</div>":"")+"</div></div>";
    }).join("");
  }
}

/* ── save ─────────────────────────────────────────────────── */
function buildPayload(){
  var iv=document.getElementById("f-fu-intervals").value.split(",").map(function(x){return parseInt(x.trim(),10);}).filter(function(n){return!isNaN(n);});
  return{name:document.getElementById("f-name").value.trim(),description:document.getElementById("f-desc").value.trim()||null,
    status:STATE.currentStatus||"inactive",provider_id:document.getElementById("f-provider").value||null,
    model:document.getElementById("f-model").value.trim()||null,system_prompt:document.getElementById("f-system-prompt").value.trim()||null,
    temperature:parseFloat(document.getElementById("f-temp").value),
    config:Object.assign({},STATE.agent?(STATE.agent.config||{}):{},{
      top_p:parseFloat(document.getElementById("f-topp").value),top_k:parseInt(document.getElementById("f-topk").value,10),
      chatwoot_url:document.getElementById("f-cw-url").value||undefined,
      chatwoot_account_id:document.getElementById("f-cw-acct").value||undefined,
      chatwoot_api_token:document.getElementById("f-cw-token").value||undefined,
      business_hours_enabled:document.getElementById("f-biz-enabled").checked,
      business_hours_offline_message:document.getElementById("f-offline-msg").value||undefined,
      followup_enabled:document.getElementById("f-fu-enabled").checked,
      followup_intervals:iv,followup_max_attempts:iv.length,
      followup_quiet_start:document.getElementById("f-fu-quiet-start").value||undefined,
      followup_quiet_end:document.getElementById("f-fu-quiet-end").value||undefined,
    })};
}
function saveAgent(){
  if(!STATE.agent) return;
  var btn=document.getElementById("save-btn"),ok=document.getElementById("save-ok"),err=document.getElementById("save-err");
  btn.disabled=true; btn.innerHTML='<span class="cw-spinner"></span> Salvando…';
  ok.textContent=""; err.textContent="";
  var url=API_BASE+"/embed/chatwoot/agents/"+encodeURIComponent(STATE.agent.id)+"?account_id="+encodeURIComponent(ACCOUNT_ID)+"&key="+encodeURIComponent(KEY);
  fetch(url,{method:"PATCH",headers:{"Content-Type":"application/json","x-chatwoot-mirror-key":KEY},body:JSON.stringify(buildPayload())})
    .then(function(r){return r.json().then(function(j){return{ok:r.ok,j:j};});})
    .then(function(res){
      btn.innerHTML="Salvar alterações";
      if(!res.ok){btn.disabled=false;err.textContent=res.j.error||"Erro ao salvar";return;}
      STATE.dirty=false; ok.textContent="Salvo com sucesso ✓"; setTimeout(function(){ok.textContent="";},3000);
      if(res.j.agent) fillForm(res.j.agent);
    })
    .catch(function(e){btn.innerHTML="Salvar alterações";btn.disabled=false;err.textContent=e.message||"Erro de rede";});
}

/* ── load ─────────────────────────────────────────────────── */
function load(){
  if(!KEY||!ACCOUNT_ID){
    document.getElementById("loading-wrap").innerHTML='<div class="cw-alert cw-alert-err">key ou account_id ausente.</div>';
    return;
  }
  fetch(API_BASE+"/embed/chatwoot/agents?account_id="+encodeURIComponent(ACCOUNT_ID)+"&key="+encodeURIComponent(KEY),
    {headers:{"x-chatwoot-mirror-key":KEY}})
    .then(function(r){return r.json().then(function(j){return{ok:r.ok,j:j};});})
    .then(function(res){
      document.getElementById("loading-wrap").style.display="none";
      if(!res.ok){showAlert(res.j.error||"Erro","err");return;}
      var agents=res.j.agents||[]; STATE.providers=res.j.providers||[];
      if(!agents.length){showAlert(res.j.message||"Nenhum agente vinculado.","warn");return;}
      document.getElementById("editor").style.display="block";
      fillForm(agents[0]);
    })
    .catch(function(e){document.getElementById("loading-wrap").innerHTML='<div class="cw-alert cw-alert-err">'+esc(e.message)+"</div>";});
}
load();
</script>
</body>
</html>`;
}
