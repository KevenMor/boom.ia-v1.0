/** Página HTML standalone — visual nativo Mega/Chatwoot (settings agent). */
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
  <title>Agente IA</title>
  <link rel="preconnect" href="https://fonts.googleapis.com"/>
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet"/>
  <style>
    :root,[data-theme="light"]{
      --content-max:720px;
      --bg:#ffffff;--page:#ffffff;--surface:#ffffff;--surface-muted:#f8fafc;
      --border:#e5e7eb;--border-input:#d1d5db;--divider:#f1f5f9;
      --text:#111827;--text-secondary:#4b5563;--text-muted:#6b7280;--text-label:#9ca3af;
      --brand:#1f93ff;--brand-hover:#1781e3;--brand-soft:#eff6ff;--brand-ring:rgba(31,147,255,.25);
      --success:#22c55e;--success-soft:#dcfce7;--success-text:#15803d;
      --warn-soft:#fef9c3;--warn-text:#854d0e;--muted-soft:#f3f4f6;--muted-text:#6b7280;
      --err:#ef4444;--shadow-sm:0 1px 2px rgba(0,0,0,.04);
      --input-bg:#ffffff;
    }
    [data-theme="dark"]{
      --bg:#0f1419;--page:#0f1419;--surface:#1a1f26;--surface-muted:#232a33;
      --border:#2d3748;--border-input:#4a5568;--divider:#252d38;
      --text:#f3f4f6;--text-secondary:#e5e7eb;--text-muted:#9ca3af;--text-label:#6b7280;
      --brand:#3b9eff;--brand-hover:#60a5fa;--brand-soft:rgba(59,158,255,.12);--brand-ring:rgba(59,158,255,.35);
      --success:#4ade80;--success-soft:rgba(74,222,128,.12);--success-text:#86efac;
      --warn-soft:rgba(251,191,36,.12);--warn-text:#fde68a;--muted-soft:#2d3748;--muted-text:#9ca3af;
      --err:#f87171;--shadow-sm:0 1px 3px rgba(0,0,0,.45);
      --input-bg:#1a1f26;
    }
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
    html,body{height:100%;min-height:100%;}
    body{
      background:var(--page);color:var(--text);
      font:14px/1.5 "Inter",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
      -webkit-font-smoothing:antialiased;
    }
    .cw-app{min-height:100%;display:flex;flex-direction:column;background:var(--page);}

    /* ── topbar (estilo settings Chatwoot) ── */
    .cw-topbar{
      position:sticky;top:0;z-index:40;
      background:var(--surface);border-bottom:1px solid var(--border);
      box-shadow:var(--shadow-sm);
    }
    .cw-topbar-inner{
      display:flex;align-items:center;justify-content:space-between;gap:16px;
      padding:16px 24px;width:100%;
    }
    .cw-topbar-main{display:flex;align-items:center;gap:14px;min-width:0;flex:1;}
    .cw-avatar{
      width:52px;height:52px;border-radius:50%;object-fit:cover;flex-shrink:0;
      background:var(--surface-muted);border:2px solid var(--border);
    }
    .cw-topbar-text{min-width:0;}
    .cw-topbar-text h1{font-size:20px;font-weight:600;line-height:1.25;color:var(--text);}
    .cw-topbar-text p{font-size:13px;color:var(--text-muted);margin-top:2px;word-break:break-word;}
    .cw-topbar-title-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap;}
    .cw-topbar-actions{display:flex;align-items:center;gap:12px;flex-shrink:0;}
    .cw-status-pill{
      display:inline-flex;align-items:center;gap:6px;padding:4px 10px;
      border-radius:999px;font-size:12px;font-weight:600;white-space:nowrap;
    }
    .cw-status-pill .dot{width:7px;height:7px;border-radius:50%;flex-shrink:0;}
    .cw-status-pill.active{background:var(--success-soft);color:var(--success-text);}
    .cw-status-pill.active .dot{background:var(--success);}
    .cw-status-pill.test{background:var(--warn-soft);color:var(--warn-text);}
    .cw-status-pill.test .dot{background:#eab308;}
    .cw-status-pill.inactive{background:var(--muted-soft);color:var(--muted-text);}
    .cw-status-pill.inactive .dot{background:#9ca3af;}

    /* ── tabs (full-width, alinhadas à esquerda) ── */
    .cw-tabs-bar{background:var(--surface);border-bottom:1px solid var(--border);}
    .cw-tabs{
      display:flex;gap:4px;width:100%;padding:0 24px;
      overflow-x:auto;overflow-y:hidden;-webkit-overflow-scrolling:touch;
      scrollbar-width:none;
    }
    .cw-tabs::-webkit-scrollbar{display:none;}
    .cw-tab{
      padding:12px 16px;border:0;background:none;cursor:pointer;flex-shrink:0;
      font:inherit;font-size:14px;font-weight:500;color:var(--text-muted);
      border-bottom:3px solid transparent;margin-bottom:-1px;white-space:nowrap;
      border-radius:8px 8px 0 0;min-height:44px;
      transition:color .15s,background .15s,border-color .15s;
    }
    .cw-tab:hover{color:var(--text-secondary);background:var(--surface-muted);}
    .cw-tab.active{
      color:var(--brand);font-weight:600;
      border-bottom-color:var(--brand);
      background:var(--brand-soft);
    }

    /* ── main content ── */
    .cw-main{flex:1;padding:24px 24px 48px;background:var(--page);}
    .cw-main-inner{max-width:var(--content-max);margin:0 auto;width:100%;}
    .cw-panel{display:none;animation:fadeIn .2s ease;}
    .cw-panel.active{display:block;}
    @keyframes fadeIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}

    /* ── form blocks (flat, sem card boxy) ── */
    .cw-block{padding-bottom:28px;margin-bottom:28px;border-bottom:1px solid var(--divider);}
    .cw-block:last-child{border-bottom:0;margin-bottom:0;padding-bottom:0;}
    .cw-block-title{font-size:15px;font-weight:600;color:var(--text);margin-bottom:4px;}
    .cw-block-desc{font-size:13px;color:var(--text-muted);margin-bottom:20px;line-height:1.5;}

    .cw-field{margin-bottom:20px;}
    .cw-field:last-child{margin-bottom:0;}
    .cw-label{
      display:block;font-size:11px;font-weight:600;text-transform:uppercase;
      letter-spacing:.06em;color:var(--text-label);margin-bottom:8px;
    }
    .cw-input,.cw-select,.cw-textarea{
      width:100%;height:40px;padding:0 12px;border-radius:8px;
      border:1px solid var(--border-input);background:var(--input-bg,var(--surface));
      color:var(--text);font:inherit;font-size:14px;
      transition:border-color .15s,box-shadow .15s;
    }
    .cw-textarea{height:auto;padding:10px 12px;min-height:112px;resize:vertical;line-height:1.5;}
    .cw-input:focus,.cw-select:focus,.cw-textarea:focus{
      outline:none;border-color:var(--brand);box-shadow:0 0 0 3px var(--brand-ring);
    }
    .cw-input::placeholder,.cw-textarea::placeholder{color:var(--text-label);}
    .cw-hint{font-size:12px;color:var(--text-muted);margin-top:6px;line-height:1.4;}
    .cw-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px;}

    /* ── status options ── */
    .cw-status-list{display:flex;flex-direction:column;gap:8px;}
    .cw-status-opt{
      display:flex;align-items:flex-start;gap:12px;padding:14px 16px;
      border:1px solid var(--border);border-radius:10px;cursor:pointer;
      background:var(--surface);transition:background .12s,border-color .12s;
    }
    .cw-status-opt:hover{background:var(--surface-muted);}
    .cw-status-opt.sel{background:var(--brand-soft);border-color:var(--brand);box-shadow:0 0 0 1px var(--brand);}
    .cw-status-opt input{margin-top:3px;accent-color:var(--brand);flex-shrink:0;}
    .cw-status-title{font-size:14px;font-weight:600;color:var(--text);}
    .cw-status-desc{font-size:13px;color:var(--text-muted);margin-top:2px;line-height:1.4;}

    /* ── range ── */
    .cw-range{width:100%;height:6px;accent-color:var(--brand);cursor:pointer;}

    /* ── toggle ── */
    .cw-row{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:4px 0;}
    .cw-row-title{font-size:14px;font-weight:500;color:var(--text);}
    .cw-row-desc{font-size:13px;color:var(--text-muted);margin-top:2px;}
    .cw-switch{position:relative;width:42px;height:24px;flex-shrink:0;}
    .cw-switch input{opacity:0;width:0;height:0;position:absolute;}
    .cw-switch-track{
      position:absolute;inset:0;background:#d1d5db;border-radius:12px;cursor:pointer;transition:.2s;
    }
    [data-theme="dark"] .cw-switch-track{background:#4b5563;}
    .cw-switch-track::after{
      content:"";position:absolute;width:18px;height:18px;left:3px;top:3px;
      background:#fff;border-radius:50%;transition:.2s;box-shadow:0 1px 3px rgba(0,0,0,.15);
    }
    .cw-switch input:checked+.cw-switch-track{background:var(--brand);}
    .cw-switch input:checked+.cw-switch-track::after{transform:translateX(18px);}

    /* ── tools ── */
    .cw-tool{
      display:flex;align-items:flex-start;gap:12px;padding:12px 14px;
      border:1px solid var(--border);border-radius:10px;background:var(--surface);margin-top:8px;
    }
    .cw-tool-name{font-size:14px;font-weight:500;color:var(--text);}
    .cw-tool-tag{
      display:inline-block;margin-left:8px;padding:2px 8px;border-radius:6px;
      font-size:11px;font-weight:600;background:var(--surface-muted);color:var(--text-muted);
    }
    .cw-tool-desc{font-size:13px;color:var(--text-muted);margin-top:4px;}

    /* ── button ── */
    .cw-btn{
      display:inline-flex;align-items:center;justify-content:center;gap:8px;
      min-height:44px;padding:0 22px;border:0;border-radius:8px;
      font:inherit;font-size:14px;font-weight:600;cursor:pointer;
      transition:background .15s,box-shadow .15s,transform .05s,opacity .15s;
    }
    .cw-btn:active{transform:scale(.98);}
    .cw-btn-primary{background:var(--brand);color:#fff;}
    .cw-btn-primary:hover:not(:disabled){background:var(--brand-hover);}
    .cw-btn-primary:disabled{opacity:.4;cursor:not-allowed;box-shadow:none!important;}
    .cw-btn-primary:not(:disabled){
      box-shadow:0 1px 2px rgba(0,0,0,.08),0 4px 14px rgba(31,147,255,.35);
    }
    [data-theme="dark"] .cw-btn-primary:not(:disabled){
      box-shadow:0 4px 16px rgba(59,158,255,.28);
    }
    .cw-btn-primary.cw-btn-ready:not(:disabled){
      animation:pulse-save 2s ease-in-out infinite;
    }
    @keyframes pulse-save{0%,100%{box-shadow:0 1px 2px rgba(0,0,0,.08),0 4px 14px rgba(31,147,255,.35)}50%{box-shadow:0 2px 8px rgba(0,0,0,.1),0 6px 20px rgba(31,147,255,.5)}}
    .cw-save-ok{font-size:13px;font-weight:600;color:var(--success);}
    .cw-save-err{font-size:13px;font-weight:500;color:var(--err);}

    /* ── mobile ── */
    @media(max-width:768px){
      :root,[data-theme="light"],[data-theme="dark"]{--content-max:100%;}
      .cw-topbar-inner{flex-direction:column;align-items:stretch;padding:12px 16px;gap:12px;}
      .cw-avatar{width:44px;height:44px;}
      .cw-topbar-text h1{font-size:18px;}
      .cw-topbar-actions{
        width:100%;flex-wrap:wrap;gap:8px;
        padding-top:4px;border-top:1px solid var(--divider);
      }
      .cw-btn-primary{flex:1;min-width:140px;}
      .cw-save-ok,.cw-save-err{flex:1 1 100%;text-align:center;}
      .cw-tabs{padding:0 12px;}
      .cw-tab{padding:10px 12px;font-size:13px;}
      .cw-main{padding:16px 16px 32px;}
      .cw-grid{grid-template-columns:1fr;gap:16px;}
      .cw-block{padding-bottom:22px;margin-bottom:22px;}
      .cw-status-opt{padding:12px 14px;}
      .cw-row{flex-direction:column;align-items:flex-start;gap:10px;}
      .cw-switch{align-self:flex-end;}
    }
    @media(max-width:480px){
      .cw-topbar-main{gap:10px;}
      .cw-btn-primary{width:100%;}
    }

    /* ── alerts / loading ── */
    .cw-alert{padding:12px 14px;border-radius:10px;font-size:13px;margin-bottom:20px;line-height:1.4;}
    .cw-alert-warn{background:#fffbeb;border:1px solid #fde68a;color:#92400e;}
    .cw-alert-err{background:#fef2f2;border:1px solid #fecaca;color:#991b1b;}
    [data-theme="dark"] .cw-alert-warn{background:#422006;border-color:#92400e;color:#fde68a;}
    [data-theme="dark"] .cw-alert-err{background:#450a0a;border-color:#991b1b;color:#fca5a5;}
    .cw-registry{
      padding:12px 14px;border-radius:10px;font-size:13px;margin-bottom:16px;line-height:1.45;
      background:var(--brand-soft);border:1px solid var(--brand);color:var(--brand);
    }
    [data-theme="dark"] .cw-registry{
      background:rgba(59,158,255,.1);border-color:rgba(59,158,255,.45);color:#93c5fd;
    }
    .cw-loading{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:80px 0;gap:12px;color:var(--text-muted);}
    .cw-spinner{
      width:28px;height:28px;border:3px solid var(--divider);
      border-top-color:var(--brand);border-radius:50%;animation:spin .7s linear infinite;
    }
    @keyframes spin{to{transform:rotate(360deg)}}
    .cw-empty{font-size:14px;color:var(--text-muted);}
  </style>
</head>
<body>
<div class="cw-app">
  <header class="cw-topbar">
    <div class="cw-topbar-inner">
      <div class="cw-topbar-main">
        <img id="agent-avatar" class="cw-avatar" src="" alt="" onerror="this.style.visibility='hidden'"/>
        <div class="cw-topbar-text">
          <div class="cw-topbar-title-row">
            <h1 id="header-title">Agente IA</h1>
            <span id="header-badge"></span>
          </div>
          <p id="agent-meta">Carregando…</p>
        </div>
      </div>
      <div class="cw-topbar-actions">
        <span id="save-ok" class="cw-save-ok"></span>
        <span id="save-err" class="cw-save-err"></span>
        <button type="button" class="cw-btn cw-btn-primary" id="save-btn" onclick="saveAgent()" disabled>Salvar alterações</button>
      </div>
    </div>
  </header>

  <div class="cw-tabs-bar">
  <nav class="cw-tabs" id="cw-tabs">
    <button type="button" class="cw-tab active" onclick="switchTab('basic',this)">Informações Básicas</button>
    <button type="button" class="cw-tab" onclick="switchTab('model',this)">Modelo de IA</button>
    <button type="button" class="cw-tab" onclick="switchTab('integ',this)">Integração</button>
    <button type="button" class="cw-tab" onclick="switchTab('sched',this)">Horário e Follow-up</button>
  </nav>
  </div>

  <main class="cw-main">
    <div class="cw-main-inner">
      <div id="alert-area"></div>
      <div id="loading-wrap" class="cw-loading">
        <div class="cw-spinner"></div>
        <span>Carregando agente…</span>
      </div>

      <div id="editor" style="display:none">

        <div id="panel-basic" class="cw-panel active">
          <div class="cw-block">
            <div class="cw-block-title">Informações do agente</div>
            <div class="cw-block-desc">Nome e descrição interna visíveis apenas no painel administrativo.</div>
            <div class="cw-grid">
              <div class="cw-field">
                <label class="cw-label" for="f-name">Nome do agente</label>
                <input class="cw-input" id="f-name" oninput="markDirty()"/>
              </div>
              <div class="cw-field">
                <label class="cw-label" for="f-desc">Descrição interna</label>
                <input class="cw-input" id="f-desc" oninput="markDirty()"/>
              </div>
            </div>
          </div>
          <div class="cw-block">
            <div class="cw-block-title">Situação do cadastro</div>
            <div class="cw-block-desc">Controla se o agente responde conversas nesta conta Chatwoot.</div>
            <div class="cw-status-list">
              <label class="cw-status-opt" id="so-active" onclick="setStatus('active')">
                <input type="radio" name="status" value="active"/>
                <div><div class="cw-status-title">Ativo</div><div class="cw-status-desc">Produção — responde normalmente às conversas.</div></div>
              </label>
              <label class="cw-status-opt" id="so-test" onclick="setStatus('test')">
                <input type="radio" name="status" value="test"/>
                <div><div class="cw-status-title">Teste</div><div class="cw-status-desc">Responde apenas quando a conversa está atribuída ao assignee de teste.</div></div>
              </label>
              <label class="cw-status-opt" id="so-inactive" onclick="setStatus('inactive')">
                <input type="radio" name="status" value="inactive"/>
                <div><div class="cw-status-title">Inativo</div><div class="cw-status-desc">Cadastro desabilitado — não processa mensagens.</div></div>
              </label>
            </div>
          </div>
        </div>

        <div id="panel-model" class="cw-panel">
          <div class="cw-block">
            <div class="cw-block-title">Modelo de IA</div>
            <div class="cw-block-desc">Provider e parâmetros de geração de texto.</div>
            <div class="cw-grid" style="margin-bottom:20px">
              <div class="cw-field">
                <label class="cw-label" for="f-provider">Provider</label>
                <select class="cw-select" id="f-provider" onchange="markDirty()"></select>
              </div>
              <div class="cw-field">
                <label class="cw-label" for="f-model">Modelo</label>
                <input class="cw-input" id="f-model" oninput="markDirty()" placeholder="ex: gemini-2.5-flash-lite"/>
              </div>
            </div>
            <div class="cw-field">
              <label class="cw-label">Temperatura · <span id="lbl-temp">0.70</span></label>
              <input type="range" class="cw-range" id="f-temp" min="0" max="2" step="0.05"
                oninput="document.getElementById('lbl-temp').textContent=parseFloat(this.value).toFixed(2);markDirty()"/>
            </div>
            <div class="cw-grid" style="margin-top:20px">
              <div class="cw-field">
                <label class="cw-label">Top P · <span id="lbl-topp">0.80</span></label>
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
          <div class="cw-block">
            <div class="cw-block-title">Prompt do sistema</div>
            <div class="cw-block-desc">Complemento ao prompt definido no registry de produção.</div>
            <div id="registry-warn" style="display:none" class="cw-registry"></div>
            <div class="cw-field">
              <label class="cw-label" for="f-prompt-preview">Preview em produção</label>
              <textarea class="cw-textarea" id="f-prompt-preview" readonly style="opacity:.7;font-family:ui-monospace,monospace;font-size:12px;"></textarea>
            </div>
            <div class="cw-field">
              <label class="cw-label" for="f-system-prompt">Override / complemento</label>
              <textarea class="cw-textarea" id="f-system-prompt" oninput="markDirty()"></textarea>
              <div class="cw-hint">Aplicado em adição ao prompt do registry. Pode ficar vazio.</div>
            </div>
          </div>
        </div>

        <div id="panel-integ" class="cw-panel">
          <div class="cw-block">
            <div class="cw-block-title">Chatwoot</div>
            <div class="cw-block-desc">Credenciais de integração com esta instância.</div>
            <div class="cw-field">
              <label class="cw-label" for="f-cw-url">URL do Chatwoot</label>
              <input class="cw-input" id="f-cw-url" oninput="markDirty()" placeholder="https://mega.atendai.app"/>
            </div>
            <div class="cw-grid">
              <div class="cw-field">
                <label class="cw-label" for="f-cw-acct">Account ID</label>
                <input class="cw-input" id="f-cw-acct" oninput="markDirty()"/>
              </div>
              <div class="cw-field">
                <label class="cw-label" for="f-cw-token">API Token</label>
                <input class="cw-input" id="f-cw-token" type="password" oninput="markDirty()" placeholder="••••••••"/>
              </div>
            </div>
          </div>
          <div class="cw-block">
            <div class="cw-block-title">Tools vinculadas</div>
            <div id="tools-list"><span class="cw-empty">Sem tools vinculadas.</span></div>
          </div>
        </div>

        <div id="panel-sched" class="cw-panel">
          <div class="cw-block">
            <div class="cw-block-title">Horário comercial</div>
            <div class="cw-block-desc">Limita as respostas automáticas ao intervalo configurado.</div>
            <div class="cw-row" style="margin-bottom:16px">
              <div><div class="cw-row-title">Ativar horário comercial</div></div>
              <label class="cw-switch"><input type="checkbox" id="f-biz-enabled" onchange="markDirty()"/><span class="cw-switch-track"></span></label>
            </div>
            <div class="cw-field">
              <label class="cw-label" for="f-offline-msg">Mensagem fora do horário</label>
              <input class="cw-input" id="f-offline-msg" oninput="markDirty()" placeholder="Nosso atendimento é de segunda a sexta…"/>
            </div>
          </div>
          <div class="cw-block">
            <div class="cw-block-title">Follow-up automático</div>
            <div class="cw-block-desc">Retoma contato quando o cliente para de responder.</div>
            <div class="cw-row" style="margin-bottom:16px">
              <div><div class="cw-row-title">Ativar follow-up</div><div class="cw-row-desc">Envia mensagens nos intervalos definidos abaixo.</div></div>
              <label class="cw-switch"><input type="checkbox" id="f-fu-enabled" onchange="markDirty()"/><span class="cw-switch-track"></span></label>
            </div>
            <div class="cw-field">
              <label class="cw-label" for="f-fu-intervals">Intervalos (minutos)</label>
              <input class="cw-input" id="f-fu-intervals" oninput="markDirty()" placeholder="10, 20, 30"/>
              <div class="cw-hint">Separe os valores por vírgula.</div>
            </div>
            <div class="cw-grid" style="margin-top:16px">
              <div class="cw-field">
                <label class="cw-label" for="f-fu-quiet-start">Silêncio — início</label>
                <input type="time" class="cw-input" id="f-fu-quiet-start" oninput="markDirty()"/>
              </div>
              <div class="cw-field">
                <label class="cw-label" for="f-fu-quiet-end">Silêncio — fim</label>
                <input type="time" class="cw-input" id="f-fu-quiet-end" oninput="markDirty()"/>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  </main>
</div>

<script>
var STATE={agent:null,providers:[],dirty:false,currentStatus:"inactive"};
var KEY=${safeKey};
var ACCOUNT_ID=${safeAccountId};
var API_BASE="/api";

function applyTheme(t,colors){
  document.documentElement.setAttribute("data-theme",t==="dark"?"dark":"light");
  var solidLight={bg:"#ffffff",surface:"#ffffff",text:"#111827"};
  var solidDark={bg:"#111827",surface:"#1f2937",text:"#f9fafb"};
  var base=t==="dark"?solidDark:solidLight;
  document.documentElement.style.setProperty("--page",base.bg);
  document.documentElement.style.setProperty("--bg",base.bg);
  document.documentElement.style.setProperty("--surface",base.surface);
  document.documentElement.style.setProperty("--text",base.text);
  if(!colors) return;
  function opaque(c){if(!c||c==="transparent")return false;var m=String(c).match(/rgba?\\(([^)]+)\\)/);if(!m)return true;var p=m[1].split(",");if(p.length===4&&parseFloat(p[3])===0)return false;return true;}
  var r=document.documentElement.style;
  if(opaque(colors.bg))      { r.setProperty("--page",colors.bg); r.setProperty("--bg",colors.bg); }
  if(opaque(colors.surface))  r.setProperty("--surface",colors.surface);
  if(opaque(colors.border))   r.setProperty("--border",colors.border);
  if(opaque(colors.text))     r.setProperty("--text",colors.text);
  if(opaque(colors.muted))    r.setProperty("--text-muted",colors.muted);
  if(opaque(colors.brand))    r.setProperty("--brand",colors.brand);
}
applyTheme(${safeTheme},null);

window.addEventListener("message",function(e){
  if(!e.data||typeof e.data!=="object") return;
  if(e.data.type==="boom-ia-embed:theme"||e.data.type==="boom-ia-embed:init"){
    applyTheme(e.data.theme||${safeTheme},e.data.colors||null);
  }
});

function esc(s){return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");}
function switchTab(n,btn){
  document.querySelectorAll(".cw-panel").forEach(function(p){p.classList.remove("active");});
  document.querySelectorAll(".cw-tab").forEach(function(t){t.classList.remove("active");});
  var p=document.getElementById("panel-"+n); if(p) p.classList.add("active");
  if(btn) btn.classList.add("active");
}
function markDirty(){
  STATE.dirty=true;
  var btn=document.getElementById("save-btn");
  btn.disabled=false;
  btn.classList.add("cw-btn-ready");
  document.getElementById("save-ok").textContent="";
}
function setStatus(v){
  ["active","test","inactive"].forEach(function(s){
    var el=document.getElementById("so-"+s);
    if(el){el.classList.toggle("sel",s===v); var inp=el.querySelector("input"); if(inp) inp.checked=(s===v);}
  });
  STATE.currentStatus=v; markDirty(); updateHeaderBadge(v);
}
function statusLabel(v){return v==="active"?"Ativo":v==="test"?"Teste":"Inativo";}
function updateHeaderBadge(v){
  var hb=document.getElementById("header-badge");
  if(!hb) return;
  var s=v||STATE.currentStatus||"inactive";
  hb.innerHTML='<span class="cw-status-pill '+s+'"><span class="dot"></span>'+statusLabel(s)+"</span>";
}
function showAlert(msg,type){
  document.getElementById("alert-area").innerHTML='<div class="cw-alert cw-alert-'+(type||"warn")+'">'+esc(msg)+"</div>";
}
function cfg(k,fb){var c=STATE.agent?(STATE.agent.config||{}):{};return c[k]!=null?c[k]:(fb!==undefined?fb:"");}

function fillForm(agent){
  STATE.agent=agent;
  document.getElementById("header-title").textContent=agent.name||"Agente";
  document.getElementById("agent-meta").textContent=(agent.tenant_name||"")+" · "+(agent.provider_name||"")+" · "+(agent.model||"");
  var av=document.getElementById("agent-avatar");
  if(agent.avatar_url){av.src=agent.avatar_url;av.style.visibility="visible";}else av.style.visibility="hidden";
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
  document.getElementById("f-fu-intervals").value=Array.isArray(iv)?iv.join(", "):String(iv);
  document.getElementById("f-fu-quiet-start").value=String(cfg("followup_quiet_start","22:00"));
  document.getElementById("f-fu-quiet-end").value=String(cfg("followup_quiet_end","08:00"));
  var tl=document.getElementById("tools-list");
  if(agent.tools&&agent.tools.length){
    tl.innerHTML=agent.tools.map(function(t){
      return'<div class="cw-tool"><div><div class="cw-tool-name">'+esc(t.name)+'<span class="cw-tool-tag">'+esc(t.tool_type)+"</span></div>"+(t.description?'<div class="cw-tool-desc">'+esc(t.description)+"</div>":"")+"</div></div>";
    }).join("");
  } else tl.innerHTML='<span class="cw-empty">Sem tools vinculadas.</span>';
}

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
  btn.disabled=true; btn.innerHTML='<span class="cw-spinner" style="width:16px;height:16px;border-width:2px;display:inline-block;vertical-align:middle;margin-right:6px;"></span>Salvando…';
  ok.textContent=""; err.textContent="";
  var url=API_BASE+"/embed/chatwoot/agents/"+encodeURIComponent(STATE.agent.id)+"?account_id="+encodeURIComponent(ACCOUNT_ID)+"&key="+encodeURIComponent(KEY);
  fetch(url,{method:"PATCH",headers:{"Content-Type":"application/json","x-chatwoot-mirror-key":KEY},body:JSON.stringify(buildPayload())})
    .then(function(r){return r.json().then(function(j){return{ok:r.ok,j:j};});})
    .then(function(res){
      btn.textContent="Salvar alterações";
      if(!res.ok){btn.disabled=false;err.textContent=res.j.error||"Erro ao salvar";return;}
      STATE.dirty=false; btn.disabled=true; btn.classList.remove("cw-btn-ready");
      ok.textContent="Salvo ✓"; setTimeout(function(){ok.textContent="";},3000);
      if(res.j.agent) fillForm(res.j.agent);
    })
    .catch(function(e){btn.textContent="Salvar alterações";btn.disabled=false;err.textContent=e.message||"Erro de rede";});
}

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
