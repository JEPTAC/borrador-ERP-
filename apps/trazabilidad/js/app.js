(function(){
  "use strict";
  var U=window.EI_UTIL,F=window.EI_SUPABASE,C=window.EI_SUPABASE_COMPAT,cfg=window.EI_NOVA_CONFIG;
  var rootBase=document.documentElement.dataset.rootBase||"../../";
  var appBase=document.documentElement.dataset.appBase||"./";
  var state={session:null,roles:null,catalog:null,group:"user",modules:[],currentModule:"home",cases:[],credits:[],searchTab:"all",searchIndex:0,commandReturnFocus:null,currentActionUrl:"",workspaceTimer:null};
  function groupFor(role){var normalized=U.normalize(role);return state.roles.aliases[normalized]||"user";}
  function allowed(groups){groups=groups||["all"];return state.group==="admin"||groups.indexOf("all")>=0||groups.indexOf(state.group)>=0;}
  function initials(name){return String(name||"U").split(/\s+/).slice(0,2).map(function(x){return x.charAt(0);}).join("").toUpperCase();}
  function toast(title,message,type){var region=U.qs("#toastRegion"),item=document.createElement("div");item.className="ei-toast "+(type||"");item.innerHTML=U.icon(type==="error"?"alert":"check")+'<div><strong>'+U.escape(title)+'</strong><span>'+U.escape(message||"")+'</span></div>';region.appendChild(item);setTimeout(function(){item.remove();},5200);}
  function moduleById(id){return state.modules.filter(function(m){return m.id===id;})[0]||state.modules[0];}
  function actionById(moduleId,actionId){var module=moduleById(moduleId);return module&&(module.actions||[]).filter(function(a){return a.id===actionId;})[0];}
  function visibleActions(module){return (module.actions||[]).filter(function(a){return allowed(a.groups);});}
  function valueList(value){
    if(Array.isArray(value))return value.map(function(v){return String(v||"").trim();}).filter(Boolean);
    if(value===null||value===undefined)return [];
    return String(value).split(/[;,|]/).map(function(v){return v.trim();}).filter(Boolean);
  }
  function identityTokens(){
    var user=state.session&&state.session.user||{},profile=state.session&&state.session.profile||{},raw=profile.raw||{};
    var values=[user.uid,user.email,profile.uid,profile.email,profile.profileId,profile.name,raw.uid,raw.userId,raw.authUid,raw.email,raw.name,raw.displayName];
    return values.concat(valueList(raw.uidAliases)).map(function(v){return U.normalize(v);}).filter(Boolean);
  }
  function caseIdentityMatch(c){
    var mine=identityTokens();
    if(!mine.length)return false;
    var values=[c.createdBy,c.createdByUid,c.createdByEmail,c.createdByName,c.salesUserId,c.salesAdvisor,c.salesAdvisorEmail,c.advisorId,c.advisorEmail,c.assignedTo,c.assignedUid,c.assignedEmail,c.assignedName,c.responsibleId,c.responsibleEmail,c.responsibleName,c.ownerId,c.ownerEmail];
    values=values.concat(valueList(c.assignedUserIds)).concat((Array.isArray(c.assignedUsers)?c.assignedUsers:valueList(c.assignedUsers)).reduce(function(acc,u){
      if(u&&typeof u==="object")return acc.concat([u.uid,u.id,u.userId,u.email,u.name]);
      return acc.concat([u]);
    },[]));
    var hay=values.map(function(v){return U.normalize(v);}).filter(Boolean);
    return mine.some(function(token){return hay.indexOf(token)>=0;});
  }
  function processOf(c){return U.normalize(c.currentProcess||c.process||c.module||c.stage||c.status||"").replace(/\s+/g,"_");}
  function roleOfCase(c){return U.normalize(c.assignedRole||c.responsibleRole||c.ownerRole||"").replace(/\s+/g,"_");}
  function caseVisible(c){
    if(!c)return false;
    if(["admin","management","audit"].indexOf(state.group)>=0)return true;
    if(caseIdentityMatch(c))return true;
    var process=processOf(c),role=roleOfCase(c),text=" "+process+" "+role+" ";
    var maps={
      sales:/venta|comercial|asesor|crear|sales/,
      credit:/cartera|credito|credit/,
      purchases:/compra|purchase/,
      reception:/recepcion|reception/,
      logistics:/recepcion|alistamiento|logistica|despacho|cliente_punto|cliente_recoge|facturacion|delivery/,
      cut:/corte|cut/,
      billing:/facturacion|billing/,
      cash:/caja|cash/,
      dispatch:/despacho|cliente_punto|cliente_recoge|delivery/,
      projects:/proyecto|project/,
      quality:/calidad|quality|no_conform/,
      maintenance:/mantenimiento|maintenance/
    };
    return maps[state.group]?maps[state.group].test(text):false;
  }
  function visibleCases(){return state.cases.filter(caseVisible);}
  function dateValue(value){
    if(value&&typeof value.toDate==="function")return value.toDate();
    if(value&&typeof value.seconds==="number")return new Date(value.seconds*1000);
    var date=new Date(value||0);return isNaN(date.getTime())?new Date(0):date;
  }
  function caseTitle(c){return c.reference||c.orderNumber||c.caseNumber||c.purchaseOrder||c.id||"Pedido";}
  function taskStatus(c){return c.status||c.currentProcess||c.process||"Pendiente";}
  function tasksHtml(){
    var rows=visibleCases().filter(function(c){return !c.closedAt&&!/cerrad|cancelad|finalizad/i.test(String(c.status||""));}).sort(function(a,b){return dateValue(b.updatedAt||b.createdAt)-dateValue(a.updatedAt||a.createdAt);}).slice(0,8);
    if(!rows.length)return '<div class="ei-empty">'+U.icon("check")+'<strong>No tiene pendientes visibles</strong><span>Los pedidos asignados a su perfil aparecerán aquí.</span></div>';
    return '<div class="nova-task-list">'+rows.map(function(c){var customer=c.client||c.customer||c.businessName||"Sin cliente";return '<button class="nova-task-row" type="button" data-task-case="'+U.escape(c.id||"")+'"><span class="nova-task-main"><strong>'+U.escape(caseTitle(c))+'</strong><span>'+U.escape(customer)+'</span></span><span class="nova-task-meta"><span class="ei-badge">'+U.escape(taskStatus(c))+'</span><small>'+U.escape(c.purchaseOrder?"OC "+c.purchaseOrder:(c.invoiceNumber?"Factura "+c.invoiceNumber:"Ver trazabilidad"))+'</small></span>'+U.icon("arrow")+'</button>';}).join("")+'</div>';
  }
  function bindTaskRows(root){U.qsa("[data-task-case]",root||document).forEach(function(btn){btn.addEventListener("click",function(){try{sessionStorage.setItem("ei_nova_pending_case",btn.dataset.taskCase||"");}catch(e){}var module=moduleById("home"),action=actionById("home","cases");if(module&&action)openAction(module,action);});});}
  function buildAccessibleCatalog(){state.modules=(state.catalog.modules||[]).filter(function(m){return allowed(m.groups)&&visibleActions(m).length;}).sort(function(a,b){return (a.order||0)-(b.order||0);});if(!moduleById(state.currentModule))state.currentModule=state.modules[0]?state.modules[0].id:"home";}
  function setUser(){var p=state.session.profile;U.qs("[data-user-avatar]").textContent=initials(p.name);U.qs("[data-user-name]").textContent=p.name;U.qs("[data-user-role]").textContent=state.roles.labels[state.group]||p.role;}
  function renderSidebar(){var groupMeta={};(state.catalog.groups||[]).forEach(function(g){groupMeta[g.id]=g;});var buckets={};state.modules.forEach(function(m){(buckets[m.group]||(buckets[m.group]=[])).push(m);});var groups=Object.keys(buckets).sort(function(a,b){return ((groupMeta[a]||{}).order||0)-((groupMeta[b]||{}).order||0);});U.qs("#novaNav").innerHTML=groups.map(function(group){return '<section class="nova-nav-group"><div class="nova-nav-group-title">'+U.escape((groupMeta[group]||{}).label||group)+'</div>'+buckets[group].map(function(m){return '<button class="nova-nav-item '+(state.currentModule===m.id?'active':'')+'" type="button" data-module="'+U.escape(m.id)+'">'+U.icon(m.icon)+'<span>'+U.escape(m.short||m.name)+'</span><span class="count">'+visibleActions(m).length+'</span></button>';}).join("")+'</section>';}).join("");U.qsa("[data-module]",U.qs("#novaNav")).forEach(function(btn){btn.addEventListener("click",function(){openModule(btn.dataset.module);});});}
  function kpisHtml(){
    var cases=visibleCases();
    var open=cases.filter(function(c){return !c.closedAt&&!/cerrad|cancelad|finalizad/i.test(String(c.status||""));}).length;
    var waiting=cases.filter(function(c){return /espera|pendiente|no_entregado|devolucion/i.test(String(c.status||c.currentProcess||""));}).length;
    var priority=cases.filter(function(c){return /alta|urgente|prioritari/i.test(String(c.priority||c.priorityLabel||""))&&!c.closedAt;}).length;
    var today=new Date().toISOString().slice(0,10),todayCount=cases.filter(function(c){return dateValue(c.updatedAt||c.createdAt).toISOString().slice(0,10)===today;}).length;
    return '<section class="nova-kpi-grid" aria-label="Resumen operativo"><article class="ei-card nova-kpi"><span>Pedidos abiertos</span><strong>'+open+'</strong><small>Visibles para su perfil</small></article><article class="ei-card nova-kpi"><span>En espera</span><strong>'+waiting+'</strong><small>Requieren seguimiento</small></article><article class="ei-card nova-kpi"><span>Prioritarios</span><strong>'+priority+'</strong><small>Atención especial</small></article><article class="ei-card nova-kpi"><span>Actualizados hoy</span><strong>'+todayCount+'</strong><small>Movimientos recientes</small></article></section>';
  }
  function actionCard(module,action){var req=(action.requirements||[]).slice(0,4);return '<button type="button" class="nova-action-card '+(action.primary?'primary':'')+'" data-action-open="'+U.escape(module.id)+':'+U.escape(action.id)+'"><div class="nova-action-top"><span class="nova-action-icon">'+U.icon(action.icon||module.icon)+'</span>'+(action.primary?'<span class="ei-badge blue">Acceso directo</span>':'')+'</div><h3>'+U.escape(action.name)+'</h3><p>'+U.escape(action.description)+'</p>'+(req.length?'<div class="nova-action-requirements" aria-label="Requisitos mínimos">'+req.map(function(x){return '<span>'+U.escape(x)+'</span>';}).join("")+'</div>':'')+'<div class="nova-action-go"><span>Abrir transacción</span>'+U.icon("arrow")+'</div></button>';}
  function bindActionCards(root){U.qsa("[data-action-open]",root||document).forEach(function(btn){btn.addEventListener("click",function(){var parts=btn.dataset.actionOpen.split(":"),module=moduleById(parts[0]),action=actionById(parts[0],parts[1]);if(module&&action)openAction(module,action);});});}
  function renderHome(){
    state.currentModule="home";renderSidebar();U.qs("#pageTitle").textContent="Inicio";U.qs("#pageContext").textContent="Trazabilidad logística";
    var firstName=String(state.session.profile.name||"Usuario").split(" ")[0],primary=[];
    state.modules.forEach(function(m){visibleActions(m).forEach(function(a){if(a.primary&&m.id!=="home")primary.push({m:m,a:a});});});
    primary=primary.slice(0,6);
    var modules=state.modules.filter(function(m){return m.id!=="home";});
    U.qs("#novaContent").innerHTML='<section class="nova-hero"><div><h2>Hola, '+U.escape(firstName)+'. ¿Qué necesita hacer?</h2><p>Use los accesos directos o abra un proceso. La plataforma solo muestra transacciones y pedidos autorizados para su rol.</p></div><div class="nova-hero-actions"><button class="ei-btn" type="button" data-open-command>'+U.icon("search")+'Buscar pedido o función</button></div></section>'+kpisHtml()+'<section class="nova-section"><header class="nova-section-head"><div><h2>Mis pendientes</h2><p>Pedidos activos asignados o relacionados con su perfil.</p></div><button class="ei-btn secondary" type="button" data-open-cases>Ver bandeja completa</button></header>'+tasksHtml()+'</section><section class="nova-section"><header class="nova-section-head"><div><h2>Acciones frecuentes</h2><p>Las tareas principales de su perfil.</p></div></header><div class="nova-action-grid">'+primary.map(function(x){return actionCard(x.m,x.a);}).join("")+'</div></section><section class="nova-section"><header class="nova-section-head"><div><h2>Procesos disponibles</h2><p>Entre por proceso y elija una transacción.</p></div></header><div class="nova-module-grid">'+modules.map(function(m){return '<button class="nova-module-card" type="button" data-module-card="'+U.escape(m.id)+'">'+U.icon(m.icon)+'<strong>'+U.escape(m.name)+'</strong><span>'+U.escape(m.description)+'</span></button>';}).join("")+'</div></section>';
    var content=U.qs("#novaContent");bindActionCards(content);bindTaskRows(content);
    U.qsa("[data-module-card]",content).forEach(function(btn){btn.addEventListener("click",function(){openModule(btn.dataset.moduleCard);});});
    U.qsa("[data-open-command]",content).forEach(function(btn){btn.addEventListener("click",openCommand);});
    U.qsa("[data-open-cases]",content).forEach(function(btn){btn.addEventListener("click",function(){var module=moduleById("home"),action=actionById("home","cases");if(module&&action)openAction(module,action);});});
  }
  function renderModule(module){state.currentModule=module.id;renderSidebar();U.qs("#pageTitle").textContent=module.name;U.qs("#pageContext").textContent="Trazabilidad logística / "+module.name;var actions=visibleActions(module);var primary=actions.filter(function(a){return a.primary;})[0]||actions[0];U.qs("#novaContent").innerHTML='<header class="nova-page-head"><div><span class="eyebrow">Proceso</span><h1>'+U.escape(module.name)+'</h1><p>'+U.escape(module.description)+'</p></div>'+(primary?'<div class="nova-page-actions"><button class="ei-btn" data-action-open="'+U.escape(module.id)+':'+U.escape(primary.id)+'">'+U.icon(primary.icon||module.icon)+'<span>'+U.escape(primary.name)+'</span></button></div>':'')+'</header><section class="nova-action-grid">'+actions.map(function(a){return actionCard(module,a);}).join("")+'</section><section class="nova-section"><div class="ei-card nova-process-help"><div class="nova-section-head"><div><h2>Cómo funciona este proceso</h2><p>Cada transacción conserva usuario, fecha, estado y trazabilidad en el motor operativo.</p></div></div><div class="nova-action-requirements"><span>Validación por rol</span><span>Campos obligatorios</span><span>Guardado transaccional en Supabase</span><span>Historial de movimientos</span></div></div></section>';bindActionCards(U.qs("#novaContent"));}
  function openModule(id){closeWorkspace();var module=moduleById(id);if(!module)return;history.replaceState(null,"","#module="+encodeURIComponent(id));renderModule(module);closeMobileNav();}
  function engineUrl(action){
    var isVsm=action.engine==="vsm"||action.module==="vsm",path=isVsm?"engine/modules/vsm/dashboard.html":"engine/modules/"+action.module+"/";
    var url=new URL(rootBase+path,location.href);
    if(isVsm){
      url.searchParams.set("standalone","1");
      url.searchParams.set("source","shell");
      url.searchParams.set("returnTo",location.href.split("#")[0]+"#module=analytics");
    }else{
      url.searchParams.set("route",action.route);
      url.searchParams.set("embedded","1");
      url.searchParams.set("nova","1");
      url.searchParams.set("source","shell");
    }
    return url.href;
  }
  function openAction(module,action){
    if(!allowed(action.groups)){toast("Acceso no autorizado","Su rol no tiene permiso para abrir esta transacción.","error");return;}
    var url=engineUrl(action);
    if(action.openMode==="page"){
      try{sessionStorage.setItem("ei_nova_return_url",location.href.split("#")[0]+"#module="+encodeURIComponent(module.id));}catch(e){}
      location.href=url;
      return;
    }
    state.currentModule=module.id;renderSidebar();var ws=U.qs("#novaWorkspace"),frame=U.qs("#workspaceFrame"),loading=U.qs("#workspaceLoading");
    state.currentActionUrl=url;clearTimeout(state.workspaceTimer);U.qs("#workspaceTitle").textContent=module.name+" · "+action.name;
    loading.innerHTML='<div><span class="ei-spinner"></span><strong>Cargando '+U.escape(action.name)+'…</strong><small>Validando sesión, permisos y datos.</small></div>';
    loading.removeAttribute("hidden");ws.removeAttribute("hidden");frame.title=action.name+" · "+module.name;frame.removeAttribute("data-load-error");
    frame.onload=function(){
      if(frame.contentWindow&&frame.contentWindow.location&&frame.contentWindow.location.href==="about:blank")return;
      setTimeout(function(){if(!loading.hasAttribute("hidden")){clearTimeout(state.workspaceTimer);loading.setAttribute("hidden","");}},350);
    };
    frame.onerror=function(){clearTimeout(state.workspaceTimer);frame.setAttribute("data-load-error","1");loading.innerHTML='<div class="nova-workspace-error">'+U.icon("alert")+'<strong>No fue posible abrir la transacción</strong><span>Revise la conexión y vuelva a intentar.</span><button class="ei-btn" type="button" data-retry-workspace>Reintentar</button></div>';var retry=loading.querySelector("[data-retry-workspace]");if(retry)retry.onclick=function(){openAction(module,action);};};
    state.workspaceTimer=setTimeout(function(){if(!loading.hasAttribute("hidden")){loading.innerHTML='<div class="nova-workspace-error">'+U.icon("alert")+'<strong>La transacción está tardando demasiado</strong><span>No se ocultó el contenido: puede reintentar o abrirlo aparte.</span><div><button class="ei-btn" type="button" data-retry-workspace>Reintentar</button> <button class="ei-btn secondary" type="button" data-open-workspace> Abrir aparte</button></div></div>';var retry=loading.querySelector("[data-retry-workspace]"),external=loading.querySelector("[data-open-workspace]");if(retry)retry.onclick=function(){openAction(module,action);};if(external)external.onclick=function(){window.open(url,"_blank","noopener");};}},18000);
    frame.src=url;history.replaceState(null,"","#action="+encodeURIComponent(module.id+":"+action.id));closeMobileNav();
  }
  function closeWorkspace(){var ws=U.qs("#novaWorkspace"),frame=U.qs("#workspaceFrame");clearTimeout(state.workspaceTimer);state.currentActionUrl="";ws.setAttribute("hidden","");if(frame.src&&frame.src!=="about:blank")frame.src="about:blank";U.qs("#workspaceLoading").setAttribute("hidden","");}
  function closeWorkspaceAndReturn(){closeWorkspace();history.replaceState(null,"","#module="+encodeURIComponent(state.currentModule));renderModule(moduleById(state.currentModule));}
  function openCommand(){var modal=U.qs("#novaCommand");state.commandReturnFocus=document.activeElement;modal.removeAttribute("hidden");document.body.style.overflow="hidden";state.searchIndex=0;var input=U.qs("#commandInput");input.value="";setTimeout(function(){input.focus();renderCommandResults("");},0);}
  function closeCommand(){U.qs("#novaCommand").setAttribute("hidden","");document.body.style.overflow="";if(state.commandReturnFocus&&typeof state.commandReturnFocus.focus==="function")state.commandReturnFocus.focus();state.commandReturnFocus=null;}
  function transactionResults(query){var q=U.normalize(query).replace(/_/g," "),items=[];state.modules.forEach(function(m){visibleActions(m).forEach(function(a){var hay=U.normalize([m.name,a.name,a.description,(a.requirements||[]).join(" ")].join(" ")).replace(/_/g," ");if(!q||hay.indexOf(q)>=0)items.push({kind:"transaction",title:a.name,subtitle:m.name,icon:a.icon||m.icon,module:m,action:a});});});return items;}
  function caseSearchText(c){return U.normalize([c.id,c.reference,c.caseNumber,c.orderNumber,c.purchaseOrder,c.ocNumber,c.client,c.customer,c.invoiceNumber,c.factura,c.status,c.currentProcess,c.description,c.createdByName].join(" ")).replace(/_/g," ");}
  function recordResults(query){var q=U.normalize(query).replace(/_/g," ");if(!q)return [];var items=visibleCases().filter(function(c){return caseSearchText(c).indexOf(q)>=0;}).slice(0,18).map(function(c){return {kind:"case",title:c.reference||c.orderNumber||c.caseNumber||c.id,subtitle:[c.client||c.customer,c.purchaseOrder?"OC "+c.purchaseOrder:"",c.invoiceNumber?"Factura "+c.invoiceNumber:"",c.status||c.currentProcess].filter(Boolean).join(" · "),icon:"route",record:c};});var credits=state.credits.filter(function(r){var hay=U.normalize([r.id,r.requestCode,r.businessName,r.nit,r.contactName,r.status,r.createdByName].join(" ")).replace(/_/g," ");return hay.indexOf(q)>=0;}).slice(0,10).map(function(r){return {kind:"credit",title:r.requestCode||r.businessName||r.id,subtitle:[r.businessName,r.nit,r.status].filter(Boolean).join(" · "),icon:"credit",record:r};});return items.concat(credits);}
  function renderCommandResults(query){var items=[];if(state.searchTab==="all"||state.searchTab==="transactions")items=items.concat(transactionResults(query));if(state.searchTab==="all"||state.searchTab==="records")items=items.concat(recordResults(query));items=items.slice(0,30);state.commandItems=items;state.searchIndex=Math.min(state.searchIndex,Math.max(0,items.length-1));var out=U.qs("#commandResults");if(!items.length){out.innerHTML='<div class="ei-empty">'+U.icon("search")+'<strong>Sin resultados</strong><span>Pruebe con pedido, cliente, OC, factura, módulo o acción.</span></div>';return;}out.innerHTML=items.map(function(item,index){return '<button class="nova-result '+(index===state.searchIndex?'active':'')+'" type="button" data-result="'+index+'"><span class="nova-result-icon">'+U.icon(item.icon)+'</span><span><strong>'+U.escape(item.title)+'</strong><span>'+U.escape(item.subtitle)+'</span></span><kbd>Enter</kbd></button>';}).join("");U.qsa("[data-result]",out).forEach(function(btn){btn.addEventListener("click",function(){activateResult(Number(btn.dataset.result));});});}
  function activateResult(index){var item=state.commandItems&&state.commandItems[index];if(!item)return;if(item.kind==="transaction"){closeCommand();openAction(item.module,item.action);return;}if(item.kind==="credit"){var module=moduleById("credit"),action=actionById("credit","credit-workspace");closeCommand();openAction(module,Object.assign({},action,{route:state.group==="credit"?"credit_review":"credit_workspace"}));return;}if(item.kind==="case"){closeCommand();var module=moduleById("home"),action=actionById("home","cases");try{sessionStorage.setItem("ei_nova_pending_case",item.record.id||"");}catch(e){}openAction(module,action);toast("Pedido localizado",item.title+" se abrió en la consulta. Use el buscador de la bandeja si no aparece primero.","success");}}
  function snapshotRows(snapshot){return snapshot.docs.map(function(doc){return Object.assign({id:doc.id},doc.data());});}
  function safeCaseQuery(query,label){return query.limit(180).get().then(snapshotRows).catch(function(error){console.warn("Consulta de casos no disponible",label,error);return [];});}
  function mergeCaseGroups(groups){var map={};groups.forEach(function(rows){(rows||[]).forEach(function(row){if(row&&row.id)map[row.id]=row;});});return Object.keys(map).map(function(id){return map[id];}).filter(caseVisible).sort(function(a,b){return dateValue(b.updatedAt||b.createdAt)-dateValue(a.updatedAt||a.createdAt);}).slice(0,300);}
  function reverseRoleAliases(){var raw=state.session.profile.role,aliases=[raw];Object.keys(state.roles.aliases||{}).forEach(function(key){if(state.roles.aliases[key]===state.group)aliases.push(key);});return Array.from(new Set(aliases.map(function(value){return String(value||"").trim();}).filter(Boolean)));}
  function processKeysForGroup(){var map={purchases:["compras"],reception:["recepcion_pedidos"],logistics:["recepcion_pedidos","alistamiento","facturacion","cliente_punto","cliente_recoge","despacho_local","despacho_nacional","cierre_despacho_nacional"],cut:["corte_cable"],billing:["facturacion"],cash:["caja"],credit:["cartera","caja"],dispatch:["cliente_punto","cliente_recoge","despacho_local","despacho_nacional","cierre_despacho_nacional"],projects:["proyectos"]};return map[state.group]||[];}
  function loadCasesForShell(){
    var db=state.session.db,cases=db.collection("cases"),user=state.session.user,profile=state.session.profile,queries=[];
    if(["admin","management","audit"].indexOf(state.group)>=0)return safeCaseQuery(cases.orderBy("updatedAt","desc"),"cases.all").then(function(rows){return mergeCaseGroups([rows]);});
    queries.push(safeCaseQuery(cases.where("createdBy","==",user.uid),"cases.createdBy"));
    queries.push(safeCaseQuery(cases.where("assignedUid","==",user.uid),"cases.assignedUid"));
    queries.push(safeCaseQuery(cases.where("assignedTo","==",user.uid),"cases.assignedTo"));
    queries.push(safeCaseQuery(cases.where("assignedUserIds","array-contains",user.uid),"cases.assignedUserIds"));
    if(user.email)queries.push(safeCaseQuery(cases.where("createdByEmail","==",user.email),"cases.createdByEmail"));
    if(profile.name)queries.push(safeCaseQuery(cases.where("createdByName","==",profile.name),"cases.createdByName"));
    var processKeys=processKeysForGroup();if(processKeys.length)queries.push(safeCaseQuery(cases.where("currentProcess","in",processKeys.slice(0,10)),"cases.currentProcess"));
    var aliases=reverseRoleAliases();for(var i=0;i<aliases.length;i+=10){var chunk=aliases.slice(i,i+10);queries.push(safeCaseQuery(cases.where("assignedRole","in",chunk),"cases.assignedRole"));queries.push(safeCaseQuery(cases.where("openRequirement.targetRole","in",chunk),"cases.requirementRole"));}
    if(state.group==="cut")queries.push(safeCaseQuery(cases.where("hasCuts","==",true),"cases.hasCuts"));
    return Promise.all(queries).then(mergeCaseGroups);
  }
  function loadRecords(){
    var db=state.session.db,credit=db.collection("credit_requests"),uid=state.session.user.uid;
    var casePromise=loadCasesForShell().then(function(rows){state.cases=rows;}).catch(function(error){console.warn("Casos no disponibles",error);state.cases=[];});
    var creditPromise=Promise.resolve();
    if(allowed(["sales","credit","management","audit","admin"])){
      var query=state.group==="sales"?credit.where("createdBy","==",uid):credit.limit(150);
      creditPromise=query.get().then(function(snapshot){state.credits=snapshotRows(snapshot);}).catch(function(error){console.warn("Solicitudes de crédito no disponibles",error);state.credits=[];});
    }
    return Promise.all([casePromise,creditPromise]).then(function(){if(state.currentModule==="home"&&!U.qs("#novaWorkspace").hasAttribute("hidden"))return;if(state.currentModule==="home")renderHome();});
  }
  function closeMobileNav(){U.qs("#novaShell").classList.remove("nav-open");}
  function handleHash(){var hash=location.hash.replace(/^#/,""),params=new URLSearchParams(hash),action=params.get("action"),moduleId=params.get("module");if(action){var p=action.split(":"),m=moduleById(p[0]),a=actionById(p[0],p[1]);if(m&&a){openAction(m,a);return;}}if(moduleId&&moduleById(moduleId)){renderModule(moduleById(moduleId));return;}renderHome();}
  function bindGlobal(){U.qs("#mobileMenu").addEventListener("click",function(){U.qs("#novaShell").classList.toggle("nav-open");});U.qs("#navOverlay").addEventListener("click",closeMobileNav);U.qs("#searchTrigger").addEventListener("click",openCommand);U.qs("#closeCommand").addEventListener("click",closeCommand);U.qs("#novaCommand").addEventListener("click",function(e){if(e.target.id==="novaCommand")closeCommand();});U.qs("#commandInput").addEventListener("input",U.debounce(function(e){state.searchIndex=0;renderCommandResults(e.target.value);},120));U.qs("#commandInput").addEventListener("keydown",function(e){if(e.key==="ArrowDown"){e.preventDefault();state.searchIndex=Math.min((state.commandItems||[]).length-1,state.searchIndex+1);renderCommandResults(e.target.value);}if(e.key==="ArrowUp"){e.preventDefault();state.searchIndex=Math.max(0,state.searchIndex-1);renderCommandResults(e.target.value);}if(e.key==="Enter"){e.preventDefault();activateResult(state.searchIndex);}if(e.key==="Escape")closeCommand();});U.qsa("[data-command-tab]").forEach(function(btn){btn.addEventListener("click",function(){state.searchTab=btn.dataset.commandTab;U.qsa("[data-command-tab]").forEach(function(x){x.classList.toggle("active",x===btn);});renderCommandResults(U.qs("#commandInput").value);});});U.qs("#workspaceBack").addEventListener("click",closeWorkspaceAndReturn);U.qs("#workspaceExternal").addEventListener("click",function(){if(state.currentActionUrl)window.open(state.currentActionUrl,"_blank","noopener");});U.qs("#shellLogout").addEventListener("click",function(){F.init().then(function(){return F.state.auth.signOut();}).finally(function(){F.clearProfile();location.href=rootBase+"index.html";});});U.qs("#mobileHome").addEventListener("click",function(){closeWorkspace();renderHome();});U.qs("#mobileTasks").addEventListener("click",function(){var first=state.modules.filter(function(m){return m.id!=="home";})[0];if(first)openModule(first.id);});U.qs("#mobileSearch").addEventListener("click",openCommand);U.qs("#mobileMore").addEventListener("click",function(){U.qs("#novaShell").classList.add("nav-open");});document.addEventListener("keydown",function(e){var command=U.qs("#novaCommand"),open=!command.hasAttribute("hidden");if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="k"){e.preventDefault();openCommand();return;}if(e.key==="Escape"&&open){e.preventDefault();closeCommand();return;}if(e.key==="Tab"&&open){var focusable=U.qsa('button:not([disabled]),input:not([disabled]),[href],[tabindex]:not([tabindex="-1"])',command).filter(function(x){return x.offsetParent!==null;}),first=focusable[0],last=focusable[focusable.length-1];if(!first)return;if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}});window.addEventListener("hashchange",handleHash);window.addEventListener("message",function(event){if(event.origin!==location.origin)return;var data=event.data||{};if(data.type==="EI_ENGINE_TITLE"&&data.title)U.qs("#workspaceTitle").textContent=data.title;if(data.type==="EI_ENGINE_READY"){clearTimeout(state.workspaceTimer);U.qs("#workspaceLoading").setAttribute("hidden","");}if(data.type==="EI_ENGINE_SIGNOUT")location.href=rootBase+"index.html";});}
  function boot(){Promise.all([F.requireSession({loginUrl:rootBase+"index.html"}),C.create(),U.json(rootBase+"core/config/roles.json"),U.json(appBase+"config/transactions.json")]).then(function(values){state.session=values[0];state.session.db=values[1].db;state.session.auth=values[1].auth;state.roles=values[2];state.catalog=values[3];state.group=groupFor(state.session.profile.role);buildAccessibleCatalog();setUser();renderSidebar();bindGlobal();handleHash();loadRecords();}).catch(function(error){U.qs("#novaContent").innerHTML='<div class="ei-card ei-empty">'+U.icon("alert")+'<strong>No fue posible abrir Trazabilidad logística</strong><span>'+U.escape(error.message||error)+'</span><a class="ei-btn" href="'+rootBase+'index.html">Volver al inicio</a></div>';});}
  window.EI_A11Y.bind(document);boot();
})();
