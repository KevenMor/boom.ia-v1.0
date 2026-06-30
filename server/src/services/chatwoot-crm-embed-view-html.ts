/** Página HTML standalone — perfil CRM completo no iframe do Mega (split conversa + abas). */
export function renderChatwootCrmEmbedViewHtml(
  apiBase: string,
  embedKey: string,
  accountId: string,
  contactId: string,
  theme: "dark" | "light" = "light",
): string {
  const safeApi = JSON.stringify(apiBase.replace(/\/+$/, ""));
  const safeKey = JSON.stringify(embedKey);
  const safeAccountId = JSON.stringify(accountId);
  const safeContactId = JSON.stringify(contactId);
  const safeTheme = JSON.stringify(theme);

  return `<!DOCTYPE html>
<html lang="pt-BR" data-theme="${theme}">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/>
  <title>Cadastro do cliente</title>
  <link rel="preconnect" href="https://fonts.googleapis.com"/>
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet"/>
  <style>
    :root,[data-theme="light"]{
      --bg:#fff;--surface:#fff;--surface-muted:#f8fafc;--border:#e5e7eb;
      --text:#111827;--text-muted:#6b7280;--brand:#1f93ff;--brand-hover:#1781e3;
      --success-soft:#dcfce7;--success-text:#15803d;--err:#ef4444;--input-bg:#fff;
    }
    [data-theme="dark"]{
      --bg:#0f1419;--surface:#1a1f26;--surface-muted:#232a33;--border:#2d3748;
      --text:#f3f4f6;--text-muted:#9ca3af;--brand:#3b9eff;--brand-hover:#60a5fa;
      --success-soft:rgba(74,222,128,.12);--success-text:#86efac;--err:#f87171;--input-bg:#1a1f26;
    }
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
    html,body{height:100%;}
    body{background:var(--bg);color:var(--text);font:14px/1.5 Inter,system-ui,sans-serif;}
    .cw-app{min-height:100dvh;display:flex;flex-direction:column;}
    .cw-shell{display:grid;grid-template-columns:minmax(260px,36%) 1fr;flex:1;min-height:0;}
    .cw-chat-col{border-right:1px solid var(--border);background:var(--surface-muted);display:flex;flex-direction:column;min-height:0;}
    .cw-chat-head{padding:10px 14px;border-bottom:1px solid var(--border);font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:var(--text-muted);}
    .cw-chat-msgs{flex:1;overflow:auto;padding:12px;display:flex;flex-direction:column;gap:8px;min-height:0;}
    .cw-bubble{max-width:94%;padding:8px 11px;border-radius:12px;font-size:13px;line-height:1.45;word-break:break-word;}
    .cw-bubble.in{align-self:flex-start;background:var(--surface);border:1px solid var(--border);}
    .cw-bubble.out{align-self:flex-end;background:var(--brand);color:#fff;}
    .cw-bubble time{display:block;font-size:10px;opacity:.7;margin-top:4px;}
    .cw-chat-foot{padding:10px 14px;border-top:1px solid var(--border);}
    .cw-chat-link{font-size:12px;color:var(--brand);text-decoration:none;font-weight:500;}
    .cw-main-col{display:flex;flex-direction:column;min-height:0;min-width:0;}
    .cw-header{padding:14px 16px;border-bottom:1px solid var(--border);background:var(--surface);display:flex;gap:12px;align-items:center;}
    .cw-avatar,.cw-avatar-fallback{width:48px;height:48px;border-radius:50%;flex-shrink:0;border:2px solid var(--border);}
    .cw-avatar{object-fit:cover;}
    .cw-avatar-fallback{display:flex;align-items:center;justify-content:center;background:var(--surface-muted);font-weight:600;color:var(--text-muted);}
    .cw-title h1{font-size:17px;font-weight:600;}
    .cw-title p{font-size:12px;color:var(--text-muted);margin-top:2px;}
    .cw-badge{display:inline-flex;padding:2px 8px;border-radius:999px;font-size:10px;font-weight:600;background:var(--success-soft);color:var(--success-text);margin-top:4px;}
    .cw-tabs{display:flex;gap:2px;padding:0 12px;border-bottom:1px solid var(--border);background:var(--surface);overflow-x:auto;scrollbar-width:thin;}
    .cw-tab{padding:10px 12px;border:0;background:none;cursor:pointer;font:inherit;font-size:12px;font-weight:500;color:var(--text-muted);border-bottom:2px solid transparent;white-space:nowrap;}
    .cw-tab.active{color:var(--text);border-bottom-color:var(--brand);}
    .cw-body{flex:1;overflow:auto;padding:16px;min-height:0;}
    .cw-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;}
    .cw-metric{padding:12px;border:1px solid var(--border);border-radius:10px;background:var(--surface);}
    .cw-metric span{display:block;font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.04em;}
    .cw-metric strong{display:block;margin-top:4px;font-size:16px;}
    .cw-field{margin-bottom:10px;}
    .cw-field label{display:block;font-size:11px;font-weight:500;color:var(--text-muted);margin-bottom:4px;}
    .cw-field input,.cw-field textarea{width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:8px;background:var(--input-bg);color:var(--text);font:inherit;}
    .cw-field textarea{min-height:80px;resize:vertical;}
    .cw-btn{padding:8px 14px;border-radius:8px;border:0;font:inherit;font-size:13px;font-weight:600;cursor:pointer;background:var(--brand);color:#fff;}
    .cw-btn:hover{background:var(--brand-hover);}
    .cw-btn:disabled{opacity:.6;cursor:not-allowed;}
    .cw-table{width:100%;border-collapse:collapse;font-size:13px;}
    .cw-table th,.cw-table td{padding:8px 10px;border-bottom:1px solid var(--border);text-align:left;vertical-align:top;}
    .cw-table th{font-size:11px;color:var(--text-muted);font-weight:600;text-transform:uppercase;}
    .cw-empty{padding:24px;text-align:center;color:var(--text-muted);font-size:13px;}
    .cw-pill{display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:600;background:var(--surface-muted);}
    .cw-alert{padding:12px;border-radius:10px;font-size:13px;}
    .cw-alert-err{background:rgba(239,68,68,.1);color:var(--err);}
    .cw-loading{padding:40px;text-align:center;color:var(--text-muted);}
    .cw-spinner{width:22px;height:22px;border:2px solid var(--border);border-top-color:var(--brand);border-radius:50%;animation:spin .8s linear infinite;margin:0 auto 10px;}
    @keyframes spin{to{transform:rotate(360deg);}}
    .cw-hidden{display:none!important;}
    .cw-msg-ok{font-size:12px;color:var(--success-text);margin-top:8px;}
    .cw-msg-err{font-size:12px;color:var(--err);margin-top:8px;}
    @media(max-width:860px){.cw-shell{grid-template-columns:1fr}.cw-chat-col{display:none}}
  </style>
</head>
<body>
  <div class="cw-app">
    <div id="loading-wrap" class="cw-loading"><div class="cw-spinner"></div>Carregando cadastro…</div>
    <div id="error-wrap" class="cw-body cw-hidden"></div>
    <div id="app-wrap" class="cw-hidden" style="display:flex;flex-direction:column;flex:1;min-height:100dvh;">
      <div class="cw-shell">
        <aside class="cw-chat-col">
          <div class="cw-chat-head">Conversa com o cliente</div>
          <div class="cw-chat-msgs" id="chat-msgs"><div class="cw-empty">Carregando mensagens…</div></div>
          <div class="cw-chat-foot"><a id="chat-woot-link" class="cw-chat-link cw-hidden" href="#" target="_blank" rel="noopener">Abrir conversa no Chatwoot ↗</a></div>
        </aside>
        <div class="cw-main-col">
          <header class="cw-header">
            <div id="avatar-wrap"></div>
            <div class="cw-title"><h1 id="c-name">—</h1><p id="c-phone">—</p><span class="cw-badge">Cliente CRM</span></div>
          </header>
          <nav class="cw-tabs" id="tabs">
            <button type="button" class="cw-tab active" data-tab="overview">Visão geral</button>
            <button type="button" class="cw-tab" data-tab="edit">Cadastro</button>
            <button type="button" class="cw-tab" data-tab="history">Conversas</button>
            <button type="button" class="cw-tab" data-tab="invoices">Faturas</button>
            <button type="button" class="cw-tab" data-tab="packages">Pacotes</button>
            <button type="button" class="cw-tab" data-tab="contracts">Contratos</button>
            <button type="button" class="cw-tab" data-tab="documents">Arquivos</button>
            <button type="button" class="cw-tab" data-tab="agenda">Agenda</button>
          </nav>
          <main class="cw-body" id="tab-body">
            <section id="tab-overview"><div class="cw-grid" id="metrics"></div><p id="c-notes-preview" style="margin-top:14px;color:var(--text-muted);font-size:13px;"></p></section>
            <section id="tab-edit" class="cw-hidden"><form id="edit-form">
              <div class="cw-field"><label>Nome</label><input id="f-name"/></div>
              <div class="cw-field"><label>E-mail</label><input id="f-email" type="email"/></div>
              <div class="cw-field"><label>Telefone</label><input id="f-phone"/></div>
              <div class="cw-field"><label>CPF/CNPJ</label><input id="f-cpf"/></div>
              <div class="cw-field"><label>Endereço</label><input id="f-address"/></div>
              <div class="cw-grid"><div class="cw-field"><label>Cidade</label><input id="f-city"/></div><div class="cw-field"><label>UF</label><input id="f-state" maxlength="2"/></div></div>
              <div class="cw-field"><label>CEP</label><input id="f-zip"/></div>
              <div class="cw-field"><label>Observações</label><textarea id="f-notes"></textarea></div>
              <button type="submit" class="cw-btn" id="save-btn">Salvar cadastro</button>
              <div id="save-ok" class="cw-msg-ok"></div><div id="save-err" class="cw-msg-err"></div>
            </form></section>
            <section id="tab-history" class="cw-hidden"><div id="history-full"></div></section>
            <section id="tab-invoices" class="cw-hidden"><div id="list-invoices"></div></section>
            <section id="tab-packages" class="cw-hidden"><div id="list-packages"></div></section>
            <section id="tab-contracts" class="cw-hidden"><div id="list-contracts"></div></section>
            <section id="tab-documents" class="cw-hidden"><div id="list-documents"></div></section>
            <section id="tab-agenda" class="cw-hidden"><div id="list-agenda"></div></section>
          </main>
        </div>
      </div>
    </div>
  </div>
  <script>
(function(){
  var API_BASE=${safeApi}, KEY=${safeKey}, ACCOUNT_ID=${safeAccountId}, CONTACT_ID=${safeContactId}, THEME=${safeTheme};
  var STATE={contact:null,summary:null,chat:null,loaded:{}};
  var TAB_IDS=["overview","edit","history","invoices","packages","contracts","documents","agenda"];

  function esc(s){return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");}
  function money(n){return "R$ "+Number(n||0).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2});}
  function fmtDate(iso){if(!iso)return "—";try{return new Date(iso).toLocaleString("pt-BR",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"});}catch(e){return iso;}}
  function fmtDay(iso){if(!iso)return "—";try{return new Date(iso).toLocaleDateString("pt-BR");}catch(e){return iso;}}
  function qs(){return "?account_id="+encodeURIComponent(ACCOUNT_ID)+"&key="+encodeURIComponent(KEY);}
  function api(path,opts){opts=opts||{};return fetch(API_BASE+path+qs(),Object.assign({headers:{"Content-Type":"application/json","x-chatwoot-mirror-key":KEY}},opts)).then(function(r){return r.json().then(function(j){return{ok:r.ok,j:j};});});}
  function base(path){return "/embed/chatwoot/crm/contacts/"+encodeURIComponent(CONTACT_ID)+path;}

  function setTheme(t){document.documentElement.setAttribute("data-theme",t==="dark"?"dark":"light");}
  setTheme(THEME);
  window.addEventListener("message",function(ev){if(ev.data&&ev.data.type==="boom-ia-embed:theme"&&ev.data.theme)setTheme(ev.data.theme);});

  function showError(msg){document.getElementById("loading-wrap").classList.add("cw-hidden");document.getElementById("app-wrap").classList.add("cw-hidden");var el=document.getElementById("error-wrap");el.classList.remove("cw-hidden");el.innerHTML='<div class="cw-alert cw-alert-err">'+esc(msg)+"</div>";}
  function initials(n){return String(n||"?").trim().split(/\\s+/).slice(0,2).map(function(p){return p[0]||"";}).join("").toUpperCase();}

  function renderChat(target, data){
    var msgs=(data&&data.messages)||[];
    if(!msgs.length){target.innerHTML='<div class="cw-empty">Nenhuma mensagem encontrada para este telefone.</div>';return;}
    target.innerHTML=msgs.map(function(m){
      var out=m.role==="assistant"||m.role==="agent";
      var text=String(m.content||"").replace(/^\\[Atendente:[^\\]]*\\]\\s*/,"").trim();
      if(!text)return "";
      return '<div class="cw-bubble '+(out?"out":"in")+'">'+esc(text)+'<time>'+esc(fmtDate(m.created_at))+'</time></div>';
    }).filter(Boolean).join("");
    target.scrollTop=target.scrollHeight;
  }

  function loadChat(){
    return api(base("/conversation-preview")).then(function(res){
      STATE.chat=res.ok?res.j:{messages:[]};
      renderChat(document.getElementById("chat-msgs"),STATE.chat);
      var link=document.getElementById("chat-woot-link");
      if(STATE.chat&&STATE.chat.chatwoot_url){link.href=STATE.chat.chatwoot_url;link.classList.remove("cw-hidden");}
      var hist=document.getElementById("history-full");
      if(hist)renderChat(hist,STATE.chat);
    });
  }

  function fillHeader(){
    var c=STATE.contact,w=document.getElementById("avatar-wrap");
    w.innerHTML=c.avatar_url?'<img class="cw-avatar" src="'+esc(c.avatar_url)+'" alt=""/>':'<div class="cw-avatar-fallback">'+esc(initials(c.name))+"</div>";
    document.getElementById("c-name").textContent=c.name||"Sem nome";
    document.getElementById("c-phone").textContent=c.phone?("+"+String(c.phone).replace(/^\\+/,"")):"Sem telefone";
  }

  function fillOverview(){
    var s=STATE.summary||{};
    document.getElementById("metrics").innerHTML=[["Faturado",money(s.total_invoiced)],["Pago",money(s.total_paid)],["Em atraso",money(s.total_overdue)],["Faturas",String(s.invoice_count||0)],["Pacotes ativos",String(s.active_packages||0)],["Próximos agend.",String(s.upcoming_appointments||0)]].map(function(r){return '<div class="cw-metric"><span>'+esc(r[0])+'</span><strong>'+esc(r[1])+"</strong></div>";}).join("");
    document.getElementById("c-notes-preview").textContent=(STATE.contact.notes||"").trim()||"Sem observações cadastradas.";
  }

  function fillForm(){
    var c=STATE.contact;
    document.getElementById("f-name").value=c.name||"";
    document.getElementById("f-email").value=c.email||"";
    document.getElementById("f-phone").value=c.phone||"";
    document.getElementById("f-cpf").value=c.cpf_cnpj||"";
    document.getElementById("f-address").value=c.address||"";
    document.getElementById("f-city").value=c.city||"";
    document.getElementById("f-state").value=c.state||"";
    document.getElementById("f-zip").value=c.zip_code||"";
    document.getElementById("f-notes").value=c.notes||"";
  }

  function tableHtml(rows, head, mapFn){
    if(!rows.length)return '<div class="cw-empty">Nenhum registro.</div>';
    return '<table class="cw-table"><thead><tr>'+head.map(function(h){return "<th>"+esc(h)+"</th>";}).join("")+'</tr></thead><tbody>'+rows.map(mapFn).join("")+"</tbody></table>";
  }

  function loadTab(tab){
    if(STATE.loaded[tab])return Promise.resolve();
    if(tab==="history"){STATE.loaded[tab]=true;if(STATE.chat)renderChat(document.getElementById("history-full"),STATE.chat);return Promise.resolve();}
    var map={invoices:"/invoices",packages:"/packages",contracts:"/contracts",documents:"/documents",agenda:"/appointments?upcoming=false"};
    if(!map[tab]){STATE.loaded[tab]=true;return Promise.resolve();}
    var el=document.getElementById("list-"+tab);
    el.innerHTML='<div class="cw-empty">Carregando…</div>';
    return api(base(map[tab])).then(function(res){
      STATE.loaded[tab]=true;
      if(!res.ok){el.innerHTML='<div class="cw-empty">'+esc(res.j.error||"Erro ao carregar")+"</div>";return;}
      var rows=res.j.data||[];
      if(tab==="invoices")el.innerHTML=tableHtml(rows,["Descrição","Valor","Vencimento","Status"],function(r){return "<tr><td>"+esc(r.description||"—")+"</td><td>"+money(r.amount)+"</td><td>"+fmtDay(r.due_date)+'</td><td><span class="cw-pill">'+esc(r.status)+"</span></td></tr>";});
      if(tab==="packages")el.innerHTML=tableHtml(rows,["Nome","Status","Início","Fim"],function(r){return "<tr><td>"+esc(r.name)+'</td><td><span class="cw-pill">'+esc(r.status)+"</span></td><td>"+fmtDay(r.start_date)+"</td><td>"+fmtDay(r.end_date)+"</td></tr>";});
      if(tab==="contracts")el.innerHTML=tableHtml(rows,["Título","Status","Início","Fim"],function(r){return "<tr><td>"+esc(r.title||r.name||"—")+'</td><td><span class="cw-pill">'+esc(r.status)+"</span></td><td>"+fmtDay(r.start_date)+"</td><td>"+fmtDay(r.end_date)+"</td></tr>";});
      if(tab==="documents")el.innerHTML=tableHtml(rows,["Nome","Categoria","Data"],function(r){var link=r.file_url?'<a href="'+esc(r.file_url)+'" target="_blank" rel="noopener">'+esc(r.name)+"</a>":esc(r.name);return "<tr><td>"+link+'</td><td><span class="cw-pill">'+esc(r.category)+"</span></td><td>"+fmtDay(r.created_at)+"</td></tr>";});
      if(tab==="agenda")el.innerHTML=tableHtml(rows,["Título","Início","Fim","Detalhes"],function(r){return "<tr><td>"+esc(r.title||"—")+"</td><td>"+fmtDate(r.start_at)+"</td><td>"+fmtDate(r.end_at)+"</td><td>"+esc(r.description||"—")+"</td></tr>";});
    });
  }

  function switchTab(tab){
    document.querySelectorAll(".cw-tab").forEach(function(el){el.classList.toggle("active",el.getAttribute("data-tab")===tab);});
    TAB_IDS.forEach(function(id){var el=document.getElementById("tab-"+id);if(el)el.classList.toggle("cw-hidden",id!==tab);});
    loadTab(tab);
  }

  function bindTabs(){
    document.getElementById("tabs").addEventListener("click",function(ev){
      var btn=ev.target.closest("[data-tab]");if(!btn)return;
      switchTab(btn.getAttribute("data-tab"));
    });
  }

  function bindSave(){
    document.getElementById("edit-form").addEventListener("submit",function(ev){
      ev.preventDefault();
      var btn=document.getElementById("save-btn"),ok=document.getElementById("save-ok"),err=document.getElementById("save-err");
      btn.disabled=true;ok.textContent="";err.textContent="";
      var body={name:document.getElementById("f-name").value.trim(),email:document.getElementById("f-email").value.trim()||null,phone:document.getElementById("f-phone").value.trim()||null,cpf_cnpj:document.getElementById("f-cpf").value.trim()||null,address:document.getElementById("f-address").value.trim()||null,city:document.getElementById("f-city").value.trim()||null,state:document.getElementById("f-state").value.trim()||null,zip_code:document.getElementById("f-zip").value.trim()||null,notes:document.getElementById("f-notes").value.trim()||null};
      api(base(""),{method:"PATCH",body:JSON.stringify(body)}).then(function(res){
        btn.disabled=false;
        if(!res.ok){err.textContent=res.j.error||"Erro ao salvar";return;}
        STATE.contact=res.j;fillHeader();fillOverview();fillForm();ok.textContent="Salvo com sucesso";setTimeout(function(){ok.textContent="";},2500);
      }).catch(function(e){btn.disabled=false;err.textContent=e.message||"Erro de rede";});
    });
  }

  function showApp(){
    document.getElementById("loading-wrap").classList.add("cw-hidden");
    document.getElementById("error-wrap").classList.add("cw-hidden");
    var app=document.getElementById("app-wrap");app.classList.remove("cw-hidden");app.style.display="flex";
    fillHeader();fillOverview();fillForm();bindTabs();bindSave();loadChat();
  }

  function load(){
    if(!KEY||!ACCOUNT_ID||!CONTACT_ID){showError("Parâmetros key, account_id ou contact_id ausentes.");return;}
    Promise.all([api(base("")),api(base("/summary"))]).then(function(r){
      if(!r[0].ok){showError(r[0].j.error||"Contato não encontrado");return;}
      STATE.contact=r[0].j;STATE.summary=r[1].ok?r[1].j:{};showApp();
    }).catch(function(e){showError(e.message||"Falha ao carregar CRM");});
  }
  load();
})();
  </script>
</body>
</html>`;
}
