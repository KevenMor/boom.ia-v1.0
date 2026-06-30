/** Página HTML standalone — perfil CRM completo no iframe do Mega (CRUD em todas as abas). */
export function renderChatwootCrmEmbedViewHtml(
  apiBase: string,
  embedKey: string,
  accountId: string,
  contactId: string,
  theme: "dark" | "light" = "light",
  nativeChrome = false,
): string {
  const safeApi = JSON.stringify(apiBase.replace(/\/+$/, ""));
  const safeKey = JSON.stringify(embedKey);
  const safeAccountId = JSON.stringify(accountId);
  const safeContactId = JSON.stringify(contactId);
  const safeTheme = JSON.stringify(theme);
  const native = nativeChrome;

  return `<!DOCTYPE html>
<html lang="pt-BR" data-theme="${theme}">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/>
  <title>Cadastro do cliente</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet"/>
  <style>
    :root,[data-theme="light"]{--bg:#ffffff;--surface:#ffffff;--surface-muted:#f8fafc;--border:#e5e7eb;--text:#111827;--text-muted:#6b7280;--brand:#1f93ff;--brand-hover:#1781e3;--success-soft:#dcfce7;--success-text:#15803d;--err:#ef4444;--input-bg:#fff;--danger:#dc2626;}
    [data-theme="dark"]{--bg:#1a1f26;--surface:#1a1f26;--surface-muted:#232a33;--border:#2d3748;--text:#f3f4f6;--text-muted:#9ca3af;--brand:#3b9eff;--brand-hover:#60a5fa;--success-soft:rgba(74,222,128,.12);--success-text:#86efac;--err:#f87171;--input-bg:#1a1f26;--danger:#f87171;}
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
    html,body{height:100%;background:var(--bg);}
    body{color:var(--text);font:14px/1.5 Inter,system-ui,sans-serif;}
    .cw-app{height:100%;min-height:100%;display:flex;flex-direction:column;background:var(--bg);}
    .cw-hint{padding:8px 16px;font-size:12px;color:var(--text-muted);background:var(--surface-muted);border-bottom:1px solid var(--border);}
    .cw-header{padding:14px 16px;border-bottom:1px solid var(--border);display:flex;gap:12px;align-items:center;}
    .cw-header-compact{padding:10px 12px;}
    .cw-avatar,.cw-avatar-fallback{width:48px;height:48px;border-radius:50%;flex-shrink:0;border:2px solid var(--border);}
    .cw-avatar{object-fit:cover;}.cw-avatar-fallback{display:flex;align-items:center;justify-content:center;background:var(--surface-muted);font-weight:600;color:var(--text-muted);}
    .cw-title h1{font-size:17px;font-weight:600;}.cw-title p{font-size:12px;color:var(--text-muted);margin-top:2px;}
    .cw-badge{display:inline-flex;padding:2px 8px;border-radius:999px;font-size:10px;font-weight:600;background:var(--success-soft);color:var(--success-text);margin-top:4px;}
    .cw-tabs{display:flex;gap:2px;padding:0 12px;border-bottom:1px solid var(--border);overflow-x:auto;scrollbar-width:thin;}
    .cw-tab{padding:10px 12px;border:0;background:none;cursor:pointer;font:inherit;font-size:12px;font-weight:500;color:var(--text-muted);border-bottom:2px solid transparent;white-space:nowrap;}
    .cw-tab.active{color:var(--text);border-bottom-color:var(--brand);}
    .cw-body{flex:1;overflow:auto;padding:16px;min-height:0;}
    .cw-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;}
    .cw-grid-3{grid-template-columns:repeat(3,minmax(0,1fr));}
    .cw-metric{padding:12px;border:1px solid var(--border);border-radius:10px;}
    .cw-metric span{display:block;font-size:10px;color:var(--text-muted);text-transform:uppercase;}
    .cw-metric strong{display:block;margin-top:4px;font-size:16px;}
    .cw-field{margin-bottom:10px;}.cw-field label{display:block;font-size:11px;font-weight:500;color:var(--text-muted);margin-bottom:4px;}
    .cw-field input,.cw-field textarea,.cw-field select{width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:8px;background:var(--input-bg);color:var(--text);font:inherit;}
    .cw-field textarea{min-height:72px;resize:vertical;}
    .cw-btn{padding:8px 14px;border-radius:8px;border:0;font:inherit;font-size:13px;font-weight:600;cursor:pointer;background:var(--brand);color:#fff;}
    .cw-btn:hover{background:var(--brand-hover);}.cw-btn:disabled{opacity:.6;cursor:not-allowed;}
    .cw-btn-sm{padding:5px 10px;font-size:12px;}.cw-btn-ghost{background:transparent;border:1px solid var(--border);color:var(--text);}
    .cw-btn-danger{background:transparent;border:1px solid var(--danger);color:var(--danger);}
    .cw-card{margin-bottom:14px;padding:14px;border:1px solid var(--border);border-radius:10px;background:var(--surface-muted);}
    .cw-card h3{font-size:13px;font-weight:600;margin-bottom:10px;}
    .cw-toolbar{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;gap:8px;}
    .cw-toolbar p{font-size:12px;color:var(--text-muted);}
    .cw-table{width:100%;border-collapse:collapse;font-size:13px;}
    .cw-table th,.cw-table td{padding:8px 10px;border-bottom:1px solid var(--border);text-align:left;vertical-align:top;}
    .cw-table th{font-size:11px;color:var(--text-muted);font-weight:600;text-transform:uppercase;}
    .cw-empty{padding:24px;text-align:center;color:var(--text-muted);font-size:13px;}
    .cw-pill{display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:600;background:var(--surface-muted);}
    .cw-bubble{max-width:92%;padding:8px 11px;border-radius:12px;font-size:13px;margin-bottom:8px;word-break:break-word;}
    .cw-bubble.in{background:var(--surface);border:1px solid var(--border);}.cw-bubble.out{margin-left:auto;background:var(--brand);color:#fff;}
    .cw-bubble time{display:block;font-size:10px;opacity:.7;margin-top:4px;}
    .cw-actions{display:flex;gap:6px;flex-wrap:wrap;}
    .cw-alert{padding:12px;border-radius:10px;font-size:13px;background:rgba(239,68,68,.1);color:var(--err);}
    .cw-loading{padding:40px;text-align:center;color:var(--text-muted);}
    .cw-spinner{width:22px;height:22px;border:2px solid var(--border);border-top-color:var(--brand);border-radius:50%;animation:spin .8s linear infinite;margin:0 auto 10px;}
    @keyframes spin{to{transform:rotate(360deg);}}
    .cw-hidden{display:none!important;}.cw-msg-ok{font-size:12px;color:var(--success-text);margin-top:8px;}.cw-msg-err{font-size:12px;color:var(--err);margin-top:8px;}
  </style>
</head>
<body>
  <div class="cw-app">
    <div id="loading-wrap" class="cw-loading"><div class="cw-spinner"></div>Carregando cadastro…</div>
    <div id="error-wrap" class="cw-body cw-hidden"></div>
    <div id="app-wrap" class="cw-hidden" style="display:flex;flex-direction:column;flex:1;min-height:0;height:100%;">
      ${native ? "" : '<p class="cw-hint">Responda ao cliente pelo chat à esquerda — aqui você gerencia o cadastro.</p>'}
      <header class="cw-header${native ? " cw-header-compact" : ""}">
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
        <section id="tab-invoices" class="cw-hidden"><div id="panel-invoices"></div></section>
        <section id="tab-packages" class="cw-hidden"><div id="panel-packages"></div></section>
        <section id="tab-contracts" class="cw-hidden"><div id="panel-contracts"></div></section>
        <section id="tab-documents" class="cw-hidden"><div id="panel-documents"></div></section>
        <section id="tab-agenda" class="cw-hidden"><div id="panel-agenda"></div></section>
      </main>
    </div>
  </div>
  <script>
(function(){
  var API_BASE=${safeApi}, KEY=${safeKey}, ACCOUNT_ID=${safeAccountId}, CONTACT_ID=${safeContactId}, THEME=${safeTheme};
  var STATE={contact:null,summary:null,calendars:[],editing:{}};
  var TAB_IDS=["overview","edit","history","invoices","packages","contracts","documents","agenda"];

  function esc(s){return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");}
  function money(n){return "R$ "+Number(n||0).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2});}
  function fmtDate(iso){if(!iso)return "—";try{return new Date(iso).toLocaleString("pt-BR",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"});}catch(e){return iso;}}
  function fmtDay(iso){if(!iso)return "—";try{return new Date(iso).toLocaleDateString("pt-BR");}catch(e){return iso;}}
  function qs(){return "?account_id="+encodeURIComponent(ACCOUNT_ID)+"&key="+encodeURIComponent(KEY);}
  function api(path,opts){opts=opts||{};return fetch(API_BASE+path+qs(),Object.assign({headers:{"Content-Type":"application/json","x-chatwoot-mirror-key":KEY}},opts)).then(function(r){return r.json().then(function(j){return{ok:r.ok,j:j};});});}
  function base(sub){return "/embed/chatwoot/crm/contacts/"+encodeURIComponent(CONTACT_ID)+sub;}
  function val(id){var el=document.getElementById(id);return el?el.value.trim():"";}
  function setTheme(t){document.documentElement.setAttribute("data-theme",t==="dark"?"dark":"light");}
  setTheme(THEME);
  window.addEventListener("message",function(ev){if(ev.data&&ev.data.type==="boom-ia-embed:theme"&&ev.data.theme)setTheme(ev.data.theme);});

  function showError(msg){document.getElementById("loading-wrap").classList.add("cw-hidden");document.getElementById("app-wrap").classList.add("cw-hidden");var el=document.getElementById("error-wrap");el.classList.remove("cw-hidden");el.innerHTML='<div class="cw-alert">'+esc(msg)+"</div>";}
  function initials(n){return String(n||"?").trim().split(/\\s+/).slice(0,2).map(function(p){return p[0]||"";}).join("").toUpperCase();}
  function refreshSummary(){return api(base("/summary")).then(function(res){if(res.ok)STATE.summary=res.j;fillOverview();});}

  function renderChat(target,data){
    var msgs=(data&&data.messages)||[];
    if(!msgs.length){target.innerHTML='<div class="cw-empty">Nenhuma mensagem no histórico deste telefone.</div>';return;}
    target.innerHTML=msgs.map(function(m){
      var out=m.role==="assistant"||m.role==="agent";
      var text=String(m.content||"").replace(/^\\[Atendente:[^\\]]*\\]\\s*/,"").trim();
      if(!text)return "";
      return '<div class="cw-bubble '+(out?"out":"in")+'">'+esc(text)+'<time>'+esc(fmtDate(m.created_at))+'</time></div>';
    }).filter(Boolean).join("");
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

  function tableHtml(rows,head,mapFn,actions){
    if(!rows.length)return '<div class="cw-empty">Nenhum registro.</div>';
    return '<table class="cw-table"><thead><tr>'+head.map(function(h){return "<th>"+esc(h)+"</th>";}).join("")+(actions?"<th></th>":"")+'</tr></thead><tbody>'+rows.map(function(r,i){return mapFn(r,i);}).join("")+"</tbody></table>";
  }

  function selectOpts(items,valKey,labelKey,selected){
    return (items||[]).map(function(it){var v=it[valKey],sel=selected===v?" selected":"";return '<option value="'+esc(v)+'"'+sel+'>'+esc(it[labelKey])+"</option>";}).join("");
  }

  function bindPanel(el,html,onBind){
    el.innerHTML=html;
    if(onBind)onBind(el);
  }

  function renderInvoices(){
    var el=document.getElementById("panel-invoices");
    el.innerHTML='<div class="cw-empty">Carregando…</div>';
    api(base("/invoices")).then(function(res){
      if(!res.ok){el.innerHTML='<div class="cw-empty">'+esc(res.j.error||"Erro")+"</div>";return;}
      var rows=res.j.data||[],ed=STATE.editing.invoices;
      var form='<div class="cw-card"><h3>'+(ed?"Editar fatura":"Nova fatura")+'</h3><form id="form-invoice">'+
        '<div class="cw-field"><label>Descrição</label><input id="inv-desc" value="'+esc(ed?ed.description||"":"")+'"/></div>'+
        '<div class="cw-grid"><div class="cw-field"><label>Valor (R$)</label><input id="inv-amount" type="number" step="0.01" min="0" value="'+esc(ed?ed.amount||"":"")+'"/></div>'+
        '<div class="cw-field"><label>Vencimento</label><input id="inv-due" type="date" value="'+esc(ed?(ed.due_date||"").slice(0,10):"")+'"/></div></div>'+
        '<div class="cw-field"><label>Status</label><select id="inv-status"><option value="pending">Pendente</option><option value="paid">Pago</option><option value="overdue">Em atraso</option><option value="cancelled">Cancelado</option></select></div>'+
        '<div class="cw-actions"><button type="submit" class="cw-btn cw-btn-sm">'+(ed?"Salvar":"Adicionar")+'</button>'+(ed?'<button type="button" class="cw-btn cw-btn-sm cw-btn-ghost" id="inv-cancel">Cancelar</button>':"")+'</div><div id="inv-msg" class="cw-msg-err"></div></form></div>';
      var list=tableHtml(rows,["Descrição","Valor","Vencimento","Status"],function(r){
        return "<tr><td>"+esc(r.description||"—")+"</td><td>"+money(r.amount)+"</td><td>"+fmtDay(r.due_date)+'</td><td><span class="cw-pill">'+esc(r.status)+'</span></td><td><div class="cw-actions"><button type="button" class="cw-btn cw-btn-sm cw-btn-ghost" data-edit-inv="'+esc(r.id)+'">Editar</button><button type="button" class="cw-btn cw-btn-sm cw-btn-danger" data-del-inv="'+esc(r.id)+'">Excluir</button></div></td></tr>';
      },true);
      bindPanel(el,form+'<div class="cw-toolbar"><p>'+rows.length+' fatura(s)</p></div>'+list,function(root){
        if(ed){var sel=root.querySelector("#inv-status");if(sel)sel.value=ed.status||"pending";}
        root.querySelector("#form-invoice").addEventListener("submit",function(ev){
          ev.preventDefault();
          var body={description:val("inv-desc")||null,amount:Number(val("inv-amount")),due_date:val("inv-due"),status:val("inv-status")||"pending"};
          var p=ed?api(base("/invoices/"+ed.id),{method:"PATCH",body:JSON.stringify(body)}):api(base("/invoices"),{method:"POST",body:JSON.stringify(body)});
          p.then(function(r){if(!r.ok){root.querySelector("#inv-msg").textContent=r.j.error||"Erro";return;}STATE.editing.invoices=null;refreshSummary();renderInvoices();});
        });
        var cancel=root.querySelector("#inv-cancel");if(cancel)cancel.addEventListener("click",function(){STATE.editing.invoices=null;renderInvoices();});
        root.querySelectorAll("[data-edit-inv]").forEach(function(btn){btn.addEventListener("click",function(){var id=btn.getAttribute("data-edit-inv");STATE.editing.invoices=rows.find(function(x){return x.id===id;})||null;renderInvoices();});});
        root.querySelectorAll("[data-del-inv]").forEach(function(btn){btn.addEventListener("click",function(){if(!confirm("Excluir esta fatura?"))return;api(base("/invoices/"+btn.getAttribute("data-del-inv")),{method:"DELETE"}).then(function(){refreshSummary();renderInvoices();});});});
      });
    });
  }

  function renderPackages(){
    var el=document.getElementById("panel-packages");
    el.innerHTML='<div class="cw-empty">Carregando…</div>';
    api(base("/packages")).then(function(res){
      if(!res.ok){el.innerHTML='<div class="cw-empty">'+esc(res.j.error||"Erro")+"</div>";return;}
      var rows=res.j.data||[],ed=STATE.editing.packages;
      var form='<div class="cw-card"><h3>'+(ed?"Editar pacote":"Novo pacote")+'</h3><form id="form-pkg">'+
        '<div class="cw-field"><label>Nome</label><input id="pkg-name" value="'+esc(ed?ed.name||"":"")+'"/></div>'+
        '<div class="cw-field"><label>Descrição</label><textarea id="pkg-desc">'+esc(ed?ed.description||"":"")+'</textarea></div>'+
        '<div class="cw-grid cw-grid-3"><div class="cw-field"><label>Status</label><select id="pkg-status"><option value="active">Ativo</option><option value="paused">Pausado</option><option value="completed">Concluído</option><option value="cancelled">Cancelado</option></select></div>'+
        '<div class="cw-field"><label>Valor</label><input id="pkg-price" type="number" step="0.01" value="'+esc(ed&&ed.price!=null?ed.price:"")+'"/></div>'+
        '<div class="cw-field"><label>Sessões</label><input id="pkg-sessions" type="number" min="1" value="'+esc(ed&&ed.sessions_total!=null?ed.sessions_total:"")+'"/></div></div>'+
        '<div class="cw-grid"><div class="cw-field"><label>Início</label><input id="pkg-start" type="date" value="'+esc(ed&&ed.start_date?ed.start_date.slice(0,10):"")+'"/></div>'+
        '<div class="cw-field"><label>Fim</label><input id="pkg-end" type="date" value="'+esc(ed&&ed.end_date?ed.end_date.slice(0,10):"")+'"/></div></div>'+
        '<div class="cw-actions"><button type="submit" class="cw-btn cw-btn-sm">'+(ed?"Salvar":"Adicionar")+'</button>'+(ed?'<button type="button" class="cw-btn cw-btn-sm cw-btn-ghost" id="pkg-cancel">Cancelar</button>':"")+'</div></form></div>';
      var list=tableHtml(rows,["Nome","Status","Valor","Período"],function(r){
        return "<tr><td>"+esc(r.name)+'</td><td><span class="cw-pill">'+esc(r.status)+"</span></td><td>"+(r.price!=null?money(r.price):"—")+"</td><td>"+fmtDay(r.start_date)+" – "+fmtDay(r.end_date)+'</td><td><div class="cw-actions"><button type="button" class="cw-btn cw-btn-sm cw-btn-ghost" data-edit-pkg="'+esc(r.id)+'">Editar</button><button type="button" class="cw-btn cw-btn-sm cw-btn-danger" data-del-pkg="'+esc(r.id)+'">Excluir</button></div></td></tr>';
      },true);
      bindPanel(el,form+'<div class="cw-toolbar"><p>'+rows.length+' pacote(s)</p></div>'+list,function(root){
        if(ed){var s=root.querySelector("#pkg-status");if(s)s.value=ed.status||"active";}
        root.querySelector("#form-pkg").addEventListener("submit",function(ev){
          ev.preventDefault();
          var body={name:val("pkg-name"),description:val("pkg-desc")||null,status:val("pkg-status")||"active",price:val("pkg-price")?Number(val("pkg-price")):null,sessions_total:val("pkg-sessions")?Number(val("pkg-sessions")):null,start_date:val("pkg-start")||null,end_date:val("pkg-end")||null};
          var p=ed?api(base("/packages/"+ed.id),{method:"PATCH",body:JSON.stringify(body)}):api(base("/packages"),{method:"POST",body:JSON.stringify(body)});
          p.then(function(r){if(!r.ok)return;STATE.editing.packages=null;refreshSummary();renderPackages();});
        });
        var c=root.querySelector("#pkg-cancel");if(c)c.addEventListener("click",function(){STATE.editing.packages=null;renderPackages();});
        root.querySelectorAll("[data-edit-pkg]").forEach(function(btn){btn.addEventListener("click",function(){STATE.editing.packages=rows.find(function(x){return x.id===btn.getAttribute("data-edit-pkg");})||null;renderPackages();});});
        root.querySelectorAll("[data-del-pkg]").forEach(function(btn){btn.addEventListener("click",function(){if(!confirm("Excluir pacote?"))return;api(base("/packages/"+btn.getAttribute("data-del-pkg")),{method:"DELETE"}).then(function(){refreshSummary();renderPackages();});});});
      });
    });
  }

  function renderContracts(){
    var el=document.getElementById("panel-contracts");
    el.innerHTML='<div class="cw-empty">Carregando…</div>';
    api(base("/contracts")).then(function(res){
      if(!res.ok){el.innerHTML='<div class="cw-empty">'+esc(res.j.error||"Erro")+"</div>";return;}
      var rows=res.j.data||[],ed=STATE.editing.contracts;
      var form='<div class="cw-card"><h3>'+(ed?"Editar contrato":"Novo contrato")+'</h3><form id="form-ctr">'+
        '<div class="cw-field"><label>Título</label><input id="ctr-title" value="'+esc(ed?ed.title||"":"")+'"/></div>'+
        '<div class="cw-grid"><div class="cw-field"><label>Número</label><input id="ctr-num" value="'+esc(ed?ed.contract_number||"":"")+'"/></div>'+
        '<div class="cw-field"><label>Status</label><select id="ctr-status"><option value="draft">Rascunho</option><option value="active">Ativo</option><option value="expired">Expirado</option><option value="cancelled">Cancelado</option><option value="suspended">Suspenso</option></select></div></div>'+
        '<div class="cw-grid cw-grid-3"><div class="cw-field"><label>Início</label><input id="ctr-start" type="date" value="'+esc(ed&&ed.start_date?ed.start_date.slice(0,10):"")+'"/></div>'+
        '<div class="cw-field"><label>Fim</label><input id="ctr-end" type="date" value="'+esc(ed&&ed.end_date?ed.end_date.slice(0,10):"")+'"/></div>'+
        '<div class="cw-field"><label>Valor</label><input id="ctr-value" type="number" step="0.01" value="'+esc(ed&&ed.value!=null?ed.value:"")+'"/></div></div>'+
        '<div class="cw-field"><label>Condições de pagamento</label><input id="ctr-pay" value="'+esc(ed?ed.payment_terms||"":"")+'"/></div>'+
        '<div class="cw-field"><label>URL do documento</label><input id="ctr-url" value="'+esc(ed?ed.document_url||"":"")+'"/></div>'+
        '<div class="cw-field"><label>Descrição</label><textarea id="ctr-desc">'+esc(ed?ed.description||"":"")+'</textarea></div>'+
        '<div class="cw-actions"><button type="submit" class="cw-btn cw-btn-sm">'+(ed?"Salvar":"Adicionar")+'</button>'+(ed?'<button type="button" class="cw-btn cw-btn-sm cw-btn-ghost" id="ctr-cancel">Cancelar</button>':"")+'</div></form></div>';
      var list=tableHtml(rows,["Título","Status","Valor","Período"],function(r){
        return "<tr><td>"+esc(r.title||"—")+'</td><td><span class="cw-pill">'+esc(r.status)+"</span></td><td>"+(r.value!=null?money(r.value):"—")+"</td><td>"+fmtDay(r.start_date)+" – "+fmtDay(r.end_date)+'</td><td><div class="cw-actions"><button type="button" class="cw-btn cw-btn-sm cw-btn-ghost" data-edit-ctr="'+esc(r.id)+'">Editar</button><button type="button" class="cw-btn cw-btn-sm cw-btn-danger" data-del-ctr="'+esc(r.id)+'">Excluir</button></div></td></tr>';
      },true);
      bindPanel(el,form+'<div class="cw-toolbar"><p>'+rows.length+' contrato(s)</p></div>'+list,function(root){
        if(ed){var s=root.querySelector("#ctr-status");if(s)s.value=ed.status||"draft";}
        root.querySelector("#form-ctr").addEventListener("submit",function(ev){
          ev.preventDefault();
          var body={title:val("ctr-title"),contract_number:val("ctr-num")||null,status:val("ctr-status")||"draft",start_date:val("ctr-start")||null,end_date:val("ctr-end")||null,value:val("ctr-value")?Number(val("ctr-value")):null,payment_terms:val("ctr-pay")||null,document_url:val("ctr-url")||null,description:val("ctr-desc")||null};
          var p=ed?api(base("/contracts/"+ed.id),{method:"PATCH",body:JSON.stringify(body)}):api(base("/contracts"),{method:"POST",body:JSON.stringify(body)});
          p.then(function(r){if(!r.ok)return;STATE.editing.contracts=null;renderContracts();});
        });
        var c=root.querySelector("#ctr-cancel");if(c)c.addEventListener("click",function(){STATE.editing.contracts=null;renderContracts();});
        root.querySelectorAll("[data-edit-ctr]").forEach(function(btn){btn.addEventListener("click",function(){STATE.editing.contracts=rows.find(function(x){return x.id===btn.getAttribute("data-edit-ctr");})||null;renderContracts();});});
        root.querySelectorAll("[data-del-ctr]").forEach(function(btn){btn.addEventListener("click",function(){if(!confirm("Excluir contrato?"))return;api(base("/contracts/"+btn.getAttribute("data-del-ctr")),{method:"DELETE"}).then(renderContracts);});});
      });
    });
  }

  function renderDocuments(){
    var el=document.getElementById("panel-documents");
    el.innerHTML='<div class="cw-empty">Carregando…</div>';
    api(base("/documents")).then(function(res){
      if(!res.ok){el.innerHTML='<div class="cw-empty">'+esc(res.j.error||"Erro")+"</div>";return;}
      var rows=res.j.data||[];
      var form='<div class="cw-card"><h3>Enviar arquivo</h3><form id="form-doc">'+
        '<div class="cw-field"><label>Arquivo</label><input id="doc-file" type="file"/></div>'+
        '<div class="cw-field"><label>Nome</label><input id="doc-name"/></div>'+
        '<div class="cw-field"><label>Categoria</label><select id="doc-cat"><option value="geral">Geral</option><option value="contrato">Contrato</option><option value="identidade">Identidade</option><option value="comprovante">Comprovante</option><option value="outro">Outro</option></select></div>'+
        '<div class="cw-field"><label>Observações</label><textarea id="doc-notes"></textarea></div>'+
        '<button type="submit" class="cw-btn cw-btn-sm">Enviar arquivo</button><div id="doc-msg" class="cw-msg-err"></div></form></div>';
      var list=tableHtml(rows,["Nome","Categoria","Data"],function(r){
        var link=r.file_url?'<a href="'+esc(r.file_url)+'" target="_blank" rel="noopener">'+esc(r.name)+"</a>":esc(r.name);
        return "<tr><td>"+link+'</td><td><span class="cw-pill">'+esc(r.category)+"</span></td><td>"+fmtDay(r.created_at)+'</td><td><button type="button" class="cw-btn cw-btn-sm cw-btn-danger" data-del-doc="'+esc(r.id)+'">Excluir</button></td></tr>';
      },true);
      bindPanel(el,form+'<div class="cw-toolbar"><p>'+rows.length+' arquivo(s)</p></div>'+list,function(root){
        var fileInput=root.querySelector("#doc-file");
        fileInput.addEventListener("change",function(){var f=fileInput.files&&fileInput.files[0];if(f&&!val("doc-name"))document.getElementById("doc-name").value=f.name.replace(/\\.[^.]+$/,"");});
        root.querySelector("#form-doc").addEventListener("submit",function(ev){
          ev.preventDefault();
          var f=fileInput.files&&fileInput.files[0],msg=root.querySelector("#doc-msg");
          if(!f){msg.textContent="Selecione um arquivo";return;}
          if(f.size>50*1024*1024){msg.textContent="Máximo 50 MB";return;}
          var reader=new FileReader();
          reader.onload=function(){
            api(base("/documents/upload"),{method:"POST",body:JSON.stringify({file_base64:reader.result,file_name:f.name,file_type:f.type,name:val("doc-name")||f.name,category:val("doc-cat")||"geral",notes:val("doc-notes")||null})}).then(function(r){
              if(!r.ok){msg.textContent=r.j.error||"Erro no upload";return;}
              fileInput.value="";renderDocuments();
            });
          };
          reader.readAsDataURL(f);
        });
        root.querySelectorAll("[data-del-doc]").forEach(function(btn){btn.addEventListener("click",function(){if(!confirm("Excluir arquivo?"))return;api(base("/documents/"+btn.getAttribute("data-del-doc")),{method:"DELETE"}).then(renderDocuments);});});
      });
    });
  }

  function renderAgenda(){
    var el=document.getElementById("panel-agenda");
    el.innerHTML='<div class="cw-empty">Carregando…</div>';
    Promise.all([api(base("/appointments?upcoming=false")),api(base("/calendars"))]).then(function(rs){
      if(!rs[0].ok){el.innerHTML='<div class="cw-empty">'+esc(rs[0].j.error||"Erro")+"</div>";return;}
      STATE.calendars=rs[1].ok?(rs[1].j.data||[]):[];
      var rows=rs[0].j.data||[];
      var calOpts='<option value="">Selecione o calendário</option>'+selectOpts(STATE.calendars,"id","name","");
      var form='<div class="cw-card"><h3>Novo agendamento</h3><form id="form-ag">'+
        '<div class="cw-field"><label>Título</label><input id="ag-title" value="Agendamento"/></div>'+
        '<div class="cw-field"><label>Calendário / profissional</label><select id="ag-cal">'+calOpts+'</select></div>'+
        '<div class="cw-grid"><div class="cw-field"><label>Início</label><input id="ag-start" type="datetime-local"/></div>'+
        '<div class="cw-field"><label>Fim</label><input id="ag-end" type="datetime-local"/></div></div>'+
        '<div class="cw-field"><label>Descrição</label><textarea id="ag-desc"></textarea></div>'+
        '<button type="submit" class="cw-btn cw-btn-sm">Agendar</button><div id="ag-msg" class="cw-msg-err"></div></form></div>';
      var list=tableHtml(rows,["Título","Início","Fim","Descrição"],function(r){
        return "<tr><td>"+esc(r.title||"—")+"</td><td>"+fmtDate(r.start_at)+"</td><td>"+fmtDate(r.end_at)+"</td><td>"+esc(r.description||"—")+'</td><td><button type="button" class="cw-btn cw-btn-sm cw-btn-danger" data-del-ag="'+esc(r.id)+'">Remover</button></td></tr>';
      },true);
      bindPanel(el,form+'<div class="cw-toolbar"><p>'+rows.length+' evento(s)</p></div>'+list,function(root){
        root.querySelector("#form-ag").addEventListener("submit",function(ev){
          ev.preventDefault();
          var cal=val("ag-cal"),start=val("ag-start"),end=val("ag-end"),msg=root.querySelector("#ag-msg");
          if(!cal||!start){msg.textContent="Calendário e início são obrigatórios";return;}
          var body={title:val("ag-title")||"Agendamento",description:val("ag-desc")||null,calendar_id:cal,start_at:new Date(start).toISOString(),end_at:end?new Date(end).toISOString():new Date(new Date(start).getTime()+3600000).toISOString()};
          api(base("/appointments"),{method:"POST",body:JSON.stringify(body)}).then(function(r){if(!r.ok){msg.textContent=r.j.error||"Erro";return;}refreshSummary();renderAgenda();});
        });
        root.querySelectorAll("[data-del-ag]").forEach(function(btn){btn.addEventListener("click",function(){if(!confirm("Remover vínculo deste agendamento?"))return;api(base("/appointments/"+btn.getAttribute("data-del-ag")),{method:"DELETE"}).then(function(){refreshSummary();renderAgenda();});});});
      });
    });
  }

  function loadTab(tab){
    if(tab==="history")return api(base("/conversation-preview")).then(function(res){renderChat(document.getElementById("history-full"),res.ok?res.j:{messages:[]});});
    if(tab==="invoices")return renderInvoices();
    if(tab==="packages")return renderPackages();
    if(tab==="contracts")return renderContracts();
    if(tab==="documents")return renderDocuments();
    if(tab==="agenda")return renderAgenda();
    return Promise.resolve();
  }

  function switchTab(tab){
    document.querySelectorAll(".cw-tab").forEach(function(el){el.classList.toggle("active",el.getAttribute("data-tab")===tab);});
    TAB_IDS.forEach(function(id){var el=document.getElementById("tab-"+id);if(el)el.classList.toggle("cw-hidden",id!==tab);});
    loadTab(tab);
  }

  function bindTabs(){document.getElementById("tabs").addEventListener("click",function(ev){var btn=ev.target.closest("[data-tab]");if(!btn)return;switchTab(btn.getAttribute("data-tab"));});}
  function bindSave(){
    document.getElementById("edit-form").addEventListener("submit",function(ev){
      ev.preventDefault();
      var btn=document.getElementById("save-btn"),ok=document.getElementById("save-ok"),err=document.getElementById("save-err");
      btn.disabled=true;ok.textContent="";err.textContent="";
      var body={name:val("f-name"),email:val("f-email")||null,phone:val("f-phone")||null,cpf_cnpj:val("f-cpf")||null,address:val("f-address")||null,city:val("f-city")||null,state:val("f-state")||null,zip_code:val("f-zip")||null,notes:val("f-notes")||null};
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
    fillHeader();fillOverview();fillForm();bindTabs();bindSave();
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
