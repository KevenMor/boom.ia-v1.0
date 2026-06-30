/** Página HTML standalone — cadastro CRM no iframe do Mega (mesmo padrão do espelho do agente). */
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
      --bg:#ffffff;--surface:#ffffff;--surface-muted:#f8fafc;
      --border:#e5e7eb;--text:#111827;--text-muted:#6b7280;
      --brand:#1f93ff;--brand-hover:#1781e3;--success-soft:#dcfce7;--success-text:#15803d;
      --err:#ef4444;--input-bg:#ffffff;
    }
    [data-theme="dark"]{
      --bg:#0f1419;--surface:#1a1f26;--surface-muted:#232a33;
      --border:#2d3748;--text:#f3f4f6;--text-muted:#9ca3af;
      --brand:#3b9eff;--brand-hover:#60a5fa;--success-soft:rgba(74,222,128,.12);--success-text:#86efac;
      --err:#f87171;--input-bg:#1a1f26;
    }
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
    html,body{height:100%;min-height:100%;}
    body{background:var(--bg);color:var(--text);font:14px/1.5 Inter,system-ui,sans-serif;-webkit-font-smoothing:antialiased;}
    .cw-app{min-height:100dvh;display:flex;flex-direction:column;}
    .cw-header{padding:16px 18px;border-bottom:1px solid var(--border);background:var(--surface);display:flex;gap:14px;align-items:center;}
    .cw-avatar{width:56px;height:56px;border-radius:50%;object-fit:cover;background:var(--surface-muted);border:2px solid var(--border);flex-shrink:0;}
    .cw-avatar-fallback{width:56px;height:56px;border-radius:50%;background:var(--surface-muted);border:2px solid var(--border);display:flex;align-items:center;justify-content:center;font-weight:600;color:var(--text-muted);flex-shrink:0;}
    .cw-title h1{font-size:18px;font-weight:600;line-height:1.25;}
    .cw-title p{font-size:13px;color:var(--text-muted);margin-top:2px;}
    .cw-badge{display:inline-flex;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:600;background:var(--success-soft);color:var(--success-text);margin-top:6px;}
    .cw-tabs{display:flex;gap:4px;padding:0 18px;border-bottom:1px solid var(--border);background:var(--surface);overflow-x:auto;}
    .cw-tab{padding:12px 14px;border:0;background:none;cursor:pointer;font:inherit;font-size:13px;font-weight:500;color:var(--text-muted);border-bottom:2px solid transparent;white-space:nowrap;}
    .cw-tab.active{color:var(--text);border-bottom-color:var(--brand);}
    .cw-body{flex:1;overflow:auto;padding:18px;}
    .cw-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;}
    @media(max-width:520px){.cw-grid{grid-template-columns:1fr;}}
    .cw-metric{padding:14px;border:1px solid var(--border);border-radius:12px;background:var(--surface);}
    .cw-metric span{display:block;font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.04em;}
    .cw-metric strong{display:block;margin-top:4px;font-size:18px;}
    .cw-field{margin-bottom:12px;}
    .cw-field label{display:block;font-size:12px;font-weight:500;color:var(--text-muted);margin-bottom:4px;}
    .cw-field input,.cw-field textarea{width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:8px;background:var(--input-bg);color:var(--text);font:inherit;}
    .cw-field textarea{min-height:88px;resize:vertical;}
    .cw-actions{display:flex;gap:8px;margin-top:16px;}
    .cw-btn{padding:8px 14px;border-radius:8px;border:0;font:inherit;font-size:13px;font-weight:600;cursor:pointer;background:var(--brand);color:#fff;}
    .cw-btn:hover{background:var(--brand-hover);}
    .cw-btn:disabled{opacity:.6;cursor:not-allowed;}
    .cw-alert{padding:12px 14px;border-radius:10px;font-size:13px;}
    .cw-alert-err{background:rgba(239,68,68,.1);color:var(--err);}
    .cw-loading{padding:40px 18px;text-align:center;color:var(--text-muted);}
    .cw-spinner{width:22px;height:22px;border:2px solid var(--border);border-top-color:var(--brand);border-radius:50%;animation:spin .8s linear infinite;margin:0 auto 10px;}
    @keyframes spin{to{transform:rotate(360deg);}}
    .cw-hidden{display:none!important;}
    .cw-msg-ok{font-size:12px;color:var(--success-text);margin-top:8px;}
    .cw-msg-err{font-size:12px;color:var(--err);margin-top:8px;}
  </style>
</head>
<body>
  <div class="cw-app">
    <div id="loading-wrap" class="cw-loading"><div class="cw-spinner"></div>Carregando cadastro…</div>
    <div id="error-wrap" class="cw-body cw-hidden"></div>
    <div id="app-wrap" class="cw-hidden" style="display:flex;flex-direction:column;flex:1;min-height:100dvh;">
      <header class="cw-header">
        <div id="avatar-wrap"></div>
        <div class="cw-title">
          <h1 id="c-name">—</h1>
          <p id="c-phone">—</p>
          <span class="cw-badge">Cliente CRM</span>
        </div>
      </header>
      <nav class="cw-tabs" id="tabs">
        <button type="button" class="cw-tab active" data-tab="overview">Visão geral</button>
        <button type="button" class="cw-tab" data-tab="edit">Cadastro</button>
      </nav>
      <main class="cw-body">
        <section id="tab-overview">
          <div class="cw-grid" id="metrics"></div>
          <p id="c-notes-preview" style="margin-top:16px;color:var(--text-muted);font-size:13px;"></p>
        </section>
        <section id="tab-edit" class="cw-hidden">
          <form id="edit-form">
            <div class="cw-field"><label>Nome</label><input id="f-name" name="name"/></div>
            <div class="cw-field"><label>E-mail</label><input id="f-email" name="email" type="email"/></div>
            <div class="cw-field"><label>Telefone</label><input id="f-phone" name="phone"/></div>
            <div class="cw-field"><label>CPF/CNPJ</label><input id="f-cpf" name="cpf_cnpj"/></div>
            <div class="cw-field"><label>Endereço</label><input id="f-address" name="address"/></div>
            <div class="cw-grid">
              <div class="cw-field"><label>Cidade</label><input id="f-city" name="city"/></div>
              <div class="cw-field"><label>UF</label><input id="f-state" name="state" maxlength="2"/></div>
            </div>
            <div class="cw-field"><label>CEP</label><input id="f-zip" name="zip_code"/></div>
            <div class="cw-field"><label>Observações</label><textarea id="f-notes" name="notes"></textarea></div>
            <div class="cw-actions">
              <button type="submit" class="cw-btn" id="save-btn">Salvar cadastro</button>
            </div>
            <div id="save-ok" class="cw-msg-ok"></div>
            <div id="save-err" class="cw-msg-err"></div>
          </form>
        </section>
      </main>
    </div>
  </div>
  <script>
(function(){
  var API_BASE=${safeApi};
  var KEY=${safeKey};
  var ACCOUNT_ID=${safeAccountId};
  var CONTACT_ID=${safeContactId};
  var THEME=${safeTheme};
  var STATE={contact:null,summary:null};

  function esc(s){return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");}
  function money(n){return "R$ "+Number(n||0).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2});}
  function qs(extra){return "?account_id="+encodeURIComponent(ACCOUNT_ID)+"&key="+encodeURIComponent(KEY)+(extra||"");}
  function api(path,opts){
    opts=opts||{};
    return fetch(API_BASE+path+qs(),Object.assign({headers:{"Content-Type":"application/json","x-chatwoot-mirror-key":KEY}},opts))
      .then(function(r){return r.json().then(function(j){return{ok:r.ok,j:j};});});
  }

  function setTheme(theme){
    document.documentElement.setAttribute("data-theme",theme==="dark"?"dark":"light");
  }
  setTheme(THEME);
  window.addEventListener("message",function(ev){
    if(!ev.data||typeof ev.data!=="object")return;
    if(ev.data.type==="boom-ia-embed:theme"&&ev.data.theme)setTheme(ev.data.theme);
  });

  function showError(msg){
    document.getElementById("loading-wrap").classList.add("cw-hidden");
    document.getElementById("app-wrap").classList.add("cw-hidden");
    var el=document.getElementById("error-wrap");
    el.classList.remove("cw-hidden");
    el.innerHTML='<div class="cw-alert cw-alert-err">'+esc(msg)+"</div>";
  }

  function initials(name){
    return String(name||"?").trim().split(/\\s+/).slice(0,2).map(function(p){return p[0]||"";}).join("").toUpperCase();
  }

  function fillHeader(){
    var c=STATE.contact;
    var wrap=document.getElementById("avatar-wrap");
    if(c.avatar_url){
      wrap.innerHTML='<img class="cw-avatar" src="'+esc(c.avatar_url)+'" alt=""/>';
    } else {
      wrap.innerHTML='<div class="cw-avatar-fallback">'+esc(initials(c.name))+"</div>";
    }
    document.getElementById("c-name").textContent=c.name||"Sem nome";
    document.getElementById("c-phone").textContent=c.phone?("+"+String(c.phone).replace(/^\\+/,"")):"Sem telefone";
  }

  function fillOverview(){
    var s=STATE.summary||{};
    document.getElementById("metrics").innerHTML=[
      ["Faturado",money(s.total_invoiced)],
      ["Pago",money(s.total_paid)],
      ["Em atraso",money(s.total_overdue)],
      ["Faturas",String(s.invoice_count||0)],
      ["Pacotes ativos",String(s.active_packages||0)],
      ["Próximos agend.",String(s.upcoming_appointments||0)]
    ].map(function(row){
      return '<div class="cw-metric"><span>'+esc(row[0])+'</span><strong>'+esc(row[1])+"</strong></div>";
    }).join("");
    var notes=(STATE.contact.notes||"").trim();
    document.getElementById("c-notes-preview").textContent=notes?notes:"Sem observações cadastradas.";
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

  function bindTabs(){
    document.getElementById("tabs").addEventListener("click",function(ev){
      var btn=ev.target.closest("[data-tab]");
      if(!btn)return;
      var tab=btn.getAttribute("data-tab");
      document.querySelectorAll(".cw-tab").forEach(function(el){el.classList.toggle("active",el===btn);});
      document.getElementById("tab-overview").classList.toggle("cw-hidden",tab!=="overview");
      document.getElementById("tab-edit").classList.toggle("cw-hidden",tab!=="edit");
    });
  }

  function bindSave(){
    document.getElementById("edit-form").addEventListener("submit",function(ev){
      ev.preventDefault();
      var btn=document.getElementById("save-btn");
      var ok=document.getElementById("save-ok");
      var err=document.getElementById("save-err");
      btn.disabled=true; ok.textContent=""; err.textContent="";
      var body={
        name:document.getElementById("f-name").value.trim(),
        email:document.getElementById("f-email").value.trim()||null,
        phone:document.getElementById("f-phone").value.trim()||null,
        cpf_cnpj:document.getElementById("f-cpf").value.trim()||null,
        address:document.getElementById("f-address").value.trim()||null,
        city:document.getElementById("f-city").value.trim()||null,
        state:document.getElementById("f-state").value.trim()||null,
        zip_code:document.getElementById("f-zip").value.trim()||null,
        notes:document.getElementById("f-notes").value.trim()||null
      };
      api("/embed/chatwoot/crm/contacts/"+encodeURIComponent(CONTACT_ID),{method:"PATCH",body:JSON.stringify(body)})
        .then(function(res){
          btn.disabled=false;
          if(!res.ok){err.textContent=res.j.error||"Erro ao salvar";return;}
          STATE.contact=res.j;
          fillHeader(); fillOverview(); fillForm();
          ok.textContent="Salvo com sucesso";
          setTimeout(function(){ok.textContent="";},2500);
        })
        .catch(function(e){btn.disabled=false;err.textContent=e.message||"Erro de rede";});
    });
  }

  function showApp(){
    document.getElementById("loading-wrap").classList.add("cw-hidden");
    document.getElementById("error-wrap").classList.add("cw-hidden");
    var app=document.getElementById("app-wrap");
    app.classList.remove("cw-hidden");
    app.style.display="flex";
    fillHeader(); fillOverview(); fillForm(); bindTabs(); bindSave();
  }

  function load(){
    if(!KEY||!ACCOUNT_ID||!CONTACT_ID){
      showError("Parâmetros key, account_id ou contact_id ausentes.");
      return;
    }
    Promise.all([
      api("/embed/chatwoot/crm/contacts/"+encodeURIComponent(CONTACT_ID)),
      api("/embed/chatwoot/crm/contacts/"+encodeURIComponent(CONTACT_ID)+"/summary")
    ]).then(function(results){
      if(!results[0].ok){showError(results[0].j.error||"Contato não encontrado");return;}
      STATE.contact=results[0].j;
      STATE.summary=results[1].ok?results[1].j:{};
      showApp();
    }).catch(function(e){showError(e.message||"Falha ao carregar CRM");});
  }

  load();
})();
  </script>
</body>
</html>`;
}
