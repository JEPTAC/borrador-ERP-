(function(){
'use strict';
var VERSION='V620';
var FLOW=['compras','recepcion_pedidos','alistamiento','corte_cable','facturacion','caja','cartera','cliente_punto','cliente_recoge','despacho_local','despacho_nacional','cierre_despacho_nacional'];
var PROCESS={compras:'Compras / liberación PVE',recepcion_pedidos:'Recepción de pedidos',alistamiento:'Alistamiento',corte_cable:'Corte de cable',facturacion:'Facturación',caja:'Caja',cartera:'Cartera',cliente_punto:'Entrega cliente en punto',cliente_recoge:'Cliente recoge',despacho_local:'Despacho local',despacho_nacional:'Despacho nacional',cierre_despacho_nacional:'Cierre despacho nacional'};
var ROLE={compras:'Compras',compra:'Compras',area_compras:'Compras',ventas:'Ventas',asesor:'Ventas',asesor_ventas:'Ventas',vendedor:'Ventas',aux_logistica:'Auxiliar logística',auxiliar_corte:'Auxiliar corte',coordinador_logistico:'Logística/despacho',lider_logistico:'Logística/despacho',jefe_logistica:'Jefe logística',gerencia:'Gerencia',caja:'Caja',cartera:'Cartera',admin:'Admin',super_admin:'Super Admin'};
var app={db:null,auth:null,user:null,profile:null,cases:[],events:[],reports:[],flowHealth:[],processIntervals:[],statusIntervals:[],eventsByCase:{},processIntervalsByCase:{},statusIntervalsByCase:{},metrics:null,loadedAll:false,loading:false,fromCache:false,historyCapped:[]};
var $=function(id){return document.getElementById(id);};
function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function sleep(ms){return new Promise(function(r){setTimeout(r,ms||0);});}
function status(msg,kind){var el=$('status');if(!el)return;el.className='notice '+(kind||'ok');el.innerHTML=msg;}
function loading(on,msg){app.loading=!!on;var l=$('loading');if(l)l.className='loading'+(on?' show':'');var p=$('progress');if(p)p.textContent=msg||'';}
function clean(v){return String(v==null?'':v).trim();}
function lower(v){return clean(v).toLowerCase();}
function normKey(v){return lower(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'');}
function script(url,timeout){return new Promise(function(resolve,reject){var s=document.createElement('script'),done=false,t=setTimeout(function(){if(done)return;done=true;try{s.remove();}catch(e){}reject(new Error('Timeout cargando '+url));},timeout||16000);s.src=url;s.async=false;s.defer=false;s.crossOrigin='anonymous';s.referrerPolicy='no-referrer';s.onload=function(){if(done)return;done=true;clearTimeout(t);resolve(url);};s.onerror=function(){if(done)return;done=true;clearTimeout(t);reject(new Error('No cargó '+url));};document.head.appendChild(s);});}
function inheritFirebaseFromOpener(){
  var hosts=[];try{if(window.parent&&window.parent!==window)hosts.push(window.parent);}catch(e){}try{if(window.opener&&!window.opener.closed)hosts.push(window.opener);}catch(e){}
  for(var i=0;i<hosts.length;i++){try{var w=hosts[i];if(w&&w.firebase&&w.firebase.auth&&w.firebase.firestore){window.firebase=w.firebase;if(!window.firebaseConfig&&w.firebaseConfig)window.firebaseConfig=w.firebaseConfig;app.sdkSource=w===window.parent?'erp_parent':'app_principal';return true;}}catch(error){}}
  return false;
}
async function loadOne(list,check,label){if(check&&check())return true;var errors=[];for(var i=0;i<list.length;i++){try{status('Cargando '+(label||'librería')+' · fuente '+(i+1)+'/'+list.length,'ok');await script(list[i],17000);if(!check||check()){app.sdkSource=list[i];return true;}errors.push('La ruta cargó pero no dejó disponible '+(label||'librería')+': '+list[i]);}catch(e){errors.push(e.message||String(e));await sleep(150);}}throw new Error((label||'Librería')+' no cargó. Fuentes probadas: '+list.join(' | ')+'. Último error: '+(errors[errors.length-1]||'sin detalle'));}
async function loadFirebaseConfig(){if(window.firebaseConfig)return true;var root=window.EI_VSM_APP_ROOT||new URL('../../',location.href).href;var urls=[new URL('shared/js/firebase-config.js?v='+Date.now(),root).href];var last;for(var i=0;i<urls.length;i++){try{await script(urls[i],9000);if(window.firebaseConfig)return true;}catch(e){last=e;}}throw new Error('firebase-config.js no creó window.firebaseConfig. '+(last?last.message:''));}
async function loadOperationalProfile(){
  if(!app.user||!app.db)throw new Error('No existe una sesión autenticada para validar el perfil VSM.');
  var requests=[app.db.collection('users').doc(app.user.uid).get().catch(function(){return null;})];
  if(app.user.email)requests.push(app.db.collection('users').doc(app.user.email).get().catch(function(){return null;}));
  var results=await Promise.all(requests),doc=null;
  results.some(function(result){if(result&&result.exists){doc=result;return true;}return false;});
  if(!doc)throw new Error('La sesión no tiene un perfil operativo en la colección users.');
  var data=doc.data()||{};
  if(data.isActive===false)throw new Error('El perfil del usuario está inactivo.');
  if(!clean(data.role||data.rol))throw new Error('El perfil no tiene un rol operativo configurado.');
  app.profile={id:doc.id,name:data.name||data.displayName||app.user.displayName||app.user.email||'Usuario',role:data.role||data.rol,email:data.email||app.user.email||''};
  return app.profile;
}
async function initFirebase(){
  status('Cargando Firebase del tablero VSM '+VERSION+'...','ok');
  var v='12.15.0';
  inheritFirebaseFromOpener();
  if(!(window.firebase&&window.firebase.initializeApp&&window.firebase.auth&&window.firebase.firestore)){
    await loadOne(['https://www.gstatic.com/firebasejs/'+v+'/firebase-app-compat.js','https://unpkg.com/firebase@'+v+'/firebase-app-compat.js','https://cdn.jsdelivr.net/npm/firebase@'+v+'/compat/firebase-app.js'],function(){return !!(window.firebase&&window.firebase.initializeApp);},'Firebase App');
    await loadOne(['https://www.gstatic.com/firebasejs/'+v+'/firebase-auth-compat.js','https://unpkg.com/firebase@'+v+'/firebase-auth-compat.js','https://cdn.jsdelivr.net/npm/firebase@'+v+'/compat/firebase-auth.js'],function(){return !!(window.firebase&&window.firebase.auth);},'Firebase Auth');
    await loadOne(['https://www.gstatic.com/firebasejs/'+v+'/firebase-firestore-compat.js','https://unpkg.com/firebase@'+v+'/firebase-firestore-compat.js','https://cdn.jsdelivr.net/npm/firebase@'+v+'/compat/firebase-firestore.js'],function(){return !!(window.firebase&&window.firebase.firestore);},'Firebase Firestore');
  }
  var fb=window.firebase;if(!fb||!fb.initializeApp||!fb.auth||!fb.firestore)throw new Error('Firebase no quedó disponible después de cargar el SDK. Revise red, DNS o bloqueo del navegador.');
  if(!fb.apps.length){await loadFirebaseConfig();fb.initializeApp(window.firebaseConfig);}else if(!app.sdkSource)app.sdkSource='sesion_erp_existente';
  app.auth=fb.auth();app.db=fb.firestore();
  if(app.sdkSource!=='erp_parent'&&app.sdkSource!=='app_principal'&&app.sdkSource!=='sesion_erp_existente'){try{app.db.settings({ignoreUndefinedProperties:true});}catch(_e){}}
  app.user=await new Promise(function(resolve){var done=false;var unsub=app.auth.onAuthStateChanged(function(u){if(done)return;done=true;try{unsub&&unsub();}catch(e){}resolve(u||null);});setTimeout(function(){if(done)return;done=true;resolve(app.auth.currentUser||null);},5000);});
  if(!app.user)throw new Error('No hay una sesión activa. Regrese al ERP, inicie sesión y vuelva a abrir el VSM.');
  await loadOperationalProfile();
  status('Firebase conectado desde '+esc(app.sdkSource||'SDK')+'. Usuario: '+esc(app.profile.name)+'. Perfil: '+esc(app.profile.role)+'.','ok');
}

function toDate(v){
  if(v===null||v===undefined||v==='')return null;
  try{
    if(v instanceof Date)return isNaN(v.getTime())?null:v;
    if(v.toDate){var td=v.toDate();return td&&!isNaN(td.getTime())?td:null;}
    if(typeof v==='object'&&(v.seconds||v._seconds)){var sec=Number(v.seconds||v._seconds),ns=Number(v.nanoseconds||v._nanoseconds||0);var ds=new Date(sec*1000+Math.floor(ns/1e6));return isNaN(ds.getTime())?null:ds;}
    if(typeof v==='number'){if(!isFinite(v)||v<=0)return null;var dn=new Date(v<10000000000?v*1000:v);return isNaN(dn.getTime())?null:dn;}
    if(typeof v==='string'){
      var s=v.trim();if(!s)return null;
      s=s.replace(/\u00a0/g,' ').replace(/a\.\s*m\.|a\.m\.|am/ig,'AM').replace(/p\.\s*m\.|p\.m\.|pm/ig,'PM').replace(/,/g,' ');
      var d=new Date(s);if(!isNaN(d.getTime()))return d;
      var m=s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?$/i);
      if(m){var yy=Number(m[3]);if(yy<100)yy+=2000;var hh=Number(m[4]||0),mi=Number(m[5]||0),ss=Number(m[6]||0),ap=(m[7]||'').toUpperCase();if(ap==='PM'&&hh<12)hh+=12;if(ap==='AM'&&hh===12)hh=0;d=new Date(yy,Number(m[2])-1,Number(m[1]),hh,mi,ss);return isNaN(d.getTime())?null:d;}
      m=s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?$/i);
      if(m){var hh2=Number(m[4]||0),ap2=(m[7]||'').toUpperCase();if(ap2==='PM'&&hh2<12)hh2+=12;if(ap2==='AM'&&hh2===12)hh2=0;d=new Date(Number(m[1]),Number(m[2])-1,Number(m[3]),hh2,Number(m[5]||0),Number(m[6]||0));return isNaN(d.getTime())?null:d;}
    }
  }catch(e){}
  return null;
}
function tms(v){var d=toDate(v);return d?d.getTime():NaN;}
function nowMs(){return Date.now();}
function num(v){if(v===null||v===undefined||v==='')return 0;if(typeof v==='string'){var s=v.trim();if(/^\d{1,4}:\d{2}:\d{2}$/.test(s)){var p=s.split(':').map(Number);return ((p[0]*3600)+(p[1]*60)+p[2])*1000;}if(/h|hora|min|seg/i.test(s)){var total=0,m;while((m=/(\d+(?:[\.,]\d+)?)\s*(h|hora|horas|min|seg|s)/ig.exec(s))){var n=Number(String(m[1]).replace(',','.'));if(/h|hora/i.test(m[2]))total+=n*3600000;else if(/min/i.test(m[2]))total+=n*60000;else total+=n*1000;}return total;}v=Number(s.replace(/\./g,'').replace(',','.'));}else v=Number(v);return isFinite(v)&&v>0?v:0;}
function durMs(a,b){var x=tms(a),y=tms(b);if(!isFinite(x)||!isFinite(y)||y<x)return 0;return y-x;}
function fmt(msv){msv=Math.max(0,num(msv));var s=Math.floor(msv/1000),h=Math.floor(s/3600),m=Math.floor((s%3600)/60),sec=s%60;return String(h).padStart(2,'0')+':'+String(m).padStart(2,'0')+':'+String(sec).padStart(2,'0');}
function hours(msv){var h=Math.max(0,num(msv))/3600000;return h.toFixed(h<10?2:1);}
function timeUnit(msv){
  var ms=Math.max(0,num(msv)),min=ms/60000,h=ms/3600000;
  if(h>=1)return h.toFixed(h<10?2:1)+' h hábiles';
  if(min>=1)return Math.round(min)+' min hábiles';
  return '0 min';
}
function pct(part,total){
  part=Number(part)||0;total=Number(total)||0;
  if(!isFinite(part)||!isFinite(total)||total<=0)return 0;
  return Math.max(0,Math.min(100,Math.round((part/total)*100)));
}
function productivityState(m){
  m=m||{};
  var total=Math.max(1,num(m.leadTotal||m.va||0)+num(m.wait||0)+num(m.dead||0));
  var ratio=pct(m.va||0,total),non=Math.max(0,100-ratio),cls='warning',label='Ocupación por mejorar',text='El VSM muestra más espera o NVA que ocupación efectiva.';
  if(ratio>=70){cls='success';label='Ocupación saludable';text='La mayor parte del tiempo hábil está concentrada en trabajo efectivo.';}
  else if(ratio>=45){cls='info';label='Ocupación media';text='Hay equilibrio parcial entre ocupación, espera y NVA.';}
  return {ratio:ratio,non:non,cls:cls,label:label,text:text};
}
function workDate(v){try{if(!v)return null;if(v instanceof Date)return isNaN(v.getTime())?null:v;if(v.toDate&&typeof v.toDate==="function"){var d1=v.toDate();return d1&&isNaN(d1.getTime())?null:d1;}if(typeof v==="object"&&(v.seconds||v._seconds))return new Date(Number(v.seconds||v._seconds)*1000);var d=new Date(v);return isNaN(d.getTime())?null:d;}catch(e){return null;}}
function workingMsBetween(start,end){return window.EI_BUSINESS_CALENDAR?window.EI_BUSINESS_CALENDAR.calculateMs(start,end):durMs(start,end);}
function workingMsSince(v){return workingMsBetween(v,new Date());}
function renderCalendarSummary(){var el=$("calendarSummary");if(!el||!window.EI_BUSINESS_CALENDAR)return;var info=window.EI_BUSINESS_CALENDAR.summary(new Date().getFullYear());el.innerHTML='<div><strong>Calendario laboral aplicado</strong><span>'+esc(info.timeZone)+' · '+esc(info.workdays.join(", "))+'</span></div><div><strong>Jornada</strong><span>'+esc(info.windows.join(" / "))+'</span></div><div><strong>Exclusiones</strong><span>Fines de semana y '+info.holidays.length+' festivos de Colombia en '+new Date().getFullYear()+'</span></div><div><strong>Criterio VSM</strong><span>Todos los LT, esperas, NVA y ocupación se calculan en tiempo hábil.</span></div>';}
function renderTraceSources(){var el=$('traceSources');if(!el)return;var alertCount=(app.flowHealth||[]).filter(function(x){return Array.isArray(x.issues)&&x.issues.length;}).length,repairedCount=(app.flowHealth||[]).filter(function(x){return String(x.status||'').toUpperCase()==='REPAIRED';}).length;el.innerHTML='<article><span>Pedidos</span><strong>'+app.cases.length+'</strong><small>Documento operativo vigente</small></article><article><span>Eventos</span><strong>'+app.events.length+'</strong><small>Movimientos y responsables</small></article><article><span>Intervalos de proceso</span><strong>'+app.processIntervals.length+'</strong><small>Relevos calculados por backend</small></article><article><span>Intervalos de estado</span><strong>'+app.statusIntervals.length+'</strong><small>Trabajo, espera y cola</small></article><article><span>Novedades</span><strong>'+app.reports.length+'</strong><small>Bloqueos y respuestas</small></article><article><span>Integridad</span><strong>'+alertCount+'</strong><small>'+repairedCount+' reparación(es) auditada(s)</small></article>';}
async function loadBusinessCalendarConfig(){if(!app.db||!window.EI_BUSINESS_CALENDAR)return;try{var snap=await app.db.collection("system_config").doc("business_calendar").get();if(snap.exists)window.EI_BUSINESS_CALENDAR.setConfig(snap.data());}catch(error){console.warn("Calendario empresarial remoto no disponible; se usa configuración V6.2.",error);}renderCalendarSummary();}
function timeSplitHtml(va,wait,dead){
  var total=Math.max(1,num(va)+num(wait)+num(dead));
  return '<div class="time-tags"><span class="time-tag va"><b>Ocupación</b>'+timeUnit(va)+' · '+pct(va,total)+'%</span><span class="time-tag wait"><b>Espera/bloqueo</b>'+timeUnit(wait)+' · '+pct(wait,total)+'%</span><span class="time-tag dead"><b>NVA</b>'+timeUnit(dead)+' · '+pct(dead,total)+'%</span></div>';
}
function productivityHtml(m){
  var s=productivityState(m);
  return '<article class="card lt-analysis '+s.cls+'"><div><h2>'+esc(s.label)+'</h2><p>'+esc(s.text)+'</p></div><div class="lt-grid"><div><span>Ocupación / VA</span><strong>'+s.ratio+'%</strong></div><div><span>Espera + NVA</span><strong>'+s.non+'%</strong></div><div><span>LT hábil</span><strong>'+timeUnit(m.leadDayAvg)+'/día</strong></div><div><span>Unidad</span><strong>h / min</strong></div></div>'+timeSplitHtml(m.va,m.wait,m.dead)+'</article>';
}
function dateTxt(v){var d=toDate(v);return d?d.toLocaleString('es-CO'):'';}
function isoDay(v){var d=toDate(v);return d?d.toISOString().slice(0,10):'';}
function processTitle(p){return PROCESS[p]||p||'Sin proceso';}
function roleTitle(r){var k=normKey(r);return ROLE[k]||r||'';}
function v231IdentityText(x){
  x=x||{};
  return lower([
    x.role,x.rawRole,x.userRole,x.createdByRole,x.responsibleRole,x.responsableRole,
    x.name,x.user,x.userName,x.displayName,x.createdByName,x.byName,x.actorName,
    x.email,x.userEmail,x.createdByEmail,x.responsibleEmail,x.responsableEmail,
    x.uid,x.userUid,x.createdByUid,x.responsibleUid,x.responsableUid
  ].join(" "));
}
function v231IsExcludedSuperAdmin(x){
  var role=normKey((x&&(
    x.role||x.rawRole||x.userRole||x.createdByRole||
    x.responsibleRole||x.responsableRole
  ))||"");
  return role==="super_admin"||role==="super_administrador"||role==="superadministrador";
}
function v231ProcessStatsExcluded(st){
  st=st||{};
  var actors=[];
  (st.responsibles||[]).forEach(function(r){actors.push(r||{});});
  [
    ["responsibleName","responsibleEmail","responsibleUid"],
    ["responsableName","responsableEmail","responsableUid"],
    ["userName","userEmail","userUid"],
    ["createdByName","createdByEmail","createdByUid"],
    ["finishedByName","finishedByEmail","finishedBy"],
    ["registeredByName","registeredByEmail","registeredBy"],
    ["takenByName","takenByEmail","takenByUid"]
  ].forEach(function(keys){
    if(clean(st[keys[0]])||clean(st[keys[1]])||clean(st[keys[2]])){
      actors.push({
        name:st[keys[0]],email:st[keys[1]],uid:st[keys[2]],
        role:st.role||st.userRole||st.responsibleRole||st.createdByRole
      });
    }
  });
  return actors.length>0&&actors.every(v231IsExcludedSuperAdmin);
}
function v231OperationalUpdatedAt(c){
  c=c||{};
  var updater={
    name:c.updatedByName||c.modifiedByName,
    email:c.updatedByEmail||c.modifiedByEmail,
    uid:c.updatedBy||c.updatedByUid||c.modifiedBy||c.modifiedByUid,
    role:c.updatedByRole||c.modifiedByRole
  };
  var updated=tms(c.updatedAt||c.lastUpdatedAt||c.modifiedAt);
  if(isFinite(updated)&&!v231IsExcludedSuperAdmin(updater))return updated;
  var traces=allTraceEvents(c).map(function(e){return e.ms;}).filter(isFinite);
  return traces.length?Math.max.apply(Math,traces):NaN;
}
function purchase(c){return c.purchaseOrder||c.ordenCompra||c.oc||c.orderNumber||'';}
function advisor(c){return c.salesAdvisor||c.createdByName||c.advisorName||c.vendedor||'';}
function orderTypeOf(c){
  c=c||{};var explicit=clean(c.orderType||c.orderKind||c.tipoPedido||c.tipo_pedido||c.type||c.caseType).toUpperCase();
  var txt=clean([explicit,c.reference,c.caseNumber,c.pedido,purchase(c),c.pveNumber,c.pvpNumber,c.pvcNumber,c.pvnNumber].join(' ')).toUpperCase();
  if(c.isPve===true||c.pve===true||explicit==='PVE'||/(^|[^A-Z0-9])PVE([^A-Z0-9]|$)/.test(txt))return 'PVE';
  if(c.isPvp===true||c.pvp===true||explicit==='PVP'||/(^|[^A-Z0-9])PVP([^A-Z0-9]|$)/.test(txt))return 'PVP';
  if(c.isPvc===true||c.pvc===true||explicit==='PVC'||/(^|[^A-Z0-9])PVC([^A-Z0-9]|$)/.test(txt))return 'PVC';
  if(c.isPvn===true||c.pvn===true||explicit==='PVN'||/(^|[^A-Z0-9])PVN([^A-Z0-9]|$)/.test(txt))return 'PVN';
  return 'NORMAL';
}
function isPveCase(c){return orderTypeOf(c)==='PVE';}
function vsmTypeLabel(){var v=(($('fOrderType')&&$('fOrderType').value)||'').toUpperCase();return v?'VSM '+(v==='NORMAL'?'normal':v):'VSM general';}
function calendarDaysBetween(start,end){var a=new Date(start),b=new Date(end);if(isNaN(a.getTime())||isNaN(b.getTime())||b<a)return 1;a.setHours(0,0,0,0);b.setHours(0,0,0,0);return Math.max(1,Math.round((b-a)/86400000)+1);}
function perDay(ms,daysCount){return Math.max(0,num(ms))/Math.max(1,Number(daysCount)||1);} 
function metricGroup(rows){rows=rows||[];var n=rows.length,lead=0,va=0,wait=0,dead=0,raw=0;rows.forEach(function(r){lead+=r.leadPerDay||0;va+=r.vaPerDay||0;wait+=r.waitPerDay||0;dead+=r.deadPerDay||0;raw+=r.lead||0;});return {count:n,leadDayAvg:n?lead/n:0,vaDayAvg:n?va/n:0,waitDayAvg:n?wait/n:0,deadDayAvg:n?dead/n:0,rawLeadAvg:n?raw/n:0};}
function isCancelledVsm(c){return !!(c&&(c.cancelledAt||c.excludeFromVsm===true||/cancelad|anulad/i.test(String(c.status||'')+' '+String(c.cancelStatusLabel||'')+' '+String(c.cancellationTypeLabel||''))));}
function cancelTypeOf(c){var raw=String((c&& (c.cancellationTypeLabel||c.cancelStatusLabel||c.cancellationType||c.cancelStatus||c.status))||'').toLowerCase();return /anulad/.test(raw)?'Pedido anulado':'Pedido cancelado';}
function cancellationDateMs(c){return tms(c&& (c.cancelledAt||c.cancellationAt||c.closedAt||c.updatedAt||c.createdAt));}
function cancellationProcessKey(c){var p=(c&&(c.cancelledProcess||c.cancellationProcess||c.cancelProcess||c.cancelledAtProcess||c.currentProcess))||'';return PROCESS[p]?p:(c&&c.currentProcess&&PROCESS[c.currentProcess]?c.currentProcess:'');}
function cancellationUser(c){return (c&&(c.cancelledByName||c.cancellationByName||c.closedByName||c.updatedByName||''))||'';}
function cancellationEvidenceUrl(c){var e=(c&&c.cancellationEvidence)||{};return e.url||e.driveUrl||e.webViewLink||c.cancellationSupportUrl||c.cancelSupportUrl||'';}
function cancellationRow(c){var p=cancellationProcessKey(c);return {c:c,pedido:refOf(c),oc:purchase(c),cliente:c.client||'',asesor:advisor(c),tipo:cancelTypeOf(c),proceso:p,procesoTxt:p?processTitle(p):'Sin proceso trazado',fecha:cancellationDateMs(c),usuario:cancellationUser(c),motivo:c.cancellationReason||c.cancellationDetail||c.cancelReason||c.cancelDetail||'',soporte:cancellationEvidenceUrl(c),estado:c.status||c.cancelStatusLabel||c.cancellationTypeLabel||''};}
function countBy(rows,fn){var map={};(rows||[]).forEach(function(r){var k=fn(r)||'Sin dato';map[k]=(map[k]||0)+1;});return Object.keys(map).map(function(k){return {label:k,count:map[k]};}).sort(function(a,b){return b.count-a.count||a.label.localeCompare(b.label);});}
function isClosed(c){return !!(c.closedAt||c.completedAt||c.finishedAt||c.deliveredAt||/cerrad|finaliz|entregad|cancelad|anulad/i.test(String(c.status||'')));}
function pushDate(out,v){var n=tms(v);if(isFinite(n)&&n>946684800000&&n<4102444800000)out.push(n);}
function minMs(arr){arr=(arr||[]).filter(isFinite).sort(function(a,b){return a-b;});return arr.length?arr[0]:NaN;}
function maxMs(arr){arr=(arr||[]).filter(isFinite).sort(function(a,b){return b-a;});return arr.length?arr[0]:NaN;}
function idOf(c){return String(c.id||c.caseId||'');}
function refOf(c){return String(c.reference||c.caseNumber||c.pedido||c.id||'');}
function buildEventBuckets(){app.eventsByCase={};(app.events||[]).forEach(function(e){var keys=[e.caseId,e.caseReference,e.reference,e.sourceId,e.caseNumber].map(function(x){return String(x||'');}).filter(Boolean);keys.forEach(function(k){app.eventsByCase[k]=app.eventsByCase[k]||[];app.eventsByCase[k].push(e);});});}
function caseEvents(c){var a=(app.eventsByCase[idOf(c)]||[]),b=(app.eventsByCase[refOf(c)]||[]);var seen={},out=[];a.concat(b).forEach(function(e){var k=e.id||[e.timestamp,e.createdAt,e.type,e.detail].join('|');if(!seen[k]){seen[k]=1;out.push(e);}});return out;}
function buildIntervalBuckets(){
  app.processIntervalsByCase={};app.statusIntervalsByCase={};
  function add(target,item){
    var keys=[item.caseId,item.caseReference,item.reference,item.orderNumber].map(function(x){return String(x||'');}).filter(Boolean);
    keys.forEach(function(key){target[key]=target[key]||[];target[key].push(item);});
  }
  (app.processIntervals||[]).forEach(function(item){add(app.processIntervalsByCase,item);});
  (app.statusIntervals||[]).forEach(function(item){add(app.statusIntervalsByCase,item);});
}
function intervalRowsFor(target,c){
  var a=(target[idOf(c)]||[]),b=(target[refOf(c)]||[]),seen={},out=[];
  a.concat(b).forEach(function(item){var key=item.id||item.cloudEventId||[item.caseId,item.process,item.startedAt,item.endedAt].join('|');if(!seen[key]){seen[key]=1;out.push(item);}});
  return out;
}
function caseProcessIntervals(c,p){return intervalRowsFor(app.processIntervalsByCase,c).filter(function(x){return !p||x.process===p;});}
function caseStatusIntervals(c,p){return intervalRowsFor(app.statusIntervalsByCase,c).filter(function(x){return !p||x.process===p;});}
function statusIntervalKind(row){
  var status=lower((row&&row.fromStatus)||'');
  if(/espera|pendiente|bloque|reten|no_entregado|devolucion/.test(status))return 'wait';
  if(/en_proceso|preparacion|ruta|acept|trabajo/.test(status))return 'active';
  return 'dead';
}
function intervalBusinessMs(row){var minutes=num(row&&row.businessMinutes);if(minutes>0)return minutes*60000;return workingMsBetween(row&&row.startedAt,row&&row.endedAt);}
function eventProcess(e,c){var p=e.process||e.currentProcess||e.sourceProcess||e.returnProcess||e.targetProcess||'';if(PROCESS[p])return p;var txt=lower([e.processName,e.detail,e.type,e.reason,e.status].join(' '));for(var i=0;i<FLOW.length;i++){if(txt.indexOf(lower(PROCESS[FLOW[i]]))>=0||txt.indexOf(FLOW[i])>=0)return FLOW[i];}return c.currentProcess||'';}
function eventKind(e){var txt=lower([e.type,e.traceType,e.status,e.detail,e.reason].join(' '));if(/espera|requer|bloque|pendiente|pago|retenid|devolucion|no_entrega/.test(txt))return 'wait';if(/asignad|entrada|cola|dead|recibido|enviado/.test(txt))return 'dead';if(/inicio|trabajo|valor|proceso|acept|conforme|registr|finaliz|cierre|liber/.test(txt))return 'active';return 'dead';}
function collectDatesDeep(c){var out=[],count=0;function add(v){pushDate(out,v);}function scan(o,depth){if(!o||depth>5||count>1800)return;if(Array.isArray(o)){for(var i=0;i<Math.min(o.length,220);i++)scan(o[i],depth+1);return;}if(typeof o!=='object')return;Object.keys(o).forEach(function(k){if(count>1800)return;count++;var v=o[k];if(/(At|Date|fecha|timestamp|time|hora|started|finished|closed|completed|updated|created|released|confirmed|inicio|fin|cierre)/i.test(k))add(v);if(v&&typeof v==='object'&&!(v.toDate||v.seconds||v._seconds))scan(v,depth+1);});}scan(c,0);caseEvents(c).forEach(function(e){scan(e,0);});return out;}
function caseStartMs(c){var vals=[];[c.createdAt,c.created_at,c.requestedAt,c.timestamp,c.caseCreatedAt,c.orderCreatedAt,(c.documentFlow||{}).salesRegisteredAt,(c.documentFlow||{}).createdAt].forEach(function(v){pushDate(vals,v);});var m=minMs(vals);var u=tms(c.updatedAt);if(!isFinite(m)&&isFinite(u))m=u;return isFinite(m)?m:NaN;}
function caseEndMs(c,start){var vals=[];if(isClosed(c)){[c.closedAt,c.completedAt,c.finishedAt,c.deliveredAt,c.closureAt,c.updatedAt].forEach(function(v){pushDate(vals,v);});var m=maxMs(vals);if(isFinite(m)&&m>=start)return m;}
  var u=v231OperationalUpdatedAt(c);if(isFinite(u)&&u>=start)return u;return start;}
function allTraceEvents(c){var out=[];function pick(o,keys){for(var i=0;i<keys.length;i++){var v=o&&o[keys[i]];if(clean(v))return v;}return '';}function add(x){var ms=tms(x.at);if(!isFinite(ms))return;x.ms=ms;out.push(x);}
  (c.stateHistory||[]).forEach(function(h){add({at:h.timestamp||h.createdAt||h.updatedAt||h.at||h.fecha_hora_inicio_estado,process:h.process||h.currentProcess||c.currentProcess,kind:eventKind(h),user:pick(h,['responsibleName','responsableName','userName','byName','createdByName','actorName','name','email']),role:pick(h,['responsibleRole','responsableRole','userRole','createdByRole','role']),uid:pick(h,['responsibleUid','responsableUid','userUid','uid','createdByUid','byUid']),email:pick(h,['responsibleEmail','responsableEmail','userEmail','email','createdByEmail']),detail:h.detail||h.reason||h.type||'',raw:h});});
  (c.flowTrace||[]).forEach(function(h){add({at:h.timestamp||h.createdAt||h.updatedAt||h.at||h.fecha_hora_inicio_estado,process:h.process||h.currentProcess||c.currentProcess,kind:eventKind(h),user:pick(h,['responsibleName','responsableName','userName','byName','createdByName','actorName','name','email']),role:pick(h,['responsibleRole','responsableRole','userRole','createdByRole','role']),uid:pick(h,['responsibleUid','responsableUid','userUid','uid','createdByUid','byUid']),email:pick(h,['responsibleEmail','responsableEmail','userEmail','email','createdByEmail']),detail:h.detail||h.reason||h.type||'',raw:h});});
  caseEvents(c).forEach(function(e){add({at:e.timestamp||e.createdAt||e.updatedAt||e.at,process:eventProcess(e,c),kind:eventKind(e),user:pick(e,['userName','responsibleName','responsableName','createdByName','byName','actorName','displayName','name','email']),role:pick(e,['createdByRole','sourceRole','responsibleRole','responsableRole','userRole','role']),uid:pick(e,['uid','userUid','createdByUid','responsibleUid','responsableUid','byUid']),email:pick(e,['email','userEmail','createdByEmail','responsibleEmail','responsableEmail']),detail:e.detail||e.reason||e.type||'',raw:e});});
  return out.filter(function(e){return !v231IsExcludedSuperAdmin(e);}).sort(function(a,b){return a.ms-b.ms;});
}
function reqStart(r){return r.createdAt||r.sentAt||r.openedAt||r.timestamp||r.at;}
function reqEnd(r,end){return r.answeredAt||r.resolvedAt||r.closedAt||r.completedAt||r.updatedAt||end;}
function reqProcess(r,c){return r.source||r.sourceProcess||r.process||r.returnProcess||r.targetProcess||c.currentProcess||'';}
function reqRows(c,endMs){var rows=[];function addRow(proc,s,e,tipo,user,detalle){if(!isFinite(s))return;if(!isFinite(e)||e<s)e=endMs;rows.push({pedido:refOf(c),proceso:processTitle(proc),process:proc,desde:s,hasta:e,dur:Math.max(0,e-s),tipo:tipo,usuario:user||'',detalle:detalle||''});}
  (c.requirements||[]).forEach(function(r){addRow(reqProcess(r,c),tms(reqStart(r)),tms(reqEnd(r,endMs)),'Requerimiento',r.sentByName||r.answeredByName||r.createdByName||'',(r.reason||'')+(r.detail?' · '+r.detail:'')+(r.answer?' · Rta: '+r.answer:''));});
  if(c.openRequirement){var r=c.openRequirement;addRow(reqProcess(r,c),tms(reqStart(r)||c.waitStartedAt),endMs,'Requerimiento abierto',r.sentByName||'',r.detail||r.reason||'');}
  if(c.waitStartedAt)addRow(c.currentProcess,tms(c.waitStartedAt),endMs,'Espera abierta',c.assignedName||'',c.waitReason||c.waitDetail||c.status||'');
  if(c.salesHold&&(c.salesHold.startedAt||c.salesHold.createdAt)){var sh=c.salesHold;addRow('caja',tms(sh.startedAt||sh.createdAt),tms(sh.releasedAt||sh.closedAt)||endMs,'Espera pago/separación',sh.releasedByName||sh.createdByName||'',sh.detail||sh.status||sh.reason||'');}
  if(c.separationRequest&&(c.separationRequest.waitingPaymentStartedAt||c.separationRequest.createdAt)){var sr=c.separationRequest;addRow('caja',tms(sr.waitingPaymentStartedAt||sr.createdAt),tms(sr.paymentConfirmedAt||sr.releasedAt)||endMs,'Espera pago/separación',sr.paymentConfirmedByName||sr.createdByName||'',sr.paymentConfirmationDetail||sr.detail||'');}
  return rows;
}
function processStatsList(c){var out={},ps=c.processStats||{};Object.keys(ps).forEach(function(p){if(PROCESS[p])out[p]=1;});if(c.currentProcess&&PROCESS[c.currentProcess])out[c.currentProcess]=1;allTraceEvents(c).forEach(function(e){if(PROCESS[e.process])out[e.process]=1;});caseProcessIntervals(c).forEach(function(x){if(PROCESS[x.process])out[x.process]=1;});caseStatusIntervals(c).forEach(function(x){if(PROCESS[x.process])out[x.process]=1;});(c.requirements||[]).forEach(function(r){var p=reqProcess(r,c);if(PROCESS[p])out[p]=1;});if((c.cutRequests||[]).length)out.corte_cable=1;if(!Object.keys(out).length)out[c.currentProcess&&PROCESS[c.currentProcess]?c.currentProcess:'recepcion_pedidos']=1;return Object.keys(out);}
function processMetric(c,p,startMs,endMs){var st=(c.processStats||{})[p]||{};var active=num(st.activeMs||st.valueMs||st.workMs),wait=num(st.waitMs||st.holdMs),dead=num(st.deadMs||st.nvaMs||st.queueMs);if(v231ProcessStatsExcluded(st))active=0;var explicit=active+wait+dead;
  var authoritativeIntervals=caseProcessIntervals(c,p),statusIntervals=caseStatusIntervals(c,p),authoritativeMs=authoritativeIntervals.reduce(function(sum,row){return sum+intervalBusinessMs(row);},0),statusActive=0,statusWait=0,statusDead=0;
  statusIntervals.forEach(function(row){var value=intervalBusinessMs(row),kind=statusIntervalKind(row);if(kind==='active')statusActive+=value;else if(kind==='wait')statusWait+=value;else statusDead+=value;});
  var pEvents=allTraceEvents(c).filter(function(e){return e.process===p;});var dates=[];[st.startedAt,st.enteredAt,st.createdAt,st.activeStartedAt,st.waitStartedAt,st.deadStartedAt].forEach(function(v){pushDate(dates,v);});pEvents.forEach(function(e){dates.push(e.ms);});authoritativeIntervals.forEach(function(row){pushDate(dates,row.startedAt);pushDate(dates,row.endedAt);});statusIntervals.forEach(function(row){pushDate(dates,row.startedAt);pushDate(dates,row.endedAt);});if(c.currentProcess===p)[c.activeStartedAt,c.waitStartedAt,c.deadStartedAt,c.updatedAt].forEach(function(v){pushDate(dates,v);});
  var ps=minMs(dates), pe=maxMs([st.completedAt,st.finishedAt,st.closedAt,st.updatedAt]);if(!isFinite(pe)&&pEvents.length)pe=maxMs(pEvents.map(function(e){return e.ms;}));if(c.currentProcess===p&&!isClosed(c))pe=endMs;
  var timeline=0,tlActive=0,tlWait=0,tlDead=0;if(pEvents.length){for(var i=0;i<pEvents.length;i++){var a=pEvents[i].ms,b=(i<pEvents.length-1?pEvents[i+1].ms:pe);if(!isFinite(b)||b<a)b=a;var d=workingMsBetween(a,b);if(d>0&&d<1000*60*60*24*45){timeline+=d;if(pEvents[i].kind==='wait')tlWait+=d;else if(pEvents[i].kind==='active')tlActive+=d;else tlDead+=d;}}}
  if(authoritativeMs>0){
    var classified=statusActive+statusWait+statusDead;
    if(classified>0){active=statusActive;wait=statusWait;dead=statusDead+Math.max(0,authoritativeMs-classified);}
    else if(explicit>0){var intervalScale=Math.min(1,authoritativeMs/explicit);active*=intervalScale;wait*=intervalScale;dead*=intervalScale;dead+=Math.max(0,authoritativeMs-active-wait-dead);}
    else{active=0;wait=0;dead=authoritativeMs;}
    timeline=authoritativeMs;
  }else{
    if(!active&&tlActive)active=tlActive;if(!wait&&tlWait)wait=tlWait;if(!dead&&tlDead)dead=tlDead;
  }
  if(c.currentProcess===p){if(c.activeStartedAt)active+=workingMsSince(c.activeStartedAt);if(c.waitStartedAt)wait+=workingMsSince(c.waitStartedAt);if(c.deadStartedAt)dead+=workingMsSince(c.deadStartedAt);}
  var req=0;reqRows(c,endMs).forEach(function(r){if(r.process===p||r.proceso===processTitle(p))req+=r.dur;});if(req>wait)wait=req;
  var elapsed=authoritativeMs>0?Math.max(authoritativeMs,active+wait+dead):((isFinite(ps)&&isFinite(pe)&&pe>=ps)?workingMsBetween(ps,pe):0);if(!elapsed)elapsed=Math.max(timeline,active+wait+dead);
  if(!elapsed&&c.currentProcess===p)elapsed=workingMsBetween(startMs,endMs);
  if(!elapsed&&p==='corte_cable'&&(c.cutRequests||[]).length){(c.cutRequests||[]).forEach(function(x){var d=num(x.durationMs)||workingMsBetween(x.startedAt||x.takenAt,x.finishedAt||x.completedAt||x.registeredAt);elapsed+=d;active+=d;});}
  if(elapsed>0 && active+wait+dead>elapsed){var scalePm=elapsed/(active+wait+dead);active=active*scalePm;wait=wait*scalePm;dead=Math.max(0,elapsed-active-wait);}
  if(elapsed>0 && active+wait+dead<elapsed)dead+=elapsed-active-wait-dead;
  if(!elapsed)return null;return {process:p,label:processTitle(p),active:active,wait:wait,dead:dead,total:elapsed,req:req,start:isFinite(ps)?ps:null,finish:isFinite(pe)?pe:null,wip:c.currentProcess===p&&!isClosed(c)};
}
function emailFromText(v){var m=String(v||'').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);return m?m[0].toLowerCase():'';}
function titleName(v){return clean(v).toLowerCase().replace(/\b([a-záéíóúñü])/g,function(a){return a.toUpperCase();});}
function stripUserNoise(v){return clean(v).replace(/<[^>]+>/g,' ').replace(/[()\[\]{}]/g,' ').replace(/\s+/g,' ').trim();}
function personCanonical(raw,role){raw=raw||{};var uid=clean(raw.uid||raw.userUid||raw.id||'');var email=emailFromText(raw.email||raw.userEmail||raw.name||raw.user||'');var name=stripUserNoise(raw.name||raw.user||raw.userName||raw.displayName||raw.email||'');if(email&&name.toLowerCase().indexOf(email)>=0)name=name.replace(email,'').trim();name=name.replace(/\b(usuario|user|sin responsable|sin asignar|pendiente|n\/a|na)\b/ig,' ').replace(/\s+/g,' ').trim();if(!name&&email)name=email.split('@')[0].replace(/[._-]+/g,' ');if(!name&&!email&&!uid)return null;var key=uid?('uid:'+uid):(email?('mail:'+email):('name:'+normKey(name)));return {key:key,name:titleName(name||email||uid),email:email,uid:uid,role:role||raw.role||'',synthetic:false,source:raw.source||'traza'};}
function syntheticPerson(){return {key:'synthetic:sin_responsable_trazado',name:'Sin responsable trazado',email:'',uid:'',role:'No trazado',synthetic:true,source:'sin_traza'};}
function addPerson(map,raw,role){var p=personCanonical(raw,role);if(!p)return;var old=map[p.key];if(!old){map[p.key]=p;return;}if((p.name||'').length>(old.name||'').length)old.name=p.name;if(!old.email&&p.email)old.email=p.email;if(!old.uid&&p.uid)old.uid=p.uid;if(!old.role&&p.role)old.role=p.role;}
function consolidateSimilarUsers(rows){
  function rowName(r){return clean(r.user||r.name||'');}
  function rowNameKey(r){return normKey(rowName(r));}
  function firstToken(k){return (k||'').split('_').filter(Boolean)[0]||'';}
  function samePerson(a,b){
    if(a.synthetic||b.synthetic)return !!(a.synthetic&&b.synthetic);
    if(a.email&&b.email&&lower(a.email)===lower(b.email))return true;
    if(a.uid&&b.uid&&String(a.uid)===String(b.uid))return true;
    var ak=rowNameKey(a),bk=rowNameKey(b);if(!ak||!bk)return false;
    if(ak===bk)return true;
    var at=ak.split('_').filter(Boolean),bt=bk.split('_').filter(Boolean);
    if(firstToken(ak)&&firstToken(ak)===firstToken(bk)){
      if(at.length===1||bt.length===1)return true;
      var common=at.filter(function(x){return bt.indexOf(x)>=0;}).length;
      if(common>=Math.min(at.length,bt.length)&&Math.min(at.length,bt.length)>=2)return true;
    }
    return false;
  }
  function merge(a,b){
    if(String(b.user||'').length>String(a.user||'').length)a.user=b.user;
    if(!a.email&&b.email)a.email=b.email;if(!a.uid&&b.uid)a.uid=b.uid;if(!a.role&&b.role)a.role=b.role;
    a.open+=b.open||0;a.closed+=b.closed||0;a.active+=b.active||0;a.wait+=b.wait||0;a.dead+=b.dead||0;a.total+=b.total||0;a.req+=b.req||0;a.cuts+=b.cuts||0;
    a.cases=a.cases||{};Object.keys(b.cases||{}).forEach(function(k){a.cases[k]=1;});
    a.processes=a.processes||{};Object.keys(b.processes||{}).forEach(function(k){a.processes[k]=(a.processes[k]||0)+(b.processes[k]||0);});
    a.sources=a.sources||{};Object.keys(b.sources||{}).forEach(function(k){a.sources[k]=1;});
    a.aliases=a.aliases||{};if(rowName(b))a.aliases[rowName(b)]=1;if(b.email)a.aliases[b.email]=1;if(b.uid)a.aliases[b.uid]=1;
    return a;
  }
  var out=[];rows.forEach(function(r){var found=null;for(var i=0;i<out.length;i++){if(samePerson(out[i],r)){found=out[i];break;}}if(found)merge(found,r);else{r.aliases={};if(rowName(r))r.aliases[rowName(r)]=1;if(r.email)r.aliases[r.email]=1;if(r.uid)r.aliases[r.uid]=1;out.push(r);}});
  out.forEach(function(r){r.count=Object.keys(r.cases||{}).length||r.count||0;r.avg=r.count?r.total/r.count:0;r.eff=pct(r.active,r.total);r.waitPct=pct(r.wait,r.total);r.deadPct=pct(r.dead,r.total);r.productivity=r.active?+(r.closed/(r.active/3600000)).toFixed(3):0;r.processList=Object.keys(r.processes||{}).map(function(p){return processTitle(p);}).sort().join(', ');var aliasCount=Math.max(0,Object.keys(r.aliases||{}).length-1);r.traceQuality=r.synthetic?'Sin responsable trazado':((r.email||r.uid)?'Alta: usuario trazado':'Nombre trazado')+(aliasCount?' · '+aliasCount+' alias consolidado(s)':'');});
  return out;
}
function personsForProcess(c,p){var map={};
  var st=(c.processStats||{})[p]||{};(st.responsibles||[]).forEach(function(r){addPerson(map,{name:r.name||r.userName||r.email,email:r.email,uid:r.uid||r.userUid,role:r.role,source:'processStats'},r.role);});
  ['responsibleName','responsableName','userName','byName','createdByName','finishedByName','registeredByName','takenByName'].forEach(function(k){if(clean(st[k]))addPerson(map,{name:st[k],email:st[k.replace('Name','Email')]||'',uid:st[k.replace('Name','Uid')]||'',role:st.role||st.userRole,source:'processStats'},st.role||st.userRole);});
  allTraceEvents(c).filter(function(e){return e.process===p;}).forEach(function(e){addPerson(map,{name:e.user,email:e.email,uid:e.uid,role:e.role,source:'traza'},e.role);});
  if(c.currentProcess===p)addPerson(map,{name:c.assignedName,email:c.assignedEmail,uid:c.assignedTo||c.assignedUid,role:c.assignedRole,source:'asignacion_actual'},c.assignedRole);
  if(p==='corte_cable')(c.cutRequests||[]).forEach(function(x){addPerson(map,{name:x.takenByName||x.finishedByName||x.registeredByName,email:x.takenByEmail||x.finishedByEmail||x.registeredByEmail,uid:x.takenByUid||x.finishedBy||x.registeredBy,role:'auxiliar_corte',source:'corte'},'auxiliar_corte');});
  if(p==='recepcion_pedidos')addPerson(map,{name:c.receptionByName||c.receivedByName,email:c.receptionByEmail||'',uid:c.receptionByUid||'',role:'coordinador_logistico',source:'recepcion'},'coordinador_logistico');
  if(p==='alistamiento'){(c.assignedUsers||[]).forEach(function(u){addPerson(map,{name:u.name||u.userName||u.email,email:u.email,uid:u.uid||u.userUid,role:'aux_logistica',source:'asignacion_alistamiento'},'aux_logistica');});}
  var out=Object.keys(map).map(function(k){return map[k];}).filter(function(person){return !v231IsExcludedSuperAdmin(person);});return out.length?out:[syntheticPerson()];}

function reportHiddenFromVsm(r){return !!(r && (r.hiddenFromMain===true || r.mergedIntoReportId || r.status==="MIGRADO_AL_HILO" || r.status==="CERRADO_MIGRADO"));}
function reportCaseTokens(r){
  var vals=[r&&r.sourceId,r&&r.caseId,r&&r.sourceCaseId,r&&r.caseUid,r&&r.sourceReference,r&&r.caseReference,r&&r.reference,r&&r.pedido,r&&r.orderNumber].map(function(x){return clean(x);}).filter(Boolean);
  return vals.map(normKey).filter(Boolean);
}
function reportMatchesCase(r,c){
  var rt=reportCaseTokens(r);if(!rt.length||!c)return false;
  var cv=[idOf(c),refOf(c),c.reference,c.caseNumber,c.pedido,c.orderNumber,purchase(c)].map(function(x){return normKey(x);}).filter(Boolean);
  return cv.some(function(x){return rt.indexOf(x)>=0;});
}
function reportThreadRows(r){
  var rows=[];
  function add(x,initial){
    if(!x)return;
    var t=tms(x.createdAt||x.at||x.timestamp||x.updatedAt);
    if(!isFinite(t))return;
    rows.push({at:t,comment:x.comment||x.detail||x.description||'',user:x.userName||x.createdByName||x.managedByName||'',status:x.status||'',initial:!!initial});
  }
  add({createdAt:r.createdAt,comment:r.detail||r.description,userName:r.createdByName,status:r.status},true);
  (r.noveltyThread||[]).forEach(function(x){add(x,!!x.isInitialNovelty);});
  (r.managementComments||[]).forEach(function(x){add(x,false);});
  return rows.sort(function(a,b){return a.at-b.at;});
}
function firstReportResponseAt(r){
  var created=tms(r.createdAt||r.updatedAt),candidates=[];
  (r.managementComments||[]).forEach(function(x){
    if(v231IsExcludedSuperAdmin(x))return;
    var t=tms(x.createdAt||x.at||x.timestamp);
    if(isFinite(t)&&(!isFinite(created)||t>created))candidates.push(t);
  });
  (r.noveltyThread||[]).forEach(function(x){
    if(x.isInitialNovelty||v231IsExcludedSuperAdmin(x))return;
    var t=tms(x.createdAt||x.at||x.timestamp);
    if(isFinite(t)&&(!isFinite(created)||t>created))candidates.push(t);
  });
  [
    {at:r.salesResponseAt,name:r.salesRespondedByName,email:r.salesRespondedByEmail,uid:r.salesRespondedBy,role:r.salesRespondedByRole},
    {at:r.managedAt,name:r.managedByName,email:r.managedByEmail,uid:r.managedBy,role:r.managedByRole},
    {at:r.closedAt,name:r.closedByName,email:r.closedByEmail,uid:r.closedBy,role:r.closedByRole},
    {at:r.finalizedAt,name:r.finalizedByName,email:r.finalizedByEmail,uid:r.finalizedBy,role:r.finalizedByRole}
  ].forEach(function(x){
    if(v231IsExcludedSuperAdmin(x))return;
    var t=tms(x.at);
    if(isFinite(t)&&(!isFinite(created)||t>created))candidates.push(t);
  });
  if(!candidates.length)return null;
  return Math.min.apply(null,candidates);
}
function reportResponseMetric(r){
  var created=tms(r.createdAt||r.updatedAt), first=firstReportResponseAt(r), closed=tms(r.closedAt||r.finalizedAt), now=nowMs();
  var responseEnd=isFinite(first)?first:now;
  var closeEnd=isFinite(closed)?closed:null;
  var thread=reportThreadRows(r);
  var updates=Math.max(thread.length,(r.managementComments||[]).length+(r.noveltyThread||[]).length);
  return {report:r,id:r.id,title:r.title||r.category||r.sourceModule||'Novedad',reference:r.sourceReference||r.sourceId||'',status:r.status||'',severity:r.severity||'',created:created,firstResponse:first,responseMs:isFinite(created)?workingMsBetween(created,responseEnd):0,closeMs:(isFinite(created)&&closeEnd)?workingMsBetween(created,closeEnd):0,pending:!first,updates:updates,thread:thread};
}
function reportMetricsForCase(c){
  return (app.reports||[]).filter(function(r){return !v231IsExcludedSuperAdmin(r)&&!reportHiddenFromVsm(r)&&reportMatchesCase(r,c);}).map(reportResponseMetric);
}
function caseMetric(c){var start=caseStartMs(c);var missingStart=!isFinite(start);if(missingStart)start=tms(c.updatedAt)||nowMs();var end=caseEndMs(c,start);if(!isFinite(end)||end<start)end=start;var waitRows=reqRows(c,end),pRows=[],va=0,wait=0,dead=0,req=waitRows.filter(function(r){return /requer/i.test(r.tipo);}).reduce(function(s,r){return s+r.dur;},0),bottle={label:'',total:0};
  processStatsList(c).forEach(function(p){var pm=processMetric(c,p,start,end);if(!pm)return;pRows.push(pm);va+=pm.active;wait+=pm.wait;dead+=pm.dead;if(pm.total>bottle.total)bottle={label:pm.label,total:pm.total};});
  var explicitTotal=0;Object.keys(c.processStats||{}).forEach(function(k){var st=(c.processStats||{})[k]||{};explicitTotal+=num(st.activeMs)+num(st.waitMs)+num(st.deadMs);});
  var pTotal=pRows.reduce(function(s,r){return s+r.total;},0),extraWait=waitRows.reduce(function(s,r){return s+r.dur;},0);if(extraWait>wait)wait=extraWait;
  var baseLead=workingMsBetween(start,end),lead=baseLead;
  if(lead>0 && va+wait+dead>lead){var scaleCase=lead/(va+wait+dead);va=va*scaleCase;wait=wait*scaleCase;dead=Math.max(0,lead-va-wait);}
  if(lead>0&&va+wait+dead<lead)dead+=lead-va-wait-dead;
  if(va>lead)va=lead;if(wait>Math.max(0,lead-va))wait=Math.max(0,lead-va);if(dead>Math.max(0,lead-va-wait))dead=Math.max(0,lead-va-wait);
  if(!pRows.length&&lead>0){var cp=c.currentProcess&&PROCESS[c.currentProcess]?c.currentProcess:'recepcion_pedidos';var pm2={process:cp,label:processTitle(cp),active:0,wait:0,dead:lead,total:lead,req:0,start:start,finish:end,wip:!isClosed(c)};pRows.push(pm2);dead=lead;bottle={label:pm2.label,total:pm2.total};}
  var orderDays=calendarDaysBetween(start,end),orderType=orderTypeOf(c);
  var reportRows=reportMetricsForCase(c),reportResponse=reportRows.reduce(function(s,r){return s+r.responseMs;},0),reportPending=reportRows.filter(function(r){return r.pending;}).length;
  return {c:c,start:start,end:end,lead:lead,va:va,wait:wait,req:req,dead:dead,closed:isClosed(c),pRows:pRows,waitRows:waitRows,reportRows:reportRows,reportResponse:reportResponse,reportPending:reportPending,bottleneck:bottle,missingStart:missingStart,orderDays:orderDays,orderType:orderType,leadPerDay:perDay(lead,orderDays),vaPerDay:perDay(va,orderDays),waitPerDay:perDay(wait,orderDays),deadPerDay:perDay(dead,orderDays),reportResponsePerDay:perDay(reportResponse,orderDays)};
}
async function computeBase(cases,cancelledCases){loading(true,'Calculando métricas VSM reales por lotes...');buildEventBuckets();var reconciliation=vsmReconciliation(cases,cancelledCases);var rows=[],byP={},byU={},byUP={},waitRows=[],cutRows=[],reportRows=[],incomplete=0;for(var i=0;i<cases.length;i++){var cm=caseMetric(cases[i]);rows.push(cm);if(cm.missingStart)incomplete++;cm.waitRows.forEach(function(w){waitRows.push(w);});cm.reportRows.forEach(function(r){reportRows.push(Object.assign({pedido:refOf(cases[i]),cliente:cases[i].client||""},r));});cm.pRows.forEach(function(p){var a=byP[p.process]||(byP[p.process]={process:p.process,label:p.label,cases:0,wip:0,active:0,wait:0,dead:0,total:0,req:0,cuts:0,doneCuts:0});a.cases++;if(p.wip)a.wip++;a.active+=p.active;a.wait+=p.wait;a.dead+=p.dead;a.total+=p.total;a.req+=p.req;if(p.process==='corte_cable'){a.cuts+=(cases[i].cutRequests||[]).length;a.doneCuts+=(cases[i].cutRequests||[]).filter(function(x){return x.status==='FINALIZADO'||x.registeredAt||x.noCutNeeded||x.measureComplete||x.medidaCompleta;}).length;}var people=personsForProcess(cases[i],p.process);var real=people.filter(function(x){return !x.synthetic;});var use=real.length?real:people,div=Math.max(1,use.length);use.forEach(function(person){var u=byU[person.key]||(byU[person.key]={key:person.key,user:person.name,email:person.email||'',uid:person.uid||'',role:person.role,synthetic:!!person.synthetic,cases:{},open:0,closed:0,active:0,wait:0,dead:0,total:0,req:0,cuts:0,processes:{},sources:{}});if((person.name||'').length>(u.user||'').length)u.user=person.name;if(!u.email&&person.email)u.email=person.email;if(!u.uid&&person.uid)u.uid=person.uid;if(!u.role&&person.role)u.role=person.role;u.sources[person.source||'traza']=1;u.processes[p.process]=(u.processes[p.process]||0)+p.total/div;if(!u.cases[idOf(cases[i])]){u.cases[idOf(cases[i])]=1;if(isClosed(cases[i]))u.closed++;else u.open++;}u.active+=p.active/div;u.wait+=p.wait/div;u.dead+=p.dead/div;u.total+=p.total/div;u.req+=p.req/div;if(p.process==='corte_cable')u.cuts+=(cases[i].cutRequests||[]).length/div;var uk=person.key+'|'+p.process,up=byUP[uk]||(byUP[uk]={key:person.key,user:person.name,email:person.email||'',uid:person.uid||'',role:person.role,synthetic:!!person.synthetic,process:p.process,label:p.label,cases:{},open:0,closed:0,active:0,wait:0,dead:0,total:0,req:0,cuts:0});if((person.name||'').length>(up.user||'').length)up.user=person.name;if(!up.cases[idOf(cases[i])]){up.cases[idOf(cases[i])]=1;if(isClosed(cases[i]))up.closed++;else up.open++;}up.active+=p.active/div;up.wait+=p.wait/div;up.dead+=p.dead/div;up.total+=p.total/div;up.req+=p.req/div;if(p.process==='corte_cable')up.cuts+=(cases[i].cutRequests||[]).length/div;});});(cases[i].cutRequests||[]).forEach(function(x){var ini=tms(x.startedAt||x.takenAt||x.createdAt),fin=tms(x.finishedAt||x.completedAt||x.registeredAt||x.measureCompleteAt||x.noCutNeededAt);cutRows.push({pedido:refOf(cases[i]),cliente:cases[i].client||'',corte:x.code||x.id||'',referencia:x.referencia||x.descripcion||'',metros:x.metrosSolicitados||x.metrajeFinal||'',estado:x.status||'',responsable:x.takenByName||x.finishedByName||x.registeredByName||'',inicio:ini,fin:fin,duracion:num(x.durationMs)||((isFinite(ini)&&isFinite(fin))?Math.max(0,fin-ini):0),modo:x.noCutNeeded||x.siesaExportStatus==='NO_APLICA_NO_NECESITA_CORTE'?'No necesita corte':(x.measureComplete||x.medidaCompleta||x.siesaExportStatus==='NO_APLICA_MEDIDA_COMPLETA'?'Medida completa':'Corte físico'),legacyRegister:x.siesaBatchId||x.siesaExportStatus||''});});if(i%25===0){loading(true,(i+1)+' / '+cases.length);await sleep(0);}}
  var processRows=Object.keys(byP).map(function(k){var r=byP[k];r.avg=r.cases?r.total/r.cases:0;r.eff=pct(r.active,r.total);r.waitPct=pct(r.wait,r.total);r.deadPct=pct(r.dead,r.total);return r;}).sort(function(a,b){return b.avg-a.avg;});
  var userRows=consolidateSimilarUsers(Object.keys(byU).map(function(k){var r=byU[k];r.count=Object.keys(r.cases).length;r.avg=r.count?r.total/r.count:0;r.eff=pct(r.active,r.total);r.waitPct=pct(r.wait,r.total);r.deadPct=pct(r.dead,r.total);r.productivity=r.active?+(r.closed/(r.active/3600000)).toFixed(3):0;r.processList=Object.keys(r.processes).map(function(p){return processTitle(p);}).sort().join(', ');r.traceQuality=r.synthetic?'Sin responsable trazado':(r.email||r.uid?'Alta: usuario trazado':'Nombre trazado');return r;})).filter(function(r){return !v231IsExcludedSuperAdmin(r);}).sort(function(a,b){return b.total-a.total;});
  var userProcessRows=Object.keys(byUP).map(function(k){var r=byUP[k];r.count=Object.keys(r.cases).length;r.avg=r.count?r.total/r.count:0;r.eff=pct(r.active,r.total);r.waitPct=pct(r.wait,r.total);r.deadPct=pct(r.dead,r.total);return r;}).filter(function(r){return !v231IsExcludedSuperAdmin(r);}).sort(function(a,b){return b.avg-a.avg;});
  var leadTotal=rows.reduce(function(s,r){return s+r.lead;},0),va=rows.reduce(function(s,r){return s+r.va;},0),wait=rows.reduce(function(s,r){return s+r.wait;},0),dead=rows.reduce(function(s,r){return s+r.dead;},0),closed=rows.filter(function(r){return r.closed;}).length,wip=rows.length-closed,bottleneck=processRows[0]||null;
  var sortedLead=rows.map(function(r){return r.lead;}).sort(function(a,b){return a-b;});function perc(p){if(!sortedLead.length)return 0;var idx=Math.min(sortedLead.length-1,Math.max(0,Math.ceil((p/100)*sortedLead.length)-1));return sortedLead[idx];}
  var startMin=minMs(rows.map(function(r){return r.start;})),endMax=maxMs(rows.map(function(r){return r.end;})),periodDays=(isFinite(startMin)&&isFinite(endMax)&&endMax>startMin)?Math.max(1,(endMax-startMin)/86400000):1;
  var reqCases={};waitRows.forEach(function(w){if(/requer/i.test(w.tipo))reqCases[w.pedido]=1;});var totalCuts=cutRows.length,doneCuts=cutRows.filter(function(x){return /final|medida completa|no necesita/i.test([x.estado,x.modo].join(' '));}).length;var cancelRows=(cancelledCases||[]).map(cancellationRow).sort(function(a,b){return (b.fecha||0)-(a.fecha||0);});var cancelByType=countBy(cancelRows,function(r){return r.tipo;});var cancelByProcess=countBy(cancelRows,function(r){return r.procesoTxt;});var cancelByAdvisor=countBy(cancelRows,function(r){return r.asesor||'Sin asesor trazado';});var cancelados=cancelRows.filter(function(r){return /cancelad/i.test(r.tipo);}).length;var anulados=cancelRows.filter(function(r){return /anulad/i.test(r.tipo);}).length;var leadDayTotal=rows.reduce(function(s,r){return s+(r.leadPerDay||0);},0),vaDayTotal=rows.reduce(function(s,r){return s+(r.vaPerDay||0);},0),waitDayTotal=rows.reduce(function(s,r){return s+(r.waitPerDay||0);},0),deadDayTotal=rows.reduce(function(s,r){return s+(r.deadPerDay||0);},0);var normalGroup=metricGroup(rows.filter(function(r){return ['NORMAL','PVN','PVC'].indexOf(r.orderType)>=0;})),pveGroup=metricGroup(rows.filter(function(r){return r.orderType==='PVE';})),pvpGroup=metricGroup(rows.filter(function(r){return r.orderType==='PVP';}));var reportResponseTotal=reportRows.reduce(function(s,r){return s+r.responseMs;},0),reportAnswered=reportRows.filter(function(r){return !r.pending;}).length,reportPending=reportRows.filter(function(r){return r.pending;}).length,reportResponseAvg=reportRows.length?reportResponseTotal/reportRows.length:0;
  app.metrics={loadedTotal:reconciliation.loaded,filterBase:reconciliation.base,notTraced:reconciliation.notTraced,excludedKpi:reconciliation.excluded,notTracedRows:reconciliation.notTracedRows,cases:rows.length,closed:closed,wip:wip,leadAvg:rows.length?leadTotal/rows.length:0,leadP50:perc(50),leadP90:perc(90),leadDayAvg:rows.length?leadDayTotal/rows.length:0,vaDayAvg:rows.length?vaDayTotal/rows.length:0,waitDayAvg:rows.length?waitDayTotal/rows.length:0,deadDayAvg:rows.length?deadDayTotal/rows.length:0,throughput:+(closed/periodDays).toFixed(2),eff:pct(va,leadTotal),waitPct:pct(wait,leadTotal),deadPct:pct(dead,leadTotal),caseRows:rows.sort(function(a,b){return b.leadPerDay-a.leadPerDay||b.lead-a.lead;}),processRows:processRows,userRows:userRows,userProcessRows:userProcessRows,waitRows:waitRows.sort(function(a,b){return b.dur-a.dur;}),reportRows:reportRows.sort(function(a,b){return b.responseMs-a.responseMs;}),reportResponseTotal:reportResponseTotal,reportResponseAvg:reportResponseAvg,reportAnswered:reportAnswered,reportPending:reportPending,reportCount:reportRows.length,cutRows:cutRows,bottleneck:bottleneck,leadTotal:leadTotal,va:va,wait:wait,dead:dead,incomplete:incomplete,reqCount:waitRows.filter(function(w){return /requer/i.test(w.tipo);}).length,reqRate:pct(Object.keys(reqCases).length,rows.length),waitAvg:rows.length?wait/rows.length:0,vaAvg:rows.length?va/rows.length:0,waitCount:waitRows.length,totalCuts:totalCuts,doneCuts:doneCuts,cancelRows:cancelRows,cancelTotal:cancelRows.length,cancelados:cancelados,anulados:anulados,cancelByType:cancelByType,cancelByProcess:cancelByProcess,cancelByAdvisor:cancelByAdvisor,normalGroup:normalGroup,pveGroup:pveGroup,pvpGroup:pvpGroup,vsmType:vsmTypeLabel()};loading(false);}
function table(headers,rows){return '<thead><tr>'+headers.map(function(h){return '<th>'+esc(h)+'</th>';}).join('')+'</tr></thead><tbody>'+rows.join('')+'</tbody>';}
function bar(p){p=Math.max(0,Math.min(100,Number(p)||0));return '<div class="bar"><i style="width:'+p+'%"></i></div>';}
function chartRows(rows,valueFn,labelFn,metaFn,maxValue){rows=rows||[];var max=maxValue||rows.reduce(function(m,r){return Math.max(m,valueFn(r)||0);},0)||1;return rows.map(function(r){var v=valueFn(r)||0;return '<div class="chart-row"><b title="'+esc(labelFn(r))+'">'+esc(labelFn(r))+'</b><div class="chart-track"><i style="width:'+Math.min(100,(v/max)*100)+'%"></i></div><span>'+esc(metaFn(r))+'</span></div>';}).join('')||'<p class="muted">Sin datos reales suficientes.</p>';}
function stackTime(m){var total=Math.max(1,m.leadTotal||0),va=pct(m.va,total),wait=pct(m.wait,total),dead=pct(m.dead,total);return '<div class="stack"><i class="va" style="width:'+va+'%"></i><i class="wait" style="width:'+wait+'%"></i><i class="dead" style="width:'+dead+'%"></i></div><div class="legend"><span><i class="dot va"></i>VA '+va+'%</span><span><i class="dot wait"></i>Espera '+wait+'%</span><span><i class="dot dead"></i>NVA '+dead+'%</span></div>';}
function renderPowerCharts(){
  var m=app.metrics;if(!m)return;
  var users=m.userRows.filter(function(r){return !r.synthetic;});
  var wipRows=m.processRows.filter(function(r){return r.wip>0;}).sort(function(a,b){return b.wip-a.wip;});
  var waitTop=m.waitRows.slice(0,8);
  var pc=$('powerCharts');
  if(pc)pc.innerHTML=''+
    '<article class="power-card"><h3>Composición de tiempo</h3>'+stackTime(m)+'<div class="subgrid" style="margin-top:12px"><div class="mini-kpi"><span>Ocupación</span><strong>'+timeUnit(m.va)+'</strong></div><div class="mini-kpi"><span>Espera/bloqueo</span><strong>'+timeUnit(m.wait)+'</strong></div><div class="mini-kpi"><span>NVA</span><strong>'+timeUnit(m.dead)+'</strong></div><div class="mini-kpi"><span>LT total</span><strong>'+timeUnit(m.leadTotal)+'</strong></div></div></article>'+
    '<article class="power-card"><h3>Cancelados / anulados</h3><div class="subgrid"><div class="mini-kpi"><span>Excluidos</span><strong>'+m.cancelTotal+'</strong></div><div class="mini-kpi"><span>Cancelados</span><strong>'+m.cancelados+'</strong></div><div class="mini-kpi"><span>Anulados</span><strong>'+m.anulados+'</strong></div><div class="mini-kpi"><span>Con soporte</span><strong>'+m.cancelRows.filter(function(r){return !!r.soporte;}).length+'</strong></div></div><h4>Por proceso</h4>'+chartRows(m.cancelByProcess.slice(0,6),function(r){return r.count;},function(r){return r.label;},function(r){return r.count+' pedido(s)';})+'</article>'+
    '<article class="power-card"><h3>LT por proceso</h3>'+chartRows(m.processRows.slice(0,8),function(r){return r.avg;},function(r){return r.label;},function(r){return timeUnit(r.avg);})+'</article>'+
    '<article class="power-card"><h3>Ocupación por usuario</h3>'+chartRows(users.slice(0,8),function(r){return r.active;},function(r){return r.user;},function(r){return timeUnit(r.active)+' · '+r.count+' casos';})+'</article>'+
    '<article class="power-card"><h3>WIP por proceso</h3>'+chartRows(wipRows.slice(0,8),function(r){return r.wip;},function(r){return r.label;},function(r){return r.wip+' abiertos';})+'</article>'+
    '<article class="power-card"><h3>Mayores esperas</h3>'+chartRows(waitTop,function(r){return r.dur;},function(r){return r.proceso+' · '+r.tipo;},function(r){return timeUnit(r.dur);})+'</article>'+
    '<article class="power-card"><h3>Pedidos con mayor LT</h3>'+chartRows(m.caseRows.slice(0,8),function(r){return r.lead;},function(r){return refOf(r.c)+' · '+(r.c.client||'');},function(r){return timeUnit(r.lead);})+'</article>';
  var dk=$('deepKpis');
  if(dk)dk.innerHTML=''+
    '<article class="card kpi"><span>Tasa requerimientos</span><strong>'+m.reqRate+'%</strong><small>Pedidos con bloqueo.</small></article>'+
    '<article class="card kpi"><span>Espera prom.</span><strong>'+timeUnit(m.waitAvg)+'</strong><small>Por pedido.</small></article>'+
    '<article class="card kpi"><span>Ocupación prom.</span><strong>'+timeUnit(m.vaAvg)+'</strong><small>Por pedido.</small></article>'+
    '<article class="card kpi"><span>Cortes resueltos</span><strong>'+m.doneCuts+'/'+m.totalCuts+'</strong><small>Finalizados o no aplica.</small></article>'+
    '<article class="card kpi"><span>Excluidos</span><strong>'+m.cancelTotal+'</strong><small>Cancelados/anulados.</small></article>'+
    '<article class="card kpi"><span>Usuarios activos</span><strong>'+users.length+'</strong><small>Con trazabilidad.</small></article>'+
    '<article class="card kpi"><span>QA datos</span><strong>'+(m.incomplete?'Revisar':'OK')+'</strong><small>'+m.incomplete+' sin fecha base.</small></article>';
}
function kpiCard(title,value,meaning,formula){return '<article class="card kpi"><span>'+esc(title)+'</span><strong>'+esc(value)+'</strong><small>'+esc(meaning)+'</small>'+(formula?'<em class="tag">'+esc(formula)+'</em>':'')+'</article>';}
function renderSummary(){
  var m=app.metrics;if(!m)return;
  var split='<section class="grid vsm-split" style="grid-template-columns:repeat(auto-fit,minmax(260px,1fr));margin-top:10px">'
    +'<article class="card"><h3>Flujo estándar</h3><p class="muted">Pedidos NORMAL, PVN y PVC.</p><div class="subgrid"><div class="mini-kpi"><span>Pedidos</span><strong>'+m.normalGroup.count+'</strong></div><div class="mini-kpi"><span>LT hábil/día</span><strong>'+timeUnit(m.normalGroup.leadDayAvg)+'</strong></div><div class="mini-kpi"><span>Ocupación/día</span><strong>'+timeUnit(m.normalGroup.vaDayAvg)+'</strong></div><div class="mini-kpi"><span>Espera+NVA/día</span><strong>'+timeUnit(m.normalGroup.waitDayAvg+m.normalGroup.deadDayAvg)+'</strong></div></div></article>'
    +'<article class="card"><h3>VSM PVE</h3><p class="muted">Pedido especial con paso por Compras.</p><div class="subgrid"><div class="mini-kpi"><span>Pedidos</span><strong>'+m.pveGroup.count+'</strong></div><div class="mini-kpi"><span>LT hábil/día</span><strong>'+timeUnit(m.pveGroup.leadDayAvg)+'</strong></div><div class="mini-kpi"><span>Ocupación/día</span><strong>'+timeUnit(m.pveGroup.vaDayAvg)+'</strong></div><div class="mini-kpi"><span>Espera+NVA/día</span><strong>'+timeUnit(m.pveGroup.waitDayAvg+m.pveGroup.deadDayAvg)+'</strong></div></div></article>'
    +'<article class="card"><h3>VSM PVP</h3><p class="muted">Nuevo tipo de pedido con el flujo operativo estándar.</p><div class="subgrid"><div class="mini-kpi"><span>Pedidos</span><strong>'+m.pvpGroup.count+'</strong></div><div class="mini-kpi"><span>LT hábil/día</span><strong>'+timeUnit(m.pvpGroup.leadDayAvg)+'</strong></div><div class="mini-kpi"><span>Ocupación/día</span><strong>'+timeUnit(m.pvpGroup.vaDayAvg)+'</strong></div><div class="mini-kpi"><span>Espera+NVA/día</span><strong>'+timeUnit(m.pvpGroup.waitDayAvg+m.pvpGroup.deadDayAvg)+'</strong></div></div></article>'
    +'</section>';
  $('summary').innerHTML=[
    ['Tipo VSM',m.vsmType,'Filtro activo.','General / Normal / PVN / PVC / PVE / PVP'],['Base cargada',m.loadedTotal||0,'Pedidos leídos desde Firestore.','Base'],['Trazados VSM',m.cases,'Pedidos operativos incluidos.','LT'],['Cancelados/anulados',m.cancelTotal||0,'Trazados aparte sin dañar LT.','Control'],['No trazados',m.notTraced||0,'Revisar clasificación o datos.','QA'],
    ['LT hábil/día',timeUnit(m.leadDayAvg),'Lead Time normalizado.','h o min'],
    ['LT total prom.',timeUnit(m.leadAvg),'Demora punta a punta.','h o min'],
    ['Ocupación/día',timeUnit(m.vaDayAvg),'Tiempo tramitando.','VA'],
    ['Espera/día',timeUnit(m.waitDayAvg),'Bloqueos y requerimientos.','Espera'],
    ['NVA/día',timeUnit(m.deadDayAvg),'Tiempo muerto/no clasificado.','NVA'],
    ['% Ocupación',m.eff+'%','Valor sobre LT.','VA/LT'],
    ['% Espera',m.waitPct+'%','Espera sobre LT.','Espera/LT'],
    ['% tiempo de espera acumulado',m.deadPct+'%','NVA sobre LT.','NVA/LT'],
    ['Throughput',m.throughput,'Cerrados por día.','Pedidos/día'],
    ['WIP',m.wip,'Pedidos abiertos.','En proceso'],
    ['Requerimientos',m.reqCount,'Bloqueos trazados.','Eventos'],
    ['Novedades',m.reportCount||0,'Reportes vinculados a pedidos.','Hilos'],['Resp. novedad',timeUnit(m.reportResponseAvg||0),'Tiempo hábil hasta primera respuesta.','h hábiles'],['Pend. respuesta',m.reportPending||0,'Novedades sin respuesta trazada.','Pendientes'],['Calidad datos',m.incomplete?'Revisar '+m.incomplete:'OK',m.incomplete?'Falta fecha base.':'Fechas válidas.','QA']
  ].map(function(c){return kpiCard(c[0],c[1],c[2],c[3]);}).join('')+'<section class="vsm-reconcile"><strong>Conciliación:</strong> base cargada '+(m.loadedTotal||0)+' · filtro principal '+(m.filterBase||0)+' · trazados VSM '+m.cases+' · cancelados/anulados '+(m.cancelTotal||0)+' · excluidos KPI '+(m.excludedKpi||0)+' · no trazados '+(m.notTraced||0)+'</section>'+split;
  var b=m.bottleneck;
  $('bottleneck').innerHTML=b?'<p><strong>'+esc(b.label)+'</strong></p><p>Mayor demora promedio: '+timeUnit(b.avg)+' por caso.</p>'+bar(100)+'<p class="muted">Casos: '+b.cases+' · WIP: '+b.wip+' · Ocupación: '+b.eff+'% · Espera: '+b.waitPct+'%</p>':'<p class="muted">Sin datos suficientes.</p>';
  var qb=$('quickBars');
  if(qb)qb.innerHTML='<article class="card"><h3>Top procesos por demora</h3>'+m.processRows.slice(0,6).map(function(r){return '<p><strong>'+esc(r.label)+'</strong><span class="muted"> · '+timeUnit(r.avg)+' prom. · Ocupación '+r.eff+'%</span></p>'+bar(Math.min(100,(r.avg/(m.processRows[0]?m.processRows[0].avg:1))*100));}).join('')+'</article><article class="card"><h3>Pedidos con mayor LT hábil/día</h3>'+m.caseRows.slice(0,6).map(function(r){return '<p><strong>'+esc(refOf(r.c))+'</strong><span class="muted"> · '+esc(r.orderType)+' · '+timeUnit(r.leadPerDay)+'/día · '+r.orderDays+' día(s)</span></p>'+bar(Math.min(100,(r.leadPerDay/(m.caseRows[0]?m.caseRows[0].leadPerDay:1))*100));}).join('')+'</article>';
  var la=$('ltProductivityAnalysis');if(la)la.innerHTML=productivityHtml(m);
  renderPowerCharts();
}

function qaBadge(r){
  if(r.missingStart)return '<span class="badge bad">Revisar fecha</span>';
  if(r.notTraced)return '<span class="badge warn">QA</span>';
  return '<span class="badge ok">OK</span>';
}
function vsmCard(r){
  var c=r.c||{},resp=r.reportRows&&r.reportRows.length?'<strong>'+timeUnit(r.reportResponse)+'</strong><small>'+r.reportRows.length+' novedad(es) · '+r.reportPending+' pend.</small>':'<strong>Sin novedad</strong><small>Sin reporte asociado</small>';
  var stateBadge=isClosed(c)?'<span class="badge ok">Cerrado</span>':(isCancelledVsm(c)?'<span class="badge bad">Cancelado</span>':'<span class="badge warn">Abierto</span>');
  return '<article class="vsm-order-card">'
    +'<div class="vsm-order-head"><div class="vsm-order-title"><strong>'+esc(refOf(c))+'</strong><small>'+esc(c.client||'Sin cliente')+' · OC '+esc(purchase(c)||'N/A')+'</small></div><div class="vsm-badges"><span class="badge dark">'+esc(r.orderType||'GENERAL')+'</span>'+stateBadge+qaBadge(r)+'</div></div>'
    +'<div class="vsm-order-metrics">'
      +'<div class="vsm-metric"><span>LT hábil/día</span><strong>'+timeUnit(r.leadPerDay)+'</strong><small>'+r.orderDays+' día(s)</small></div>'
      +'<div class="vsm-metric"><span>LT total</span><strong>'+timeUnit(r.lead)+'</strong><small>'+fmt(r.lead)+'</small></div>'
      +'<div class="vsm-metric"><span>Ocupación</span><strong>'+pct(r.va,r.lead)+'%</strong><small>'+timeUnit(r.va)+'</small></div>'
    +'</div>'
    +timeSplitHtml(r.va,r.wait,r.dead)
    +'<div class="vsm-card-foot"><div><strong>Proceso actual</strong>'+esc(processTitle(c.currentProcess))+'<br><span class="muted">'+esc(c.status||'Sin estado')+'</span></div><div><strong>Respuesta novedades</strong>'+resp+'</div><div><strong>Cuello de botella</strong>'+esc((r.bottleneck&&r.bottleneck.label)||'Sin cuello trazado')+'</div><div><strong>Asesor / responsable</strong>'+esc(advisor(c)||c.assignedName||'Sin responsable trazado')+'</div></div>'
  +'</article>';
}
function principalVsmHtml(rows){
  if(!rows.length)return '<section class="vsm-empty"><strong>Sin pedidos para mostrar.</strong><br>Revise filtros, rango de fechas o cargue histórico.</section>';
  return '<section class="vsm-main-grid">'+rows.map(vsmCard).join('')+'</section>';
}
function resetVsmFiltersBase(){
  ['fFrom','fTo','fProcess','fStatus','fUser','fSearch'].forEach(function(id){if($(id))$(id).value='';});
  if($('fOrderType'))$('fOrderType').value='';
  if($('fView'))$('fView').value='principal';
  refresh().catch(function(e){loading(false);status('Error limpiando filtros: '+esc(e.message||e),'bad');});
}
function renderTable(){
  var view=$('fView').value,m=app.metrics;if(!m)return;var html='',title='',count=0;
  if(view==='procesos'){
    title='Lead time por proceso';count=m.processRows.length;html=table(['Macroproceso','Casos','WIP','LT prom.','Total','Ocupación','Espera','NVA','% VA','% Espera','% tiempo de espera acumulado','Req. h','Cortes'],m.processRows.map(function(r){return '<tr><td>'+esc(r.label)+'</td><td>'+r.cases+'</td><td>'+r.wip+'</td><td>'+fmt(r.avg)+'</td><td>'+timeUnit(r.total)+'</td><td>'+timeUnit(r.active)+'</td><td>'+timeUnit(r.wait)+'</td><td>'+timeUnit(r.dead)+'</td><td>'+r.eff+'%</td><td>'+r.waitPct+'%</td><td>'+r.deadPct+'%</td><td>'+timeUnit(r.req)+'</td><td>'+r.doneCuts+'/'+r.cuts+'</td></tr>';}));
  }else if(view==='usuarios'){
    title='Productividad por usuario';count=m.userRows.length;html=table(['Usuario','Rol','Casos','Abiertos','Cerrados','LT prom.','Total','Ocupación','Espera','NVA','% VA','% Espera','Productividad','Procesos trazados'],m.userRows.map(function(r){return '<tr><td><strong>'+esc(r.user)+'</strong></td><td>'+esc(roleTitle(r.role))+'</td><td>'+r.count+'</td><td>'+r.open+'</td><td>'+r.closed+'</td><td>'+fmt(r.avg)+'</td><td>'+timeUnit(r.total)+'</td><td>'+timeUnit(r.active)+'</td><td>'+timeUnit(r.wait)+'</td><td>'+timeUnit(r.dead)+'</td><td>'+r.eff+'%</td><td>'+r.waitPct+'%</td><td>'+r.productivity+'</td><td>'+esc(r.processList||'')+'</td></tr>';}));
  }else if(view==='usuario_proceso'){
    title='Detalle usuario por proceso';count=m.userProcessRows.length;html=table(['Usuario','Rol','Proceso','Casos','Abiertos','Cerrados','LT prom.','Total','Ocupación','Espera','NVA','% VA','% Espera','Req. h','Cortes'],m.userProcessRows.map(function(r){return '<tr><td>'+esc(r.user)+'</td><td>'+esc(roleTitle(r.role))+'</td><td>'+esc(r.label)+'</td><td>'+r.count+'</td><td>'+r.open+'</td><td>'+r.closed+'</td><td>'+fmt(r.avg)+'</td><td>'+timeUnit(r.total)+'</td><td>'+timeUnit(r.active)+'</td><td>'+timeUnit(r.wait)+'</td><td>'+timeUnit(r.dead)+'</td><td>'+r.eff+'%</td><td>'+r.waitPct+'%</td><td>'+timeUnit(r.req)+'</td><td>'+Math.round(r.cuts)+'</td></tr>';}));
  }else if(view==='cancelados'){
    title='Pedidos cancelados / anulados';count=m.cancelRows.length;html=table(['Pedido','OC','Cliente','Asesor','Tipo','Proceso donde se canceló','Fecha cancelación','Usuario','Motivo','PDF soporte'],m.cancelRows.map(function(r){return '<tr><td><strong>'+esc(r.pedido)+'</strong></td><td>'+esc(r.oc)+'</td><td>'+esc(r.cliente)+'</td><td>'+esc(r.asesor)+'</td><td><span class="pill">'+esc(r.tipo)+'</span></td><td>'+esc(r.procesoTxt)+'</td><td>'+esc(dateTxt(r.fecha))+'</td><td>'+esc(r.usuario||'')+'</td><td>'+esc(r.motivo||'')+'</td><td>'+(r.soporte?'<a href="'+esc(r.soporte)+'" target="_blank" rel="noopener">Abrir PDF</a>':'Sin soporte trazado')+'</td></tr>';}));
  }else if(view==='not_traced'){
    title='Pedidos no trazados / revisión de conciliación';count=m.notTracedRows.length;html=table(['Pedido','Cliente','Estado','Proceso','Motivo'],m.notTracedRows.map(function(r){return '<tr><td><strong>'+esc(r.pedido||'')+'</strong></td><td>'+esc(r.cliente||'')+'</td><td>'+esc(r.estado||'')+'</td><td>'+esc(r.proceso||'')+'</td><td>'+esc(r.motivo||'')+'</td></tr>';}));
  }else if(view==='novedades'){
    title='Tiempo de respuesta de novedades y reportes';count=m.reportRows.length;html=table(['Pedido','Cliente','Novedad / reporte','Referencia','Estado','Criticidad','Actualizaciones','Primera respuesta','Tiempo respuesta','Cierre','Etiqueta VSM'],m.reportRows.slice(0,700).map(function(r){return '<tr><td><strong>'+esc(r.pedido||'')+'</strong></td><td>'+esc(r.cliente||'')+'</td><td>'+esc(r.title||'')+'</td><td>'+esc(r.reference||'')+'</td><td><span class="pill">'+esc(r.status||'')+'</span></td><td>'+esc(r.severity||'')+'</td><td>'+r.updates+'</td><td>'+(r.pending?'Pendiente':dateTxt(r.firstResponse))+'</td><td><strong>'+timeUnit(r.responseMs)+'</strong></td><td>'+(r.closeMs?timeUnit(r.closeMs):'—')+'</td><td>'+(r.pending?'Sin respuesta trazada':'Respondida')+'</td></tr>';}));
  }else if(view==='pedidos'){
    title='Demora exacta por pedido';var rows=m.caseRows.slice(0,700);count=m.caseRows.length;html=table(['Tipo','Pedido','OC','Cliente','Proceso','Estado','LT hábil/día','LT total','Días','Lectura de tiempo','Resp. novedades','% Ocupación','Cuello','QA'],rows.map(function(r){var c=r.c;return '<tr><td><span class="pill">'+esc(r.orderType)+'</span></td><td><strong>'+esc(refOf(c))+'</strong></td><td>'+esc(purchase(c))+'</td><td>'+esc(c.client||'')+'</td><td>'+esc(processTitle(c.currentProcess))+'</td><td><span class="pill">'+esc(c.status||'')+'</span></td><td><strong>'+timeUnit(r.leadPerDay)+'</strong><br><small class="muted">por día</small></td><td>'+timeUnit(r.lead)+'<br><small class="muted">'+fmt(r.lead)+'</small></td><td>'+r.orderDays+'</td><td>'+timeSplitHtml(r.va,r.wait,r.dead)+'</td><td>'+(r.reportRows.length?'<strong>'+timeUnit(r.reportResponse)+'</strong><br><small class="muted">'+r.reportRows.length+' novedad(es) · '+r.reportPending+' pend.</small>':'—')+'</td><td>'+pct(r.va,r.lead)+'%</td><td>'+esc(r.bottleneck.label||'')+'</td><td>'+(r.missingStart?'Revisar fecha':'OK')+'</td></tr>';}));
  }else{
    title='Principal VSM · lectura ejecutiva por pedido';var rows=m.caseRows;count=rows.length;html=principalVsmHtml(rows);
  }
  $('tableTitle').textContent=title;
  $('rowCount').textContent=count+' fila(s) · base cargada '+((m&&m.loadedTotal)||0)+' · trazados VSM '+((m&&m.cases)||0)+' · cancelados/anulados '+((m&&m.cancelTotal)||0)+' · no trazados '+((m&&m.notTraced)||0);
  $('mainTable').innerHTML=html;
}
async function refresh(){var cases=filterCases(),cancelled=filterCancelledCases();await compute(cases,cancelled);renderSummary();renderTable();$('btnExport').disabled=!(cases.length||cancelled.length);}
function fillFiltersBase(){var p=$('fProcess');p.innerHTML='<option value="">Todos</option>'+FLOW.map(function(k){return '<option value="'+k+'">'+esc(PROCESS[k])+'</option>';}).join('');var users={};app.cases.forEach(function(c){processStatsList(c).forEach(function(pr){personsForProcess(c,pr).forEach(function(person){if(person.synthetic)return;users[person.key]=person;});});});var u=$('fUser');u.innerHTML='<option value="">Todos</option>'+Object.keys(users).sort(function(a,b){return users[a].name.localeCompare(users[b].name);}).map(function(k){return '<option value="'+esc(k)+'">'+esc(users[k].name)+'</option>';}).join('');}

function caseMatchesBaseFiltersBase(c,includeStatus){
  var from=$('fFrom').value,to=$('fTo').value,proc=$('fProcess').value,stat=$('fStatus').value,orderType=($('fOrderType')&&$('fOrderType').value)||'',q=lower($('fSearch').value),user=$('fUser').value;
  if(orderType&&orderTypeOf(c).toLowerCase()!==orderType)return false;
  var day=isoDay((isCancelledVsm(c)?(cancellationDateMs(c)||caseStartMs(c)||c.updatedAt):(caseStartMs(c)||c.updatedAt)));
  if(from&&day&&day<from)return false;
  if(to&&day&&day>to)return false;
  if(proc){
    var cp=cancellationProcessKey(c);
    var has=(cp===proc)||(c.currentProcess===proc)||(c.processStats&&c.processStats[proc])||allTraceEvents(c).some(function(e){return e.process===proc;})||((proc==='corte_cable')&&(c.cutRequests||[]).length);
    if(!has)return false;
  }
  if(includeStatus){
    if(stat==='cancelled'&&!isCancelledVsm(c))return false;
    if(stat==='open'&&(isClosed(c)||isCancelledVsm(c)))return false;
    if(stat==='closed'&&(!isClosed(c)||isCancelledVsm(c)))return false;
    if(stat==='wait'&&!((c.requirements||[]).length||c.openRequirement||c.waitStartedAt||c.salesHold||c.separationRequest))return false;
  }
  var txt=lower([refOf(c),idOf(c),purchase(c),c.client,advisor(c),c.assignedName,c.status,c.cancelStatusLabel,c.cancellationTypeLabel,c.cancellationReason,c.cancellationDetail,processTitle(c.currentProcess),processTitle(cancellationProcessKey(c))].join(' '));
  if(q&&txt.indexOf(q)<0)return false;
  if(user){
    var hit=processStatsList(c).some(function(pr){return personsForProcess(c,pr).some(function(person){return person.key===user;});});
    if(!hit)return false;
  }
  return true;
}
function vsmReconciliation(included,cancelled){
  var base=(app.cases||[]).filter(function(c){return caseMatchesBaseFilters(c,false);});
  var excluded=base.filter(function(c){return c.excludeFromKpi||c.excludeFromVsm;});
  var cancelledIds={};(cancelled||[]).forEach(function(c){cancelledIds[idOf(c)]=1;});
  var includedIds={};(included||[]).forEach(function(c){includedIds[idOf(c)]=1;});
  var notTraced=base.filter(function(c){var id=idOf(c);return !includedIds[id]&&!cancelledIds[id]&&!(c.excludeFromKpi||c.excludeFromVsm);});
  return {loaded:(app.cases||[]).length,base:base.length,included:(included||[]).length,cancelled:(cancelled||[]).length,excluded:excluded.length,notTraced:notTraced.length,notTracedRows:notTraced.slice(0,80).map(function(c){return {pedido:refOf(c),cliente:c.client||'',estado:c.status||'',proceso:processTitle(c.currentProcess),motivo:'No clasificado por filtros/estado o datos incompletos'};})};
}
function filterCases(){
  var stat=$('fStatus').value;
  if(stat==='cancelled')return [];
  return app.cases.filter(function(c){
    if(c.excludeFromKpi||c.excludeFromVsm||isCancelledVsm(c))return false;
    return caseMatchesBaseFilters(c,true);
  });
}
function filterCancelledCases(){
  return app.cases.filter(function(c){
    if(!isCancelledVsm(c))return false;
    return caseMatchesBaseFilters(c,true);
  });
}
async function getSnap(q,timeoutMs){return await Promise.race([q.get(),new Promise(function(_,rej){setTimeout(function(){rej(new Error('Timeout leyendo Firebase'));},timeoutMs||20000);})]);}
async function mergeDocsFromQuery(out,seen,q,label,limitMax,paginate){
  var max=Math.max(1,Number(limitMax||500)),pageSize=Math.min(500,max),total=0,cursor=null,lastSize=0,lastTake=0,page=0;
  try{
    while(total<max){
      var query=q;
      if(cursor)query=query.startAfter(cursor);
      lastTake=Math.min(pageSize,max-total);
      var snap=await getSnap(query.limit(lastTake),22000);
      lastSize=snap.size;
      snap.forEach(function(doc){if(!seen[doc.id]){var d=doc.data()||{};d.id=d.id||doc.id;out.push(d);seen[doc.id]=1;}});
      total+=snap.size;page++;
      if(!paginate||snap.size<lastTake||!snap.docs||!snap.docs.length)break;
      cursor=snap.docs[snap.docs.length-1];
      if(page%4===0){loading(true,'Histórico VSM · '+label+' · '+total+' documentos revisados...');await sleep(0);}
    }
    if(paginate&&total>=max&&lastSize===lastTake&&cursor){
      try{var extra=await getSnap(q.startAfter(cursor).limit(1),12000);if(extra.size){app.historyCapped=app.historyCapped||[];if(app.historyCapped.indexOf(label)<0)app.historyCapped.push(label);}}catch(capError){console.warn('No fue posible verificar el límite histórico '+label,capError);}
    }
    return total;
  }catch(e){console.warn('VSM query omitida '+label,e);return total;}
}
async function loadEvents(limit,all){
  if(!app.db)return;var out=[],seen={},lim=limit||1600;
  async function merge(q,label){return mergeDocsFromQuery(out,seen,q,'eventos '+label,lim,!!all);}
  await merge(app.db.collection('case_events').orderBy('timestamp','desc'),'timestamp');
  await merge(app.db.collection('case_events').orderBy('createdAt','desc'),'createdAt');
  if(all||!out.length)await merge(app.db.collection('case_events'),'sin orden');
  app.events=out;buildEventBuckets();
}
async function loadReports(limit,all){
  if(!app.db)return;var out=[],seen={},lim=limit||1000;
  async function merge(q,label){return mergeDocsFromQuery(out,seen,q,'novedades '+label,lim,!!all);}
  await merge(app.db.collection('reportes_novedad').orderBy('updatedAt','desc'),'updatedAt');
  await merge(app.db.collection('reportes_novedad').orderBy('createdAt','desc'),'createdAt');
  if(all||!out.length)await merge(app.db.collection('reportes_novedad'),'sin orden');
  app.reports=out;
}
async function loadIntervals(limit,all){
  if(!app.db)return;var lim=limit||2500;
  async function readCollection(name,orderField){
    var out=[],seen={};
    await mergeDocsFromQuery(out,seen,app.db.collection(name).orderBy(orderField,'desc'),name+' '+orderField,lim,!!all);
    if(all||!out.length)await mergeDocsFromQuery(out,seen,app.db.collection(name),name+' sin orden',lim,!!all);
    return out;
  }
  var rows=await Promise.all([readCollection('case_process_intervals','endedAt'),readCollection('case_status_intervals','endedAt')]);
  app.processIntervals=rows[0];app.statusIntervals=rows[1];buildIntervalBuckets();
}
async function loadFlowHealth(limit,all){
  if(!app.db)return;var out=[],seen={},lim=limit||1000;
  await mergeDocsFromQuery(out,seen,app.db.collection('erp_flow_health').orderBy('evaluatedAt','desc'),'salud de flujo evaluatedAt',lim,!!all);
  if(all||!out.length)await mergeDocsFromQuery(out,seen,app.db.collection('erp_flow_health'),'salud de flujo sin orden',lim,!!all);
  out.forEach(function(d){d.caseId=d.caseId||d.id;});app.flowHealth=out;
}
function flowHealthSeverity(item){
  var issues=(item&&Array.isArray(item.issues))?item.issues:[];
  var critical=issues.filter(function(x){return /CRITICAL|BLOCKED|INVALID|STUCK|ORPHAN/i.test(String((x&&x.severity)||'')+' '+String((x&&x.code)||''));}).length;
  if(critical||String((item&&item.status)||'').toUpperCase()==='CRITICAL')return 'bad';
  return issues.length?'warn':'ok';
}
function flowHealthIssueText(issue){
  if(!issue)return 'Hallazgo sin detalle';
  return clean(issue.message||issue.detail||issue.description||issue.code||'Hallazgo de integridad');
}
function renderFlowHealth(){
  var board=$('flowHealthBoard');if(!board)return;
  var visible={};
  ((app.metrics&&app.metrics.caseRows)||[]).forEach(function(r){var id=idOf(r.c);if(id)visible[id]=1;});
  var rows=(app.flowHealth||[]).filter(function(item){
    var id=clean(item.caseId||item.id);
    var hasIssues=Array.isArray(item.issues)&&item.issues.length;
    return hasIssues&&(!Object.keys(visible).length||visible[id]);
  }).sort(function(a,b){
    var sa=flowHealthSeverity(a)==='bad'?2:1,sb=flowHealthSeverity(b)==='bad'?2:1;
    return sb-sa||tms(b.evaluatedAt)-tms(a.evaluatedAt);
  });
  if(!rows.length){
    var repaired=(app.flowHealth||[]).filter(function(item){return String(item.status||'').toUpperCase()==='REPAIRED';}).length;
    board.innerHTML='<div class="flow-health-empty"><span class="status-chip ok">Flujo controlado</span><div><strong>Sin pedidos colgados detectados</strong><small>El monitor no reporta transiciones inválidas, cortes pendientes ni etapas vencidas dentro del filtro actual.'+(repaired?' Reparaciones determinísticas auditadas: '+repaired+'.':'')+'</small></div></div>';
    return;
  }
  var html=rows.slice(0,40).map(function(item){
    var issues=item.issues||[],sev=flowHealthSeverity(item),ageHours=num(item.businessAgeHours||item.ageBusinessHours||0);
    var reference=clean(item.reference||item.caseReference||item.orderNumber||item.caseId||item.id);
    var process=processTitle(item.currentProcess||item.process||'');
    var issueHtml=issues.slice(0,4).map(function(issue){return '<li>'+esc(flowHealthIssueText(issue))+'</li>';}).join('');
    return '<article class="flow-health-item '+sev+'"><header><div><strong>'+esc(reference||'Pedido sin referencia')+'</strong><small>'+esc(process||'Proceso no identificado')+'</small></div><span class="status-chip '+sev+'">'+issues.length+' hallazgo(s)</span></header><ul>'+issueHtml+'</ul><footer><span>Antigüedad hábil: '+esc(ageHours?(Math.round(ageHours*10)/10)+' h':'sin dato')+'</span><span>Evaluado: '+esc(dateTxt(item.evaluatedAt||item.updatedAt))+'</span></footer></article>';
  }).join('');
  board.innerHTML='<div class="flow-health-head"><div><strong>'+rows.length+' pedido(s) requieren intervención</strong><small>El guardián corrige únicamente defectos determinísticos y deja evento de auditoría; los casos ambiguos permanecen visibles para intervención humana.</small></div><span class="status-chip '+(rows.some(function(x){return flowHealthSeverity(x)==='bad';})?'bad':'warn')+'">Atención operativa</span></div><div class="flow-health-grid">'+html+'</div>';
}
async function loadCases(all){if(!app.db)return;loading(true,'Leyendo Firebase sin bloquear...');var limit=Number($('fLimit').value||600);var batch=all?Math.max(1000,limit):limit;var out=all?app.cases.slice():[],seen={};app.historyCapped=[];out.forEach(function(c){seen[idOf(c)]=1;});await Promise.all([loadEvents(all?50000:1600,all),loadReports(all?50000:1000,all),loadIntervals(all?50000:2500,all),loadFlowHealth(all?50000:1000,all)]);
  await mergeDocsFromQuery(out,seen,app.db.collection('cases').orderBy('updatedAt','desc'),'pedidos updatedAt',batch,false);
  await sleep(0);loading(true,'Cargados '+out.length+' pedidos · complementando fechas de creación...');
  await mergeDocsFromQuery(out,seen,app.db.collection('cases').orderBy('createdAt','desc'),'pedidos createdAt',Math.min(batch,1000),false);
  if(all){await sleep(0);loading(true,'Cargando histórico completo de pedidos por páginas...');await mergeDocsFromQuery(out,seen,app.db.collection('cases'),'pedidos sin orden',50000,true);}else if(out.length<50){await mergeDocsFromQuery(out,seen,app.db.collection('cases'),'pedidos sin orden mínimo',300,false);}
  app.cases=out;app.loadedAll=!!all;fillFilters();renderTraceSources();var cap=(app.historyCapped||[]).length?' Advertencia: se alcanzó el límite de seguridad en '+app.historyCapped.join(', ')+'.':'';status('Datos reales cargados desde Firebase: '+out.length+' pedido(s), '+app.events.length+' evento(s), '+(app.reports||[]).length+' novedad(es) y '+(app.flowHealth||[]).filter(function(x){return Array.isArray(x.issues)&&x.issues.length;}).length+' alerta(s) de integridad, '+(app.processIntervals||[]).length+' intervalo(s) de proceso y '+(app.statusIntervals||[]).length+' intervalo(s) de estado. '+VERSION+' calcula Lead Time con calendario laboral y conciliación completa.'+cap,(app.historyCapped||[]).length?'bad':'ok');await refresh();}
function xls(v){return esc(v).replace(/\n/g,' ');}function row(cells){return '<tr>'+cells.map(function(c){return '<td>'+xls(c)+'</td>';}).join('')+'</tr>';}
async function appendRows(parts,items,mapper,chunk){for(var i=0;i<items.length;i++){parts.push(mapper(items[i],i));if(i%chunk===0){loading(true,'Exportando '+i+' / '+items.length);await sleep(0);}}}
async function exportExcel(){if(!app.metrics)await refresh();var m=app.metrics,parts=[];loading(true,'Preparando Excel VSM completo...');parts.push('<html><head><meta charset="utf-8"><style>body{font-family:Century Gothic,Arial}table{border-collapse:collapse;margin-bottom:24px}th,td{border:1px solid #cbd5e1;padding:6px;font-size:12px}th{background:#061b46;color:#fff}.n{mso-number-format:"0.00"}</style></head><body>');parts.push('<h1>Dashboard VSM ERP · '+VERSION+' · Normalizado por día y separado Normal/PVE</h1><p>Exportado: '+xls(new Date().toLocaleString('es-CO'))+'</p><h2>Fórmulas y criterios</h2><table><tr><th>Indicador</th><th>Fórmula / lectura</th></tr>'+row(['Lead Time pedido','Fin real o corte del análisis - inicio real del pedido. Si faltan campos, se respalda con trazas/eventos y updatedAt.'])+row(['Lead Time normalizado por día','Lead Time acumulado del pedido dividido entre los días calendario que abarca el pedido. Sirve para leer horas reales por pedido/día.'])+row(['VSM normal / PVE','Los PVE se separan porque pasan por Compras y tienen una carga distinta; los demás pedidos se miden como flujo normal.'])+row(['Lead Time proceso','Tiempo transcurrido en cada macroproceso desde processStats + trazas + eventos + estado actual.'])+row(['VA','Tiempo activo registrado o inferido por eventos de trabajo / conformidad / cierre.'])+row(['Espera','Tiempos de espera por proceso + bloqueos + requerimientos + pago/separación.'])+row(['Requerimientos','Desde creación del requerimiento hasta respuesta/cierre o corte.'])+row(['Tiempo residual del proceso','Lead Time - trabajo directo - espera explícita, sin negativos.'])+row(['Eficiencia','VA / Lead Time.'])+row(['Cancelados/anulados','No se incluyen en Lead Time ni productividad. Se reportan en control independiente por tipo, proceso, asesor y soporte.'])+'</table>');
  parts.push('<h2>Resumen ejecutivo</h2><table><tr><th>Pedidos</th><th>Cerrados</th><th>WIP</th><th>Tipo VSM</th><th>LT hábil/día</th><th>Lead Time promedio total</th><th>P50 LT</th><th>P90 LT</th><th>Throughput cerrado/día</th><th>% VA</th><th>% Espera</th><th>% tiempo de espera acumulado</th><th>Requerimientos</th><th>Cancelados/anulados excluidos</th><th>Cuello principal</th><th>Datos incompletos</th></tr>'+row([m.cases,m.closed,m.wip,m.vsmType,fmt(m.leadDayAvg),fmt(m.leadAvg),fmt(m.leadP50),fmt(m.leadP90),m.throughput,m.eff+'%',m.waitPct+'%',m.deadPct+'%',m.reqCount,m.cancelTotal,m.bottleneck?m.bottleneck.label:'',m.incomplete])+'</table>');
  parts.push('<h2>VSM por proceso</h2><table><tr><th>Macroproceso</th><th>Casos</th><th>WIP</th><th>LT promedio</th><th>Horas total</th><th>VA h</th><th>Espera h</th><th>Tiempo residual del proceso h</th><th>Eficiencia</th><th>Req. h</th><th>Cortes</th></tr>');await appendRows(parts,m.processRows,function(r){return row([r.label,r.cases,r.wip,fmt(r.avg),timeUnit(r.total),timeUnit(r.active),timeUnit(r.wait),timeUnit(r.dead),r.eff+'%',timeUnit(r.req),r.doneCuts+'/'+r.cuts]);},30);parts.push('</table>');

  parts.push('<h2>Cobertura</h2><table><tr><th>Indicador</th><th>Cantidad</th></tr>'+row(['Total cargado',m.totalLoaded])+row(['Dentro del filtro',m.filteredTotal])+row(['Trazados VSM',m.cases])+row(['No trazados',m.notTraced])+row(['Cancelados/anulados',m.cancelTotal])+row(['Excluidos KPI',m.excludedKpi])+'</table>');
  parts.push('<h2>Resumen por área</h2><table><tr><th>Área</th><th>Casos</th><th>Intervenciones</th><th>WIP/abiertas</th><th>Cerrados</th><th>LT promedio</th><th>Trabajo</th><th>Bloqueo</th><th>No explicado</th><th>Cumplimiento</th><th>Confiabilidad</th><th>No entregas</th><th>Actores</th></tr>');
  await appendRows(parts,m.areaRows||[],function(r){return row([r.label,r.cases,r.area==='ventas'?(r.interventions||0):'',r.wip,r.closed,hours(r.avg),hours(r.work),hours(r.block),hours(r.unexplained),r.compliance+'%',r.reliability+'%',Number(r.noDeliveries||0),r.workers]);},25);
  parts.push('</table>');
  parts.push('<h2>Productividad por actor</h2><table><tr><th>Actor</th><th>Rol</th><th>Casos</th><th>WIP</th><th>Cerrados</th><th>Trabajo directo</th><th>Promedio directo</th><th>Cumplimiento</th><th>Productividad de cierre</th><th>Carga directa</th><th>Procesos</th></tr>');
  await appendRows(parts,m.actorRows||[],function(r){return row([r.user,roleTitle(r.role),r.count,r.open,r.closed,hours(r.active),hours(r.directPerCase),r.compliance+'%',r.productivity+'%',r.directLoadPct+'%',r.processList||'']);},25);
  parts.push('</table>');


  parts.push('<h2>Tiempos especiales de espera</h2><table><tr><th>Alcance</th><th>Espera en novedades</th><th>Espera en reproceso</th><th>Espera en no entregas</th><th>Novedades abiertas</th><th>Reprocesos abiertos</th><th>No entregas abiertas</th></tr>'+row([m.specialWait.scope.label,hours(m.specialWait.novelty),hours(m.specialWait.rework),hours(m.specialWait.noDelivery),m.specialWait.noveltyOpen,m.specialWait.reworkOpen,m.specialWait.noDeliveryOpen])+'</table>');
  parts.push('<h2>Trazabilidad de tiempos de espera</h2><table><tr><th>Pedido</th><th>Categoría</th><th>Área</th><th>Proceso</th><th>Inicio</th><th>Fin/corte</th><th>Duración</th><th>Abierto</th><th>Origen</th><th>Detalle</th></tr>');
  await appendRows(parts,m.specialWait.all||[],function(x){return row([x.pedido,x.category,v225AreaLabel(x.area),processTitle(x.process),dateTxt(x.start),dateTxt(x.end),hours(x.duration),x.open?'Sí':'No',x.source,x.detail]);},25);
  parts.push('</table>');
  parts.push('<h2>Demora exacta por pedido</h2><table><tr><th>Tipo</th><th>Pedido</th><th>OC</th><th>Cliente</th><th>Asesor</th><th>Proceso actual</th><th>Estado</th><th>Inicio</th><th>Fin/corte</th><th>LT hábil h/día</th><th>Lead Time total</th><th>Horas LT total</th><th>Días pedido</th><th>VA h/día</th><th>Espera h/día</th><th>Tiempo residual del proceso h/día</th><th>VA h total</th><th>Espera h total</th><th>Req. h</th><th>Tiempo residual del proceso h total</th><th>Eficiencia</th><th>Cuello pedido</th><th>Calidad dato</th></tr>');await appendRows(parts,m.caseRows,function(r){var c=r.c;return row([r.orderType,refOf(c),purchase(c),c.client||'',advisor(c),processTitle(c.currentProcess),c.status||'',dateTxt(r.start),r.closed?dateTxt(r.end):'Abierto · '+dateTxt(r.end),hours(r.leadPerDay),fmt(r.lead),hours(r.lead),r.orderDays,hours(r.vaPerDay),hours(r.waitPerDay),hours(r.deadPerDay),hours(r.va),timeUnit(r.wait),timeUnit(r.req),timeUnit(r.dead),pct(r.va,r.lead)+'%',r.bottleneck.label||'',r.missingStart?'Sin fecha base clara':'OK']);},25);parts.push('</table>');
  parts.push('<h2>Productividad por usuario</h2><table><tr><th>Usuario</th><th>Rol</th><th>Casos</th><th>Abiertos</th><th>Cerrados</th><th>LT prom.</th><th>Horas total</th><th>VA h</th><th>Espera h</th><th>Tiempo residual del proceso h</th><th>% VA</th><th>% Espera</th><th>Cerrados/h VA</th><th>Procesos trazados</th></tr>');await appendRows(parts,m.userRows,function(r){return row([r.user,roleTitle(r.role),r.count,r.open,r.closed,fmt(r.avg),timeUnit(r.total),timeUnit(r.active),timeUnit(r.wait),timeUnit(r.dead),r.eff+'%',r.waitPct+'%',r.productivity,r.processList||'']);},35);parts.push('</table>');parts.push('<h2>Detalle usuario por proceso</h2><table><tr><th>Usuario</th><th>Rol</th><th>Proceso</th><th>Casos</th><th>Abiertos</th><th>Cerrados</th><th>LT prom.</th><th>Horas total</th><th>VA h</th><th>Espera h</th><th>Tiempo residual del proceso h</th><th>% VA</th><th>% Espera</th><th>Req. h</th><th>Cortes</th></tr>');await appendRows(parts,m.userProcessRows,function(r){return row([r.user,roleTitle(r.role),r.label,r.count,r.open,r.closed,fmt(r.avg),timeUnit(r.total),timeUnit(r.active),timeUnit(r.wait),timeUnit(r.dead),r.eff+'%',r.waitPct+'%',timeUnit(r.req),Math.round(r.cuts)]);},35);parts.push('</table>');
  parts.push('<h2>Esperas, bloqueos y requerimientos</h2><table><tr><th>Pedido</th><th>Proceso</th><th>Desde</th><th>Hasta</th><th>Duración</th><th>Horas</th><th>Tipo</th><th>Usuario</th><th>Detalle</th></tr>');await appendRows(parts,m.waitRows,function(w){return row([w.pedido,w.proceso,dateTxt(w.desde),dateTxt(w.hasta),fmt(w.dur),hours(w.dur),w.tipo,w.usuario,w.detalle]);},35);parts.push('</table>');
  parts.push('<h2>Pedidos cancelados / anulados · control excluido del VSM operativo</h2><table><tr><th>Tipo</th><th>Pedido</th><th>OC</th><th>Cliente</th><th>Asesor</th><th>Tipo</th><th>Proceso donde se canceló</th><th>Fecha cancelación</th><th>Usuario</th><th>Motivo</th><th>PDF soporte</th></tr>');await appendRows(parts,m.cancelRows,function(r){return row([r.pedido,r.oc,r.cliente,r.asesor,r.tipo,r.procesoTxt,dateTxt(r.fecha),r.usuario,r.motivo,r.soporte?'Sí':'No']);},35);parts.push('</table>');
  parts.push('<h2>Cortes</h2><table><tr><th>Pedido</th><th>Cliente</th><th>Corte</th><th>Referencia</th><th>Metros</th><th>Estado</th><th>Responsable</th><th>Inicio</th><th>Fin</th><th>Duración</th><th>Horas</th><th>Modo</th><th>Estado de cierre</th></tr>');await appendRows(parts,m.cutRows,function(x){return row([x.pedido,x.cliente,x.corte,x.referencia,x.metros,x.estado,x.responsable,dateTxt(x.inicio),dateTxt(x.fin),fmt(x.duracion),hours(x.duracion),x.modo,x.legacyRegister]);},40);parts.push('</table></body></html>');
  var blob=new Blob(['\ufeff'].concat(parts),{type:'application/vnd.ms-excel;charset=utf-8'});var a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='VSM_Centro_Operativo_V500_'+new Date().toISOString().slice(0,10)+'.xls';document.body.appendChild(a);a.click();setTimeout(function(){URL.revokeObjectURL(a.href);a.remove();},1000);loading(false);status('Excel VSM '+VERSION+' generado correctamente con '+m.cases+' pedido(s).','ok');}

/* ============================================================
   V222 · Centro operativo VSM
============================================================ */
var V222_SLA_HOURS={
  compras:16,
  recepcion_pedidos:4,
  alistamiento:4,
  corte_cable:4,
  facturacion:2,
  caja:4,
  cartera:4,
  cliente_punto:2,
  cliente_recoge:8,
  despacho_local:8,
  despacho_nacional:16,
  cierre_despacho_nacional:4
};
var V222_NEXT_ACTION={
  compras:"Liberar compra o confirmar disponibilidad",
  recepcion_pedidos:"Validar soporte y enviar a alistamiento",
  alistamiento:"Completar picking, evidencias y liberar",
  corte_cable:"Iniciar, finalizar o registrar el corte",
  facturacion:"Emitir factura y anexar soporte",
  caja:"Validar pago, recaudo o liberar retención",
  cartera:"Revisar cupo, soportes y liberar o devolver",
  cliente_punto:"Confirmar entrega en punto",
  cliente_recoge:"Confirmar recogida del cliente",
  despacho_local:"Programar y confirmar entrega local",
  despacho_nacional:"Cargar guía y entregar a transportadora",
  cierre_despacho_nacional:"Cerrar entrega con evidencia"
};

function v222MsHours(h){return Math.max(0,Number(h)||0)*3600000;}
function v222Hours(ms){return (Math.max(0,Number(ms)||0)/3600000).toFixed((Number(ms)||0)<36000000?2:1)+" h";}
function v222Percentile(values,p){
  values=(values||[]).filter(function(v){return isFinite(v)&&v>=0;}).sort(function(a,b){return a-b;});
  if(!values.length)return 0;
  var idx=Math.min(values.length-1,Math.max(0,Math.ceil((p/100)*values.length)-1));
  return values[idx];
}
function v222Average(values){
  values=(values||[]).filter(function(v){return isFinite(v)&&v>=0;});
  return values.length?values.reduce(function(s,v){return s+v;},0)/values.length:0;
}
function v222ProcessMetricFromCase(cm,process){
  return (cm&&cm.pRows||[]).filter(function(p){return p.process===process;})[0]||null;
}
function v222CurrentProcessAge(c){
  var start=caseStartMs(c);
  if(!isFinite(start))start=tms(c.updatedAt)||nowMs();
  var end=caseEndMs(c,start);
  var p=c.currentProcess&&PROCESS[c.currentProcess]?c.currentProcess:"recepcion_pedidos";
  var pm=processMetric(c,p,start,end);
  return pm?pm.total:workingMsBetween(c.updatedAt||start,nowMs());
}
function v222Blocker(c){
  if(c.openRequirement)return c.openRequirement.reason||c.openRequirement.detail||"Requerimiento abierto";
  if(c.salesHold)return c.salesHold.reason||c.salesHold.status||"Retención financiera";
  if(c.separationRequest&&c.separationRequest.active!==false)return c.separationRequest.reason||c.separationRequest.status||"Pago pendiente";
  if(c.waitStartedAt)return "Pedido en espera";
  var cuts=(c.cutRequests||[]).filter(function(x){return !(x.status==="FINALIZADO"||x.registeredAt||x.noCutNeeded||x.measureComplete||x.medidaCompleta);});
  if(cuts.length)return cuts.length+" corte(s) pendiente(s)";
  return "Sin bloqueo explícito";
}
function v222Responsible(c){
  return c.assignedName||c.assignedEmail||advisor(c)||"Sin responsable trazado";
}
function v222SlaHoursForProcess(p){
  var custom=Number(($("fThreshold")&&$("fThreshold").value)||0);
  var selected=($("fProcess")&&$("fProcess").value)||"";
  if(custom>0 && (!selected||selected===p))return custom;
  return V222_SLA_HOURS[p]||8;
}
function v222ClosedDay(cm){
  if(!cm||!cm.closed)return "";
  var d=toDate(cm.end);
  return d?isoLocalDay(d):"";
}
function v222CountBy(rows,keyFn){
  var out={};
  (rows||[]).forEach(function(r){var k=keyFn(r);if(k)out[k]=(out[k]||0)+1;});
  return out;
}
function v222FilterSummary(){
  var parts=[];
  if($("fFrom").value||$("fTo").value)parts.push("Fecha "+($("fFrom").value||"inicio")+" a "+($("fTo").value||"hoy"));
  if($("fOrderType").value)parts.push($("fOrderType").value==="pve"?"PVE":"Normal");
  if($("fProcess").value)parts.push(processTitle($("fProcess").value));
  if($("fStatus").value)parts.push($("fStatus").options[$("fStatus").selectedIndex].text);
  if($("fSla").value)parts.push($("fSla").value==="late"?"Fuera de meta":"Dentro de meta");
  if($("fUser").value)parts.push($("fUser").options[$("fUser").selectedIndex].text);
  if(clean($("fSearch").value))parts.push('Búsqueda "'+clean($("fSearch").value)+'"');
  $("filterSummary").textContent=parts.length?parts.join(" · "):"Vista general sin filtros restrictivos.";
}

async function computeV225Base(cases,cancelledCases){
  await computeBase(cases,cancelledCases);
  var m=app.metrics;if(!m)return;

  var durations={},completedDurations={},wipRows=[],pickingRows=[],alerts=[];
  FLOW.forEach(function(p){durations[p]=[];completedDurations[p]=[];});

  m.caseRows.forEach(function(cm){
    (cm.pRows||[]).forEach(function(pm){
      durations[pm.process]=durations[pm.process]||[];
      durations[pm.process].push(pm.total);
      if(!pm.wip){
        completedDurations[pm.process]=completedDurations[pm.process]||[];
        completedDurations[pm.process].push(pm.total);
      }
      if(pm.process==="alistamiento"){
        pickingRows.push({
          pedido:refOf(cm.c),
          oc:purchase(cm.c),
          cliente:cm.c.client||"",
          responsable:v222Responsible(cm.c),
          estado:cm.c.status||"",
          total:pm.total,
          active:pm.active,
          wait:pm.wait,
          dead:pm.dead,
          inicio:pm.start,
          fin:pm.finish,
          cerrado:!pm.wip,
          slaHours:v222SlaHoursForProcess("alistamiento"),
          late:pm.total>v222MsHours(v222SlaHoursForProcess("alistamiento"))
        });
      }
    });

    if(!cm.closed){
      var p=cm.c.currentProcess&&PROCESS[cm.c.currentProcess]?cm.c.currentProcess:"recepcion_pedidos";
      var pm=v222ProcessMetricFromCase(cm,p);
      var age=pm?pm.total:v222CurrentProcessAge(cm.c);
      var sla=v222SlaHoursForProcess(p),late=age>v222MsHours(sla);
      var row={
        c:cm.c,pedido:refOf(cm.c),oc:purchase(cm.c),cliente:cm.c.client||"",
        process:p,processLabel:processTitle(p),responsable:v222Responsible(cm.c),
        age:age,slaHours:sla,late:late,blocker:v222Blocker(cm.c),
        next:V222_NEXT_ACTION[p]||"Revisar siguiente acción",
        lead:cm.lead,wait:cm.wait,va:cm.va,dead:cm.dead
      };
      wipRows.push(row);
      if(late){
        alerts.push({severity:"bad",pedido:row.pedido,proceso:row.processLabel,detalle:"Fuera de meta por "+v222Hours(age-v222MsHours(sla)),accion:row.next,age:age});
      }else if(row.blocker!=="Sin bloqueo explícito"){
        alerts.push({severity:"warn",pedido:row.pedido,proceso:row.processLabel,detalle:row.blocker,accion:row.next,age:age});
      }
    }

    if(cm.missingStart){
      alerts.push({severity:"warn",pedido:refOf(cm.c),proceso:processTitle(cm.c.currentProcess),detalle:"Fecha inicial incompleta",accion:"Corregir trazabilidad del pedido",age:0});
    }
  });

  m.waitRows.filter(function(w){return w.dur>v222MsHours(4);}).slice(0,30).forEach(function(w){
    alerts.push({severity:"warn",pedido:w.pedido,proceso:w.proceso,detalle:w.tipo+" · "+v222Hours(w.dur),accion:"Resolver bloqueo o requerimiento",age:w.dur});
  });

  var procMap={};
  m.processRows.forEach(function(r){procMap[r.process]=r;});
  FLOW.forEach(function(p){
    var r=procMap[p];
    if(!r){
      r={process:p,label:processTitle(p),cases:0,wip:0,active:0,wait:0,dead:0,total:0,req:0,cuts:0,doneCuts:0,avg:0,eff:0,waitPct:0,deadPct:0};
      m.processRows.push(r);procMap[p]=r;
    }
    var all=durations[p]||[],done=completedDurations[p]||all;
    r.p50=v222Percentile(done,50);
    r.p90=v222Percentile(done,90);
    r.min=done.length?Math.min.apply(Math,done):0;
    r.max=done.length?Math.max.apply(Math,done):0;
    r.slaHours=v222SlaHoursForProcess(p);
    r.slaCount=done.length;
    r.slaOk=done.filter(function(v){return v<=v222MsHours(r.slaHours);}).length;
    r.slaPct=done.length?Math.round((r.slaOk/done.length)*100):0;
    var pw=wipRows.filter(function(x){return x.process===p;});
    r.wip=pw.length;
    r.wipLate=pw.filter(function(x){return x.late;}).length;
    r.wipAgeAvg=v222Average(pw.map(function(x){return x.age;}));
    r.wipAgeMax=pw.length?Math.max.apply(Math,pw.map(function(x){return x.age;})):0;
    r.flowIndex=FLOW.indexOf(p);
  });
  m.processRows.sort(function(a,b){return a.flowIndex-b.flowIndex;});

  m.wipRows=wipRows.sort(function(a,b){return Number(b.late)-Number(a.late)||b.age-a.age;});
  m.lateWip=m.wipRows.filter(function(x){return x.late;}).length;
  m.pickingRows=pickingRows.sort(function(a,b){return b.total-a.total;});
  m.pickingAvg=v222Average(pickingRows.map(function(x){return x.total;}));
  m.pickingP50=v222Percentile(pickingRows.map(function(x){return x.total;}),50);
  m.pickingP90=v222Percentile(pickingRows.map(function(x){return x.total;}),90);
  m.pickingLate=pickingRows.filter(function(x){return x.late;}).length;

  var physicalCuts=m.cutRows.filter(function(x){return x.modo==="Corte físico"&&x.duracion>0;});
  m.physicalCutAvg=v222Average(physicalCuts.map(function(x){return x.duracion;}));
  m.physicalCutP50=v222Percentile(physicalCuts.map(function(x){return x.duracion;}),50);
  m.physicalCutP90=v222Percentile(physicalCuts.map(function(x){return x.duracion;}),90);
  m.physicalCuts=physicalCuts.length;

  var closedSeries=v222CountBy(m.caseRows.filter(function(r){return r.closed;}).map(function(r){return {day:v222ClosedDay(r)};}),function(x){return x.day;});
  m.throughputSeries=Object.keys(closedSeries).sort().slice(-20).map(function(day){return {day:day,count:closedSeries[day]};});

  var buckets={"0–2 h":0,"2–4 h":0,"4–8 h":0,"> 8 h":0};
  m.wipRows.forEach(function(r){
    var h=r.age/3600000;
    if(h<=2)buckets["0–2 h"]++;
    else if(h<=4)buckets["2–4 h"]++;
    else if(h<=8)buckets["4–8 h"]++;
    else buckets["> 8 h"]++;
  });
  m.wipBuckets=Object.keys(buckets).map(function(k){return {label:k,count:buckets[k]};});
  m.alertRows=alerts.sort(function(a,b){return (a.severity==="bad"?0:1)-(b.severity==="bad"?0:1)||b.age-a.age;}).slice(0,80);
  m.dataQualityPct=m.cases?Math.max(0,Math.round(((m.cases-m.incomplete)/m.cases)*100)):100;
}

function v222Kpi(title,value,detail,kind,tag){
  return '<article class="card kpi '+(kind||'')+'"><span>'+esc(title)+'</span><strong>'+esc(value)+'</strong><small>'+esc(detail)+'</small>'+(tag?'<em class="tag">'+esc(tag)+'</em>':'')+'</article>';
}
function v222Focus(process,title,mainLabel){
  var m=app.metrics,r=(m.processRows||[]).filter(function(x){return x.process===process;})[0]||{};
  return '<article class="card focus-card"><h3>'+esc(title)+'</h3><div class="focus-main">'+esc(mainLabel||v222Hours(r.avg||0))+'</div>'+
    '<small class="muted">Promedio en horas laborales</small>'+
    '<div class="focus-row"><div><span>P50</span><strong>'+v222Hours(r.p50||0)+'</strong></div><div><span>P90</span><strong>'+v222Hours(r.p90||0)+'</strong></div><div><span>WIP</span><strong>'+Number(r.wip||0)+'</strong></div></div></article>';
}
function renderSummaryV225Base(){
  var m=app.metrics;if(!m)return;
  $("summary").innerHTML=
    v222Kpi("WIP actual",m.wip,m.lateWip+" fuera de meta",m.lateWip?"bad":"ok","Pedidos abiertos")+
    v222Kpi("Cerrados",m.closed,"Pedidos completados en el filtro","ok","Throughput "+m.throughput+"/día")+
    v222Kpi("Lead Time promedio",v222Hours(m.leadAvg),"Tiempo laboral total por pedido","","P50 "+v222Hours(m.leadP50))+
    v222Kpi("Tiempo de picking",v222Hours(m.pickingAvg),m.pickingRows.length+" pedidos con alistamiento",m.pickingLate?"warn":"ok","P90 "+v222Hours(m.pickingP90))+
    v222Kpi("Corte físico promedio",v222Hours(m.physicalCutAvg),m.physicalCuts+" cortes físicos","","P90 "+v222Hours(m.physicalCutP90))+
    v222Kpi("Espera promedio",v222Hours(m.waitAvg),"Bloqueos, requerimientos y pausas",m.waitPct>35?"bad":"warn",m.waitPct+"% del LT")+
    v222Kpi("Eficiencia VA",m.eff+"%","Tiempo efectivo frente al Lead Time",m.eff>=60?"ok":(m.eff>=40?"warn":"bad"),"NVA "+m.deadPct+"%")+
    v222Kpi("Calidad de trazabilidad",m.dataQualityPct+"%",m.incomplete+" pedido(s) requieren revisión",m.incomplete?"warn":"ok","Base "+m.cases);

  $("operationalFocus").innerHTML=
    v222Focus("alistamiento","Picking / alistamiento",v222Hours(m.pickingAvg))+
    v222Focus("corte_cable","Corte de cable",v222Hours(((m.processRows||[]).filter(function(x){return x.process==="corte_cable";})[0]||{}).avg||0))+
    v222Focus("recepcion_pedidos","Recepción de pedidos")+
    v222Focus("facturacion","Facturación");

  var bottle=m.bottleneck||{};
  $("bottleneck").innerHTML=bottle.label
    ? '<strong>'+esc(bottle.label)+'</strong><p class="muted">Promedio: '+v222Hours(bottle.avg||0)+' · WIP: '+Number(bottle.wip||0)+' · Espera: '+Number(bottle.waitPct||0)+'%</p>'
    : '<span class="muted">Sin datos suficientes.</span>';

  $("quickBars").innerHTML='<article class="chart-card"><h3>Composición total del tiempo</h3>'+stackTime(m)+'</article>';
  $("ltProductivityAnalysis").innerHTML='<div class="filter-summary"><strong>'+esc(m.vsmType)+'</strong> · '+m.cases+' pedidos analizados · '+m.cancelTotal+' cancelados/anulados excluidos · '+m.notTraced+' no trazados.</div>';
  $("deepKpis").innerHTML=
    v222Kpi("Requerimientos",m.reqCount,m.reqRate+"% de pedidos con requerimiento",m.reqRate>25?"warn":"")+
    v222Kpi("Novedades pendientes",m.reportPending,m.reportCount+" novedades/reportes analizados",m.reportPending?"warn":"ok")+
    v222Kpi("Cortes registrados",m.doneCuts+" / "+m.totalCuts,"Cumplimiento del módulo de Corte",m.totalCuts&&m.doneCuts<m.totalCuts?"warn":"ok");
  v222FilterSummary();
  renderProcessFlow();
  renderPowerCharts();
  renderAlerts();
}
function renderProcessFlowV225Base(){
  var m=app.metrics;if(!m)return;
  $("processFlow").innerHTML=(m.processRows||[]).map(function(r){
    var late=r.wipLate>0,compliance=r.slaCount?r.slaPct:0;
    return '<article class="process-card '+(late?'late':'')+'">'+
      '<div class="process-title"><h3>'+esc(r.label)+'</h3><b>Meta '+r.slaHours+' h</b></div>'+
      '<div class="process-main"><div><span>Promedio laboral</span><strong>'+v222Hours(r.avg||0)+'</strong></div><div><span>WIP</span><strong>'+Number(r.wip||0)+'</strong></div></div>'+
      '<div class="process-stats"><div><span>P50</span><b>'+v222Hours(r.p50||0)+'</b></div><div><span>P90</span><b>'+v222Hours(r.p90||0)+'</b></div><div><span>Atrasados</span><b>'+Number(r.wipLate||0)+'</b></div></div>'+
      '<div class="progress"><i style="width:'+Math.max(0,Math.min(100,compliance))+'%"></i></div>'+
      '<small class="muted">Cumplimiento: '+compliance+'% · '+Number(r.cases||0)+' caso(s)</small>'+
    '</article>';
  }).join('');
}
function v222ChartRows(rows,valueFn,labelFn,metaFn,classFn){
  rows=rows||[];var max=rows.reduce(function(a,r){return Math.max(a,Number(valueFn(r))||0);},0)||1;
  return rows.map(function(r){
    var v=Number(valueFn(r))||0;
    return '<div class="chart-row"><b title="'+esc(labelFn(r))+'">'+esc(labelFn(r))+'</b><div class="chart-track"><i class="'+(classFn?classFn(r):'')+'" style="width:'+Math.max(2,Math.min(100,(v/max)*100))+'%"></i></div><span>'+esc(metaFn(r))+'</span></div>';
  }).join('')||'<p class="muted">Sin datos suficientes.</p>';
}
function renderPowerChartsV225Base(){
  var m=app.metrics;if(!m)return;
  var proc=(m.processRows||[]).filter(function(r){return r.cases||r.wip;});
  var wip=proc.slice().sort(function(a,b){return b.wip-a.wip;});
  var throughput=m.throughputSeries||[];
  $("powerCharts").innerHTML=
    '<article class="chart-card"><h3>Tiempo promedio por proceso</h3>'+v222ChartRows(proc,function(r){return r.avg;},function(r){return r.label;},function(r){return v222Hours(r.avg);})+'</article>'+
    '<article class="chart-card"><h3>WIP por proceso</h3>'+v222ChartRows(wip,function(r){return r.wip;},function(r){return r.label;},function(r){return r.wip+" · "+r.wipLate+" atras.";},function(r){return r.wipLate?"bad":"ok";})+'</article>'+
    '<article class="chart-card"><h3>Cumplimiento de meta</h3>'+v222ChartRows(proc,function(r){return r.slaPct;},function(r){return r.label;},function(r){return r.slaPct+"%";},function(r){return r.slaPct>=80?"ok":(r.slaPct>=60?"warn":"bad");})+'</article>'+
    '<article class="chart-card"><h3>Throughput diario</h3>'+v222ChartRows(throughput,function(r){return r.count;},function(r){return r.day;},function(r){return r.count+" cierre(s)";},function(){return "ok";})+'</article>'+
    '<article class="chart-card"><h3>Antigüedad del WIP</h3>'+v222ChartRows(m.wipBuckets,function(r){return r.count;},function(r){return r.label;},function(r){return r.count+" pedido(s)";},function(r){return r.label==="> 8 h"?"bad":(r.label==="4–8 h"?"warn":"ok");})+'</article>'+
    '<article class="chart-card"><h3>Distribución VA / espera / NVA</h3>'+stackTime(m)+'<div class="legend"><span><i class="dot va"></i>VA '+m.eff+'%</span><span><i class="dot wait"></i>Espera '+m.waitPct+'%</span><span><i class="dot dead"></i>NVA '+m.deadPct+'%</span></div></article>';
}
function renderAlertsV225Base(){
  var m=app.metrics;if(!m)return;
  var rows=(m.alertRows||[]).slice(0,30);
  $("alertsBoard").innerHTML=rows.length
    ? '<div class="alert-list">'+rows.map(function(a){
        return '<div class="alert-item '+a.severity+'"><div><strong>'+esc(a.pedido||"Sin pedido")+'</strong><small>'+esc(a.proceso||"")+'</small></div><div><strong>'+esc(a.detalle||"")+'</strong><small>'+esc(a.accion||"")+'</small></div><span class="badge '+a.severity+'">'+(a.severity==="bad"?"Prioridad alta":"Revisar")+'</span></div>';
      }).join('')+'</div>'
    : '<p class="muted">No hay alertas operativas con los filtros actuales.</p>';
}
function v222StatusBadge(late){
  return late?'<span class="badge bad">Fuera de meta</span>':'<span class="badge ok">Dentro de meta</span>';
}
function v222Table(headers,rows){
  return '<div class="table-wrap"><table>'+table(headers,rows)+'</table></div>';
}
function renderTableV225Base(){
  var m=app.metrics;if(!m)return;
  var view=$("fView").value,title="",count=0,html="";
  if(view==="procesos"){
    title="Rendimiento por proceso";count=m.processRows.length;
    html=v222Table(["Proceso","Casos","WIP","Atrasados","Promedio h","P50 h","P90 h","Meta h","Cumplimiento","Espera","NVA"],m.processRows.map(function(r){
      return '<tr><td><strong>'+esc(r.label)+'</strong></td><td>'+r.cases+'</td><td>'+r.wip+'</td><td>'+r.wipLate+'</td><td>'+v222Hours(r.avg)+'</td><td>'+v222Hours(r.p50)+'</td><td>'+v222Hours(r.p90)+'</td><td>'+r.slaHours+'</td><td>'+r.slaPct+'%</td><td>'+r.waitPct+'%</td><td>'+r.deadPct+'%</td></tr>';
    }));
  }else if(view==="picking"){
    title="Picking / alistamiento";count=m.pickingRows.length;
    html=v222Table(["Pedido","OC","Cliente","Responsable","Estado","Inicio","Fin","Tiempo picking","Ocupación","Espera","NVA","Meta"],m.pickingRows.slice(0,800).map(function(r){
      return '<tr><td><strong>'+esc(r.pedido)+'</strong></td><td>'+esc(r.oc)+'</td><td>'+esc(r.cliente)+'</td><td>'+esc(r.responsable)+'</td><td>'+esc(r.estado)+'</td><td>'+esc(dateTxt(r.inicio))+'</td><td>'+esc(r.cerrado?dateTxt(r.fin):"En curso")+'</td><td><strong>'+v222Hours(r.total)+'</strong></td><td>'+v222Hours(r.active)+'</td><td>'+v222Hours(r.wait)+'</td><td>'+v222Hours(r.dead)+'</td><td>'+v222StatusBadge(r.late)+'</td></tr>';
    }));
  }else if(view==="cortes"){
    title="Detalle de cortes";count=m.cutRows.length;
    html=v222Table(["Pedido","Cliente","Corte","Referencia","Metros","Estado","Responsable","Inicio","Fin","Duración","Modo","Exportación"],m.cutRows.slice(0,1000).map(function(x){
      return '<tr><td><strong>'+esc(x.pedido)+'</strong></td><td>'+esc(x.cliente)+'</td><td>'+esc(x.corte)+'</td><td>'+esc(x.referencia)+'</td><td>'+esc(x.metros)+'</td><td>'+esc(x.estado)+'</td><td>'+esc(x.responsable)+'</td><td>'+esc(dateTxt(x.inicio))+'</td><td>'+esc(dateTxt(x.fin))+'</td><td><strong>'+v222Hours(x.duracion)+'</strong></td><td>'+esc(x.modo)+'</td><td>'+esc(x.legacyRegister)+'</td></tr>';
    }));
  }else if(view==="usuarios"){
    title="Productividad por usuario";count=m.userRows.length;
    html=v222Table(["Usuario","Rol","Casos","Abiertos","Cerrados","Promedio","Ocupación","Espera","NVA","% VA","Procesos"],m.userRows.map(function(r){
      return '<tr><td><strong>'+esc(r.user)+'</strong></td><td>'+esc(roleTitle(r.role))+'</td><td>'+r.count+'</td><td>'+r.open+'</td><td>'+r.closed+'</td><td>'+v222Hours(r.avg)+'</td><td>'+v222Hours(r.active)+'</td><td>'+v222Hours(r.wait)+'</td><td>'+v222Hours(r.dead)+'</td><td>'+r.eff+'%</td><td>'+esc(r.processList||"")+'</td></tr>';
    }));
  }else if(view==="usuario_proceso"){
    title="Usuario por proceso";count=m.userProcessRows.length;
    html=v222Table(["Usuario","Rol","Proceso","Casos","Abiertos","Cerrados","Promedio","Ocupación","Espera","NVA","% VA"],m.userProcessRows.map(function(r){
      return '<tr><td><strong>'+esc(r.user)+'</strong></td><td>'+esc(roleTitle(r.role))+'</td><td>'+esc(r.label)+'</td><td>'+r.count+'</td><td>'+r.open+'</td><td>'+r.closed+'</td><td>'+v222Hours(r.avg)+'</td><td>'+v222Hours(r.active)+'</td><td>'+v222Hours(r.wait)+'</td><td>'+v222Hours(r.dead)+'</td><td>'+r.eff+'%</td></tr>';
    }));
  }else if(view==="pedidos"){
    title="Todos los pedidos";count=m.caseRows.length;
    html=v222Table(["Tipo","Pedido","OC","Cliente","Proceso actual","Estado","LT laboral","Ocupación","Espera","NVA","Eficiencia","Cuello","QA"],m.caseRows.slice(0,900).map(function(r){
      var c=r.c;
      return '<tr><td><span class="pill">'+esc(r.orderType)+'</span></td><td><strong>'+esc(refOf(c))+'</strong></td><td>'+esc(purchase(c))+'</td><td>'+esc(c.client||"")+'</td><td>'+esc(processTitle(c.currentProcess))+'</td><td>'+esc(c.status||"")+'</td><td><strong>'+v222Hours(r.lead)+'</strong></td><td>'+v222Hours(r.va)+'</td><td>'+v222Hours(r.wait)+'</td><td>'+v222Hours(r.dead)+'</td><td>'+pct(r.va,r.lead)+'%</td><td>'+esc(r.bottleneck.label||"")+'</td><td>'+(r.missingStart?'<span class="badge warn">Revisar</span>':'<span class="badge ok">OK</span>')+'</td></tr>';
    }));
  }else if(view==="novedades"){
    title="Novedades y reportes";count=m.reportRows.length;
    html=v222Table(["Pedido","Cliente","Novedad","Estado","Criticidad","Actualizaciones","Primera respuesta","Tiempo respuesta","Tiempo cierre"],m.reportRows.slice(0,800).map(function(r){
      return '<tr><td><strong>'+esc(r.pedido||"")+'</strong></td><td>'+esc(r.cliente||"")+'</td><td>'+esc(r.title||"")+'</td><td>'+esc(r.status||"")+'</td><td>'+esc(r.severity||"")+'</td><td>'+r.updates+'</td><td>'+(r.pending?'<span class="badge warn">Pendiente</span>':esc(dateTxt(r.firstResponse)))+'</td><td><strong>'+v222Hours(r.responseMs)+'</strong></td><td>'+v222Hours(r.closeMs)+'</td></tr>';
    }));
  }else if(view==="cancelados"){
    title="Cancelados y anulados";count=m.cancelRows.length;
    html=v222Table(["Pedido","OC","Cliente","Asesor","Tipo","Proceso","Fecha","Usuario","Motivo","Soporte"],m.cancelRows.map(function(r){
      return '<tr><td><strong>'+esc(r.pedido)+'</strong></td><td>'+esc(r.oc)+'</td><td>'+esc(r.cliente)+'</td><td>'+esc(r.asesor)+'</td><td>'+esc(r.tipo)+'</td><td>'+esc(r.procesoTxt)+'</td><td>'+esc(dateTxt(r.fecha))+'</td><td>'+esc(r.usuario)+'</td><td>'+esc(r.motivo)+'</td><td>'+(r.soporte?'<a href="'+esc(r.soporte)+'" target="_blank" rel="noopener">Abrir</a>':'—')+'</td></tr>';
    }));
  }else if(view==="not_traced"){
    title="No trazados / QA";count=m.notTracedRows.length;
    html=v222Table(["Pedido","Cliente","Estado","Proceso","Motivo"],m.notTracedRows.map(function(r){
      return '<tr><td><strong>'+esc(r.pedido||"")+'</strong></td><td>'+esc(r.cliente||"")+'</td><td>'+esc(r.estado||"")+'</td><td>'+esc(r.proceso||"")+'</td><td>'+esc(r.motivo||"")+'</td></tr>';
    }));
  }else{
    var rows=view==="wip"?m.wipRows:m.wipRows;
    title=view==="wip"?"WIP y atrasos":"Centro operativo · pedidos en curso";count=rows.length;
    html=v222Table(["Pedido","OC","Cliente","Proceso","Responsable","Tiempo en proceso","Meta","Cumplimiento","Bloqueo","Próxima acción","LT total"],rows.slice(0,900).map(function(r){
      return '<tr><td><strong>'+esc(r.pedido)+'</strong></td><td>'+esc(r.oc)+'</td><td>'+esc(r.cliente)+'</td><td>'+esc(r.processLabel)+'</td><td>'+esc(r.responsable)+'</td><td><strong>'+v222Hours(r.age)+'</strong></td><td>'+r.slaHours+' h</td><td>'+v222StatusBadge(r.late)+'</td><td>'+esc(r.blocker)+'</td><td>'+esc(r.next)+'</td><td>'+v222Hours(r.lead)+'</td></tr>';
    }));
  }
  $("tableTitle").textContent=title;
  $("rowCount").textContent=count+" fila(s) · "+m.cases+" pedidos analizados";
  $("mainTable").innerHTML=html;
}
function resetVsmFiltersV225Base(){
  resetVsmFiltersBase();
  $("fSla").value="";
  $("fThreshold").value="8";
  $("fView").value="principal";
  document.querySelectorAll("[data-range]").forEach(function(b){b.classList.remove("active");});
  v222FilterSummary();
}
function caseMatchesBaseFiltersV225Base(c,includeStatus){
  if(!caseMatchesBaseFiltersBase(c,includeStatus))return false;
  var slaFilter=$("fSla").value;
  if(!slaFilter||isCancelledVsm(c)||isClosed(c))return true;
  var age=v222CurrentProcessAge(c);
  var p=c.currentProcess&&PROCESS[c.currentProcess]?c.currentProcess:"recepcion_pedidos";
  var late=age>v222MsHours(v222SlaHoursForProcess(p));
  return slaFilter==="late"?late:!late;
}
function fillFiltersV225Base(){
  fillFiltersBase();
  var p=$("fProcess");
  if(p&&!p.getAttribute("data-v222")){
    p.setAttribute("data-v222","1");
    p.addEventListener("change",function(){
      var key=p.value;
      if(key&&V222_SLA_HOURS[key])$("fThreshold").value=V222_SLA_HOURS[key];
    });
  }
}
function v222SetRange(mode){
  var today=new Date(),from=null,to=new Date(today);
  if(mode==="today")from=new Date(today);
  else if(mode==="7"){from=new Date(today);from.setDate(from.getDate()-6);}
  else if(mode==="30"){from=new Date(today);from.setDate(from.getDate()-29);}
  else if(mode==="month")from=new Date(today.getFullYear(),today.getMonth(),1);
  else if(mode==="all"){from=null;to=null;}
  if(from)$("fFrom").value=isoLocalDay(from);else $("fFrom").value="";
  if(to)$("fTo").value=isoLocalDay(to);else $("fTo").value="";
  document.querySelectorAll("[data-range]").forEach(function(b){b.classList.toggle("active",b.getAttribute("data-range")===mode);});
  refresh().catch(function(e){loading(false);status("Error filtrando: "+esc(e.message||e),"bad");});
}
function bindV225Base(){
  bindBase();
  ["fSla","fThreshold"].forEach(function(id){
    $(id).addEventListener("change",function(){refresh().catch(function(e){loading(false);status("Error recalculando: "+esc(e.message||e),"bad");});});
  });
  document.querySelectorAll("[data-range]").forEach(function(btn){
    btn.addEventListener("click",function(){v222SetRange(btn.getAttribute("data-range"));});
  });
  $("btnApply").onclick=function(){refresh().catch(function(e){loading(false);status("Error aplicando filtros: "+esc(e.message||e),"bad");});};
  $("btnOnlyWip").onclick=function(){
    $("fStatus").value="open";$("fSla").value="";$("fView").value="wip";
    refresh().catch(function(e){loading(false);status("Error filtrando WIP: "+esc(e.message||e),"bad");});
  };
  $("btnDelayed").onclick=function(){
    $("fStatus").value="open";$("fSla").value="late";$("fView").value="wip";
    refresh().catch(function(e){loading(false);status("Error filtrando atrasados: "+esc(e.message||e),"bad");});
  };
}


/* ============================================================
   V225 · V222 MEJORADO: TOTAL, ÁREAS, ACTORES Y CONFIABILIDAD
============================================================ */
var V225_AREA_DEF={
  ventas:{label:"Ventas",processes:[]},
  compras:{label:"Compras",processes:["compras"]},
  logistica:{label:"Logística",processes:["recepcion_pedidos","alistamiento","corte_cable"]},
  facturacion:{label:"Facturación",processes:["facturacion"]},
  caja:{label:"Caja",processes:["caja"]},
  cartera:{label:"Cartera",processes:["cartera"]},
  despacho:{label:"Despacho",processes:["cliente_punto","cliente_recoge","despacho_local","despacho_nacional","cierre_despacho_nacional"]}
};
var V225_AREA_ORDER=["ventas","compras","logistica","facturacion","caja","cartera","despacho"];
var V225_PROCESS_AREA={
  compras:"compras",recepcion_pedidos:"logistica",alistamiento:"logistica",corte_cable:"logistica",
  facturacion:"facturacion",caja:"caja",cartera:"cartera",cliente_punto:"despacho",cliente_recoge:"despacho",
  despacho_local:"despacho",despacho_nacional:"despacho",cierre_despacho_nacional:"despacho"
};

function v225AreaLabel(a){return (V225_AREA_DEF[a]&&V225_AREA_DEF[a].label)||a||"Sin área";}
function v225AreaForProcess(p){return V225_PROCESS_AREA[p]||"";}
function v225Mean(v){v=(v||[]).filter(function(x){return isFinite(x)&&x>=0;});return v.length?v.reduce(function(s,x){return s+x;},0)/v.length:0;}
function v226PeriodWindow(m){
  m=m||{};
  var from=$("fFrom")&&$("fFrom").value;
  var to=$("fTo")&&$("fTo").value;
  var starts=(m.caseRows||[]).map(function(r){return Number(r.start);}).filter(isFinite);
  var ends=(m.caseRows||[]).map(function(r){return Number(r.end);}).filter(isFinite);
  var start=from?new Date(from+"T07:00:00").getTime():(starts.length?Math.min.apply(Math,starts):NaN);
  var end=to?new Date(to+"T17:30:00").getTime():(ends.length?Math.max.apply(Math,ends):nowMs());
  if(!isFinite(start))start=nowMs()-(30*86400000);
  if(!isFinite(end)||end<=start)end=nowMs();
  var hours=workingMsBetween(start,end)/3600000;
  if(!isFinite(hours)||hours<=0)hours=1;
  return {
    start:start,
    end:end,
    hours:hours,
    days:Math.max(1,hours/(8+(50/60)))
  };
}
function v225Median(v){return v222Percentile(v,50);}
function v225Time(ms){return v222Hours(ms);}
function v225Pct(a,b){return b>0?Math.round((a/b)*100):0;}
function v225Status(value,good,warn){
  if(value>=good)return {cls:"ok",label:"Adecuado"};
  if(value>=warn)return {cls:"warn",label:"Atención"};
  return {cls:"bad",label:"Crítico"};
}
function v225AreaTouches(c,area){
  if(!area)return true;
  if(area==="ventas")return !!(c.salesAdvisor||c.createdBy||c.createdByName||c.createdByEmail);
  var def=V225_AREA_DEF[area]||{processes:[]},ps=c.processStats||{};
  return def.processes.some(function(p){return c.currentProcess===p||!!ps[p]||(p==="corte_cable"&&(c.cutRequests||[]).length>0);});
}
function v225CountRework(c){
  var txt=lower(JSON.stringify([c.history||[],c.flowTrace||[],c.requirements||[],c.openRequirement||{},c.status||""]));
  var hits=0;
  ["devuelto","devolucion","reproceso","retrabajo","corregir","rechazado","no conforme","pendiente correccion"].forEach(function(k){
    if(txt.indexOf(k)>=0)hits++;
  });
  return hits;
}
function v225ReliabilityForCase(cm){
  var c=cm.c,score=100,issues=[];
  if(cm.missingStart){score-=20;issues.push("sin fecha inicial");}
  if(!(c.updatedAt||c.closedAt||c.completedAt)){score-=10;issues.push("sin actualización final");}
  if(!c.currentProcess){score-=15;issues.push("sin proceso");}
  if(!c.status){score-=10;issues.push("sin estado");}
  if(!c.assignedRole&&!c.assignedName){score-=10;issues.push("sin responsable");}
  if((c.cutRequests||[]).length && !(c.cutRequests||[]).every(function(x){return x.status||x.registeredAt||x.noCutNeeded||x.medidaCompleta;})){score-=10;issues.push("corte incompleto");}
  var rework=v225CountRework(c);if(rework){score-=Math.min(20,rework*5);issues.push("reproceso/devolución");}
  return {score:Math.max(0,score),issues:issues,rework:rework};
}
function v225BuildAreaRows(m){
  return V225_AREA_ORDER.map(function(area){
    var def=V225_AREA_DEF[area],caseRows=(m.caseRows||[]).filter(function(cm){
      return area==="ventas" || (cm.pRows||[]).some(function(p){return def.processes.indexOf(p.process)>=0;});
    });
    if(!caseRows.length)return null;
    var procRows=(m.processRows||[]).filter(function(r){return def.processes.indexOf(r.process)>=0;});
    var cases=caseRows.length,wip=caseRows.filter(function(cm){return !cm.closed&&v225AreaForProcess(cm.c.currentProcess)===area;}).length;
    var closed=caseRows.filter(function(cm){return cm.closed;}).length;
    var total=procRows.reduce(function(s,r){return s+(r.total||0);},0);
    var active=procRows.reduce(function(s,r){return s+(r.active||0);},0);
    var wait=procRows.reduce(function(s,r){return s+(r.wait||0);},0);
    var residual=Math.max(0,total-active-wait);
    var avg=cases?total/cases:0,work=cases?active/cases:0,block=cases?wait/cases:0;
    var unexplained=cases?residual/cases:0;
    var complianceDen=procRows.reduce(function(s,r){return s+(r.slaCount||0);},0);
    var complianceNum=procRows.reduce(function(s,r){return s+(r.slaOk||0);},0);
    var compliance=complianceDen?v225Pct(complianceNum,complianceDen):0;
    var rework=caseRows.reduce(function(s,cm){return s+v225CountRework(cm.c);},0);
    var reliabilities=caseRows.map(v225ReliabilityForCase);
    var reliability=Math.round(v225Mean(reliabilities.map(function(x){return x.score;})));
    var workers={};
    caseRows.forEach(function(cm){
      if(area==="ventas"){
        var adv=advisor(cm.c);if(adv)workers[normKey(adv)]=1;
      }else{
        (cm.pRows||[]).filter(function(p){return def.processes.indexOf(p.process)>=0;}).forEach(function(p){
          personsForProcess(cm.c,p.process).forEach(function(x){if(!x.synthetic)workers[x.key]=1;});
        });
      }
    });
    var workerCount=Object.keys(workers).length;
    var period=v226PeriodWindow(m);
    var utilization=period.hours&&workerCount?active/(period.hours*3600000*workerCount):0;
    return {
      area:area,label:v225AreaLabel(area),cases:cases,wip:wip,closed:closed,avg:avg,work:work,block:block,
      unexplained:unexplained,compliance:compliance,rework:rework,reliability:reliability,
      workers:workerCount,utilization:utilization,utilizationPct:Math.round(utilization*100)
    };
  }).filter(Boolean);
}
function v225BuildActorRows(m){
  var caseReliability={};
  (m.caseRows||[]).forEach(function(cm){caseReliability[idOf(cm.c)]=v225ReliabilityForCase(cm);});
  return (m.userRows||[]).filter(function(r){return !r.synthetic&&!v231IsExcludedSuperAdmin(r);}).map(function(r){
    var related=(m.userProcessRows||[]).filter(function(x){return x.key.indexOf(normKey(r.user)+"|")===0||x.user===r.user;});
    var processCompliance=related.length?Math.round(v225Mean(related.map(function(x){
      var pr=(m.processRows||[]).filter(function(p){return p.process===x.process;})[0];
      return pr?pr.slaPct:0;
    }))):0;
    var directPerCase=r.count?r.active/r.count:0;
    var handled=Math.max(1,r.count);
    var period=v226PeriodWindow(m);
    var directLoad=period.hours?r.active/(period.hours*3600000):0;
    var status=v225Status(processCompliance,85,65);
    return Object.assign({},r,{
      directPerCase:directPerCase,
      directLoadPct:Math.round(directLoad*100),
      compliance:processCompliance,
      status:status,
      productivity:r.count?Math.round((r.closed/handled)*100):0
    });
  }).sort(function(a,b){return b.active-a.active||b.count-a.count;});
}
function v225BuildReliability(m){
  var rows=(m.caseRows||[]).map(function(cm){var r=v225ReliabilityForCase(cm);r.cm=cm;return r;});
  var avg=Math.round(v225Mean(rows.map(function(x){return x.score;})));
  var high=rows.filter(function(x){return x.score>=90;}).length;
  var medium=rows.filter(function(x){return x.score>=70&&x.score<90;}).length;
  var low=rows.filter(function(x){return x.score<70;}).length;
  var rework=rows.reduce(function(s,x){return s+x.rework;},0);
  var completeResponsible=rows.filter(function(x){var c=x.cm.c;return !!(c.assignedName||c.assignedRole);}).length;
  var completeProcess=rows.filter(function(x){return !!x.cm.c.currentProcess;}).length;
  var completeStatus=rows.filter(function(x){return !!x.cm.c.status;}).length;
  return {
    avg:avg,high:high,medium:medium,low:low,rework:rework,
    responsiblePct:v225Pct(completeResponsible,rows.length),
    processPct:v225Pct(completeProcess,rows.length),
    statusPct:v225Pct(completeStatus,rows.length)
  };
}
function v225CoverageCard(title,value,detail){
  return '<article class="coverage-card"><span>'+esc(title)+'</span><strong>'+esc(value)+'</strong><small>'+esc(detail)+'</small></article>';
}
function v225Kpi(title,value,detail,kind,tag){return v222Kpi(title,value,detail,kind,tag);}
function v225TotalLoaded(){
  return (app.cases||[]).length;
}
async function computeV227Base(cases,cancelledCases){
  await computeV225Base(cases,cancelledCases);
  var m=app.metrics;if(!m)return;
  m.areaRows=v225BuildAreaRows(m);
  m.actorRows=v225BuildActorRows(m);
  m.reliability=v225BuildReliability(m);
  m.totalLoaded=v225TotalLoaded();
  m.filteredTotal=(app.cases||[]).filter(function(c){return caseMatchesBaseFilters(c,false);}).length;
  m.reworkTotal=m.reliability.rework;
  m.trueUnexplainedTotal=Math.max(0,(m.dead||0)-Math.min(m.dead||0,(m.wait||0)*0.25));
  m.trueUnexplainedAvg=m.cases?m.trueUnexplainedTotal/m.cases:0;
}
function renderCoverage(){
  var m=app.metrics;if(!m)return;
  $("coverageBand").innerHTML=
    v225CoverageCard("Total cargado",m.totalLoaded,"Todos los pedidos obtenidos desde Firestore.")+
    v225CoverageCard("Dentro del filtro",m.filteredTotal,"Pedidos que cumplen fechas, estado, área y búsqueda.")+
    v225CoverageCard("Trazados VSM",m.cases,"Pedidos con tiempos calculables.")+
    v225CoverageCard("No trazados / QA",m.notTraced,"Permanecen visibles para revisión.")+
    v225CoverageCard("Cancelados / anulados",m.cancelTotal,"Separados de los indicadores operativos.")+
    v225CoverageCard("Excluidos del KPI",m.excludedKpi,"No contaminan tiempos ni productividad.");
}
function renderSummaryV227Base(){
  var m=app.metrics;if(!m)return;
  $("summary").innerHTML=
    v225Kpi("Total de pedidos",String(m.totalLoaded),"Base completa cargada desde Firestore","ok","Filtrados "+m.filteredTotal)+
    v225Kpi("WIP actual",String(m.wip),m.lateWip+" fuera de meta",m.lateWip?"bad":"ok","Pedidos abiertos")+
    v225Kpi("Cerrados",String(m.closed),"Throughput "+m.throughput+" por día","ok","Filtro actual")+
    v225Kpi("Lead Time P50",v225Time(m.leadP50),"Mediana en horas laborales","","P90 "+v225Time(m.leadP90))+
    v225Kpi("Picking promedio",v225Time(m.pickingAvg),m.pickingRows.length+" pedidos con alistamiento",m.pickingLate?"warn":"ok","P90 "+v225Time(m.pickingP90))+
    v225Kpi("Corte físico",v225Time(m.physicalCutAvg),m.physicalCuts+" cortes físicos","","P90 "+v225Time(m.physicalCutP90))+
    v225Kpi("Trabajo directo promedio",v225Time(m.vaAvg),"Actividad registrada por pedido","ok",m.eff+"% del LT")+
    v225Kpi("Bloqueo explícito",v225Time(m.waitAvg),"Requerimientos, pagos y esperas documentadas",m.waitPct>30?"warn":"ok",m.waitPct+"% del LT")+
    v225Kpi("Tiempo de espera acumulado",v225Time(m.trueUnexplainedAvg),"Solo residuo sin marcas suficientes; no es improductividad",m.trueUnexplainedAvg>m.vaAvg?"warn":"ok","Revisar trazabilidad")+
    v225Kpi("Confiabilidad del proceso",m.reliability.avg+"%","Calidad promedio de estados, responsables y fechas",m.reliability.avg>=90?"ok":(m.reliability.avg>=70?"warn":"bad"),m.reliability.low+" casos críticos")+
    v225Kpi("No entregas",String(m.reworkTotal),"Casos con señales de corrección, devolución o no conformidad",m.reworkTotal?"warn":"ok","Filtro actual")+
    v225Kpi("Cumplimiento documental",m.reliability.responsiblePct+"%","Pedidos con responsable identificado",m.reliability.responsiblePct>=90?"ok":"warn","Proceso "+m.reliability.processPct+"%");

  $("operationalFocus").innerHTML=
    v222Focus("alistamiento","Picking / alistamiento",v225Time(m.pickingAvg))+
    v222Focus("corte_cable","Corte de cable",v225Time(((m.processRows||[]).filter(function(x){return x.process==="corte_cable";})[0]||{}).avg||0))+
    v222Focus("recepcion_pedidos","Recepción de pedidos")+
    v222Focus("facturacion","Facturación");

  var bottle=m.bottleneck||{};
  $("bottleneck").innerHTML=bottle.label
    ? '<strong>'+esc(bottle.label)+'</strong><p class="muted">Promedio '+v225Time(bottle.avg||0)+' · WIP '+Number(bottle.wip||0)+' · espera '+Number(bottle.waitPct||0)+'%.</p>'
    : '<span class="muted">Sin datos suficientes.</span>';

  $("quickBars").innerHTML='<article class="chart-card"><h3>Composición del Lead Time</h3>'+v225Stack(m)+'</article>';
  $("ltProductivityAnalysis").innerHTML='<div class="filter-summary"><strong>Lectura correcta:</strong> el tiempo que un pedido espera porque el actor atiende otro pedido no se clasifica automáticamente como tiempo muerto. La productividad por actor se mide con trabajo directo, cumplimiento, casos atendidos y calidad del registro.</div>';
  $("deepKpis").innerHTML=
    v225Kpi("Eficiencia de flujo",m.eff+"%","Trabajo directo / Lead Time observado",m.eff>=55?"ok":(m.eff>=35?"warn":"bad"),"No es productividad individual")+
    v225Kpi("Calidad de trazabilidad",m.dataQualityPct+"%",m.incomplete+" pedido(s) con datos incompletos",m.incomplete?"warn":"ok","Base "+m.cases)+
    v225Kpi("Novedades pendientes",m.reportPending+"",m.reportCount+" novedades analizadas",m.reportPending?"warn":"ok")+
    v225Kpi("Cortes registrados",m.doneCuts+" / "+m.totalCuts,"Finalizados, medida completa o no necesita corte",m.totalCuts&&m.doneCuts<m.totalCuts?"warn":"ok");

  v225FilterSummary();
  renderCoverage();
  renderAreaBoard();
  renderProcessFlow();
  renderActorBoard();
  renderPowerCharts();
  renderReliability();
  renderAlerts();
}
function v225Stack(m){
  var total=Math.max(1,m.leadTotal||0);
  var work=v225Pct(m.va,total),block=v225Pct(m.wait,total),unexplained=v225Pct(m.trueUnexplainedTotal,total);
  var contextual=Math.max(0,100-work-block-unexplained);
  return '<div class="stack"><i class="va" style="width:'+work+'%"></i><i class="wait" style="width:'+block+'%"></i><i class="dead" style="width:'+unexplained+'%"></i><i style="width:'+contextual+'%;background:#2563eb"></i></div>'+
    '<div class="legend"><span><i class="dot va"></i>Trabajo '+work+'%</span><span><i class="dot wait"></i>Bloqueo '+block+'%</span><span><i class="dot dead"></i>No explicado '+unexplained+'%</span><span><i class="dot" style="background:#2563eb"></i>Espera contextual '+contextual+'%</span></div>';
}
function v225FilterSummary(){
  var parts=[];
  if($("fFrom").value||$("fTo").value)parts.push("Fecha "+($("fFrom").value||"inicio")+" a "+($("fTo").value||"hoy"));
  if($("fArea").value)parts.push(v225AreaLabel($("fArea").value));
  if($("fOrderType").value)parts.push($("fOrderType").value==="pve"?"PVE":"Normal");
  if($("fProcess").value)parts.push(processTitle($("fProcess").value));
  if($("fStatus").value)parts.push($("fStatus").options[$("fStatus").selectedIndex].text);
  if($("fSla").value)parts.push($("fSla").value==="late"?"Fuera de meta":"Dentro de meta");
  if($("fUser").value)parts.push($("fUser").options[$("fUser").selectedIndex].text);
  if(clean($("fSearch").value))parts.push('Búsqueda "'+clean($("fSearch").value)+'"');
  $("filterSummary").textContent=(parts.length?parts.join(" · "):"Sin filtros restrictivos")+
    " · Total cargado: "+v225TotalLoaded()+" pedido(s).";
}
function renderAreaBoardV228Base(){
  var m=app.metrics;if(!m)return;
  $("areaBoard").innerHTML=(m.areaRows||[]).map(function(r){
    var status=v225Status(r.compliance,85,65);
    return '<article class="process-card '+(status.cls==="bad"?'late':'')+'">'+
      '<div class="process-title"><h3>'+esc(r.label)+'</h3><span class="status-chip '+status.cls+'">'+status.label+'</span></div>'+
      '<div class="process-main"><div><span>LT promedio</span><strong>'+v225Time(r.avg)+'</strong></div><div><span>Cumplimiento</span><strong>'+r.compliance+'%</strong></div></div>'+
      '<div class="process-stats"><div><span>Trabajo</span><b>'+v225Time(r.work)+'</b></div><div><span>Bloqueo</span><b>'+v225Time(r.block)+'</b></div><div><span>WIP</span><b>'+r.wip+'</b></div></div>'+
      '<div class="progress"><i style="width:'+Math.max(0,Math.min(100,r.compliance))+'%"></i></div>'+
      '<small class="metric-note">Casos '+r.cases+' · cerrados '+r.closed+' · actores '+r.workers+' · confiabilidad '+r.reliability+'% · reprocesos '+r.rework+'</small>'+
    '</article>';
  }).join("")||'<p class="muted">Sin datos suficientes por área.</p>';
}
function renderProcessFlow(){
  var m=app.metrics;if(!m)return;
  $("processFlow").innerHTML=(m.processRows||[]).map(function(r){
    var direct=r.cases?r.active/r.cases:0,block=r.cases?r.wait/r.cases:0,residual=r.cases?r.dead/r.cases:0;
    var status=v225Status(r.slaPct||0,85,65);
    return '<article class="process-card '+(r.wipLate?'late':'')+'">'+
      '<div class="process-title"><h3>'+esc(r.label)+'</h3><span class="status-chip '+status.cls+'">'+status.label+'</span></div>'+
      '<div class="process-main"><div><span>LT promedio</span><strong>'+v225Time(r.avg||0)+'</strong></div><div><span>Cumplimiento</span><strong>'+Number(r.slaPct||0)+'%</strong></div></div>'+
      '<div class="process-stats"><div><span>Trabajo directo</span><b>'+v225Time(direct)+'</b></div><div><span>Bloqueo</span><b>'+v225Time(block)+'</b></div><div><span>WIP / atraso</span><b>'+Number(r.wip||0)+' / '+Number(r.wipLate||0)+'</b></div></div>'+
      '<div class="progress"><i style="width:'+Math.max(0,Math.min(100,r.slaPct||0))+'%"></i></div>'+
      '<small class="metric-note">P50 '+v225Time(r.p50||0)+' · P90 '+v225Time(r.p90||0)+' · tiempo de espera acumulado '+v225Time(residual)+'</small>'+
    '</article>';
  }).join("");
}
function renderActorBoard(){
  var m=app.metrics;if(!m)return;
  $("actorBoard").innerHTML=(m.actorRows||[]).slice(0,12).map(function(r){
    var status=r.status||v225Status(r.compliance,85,65);
    return '<article class="process-card '+(status.cls==="bad"?'late':'')+'">'+
      '<div class="process-title"><h3>'+esc(r.user)+'</h3><span class="status-chip '+status.cls+'">'+status.label+'</span></div>'+
      '<div class="process-main"><div><span>Trabajo directo</span><strong>'+v225Time(r.active)+'</strong></div><div><span>Cumplimiento</span><strong>'+r.compliance+'%</strong></div></div>'+
      '<div class="process-stats"><div><span>Casos</span><b>'+r.count+'</b></div><div><span>WIP</span><b>'+r.open+'</b></div><div><span>Cerrados</span><b>'+r.closed+'</b></div></div>'+
      '<small class="metric-note">Promedio directo '+v225Time(r.directPerCase)+' · productividad de cierre '+r.productivity+'% · carga directa '+r.directLoadPct+'%</small>'+
    '</article>';
  }).join("")||'<p class="muted">No hay actores trazados con los filtros actuales.</p>';
}
function renderReliabilityV228Base(){
  var m=app.metrics;if(!m)return;var r=m.reliability;
  $("reliabilityBoard").innerHTML=
    '<article class="reliability-card"><h3>Confiabilidad general</h3><strong>'+r.avg+'%</strong><small>Calidad promedio de fechas, estados, responsables y proceso.</small></article>'+
    '<article class="reliability-card"><h3>Registros confiables</h3><strong>'+r.high+'</strong><small>Casos con confiabilidad igual o superior al 90%.</small></article>'+
    '<article class="reliability-card"><h3>Registros por revisar</h3><strong>'+r.medium+'</strong><small>Casos entre 70% y 89%.</small></article>'+
    '<article class="reliability-card"><h3>Registros críticos</h3><strong>'+r.low+'</strong><small>Casos por debajo de 70%.</small></article>'+
    '<article class="reliability-card"><h3>No entregas</h3><strong>'+r.rework+'</strong><small>Señales encontradas en historia, requerimientos o estados.</small></article>'+
    '<article class="reliability-card"><h3>Responsable identificado</h3><strong>'+r.responsiblePct+'%</strong><small>Pedidos con actor o rol responsable registrado.</small></article>';
}
function v225ChartRows(rows,valueFn,labelFn,metaFn,classFn){
  rows=rows||[];var max=rows.reduce(function(a,r){return Math.max(a,Number(valueFn(r))||0);},0)||1;
  return rows.map(function(r){
    var v=Number(valueFn(r))||0;
    return '<div class="chart-row"><b title="'+esc(labelFn(r))+'">'+esc(labelFn(r))+'</b><div class="chart-track"><i class="'+(classFn?classFn(r):'')+'" style="width:'+Math.max(2,Math.min(100,(v/max)*100))+'%"></i></div><span>'+esc(metaFn(r))+'</span></div>';
  }).join("")||'<p class="muted">Sin datos suficientes.</p>';
}
function renderPowerChartsV227Base(){
  var m=app.metrics;if(!m)return;
  var proc=(m.processRows||[]).filter(function(r){return r.cases||r.wip;});
  $("powerCharts").innerHTML=
    '<article class="chart-card"><h3>LT promedio por proceso</h3>'+v225ChartRows(proc,function(r){return r.avg;},function(r){return r.label;},function(r){return v225Time(r.avg);})+'</article>'+
    '<article class="chart-card"><h3>Cumplimiento por proceso</h3>'+v225ChartRows(proc,function(r){return r.slaPct;},function(r){return r.label;},function(r){return r.slaPct+"%";},function(r){return r.slaPct>=85?"ok":(r.slaPct>=65?"warn":"bad");})+'</article>'+
    '<article class="chart-card"><h3>WIP por proceso</h3>'+v225ChartRows(proc.slice().sort(function(a,b){return b.wip-a.wip;}),function(r){return r.wip;},function(r){return r.label;},function(r){return r.wip+" · "+r.wipLate+" atras.";},function(r){return r.wipLate?"bad":"ok";})+'</article>'+
    '<article class="chart-card"><h3>Confiabilidad por área</h3>'+v225ChartRows(m.areaRows,function(r){return r.reliability;},function(r){return r.label;},function(r){return r.reliability+"%";},function(r){return r.reliability>=90?"ok":(r.reliability>=70?"warn":"bad");})+'</article>'+
    '<article class="chart-card"><h3>Trabajo directo por actor</h3>'+v225ChartRows((m.actorRows||[]).slice(0,12),function(r){return r.active;},function(r){return r.user;},function(r){return v225Time(r.active)+" · "+r.count+" casos";},function(){return "ok";})+'</article>'+
    '<article class="chart-card"><h3>No entregas por área</h3>'+v225ChartRows(m.areaRows,function(r){return r.rework;},function(r){return r.label;},function(r){return r.rework+" señal(es)";},function(r){return r.rework?"warn":"ok";})+'</article>';
}
function renderAlerts(){renderAlertsV225Base();}
function caseMatchesBaseFilters(c,includeStatus){
  if(!caseMatchesBaseFiltersV225Base(c,includeStatus))return false;
  var area=$("fArea").value;
  return !area||v225AreaTouches(c,area);
}
function fillFilters(){fillFiltersV225Base();}
function resetVsmFilters(){
  resetVsmFiltersV225Base();
  $("fArea").value="";
  v225FilterSummary();
}
function renderTableV227Base(){
  var m=app.metrics;if(!m)return;
  var view=$("fView").value;
  if(view==="areas"){
    $("tableTitle").textContent="Resumen por área";
    $("rowCount").textContent=m.areaRows.length+" área(s) · total cargado "+m.totalLoaded;
    $("mainTable").innerHTML=v225Table(["Área","Casos","WIP","Cerrados","LT promedio","Trabajo directo","Bloqueo","No explicado","Cumplimiento","Confiabilidad","Reprocesos","Actores"],m.areaRows.map(function(r){
      return '<tr><td><strong>'+esc(r.label)+'</strong></td><td>'+r.cases+'</td><td>'+r.wip+'</td><td>'+r.closed+'</td><td>'+v225Time(r.avg)+'</td><td>'+v225Time(r.work)+'</td><td>'+v225Time(r.block)+'</td><td>'+v225Time(r.unexplained)+'</td><td>'+r.compliance+'%</td><td>'+r.reliability+'%</td><td>'+r.rework+'</td><td>'+r.workers+'</td></tr>';
    }));
    return;
  }
  if(view==="confiabilidad"){
    $("tableTitle").textContent="Confiabilidad y reprocesos";
    var rows=(m.caseRows||[]).map(function(cm){var r=v225ReliabilityForCase(cm);return {cm:cm,r:r};}).sort(function(a,b){return a.r.score-b.r.score;});
    $("rowCount").textContent=rows.length+" pedido(s) · total cargado "+m.totalLoaded;
    $("mainTable").innerHTML=v225Table(["Pedido","Cliente","Proceso","Estado","Responsable","Confiabilidad","Reprocesos","Hallazgos"],rows.map(function(x){
      var c=x.cm.c;
      return '<tr><td><strong>'+esc(refOf(c))+'</strong></td><td>'+esc(c.client||"")+'</td><td>'+esc(processTitle(c.currentProcess))+'</td><td>'+esc(c.status||"")+'</td><td>'+esc(c.assignedName||advisor(c)||"Sin responsable")+'</td><td>'+x.r.score+'%</td><td>'+x.r.rework+'</td><td>'+esc(x.r.issues.join(", ")||"Sin hallazgos")+'</td></tr>';
    }));
    return;
  }
  renderTableV225Base();
  $("rowCount").textContent=$("rowCount").textContent+" · total cargado "+m.totalLoaded;
}
function v225Table(headers,rows){return '<div class="table-wrap"><table>'+table(headers,rows)+'</table></div>';}
function bindV227Base(){
  bindV225Base();
  $("fArea").addEventListener("change",function(){refresh().catch(function(e){loading(false);status("Error filtrando por área: "+esc(e.message||e),"bad");});});
}


/* ============================================================
   V227 · TIEMPO DE ESPERA ACUMULADO Y TRAZABILIDAD
============================================================ */
function v227Scope(){
  var area=$("fArea")&&$("fArea").value;
  var process=$("fProcess")&&$("fProcess").value;
  var label="Todas las áreas";
  if(area)label=v225AreaLabel(area);
  if(process)label=(area?v225AreaLabel(area)+" · ":"")+processTitle(process);
  return {area:area||"",process:process||"",label:label};
}
function v227AreaForEventText(text){
  text=lower(text||"");
  if(/ventas|asesor|vendedor/.test(text))return "ventas";
  if(/compra|compras|pve/.test(text))return "compras";
  if(/factur/.test(text))return "facturacion";
  if(/cartera|cr[eé]dito|cupo/.test(text))return "cartera";
  if(/caja|pago|recaudo/.test(text))return "caja";
  if(/despacho|transportadora|guia|entrega|cliente recoge|cliente punto/.test(text))return "despacho";
  if(/recepcion|alistamiento|picking|corte|logistica/.test(text))return "logistica";
  return "";
}
function v227RequirementTimes(c){
  var now=nowMs(),rows=[],scope=v227Scope();
  var reqs=[];
  if(c.openRequirement)reqs.push(c.openRequirement);
  (c.requirements||[]).forEach(function(r){reqs.push(r);});
  reqs.forEach(function(r,idx){
    if(!r)return;
    var start=tms(r.sentAt)||tms(r.createdAt)||tms(r.openedAt)||tms(r.requestedAt);
    var end=tms(r.resolvedAt)||tms(r.closedAt)||tms(r.completedAt)||tms(r.respondedAt)||tms(r.updatedAt);
    var status=lower(r.status||"");
    if(!end && !/cerr|resuel|complet|final/.test(status))end=now;
    if(!isFinite(start)||!isFinite(end)||end<start)return;
    var text=[r.reason,r.detail,r.description,r.targetRole,r.sourceProcess,r.source,r.type,r.category].join(" ");
    var area=v227AreaForEventText(text)||v225AreaForProcess(r.sourceProcess)||v225AreaForProcess(c.currentProcess);
    if(scope.area&&area&&scope.area!==area)return;
    if(scope.process&&r.sourceProcess&&scope.process!==r.sourceProcess)return;
    rows.push({
      type:"Requerimiento",
      area:area||v225AreaForProcess(c.currentProcess)||"logistica",
      process:r.sourceProcess||c.currentProcess||"",
      duration:workingMsBetween(start,end),
      start:start,end:end,
      detail:r.reason||r.detail||r.description||"Requerimiento registrado",
      open:!/cerr|resuel|complet|final/.test(status)
    });
  });
  return rows;
}
function v227ReportTimes(c,m){
  var scope=v227Scope(),id=idOf(c);
  return (m.reportRows||[]).filter(function(r){
    var reportCase=String(r.caseId||r.sourceId||r.pedido||"");
    return reportCase===id||reportCase===refOf(c)||String(r.pedido||"")===refOf(c);
  }).map(function(r){
    var text=[r.title,r.category,r.sourceModule,r.status,r.severity].join(" ");
    var area=v227AreaForEventText(text)||v225AreaForProcess(c.currentProcess);
    if(scope.area&&area&&scope.area!==area)return null;
    var duration=Number(r.closeMs||r.responseMs||0);
    return {
      type:"Novedad",
      area:area||"logistica",
      process:c.currentProcess||"",
      duration:duration,
      detail:r.title||r.category||"Novedad registrada",
      open:!!r.pending
    };
  }).filter(function(x){return x&&x.duration>0;});
}
function v227ReworkTimes(c){
  var scope=v227Scope(),events=allTraceEvents(c),rows=[];
  var keys=/reproceso|retrabajo|devuelto|devolucion|no conforme|rechazado|corregir|correccion|retorno|regresar|reabrir/;
  for(var i=0;i<events.length;i++){
    var e=events[i],txt=lower([e.type,e.detail,e.process,e.role].join(" "));
    if(!keys.test(txt))continue;
    var end=i<events.length-1?events[i+1].ms:(tms(c.closedAt)||tms(c.updatedAt)||nowMs());
    if(!isFinite(e.ms)||!isFinite(end)||end<e.ms)continue;
    var area=v227AreaForEventText(txt)||v225AreaForProcess(e.process)||v225AreaForProcess(c.currentProcess);
    if(scope.area&&area&&scope.area!==area)continue;
    if(scope.process&&e.process&&scope.process!==e.process)continue;
    rows.push({
      type:/devuel|devolucion|retorno/.test(txt)?"Devolución":"Reproceso",
      area:area||"logistica",
      process:e.process||c.currentProcess||"",
      duration:workingMsBetween(e.ms,end),
      detail:e.detail||e.type||"Evento de reproceso",
      open:false
    });
  }
  return rows;
}
function v227ProcessWaitForCase(cm){
  var scope=v227Scope(),rows=(cm.pRows||[]);
  if(scope.process)rows=rows.filter(function(p){return p.process===scope.process;});
  else if(scope.area){
    var def=V225_AREA_DEF[scope.area]||{processes:[]};
    if(scope.area==="ventas")rows=[];
    else rows=rows.filter(function(p){return def.processes.indexOf(p.process)>=0;});
  }
  return rows.reduce(function(s,p){return s+(p.wait||0);},0);
}
function v227BuildWaiting(m){
  var details=[],processWait=0,requirement=0,novelty=0,rework=0,devolution=0;
  (m.caseRows||[]).forEach(function(cm){
    var c=cm.c;
    processWait+=v227ProcessWaitForCase(cm);
    v227RequirementTimes(c).forEach(function(x){requirement+=x.duration;details.push(Object.assign({pedido:refOf(c)},x));});
    v227ReportTimes(c,m).forEach(function(x){novelty+=x.duration;details.push(Object.assign({pedido:refOf(c)},x));});
    v227ReworkTimes(c).forEach(function(x){
      if(x.type==="Devolución")devolution+=x.duration;else rework+=x.duration;
      details.push(Object.assign({pedido:refOf(c)},x));
    });
  });

  // Evitar que la suma supere el tiempo disponible total de los pedidos.
  var raw=processWait+requirement+novelty+rework+devolution;
  var maxAvailable=Math.max(0,(m.leadTotal||0)-(m.va||0));
  var total=Math.min(raw,maxAvailable||raw);
  var scale=raw>0&&total<raw?total/raw:1;

  processWait*=scale;requirement*=scale;novelty*=scale;rework*=scale;devolution*=scale;
  details.forEach(function(x){x.duration*=scale;});
  details.sort(function(a,b){return b.duration-a.duration;});

  return {
    scope:v227Scope(),
    total:total,
    processWait:processWait,
    requirement:requirement,
    novelty:novelty,
    rework:rework,
    devolution:devolution,
    average:m.cases?total/m.cases:0,
    details:details,
    openRequirements:details.filter(function(x){return x.type==="Requerimiento"&&x.open;}).length,
    openNovelties:details.filter(function(x){return x.type==="Novedad"&&x.open;}).length
  };
}
async function computeV228Base(cases,cancelledCases){
  await computeV227Base(cases,cancelledCases);
  var m=app.metrics;if(!m)return;
  m.waiting=v227BuildWaiting(m);
  m.trueUnexplainedTotal=0;
  m.trueUnexplainedAvg=0;
}
function v227WaitCard(title,value,detail,kind,scope){
  return '<article class="wait-card '+(kind||'')+'"><span>'+esc(title)+'</span><strong>'+esc(value)+'</strong><small>'+esc(detail)+'</small><em class="wait-scope">'+esc(scope)+'</em></article>';
}
function renderWaitBoardV228Base(){
  var m=app.metrics;if(!m||!m.waiting)return;
  var w=m.waiting,scope=w.scope.label;
  $("waitSectionTitle").textContent="Tiempo de espera acumulado · "+scope;
  $("waitSectionSubtitle").textContent="Suma de esperas de procesos, requerimientos, novedades, devoluciones y reprocesos para "+scope+".";
  $("waitBoard").innerHTML=
    v227WaitCard("Espera acumulada",v225Time(w.total),"Total laboral de todas las esperas trazadas.","warn",scope)+
    v227WaitCard("Espera de procesos",v225Time(w.processWait),"Estados de espera registrados dentro de los procesos.","info",scope)+
    v227WaitCard("Requerimientos",v225Time(w.requirement),w.openRequirements+" requerimiento(s) aún abierto(s).",w.openRequirements?"bad":"ok",scope)+
    v227WaitCard("Novedades",v225Time(w.novelty),w.openNovelties+" novedad(es) pendiente(s).",w.openNovelties?"warn":"ok",scope)+
    v227WaitCard("Reprocesos",v225Time(w.rework),"Tiempo originado por correcciones, rechazos o retrabajos.",w.rework?"warn":"ok",scope)+
    v227WaitCard("Devoluciones",v225Time(w.devolution),"Tiempo asociado a devoluciones, retornos o regresos de proceso.",w.devolution?"warn":"ok",scope);

  var components=[
    {label:"Espera de procesos",value:w.processWait,cls:"info"},
    {label:"Requerimientos",value:w.requirement,cls:"warn"},
    {label:"Novedades",value:w.novelty,cls:"warn"},
    {label:"Reprocesos",value:w.rework,cls:"bad"},
    {label:"Devoluciones",value:w.devolution,cls:"bad"}
  ];
  $("waitComposition").innerHTML=
    '<article class="chart-card"><h3>Composición del tiempo de espera · '+esc(scope)+'</h3>'+
      v225ChartRows(components,function(r){return r.value;},function(r){return r.label;},function(r){return v225Time(r.value);},function(r){return r.cls;})+
    '</article>'+
    '<article class="chart-card"><h3>Principales esperas trazadas</h3><div class="wait-detail-list">'+
      (w.details.slice(0,12).map(function(x){
        return '<div class="wait-detail-row"><div><strong>'+esc(x.pedido)+'</strong><small>'+esc(v225AreaLabel(x.area))+(x.process?' · '+esc(processTitle(x.process)):'')+'</small></div><div><strong>'+esc(x.type)+'</strong><small>'+esc(x.detail)+'</small></div><span class="badge '+(x.open?'bad':'warn')+'">'+v225Time(x.duration)+'</span></div>';
      }).join("")||'<p class="muted">No se encontraron esperas trazadas con los filtros actuales.</p>')+
    '</div></article>';
}
function renderSummaryV228Base(){
  renderSummaryV227Base();
  var m=app.metrics;if(!m||!m.waiting)return;
  var w=m.waiting;
  var cards=$("summary").innerHTML;
  cards=cards.replace(/<article class="card kpi [^"]*"><span>Tiempo de espera acumulado<\/span>[\s\S]*?<\/article>/,
    v225Kpi("Tiempo de espera acumulado",v225Time(w.average),"Promedio por pedido: procesos, requerimientos, novedades, reprocesos y devoluciones",w.total?"warn":"ok",w.scope.label)
  );
  $("summary").innerHTML=cards;
  renderWaitBoard();
}
function renderPowerChartsV228Base(){
  renderPowerChartsV227Base();
  var m=app.metrics;if(!m||!m.waiting)return;
  var w=m.waiting;
  $("quickBars").innerHTML='<article class="chart-card"><h3>Composición del Lead Time · '+esc(w.scope.label)+'</h3>'+v227LeadStack(m,w)+'</article>';
}
function v227LeadStack(m,w){
  var total=Math.max(1,m.leadTotal||0);
  var work=v225Pct(m.va,total),waiting=v225Pct(w.total,total);
  var other=Math.max(0,100-work-waiting);
  return '<div class="stack"><i class="va" style="width:'+work+'%"></i><i class="wait" style="width:'+waiting+'%"></i><i style="width:'+other+'%;background:#2563eb"></i></div>'+
    '<div class="legend"><span><i class="dot va"></i>Trabajo directo '+work+'%</span><span><i class="dot wait"></i>Espera acumulada '+waiting+'%</span><span><i class="dot" style="background:#2563eb"></i>Transferencia y ejecución contextual '+other+'%</span></div>';
}
function renderTableV228Base(){
  renderTableV227Base();
  var m=app.metrics;if(!m||!m.waiting)return;
  if($("fView").value==="confiabilidad"){
    $("rowCount").textContent=$("rowCount").textContent+" · espera acumulada "+v225Time(m.waiting.total)+" · "+m.waiting.scope.label;
  }
}
function bindV228Base(){
  bindV227Base();
  ["fArea","fProcess"].forEach(function(id){
    $(id).addEventListener("change",function(){
      setTimeout(function(){
        if(app.metrics&&app.metrics.waiting){
          renderWaitBoard();
          v225FilterSummary();
        }
      },0);
    });
  });
}


/* ============================================================
   V228 · TIEMPOS VERIFICADOS POR ETIQUETAS FIREBASE
============================================================ */
var V228_AREA_SLA={ventas:4,compras:16,logistica:4,facturacion:2,caja:4,cartera:4,despacho:8};

function v229NormalizeRole(value){
  return normKey(value||"");
}
function v228Scope(){
  var area=$("fArea")&&$("fArea").value||"";
  var process=$("fProcess")&&$("fProcess").value||"";
  var label=area?v225AreaLabel(area):"Todas las áreas";
  if(process)label+=(area?" · ":"")+processTitle(process);
  return {area:area,process:process,label:label};
}
function v228NoDeliveryText(text){
  return /no[_\s-]?entrega|no[_\s-]?entregado|pedido no entregado|no recibió|devolucion_caja|refund_to_box/i.test(String(text||""));
}
function v228ReworkText(text){
  return /reproceso|retrabajo|correcci[oó]n|corregir|diferencia|no conforme|rechazad|devuelt[oa]|regres[oa]|retorno|reabrir|ajuste requerido/i.test(String(text||""));
}
function v228ClosedText(text){
  return /cerrad|resuelt|solucionad|complet|finaliz|entrega confirmada/i.test(String(text||""));
}
function v228AreaFromRoleOrProcess(role,process,text){
  role=v229NormalizeRole(role||"");
  if(process&&v225AreaForProcess(process))return v225AreaForProcess(process);
  if(role==="ventas"||role==="asesor_ventas")return "ventas";
  if(role==="compras"||role==="proyectos")return "compras";
  if(role==="facturacion")return "facturacion";
  if(role==="caja")return "caja";
  if(role==="cartera")return "cartera";
  if(/despacho|transportadora|entrega/.test(lower(text||"")))return "despacho";
  if(/recepcion|alistamiento|picking|corte|logistica/.test(lower(text||"")))return "logistica";
  return "";
}
function v228RecordInScope(x){
  var s=v228Scope();
  if(s.area&&x.area&&s.area!==x.area)return false;
  if(s.process&&x.process&&s.process!==x.process)return false;
  return true;
}
function v228ReqStart(r){
  return tms(r.sentAt)||tms(r.createdAt)||tms(r.openedAt)||tms(r.requestedAt);
}
function v228ReqEnd(r,open){
  var end=tms(r.answeredAt)||tms(r.resolvedAt)||tms(r.closedAt)||tms(r.completedAt)||tms(r.respondedAt);
  if(!isFinite(end)&&v228ClosedText(r.status))end=tms(r.updatedAt);
  if(!isFinite(end)&&open)end=nowMs();
  return end;
}
function v228RequirementList(c){
  var out=[],seen={};
  function add(r,source,forceOpen){
    if(!r)return;
    var start=v228ReqStart(r)||tms(c.waitStartedAt);
    var key=String(r.id||[start,r.reason,r.targetRole,r.source,r.returnProcess].join("|"));
    if(seen[key])return;
    seen[key]=1;
    var status=lower(r.status||"");
    var open=forceOpen===true||(!v228ClosedText(status)&&!tms(r.answeredAt)&&!tms(r.resolvedAt)&&!tms(r.closedAt));
    var end=v228ReqEnd(r,open);
    if(!isFinite(start)||!isFinite(end)||end<start)return;
    out.push({r:r,source:source,start:start,end:end,open:open});
  }
  (c.requirements||[]).forEach(function(r){add(r,"cases.requirements",false);});
  add(c.openRequirement,"cases.openRequirement",true);
  return out;
}
function v228RequirementClass(c,item){
  var r=item.r;
  var text=[r.source,r.type,r.category,r.reason,r.detail,r.description,r.status,r.targetRole,r.sourceProcess,r.returnProcess,c.requirementType].join(" ");
  if(v228NoDeliveryText(text)||r.source==="no_entrega"||c.requirementType==="no_entrega")return "no_delivery";
  var target=v229NormalizeRole(r.targetRole||"");
  var explicitReturn=!!(r.returnProcess||r.sourceProcess);
  if(target==="ventas"||v228ReworkText(text)||(explicitReturn&&target&&target!==v229NormalizeRole(r.sourceRole||"")))return "rework";
  return "novelty";
}
function v228SlaHours(area,process){
  if(process&&typeof v222SlaHoursForProcess==="function")return v222SlaHoursForProcess(process);
  return V228_AREA_SLA[area]||4;
}
function v228NoveltyRecords(c,m){
  var rows=[];
  reportMetricsForCase(c).forEach(function(metric){
    var r=metric.report||{};
    var text=[r.title,r.category,r.sourceModule,r.description,r.detail,r.status].join(" ");
    if(v228NoDeliveryText(text))return;
    var area=v228AreaFromRoleOrProcess(r.targetRole||r.assignedRole,r.sourceProcess||r.process,text)||v225AreaForProcess(c.currentProcess)||"logistica";
    var process=r.sourceProcess||r.process||c.currentProcess||"";
    var duration=Number(metric.responseMs||0);
    if(duration<=0)return;
    var row={
      category:"Novedad",pedido:refOf(c),area:area,process:process,duration:duration,
      start:metric.created,end:metric.firstResponse||nowMs(),open:!!metric.pending,
      detail:r.title||r.category||"Novedad registrada",
      source:"reportes_novedad.createdAt → primera respuesta"
    };
    if(v228RecordInScope(row))rows.push(row);
  });
  v228RequirementList(c).forEach(function(item){
    if(v228RequirementClass(c,item)!=="novelty")return;
    var r=item.r,text=[r.reason,r.detail,r.targetRole,r.sourceProcess].join(" ");
    var area=v228AreaFromRoleOrProcess(r.targetRole,r.sourceProcess,text)||v225AreaForProcess(c.currentProcess)||"logistica";
    var process=r.sourceProcess||r.returnProcess||c.currentProcess||"";
    var row={
      category:"Novedad",pedido:refOf(c),area:area,process:process,
      duration:workingMsBetween(item.start,item.end),start:item.start,end:item.end,open:item.open,
      detail:r.reason||r.detail||"Requerimiento operativo",
      source:item.source+" · sentAt → answeredAt/resolvedAt"
    };
    if(row.duration>0&&v228RecordInScope(row))rows.push(row);
  });
  return rows;
}
function v228ReworkRecords(c){
  var rows=[],reqStarts=[];
  v228RequirementList(c).forEach(function(item){
    if(v228RequirementClass(c,item)!=="rework")return;
    var r=item.r,text=[r.reason,r.detail,r.targetRole,r.sourceProcess,r.returnProcess].join(" ");
    var process=r.returnProcess||r.sourceProcess||c.currentProcess||"";
    var area=v228AreaFromRoleOrProcess(r.targetRole,process,text)||v225AreaForProcess(process)||"logistica";
    var elapsed=workingMsBetween(item.start,item.end);
    var sla=v228SlaHours(area,process);
    var excess=Math.max(0,elapsed-(sla*3600000));
    reqStarts.push(item.start);
    if(excess<=0)return;
    var row={
      category:"Reproceso",pedido:refOf(c),area:area,process:process,duration:excess,
      elapsed:elapsed,slaHours:sla,start:item.start,end:item.end,open:item.open,
      detail:r.reason||r.detail||"Pedido devuelto para corrección",
      source:item.source+" · exceso sobre meta de "+sla+" h"
    };
    if(v228RecordInScope(row))rows.push(row);
  });
  var events=allTraceEvents(c);
  for(var i=0;i<events.length;i++){
    var e=events[i],raw=e.raw||{};
    var text=[raw.type,raw.traceType,raw.detail,raw.reason,e.detail,raw.toProcess,raw.returnProcess].join(" ");
    if(v228NoDeliveryText(text)||!v228ReworkText(text))continue;
    if(reqStarts.some(function(s){return Math.abs(s-e.ms)<300000;}))continue;
    var process=raw.toProcess||raw.returnProcess||e.process||c.currentProcess||"";
    var area=v228AreaFromRoleOrProcess(raw.targetRole||e.role,process,text)||v225AreaForProcess(process)||"logistica";
    var end=NaN;
    for(var j=i+1;j<events.length;j++){
      var next=events[j];
      var nextText=[next.raw&&next.raw.type,next.detail,next.process].join(" ");
      if(next.ms>e.ms&&(next.process!==process||/transfer|liber|finaliz|cierre|resuelt/i.test(nextText))){end=next.ms;break;}
    }
    if(!isFinite(end))end=tms(c.closedAt)||tms(c.updatedAt)||nowMs();
    if(end<e.ms)continue;
    var elapsed=workingMsBetween(e.ms,end),sla=v228SlaHours(area,process);
    var excess=Math.max(0,elapsed-(sla*3600000));
    if(excess<=0)continue;
    var row={
      category:"Reproceso",pedido:refOf(c),area:area,process:process,duration:excess,
      elapsed:elapsed,slaHours:sla,start:e.ms,end:end,open:!isClosed(c),
      detail:e.detail||"Retorno a una etapa anterior",
      source:"case_events/stateHistory/flowTrace · exceso sobre meta de "+sla+" h"
    };
    if(v228RecordInScope(row))rows.push(row);
  }
  return rows;
}
function v228NoDeliveryCase(c){
  if(c.noDelivery===true||clean(c.noDeliveryStatus)||clean(c.requirementType)==="no_entrega")return true;
  if((c.noDeliveryReports||[]).length)return true;
  if((c.requirements||[]).some(function(r){return r.source==="no_entrega"||v228NoDeliveryText(JSON.stringify(r));}))return true;
  return caseEvents(c).some(function(e){return /^NO_DELIVERY_/.test(String(e.type||""));});
}
function v228NoDeliveryEnd(c,start,report){
  var candidates=[];
  [report&&report.closedAt,report&&report.resolvedAt,report&&report.completedAt].forEach(function(v){var x=tms(v);if(isFinite(x)&&x>=start)candidates.push(x);});
  var status=lower((report&&report.status)||c.noDeliveryStatus||c.status||"");
  (report&&report.history||[]).forEach(function(h){
    if(v228ClosedText([h.action,h.status,h.detail].join(" "))){var x=tms(h.at||h.timestamp||h.createdAt);if(isFinite(x)&&x>=start)candidates.push(x);}
  });
  (c.requirements||[]).filter(function(r){return r.source==="no_entrega"||v228NoDeliveryText(JSON.stringify(r));}).forEach(function(r){
    [r.answeredAt,r.resolvedAt,r.closedAt].forEach(function(v){var x=tms(v);if(isFinite(x)&&x>=start)candidates.push(x);});
  });
  caseEvents(c).forEach(function(e){
    if(e.type==="NO_DELIVERY_CLOSED"){var x=tms(e.timestamp||e.createdAt);if(isFinite(x)&&x>=start)candidates.push(x);}
  });
  if(v228ClosedText(status)){var x=tms(c.closedAt)||tms(c.updatedAt);if(isFinite(x)&&x>=start)candidates.push(x);}
  return candidates.length?Math.min.apply(Math,candidates):nowMs();
}
function v228NoDeliveryRecords(c){
  if(!v228NoDeliveryCase(c))return [];
  var rows=[],reports=c.noDeliveryReports||[];
  if(!reports.length)reports=[null];
  reports.forEach(function(rep){
    var starts=[];
    var first=tms(rep&&rep.createdAt);if(isFinite(first))starts.push(first);
    (c.requirements||[]).filter(function(r){return r.source==="no_entrega"||v228NoDeliveryText(JSON.stringify(r));}).forEach(function(r){
      var x=v228ReqStart(r);if(isFinite(x))starts.push(x);
    });
    caseEvents(c).forEach(function(e){
      if(e.type==="NO_DELIVERY_REQUIREMENT"){var x=tms(e.timestamp||e.createdAt);if(isFinite(x))starts.push(x);}
    });
    if(!starts.length){var x=tms(c.updatedAt)||tms(c.createdAt);if(isFinite(x))starts.push(x);}
    if(!starts.length)return;
    var start=Math.min.apply(Math,starts),end=v228NoDeliveryEnd(c,start,rep);
    var process=(rep&&rep.targetProcess)||c.currentProcess||"despacho_nacional";
    var area=(process==="cartera")?"cartera":((c.noDeliveryStatus==="DEVOLUCION_CAJA"||process==="caja")?"caja":"despacho");
    var row={
      category:"No entrega",pedido:refOf(c),area:area,process:process,
      duration:workingMsBetween(start,end),start:start,end:end,
      open:!v228ClosedText((rep&&rep.status)||c.noDeliveryStatus||c.status||""),
      detail:(rep&&rep.detail)||"Pedido confirmado como no entregado",
      source:(rep?"cases.noDeliveryReports":"noDelivery/requirementType=no_entrega")+" · inicio → NO_DELIVERY_CLOSED/solución"
    };
    if(row.duration>0&&v228RecordInScope(row))rows.push(row);
  });
  return rows;
}
function v228BuildSpecialWait(m){
  var novelty=[],rework=[],noDelivery=[];
  (m.caseRows||[]).forEach(function(cm){
    novelty=novelty.concat(v228NoveltyRecords(cm.c,m));
    rework=rework.concat(v228ReworkRecords(cm.c));
    noDelivery=noDelivery.concat(v228NoDeliveryRecords(cm.c));
  });
  function sum(rows){return rows.reduce(function(s,x){return s+(x.duration||0);},0);}
  var all=novelty.concat(rework,noDelivery).sort(function(a,b){return b.duration-a.duration;});
  return {
    scope:v228Scope(),noveltyRows:novelty,reworkRows:rework,noDeliveryRows:noDelivery,all:all,
    novelty:sum(novelty),rework:sum(rework),noDelivery:sum(noDelivery),
    noveltyAverage:m.cases?sum(novelty)/m.cases:0,
    reworkAverage:m.cases?sum(rework)/m.cases:0,
    noDeliveryAverage:m.cases?sum(noDelivery)/m.cases:0,
    noveltyOpen:novelty.filter(function(x){return x.open;}).length,
    reworkOpen:rework.filter(function(x){return x.open;}).length,
    noDeliveryOpen:noDelivery.filter(function(x){return x.open;}).length
  };
}
function v228NoDeliveryAreaCount(m,area){
  var seen={};
  (m.specialWait.noDeliveryRows||[]).forEach(function(x){if(!area||x.area===area)seen[x.pedido]=1;});
  return Object.keys(seen).length;
}
async function compute(cases,cancelledCases){
  await computeV228Base(cases,cancelledCases);
  var m=app.metrics;if(!m)return;
  m.specialWait=v228BuildSpecialWait(m);
  m.noDeliveryCount=v228NoDeliveryAreaCount(m,"");
  (m.areaRows||[]).forEach(function(r){r.noDeliveries=v228NoDeliveryAreaCount(m,r.area);});
}
function v228WaitCard(title,value,detail,kind,scope,source){
  return '<article class="wait-card '+(kind||'')+'"><span>'+esc(title)+'</span><strong>'+esc(value)+'</strong><small>'+esc(detail)+'</small><em class="wait-scope">'+esc(scope)+'</em><b class="wait-source">Fuente: '+esc(source)+'</b></article>';
}
function renderWaitBoard(){
  var m=app.metrics;if(!m||!m.specialWait)return;
  var w=m.specialWait,scope=w.scope.label;
  $("waitSectionTitle").textContent="Tiempos especiales de espera · "+scope;
  $("waitSectionSubtitle").textContent="Tres cálculos separados y excluyentes; cada uno usa etiquetas específicas de Firebase.";
  $("waitBoard").innerHTML=
    v228WaitCard("Espera en novedades",v225Time(w.novelty),"Creación hasta primera respuesta o resolución. "+w.noveltyOpen+" registro(s) abierto(s).",w.noveltyOpen?"warn":"ok",scope,"reportes_novedad.createdAt y cases.requirements.sentAt")+
    v228WaitCard("Espera en reproceso",v225Time(w.rework),"Solo el exceso sobre la meta cuando el pedido regresa a Ventas u otra etapa.",w.reworkOpen?"bad":(w.rework?"warn":"ok"),scope,"requirements.returnProcess/targetRole y eventos de retorno")+
    v228WaitCard("Espera en no entregas",v225Time(w.noDelivery),"Desde la confirmación de no entrega hasta solución o cierre. "+w.noDeliveryOpen+" caso(s) abierto(s).",w.noDeliveryOpen?"bad":(w.noDelivery?"warn":"ok"),scope,"noDeliveryReports, noDeliveryStatus, requirementType=no_entrega y NO_DELIVERY_*");

  var components=[
    {label:"Novedades",value:w.novelty,cls:"warn"},
    {label:"Reproceso fuera de meta",value:w.rework,cls:"bad"},
    {label:"No entregas",value:w.noDelivery,cls:"info"}
  ];
  $("waitComposition").innerHTML=
    '<article class="chart-card"><h3>Comparación de tiempos · '+esc(scope)+'</h3>'+
      v225ChartRows(components,function(r){return r.value;},function(r){return r.label;},function(r){return v225Time(r.value);},function(r){return r.cls;})+
      '<p class="metric-note">Los grupos son excluyentes: una no entrega no se vuelve a contabilizar como novedad o reproceso.</p></article>'+
    '<article class="chart-card"><h3>Origen de los tiempos calculados</h3><div class="wait-detail-list">'+
      (w.all.slice(0,15).map(function(x){
        return '<div class="wait-detail-row"><div><strong>'+esc(x.pedido)+'</strong><small>'+esc(v225AreaLabel(x.area))+(x.process?' · '+esc(processTitle(x.process)):'')+'</small></div><div><strong>'+esc(x.category)+'</strong><small>'+esc(x.detail)+'</small><small>'+esc(x.source)+'</small></div><span class="badge '+(x.open?'bad':'warn')+'">'+v225Time(x.duration)+'</span></div>';
      }).join("")||'<p class="muted">No existen registros trazables para los filtros seleccionados.</p>')+
    '</div></article>';
}
function renderSummary(){
  var m=app.metrics;if(!m)return;var w=m.specialWait;
  $("summary").innerHTML=
    v225Kpi("Total de pedidos",String(m.totalLoaded),"Base completa cargada desde Firestore","ok","Filtrados "+m.filteredTotal)+
    v225Kpi("WIP actual",String(m.wip),m.lateWip+" fuera de meta",m.lateWip?"bad":"ok","Pedidos abiertos")+
    v225Kpi("Cerrados",String(m.closed),"Throughput "+m.throughput+" por día","ok","Filtro actual")+
    v225Kpi("Lead Time P50",v225Time(m.leadP50),"Mediana en horas laborales","","P90 "+v225Time(m.leadP90))+
    v225Kpi("Picking promedio",v225Time(m.pickingAvg),m.pickingRows.length+" pedidos con alistamiento",m.pickingLate?"warn":"ok","P90 "+v225Time(m.pickingP90))+
    v225Kpi("Corte físico",v225Time(m.physicalCutAvg),m.physicalCuts+" cortes físicos","","P90 "+v225Time(m.physicalCutP90))+
    v225Kpi("Trabajo directo promedio",v225Time(m.vaAvg),"Actividad registrada por pedido","ok",m.eff+"% del LT")+
    v225Kpi("Bloqueo operativo",v225Time(m.waitAvg),"Esperas de proceso registradas; no equivale a improductividad",m.waitPct>30?"warn":"ok",m.waitPct+"% del LT")+
    v225Kpi("Espera en novedades",v225Time(w.noveltyAverage),"Promedio hasta primera respuesta o resolución",w.noveltyOpen?"warn":"ok",w.scope.label)+
    v225Kpi("Espera en reproceso",v225Time(w.reworkAverage),"Promedio del exceso sobre la meta",w.rework?"warn":"ok",w.scope.label)+
    v225Kpi("Espera en no entregas",v225Time(w.noDeliveryAverage),"Promedio desde no entrega hasta solución",w.noDeliveryOpen?"bad":"ok",w.scope.label)+
    v225Kpi("No entregas",String(m.noDeliveryCount),"Identificadas con etiquetas reales del flujo",m.noDeliveryCount?"warn":"ok","Filtro actual")+
    v225Kpi("Confiabilidad del proceso",m.reliability.avg+"%","Calidad de fechas, estados, responsables y procesos",m.reliability.avg>=90?"ok":(m.reliability.avg>=70?"warn":"bad"),m.reliability.low+" casos críticos")+
    v225Kpi("Cumplimiento documental",m.reliability.responsiblePct+"%","Pedidos con responsable identificado",m.reliability.responsiblePct>=90?"ok":"warn","Proceso "+m.reliability.processPct+"%");

  $("operationalFocus").innerHTML=
    v222Focus("alistamiento","Picking / alistamiento",v225Time(m.pickingAvg))+
    v222Focus("corte_cable","Corte de cable",v225Time(((m.processRows||[]).filter(function(x){return x.process==="corte_cable";})[0]||{}).avg||0))+
    v222Focus("recepcion_pedidos","Recepción de pedidos")+
    v222Focus("facturacion","Facturación");

  var bottle=m.bottleneck||{};
  $("bottleneck").innerHTML=bottle.label?'<strong>'+esc(bottle.label)+'</strong><p class="muted">Promedio '+v225Time(bottle.avg||0)+' · WIP '+Number(bottle.wip||0)+' · espera '+Number(bottle.waitPct||0)+'%.</p>':'<span class="muted">Sin datos suficientes.</span>';

  $("ltProductivityAnalysis").innerHTML='<div class="filter-summary"><strong>Interpretación:</strong> el Super Admin está excluido de tiempos, productividad, intervenciones y respuestas. Novedades, reprocesos y no entregas se calculan con etiquetas distintas. El reproceso solo cuenta el exceso sobre la meta; una no entrega no se duplica.</div>';
  $("deepKpis").innerHTML=
    v225Kpi("Eficiencia de flujo",m.eff+"%","Trabajo directo / Lead Time observado",m.eff>=55?"ok":(m.eff>=35?"warn":"bad"),"No es productividad individual")+
    v225Kpi("Calidad de trazabilidad",m.dataQualityPct+"%",m.incomplete+" pedido(s) con datos incompletos",m.incomplete?"warn":"ok","Base "+m.cases)+
    v225Kpi("Novedades pendientes",m.reportPending+"",m.reportCount+" novedades analizadas",m.reportPending?"warn":"ok")+
    v225Kpi("Cortes registrados",m.doneCuts+" / "+m.totalCuts,"Finalizados, medida completa o no necesita corte",m.totalCuts&&m.doneCuts<m.totalCuts?"warn":"ok");

  v225FilterSummary();renderCoverage();renderWaitBoard();renderAreaBoard();renderProcessFlow();renderActorBoard();renderPowerCharts();renderReliability();renderAlerts();renderFlowHealth();
}
function renderReliability(){
  var m=app.metrics;if(!m)return;var r=m.reliability;
  $("reliabilityBoard").innerHTML=
    '<article class="reliability-card"><h3>Confiabilidad general</h3><strong>'+r.avg+'%</strong><small>Calidad promedio de fechas, estados, responsables y proceso.</small></article>'+
    '<article class="reliability-card"><h3>Registros confiables</h3><strong>'+r.high+'</strong><small>Casos con confiabilidad igual o superior al 90%.</small></article>'+
    '<article class="reliability-card"><h3>Registros por revisar</h3><strong>'+r.medium+'</strong><small>Casos entre 70% y 89%.</small></article>'+
    '<article class="reliability-card"><h3>Registros críticos</h3><strong>'+r.low+'</strong><small>Casos por debajo de 70%.</small></article>'+
    '<article class="reliability-card"><h3>No entregas</h3><strong>'+m.noDeliveryCount+'</strong><small>Identificadas con noDelivery, noDeliveryReports, requirementType=no_entrega o eventos NO_DELIVERY_*.</small></article>'+
    '<article class="reliability-card"><h3>Responsable identificado</h3><strong>'+r.responsiblePct+'%</strong><small>Pedidos con actor o rol responsable registrado.</small></article>';
}
function renderAreaBoard(){
  var m=app.metrics;if(!m)return;
  $("areaBoard").innerHTML=(m.areaRows||[]).map(function(r){
    var status=v225Status(r.compliance,85,65);
    return '<article class="process-card '+(status.cls==="bad"?'late':'')+'"><div class="process-title"><h3>'+esc(r.label)+'</h3><span class="status-chip '+status.cls+'">'+status.label+'</span></div><div class="process-main"><div><span>LT promedio</span><strong>'+v225Time(r.avg)+'</strong></div><div><span>Cumplimiento</span><strong>'+r.compliance+'%</strong></div></div><div class="process-stats"><div><span>Trabajo</span><b>'+v225Time(r.work)+'</b></div><div><span>Bloqueo</span><b>'+v225Time(r.block)+'</b></div><div><span>WIP</span><b>'+r.wip+'</b></div></div><div class="progress"><i style="width:'+Math.max(0,Math.min(100,r.compliance))+'%"></i></div><small class="metric-note">Casos '+r.cases+' · cerrados '+r.closed+' · actores '+r.workers+' · confiabilidad '+r.reliability+'% · no entregas '+Number(r.noDeliveries||0)+'</small></article>';
  }).join("")||'<p class="muted">Sin datos suficientes por área.</p>';
}
function renderPowerCharts(){
  var m=app.metrics;if(!m)return;var proc=(m.processRows||[]).filter(function(r){return r.cases||r.wip;});
  $("powerCharts").innerHTML=
    '<article class="chart-card"><h3>LT promedio por proceso</h3>'+v225ChartRows(proc,function(r){return r.avg;},function(r){return r.label;},function(r){return v225Time(r.avg);})+'</article>'+
    '<article class="chart-card"><h3>Cumplimiento por proceso</h3>'+v225ChartRows(proc,function(r){return r.slaPct;},function(r){return r.label;},function(r){return r.slaPct+"%";},function(r){return r.slaPct>=85?"ok":(r.slaPct>=65?"warn":"bad");})+'</article>'+
    '<article class="chart-card"><h3>WIP por proceso</h3>'+v225ChartRows(proc.slice().sort(function(a,b){return b.wip-a.wip;}),function(r){return r.wip;},function(r){return r.label;},function(r){return r.wip+" · "+r.wipLate+" atras.";},function(r){return r.wipLate?"bad":"ok";})+'</article>'+
    '<article class="chart-card"><h3>Confiabilidad por área</h3>'+v225ChartRows(m.areaRows,function(r){return r.reliability;},function(r){return r.label;},function(r){return r.reliability+"%";},function(r){return r.reliability>=90?"ok":(r.reliability>=70?"warn":"bad");})+'</article>'+
    '<article class="chart-card"><h3>Trabajo directo por actor</h3>'+v225ChartRows((m.actorRows||[]).slice(0,12),function(r){return r.active;},function(r){return r.user;},function(r){return v225Time(r.active)+" · "+r.count+" casos";},function(){return "ok";})+'</article>'+
    '<article class="chart-card"><h3>No entregas por área</h3>'+v225ChartRows(m.areaRows,function(r){return Number(r.noDeliveries||0);},function(r){return r.label;},function(r){return Number(r.noDeliveries||0)+" pedido(s)";},function(r){return r.noDeliveries?"warn":"ok";})+'</article>';

  var w=m.specialWait,total=Math.max(1,m.leadTotal||0),work=v225Pct(m.va,total),block=v225Pct(m.wait,total);
  var special=v225Pct(w.novelty+w.rework+w.noDelivery,total),rest=Math.max(0,100-work-block-special);
  $("quickBars").innerHTML='<article class="chart-card"><h3>Composición del Lead Time · '+esc(w.scope.label)+'</h3><div class="stack"><i class="va" style="width:'+work+'%"></i><i class="wait" style="width:'+block+'%"></i><i style="width:'+special+'%;background:#7c3aed"></i><i style="width:'+rest+'%;background:#2563eb"></i></div><div class="legend"><span><i class="dot va"></i>Trabajo directo '+work+'%</span><span><i class="dot wait"></i>Bloqueo operativo '+block+'%</span><span><i class="dot" style="background:#7c3aed"></i>Esperas especiales '+special+'%</span><span><i class="dot" style="background:#2563eb"></i>Transferencia/ejecución contextual '+rest+'%</span></div><p class="metric-note">Las esperas especiales son diagnósticas y excluyentes.</p></article>';
}
function renderTableV230Base(){
  var m=app.metrics;if(!m)return;var view=$("fView").value;
  if(view==="areas"){
    $("tableTitle").textContent="Resumen por área";$("rowCount").textContent=m.areaRows.length+" área(s) · total cargado "+m.totalLoaded;
    $("mainTable").innerHTML=v225Table(["Área","Casos","WIP","Cerrados","LT promedio","Trabajo directo","Bloqueo","Cumplimiento","Confiabilidad","No entregas","Actores"],m.areaRows.map(function(r){return '<tr><td><strong>'+esc(r.label)+'</strong></td><td>'+r.cases+'</td><td>'+r.wip+'</td><td>'+r.closed+'</td><td>'+v225Time(r.avg)+'</td><td>'+v225Time(r.work)+'</td><td>'+v225Time(r.block)+'</td><td>'+r.compliance+'%</td><td>'+r.reliability+'%</td><td>'+Number(r.noDeliveries||0)+'</td><td>'+r.workers+'</td></tr>';}));return;
  }
  if(view==="confiabilidad"){
    $("tableTitle").textContent="Confiabilidad del proceso";
    var rows=(m.caseRows||[]).map(function(cm){var r=v225ReliabilityForCase(cm);return {cm:cm,r:r};}).sort(function(a,b){return a.r.score-b.r.score;});
    $("rowCount").textContent=rows.length+" pedido(s) · total cargado "+m.totalLoaded;
    $("mainTable").innerHTML=v225Table(["Pedido","Cliente","Proceso","Estado","Responsable","Confiabilidad","No entrega","Hallazgos"],rows.map(function(x){var c=x.cm.c,noDelivery=v228NoDeliveryCase(c);var issues=(x.r.issues||[]).filter(function(i){return i!=="reproceso/devolución";});return '<tr><td><strong>'+esc(refOf(c))+'</strong></td><td>'+esc(c.client||"")+'</td><td>'+esc(processTitle(c.currentProcess))+'</td><td>'+esc(c.status||"")+'</td><td>'+esc(c.assignedName||advisor(c)||"Sin responsable")+'</td><td>'+x.r.score+'%</td><td>'+(noDelivery?'<span class="badge warn">Sí</span>':'<span class="badge ok">No</span>')+'</td><td>'+esc(issues.join(", ")||"Sin hallazgos")+'</td></tr>';}));return;
  }
  if(view==="esperas"){
    var rows=m.specialWait.all||[];
    $("tableTitle").textContent="Trazabilidad de tiempos de espera · "+m.specialWait.scope.label;$("rowCount").textContent=rows.length+" registro(s) · total cargado "+m.totalLoaded;
    $("mainTable").innerHTML=v225Table(["Pedido","Categoría","Área","Proceso","Inicio","Fin/corte","Duración calculada","Abierto","Origen del cálculo","Detalle"],rows.map(function(x){return '<tr><td><strong>'+esc(x.pedido)+'</strong></td><td>'+esc(x.category)+'</td><td>'+esc(v225AreaLabel(x.area))+'</td><td>'+esc(processTitle(x.process))+'</td><td>'+esc(dateTxt(x.start))+'</td><td>'+esc(dateTxt(x.end))+'</td><td><strong>'+v225Time(x.duration)+'</strong></td><td>'+(x.open?'<span class="badge bad">Sí</span>':'<span class="badge ok">No</span>')+'</td><td>'+esc(x.source)+'</td><td>'+esc(x.detail)+'</td></tr>';}));return;
  }
  renderTableV228Base();$("rowCount").textContent=$("rowCount").textContent+" · total cargado "+m.totalLoaded;
}
function bindV232Base(){bindV228Base();}


/* ============================================================
   V230 · LEAD TIME REAL DE VENTAS
   Ventas se calcula por intervenciones, no por processStats vacío.
============================================================ */
function v230RoleIsSales(value){
  var k=v229NormalizeRole(value||"");
  return k==="ventas"||k==="asesor"||k==="asesor_ventas"||k==="vendedor";
}
function v230ArrayHasSales(value){
  if(!Array.isArray(value))return false;
  return value.some(function(x){return v230RoleIsSales(x);});
}
function v230ObjectTargetsSales(o){
  if(!o)return false;
  if(v230RoleIsSales(o.targetRole)||v230RoleIsSales(o.assignedRole)||v230RoleIsSales(o.role))return true;
  if(v230ArrayHasSales(o.targetRoles)||v230ArrayHasSales(o.visibleRoles))return true;
  var txt=lower([
    o.targetRole,o.assignedRole,o.sourceRole,o.returnRole,o.title,o.category,
    o.detail,o.description,o.reason,o.type,o.status,o.sourceModule
  ].join(" "));
  return /(^|\s|_|-)ventas?(\s|_|-|$)|asesor(?: de)? ventas|vendedor/.test(txt);
}
function v230EpisodeKey(x){
  return [x.type,x.start,x.end,x.source].join("|");
}
function v230InitialSalesEpisode(cm){
  var c=cm.c,start=cm.start;
  if(!isFinite(start))return null;
  var nextStarts=(cm.pRows||[]).map(function(p){return p.start;})
    .filter(function(x){return isFinite(x)&&x>=start;})
    .sort(function(a,b){return a-b;});
  var end=nextStarts.length?nextStarts[0]:NaN;
  if(!isFinite(end)||end<=start){
    var salesRegistered=tms((c.documentFlow||{}).salesRegisteredAt);
    var updated=v231OperationalUpdatedAt(c);
    if(isFinite(salesRegistered)&&salesRegistered>start)end=salesRegistered;
    else if(isFinite(updated)&&updated>start&&c.currentProcess!=="ventas")end=updated;
  }
  if(!isFinite(end)||end<=start)return null;
  return {
    type:"Registro inicial",
    start:start,end:end,open:false,
    source:"cases.createdAt → primera entrada a un proceso operativo",
    detail:"Registro y liberación inicial del pedido por Ventas"
  };
}
function v230SalesRequirementEpisodes(c){
  return v228RequirementList(c).filter(function(item){
    var r=item.r||{};
    return v230ObjectTargetsSales(r)
      || v230RoleIsSales(r.targetRole)
      || v230RoleIsSales(r.returnRole)
      || /ventas|asesor|vendedor/.test(lower([r.reason,r.detail,r.description].join(" ")));
  }).map(function(item){
    var r=item.r||{};
    return {
      type:v228RequirementClass(c,item)==="rework"?"Retorno a Ventas":"Requerimiento a Ventas",
      start:item.start,end:item.end,open:item.open,
      source:item.source+" · sentAt/createdAt → answeredAt/resolvedAt",
      detail:r.reason||r.detail||r.description||"Intervención solicitada a Ventas"
    };
  });
}
function v230SalesReportEpisodes(c){
  return reportMetricsForCase(c).filter(function(metric){
    var r=metric.report||{};
    return v230ObjectTargetsSales(r)
      || v230RoleIsSales(r.targetRole)
      || v230ArrayHasSales(r.targetRoles)
      || /ventas|asesor|vendedor/.test(lower([r.title,r.category,r.detail,r.description].join(" ")));
  }).map(function(metric){
    var r=metric.report||{};
    return {
      type:"Novedad a Ventas",
      start:metric.created,
      end:metric.firstResponse||nowMs(),
      open:!!metric.pending,
      source:"reportes_novedad.createdAt → primera respuesta",
      detail:r.title||r.category||r.description||"Novedad dirigida a Ventas"
    };
  }).filter(function(x){return isFinite(x.start)&&isFinite(x.end)&&x.end>=x.start;});
}
function v230SalesEventEpisodes(c,existing){
  var events=caseEvents(c).filter(function(e){return !v231IsExcludedSuperAdmin(e);}).slice().sort(function(a,b){
    return (tms(a.timestamp||a.createdAt||a.updatedAt)||0)-(tms(b.timestamp||b.createdAt||b.updatedAt)||0);
  });
  var starts=(existing||[]).map(function(x){return x.start;});
  var rows=[];
  events.forEach(function(e,i){
    var at=tms(e.timestamp||e.createdAt||e.updatedAt);
    if(!isFinite(at))return;
    if(starts.some(function(s){return Math.abs(s-at)<300000;}))return;
    var txt=lower([e.type,e.detail,e.reason,e.status,e.targetRole,e.returnRole,e.targetProcess].join(" "));
    var target=v230ObjectTargetsSales(e)||/^RETURN_TO_SALES|REQUIREMENT_TO_SALES|SALES_REQUIREMENT/.test(String(e.type||""));
    if(!target&&!/devuelt.*ventas|regres.*ventas|enviad.*ventas|solicitud.*ventas/.test(txt))return;
    var end=NaN;
    for(var j=i+1;j<events.length;j++){
      var n=events[j],nAt=tms(n.timestamp||n.createdAt||n.updatedAt);
      if(!isFinite(nAt)||nAt<=at)continue;
      var nTxt=lower([n.type,n.detail,n.status,n.process,n.currentProcess].join(" "));
      if(/respond|resuelt|cerrad|liberad|transfer|enviad|retornad|continuar/.test(nTxt)
         || (n.process&&n.process!=="ventas")
         || (n.currentProcess&&n.currentProcess!=="ventas")){
        end=nAt;break;
      }
    }
    if(!isFinite(end))end=tms(c.updatedAt)||nowMs();
    if(end<=at)return;
    rows.push({
      type:"Retorno a Ventas",
      start:at,end:end,open:!isClosed(c),
      source:"case_events · evento dirigido a Ventas → siguiente respuesta/transferencia",
      detail:e.detail||e.reason||e.type||"Pedido regresado a Ventas"
    });
  });
  return rows;
}
function v230SalesDirectMs(c,episode){
  var trace=allTraceEvents(c).filter(function(e){
    if(e.ms<episode.start||e.ms>episode.end)return false;
    return v230RoleIsSales(e.role)
      || /ventas|asesor|vendedor/.test(lower([e.user,e.role,e.detail].join(" ")));
  }).sort(function(a,b){return a.ms-b.ms;});
  var direct=0;
  for(var i=0;i<trace.length;i++){
    var e=trace[i];
    if(e.kind!=="active")continue;
    var end=i<trace.length-1?Math.min(trace[i+1].ms,episode.end):episode.end;
    if(end>e.ms)direct+=workingMsBetween(e.ms,end);
  }
  return Math.min(workingMsBetween(episode.start,episode.end),direct);
}
function v230SalesEpisodes(cm){
  var c=cm.c,rows=[],seen={};
  function add(x){
    if(!x||!isFinite(x.start)||!isFinite(x.end)||x.end<=x.start)return;
    var key=v230EpisodeKey(x);
    if(seen[key])return;
    // Evitar duplicados cercanos de requirement/report/event.
    var duplicate=rows.some(function(r){
      return Math.abs(r.start-x.start)<300000
        && Math.abs(r.end-x.end)<300000;
    });
    if(duplicate)return;
    seen[key]=1;
    x.duration=workingMsBetween(x.start,x.end);
    if(x.duration<=0)return;
    x.direct=v230SalesDirectMs(c,x);
    x.wait=Math.max(0,x.duration-x.direct);
    x.slaHours=4;
    x.onTime=x.duration<=4*3600000;
    rows.push(x);
  }
  add(v230InitialSalesEpisode(cm));
  v230SalesRequirementEpisodes(c).forEach(add);
  v230SalesReportEpisodes(c).forEach(add);
  v230SalesEventEpisodes(c,rows).forEach(add);
  return rows.sort(function(a,b){return a.start-b.start;});
}
function v230SalesCaseRows(m){
  return (m.caseRows||[]).map(function(cm){
    return {cm:cm,episodes:v230SalesEpisodes(cm)};
  }).filter(function(x){return x.episodes.length>0;});
}
function v225AreaTouches(c,area){
  if(!area)return true;
  if(area==="ventas"){
    if(c.salesAdvisor||c.createdBy||c.createdByName||c.createdByEmail)return true;
    if(v228RequirementList(c).some(function(x){return v230ObjectTargetsSales(x.r||{});} ))return true;
    if(reportMetricsForCase(c).some(function(x){return v230ObjectTargetsSales(x.report||{});} ))return true;
    return caseEvents(c).some(v230ObjectTargetsSales);
  }
  var def=V225_AREA_DEF[area]||{processes:[]},ps=c.processStats||{};
  return def.processes.some(function(p){
    return c.currentProcess===p||!!ps[p]||(p==="corte_cable"&&(c.cutRequests||[]).length>0);
  });
}
function v225BuildAreaRows(m){
  return V225_AREA_ORDER.map(function(area){
    if(area==="ventas"){
      var salesCases=v230SalesCaseRows(m);
      if(!salesCases.length)return null;
      var episodes=[];
      salesCases.forEach(function(x){episodes=episodes.concat(x.episodes);});
      var total=episodes.reduce(function(s,x){return s+x.duration;},0);
      var direct=episodes.reduce(function(s,x){return s+x.direct;},0);
      var wait=episodes.reduce(function(s,x){return s+x.wait;},0);
      var open=episodes.filter(function(x){return x.open;}).length;
      var onTime=episodes.filter(function(x){return x.onTime;}).length;
      var workers={};
      salesCases.forEach(function(x){
        var c=x.cm.c,adv=advisor(c);
        if(adv&&!v231IsExcludedSuperAdmin({
          name:adv,email:c.createdByEmail||c.salesAdvisorEmail,
          uid:c.createdBy||c.createdByUid,role:c.createdByRole||c.salesAdvisorRole
        }))workers[normKey(adv)]=1;
        allTraceEvents(c).forEach(function(e){
          if(v230RoleIsSales(e.role)&&e.user)workers[normKey(e.user)]=1;
        });
      });
      var reliabilities=salesCases.map(function(x){return v225ReliabilityForCase(x.cm);});
      var noDeliveries=(m.specialWait&&m.specialWait.noDeliveryRows||[]).filter(function(x){return x.area==="ventas";});
      return {
        area:"ventas",label:"Ventas",
        cases:salesCases.length,
        interventions:episodes.length,
        wip:open,
        closed:episodes.length-open,
        avg:episodes.length?total/episodes.length:0,
        work:episodes.length?direct/episodes.length:0,
        block:episodes.length?wait/episodes.length:0,
        unexplained:0,
        compliance:episodes.length?v225Pct(onTime,episodes.length):0,
        rework:episodes.filter(function(x){return x.type==="Retorno a Ventas";}).length,
        reliability:Math.round(v225Mean(reliabilities.map(function(x){return x.score;}))),
        workers:Object.keys(workers).length,
        utilization:0,utilizationPct:0,
        noDeliveries:noDeliveries.length,
        salesEpisodes:episodes
      };
    }

    var def=V225_AREA_DEF[area],caseRows=(m.caseRows||[]).filter(function(cm){
      return (cm.pRows||[]).some(function(p){return def.processes.indexOf(p.process)>=0;});
    });
    if(!caseRows.length)return null;
    var procRows=(m.processRows||[]).filter(function(r){return def.processes.indexOf(r.process)>=0;});
    var cases=caseRows.length,wip=caseRows.filter(function(cm){return !cm.closed&&v225AreaForProcess(cm.c.currentProcess)===area;}).length;
    var closed=caseRows.filter(function(cm){return cm.closed;}).length;
    var total=procRows.reduce(function(s,r){return s+(r.total||0);},0);
    var active=procRows.reduce(function(s,r){return s+(r.active||0);},0);
    var wait=procRows.reduce(function(s,r){return s+(r.wait||0);},0);
    var residual=Math.max(0,total-active-wait);
    var avg=cases?total/cases:0,work=cases?active/cases:0,block=cases?wait/cases:0;
    var unexplained=cases?residual/cases:0;
    var complianceDen=procRows.reduce(function(s,r){return s+(r.slaCount||0);},0);
    var complianceNum=procRows.reduce(function(s,r){return s+(r.slaOk||0);},0);
    var compliance=complianceDen?v225Pct(complianceNum,complianceDen):0;
    var rework=caseRows.reduce(function(s,cm){return s+v225CountRework(cm.c);},0);
    var reliabilities=caseRows.map(v225ReliabilityForCase);
    var reliability=Math.round(v225Mean(reliabilities.map(function(x){return x.score;})));
    var workers={};
    caseRows.forEach(function(cm){
      (cm.pRows||[]).filter(function(p){return def.processes.indexOf(p.process)>=0;}).forEach(function(p){
        personsForProcess(cm.c,p.process).forEach(function(x){if(!x.synthetic)workers[x.key]=1;});
      });
    });
    var workerCount=Object.keys(workers).length;
    var period=v226PeriodWindow(m);
    var utilization=period.hours&&workerCount?active/(period.hours*3600000*workerCount):0;
    return {
      area:area,label:v225AreaLabel(area),cases:cases,wip:wip,closed:closed,avg:avg,work:work,block:block,
      unexplained:unexplained,compliance:compliance,rework:rework,reliability:reliability,
      workers:workerCount,utilization:utilization,utilizationPct:Math.round(utilization*100),
      noDeliveries:0
    };
  }).filter(Boolean);
}
function renderAreaBoard(){
  var m=app.metrics;if(!m)return;
  $("areaBoard").innerHTML=(m.areaRows||[]).map(function(r){
    var status=v225Status(r.compliance,85,65);
    if(r.area==="ventas"){
      return '<article class="process-card '+(status.cls==="bad"?'late':'')+'">'+
        '<div class="process-title"><h3>Ventas</h3><span class="status-chip '+status.cls+'">'+status.label+'</span></div>'+
        '<div class="process-main"><div><span>LT por intervención</span><strong>'+v225Time(r.avg)+'</strong></div><div><span>Cumplimiento 4 h</span><strong>'+r.compliance+'%</strong></div></div>'+
        '<div class="process-stats"><div><span>Intervenciones</span><b>'+r.interventions+'</b></div><div><span>Abiertas</span><b>'+r.wip+'</b></div><div><span>Trabajo trazado</span><b>'+v225Time(r.work)+'</b></div></div>'+
        '<div class="progress"><i style="width:'+Math.max(0,Math.min(100,r.compliance))+'%"></i></div>'+
        '<small class="metric-note">Pedidos '+r.cases+' · respuestas cerradas '+r.closed+' · actores '+r.workers+' · confiabilidad '+r.reliability+'%. Incluye registro inicial, requerimientos, novedades y retornos a Ventas.</small>'+
      '</article>';
    }
    return '<article class="process-card '+(status.cls==="bad"?'late':'')+'">'+
      '<div class="process-title"><h3>'+esc(r.label)+'</h3><span class="status-chip '+status.cls+'">'+status.label+'</span></div>'+
      '<div class="process-main"><div><span>LT promedio</span><strong>'+v225Time(r.avg)+'</strong></div><div><span>Cumplimiento</span><strong>'+r.compliance+'%</strong></div></div>'+
      '<div class="process-stats"><div><span>Trabajo</span><b>'+v225Time(r.work)+'</b></div><div><span>Bloqueo</span><b>'+v225Time(r.block)+'</b></div><div><span>WIP</span><b>'+r.wip+'</b></div></div>'+
      '<div class="progress"><i style="width:'+Math.max(0,Math.min(100,r.compliance))+'%"></i></div>'+
      '<small class="metric-note">Casos '+r.cases+' · cerrados '+r.closed+' · actores '+r.workers+' · confiabilidad '+r.reliability+'% · no entregas '+Number(r.noDeliveries||0)+'</small>'+
    '</article>';
  }).join("")||'<p class="muted">Sin datos suficientes por área.</p>';
}
function renderTable(){
  var m=app.metrics;if(!m)return;
  if($("fView").value==="areas"){
    $("tableTitle").textContent="Resumen por área";
    $("rowCount").textContent=m.areaRows.length+" área(s) · total cargado "+m.totalLoaded;
    $("mainTable").innerHTML=v225Table(
      ["Área","Casos/pedidos","Intervenciones","WIP/abiertas","Cerrados","LT promedio","Trabajo directo","Espera/atención","Cumplimiento","Confiabilidad","Actores"],
      m.areaRows.map(function(r){
        return '<tr><td><strong>'+esc(r.label)+'</strong></td>'+
          '<td>'+r.cases+'</td>'+
          '<td>'+(r.area==="ventas"?r.interventions:"—")+'</td>'+
          '<td>'+r.wip+'</td>'+
          '<td>'+r.closed+'</td>'+
          '<td><strong>'+v225Time(r.avg)+'</strong></td>'+
          '<td>'+v225Time(r.work)+'</td>'+
          '<td>'+v225Time(r.block)+'</td>'+
          '<td>'+r.compliance+'%</td>'+
          '<td>'+r.reliability+'%</td>'+
          '<td>'+r.workers+'</td></tr>';
      })
    );
    return;
  }
  renderTableV230Base();
}


/* ============================================================
   V231 · EXCLUSIÓN DEL SUPER ADMIN EN RESPUESTAS OPERATIVAS
============================================================ */
function v228ReqEnd(r,open){
  r=r||{};
  var candidates=[
    {at:r.answeredAt,name:r.answeredByName,email:r.answeredByEmail,uid:r.answeredBy,role:r.answeredByRole},
    {at:r.resolvedAt,name:r.resolvedByName,email:r.resolvedByEmail,uid:r.resolvedBy,role:r.resolvedByRole},
    {at:r.closedAt,name:r.closedByName,email:r.closedByEmail,uid:r.closedBy,role:r.closedByRole},
    {at:r.completedAt,name:r.completedByName,email:r.completedByEmail,uid:r.completedBy,role:r.completedByRole},
    {at:r.respondedAt,name:r.respondedByName,email:r.respondedByEmail,uid:r.respondedBy,role:r.respondedByRole}
  ].filter(function(x){return !v231IsExcludedSuperAdmin(x);})
   .map(function(x){return tms(x.at);}).filter(isFinite);
  if(candidates.length)return Math.min.apply(Math,candidates);
  if(v228ClosedText(r.status)){
    var updater={name:r.updatedByName,email:r.updatedByEmail,uid:r.updatedBy||r.updatedByUid,role:r.updatedByRole};
    var updated=tms(r.updatedAt);
    if(isFinite(updated)&&!v231IsExcludedSuperAdmin(updater))return updated;
  }
  return open?nowMs():NaN;
}
function v228RequirementList(c){
  var out=[],seen={};
  function add(r,source,forceOpen){
    if(!r||v231IsExcludedSuperAdmin({
      name:r.sentByName||r.createdByName,
      email:r.sentByEmail||r.createdByEmail,
      uid:r.sentBy||r.createdBy,
      role:r.sentByRole||r.createdByRole
    }))return;
    var start=v228ReqStart(r)||tms(c.waitStartedAt);
    var key=String(r.id||[start,r.reason,r.targetRole,r.source,r.returnProcess].join("|"));
    if(seen[key])return;
    seen[key]=1;
    var operationalEnd=v228ReqEnd(r,false);
    var open=forceOpen===true||!isFinite(operationalEnd);
    var end=isFinite(operationalEnd)?operationalEnd:nowMs();
    if(!isFinite(start)||!isFinite(end)||end<start)return;
    out.push({r:r,source:source,start:start,end:end,open:open});
  }
  (c.requirements||[]).forEach(function(r){add(r,"cases.requirements",false);});
  add(c.openRequirement,"cases.openRequirement",true);
  return out;
}
function v228NoDeliveryEnd(c,start,report){
  var candidates=[];
  function add(at,actor){
    var x=tms(at);
    if(isFinite(x)&&x>=start&&!v231IsExcludedSuperAdmin(actor||{}))candidates.push(x);
  }
  add(report&&report.closedAt,{name:report&&report.closedByName,email:report&&report.closedByEmail,uid:report&&report.closedBy,role:report&&report.closedByRole});
  add(report&&report.resolvedAt,{name:report&&report.resolvedByName,email:report&&report.resolvedByEmail,uid:report&&report.resolvedBy,role:report&&report.resolvedByRole});
  add(report&&report.completedAt,{name:report&&report.completedByName,email:report&&report.completedByEmail,uid:report&&report.completedBy,role:report&&report.completedByRole});
  (report&&report.history||[]).forEach(function(h){
    if(v228ClosedText([h.action,h.status,h.detail].join(" "))&&!v231IsExcludedSuperAdmin(h)){
      add(h.at||h.timestamp||h.createdAt,h);
    }
  });
  (c.requirements||[]).filter(function(r){return r.source==="no_entrega"||v228NoDeliveryText(JSON.stringify(r));}).forEach(function(r){
    var end=v228ReqEnd(r,false);
    if(isFinite(end)&&end>=start)candidates.push(end);
  });
  caseEvents(c).filter(function(e){return !v231IsExcludedSuperAdmin(e);}).forEach(function(e){
    if(e.type==="NO_DELIVERY_CLOSED")add(e.timestamp||e.createdAt,e);
  });
  if(v228ClosedText((report&&report.status)||c.noDeliveryStatus||c.status||"")){
    add(c.closedAt||c.updatedAt,{
      name:c.closedByName||c.updatedByName,email:c.closedByEmail||c.updatedByEmail,
      uid:c.closedBy||c.updatedBy,role:c.closedByRole||c.updatedByRole
    });
  }
  return candidates.length?Math.min.apply(Math,candidates):nowMs();
}


/* ============================================================
   V232 · GENERADOR DE INFORMES INTELIGENTES
============================================================ */
function v232StoredValue(key){
  try{return localStorage.getItem(key)||"";}catch(e){return "";}
}
function v232StoreValue(key,value){
  try{localStorage.setItem(key,value||"");}catch(e){}
}
function v232CurrentScopeText(){
  var parts=[];
  var from=$("fFrom")&&$("fFrom").value,to=$("fTo")&&$("fTo").value;
  if(from||to)parts.push("Periodo: "+(from||"inicio")+" a "+(to||"fecha actual"));
  else parts.push("Periodo: todo el histórico cargado");
  if($("fArea")&&$("fArea").value)parts.push("Área: "+v225AreaLabel($("fArea").value));
  if($("fProcess")&&$("fProcess").value)parts.push("Proceso: "+processTitle($("fProcess").value));
  if($("fOrderType")&&$("fOrderType").value)parts.push("Tipo: "+($("fOrderType").value==="pve"?"PVE":"Normal"));
  if($("fStatus")&&$("fStatus").value)parts.push("Estado: "+$("fStatus").options[$("fStatus").selectedIndex].text);
  if($("fUser")&&$("fUser").value)parts.push("Actor: "+$("fUser").options[$("fUser").selectedIndex].text);
  if($("fSla")&&$("fSla").value)parts.push("Cumplimiento: "+$("fSla").options[$("fSla").selectedIndex].text);
  if(clean($("fSearch")&&$("fSearch").value))parts.push('Búsqueda: "'+clean($("fSearch").value)+'"');
  return parts.join(" · ");
}
function v232OpenReportModal(){
  if(!app.metrics){
    status("Primero deben cargarse y calcularse los datos del VSM.","bad");
    return;
  }
  var modal=$("smartReportModal");
  if(!modal){
    status("El formulario del generador no está disponible en esta versión del HTML.","bad");
    return;
  }
  $("smartReportScope").innerHTML="<strong>Alcance que se utilizará:</strong> "+esc(v232CurrentScopeText())+
    "<br><strong>Base actual:</strong> "+Number(app.metrics.totalLoaded||app.cases.length||0)+" pedidos cargados · "+
    Number(app.metrics.cases||0)+" trazados en los indicadores.";
  $("reportAuthor").value=v232StoredValue("ei_vsm_report_author")||((app.user&&app.user.displayName)||"");
  $("reportPosition").value=v232StoredValue("ei_vsm_report_position");
  $("reportDepartment").value=v232StoredValue("ei_vsm_report_department");
  $("reportAudience").value=v232StoredValue("ei_vsm_report_audience");
  $("reportPeriodName").value=v232StoredValue("ei_vsm_report_period");
  modal.classList.add("show");
  modal.setAttribute("aria-hidden","false");
  setTimeout(function(){$("reportAuthor").focus();},50);
}
function v232CloseReportModal(){
  var modal=$("smartReportModal");
  if(!modal)return;
  modal.classList.remove("show");
  modal.setAttribute("aria-hidden","true");
}
function v232CollectMeta(){
  var meta={
    author:clean($("reportAuthor").value),
    position:clean($("reportPosition").value),
    department:clean($("reportDepartment").value),
    audience:clean($("reportAudience").value),
    type:$("reportType").value,
    format:$("reportFormat").value,
    title:clean($("reportDocumentTitle").value),
    objective:clean($("reportObjective").value),
    confidentiality:$("reportConfidentiality").value,
    periodName:clean($("reportPeriodName").value),
    notes:clean($("reportNotes").value),
    includeOrders:$("reportIncludeOrders").checked,
    includeActors:$("reportIncludeActors").checked,
    includeMethodology:$("reportIncludeMethodology").checked,
    includeActionPlan:$("reportIncludeActionPlan").checked,
    includeAlerts:$("reportIncludeAlerts").checked,
    includeWaits:$("reportIncludeWaits").checked,
    includeTrends:$("reportIncludeTrends")?$("reportIncludeTrends").checked:true,
    includeRisks:$("reportIncludeRisks")?$("reportIncludeRisks").checked:true,
    scope:v232CurrentScopeText(),
    generatedAt:new Date()
  };
  if(!meta.author||!meta.position||!meta.department||!meta.audience||!meta.title||!meta.objective){
    throw new Error("Complete todos los campos obligatorios del informe.");
  }
  v232StoreValue("ei_vsm_report_author",meta.author);
  v232StoreValue("ei_vsm_report_position",meta.position);
  v232StoreValue("ei_vsm_report_department",meta.department);
  v232StoreValue("ei_vsm_report_audience",meta.audience);
  v232StoreValue("ei_vsm_report_period",meta.periodName);
  return meta;
}
function v232TypeLabel(type){
  return {
    ejecutivo:"Informe ejecutivo para toma de decisiones",
    operativo:"Informe operativo detallado",
    productividad:"Informe de productividad",
    auditoria:"Informe de auditoría y confiabilidad",
    comite:"Informe para comité de seguimiento"
  }[type]||"Informe analítico";
}
function v232Average(values){
  values=(values||[]).filter(function(x){return isFinite(x);});
  return values.length?values.reduce(function(s,x){return s+x;},0)/values.length:0;
}
function v232OverallScore(m){
  var proc=(m.processRows||[]).filter(function(r){return r.cases>0;});
  var compliance=v232Average(proc.map(function(r){return Number(r.slaPct||0);}));
  var reliability=Number((m.reliability||{}).avg||0);
  var wipScore=m.wip?Math.max(0,100-(Number(m.lateWip||0)/m.wip*100)):100;
  var traceBase=Math.max(1,Number(m.totalLoaded||m.cases||1));
  var traceScore=Math.max(0,100-(Number(m.notTraced||0)/traceBase*100));
  var noDeliveryRate=Math.min(100,(Number(m.noDeliveryCount||0)/Math.max(1,m.cases))*100);
  var reworkRate=Math.min(100,((m.specialWait&&m.specialWait.reworkRows||[]).length/Math.max(1,m.cases))*100);
  return Math.max(0,Math.min(100,Math.round(
    compliance*.30+reliability*.25+wipScore*.20+traceScore*.10+
    (100-noDeliveryRate)*.075+(100-reworkRate)*.075
  )));
}
function v232ScoreLabel(score){
  if(score>=85)return {label:"Favorable",cls:"ok",text:"El desempeño general se mantiene controlado, con oportunidades puntuales de mejora."};
  if(score>=70)return {label:"Requiere atención",cls:"warn",text:"El flujo presenta desviaciones que deben gestionarse para evitar crecimiento del WIP y de los tiempos."};
  return {label:"Crítico",cls:"bad",text:"El resultado exige intervención prioritaria sobre tiempos, cumplimiento, trazabilidad y causas recurrentes."};
}
function v232AnalyzeV235Base(meta){
  var m=app.metrics||{},processes=(m.processRows||[]).filter(function(r){return r.cases||r.wip;});
  var areas=(m.areaRows||[]).slice(),actors=(m.actorRows||[]).filter(function(r){return !v231IsExcludedSuperAdmin(r);});
  var score=v232OverallScore(m),scoreState=v232ScoreLabel(score);
  var slowest=processes.slice().sort(function(a,b){return Number(b.avg||0)-Number(a.avg||0);})[0]||{};
  var lowestCompliance=processes.slice().filter(function(r){return r.slaCount||r.cases;}).sort(function(a,b){return Number(a.slaPct||0)-Number(b.slaPct||0);})[0]||{};
  var highestWip=processes.slice().sort(function(a,b){return Number(b.wip||0)-Number(a.wip||0);})[0]||{};
  var weakestArea=areas.slice().sort(function(a,b){return Number(a.compliance||0)-Number(b.compliance||0);})[0]||{};
  var highestAreaLt=areas.slice().sort(function(a,b){return Number(b.avg||0)-Number(a.avg||0);})[0]||{};
  var topWorkActor=actors.slice().sort(function(a,b){return Number(b.active||0)-Number(a.active||0);})[0]||{};
  var highestActorWip=actors.slice().sort(function(a,b){return Number(b.open||0)-Number(a.open||0);})[0]||{};
  var findings=[],recommendations=[],actions=[];
  findings.push("La base del informe contiene "+Number(m.totalLoaded||app.cases.length||0)+" pedidos cargados; "+Number(m.cases||0)+" cuentan con trazabilidad suficiente para los indicadores.");
  findings.push("El índice compuesto de desempeño es "+score+"% y se clasifica como "+scoreState.label.toLowerCase()+".");
  findings.push("El Lead Time mediano es "+v225Time(m.leadP50||0)+" y el percentil 90 alcanza "+v225Time(m.leadP90||0)+".");
  if(slowest.label)findings.push("El proceso con mayor LT promedio es "+slowest.label+" con "+v225Time(slowest.avg||0)+".");
  if(lowestCompliance.label)findings.push("El menor cumplimiento se presenta en "+lowestCompliance.label+" con "+Number(lowestCompliance.slaPct||0)+"%.");
  if(highestWip.label)findings.push("La mayor concentración de WIP está en "+highestWip.label+" con "+Number(highestWip.wip||0)+" pedido(s), de los cuales "+Number(highestWip.wipLate||0)+" están fuera de meta.");
  if(weakestArea.label)findings.push("El área con menor cumplimiento es "+weakestArea.label+" con "+Number(weakestArea.compliance||0)+"%.");
  if(highestAreaLt.label)findings.push("El área con mayor tiempo promedio es "+highestAreaLt.label+" con "+v225Time(highestAreaLt.avg||0)+".");
  if(topWorkActor.user)findings.push("El mayor volumen de trabajo directo trazado corresponde a "+topWorkActor.user+" con "+v225Time(topWorkActor.active||0)+"; este dato representa carga registrada, no una calificación aislada del desempeño.");
  if(highestActorWip.user&&highestActorWip.open>0)findings.push(highestActorWip.user+" concentra el mayor WIP individual con "+highestActorWip.open+" caso(s) abiertos.");
  if((m.reliability||{}).avg<90)findings.push("La confiabilidad promedio de la trazabilidad es "+Number((m.reliability||{}).avg||0)+"%, por debajo del objetivo recomendado de 90%.");
  if(m.specialWait){
    findings.push("Las esperas especiales suman "+v225Time((m.specialWait.novelty||0)+(m.specialWait.rework||0)+(m.specialWait.noDelivery||0))+": novedades "+v225Time(m.specialWait.novelty||0)+", reprocesos "+v225Time(m.specialWait.rework||0)+" y no entregas "+v225Time(m.specialWait.noDelivery||0)+".");
  }

  if(Number(m.lateWip||0)>0){
    recommendations.push("Definir una rutina diaria de priorización para los "+m.lateWip+" pedidos fuera de meta.");
    actions.push({priority:"Alta",issue:"WIP fuera de meta",action:"Revisar y reasignar diariamente los pedidos vencidos, registrando causa y próxima acción.",owner:highestWip.label||"Operaciones",target:"Reducir atrasados en al menos 50% en el siguiente corte"});
  }
  if(lowestCompliance.label&&Number(lowestCompliance.slaPct||0)<80){
    recommendations.push("Intervenir el proceso "+lowestCompliance.label+" mediante análisis de causa y ajuste de tiempos estándar.");
    actions.push({priority:"Alta",issue:"Bajo cumplimiento en "+lowestCompliance.label,action:"Revisar actividades, responsables, puntos de espera y meta del proceso.",owner:v225AreaLabel(v225AreaForProcess(lowestCompliance.process)),target:"Cumplimiento ≥ 85%"});
  }
  if((m.reliability||{}).avg<90){
    recommendations.push("Establecer obligatoriedad de fecha, responsable, estado y proceso en cada transición.");
    actions.push({priority:"Alta",issue:"Confiabilidad de datos",action:"Corregir registros incompletos y bloquear cierres sin trazabilidad mínima.",owner:"Calidad / Sistemas",target:"Confiabilidad ≥ 90%"});
  }
  if(m.specialWait&&m.specialWait.noveltyOpen>0){
    recommendations.push("Asignar SLA y responsables visibles a las novedades pendientes.");
    actions.push({priority:"Media",issue:"Novedades abiertas",action:"Cerrar o responder las "+m.specialWait.noveltyOpen+" novedades abiertas con fecha y responsable.",owner:"Áreas destinatarias",target:"Primera respuesta dentro de la meta"});
  }
  if(m.specialWait&&m.specialWait.rework>0){
    recommendations.push("Realizar análisis de causa raíz sobre los retornos que exceden la meta.");
    actions.push({priority:"Media",issue:"Reprocesos fuera de meta",action:"Clasificar los reprocesos por causa, área de origen y reincidencia.",owner:"Calidad / Área responsable",target:"Reducir tiempo de reproceso 20%"});
  }
  if(Number(m.noDeliveryCount||0)>0){
    recommendations.push("Separar las causas de no entrega por transportadora, cliente, documentación y preparación del pedido.");
    actions.push({priority:"Media",issue:"No entregas",action:"Cerrar trazabilidad y causa de los "+m.noDeliveryCount+" pedido(s) identificados.",owner:"Despacho / Cartera",target:"100% de no entregas con causa y cierre"});
  }
  if(highestActorWip.user&&Number(highestActorWip.open||0)>3){
    recommendations.push("Balancear la carga operativa del actor con mayor WIP antes de asignar nuevos casos.");
    actions.push({priority:"Media",issue:"Concentración de carga",action:"Redistribuir casos abiertos y revisar capacidad disponible.",owner:"Líder del área",target:"Ningún actor con concentración desproporcionada"});
  }
  if(!recommendations.length)recommendations.push("Mantener el seguimiento periódico, validar la estabilidad de los indicadores y documentar las mejoras implementadas.");
  if(!actions.length)actions.push({priority:"Baja",issue:"Sostenimiento",action:"Mantener revisión semanal de KPIs y alertas.",owner:"Líderes de proceso",target:"Conservar desempeño favorable"});

  return {
    m:m,score:score,scoreState:scoreState,findings:findings,
    recommendations:recommendations,actions:actions,
    processes:processes,areas:areas,actors:actors,
    slowest:slowest,lowestCompliance:lowestCompliance,highestWip:highestWip
  };
}
function v232FileName(meta,ext){
  var base=normKey(meta.title||"informe_vsm").replace(/_/g,"-").slice(0,70)||"informe-vsm";
  return base+"-"+meta.generatedAt.toISOString().slice(0,10)+"."+ext;
}
function v232ReportCss(){
  return `
    *{box-sizing:border-box}body{margin:0;background:#eef3f9;color:#102033;font-family:"Century Gothic",Arial,sans-serif}
    .report{width:100%;max-width:1060px;margin:auto;background:#fff}
    .cover{min-height:680px;padding:55px 54px;background:linear-gradient(145deg,#061b46,#12376d);color:#fff;display:flex;flex-direction:column;justify-content:space-between}
    .cover h1{font-size:34px;line-height:1.16;margin:0 0 18px}.cover h2{font-size:17px;font-weight:normal;margin:0;opacity:.86}
    .cover .meta{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:38px}.cover .meta div{padding:12px;border:1px solid rgba(255,255,255,.2);border-radius:12px}
    .cover small{opacity:.8}.section{padding:28px 34px;border-bottom:1px solid #e2e8f0;page-break-inside:avoid}
    .section h2{margin:0 0 14px;color:#061b46;font-size:21px}.section h3{color:#0f2d5c;margin:18px 0 8px}
    .lead{font-size:14px;line-height:1.6;color:#334155}.muted{color:#64748b}
    .score{display:flex;align-items:center;gap:18px;padding:17px;border-radius:16px;background:#f8fafc;border:1px solid #e2e8f0}
    .score strong{font-size:34px;color:#061b46}.score.ok{border-left:6px solid #0f9f6e}.score.warn{border-left:6px solid #d97706}.score.bad{border-left:6px solid #dc2626}
    .kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.kpi{padding:12px;border-radius:13px;border:1px solid #dbe4f0;background:#fff}
    .kpi span{display:block;font-size:10px;font-weight:bold;color:#64748b;text-transform:uppercase}.kpi strong{display:block;font-size:20px;color:#061b46;margin-top:5px}.kpi small{display:block;font-size:10px;color:#64748b;margin-top:4px}
    .grid2{display:grid;grid-template-columns:1fr 1fr;gap:15px}.panel{border:1px solid #dbe4f0;border-radius:15px;padding:14px;page-break-inside:avoid}
    .bar-row{display:grid;grid-template-columns:130px 1fr 70px;gap:8px;align-items:center;margin:8px 0;font-size:11px}
    .bar-label{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.bar-track{height:12px;background:#edf2f7;border-radius:999px;overflow:hidden}.bar{height:100%;background:#2563eb;border-radius:999px}.bar.ok{background:#0f9f6e}.bar.warn{background:#d97706}.bar.bad{background:#dc2626}
    table{width:100%;border-collapse:collapse;margin-top:10px;font-size:10px}th,td{border:1px solid #d8e2ef;padding:6px;text-align:left;vertical-align:top}th{background:#061b46;color:#fff}
    ul{margin:8px 0 0;padding-left:20px}li{margin:6px 0;line-height:1.45}
    .priority{font-weight:bold}.priority.Alta{color:#b91c1c}.priority.Media{color:#b45309}.priority.Baja{color:#047857}
    .note{padding:11px;border-radius:12px;background:#eff6ff;border:1px solid #bfdbfe;color:#1e3a8a;font-size:11px;line-height:1.45}
    .footer{padding:18px 34px;font-size:9px;color:#64748b;background:#f8fafc}
    @media print{body{background:#fff}.report{max-width:none}.section{break-inside:auto}.cover{page-break-after:always}.page-break{page-break-before:always}}
    @media(max-width:720px){.kpis{grid-template-columns:1fr 1fr}.grid2,.cover .meta{grid-template-columns:1fr}.bar-row{grid-template-columns:1fr}}
  `;
}
function v232Kpi(title,value,detail){
  return '<article class="kpi"><span>'+esc(title)+'</span><strong>'+esc(value)+'</strong><small>'+esc(detail||"")+'</small></article>';
}
function v232BarChart(rows,valueFn,labelFn,metaFn,classFn){
  rows=(rows||[]).slice(0,12);
  var max=rows.reduce(function(a,r){return Math.max(a,Number(valueFn(r))||0);},0)||1;
  return rows.map(function(r){
    var v=Number(valueFn(r))||0,cls=classFn?classFn(r):"";
    return '<div class="bar-row"><b class="bar-label">'+esc(labelFn(r))+'</b><div class="bar-track"><div class="bar '+cls+'" style="width:'+Math.max(2,Math.min(100,v/max*100))+'%"></div></div><span>'+esc(metaFn(r))+'</span></div>';
  }).join("")||'<p class="muted">Sin datos suficientes.</p>';
}
function v232Rows(headers,rows){
  return '<table><thead><tr>'+headers.map(function(h){return '<th>'+esc(h)+'</th>';}).join("")+'</tr></thead><tbody>'+rows.join("")+'</tbody></table>';
}
function v232ReportBody(meta,analysis,mode){
  var m=analysis.m,w=m.specialWait||{},r=m.reliability||{};
  var processByLt=analysis.processes.slice().sort(function(a,b){return Number(b.avg||0)-Number(a.avg||0);});
  var processByCompliance=analysis.processes.slice().sort(function(a,b){return Number(a.slaPct||0)-Number(b.slaPct||0);});
  var areasByCompliance=analysis.areas.slice().sort(function(a,b){return Number(a.compliance||0)-Number(b.compliance||0);});
  var actorsByWork=analysis.actors.slice().sort(function(a,b){return Number(b.active||0)-Number(a.active||0);});
  var period=meta.periodName||meta.scope;
  var body='';

  body+='<div class="cover"><div><small>'+esc(meta.confidentiality)+' · '+esc(v232TypeLabel(meta.type))+'</small><h1>'+esc(meta.title)+'</h1><h2>'+esc(meta.objective)+'</h2></div>'+
    '<div class="meta"><div><small>Elaborado por</small><br><strong>'+esc(meta.author)+'</strong><br>'+esc(meta.position)+'</div>'+
    '<div><small>Área responsable</small><br><strong>'+esc(meta.department)+'</strong></div>'+
    '<div><small>Dirigido a</small><br><strong>'+esc(meta.audience)+'</strong></div>'+
    '<div><small>Periodo / alcance</small><br><strong>'+esc(period)+'</strong></div></div>'+
    '<small>Generado el '+esc(meta.generatedAt.toLocaleString("es-CO"))+' · VSM '+esc(VERSION)+' · Super Admin excluido de productividad y tiempos operativos.</small></div>';

  body+='<section class="section"><h2>1. Resumen ejecutivo</h2><div class="score '+analysis.scoreState.cls+'"><strong>'+analysis.score+'%</strong><div><b>'+esc(analysis.scoreState.label)+'</b><p class="lead">'+esc(analysis.scoreState.text)+'</p></div></div>'+
    '<div class="kpis" style="margin-top:14px">'+
    v232Kpi("Total cargado",m.totalLoaded||app.cases.length,"Pedidos disponibles")+
    v232Kpi("Trazados VSM",m.cases||0,"Pedidos calculables")+
    v232Kpi("WIP actual",m.wip||0,(m.lateWip||0)+" fuera de meta")+
    v232Kpi("Cerrados",m.closed||0,"Throughput "+(m.throughput||0)+"/día")+
    v232Kpi("LT P50",v225Time(m.leadP50||0),"P90 "+v225Time(m.leadP90||0))+
    v232Kpi("Picking promedio",v225Time(m.pickingAvg||0),"P90 "+v225Time(m.pickingP90||0))+
    v232Kpi("Confiabilidad",Number(r.avg||0)+"%",Number(r.low||0)+" registros críticos")+
    v232Kpi("No entregas",m.noDeliveryCount||0,"Filtro actual")+
    '</div></section>';

  body+='<section class="section"><h2>2. Hallazgos analíticos</h2><ul>'+analysis.findings.map(function(x){return '<li>'+esc(x)+'</li>';}).join("")+'</ul>';
  if(meta.notes)body+='<div class="note" style="margin-top:14px"><strong>Contexto suministrado:</strong> '+esc(meta.notes)+'</div>';
  body+='</section>';

  body+='<section class="section"><h2>3. Desempeño por proceso</h2><div class="grid2"><article class="panel"><h3>Lead Time promedio</h3>'+
    v232BarChart(processByLt,function(x){return x.avg;},function(x){return x.label;},function(x){return v225Time(x.avg);})+
    '</article><article class="panel"><h3>Cumplimiento de meta</h3>'+
    v232BarChart(processByCompliance,function(x){return x.slaPct;},function(x){return x.label;},function(x){return Number(x.slaPct||0)+"%";},function(x){return x.slaPct>=85?"ok":(x.slaPct>=65?"warn":"bad");})+
    '</article></div>'+
    v232Rows(["Proceso","Casos","WIP","Atrasados","LT promedio","P50","P90","Cumplimiento"],analysis.processes.map(function(x){
      return '<tr><td><strong>'+esc(x.label)+'</strong></td><td>'+Number(x.cases||0)+'</td><td>'+Number(x.wip||0)+'</td><td>'+Number(x.wipLate||0)+'</td><td>'+esc(v225Time(x.avg||0))+'</td><td>'+esc(v225Time(x.p50||0))+'</td><td>'+esc(v225Time(x.p90||0))+'</td><td>'+Number(x.slaPct||0)+'%</td></tr>';
    }))+'</section>';

  body+='<section class="section"><h2>4. Desempeño por área</h2><div class="grid2"><article class="panel"><h3>Cumplimiento por área</h3>'+
    v232BarChart(areasByCompliance,function(x){return x.compliance;},function(x){return x.label;},function(x){return Number(x.compliance||0)+"%";},function(x){return x.compliance>=85?"ok":(x.compliance>=65?"warn":"bad");})+
    '</article><article class="panel"><h3>WIP por área</h3>'+
    v232BarChart(analysis.areas.slice().sort(function(a,b){return b.wip-a.wip;}),function(x){return x.wip;},function(x){return x.label;},function(x){return Number(x.wip||0)+" pedido(s)";})+
    '</article></div>'+
    v232Rows(["Área","Casos","WIP","Cerrados","LT promedio","Trabajo","Cumplimiento","Confiabilidad","No entregas"],analysis.areas.map(function(x){
      return '<tr><td><strong>'+esc(x.label)+'</strong></td><td>'+Number(x.cases||0)+'</td><td>'+Number(x.wip||0)+'</td><td>'+Number(x.closed||0)+'</td><td>'+esc(v225Time(x.avg||0))+'</td><td>'+esc(v225Time(x.work||0))+'</td><td>'+Number(x.compliance||0)+'%</td><td>'+Number(x.reliability||0)+'%</td><td>'+Number(x.noDeliveries||0)+'</td></tr>';
    }))+'</section>';

  if(meta.includeActors){
    body+='<section class="section"><h2>5. Productividad por actor</h2><div class="note">El Super Admin está excluido. La carga directa no debe interpretarse aisladamente como evaluación de desempeño.</div>'+
      '<article class="panel" style="margin-top:12px"><h3>Trabajo directo trazado</h3>'+
      v232BarChart(actorsByWork,function(x){return x.active;},function(x){return x.user;},function(x){return v225Time(x.active||0);})+'</article>'+
      v232Rows(["Actor","Rol","Casos","WIP","Cerrados","Trabajo directo","Promedio directo","Cumplimiento","Carga directa"],analysis.actors.slice(0,30).map(function(x){
        return '<tr><td><strong>'+esc(x.user)+'</strong></td><td>'+esc(roleTitle(x.role))+'</td><td>'+Number(x.count||0)+'</td><td>'+Number(x.open||0)+'</td><td>'+Number(x.closed||0)+'</td><td>'+esc(v225Time(x.active||0))+'</td><td>'+esc(v225Time(x.directPerCase||0))+'</td><td>'+Number(x.compliance||0)+'%</td><td>'+Number(x.directLoadPct||0)+'%</td></tr>';
      }))+'</section>';
  }

  if(meta.includeWaits){
    body+='<section class="section"><h2>6. Novedades, reprocesos y no entregas</h2><div class="kpis">'+
      v232Kpi("Espera en novedades",v225Time(w.novelty||0),(w.noveltyOpen||0)+" abiertas")+
      v232Kpi("Espera en reproceso",v225Time(w.rework||0),(w.reworkOpen||0)+" abiertos")+
      v232Kpi("Espera en no entregas",v225Time(w.noDelivery||0),(w.noDeliveryOpen||0)+" abiertas")+
      v232Kpi("No entregas",m.noDeliveryCount||0,"Pedidos identificados")+
      '</div><div class="grid2" style="margin-top:14px"><article class="panel"><h3>Composición de esperas especiales</h3>'+
      v232BarChart([
        {label:"Novedades",value:w.novelty||0,cls:"warn"},
        {label:"Reprocesos",value:w.rework||0,cls:"bad"},
        {label:"No entregas",value:w.noDelivery||0,cls:"warn"}
      ],function(x){return x.value;},function(x){return x.label;},function(x){return v225Time(x.value);},function(x){return x.cls;})+
      '</article><article class="panel"><h3>Registros principales</h3>'+
      v232Rows(["Pedido","Categoría","Área","Duración"],(w.all||[]).slice(0,12).map(function(x){
        return '<tr><td>'+esc(x.pedido)+'</td><td>'+esc(x.category)+'</td><td>'+esc(v225AreaLabel(x.area))+'</td><td>'+esc(v225Time(x.duration||0))+'</td></tr>';
      }))+'</article></div></section>';
  }

  if(meta.includeAlerts){
    body+='<section class="section"><h2>7. Alertas y riesgos prioritarios</h2>'+
      v232Rows(["Prioridad","Pedido","Proceso","Hallazgo","Acción sugerida"],(m.alertRows||[]).slice(0,25).map(function(x){
        return '<tr><td>'+(x.severity==="bad"?"Alta":"Media")+'</td><td>'+esc(x.pedido||"")+'</td><td>'+esc(x.proceso||"")+'</td><td>'+esc(x.detalle||"")+'</td><td>'+esc(x.accion||"")+'</td></tr>';
      }))+'</section>';
  }

  body+='<section class="section"><h2>8. Recomendaciones</h2><ul>'+analysis.recommendations.map(function(x){return '<li>'+esc(x)+'</li>';}).join("")+'</ul></section>';

  if(meta.includeActionPlan){
    body+='<section class="section"><h2>9. Plan de acción propuesto</h2>'+
      v232Rows(["Prioridad","Situación","Acción","Responsable sugerido","Meta"],analysis.actions.map(function(x){
        return '<tr><td class="priority '+esc(x.priority)+'">'+esc(x.priority)+'</td><td>'+esc(x.issue)+'</td><td>'+esc(x.action)+'</td><td>'+esc(x.owner)+'</td><td>'+esc(x.target)+'</td></tr>';
      }))+'</section>';
  }

  if(meta.includeOrders){
    var critical=(m.wipRows||[]).slice(0,mode==="excel"?500:50);
    body+='<section class="section page-break"><h2>10. Anexo de pedidos críticos</h2>'+
      v232Rows(["Pedido","OC","Cliente","Proceso","Responsable","Tiempo en proceso","Meta","Estado","Bloqueo","Próxima acción"],critical.map(function(x){
        return '<tr><td><strong>'+esc(x.pedido)+'</strong></td><td>'+esc(x.oc)+'</td><td>'+esc(x.cliente)+'</td><td>'+esc(x.processLabel)+'</td><td>'+esc(x.responsable)+'</td><td>'+esc(v225Time(x.age||0))+'</td><td>'+Number(x.slaHours||0)+' h</td><td>'+(x.late?"Fuera de meta":"Dentro de meta")+'</td><td>'+esc(x.blocker||"")+'</td><td>'+esc(x.next||"")+'</td></tr>';
      }))+'</section>';
  }

  if(meta.includeMethodology){
    body+='<section class="section"><h2>11. Metodología, fórmulas y fuentes</h2>'+
      v232Rows(["Elemento","Criterio aplicado"],[
        '<tr><td>Jornada laboral</td><td>07:00–12:00 y 13:40–17:30; se excluyen sábados, domingos y festivos colombianos cargados.</td></tr>',
        '<tr><td>Lead Time</td><td>Tiempo laboral desde el inicio del pedido o etapa hasta su cierre o corte de análisis.</td></tr>',
        '<tr><td>P50 / P90</td><td>P50 es la mediana; P90 representa el tiempo bajo el cual termina el 90% de los casos.</td></tr>',
        '<tr><td>Trabajo directo</td><td>Actividad registrada o inferida mediante eventos operativos; no incluye las intervenciones del Super Admin.</td></tr>',
        '<tr><td>Reproceso</td><td>Exceso sobre la meta cuando el pedido regresa a Ventas u otra etapa por corrección, diferencia, rechazo o no conformidad.</td></tr>',
        '<tr><td>No entrega</td><td>Desde la confirmación mediante noDelivery, noDeliveryReports, requirementType=no_entrega o NO_DELIVERY_* hasta solución o cierre.</td></tr>',
        '<tr><td>Índice compuesto</td><td>30% cumplimiento, 25% confiabilidad, 20% WIP en meta, 10% cobertura de trazabilidad, 7,5% no entregas y 7,5% reprocesos.</td></tr>',
        '<tr><td>Fuentes</td><td>cases, case_events, reportes_novedad, processStats, requirements, openRequirement, noDeliveryReports, stateHistory y flowTrace.</td></tr>'
      ])+'</section>';
  }

  body+='<section class="section"><h2>Conclusión</h2><p class="lead">'+esc(analysis.scoreState.text)+' El seguimiento debe concentrarse en '+esc((analysis.lowestCompliance.label||"los procesos con menor cumplimiento"))+', el WIP fuera de meta y la mejora de la confiabilidad de los registros.</p></section>'+
    '<footer class="footer">Elaborado por '+esc(meta.author)+' · '+esc(meta.position)+' · '+esc(meta.department)+' · '+esc(meta.confidentiality)+' · '+esc(meta.generatedAt.toLocaleString("es-CO"))+'</footer>';
  return body;
}
function v232FullReportHtml(meta,analysis,mode){
  return '<!doctype html><html><head><meta charset="utf-8"><title>'+esc(meta.title)+'</title><style>'+v232ReportCss()+'</style></head><body><main class="report">'+v232ReportBody(meta,analysis,mode)+'</main></body></html>';
}

/* ============================================================
   V234 · MOTORES NATIVOS DE INFORMES
   PDF: jsPDF + AutoTable, sin capturas HTML.
   Excel: ExcelJS .xlsx con hojas, estilos y gráficas.
============================================================ */
async function v234LoadPdfLibraries(){
  if(!(window.jspdf&&window.jspdf.jsPDF)){
    await loadOne([
      "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js",
      "https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js",
      "https://unpkg.com/jspdf@2.5.1/dist/jspdf.umd.min.js"
    ],function(){return !!(window.jspdf&&window.jspdf.jsPDF);},"jsPDF");
  }
  var PDF=window.jspdf&&window.jspdf.jsPDF;
  if(!(PDF&&PDF.API&&PDF.API.autoTable)){
    await loadOne([
      "https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js",
      "https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js",
      "https://unpkg.com/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js"
    ],function(){
      var P=window.jspdf&&window.jspdf.jsPDF;
      return !!(P&&P.API&&P.API.autoTable);
    },"jsPDF AutoTable");
  }
}
async function v234LoadExcelLibrary(){
  if(!window.ExcelJS){
    await loadOne([
      "https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js",
      "https://unpkg.com/exceljs@4.4.0/dist/exceljs.min.js"
    ],function(){return !!window.ExcelJS;},"ExcelJS");
  }
}
function v234MsHours(ms){
  var n=Number(ms||0)/3600000;
  return isFinite(n)?Math.round(n*100)/100:0;
}
function v234PdfPageState(doc){
  return {
    pageWidth:doc.internal.pageSize.getWidth(),
    pageHeight:doc.internal.pageSize.getHeight(),
    margin:42,
    y:50,
    section:"",
    contentWidth:doc.internal.pageSize.getWidth()-84
  };
}
function v234PdfHeader(doc,state,title){
  doc.setFillColor(6,27,70);
  doc.rect(0,0,state.pageWidth,28,"F");
  doc.setTextColor(255,255,255);
  doc.setFont("helvetica","bold");
  doc.setFontSize(8);
  doc.text("ELECTROINGENIERÍA · VSM OPERATIVO",state.margin,18);
  doc.setFont("helvetica","normal");
  doc.text(title||state.section||"Informe analítico",state.pageWidth-state.margin,18,{align:"right"});
  doc.setTextColor(16,32,51);
  state.y=46;
}
function v234PdfNewPage(doc,state,title){
  doc.addPage();
  state.section=title||state.section;
  v234PdfHeader(doc,state,state.section);
}
function v234PdfEnsure(doc,state,height,title){
  if(state.y+height>state.pageHeight-48)v234PdfNewPage(doc,state,title||state.section);
}
function v234PdfSection(doc,state,title){
  v234PdfEnsure(doc,state,42,title);
  state.section=title;
  doc.setFillColor(238,243,249);
  doc.roundedRect(state.margin,state.y,state.contentWidth,28,6,6,"F");
  doc.setTextColor(6,27,70);
  doc.setFont("helvetica","bold");
  doc.setFontSize(13);
  doc.text(title,state.margin+10,state.y+18);
  state.y+=40;
}
function v234PdfParagraph(doc,state,text,opts){
  opts=opts||{};
  var size=opts.size||9.5;
  var indent=opts.indent||0;
  var width=state.contentWidth-indent;
  doc.setFont("helvetica",opts.bold?"bold":"normal");
  doc.setFontSize(size);
  doc.setTextColor(16,32,51);
  var lines=doc.splitTextToSize(String(text||""),width);
  var h=lines.length*(size*1.38)+4;
  v234PdfEnsure(doc,state,h,state.section);
  doc.text(lines,state.margin+indent,state.y);
  state.y+=h;
}
function v234PdfBulletList(doc,state,items){
  (items||[]).forEach(function(item){
    var lines=doc.splitTextToSize(String(item||""),state.contentWidth-18);
    var h=Math.max(16,lines.length*12+4);
    v234PdfEnsure(doc,state,h,state.section);
    doc.setFillColor(242,183,5);
    doc.circle(state.margin+4,state.y-3,2.2,"F");
    doc.setFont("helvetica","normal");
    doc.setFontSize(9.2);
    doc.setTextColor(16,32,51);
    doc.text(lines,state.margin+14,state.y);
    state.y+=h;
  });
}
function v234PdfKpiGrid(doc,state,kpis){
  var cols=4,gap=8,w=(state.contentWidth-gap*(cols-1))/cols,h=66;
  for(var i=0;i<kpis.length;i++){
    if(i%cols===0)v234PdfEnsure(doc,state,h+10,state.section);
    var col=i%cols,x=state.margin+col*(w+gap),y=state.y;
    doc.setDrawColor(216,226,239);
    doc.setFillColor(248,250,252);
    doc.roundedRect(x,y,w,h,6,6,"FD");
    doc.setFont("helvetica","bold");
    doc.setTextColor(100,116,139);
    doc.setFontSize(7);
    var title=doc.splitTextToSize(String(kpis[i].title||""),w-12);
    doc.text(title,x+6,y+12);
    doc.setTextColor(6,27,70);
    doc.setFontSize(15);
    doc.text(String(kpis[i].value||"—"),x+6,y+35);
    doc.setTextColor(100,116,139);
    doc.setFont("helvetica","normal");
    doc.setFontSize(6.8);
    var detail=doc.splitTextToSize(String(kpis[i].detail||""),w-12);
    doc.text(detail,x+6,y+49);
    if(col===cols-1||i===kpis.length-1)state.y+=h+10;
  }
}
function v234PdfBarChart(doc,state,title,rows,valueFn,labelFn,displayFn,colorFn){
  rows=(rows||[]).slice(0,12);
  var rowH=21,boxH=42+rows.length*rowH;
  v234PdfEnsure(doc,state,boxH+8,state.section);
  var x=state.margin,y=state.y,w=state.contentWidth;
  doc.setDrawColor(216,226,239);
  doc.setFillColor(255,255,255);
  doc.roundedRect(x,y,w,boxH,7,7,"FD");
  doc.setFont("helvetica","bold");
  doc.setTextColor(6,27,70);
  doc.setFontSize(10);
  doc.text(title,x+10,y+18);
  var max=rows.reduce(function(a,r){return Math.max(a,Number(valueFn(r))||0);},0)||1;
  rows.forEach(function(r,i){
    var yy=y+34+i*rowH;
    var value=Number(valueFn(r))||0;
    var label=String(labelFn(r)||"");
    var display=String(displayFn(r)||"");
    doc.setFont("helvetica","normal");
    doc.setFontSize(7.2);
    doc.setTextColor(51,65,85);
    var shortLabel=label.length>27?label.slice(0,26)+"…":label;
    doc.text(shortLabel,x+10,yy+8);
    var barX=x+145,barW=w-225;
    doc.setFillColor(237,242,247);
    doc.roundedRect(barX,yy,barW,10,5,5,"F");
    var cls=colorFn?colorFn(r):"info";
    if(cls==="ok")doc.setFillColor(15,159,110);
    else if(cls==="warn")doc.setFillColor(217,119,6);
    else if(cls==="bad")doc.setFillColor(220,38,38);
    else doc.setFillColor(37,99,235);
    doc.roundedRect(barX,yy,Math.max(3,barW*Math.min(1,value/max)),10,5,5,"F");
    doc.setTextColor(6,27,70);
    doc.setFont("helvetica","bold");
    doc.text(display,x+w-10,yy+8,{align:"right"});
  });
  state.y+=boxH+12;
}
function v234PdfTable(doc,state,title,head,body,options){
  options=options||{};
  v234PdfSection(doc,state,title);
  doc.autoTable({
    startY:state.y,
    head:[head],
    body:body.length?body:[head.map(function(){return "Sin datos";})],
    margin:{left:state.margin,right:state.margin,top:42,bottom:42},
    theme:"grid",
    styles:{
      font:"helvetica",fontSize:options.fontSize||7.2,
      cellPadding:3,textColor:[16,32,51],lineColor:[216,226,239],lineWidth:.35,
      overflow:"linebreak",valign:"top"
    },
    headStyles:{fillColor:[6,27,70],textColor:[255,255,255],fontStyle:"bold"},
    alternateRowStyles:{fillColor:[248,250,252]},
    columnStyles:options.columnStyles||{},
    didDrawPage:function(){
      state.section=title;
      v234PdfHeader(doc,state,title);
    }
  });
  state.y=(doc.lastAutoTable&&doc.lastAutoTable.finalY||state.y)+16;
}
function v234PdfFooterAll(doc,meta){
  var pages=doc.getNumberOfPages();
  for(var i=1;i<=pages;i++){
    doc.setPage(i);
    var w=doc.internal.pageSize.getWidth(),h=doc.internal.pageSize.getHeight();
    doc.setDrawColor(216,226,239);
    doc.line(42,h-27,w-42,h-27);
    doc.setFont("helvetica","normal");
    doc.setFontSize(7);
    doc.setTextColor(100,116,139);
    doc.text(meta.author+" · "+meta.department,42,h-15);
    doc.text("Página "+i+" de "+pages,w-42,h-15,{align:"right"});
  }
}
function v234PdfConclusion(analysis){
  var parts=[];
  parts.push(analysis.scoreState.text);
  if(analysis.lowestCompliance&&analysis.lowestCompliance.label){
    parts.push("El proceso que requiere mayor atención es "+analysis.lowestCompliance.label+
      ", con un cumplimiento de "+Number(analysis.lowestCompliance.slaPct||0)+"%.");
  }
  if(analysis.highestWip&&analysis.highestWip.label){
    parts.push("La concentración de trabajo pendiente se ubica en "+analysis.highestWip.label+
      ", con "+Number(analysis.highestWip.wip||0)+" caso(s) en WIP.");
  }
  parts.push("Las decisiones deben priorizar la reducción de atrasos, la trazabilidad completa de cada transición y el cierre oportuno de novedades, reprocesos y no entregas.");
  return parts.join(" ");
}
function v234OpenPrintFallback(meta,analysis){
  var win=window.open("","_blank");
  if(!win)throw new Error("El navegador bloqueó la ventana de impresión. Habilite las ventanas emergentes.");
  win.document.open();
  win.document.write(v232FullReportHtml(meta,analysis,"pdf"));
  win.document.close();
  setTimeout(function(){try{win.focus();win.print();}catch(e){}},700);
}
async function v232GeneratePdf(meta,analysis){
  try{
    await v234LoadPdfLibraries();
    var PDF=window.jspdf.jsPDF;
    var doc=new PDF({orientation:"portrait",unit:"pt",format:"a4",compress:true});
    var state=v234PdfPageState(doc);
    var m=analysis.m,w=m.specialWait||{},r=m.reliability||{};

    // Portada.
    doc.setFillColor(6,27,70);
    doc.rect(0,0,state.pageWidth,state.pageHeight,"F");
    doc.setFillColor(242,183,5);
    doc.rect(0,0,15,state.pageHeight,"F");
    doc.setTextColor(255,255,255);
    doc.setFont("helvetica","bold");
    doc.setFontSize(10);
    doc.text(meta.confidentiality.toUpperCase()+" · "+v232TypeLabel(meta.type).toUpperCase(),52,68);
    doc.setFontSize(27);
    var titleLines=doc.splitTextToSize(meta.title,state.pageWidth-104);
    doc.text(titleLines,52,122);
    var titleBottom=122+titleLines.length*32;
    doc.setFont("helvetica","normal");
    doc.setFontSize(12);
    var objLines=doc.splitTextToSize(meta.objective,state.pageWidth-104);
    doc.text(objLines,52,titleBottom+20);
    var boxY=titleBottom+105;
    var boxW=(state.pageWidth-116)/2;
    [
      ["Elaborado por",meta.author+"\n"+meta.position],
      ["Área responsable",meta.department],
      ["Dirigido a",meta.audience],
      ["Periodo / alcance",meta.periodName||meta.scope]
    ].forEach(function(item,i){
      var col=i%2,row=Math.floor(i/2),x=52+col*(boxW+12),y=boxY+row*88;
      doc.setFillColor(15,45,92);
      doc.setDrawColor(67,94,135);
      doc.roundedRect(x,y,boxW,72,7,7,"FD");
      doc.setFont("helvetica","bold");
      doc.setFontSize(8);
      doc.setTextColor(242,183,5);
      doc.text(item[0],x+10,y+17);
      doc.setFont("helvetica","normal");
      doc.setFontSize(10);
      doc.setTextColor(255,255,255);
      doc.text(doc.splitTextToSize(item[1],boxW-20),x+10,y+35);
    });
    doc.setFontSize(8);
    doc.setTextColor(203,213,225);
    doc.text("Generado el "+meta.generatedAt.toLocaleString("es-CO")+" · "+VERSION,52,state.pageHeight-45);
    doc.text("Super Admin excluido de productividad y tiempos operativos.",52,state.pageHeight-29);

    // Resumen ejecutivo.
    v234PdfNewPage(doc,state,"Resumen ejecutivo");
    v234PdfSection(doc,state,"1. Resumen ejecutivo");
    v234PdfParagraph(doc,state,"Índice general de desempeño: "+analysis.score+"% · "+analysis.scoreState.label+".",{"bold":true});
    v234PdfParagraph(doc,state,analysis.scoreState.text);
    v234PdfKpiGrid(doc,state,[
      {title:"Total cargado",value:String(m.totalLoaded||app.cases.length||0),detail:"Pedidos disponibles"},
      {title:"Trazados VSM",value:String(m.cases||0),detail:"Pedidos calculables"},
      {title:"WIP actual",value:String(m.wip||0),detail:String(m.lateWip||0)+" fuera de meta"},
      {title:"Cerrados",value:String(m.closed||0),detail:"Throughput "+String(m.throughput||0)+"/día"},
      {title:"LT P50",value:v225Time(m.leadP50||0),detail:"P90 "+v225Time(m.leadP90||0)},
      {title:"Picking promedio",value:v225Time(m.pickingAvg||0),detail:"P90 "+v225Time(m.pickingP90||0)},
      {title:"Confiabilidad",value:String(Number(r.avg||0))+"%",detail:String(Number(r.low||0))+" registros críticos"},
      {title:"No entregas",value:String(m.noDeliveryCount||0),detail:"Filtro actual"}
    ]);

    v234PdfSection(doc,state,"2. Hallazgos analíticos");
    v234PdfBulletList(doc,state,analysis.findings);
    if(meta.notes){
      v234PdfParagraph(doc,state,"Contexto suministrado: "+meta.notes,{bold:true});
    }

    // Gráficas.
    v234PdfSection(doc,state,"3. Gráficas para toma de decisiones");
    v234PdfBarChart(
      doc,state,"Lead Time promedio por proceso",
      analysis.processes.slice().sort(function(a,b){return Number(b.avg||0)-Number(a.avg||0);}),
      function(x){return Number(x.avg||0);},
      function(x){return x.label;},
      function(x){return v225Time(x.avg||0);}
    );
    v234PdfBarChart(
      doc,state,"Cumplimiento por proceso",
      analysis.processes.slice().sort(function(a,b){return Number(a.slaPct||0)-Number(b.slaPct||0);}),
      function(x){return Number(x.slaPct||0);},
      function(x){return x.label;},
      function(x){return Number(x.slaPct||0)+"%";},
      function(x){return x.slaPct>=85?"ok":(x.slaPct>=65?"warn":"bad");}
    );
    v234PdfBarChart(
      doc,state,"WIP por área",
      analysis.areas.slice().sort(function(a,b){return Number(b.wip||0)-Number(a.wip||0);}),
      function(x){return Number(x.wip||0);},
      function(x){return x.label;},
      function(x){return Number(x.wip||0)+" pedido(s)";}
    );
    if(meta.includeWaits){
      v234PdfBarChart(
        doc,state,"Novedades, reprocesos y no entregas",
        [
          {label:"Novedades",value:w.novelty||0,cls:"warn"},
          {label:"Reprocesos",value:w.rework||0,cls:"bad"},
          {label:"No entregas",value:w.noDelivery||0,cls:"warn"}
        ],
        function(x){return x.value;},
        function(x){return x.label;},
        function(x){return v225Time(x.value);},
        function(x){return x.cls;}
      );
    }

    // Tablas.
    v234PdfTable(doc,state,"4. Desempeño por proceso",
      ["Proceso","Casos","WIP","Atrasados","LT prom.","P50","P90","Cumpl."],
      analysis.processes.map(function(x){
        return [
          x.label,Number(x.cases||0),Number(x.wip||0),Number(x.wipLate||0),
          v225Time(x.avg||0),v225Time(x.p50||0),v225Time(x.p90||0),Number(x.slaPct||0)+"%"
        ];
      }),
      {fontSize:6.8}
    );
    v234PdfTable(doc,state,"5. Desempeño por área",
      ["Área","Casos","WIP","Cerrados","LT prom.","Trabajo","Cumpl.","Confiab.","No entregas"],
      analysis.areas.map(function(x){
        return [
          x.label,Number(x.cases||0),Number(x.wip||0),Number(x.closed||0),
          v225Time(x.avg||0),v225Time(x.work||0),Number(x.compliance||0)+"%",
          Number(x.reliability||0)+"%",Number(x.noDeliveries||0)
        ];
      }),
      {fontSize:6.5}
    );

    if(meta.includeActors){
      v234PdfTable(doc,state,"6. Productividad por actor",
        ["Actor","Rol","Casos","WIP","Cerrados","Trabajo","Promedio","Cumpl.","Carga"],
        analysis.actors.slice(0,40).map(function(x){
          return [
            x.user,roleTitle(x.role),Number(x.count||0),Number(x.open||0),Number(x.closed||0),
            v225Time(x.active||0),v225Time(x.directPerCase||0),
            Number(x.compliance||0)+"%",Number(x.directLoadPct||0)+"%"
          ];
        }),
        {fontSize:6.3}
      );
      v234PdfParagraph(doc,state,"Nota: el Super Admin está excluido. La carga directa representa actividad trazada y no debe utilizarse aisladamente como evaluación individual.");
    }

    if(meta.includeWaits){
      v234PdfTable(doc,state,"7. Trazabilidad de tiempos especiales",
        ["Pedido","Categoría","Área","Proceso","Duración","Abierto","Origen"],
        (w.all||[]).slice(0,80).map(function(x){
          return [
            x.pedido,x.category,v225AreaLabel(x.area),processTitle(x.process),
            v225Time(x.duration||0),x.open?"Sí":"No",x.source
          ];
        }),
        {fontSize:6.2,columnStyles:{6:{cellWidth:145}}}
      );
    }

    if(meta.includeAlerts){
      v234PdfTable(doc,state,"8. Alertas y riesgos prioritarios",
        ["Prioridad","Pedido","Proceso","Hallazgo","Acción sugerida"],
        (m.alertRows||[]).slice(0,60).map(function(x){
          return [
            x.severity==="bad"?"Alta":"Media",x.pedido||"",x.proceso||"",
            x.detalle||"",x.accion||""
          ];
        }),
        {fontSize:6.3,columnStyles:{3:{cellWidth:150},4:{cellWidth:150}}}
      );
    }

    v234PdfSection(doc,state,"9. Recomendaciones");
    v234PdfBulletList(doc,state,analysis.recommendations);

    if(meta.includeActionPlan){
      v234PdfTable(doc,state,"10. Plan de acción propuesto",
        ["Prioridad","Situación","Acción","Responsable sugerido","Meta"],
        analysis.actions.map(function(x){
          return [x.priority,x.issue,x.action,x.owner,x.target];
        }),
        {fontSize:6.5,columnStyles:{2:{cellWidth:165}}}
      );
    }

    if(meta.includeOrders){
      v234PdfTable(doc,state,"11. Anexo de pedidos críticos",
        ["Pedido","OC","Cliente","Proceso","Responsable","Tiempo","Meta","Estado","Próxima acción"],
        (m.wipRows||[]).slice(0,120).map(function(x){
          return [
            x.pedido,x.oc,x.cliente,x.processLabel,x.responsable,
            v225Time(x.age||0),Number(x.slaHours||0)+" h",
            x.late?"Fuera de meta":"Dentro de meta",x.next||""
          ];
        }),
        {fontSize:5.8,columnStyles:{2:{cellWidth:90},8:{cellWidth:110}}}
      );
    }

    if(meta.includeMethodology){
      v234PdfTable(doc,state,"12. Metodología, fórmulas y fuentes",
        ["Elemento","Criterio aplicado"],
        [
          ["Jornada laboral","07:00–12:00 y 13:40–17:30; se excluyen sábados, domingos y festivos colombianos cargados."],
          ["Lead Time","Tiempo laboral desde el inicio del pedido o etapa hasta su cierre o corte de análisis."],
          ["P50 / P90","P50 es la mediana; P90 es el tiempo bajo el cual termina el 90% de los casos."],
          ["Trabajo directo","Actividad registrada o inferida mediante eventos operativos; no incluye al Super Admin."],
          ["Reproceso","Exceso sobre la meta cuando el pedido regresa a una etapa anterior por corrección, diferencia, rechazo o no conformidad."],
          ["No entrega","Desde la confirmación mediante noDelivery, noDeliveryReports, requirementType=no_entrega o NO_DELIVERY_* hasta su solución."],
          ["Índice compuesto","30% cumplimiento, 25% confiabilidad, 20% WIP en meta, 10% cobertura, 7,5% no entregas y 7,5% reprocesos."],
          ["Fuentes","cases, case_events, reportes_novedad, processStats, requirements, openRequirement, noDeliveryReports, stateHistory y flowTrace."]
        ],
        {fontSize:7,columnStyles:{0:{cellWidth:95}}}
      );
    }

    v234PdfSection(doc,state,"13. Conclusión");
    v234PdfParagraph(doc,state,v234PdfConclusion(analysis),{size:10});
    v234PdfParagraph(doc,state,"Informe elaborado por "+meta.author+", "+meta.position+", para "+meta.audience+".");
    v234PdfFooterAll(doc,meta);
    doc.save(v232FileName(meta,"pdf"));
  }catch(e){
    console.error("[V234 Informe PDF]",e);
    v234OpenPrintFallback(meta,analysis);
    status("El navegador no cargó el motor PDF. Se abrió el informe completo para imprimir y guardar como PDF.","ok");
  }
}
function v234ExcelStyleHeader(row){
  row.height=26;
  row.eachCell(function(cell){
    cell.font={bold:true,color:{argb:"FFFFFFFF"},size:10};
    cell.fill={type:"pattern",pattern:"solid",fgColor:{argb:"FF061B46"}};
    cell.alignment={vertical:"middle",horizontal:"center",wrapText:true};
    cell.border={
      top:{style:"thin",color:{argb:"FFD8E2EF"}},
      left:{style:"thin",color:{argb:"FFD8E2EF"}},
      bottom:{style:"thin",color:{argb:"FFD8E2EF"}},
      right:{style:"thin",color:{argb:"FFD8E2EF"}}
    };
  });
}
function v234ExcelStyleTable(sheet,startRow,endRow){
  for(var r=startRow;r<=endRow;r++){
    var row=sheet.getRow(r);
    row.eachCell(function(cell){
      cell.alignment={vertical:"top",wrapText:true};
      cell.border={
        top:{style:"thin",color:{argb:"FFD8E2EF"}},
        left:{style:"thin",color:{argb:"FFD8E2EF"}},
        bottom:{style:"thin",color:{argb:"FFD8E2EF"}},
        right:{style:"thin",color:{argb:"FFD8E2EF"}}
      };
      if(r%2===0)cell.fill={type:"pattern",pattern:"solid",fgColor:{argb:"FFF8FAFC"}};
    });
  }
}
function v234ExcelTitle(sheet,title,subtitle){
  sheet.mergeCells("A1:J1");
  var c=sheet.getCell("A1");
  c.value=title;
  c.font={bold:true,size:18,color:{argb:"FFFFFFFF"}};
  c.fill={type:"pattern",pattern:"solid",fgColor:{argb:"FF061B46"}};
  c.alignment={vertical:"middle",horizontal:"left"};
  sheet.getRow(1).height=34;
  sheet.mergeCells("A2:J2");
  var s=sheet.getCell("A2");
  s.value=subtitle||"";
  s.font={italic:true,size:10,color:{argb:"FF475569"}};
  s.alignment={wrapText:true};
  sheet.getRow(2).height=30;
}
function v234ExcelAutoWidths(sheet,min,max){
  min=min||10;max=max||42;
  sheet.columns.forEach(function(col){
    var width=min;
    col.eachCell({includeEmpty:true},function(cell){
      var value=cell.value;
      var text=value===null||value===undefined?"":String(value.richText?value.richText.map(function(x){return x.text;}).join(""):value);
      width=Math.max(width,Math.min(max,text.length+2));
    });
    col.width=width;
  });
}
function v234CanvasChart(title,rows,valueFn,labelFn,displayFn,colorFn){
  rows=(rows||[]).slice(0,12);
  var canvas=document.createElement("canvas");
  canvas.width=1100;
  canvas.height=Math.max(440,130+rows.length*48);
  var ctx=canvas.getContext("2d");
  ctx.fillStyle="#ffffff";ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle="#061b46";ctx.font="bold 28px Arial";ctx.fillText(title,35,48);
  ctx.font="18px Arial";
  var max=rows.reduce(function(a,r){return Math.max(a,Number(valueFn(r))||0);},0)||1;
  rows.forEach(function(r,i){
    var y=95+i*48,value=Number(valueFn(r))||0,label=String(labelFn(r)||"");
    var display=String(displayFn(r)||"");
    ctx.fillStyle="#334155";ctx.font="16px Arial";
    ctx.fillText(label.length>31?label.slice(0,30)+"…":label,35,y+18);
    var barX=330,barY=y,barW=600,barH=22;
    ctx.fillStyle="#edf2f7";ctx.beginPath();ctx.roundRect(barX,barY,barW,barH,11);ctx.fill();
    var cls=colorFn?colorFn(r):"info";
    ctx.fillStyle=cls==="ok"?"#0f9f6e":cls==="warn"?"#d97706":cls==="bad"?"#dc2626":"#2563eb";
    ctx.beginPath();ctx.roundRect(barX,barY,Math.max(6,barW*Math.min(1,value/max)),barH,11);ctx.fill();
    ctx.fillStyle="#061b46";ctx.font="bold 16px Arial";ctx.textAlign="right";
    ctx.fillText(display,1060,y+18);ctx.textAlign="left";
  });
  return canvas.toDataURL("image/png");
}
function v234ExcelAddImage(workbook,sheet,dataUrl,range){
  var id=workbook.addImage({base64:dataUrl,extension:"png"});
  sheet.addImage(id,range);
}
function v234ExcelSheet(workbook,name,title,subtitle,headers,rows){
  var sheet=workbook.addWorksheet(name,{views:[{state:"frozen",ySplit:3}]});
  v234ExcelTitle(sheet,title,subtitle);
  sheet.addRow([]);
  var headerRow=sheet.addRow(headers);
  v234ExcelStyleHeader(headerRow);
  rows.forEach(function(row){sheet.addRow(row);});
  v234ExcelStyleTable(sheet,headerRow.number+1,sheet.rowCount);
  sheet.autoFilter={from:{row:headerRow.number,column:1},to:{row:sheet.rowCount,column:headers.length}};
  v234ExcelAutoWidths(sheet);
  return sheet;
}
function v234DownloadBlob(blob,filename){
  var a=document.createElement("a");
  a.href=URL.createObjectURL(blob);
  a.download=filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(function(){URL.revokeObjectURL(a.href);a.remove();},1500);
}
async function v232GenerateExcel(meta,analysis){
  await v234LoadExcelLibrary();
  var ExcelJS=window.ExcelJS,m=analysis.m,w=m.specialWait||{},r=m.reliability||{};
  var workbook=new ExcelJS.Workbook();
  workbook.creator=meta.author;
  workbook.lastModifiedBy=meta.author;
  workbook.created=meta.generatedAt;
  workbook.modified=meta.generatedAt;
  workbook.properties.date1904=false;
  workbook.calcProperties.fullCalcOnLoad=true;

  // Portada / resumen.
  var summary=workbook.addWorksheet("Resumen",{views:[{showGridLines:false}]});
  summary.mergeCells("A1:H3");
  var title=summary.getCell("A1");
  title.value=meta.title;
  title.font={bold:true,size:22,color:{argb:"FFFFFFFF"}};
  title.fill={type:"pattern",pattern:"solid",fgColor:{argb:"FF061B46"}};
  title.alignment={vertical:"middle",horizontal:"left",wrapText:true};
  summary.getRow(1).height=35;summary.getRow(2).height=35;summary.getRow(3).height=35;
  summary.getCell("A5").value="Elaborado por";summary.getCell("B5").value=meta.author;
  summary.getCell("A6").value="Cargo";summary.getCell("B6").value=meta.position;
  summary.getCell("A7").value="Área responsable";summary.getCell("B7").value=meta.department;
  summary.getCell("A8").value="Dirigido a";summary.getCell("B8").value=meta.audience;
  summary.getCell("A9").value="Periodo / alcance";summary.getCell("B9").value=meta.periodName||meta.scope;
  summary.getCell("A10").value="Clasificación";summary.getCell("B10").value=meta.confidentiality;
  summary.getCell("A12").value="Objetivo";summary.getCell("B12").value=meta.objective;
  summary.mergeCells("B12:H14");
  summary.getCell("B12").alignment={wrapText:true,vertical:"top"};

  var kpiStart=16;
  var kpis=[
    ["Índice de desempeño",analysis.score+"%",analysis.scoreState.label],
    ["Total cargado",m.totalLoaded||app.cases.length||0,"Pedidos disponibles"],
    ["Trazados VSM",m.cases||0,"Pedidos calculables"],
    ["WIP actual",m.wip||0,(m.lateWip||0)+" fuera de meta"],
    ["Cerrados",m.closed||0,"Throughput "+(m.throughput||0)+"/día"],
    ["LT P50",v234MsHours(m.leadP50||0),"Horas; P90 "+v234MsHours(m.leadP90||0)],
    ["Confiabilidad",Number(r.avg||0)+"%",Number(r.low||0)+" críticos"],
    ["No entregas",m.noDeliveryCount||0,"Filtro actual"]
  ];
  kpis.forEach(function(k,i){
    var row=kpiStart+Math.floor(i/4)*4,col=1+(i%4)*2;
    summary.mergeCells(row,col,row+2,col+1);
    var cell=summary.getCell(row,col);
    cell.value={richText:[
      {text:k[0]+"\n",font:{bold:true,size:9,color:{argb:"FF64748B"}}},
      {text:String(k[1])+"\n",font:{bold:true,size:18,color:{argb:"FF061B46"}}},
      {text:String(k[2]),font:{size:8,color:{argb:"FF64748B"}}}
    ]};
    cell.alignment={vertical:"middle",horizontal:"left",wrapText:true};
    cell.fill={type:"pattern",pattern:"solid",fgColor:{argb:"FFF8FAFC"}};
    cell.border={
      top:{style:"thin",color:{argb:"FFD8E2EF"}},left:{style:"thin",color:{argb:"FFD8E2EF"}},
      bottom:{style:"thin",color:{argb:"FFD8E2EF"}},right:{style:"thin",color:{argb:"FFD8E2EF"}}
    };
  });

  var rowNum=25;
  summary.getCell("A"+rowNum).value="Hallazgos analíticos";
  summary.getCell("A"+rowNum).font={bold:true,size:14,color:{argb:"FF061B46"}};
  rowNum++;
  analysis.findings.forEach(function(f){
    summary.mergeCells(rowNum,1,rowNum,8);
    summary.getCell(rowNum,1).value="• "+f;
    summary.getCell(rowNum,1).alignment={wrapText:true,vertical:"top"};
    rowNum++;
  });
  rowNum+=1;
  summary.getCell("A"+rowNum).value="Recomendaciones";
  summary.getCell("A"+rowNum).font={bold:true,size:14,color:{argb:"FF061B46"}};
  rowNum++;
  analysis.recommendations.forEach(function(f){
    summary.mergeCells(rowNum,1,rowNum,8);
    summary.getCell(rowNum,1).value="• "+f;
    summary.getCell(rowNum,1).alignment={wrapText:true,vertical:"top"};
    rowNum++;
  });
  summary.columns=[{width:22},{width:26},{width:18},{width:18},{width:18},{width:18},{width:18},{width:18}];

  // Procesos.
  var processSheet=v234ExcelSheet(
    workbook,"Procesos","Desempeño por proceso",meta.scope,
    ["Proceso","Casos","WIP","Atrasados","LT promedio (h)","P50 (h)","P90 (h)","Trabajo directo (h)","Bloqueo (h)","Cumplimiento (%)"],
    analysis.processes.map(function(x){
      return [
        x.label,Number(x.cases||0),Number(x.wip||0),Number(x.wipLate||0),
        v234MsHours(x.avg||0),v234MsHours(x.p50||0),v234MsHours(x.p90||0),
        v234MsHours(x.cases?x.active/x.cases:0),v234MsHours(x.cases?x.wait/x.cases:0),
        Number(x.slaPct||0)
      ];
    })
  );
  var processChart=v234CanvasChart(
    "Lead Time promedio por proceso",
    analysis.processes.slice().sort(function(a,b){return Number(b.avg||0)-Number(a.avg||0);}),
    function(x){return Number(x.avg||0);},function(x){return x.label;},
    function(x){return v225Time(x.avg||0);}
  );
  v234ExcelAddImage(workbook,processSheet,processChart,{tl:{col:0,row:processSheet.rowCount+2},ext:{width:760,height:420}});

  // Áreas.
  var areaSheet=v234ExcelSheet(
    workbook,"Áreas","Desempeño por área",meta.scope,
    ["Área","Casos","Intervenciones","WIP / abiertas","Cerrados","LT promedio (h)","Trabajo directo (h)","Bloqueo / espera (h)","Cumplimiento (%)","Confiabilidad (%)","No entregas","Actores"],
    analysis.areas.map(function(x){
      return [
        x.label,Number(x.cases||0),x.area==="ventas"?Number(x.interventions||0):"",
        Number(x.wip||0),Number(x.closed||0),v234MsHours(x.avg||0),v234MsHours(x.work||0),
        v234MsHours(x.block||0),Number(x.compliance||0),Number(x.reliability||0),
        Number(x.noDeliveries||0),Number(x.workers||0)
      ];
    })
  );
  var areaChart=v234CanvasChart(
    "Cumplimiento por área",
    analysis.areas.slice().sort(function(a,b){return Number(a.compliance||0)-Number(b.compliance||0);}),
    function(x){return Number(x.compliance||0);},function(x){return x.label;},
    function(x){return Number(x.compliance||0)+"%";},
    function(x){return x.compliance>=85?"ok":(x.compliance>=65?"warn":"bad");}
  );
  v234ExcelAddImage(workbook,areaSheet,areaChart,{tl:{col:0,row:areaSheet.rowCount+2},ext:{width:760,height:420}});

  // Actores.
  if(meta.includeActors){
    var actorSheet=v234ExcelSheet(
      workbook,"Actores","Productividad por actor","Super Admin excluido de todas las mediciones.",
      ["Actor","Rol","Casos","WIP","Cerrados","Trabajo directo (h)","Promedio directo (h)","Cumplimiento (%)","Carga directa (%)","Procesos"],
      analysis.actors.map(function(x){
        return [
          x.user,roleTitle(x.role),Number(x.count||0),Number(x.open||0),Number(x.closed||0),
          v234MsHours(x.active||0),v234MsHours(x.directPerCase||0),Number(x.compliance||0),
          Number(x.directLoadPct||0),x.processList||""
        ];
      })
    );
    var actorChart=v234CanvasChart(
      "Trabajo directo trazado por actor",
      analysis.actors.slice().sort(function(a,b){return Number(b.active||0)-Number(a.active||0);}),
      function(x){return Number(x.active||0);},function(x){return x.user;},
      function(x){return v225Time(x.active||0);}
    );
    v234ExcelAddImage(workbook,actorSheet,actorChart,{tl:{col:0,row:actorSheet.rowCount+2},ext:{width:760,height:460}});
  }

  // Esperas.
  if(meta.includeWaits){
    var waitsSheet=v234ExcelSheet(
      workbook,"Esperas","Novedades, reprocesos y no entregas",meta.scope,
      ["Pedido","Categoría","Área","Proceso","Inicio","Fin / corte","Duración (h)","Abierto","Origen del cálculo","Detalle"],
      (w.all||[]).map(function(x){
        return [
          x.pedido,x.category,v225AreaLabel(x.area),processTitle(x.process),
          x.start?new Date(x.start):"",x.end?new Date(x.end):"",
          v234MsHours(x.duration||0),x.open?"Sí":"No",x.source,x.detail
        ];
      })
    );
    waitsSheet.getColumn(5).numFmt="dd/mm/yyyy hh:mm";
    waitsSheet.getColumn(6).numFmt="dd/mm/yyyy hh:mm";
    var waitsChart=v234CanvasChart(
      "Tiempos especiales de espera",
      [
        {label:"Novedades",value:w.novelty||0,cls:"warn"},
        {label:"Reprocesos",value:w.rework||0,cls:"bad"},
        {label:"No entregas",value:w.noDelivery||0,cls:"warn"}
      ],
      function(x){return x.value;},function(x){return x.label;},
      function(x){return v225Time(x.value);},function(x){return x.cls;}
    );
    v234ExcelAddImage(workbook,waitsSheet,waitsChart,{tl:{col:0,row:waitsSheet.rowCount+2},ext:{width:760,height:320}});
  }

  // Alertas.
  if(meta.includeAlerts){
    v234ExcelSheet(
      workbook,"Alertas","Alertas y riesgos prioritarios",meta.scope,
      ["Prioridad","Pedido","Proceso","Hallazgo","Acción sugerida"],
      (m.alertRows||[]).map(function(x){
        return [x.severity==="bad"?"Alta":"Media",x.pedido||"",x.proceso||"",x.detalle||"",x.accion||""];
      })
    );
  }

  // Plan de acción.
  if(meta.includeActionPlan){
    v234ExcelSheet(
      workbook,"Plan de acción","Plan de acción propuesto","Generado automáticamente a partir de los resultados del tablero.",
      ["Prioridad","Situación","Acción","Responsable sugerido","Meta","Estado","Fecha compromiso","Observaciones"],
      analysis.actions.map(function(x){return [x.priority,x.issue,x.action,x.owner,x.target,"Pendiente","",""];})
    );
  }

  // Pedidos críticos.
  if(meta.includeOrders){
    v234ExcelSheet(
      workbook,"Pedidos críticos","Anexo de pedidos críticos",meta.scope,
      ["Pedido","OC","Cliente","Proceso","Responsable","Tiempo en proceso (h)","Meta (h)","Estado","Bloqueo","Próxima acción","Lead Time total (h)"],
      (m.wipRows||[]).map(function(x){
        return [
          x.pedido,x.oc,x.cliente,x.processLabel,x.responsable,
          v234MsHours(x.age||0),Number(x.slaHours||0),x.late?"Fuera de meta":"Dentro de meta",
          x.blocker||"",x.next||"",v234MsHours(x.lead||0)
        ];
      })
    );
  }

  // Metodología.
  if(meta.includeMethodology){
    v234ExcelSheet(
      workbook,"Metodología","Metodología, fórmulas y fuentes","Criterios aplicados por el VSM.",
      ["Elemento","Criterio aplicado"],
      [
        ["Jornada laboral","07:00–12:00 y 13:40–17:30; se excluyen sábados, domingos y festivos colombianos cargados."],
        ["Lead Time","Tiempo laboral desde el inicio del pedido o etapa hasta su cierre o corte de análisis."],
        ["P50 / P90","P50 es la mediana; P90 representa el tiempo bajo el cual termina el 90% de los casos."],
        ["Trabajo directo","Actividad registrada o inferida mediante eventos operativos; el Super Admin está excluido."],
        ["Reproceso","Exceso sobre la meta cuando el pedido regresa a una etapa anterior por corrección, diferencia, rechazo o no conformidad."],
        ["No entrega","Desde noDelivery, noDeliveryReports, requirementType=no_entrega o NO_DELIVERY_* hasta solución o cierre."],
        ["Índice compuesto","30% cumplimiento, 25% confiabilidad, 20% WIP en meta, 10% cobertura, 7,5% no entregas y 7,5% reprocesos."],
        ["Fuentes","cases, case_events, reportes_novedad, processStats, requirements, openRequirement, noDeliveryReports, stateHistory y flowTrace."]
      ]
    );
  }

  // Conclusiones.
  v234ExcelSheet(
    workbook,"Conclusiones","Conclusiones y recomendaciones",meta.scope,
    ["Tipo","Contenido"],
    [
      ["Conclusión general",v234PdfConclusion(analysis)]
    ].concat(
      analysis.findings.map(function(x){return ["Hallazgo",x];}),
      analysis.recommendations.map(function(x){return ["Recomendación",x];})
    )
  );

  workbook.eachSheet(function(sheet){
    sheet.pageSetup={orientation:"landscape",fitToPage:true,fitToWidth:1,fitToHeight:0,paperSize:9};
    sheet.headerFooter={
      oddHeader:"&CElectroingeniería · "+meta.title,
      oddFooter:"&L"+meta.author+" · "+meta.department+"&RPage &P of &N"
    };
  });

  var buffer=await workbook.xlsx.writeBuffer();
  var blob=new Blob([buffer],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
  v234DownloadBlob(blob,v232FileName(meta,"xlsx"));
}
async function v232GenerateReport(meta){
  if(!app.metrics)await refresh();
  var analysis=v232Analyze(meta);
  loading(true,"Construyendo texto, tablas, gráficas, conclusiones y plan de acción...");
  try{
    if(meta.format==="excel")v232GenerateExcel(meta,analysis);
    else if(meta.format==="pdf")await v232GeneratePdf(meta,analysis);
    else{
      v232GenerateExcel(meta,analysis);
      await sleep(350);
      await v232GeneratePdf(meta,analysis);
    }
    v232CloseReportModal();
    status("Informe inteligente generado correctamente para "+analysis.m.cases+" pedido(s) trazados.","ok");
  }finally{
    loading(false);
  }
}
function bind(){
  bindV232Base();

  var openButton=$("btnSmartReport");
  var closeButton=$("btnCloseSmartReport");
  var cancelButton=$("btnCancelSmartReport");
  var modal=$("smartReportModal");
  var form=$("smartReportForm");

  if(openButton)openButton.onclick=v232OpenReportModal;
  if(closeButton)closeButton.onclick=v232CloseReportModal;
  if(cancelButton)cancelButton.onclick=v232CloseReportModal;

  if(modal){
    modal.addEventListener("click",function(e){
      if(e.target===modal)v232CloseReportModal();
    });
  }

  document.addEventListener("keydown",function(e){
    var currentModal=$("smartReportModal");
    if(e.key==="Escape"&&currentModal&&currentModal.classList.contains("show")){
      v232CloseReportModal();
    }
  });

  if(form){
    form.addEventListener("submit",function(e){
      e.preventDefault();
      try{
        var meta=v232CollectMeta();
        v232GenerateReport(meta).catch(function(err){
          loading(false);
          status("Error generando informe: "+esc(err.message||err),"bad");
        });
      }catch(err){
        status("No se pudo generar el informe: "+esc(err.message||err),"bad");
      }
    });
  }else{
    console.warn("[V233] El formulario del generador no está disponible; el VSM continúa funcionando.");
  }
}


/* ============================================================
   V235 · INFORME GRÁFICO, ANALÍTICO Y GERENCIAL
============================================================ */
function v235Clamp(v,min,max){return Math.max(min,Math.min(max,v));}
function v235Percent(a,b){return b>0?Math.round((a/b)*100):0;}
function v235PctChange(current,previous){
  if(!previous)return current?100:0;
  return Math.round(((current-previous)/Math.abs(previous))*100);
}
function v235Median(values){
  values=(values||[]).filter(isFinite).sort(function(a,b){return a-b;});
  if(!values.length)return 0;
  var mid=Math.floor(values.length/2);
  return values.length%2?values[mid]:(values[mid-1]+values[mid])/2;
}
function v235HealthScoreProcess(p){
  var compliance=Number(p.slaPct||0);
  var eff=Number(p.eff||0);
  var wipOnTime=p.wip?Math.max(0,100-(Number(p.wipLate||0)/p.wip*100)):100;
  var stability=p.p90?Math.max(0,100-Math.min(100,((p.p90-p.p50)/Math.max(1,p.p50))*50)):100;
  return Math.round(v235Clamp(compliance*.45+eff*.20+wipOnTime*.25+stability*.10,0,100));
}
function v235HealthScoreArea(a){
  var compliance=Number(a.compliance||0);
  var reliability=Number(a.reliability||0);
  var wipScore=a.cases?Math.max(0,100-(Number(a.wip||0)/Math.max(1,a.cases)*100)):100;
  var noDeliveryScore=a.cases?Math.max(0,100-(Number(a.noDeliveries||0)/Math.max(1,a.cases)*100)):100;
  return Math.round(v235Clamp(compliance*.45+reliability*.30+wipScore*.15+noDeliveryScore*.10,0,100));
}
function v235Status(score){
  if(score>=85)return {label:"Controlado",cls:"ok",color:[15,159,110]};
  if(score>=70)return {label:"En observación",cls:"warn",color:[217,119,6]};
  return {label:"Prioritario",cls:"bad",color:[220,38,38]};
}
function v235AnalysisWindow(m){
  var closed=(m.caseRows||[]).filter(function(x){return x.closed&&isFinite(x.end);});
  var times=closed.map(function(x){return x.end;}).sort(function(a,b){return a-b;});
  if(times.length<4)return null;
  var split=times[Math.floor(times.length/2)];
  var previous=closed.filter(function(x){return x.end<=split;});
  var recent=closed.filter(function(x){return x.end>split;});
  function group(rows){
    return {
      cases:rows.length,
      avgLt:v232Average(rows.map(function(x){return x.lead||0;})),
      p50:v235Median(rows.map(function(x){return x.lead||0;})),
      work:v232Average(rows.map(function(x){return x.va||0;}))
    };
  }
  return {split:split,previous:group(previous),recent:group(recent)};
}
function v235CauseLabel(text){
  text=lower(text||"");
  if(/no entrega|no_entrega|no-delivery/.test(text))return "No entrega";
  if(/reproceso|retrabajo|correcci|devuelt|regres|rechaz|no conforme/.test(text))return "Reproceso / corrección";
  if(/pago|cartera|caja|financier|retenci/.test(text))return "Pago / Cartera";
  if(/corte|cable|medida/.test(text))return "Corte de cable";
  if(/cliente|confirmaci|información cliente/.test(text))return "Cliente / información";
  if(/transport|gu[ií]a|despacho|entrega/.test(text))return "Despacho / transportadora";
  if(/document|factur|soporte|archivo/.test(text))return "Documentación";
  if(/requer|novedad|pendiente/.test(text))return "Requerimiento / novedad";
  return "Otros";
}
function v235BuildPareto(m){
  var map={};
  function add(label,value,count){
    if(!map[label])map[label]={label:label,value:0,count:0};
    map[label].value+=Number(value||0);
    map[label].count+=Number(count||1);
  }
  var w=m.specialWait||{};
  (w.all||[]).forEach(function(x){add(v235CauseLabel([x.category,x.detail,x.source].join(" ")),x.duration,1);});
  (m.wipRows||[]).forEach(function(x){
    if(x.blocker&&x.blocker!=="Sin bloqueo explícito")add(v235CauseLabel(x.blocker),x.age||0,1);
  });
  return Object.keys(map).map(function(k){return map[k];}).sort(function(a,b){return b.value-a.value;}).slice(0,10);
}
function v235BuildRisks(m,processes,areas){
  var risks=[];
  processes.forEach(function(p){
    var probability=p.wip?Math.ceil(v235Clamp((Number(p.wipLate||0)/Math.max(1,p.wip))*3,1,3)):(p.slaPct<70?2:1);
    var impact=p.avg>(m.leadP50||0)?3:(p.avg>(m.leadP50||0)*.6?2:1);
    var score=probability*impact;
    if(score>=4||p.slaPct<70||p.wipLate>0){
      risks.push({
        risk:"Desviación en "+p.label,
        source:"Proceso",
        probability:probability,impact:impact,score:score,
        level:score>=7?"Alto":(score>=4?"Medio":"Bajo"),
        evidence:"Cumplimiento "+Number(p.slaPct||0)+"% · WIP atrasado "+Number(p.wipLate||0)+" · LT "+v225Time(p.avg||0),
        treatment:"Revisar carga, causas de espera, responsables y meta del proceso."
      });
    }
  });
  areas.forEach(function(a){
    if(a.reliability<80){
      risks.push({
        risk:"Trazabilidad insuficiente en "+a.label,source:"Área",
        probability:3,impact:2,score:6,level:"Medio",
        evidence:"Confiabilidad "+Number(a.reliability||0)+"%",
        treatment:"Completar fechas, responsables, estados y evidencias obligatorias."
      });
    }
    if(Number(a.noDeliveries||0)>0){
      risks.push({
        risk:"No entregas en "+a.label,source:"Área",
        probability:Math.min(3,Math.max(1,Number(a.noDeliveries||0))),
        impact:3,score:Math.min(9,Math.max(3,Number(a.noDeliveries||0)*3)),
        level:Number(a.noDeliveries||0)>=3?"Alto":"Medio",
        evidence:Number(a.noDeliveries||0)+" pedido(s) identificado(s)",
        treatment:"Clasificar causa, asignar responsable y cerrar la trazabilidad de la no entrega."
      });
    }
  });
  return risks.sort(function(a,b){return b.score-a.score;}).slice(0,20);
}
function v235BuildDecisionCards(analysis){
  var m=analysis.m,decisions=[];
  if(analysis.highestWip&&analysis.highestWip.label){
    decisions.push({
      title:"Controlar el WIP",
      signal:Number(analysis.highestWip.wip||0)+" casos en "+analysis.highestWip.label,
      decision:"Priorizar los vencidos y limitar nuevas asignaciones hasta estabilizar la carga.",
      owner:v225AreaLabel(v225AreaForProcess(analysis.highestWip.process))||"Operaciones"
    });
  }
  if(analysis.lowestCompliance&&analysis.lowestCompliance.label){
    decisions.push({
      title:"Recuperar cumplimiento",
      signal:Number(analysis.lowestCompliance.slaPct||0)+"% en "+analysis.lowestCompliance.label,
      decision:"Revisar estándar, secuencia, bloqueos y capacidad antes del próximo corte.",
      owner:v225AreaLabel(v225AreaForProcess(analysis.lowestCompliance.process))||"Líder del proceso"
    });
  }
  if((m.reliability||{}).avg<90){
    decisions.push({
      title:"Asegurar el dato",
      signal:Number((m.reliability||{}).avg||0)+"% de confiabilidad",
      decision:"No permitir cierres sin responsable, fecha, estado y proceso claramente registrados.",
      owner:"Calidad / Sistemas"
    });
  }
  if(Number(m.noDeliveryCount||0)>0){
    decisions.push({
      title:"Reducir no entregas",
      signal:Number(m.noDeliveryCount||0)+" pedidos",
      decision:"Aplicar Pareto de causas y seguimiento hasta cierre confirmado.",
      owner:"Despacho / Cartera"
    });
  }
  if(m.specialWait&&m.specialWait.rework>0){
    decisions.push({
      title:"Eliminar reprocesos recurrentes",
      signal:v225Time(m.specialWait.rework)+" fuera de meta",
      decision:"Identificar reincidencias por área de origen y establecer acción correctiva.",
      owner:"Calidad / Área responsable"
    });
  }
  return decisions.slice(0,6);
}
function v235ExecutiveSignals(analysis){
  var m=analysis.m,r=m.reliability||{},w=m.specialWait||{};
  var processCompliance=v232Average(analysis.processes.map(function(x){return Number(x.slaPct||0);}));
  return [
    {label:"Desempeño general",value:analysis.score,suffix:"%",status:v235Status(analysis.score)},
    {label:"Cumplimiento procesos",value:Math.round(processCompliance),suffix:"%",status:v235Status(processCompliance)},
    {label:"Confiabilidad",value:Number(r.avg||0),suffix:"%",status:v235Status(Number(r.avg||0))},
    {label:"WIP dentro de meta",value:m.wip?Math.round(100-Number(m.lateWip||0)/m.wip*100):100,suffix:"%",status:v235Status(m.wip?100-Number(m.lateWip||0)/m.wip*100:100)},
    {label:"Cobertura trazada",value:v235Percent(m.cases,Math.max(1,m.totalLoaded||m.cases)),suffix:"%",status:v235Status(v235Percent(m.cases,Math.max(1,m.totalLoaded||m.cases)))},
    {label:"No entregas",value:Number(m.noDeliveryCount||0),suffix:"",status:Number(m.noDeliveryCount||0)===0?v235Status(100):(Number(m.noDeliveryCount||0)<=2?v235Status(75):v235Status(50))}
  ];
}
function v232Analyze(meta){
  var analysis=v232AnalyzeV235Base(meta);
  var m=analysis.m;
  analysis.processHealth=analysis.processes.map(function(p){
    return Object.assign({},p,{health:v235HealthScoreProcess(p),healthStatus:v235Status(v235HealthScoreProcess(p))});
  }).sort(function(a,b){return a.health-b.health;});
  analysis.areaHealth=analysis.areas.map(function(a){
    return Object.assign({},a,{health:v235HealthScoreArea(a),healthStatus:v235Status(v235HealthScoreArea(a))});
  }).sort(function(a,b){return a.health-b.health;});
  analysis.comparison=v235AnalysisWindow(m);
  analysis.pareto=v235BuildPareto(m);
  analysis.risks=v235BuildRisks(m,analysis.processes,analysis.areas);
  analysis.decisions=v235BuildDecisionCards(analysis);
  analysis.signals=v235ExecutiveSignals(analysis);
  analysis.strengths=[];
  var bestProcess=analysis.processes.slice().sort(function(a,b){return Number(b.slaPct||0)-Number(a.slaPct||0);})[0];
  var bestArea=analysis.areas.slice().sort(function(a,b){return Number(b.reliability||0)-Number(a.reliability||0);})[0];
  if(bestProcess&&bestProcess.label)analysis.strengths.push(bestProcess.label+" presenta el mayor cumplimiento con "+Number(bestProcess.slaPct||0)+"%.");
  if(bestArea&&bestArea.label)analysis.strengths.push(bestArea.label+" presenta la mejor confiabilidad de registro con "+Number(bestArea.reliability||0)+"%.");
  if(Number((m.reliability||{}).high||0)>0)analysis.strengths.push(Number((m.reliability||{}).high||0)+" pedidos cuentan con trazabilidad igual o superior al 90%.");
  if(!analysis.strengths.length)analysis.strengths.push("No existen fortalezas cuantificables suficientes con los filtros actuales; se recomienda ampliar la muestra.");
  analysis.managementQuestions=[
    "¿Qué causas explican la mayor parte del WIP fuera de meta?",
    "¿La meta del proceso crítico refleja el trabajo real o necesita recalibración?",
    "¿Los responsables reciben las novedades con tiempo suficiente para responder?",
    "¿Qué reprocesos se repiten y en qué área se originan?",
    "¿Las no entregas se concentran por cliente, transportadora, documentación o preparación?"
  ];
  return analysis;
}

/* ---------- GRÁFICOS PDF ---------- */
function v235PdfGauge(doc,state,score,label){
  v234PdfEnsure(doc,state,150,state.section);
  var cx=state.margin+82,cy=state.y+78,r=52;
  doc.setDrawColor(226,232,240);
  doc.setLineWidth(12);
  doc.circle(cx,cy,r,"S");
  var color=v235Status(score).color;
  doc.setDrawColor(color[0],color[1],color[2]);
  doc.setLineWidth(12);
  var segments=40,filled=Math.round(segments*v235Clamp(score,0,100)/100);
  for(var i=0;i<filled;i++){
    var a1=(-90+i*360/segments)*Math.PI/180;
    var a2=(-90+(i+0.72)*360/segments)*Math.PI/180;
    doc.line(cx+Math.cos(a1)*r,cy+Math.sin(a1)*r,cx+Math.cos(a2)*r,cy+Math.sin(a2)*r);
  }
  doc.setTextColor(6,27,70);doc.setFont("helvetica","bold");doc.setFontSize(24);
  doc.text(String(score)+"%",cx,cy+7,{align:"center"});
  doc.setFontSize(9);doc.setTextColor(71,85,105);
  doc.text(label,cx,cy+26,{align:"center"});
}
function v235PdfSignals(doc,state,signals){
  var x=state.margin+175,y=state.y,w=state.contentWidth-175,cols=2,gap=8,cardW=(w-gap)/2,cardH=43;
  (signals||[]).slice(0,6).forEach(function(s,i){
    var col=i%cols,row=Math.floor(i/cols),xx=x+col*(cardW+gap),yy=y+row*(cardH+7);
    var c=s.status.color;
    doc.setFillColor(248,250,252);doc.setDrawColor(216,226,239);
    doc.roundedRect(xx,yy,cardW,cardH,6,6,"FD");
    doc.setFillColor(c[0],c[1],c[2]);doc.roundedRect(xx,yy,5,cardH,3,3,"F");
    doc.setTextColor(100,116,139);doc.setFont("helvetica","bold");doc.setFontSize(7);
    doc.text(s.label,xx+12,yy+13);
    doc.setTextColor(6,27,70);doc.setFontSize(14);
    doc.text(String(s.value)+s.suffix,xx+12,yy+31);
    doc.setFontSize(7);doc.setTextColor(c[0],c[1],c[2]);
    doc.text(s.status.label,xx+cardW-8,yy+31,{align:"right"});
  });
  state.y+=150;
}
function v235PdfLineChart(doc,state,title,rows,labelFn,valueFn,displayFn){
  rows=(rows||[]).slice(-20);
  var h=190;
  v234PdfEnsure(doc,state,h+15,state.section);
  var x=state.margin,y=state.y,w=state.contentWidth;
  doc.setFillColor(255,255,255);doc.setDrawColor(216,226,239);doc.roundedRect(x,y,w,h,8,8,"FD");
  doc.setFont("helvetica","bold");doc.setFontSize(10);doc.setTextColor(6,27,70);doc.text(title,x+12,y+20);
  var px=x+45,py=y+42,pw=w-70,ph=h-72;
  var vals=rows.map(function(r){return Number(valueFn(r))||0;});
  var max=Math.max.apply(Math,[1].concat(vals)),min=Math.min.apply(Math,[0].concat(vals));
  doc.setDrawColor(226,232,240);doc.setLineWidth(.5);
  for(var g=0;g<=4;g++){var gy=py+ph*g/4;doc.line(px,gy,px+pw,gy);}
  if(rows.length>1){
    doc.setDrawColor(37,99,235);doc.setLineWidth(2);
    for(var i=1;i<rows.length;i++){
      var x1=px+(i-1)*pw/(rows.length-1),x2=px+i*pw/(rows.length-1);
      var y1=py+ph-(vals[i-1]-min)/(max-min||1)*ph,y2=py+ph-(vals[i]-min)/(max-min||1)*ph;
      doc.line(x1,y1,x2,y2);
    }
    rows.forEach(function(r,i){
      var xx=px+i*pw/(rows.length-1),yy=py+ph-(vals[i]-min)/(max-min||1)*ph;
      doc.setFillColor(242,183,5);doc.circle(xx,yy,3,"F");
      if(i===0||i===rows.length-1||i%Math.max(1,Math.floor(rows.length/5))===0){
        doc.setFontSize(6.5);doc.setTextColor(100,116,139);
        doc.text(String(labelFn(r)).slice(5),xx,py+ph+15,{align:"center"});
      }
    });
  }else{
    doc.setFont("helvetica","normal");doc.setFontSize(9);doc.setTextColor(100,116,139);
    doc.text("No hay suficientes puntos para construir la tendencia.",x+w/2,y+h/2,{align:"center"});
  }
  doc.setFont("helvetica","bold");doc.setFontSize(7);doc.setTextColor(6,27,70);
  if(rows.length)doc.text(displayFn(rows[rows.length-1]),x+w-12,y+20,{align:"right"});
  state.y+=h+12;
}
function v235PdfDonut(doc,state,title,rows,labelFn,valueFn){
  var h=180;
  v234PdfEnsure(doc,state,h+12,state.section);
  var x=state.margin,y=state.y,w=state.contentWidth;
  doc.setFillColor(255,255,255);doc.setDrawColor(216,226,239);doc.roundedRect(x,y,w,h,8,8,"FD");
  doc.setFont("helvetica","bold");doc.setFontSize(10);doc.setTextColor(6,27,70);doc.text(title,x+12,y+20);
  var total=rows.reduce(function(s,r){return s+(Number(valueFn(r))||0);},0);
  var cx=x+105,cy=y+99,r=52,colors=[[37,99,235],[15,159,110],[242,183,5],[217,119,6],[124,58,237],[220,38,38]];
  var start=-90;
  rows.forEach(function(row,i){
    var value=Number(valueFn(row))||0,angle=total?value/total*360:0;
    doc.setDrawColor(colors[i%colors.length][0],colors[i%colors.length][1],colors[i%colors.length][2]);
    doc.setLineWidth(18);
    var steps=Math.max(1,Math.round(angle/5));
    for(var s=0;s<steps;s++){
      var a1=(start+s*angle/steps)*Math.PI/180,a2=(start+(s+.75)*angle/steps)*Math.PI/180;
      doc.line(cx+Math.cos(a1)*r,cy+Math.sin(a1)*r,cx+Math.cos(a2)*r,cy+Math.sin(a2)*r);
    }
    start+=angle;
  });
  doc.setTextColor(6,27,70);doc.setFont("helvetica","bold");doc.setFontSize(13);
  doc.text(String(rows.reduce(function(s,r){return s+(Number(r.count)||Number(valueFn(r))||0);},0)),cx,cy+4,{align:"center"});
  doc.setFontSize(7);doc.setTextColor(100,116,139);doc.text("TOTAL",cx,cy+16,{align:"center"});
  rows.slice(0,6).forEach(function(row,i){
    var yy=y+47+i*19,c=colors[i%colors.length];
    doc.setFillColor(c[0],c[1],c[2]);doc.circle(x+210,yy-3,4,"F");
    doc.setFont("helvetica","normal");doc.setFontSize(7.5);doc.setTextColor(51,65,85);
    doc.text(String(labelFn(row)).slice(0,32),x+220,yy);
    doc.setFont("helvetica","bold");doc.setTextColor(6,27,70);
    doc.text(v225Time(Number(valueFn(row))||0),x+w-12,yy,{align:"right"});
  });
  state.y+=h+12;
}
function v235PdfQuadrant(doc,state,title,rows){
  var h=225;
  v234PdfEnsure(doc,state,h+12,state.section);
  var x=state.margin,y=state.y,w=state.contentWidth;
  doc.setFillColor(255,255,255);doc.setDrawColor(216,226,239);doc.roundedRect(x,y,w,h,8,8,"FD");
  doc.setFont("helvetica","bold");doc.setFontSize(10);doc.setTextColor(6,27,70);doc.text(title,x+12,y+20);
  var px=x+55,py=y+43,pw=w-85,ph=h-78;
  doc.setFillColor(236,253,245);doc.rect(px+pw/2,py,pw/2,ph/2,"F");
  doc.setFillColor(255,247,237);doc.rect(px,py,pw/2,ph/2,"F");
  doc.setFillColor(254,242,242);doc.rect(px,py+ph/2,pw/2,ph/2,"F");
  doc.setFillColor(239,246,255);doc.rect(px+pw/2,py+ph/2,pw/2,ph/2,"F");
  doc.setDrawColor(148,163,184);doc.line(px+pw/2,py,px+pw/2,py+ph);doc.line(px,py+ph/2,px+pw,py+ph/2);
  var maxLt=Math.max.apply(Math,[1].concat(rows.map(function(r){return Number(r.avg)||0;})));
  rows.slice(0,14).forEach(function(r,i){
    var xx=px+v235Clamp((Number(r.avg||0)/maxLt)*pw,0,pw);
    var yy=py+ph-v235Clamp(Number(r.slaPct||0)/100*ph,0,ph);
    var st=v235Status(v235HealthScoreProcess(r)),c=st.color;
    doc.setFillColor(c[0],c[1],c[2]);doc.circle(xx,yy,Math.max(3,Math.min(8,3+Number(r.wip||0))),"F");
    doc.setFont("helvetica","bold");doc.setFontSize(5.8);doc.setTextColor(51,65,85);
    doc.text(String(r.label||"").slice(0,15),xx+5,yy-4);
  });
  doc.setFont("helvetica","normal");doc.setFontSize(6.5);doc.setTextColor(100,116,139);
  doc.text("Menor LT",px,py+ph+15);doc.text("Mayor LT",px+pw,py+ph+15,{align:"right"});
  doc.text("100% cumplimiento",px-8,py,{align:"right"});doc.text("0%",px-8,py+ph,{align:"right"});
  state.y+=h+12;
}
function v235PdfRiskMatrix(doc,state,risks){
  var h=235;
  v234PdfEnsure(doc,state,h+12,state.section);
  var x=state.margin,y=state.y,w=state.contentWidth;
  doc.setFillColor(255,255,255);doc.setDrawColor(216,226,239);doc.roundedRect(x,y,w,h,8,8,"FD");
  doc.setFont("helvetica","bold");doc.setFontSize(10);doc.setTextColor(6,27,70);doc.text("Matriz de riesgos operativos",x+12,y+20);
  var size=150,gx=x+45,gy=y+45,cell=size/3;
  var matrixColors=[
    [[236,253,245],[236,253,245],[255,247,237]],
    [[236,253,245],[255,247,237],[254,226,226]],
    [[255,247,237],[254,226,226],[254,226,226]]
  ];
  for(var impact=1;impact<=3;impact++){
    for(var prob=1;prob<=3;prob++){
      var c=matrixColors[impact-1][prob-1],xx=gx+(prob-1)*cell,yy=gy+(3-impact)*cell;
      doc.setFillColor(c[0],c[1],c[2]);doc.setDrawColor(203,213,225);doc.rect(xx,yy,cell,cell,"FD");
    }
  }
  var grouped={};
  (risks||[]).forEach(function(r){
    var key=r.probability+"|"+r.impact;
    if(!grouped[key])grouped[key]=[];
    grouped[key].push(r);
  });
  Object.keys(grouped).forEach(function(key){
    var parts=key.split("|"),prob=Number(parts[0]),impact=Number(parts[1]);
    var xx=gx+(prob-.5)*cell,yy=gy+(3-impact+.5)*cell;
    var list=grouped[key];
    doc.setFillColor(6,27,70);doc.circle(xx,yy,10,"F");
    doc.setTextColor(255,255,255);doc.setFont("helvetica","bold");doc.setFontSize(8);
    doc.text(String(list.length),xx,yy+3,{align:"center"});
  });
  doc.setFont("helvetica","normal");doc.setFontSize(7);doc.setTextColor(71,85,105);
  doc.text("Probabilidad →",gx+size/2,gy+size+17,{align:"center"});
  doc.text("Impacto",gx-27,gy+size/2,{angle:90,align:"center"});
  var top=(risks||[]).slice(0,6);
  top.forEach(function(r,i){
    var yy=y+47+i*27,xx=x+235;
    var c=r.level==="Alto"?[220,38,38]:(r.level==="Medio"?[217,119,6]:[15,159,110]);
    doc.setFillColor(c[0],c[1],c[2]);doc.roundedRect(xx,yy,45,15,5,5,"F");
    doc.setTextColor(255,255,255);doc.setFont("helvetica","bold");doc.setFontSize(6.5);doc.text(r.level,xx+22.5,yy+10,{align:"center"});
    doc.setTextColor(6,27,70);doc.setFontSize(7);doc.text(String(r.risk).slice(0,38),xx+54,yy+10);
    doc.setTextColor(100,116,139);doc.setFont("helvetica","normal");doc.setFontSize(6);
    doc.text(String(r.evidence).slice(0,55),xx+54,yy+21);
  });
  state.y+=h+12;
}
function v235PdfDecisionCards(doc,state,decisions){
  (decisions||[]).forEach(function(d,i){
    v234PdfEnsure(doc,state,78,state.section);
    var x=state.margin,y=state.y,w=state.contentWidth;
    doc.setFillColor(i%2===0?248:255,250,252);doc.setDrawColor(216,226,239);doc.roundedRect(x,y,w,65,7,7,"FD");
    doc.setFillColor(242,183,5);doc.roundedRect(x,y,7,65,3,3,"F");
    doc.setTextColor(6,27,70);doc.setFont("helvetica","bold");doc.setFontSize(10);
    doc.text(d.title,x+16,y+16);
    doc.setFontSize(7);doc.setTextColor(100,116,139);doc.text("SEÑAL: "+d.signal,x+16,y+30);
    doc.setTextColor(51,65,85);doc.setFont("helvetica","normal");doc.setFontSize(8);
    doc.text(doc.splitTextToSize(d.decision,w-160),x+16,y+43);
    doc.setFont("helvetica","bold");doc.setTextColor(37,99,235);doc.setFontSize(7);
    doc.text("Responsable: "+d.owner,x+w-12,y+56,{align:"right"});
    state.y+=74;
  });
}

/* ---------- PDF V235 ---------- */
async function v232GeneratePdf(meta,analysis){
  try{
    await v234LoadPdfLibraries();
    var PDF=window.jspdf.jsPDF;
    var doc=new PDF({orientation:"portrait",unit:"pt",format:"a4",compress:true});
    var state=v234PdfPageState(doc),m=analysis.m,w=m.specialWait||{},r=m.reliability||{};

    /* Portada gráfica */
    doc.setFillColor(6,27,70);doc.rect(0,0,state.pageWidth,state.pageHeight,"F");
    doc.setFillColor(15,45,92);doc.triangle(state.pageWidth*.50,0,state.pageWidth,0,state.pageWidth,state.pageHeight*.38,"F");
    doc.setFillColor(18,55,109);doc.triangle(0,state.pageHeight*.68,0,state.pageHeight,state.pageWidth*.52,state.pageHeight,"F");
    doc.setFillColor(242,183,5);doc.rect(0,0,14,state.pageHeight,"F");
    doc.setFillColor(242,183,5);doc.circle(state.pageWidth-78,75,35,"F");
    doc.setTextColor(6,27,70);doc.setFont("helvetica","bold");doc.setFontSize(14);doc.text("VSM",state.pageWidth-78,80,{align:"center"});
    doc.setTextColor(242,183,5);doc.setFontSize(9);doc.text(meta.confidentiality.toUpperCase(),52,63);
    doc.setTextColor(255,255,255);doc.setFontSize(29);
    var titleLines=doc.splitTextToSize(meta.title,state.pageWidth-112);doc.text(titleLines,52,118);
    var titleBottom=118+titleLines.length*34;
    doc.setFont("helvetica","normal");doc.setFontSize(12);doc.setTextColor(219,234,254);
    doc.text(doc.splitTextToSize(meta.objective,state.pageWidth-112),52,titleBottom+20);
    var scoreY=titleBottom+130;
    var scoreStatus=v235Status(analysis.score),sc=scoreStatus.color;
    doc.setFillColor(255,255,255);doc.setGState(new doc.GState({opacity:.10}));doc.roundedRect(52,scoreY,190,112,12,12,"F");doc.setGState(new doc.GState({opacity:1}));
    doc.setTextColor(242,183,5);doc.setFont("helvetica","bold");doc.setFontSize(38);doc.text(analysis.score+"%",72,scoreY+58);
    doc.setFontSize(9);doc.setTextColor(255,255,255);doc.text("ÍNDICE GENERAL",72,scoreY+78);
    doc.setFillColor(sc[0],sc[1],sc[2]);doc.roundedRect(72,scoreY+88,100,17,6,6,"F");
    doc.setFontSize(7);doc.text(scoreStatus.label.toUpperCase(),122,scoreY+99,{align:"center"});
    var metaX=275,metaY=scoreY;
    [
      ["Elaborado por",meta.author+" · "+meta.position],
      ["Área responsable",meta.department],
      ["Dirigido a",meta.audience],
      ["Periodo / alcance",meta.periodName||meta.scope]
    ].forEach(function(item,i){
      doc.setTextColor(242,183,5);doc.setFont("helvetica","bold");doc.setFontSize(7);doc.text(item[0].toUpperCase(),metaX,metaY+i*29+10);
      doc.setTextColor(255,255,255);doc.setFont("helvetica","normal");doc.setFontSize(8.5);doc.text(doc.splitTextToSize(item[1],255),metaX,metaY+i*29+23);
    });
    doc.setTextColor(203,213,225);doc.setFontSize(8);
    doc.text("Generado el "+meta.generatedAt.toLocaleString("es-CO")+" · "+VERSION,52,state.pageHeight-44);
    doc.text("Super Admin excluido de productividad y tiempos operativos.",52,state.pageHeight-28);

    /* Tabla de contenido */
    v234PdfNewPage(doc,state,"Contenido");
    v234PdfSection(doc,state,"Contenido del informe");
    [
      "1. Dashboard ejecutivo","2. Diagnóstico y hallazgos","3. Tendencias del flujo",
      "4. Desempeño por proceso","5. Desempeño por área","6. Productividad por actor",
      "7. Novedades, reprocesos y no entregas","8. Confiabilidad y calidad del dato",
      "9. Matriz de riesgos y Pareto","10. Decisiones sugeridas","11. Plan de acción",
      "12. Pedidos críticos","13. Metodología y conclusión"
    ].forEach(function(x,i){
      v234PdfEnsure(doc,state,30,"Contenido");
      doc.setFillColor(i%2?248:238,250,252);doc.roundedRect(state.margin,state.y,state.contentWidth,24,5,5,"F");
      doc.setTextColor(6,27,70);doc.setFont("helvetica","bold");doc.setFontSize(9);doc.text(x,state.margin+10,state.y+16);
      state.y+=29;
    });

    /* Dashboard */
    v234PdfNewPage(doc,state,"Dashboard ejecutivo");
    v234PdfSection(doc,state,"1. Dashboard ejecutivo");
    v235PdfGauge(doc,state,analysis.score,analysis.scoreState.label);
    state.y-=150;
    v235PdfSignals(doc,state,analysis.signals);
    v234PdfKpiGrid(doc,state,[
      {title:"Pedidos cargados",value:String(m.totalLoaded||app.cases.length||0),detail:"Base total"},
      {title:"Pedidos trazados",value:String(m.cases||0),detail:"Cobertura "+v235Percent(m.cases,Math.max(1,m.totalLoaded||m.cases))+"%"},
      {title:"WIP actual",value:String(m.wip||0),detail:String(m.lateWip||0)+" fuera de meta"},
      {title:"Throughput",value:String(m.throughput||0)+"/día",detail:String(m.closed||0)+" cerrados"},
      {title:"Lead Time P50",value:v225Time(m.leadP50||0),detail:"P90 "+v225Time(m.leadP90||0)},
      {title:"Picking",value:v225Time(m.pickingAvg||0),detail:"P90 "+v225Time(m.pickingP90||0)},
      {title:"Confiabilidad",value:Number(r.avg||0)+"%",detail:Number(r.low||0)+" críticos"},
      {title:"No entregas",value:String(m.noDeliveryCount||0),detail:Number(w.noDeliveryOpen||0)+" abiertas"}
    ]);
    v234PdfParagraph(doc,state,"Lectura ejecutiva: "+analysis.scoreState.text,{bold:true});

    /* Diagnóstico */
    v234PdfSection(doc,state,"2. Diagnóstico y hallazgos");
    v234PdfParagraph(doc,state,"Fortalezas observadas",{bold:true});
    v234PdfBulletList(doc,state,analysis.strengths);
    v234PdfParagraph(doc,state,"Hallazgos prioritarios",{bold:true});
    v234PdfBulletList(doc,state,analysis.findings);
    if(meta.notes)v234PdfParagraph(doc,state,"Contexto suministrado: "+meta.notes,{bold:true});

    /* Tendencias */
    if(meta.includeTrends){
      v234PdfSection(doc,state,"3. Tendencias del flujo");
      v235PdfLineChart(doc,state,"Pedidos cerrados por día",m.throughputSeries||[],function(x){return x.day;},function(x){return x.count;},function(x){return x.count+" cierres";});
      v235PdfDonut(doc,state,"Antigüedad del WIP",m.wipBuckets||[],function(x){return x.label;},function(x){return x.count;});
      if(analysis.comparison){
        var c=analysis.comparison;
        v234PdfKpiGrid(doc,state,[
          {title:"Casos periodo anterior",value:String(c.previous.cases),detail:"LT P50 "+v225Time(c.previous.p50)},
          {title:"Casos periodo reciente",value:String(c.recent.cases),detail:"LT P50 "+v225Time(c.recent.p50)},
          {title:"Variación LT promedio",value:v235PctChange(c.recent.avgLt,c.previous.avgLt)+"%",detail:"Negativo indica mejora"},
          {title:"Variación cierres",value:v235PctChange(c.recent.cases,c.previous.cases)+"%",detail:"Comparación entre mitades del periodo"}
        ]);
      }else{
        v234PdfParagraph(doc,state,"No existe una muestra suficiente de pedidos cerrados para comparar dos periodos.",{bold:true});
      }
    }

    /* Procesos */
    v234PdfSection(doc,state,"4. Desempeño por proceso");
    v235PdfQuadrant(doc,state,"Matriz de proceso: Lead Time vs. cumplimiento",analysis.processes);
    v234PdfBarChart(doc,state,"Lead Time promedio por proceso",analysis.processes.slice().sort(function(a,b){return b.avg-a.avg;}),function(x){return x.avg;},function(x){return x.label;},function(x){return v225Time(x.avg);});
    v234PdfBarChart(doc,state,"Salud integral por proceso",analysis.processHealth,function(x){return x.health;},function(x){return x.label;},function(x){return x.health+"%";},function(x){return x.healthStatus.cls;});
    v234PdfTable(doc,state,"Detalle de procesos",
      ["Proceso","Casos","WIP","Atras.","LT prom.","P50","P90","Cumpl.","Salud"],
      analysis.processHealth.map(function(x){return [x.label,x.cases||0,x.wip||0,x.wipLate||0,v225Time(x.avg||0),v225Time(x.p50||0),v225Time(x.p90||0),(x.slaPct||0)+"%",x.health+"%"];}),
      {fontSize:6.5}
    );

    /* Áreas */
    v234PdfSection(doc,state,"5. Desempeño por área");
    v234PdfBarChart(doc,state,"Salud integral por área",analysis.areaHealth,function(x){return x.health;},function(x){return x.label;},function(x){return x.health+"%";},function(x){return x.healthStatus.cls;});
    v234PdfTable(doc,state,"Detalle por área",
      ["Área","Casos","WIP","Cerrados","LT prom.","Cumpl.","Confiab.","No entregas","Salud"],
      analysis.areaHealth.map(function(x){return [x.label,x.cases||0,x.wip||0,x.closed||0,v225Time(x.avg||0),(x.compliance||0)+"%",(x.reliability||0)+"%",x.noDeliveries||0,x.health+"%"];}),
      {fontSize:6.5}
    );
    analysis.areaHealth.forEach(function(a){
      v234PdfEnsure(doc,state,65,"5. Desempeño por área");
      var st=a.healthStatus,c=st.color;
      doc.setFillColor(248,250,252);doc.setDrawColor(216,226,239);doc.roundedRect(state.margin,state.y,state.contentWidth,52,6,6,"FD");
      doc.setFillColor(c[0],c[1],c[2]);doc.roundedRect(state.margin,state.y,6,52,3,3,"F");
      doc.setTextColor(6,27,70);doc.setFont("helvetica","bold");doc.setFontSize(9);doc.text(a.label,state.margin+14,state.y+15);
      doc.setFontSize(7);doc.setTextColor(71,85,105);
      doc.text("LT "+v225Time(a.avg||0)+" · Cumpl. "+Number(a.compliance||0)+"% · Confiab. "+Number(a.reliability||0)+"% · WIP "+Number(a.wip||0),state.margin+14,state.y+31);
      doc.setTextColor(c[0],c[1],c[2]);doc.setFont("helvetica","bold");
      doc.text("Salud "+a.health+"% · "+st.label,state.margin+state.contentWidth-12,state.y+31,{align:"right"});
      state.y+=60;
    });

    /* Actores */
    if(meta.includeActors){
      v234PdfSection(doc,state,"6. Productividad por actor");
      v234PdfParagraph(doc,state,"El Super Admin está excluido. El indicador representa carga y actividad trazada; debe complementarse con calidad, complejidad y cumplimiento.",{bold:true});
      v234PdfBarChart(doc,state,"Trabajo directo por actor",analysis.actors.slice().sort(function(a,b){return b.active-a.active;}).slice(0,15),function(x){return x.active;},function(x){return x.user;},function(x){return v225Time(x.active);});
      v234PdfTable(doc,state,"Detalle de productividad",
        ["Actor","Rol","Casos","WIP","Cerrados","Trabajo","Prom.","Cumpl.","Carga"],
        analysis.actors.slice(0,50).map(function(x){return [x.user,roleTitle(x.role),x.count||0,x.open||0,x.closed||0,v225Time(x.active||0),v225Time(x.directPerCase||0),(x.compliance||0)+"%",(x.directLoadPct||0)+"%"];}),
        {fontSize:6.1}
      );
    }

    /* Esperas */
    if(meta.includeWaits){
      v234PdfSection(doc,state,"7. Novedades, reprocesos y no entregas");
      v234PdfKpiGrid(doc,state,[
        {title:"Espera en novedades",value:v225Time(w.novelty||0),detail:(w.noveltyOpen||0)+" abiertas"},
        {title:"Espera en reproceso",value:v225Time(w.rework||0),detail:(w.reworkOpen||0)+" abiertos"},
        {title:"Espera en no entregas",value:v225Time(w.noDelivery||0),detail:(w.noDeliveryOpen||0)+" abiertas"},
        {title:"No entregas",value:String(m.noDeliveryCount||0),detail:"Pedidos identificados"}
      ]);
      v235PdfDonut(doc,state,"Composición de esperas especiales",[
        {label:"Novedades",value:w.novelty||0,count:(w.noveltyRows||[]).length},
        {label:"Reprocesos",value:w.rework||0,count:(w.reworkRows||[]).length},
        {label:"No entregas",value:w.noDelivery||0,count:(w.noDeliveryRows||[]).length}
      ],function(x){return x.label;},function(x){return x.value;});
      v234PdfTable(doc,state,"Trazabilidad de esperas",
        ["Pedido","Categoría","Área","Proceso","Duración","Abierto","Origen"],
        (w.all||[]).slice(0,100).map(function(x){return [x.pedido,x.category,v225AreaLabel(x.area),processTitle(x.process),v225Time(x.duration||0),x.open?"Sí":"No",x.source];}),
        {fontSize:6,columnStyles:{6:{cellWidth:145}}}
      );
    }

    /* Confiabilidad */
    v234PdfSection(doc,state,"8. Confiabilidad y calidad del dato");
    v234PdfKpiGrid(doc,state,[
      {title:"Confiabilidad general",value:Number(r.avg||0)+"%",detail:"Meta recomendada 90%"},
      {title:"Registros confiables",value:String(r.high||0),detail:"≥ 90%"},
      {title:"Por revisar",value:String(r.medium||0),detail:"70% a 89%"},
      {title:"Críticos",value:String(r.low||0),detail:"< 70%"},
      {title:"Responsable identificado",value:Number(r.responsiblePct||0)+"%",detail:"Pedidos con actor"},
      {title:"Proceso identificado",value:Number(r.processPct||0)+"%",detail:"Etapa registrada"},
      {title:"Estado identificado",value:Number(r.statusPct||0)+"%",detail:"Estado disponible"},
      {title:"No trazados",value:String(m.notTraced||0),detail:"Pendientes de QA"}
    ]);
    v234PdfParagraph(doc,state,"La confiabilidad mide la integridad mínima del registro; no evalúa por sí sola la calidad del trabajo realizado.");

    /* Riesgos / Pareto */
    if(meta.includeRisks){
      v234PdfSection(doc,state,"9. Matriz de riesgos y Pareto");
      v235PdfRiskMatrix(doc,state,analysis.risks);
      v234PdfBarChart(doc,state,"Pareto de causas por tiempo asociado",analysis.pareto,function(x){return x.value;},function(x){return x.label;},function(x){return v225Time(x.value)+" · "+x.count+" caso(s)";},function(x,i){return i===0?"bad":"warn";});
      v234PdfTable(doc,state,"Registro de riesgos",
        ["Nivel","Riesgo","Fuente","Prob.","Impacto","Evidencia","Tratamiento"],
        analysis.risks.map(function(x){return [x.level,x.risk,x.source,x.probability,x.impact,x.evidence,x.treatment];}),
        {fontSize:5.9,columnStyles:{5:{cellWidth:115},6:{cellWidth:135}}}
      );
    }

    /* Decisiones */
    v234PdfSection(doc,state,"10. Decisiones sugeridas");
    v235PdfDecisionCards(doc,state,analysis.decisions);
    v234PdfParagraph(doc,state,"Preguntas que deben resolverse en comité",{bold:true});
    v234PdfBulletList(doc,state,analysis.managementQuestions);
    v234PdfParagraph(doc,state,"Recomendaciones analíticas",{bold:true});
    v234PdfBulletList(doc,state,analysis.recommendations);

    /* Plan */
    if(meta.includeActionPlan){
      v234PdfTable(doc,state,"11. Plan de acción propuesto",
        ["Prioridad","Situación","Acción","Responsable sugerido","Meta"],
        analysis.actions.map(function(x){return [x.priority,x.issue,x.action,x.owner,x.target];}),
        {fontSize:6.3,columnStyles:{2:{cellWidth:165}}}
      );
    }

    /* Pedidos */
    if(meta.includeOrders){
      v234PdfTable(doc,state,"12. Pedidos críticos",
        ["Pedido","OC","Cliente","Proceso","Responsable","Tiempo","Meta","Estado","Próxima acción"],
        (m.wipRows||[]).slice(0,150).map(function(x){return [x.pedido,x.oc,x.cliente,x.processLabel,x.responsable,v225Time(x.age||0),(x.slaHours||0)+" h",x.late?"Fuera de meta":"Dentro",x.next||""];}),
        {fontSize:5.6,columnStyles:{2:{cellWidth:85},8:{cellWidth:110}}}
      );
    }

    /* Metodología / conclusión */
    if(meta.includeMethodology){
      v234PdfTable(doc,state,"13. Metodología y fuentes",
        ["Elemento","Criterio aplicado"],
        [
          ["Jornada","07:00–12:00 y 13:40–17:30; sábados, domingos y festivos excluidos."],
          ["Lead Time","Tiempo laboral desde el inicio hasta el cierre o corte."],
          ["P50 / P90","Mediana y percentil 90 de los casos terminados."],
          ["Trabajo directo","Eventos operativos y acumulados válidos; Super Admin excluido."],
          ["Reproceso","Exceso sobre la meta después de retornar a una etapa anterior."],
          ["No entrega","Desde la confirmación de no entrega hasta la solución o cierre."],
          ["Salud de proceso","Cumplimiento, eficiencia, WIP dentro de meta y estabilidad."],
          ["Índice general","Cumplimiento, confiabilidad, WIP, cobertura, no entregas y reprocesos."],
          ["Fuentes","cases, case_events, reportes_novedad, processStats, requirements, noDeliveryReports, stateHistory y flowTrace."]
        ],
        {fontSize:6.8,columnStyles:{0:{cellWidth:100}}}
      );
    }
    v234PdfSection(doc,state,"14. Conclusión");
    v234PdfParagraph(doc,state,v234PdfConclusion(analysis),{size:10,bold:true});
    v234PdfParagraph(doc,state,"Próximo control recomendado: revisar los indicadores después de ejecutar las acciones de prioridad alta y comparar nuevamente cumplimiento, WIP, confiabilidad y tiempos especiales.");
    v234PdfParagraph(doc,state,"Elaborado por "+meta.author+" · "+meta.position+" · Dirigido a "+meta.audience+".");
    v234PdfFooterAll(doc,meta);
    doc.save(v232FileName(meta,"pdf"));
  }catch(e){
    console.error("[V235 Informe PDF]",e);
    v234OpenPrintFallback(meta,analysis);
    status("El motor PDF no pudo cargarse. Se abrió la versión imprimible completa para guardar como PDF.","ok");
  }
}

/* ---------- CANVAS V235 PARA EXCEL ---------- */
function v235CanvasRoundRect(ctx,x,y,w,h,r){
  r=Math.min(r,w/2,h/2);ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();
}
function v235CanvasGauge(score,label){
  var canvas=document.createElement("canvas");canvas.width=900;canvas.height=390;var ctx=canvas.getContext("2d");
  ctx.fillStyle="#ffffff";ctx.fillRect(0,0,900,390);
  ctx.fillStyle="#061b46";ctx.font="bold 30px Arial";ctx.fillText("Índice general de desempeño",35,50);
  var cx=210,cy=230,r=115;
  ctx.lineWidth=28;ctx.strokeStyle="#e2e8f0";ctx.beginPath();ctx.arc(cx,cy,r,Math.PI,2*Math.PI);ctx.stroke();
  var st=v235Status(score);ctx.strokeStyle=st.cls==="ok"?"#0f9f6e":st.cls==="warn"?"#d97706":"#dc2626";
  ctx.beginPath();ctx.arc(cx,cy,r,Math.PI,Math.PI+Math.PI*v235Clamp(score,0,100)/100);ctx.stroke();
  ctx.fillStyle="#061b46";ctx.font="bold 58px Arial";ctx.textAlign="center";ctx.fillText(score+"%",cx,cy+15);
  ctx.font="bold 20px Arial";ctx.fillStyle="#475569";ctx.fillText(label,cx,cy+55);ctx.textAlign="left";
  ctx.fillStyle="#f8fafc";v235CanvasRoundRect(ctx,420,85,430,235,18);ctx.fill();
  ctx.fillStyle="#061b46";ctx.font="bold 23px Arial";ctx.fillText("Lectura",450,125);
  ctx.fillStyle="#334155";ctx.font="19px Arial";
  var lines=["El índice integra cumplimiento,","confiabilidad, WIP, cobertura,","no entregas y reprocesos."];
  lines.forEach(function(t,i){ctx.fillText(t,450,170+i*34);});
  return canvas.toDataURL("image/png");
}
function v235CanvasLine(title,rows,labelFn,valueFn){
  var canvas=document.createElement("canvas");canvas.width=1100;canvas.height=460;var ctx=canvas.getContext("2d");
  ctx.fillStyle="#ffffff";ctx.fillRect(0,0,1100,460);ctx.fillStyle="#061b46";ctx.font="bold 28px Arial";ctx.fillText(title,35,45);
  var px=90,py=90,pw=930,ph=285,vals=(rows||[]).map(function(r){return Number(valueFn(r))||0;});
  var max=Math.max.apply(Math,[1].concat(vals));
  ctx.strokeStyle="#e2e8f0";ctx.lineWidth=1;
  for(var g=0;g<=5;g++){var y=py+ph*g/5;ctx.beginPath();ctx.moveTo(px,y);ctx.lineTo(px+pw,y);ctx.stroke();}
  if(rows.length>1){
    ctx.strokeStyle="#2563eb";ctx.lineWidth=5;ctx.beginPath();
    rows.forEach(function(r,i){var x=px+i*pw/(rows.length-1),y=py+ph-(Number(valueFn(r))||0)/max*ph;if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);});ctx.stroke();
    rows.forEach(function(r,i){
      var x=px+i*pw/(rows.length-1);
      var y=py+ph-(Number(valueFn(r))||0)/max*ph;
      ctx.fillStyle="#f2b705";
      ctx.beginPath();
      ctx.arc(x,y,7,0,Math.PI*2);
      ctx.fill();
      if(i===0||i===rows.length-1||i%Math.max(1,Math.floor(rows.length/6))===0){
        ctx.fillStyle="#64748b";
        ctx.font="14px Arial";
        ctx.textAlign="center";
        ctx.fillText(String(labelFn(r)).slice(5),x,py+ph+32);
      }
    });
  }else{ctx.fillStyle="#64748b";ctx.font="20px Arial";ctx.textAlign="center";ctx.fillText("Sin datos suficientes",550,230);}
  ctx.textAlign="left";return canvas.toDataURL("image/png");
}
function v235CanvasDonut(title,rows,labelFn,valueFn){
  var canvas=document.createElement("canvas");canvas.width=1100;canvas.height=480;var ctx=canvas.getContext("2d");
  ctx.fillStyle="#ffffff";ctx.fillRect(0,0,1100,480);ctx.fillStyle="#061b46";ctx.font="bold 28px Arial";ctx.fillText(title,35,45);
  var colors=["#2563eb","#0f9f6e","#f2b705","#d97706","#7c3aed","#dc2626"],total=rows.reduce(function(s,r){return s+(Number(valueFn(r))||0);},0),start=-Math.PI/2,cx=250,cy=265,r=135;
  rows.forEach(function(row,i){var value=Number(valueFn(row))||0,angle=total?value/total*Math.PI*2:0;ctx.strokeStyle=colors[i%colors.length];ctx.lineWidth=48;ctx.beginPath();ctx.arc(cx,cy,r,start,start+angle);ctx.stroke();start+=angle;});
  ctx.fillStyle="#061b46";ctx.font="bold 36px Arial";ctx.textAlign="center";ctx.fillText(rows.reduce(function(s,r){return s+(Number(r.count)||Number(valueFn(r))||0);},0),cx,cy+12);ctx.font="16px Arial";ctx.fillStyle="#64748b";ctx.fillText("TOTAL",cx,cy+42);ctx.textAlign="left";
  rows.slice(0,8).forEach(function(row,i){var y=100+i*43;ctx.fillStyle=colors[i%colors.length];ctx.fillRect(500,y,20,20);ctx.fillStyle="#334155";ctx.font="19px Arial";ctx.fillText(String(labelFn(row)).slice(0,30),535,y+17);ctx.fillStyle="#061b46";ctx.font="bold 18px Arial";ctx.textAlign="right";ctx.fillText(v225Time(Number(valueFn(row))||0),1040,y+17);ctx.textAlign="left";});
  return canvas.toDataURL("image/png");
}
function v235CanvasQuadrant(title,rows){
  var canvas=document.createElement("canvas");canvas.width=1100;canvas.height=560;var ctx=canvas.getContext("2d");
  ctx.fillStyle="#ffffff";ctx.fillRect(0,0,1100,560);ctx.fillStyle="#061b46";ctx.font="bold 28px Arial";ctx.fillText(title,35,45);
  var x=100,y=90,w=900,h=390;
  ctx.fillStyle="#fff7ed";ctx.fillRect(x,y,w/2,h/2);ctx.fillStyle="#ecfdf5";ctx.fillRect(x+w/2,y,w/2,h/2);ctx.fillStyle="#fef2f2";ctx.fillRect(x,y+h/2,w/2,h/2);ctx.fillStyle="#eff6ff";ctx.fillRect(x+w/2,y+h/2,w/2,h/2);
  ctx.strokeStyle="#94a3b8";ctx.lineWidth=2;ctx.strokeRect(x,y,w,h);ctx.beginPath();ctx.moveTo(x+w/2,y);ctx.lineTo(x+w/2,y+h);ctx.moveTo(x,y+h/2);ctx.lineTo(x+w,y+h/2);ctx.stroke();
  var maxLt=Math.max.apply(Math,[1].concat(rows.map(function(r){return Number(r.avg)||0;})));
  rows.slice(0,16).forEach(function(r){var xx=x+v235Clamp(Number(r.avg||0)/maxLt*w,0,w),yy=y+h-v235Clamp(Number(r.slaPct||0)/100*h,0,h),st=v235Status(v235HealthScoreProcess(r));ctx.fillStyle=st.cls==="ok"?"#0f9f6e":st.cls==="warn"?"#d97706":"#dc2626";ctx.beginPath();ctx.arc(xx,yy,Math.max(7,Math.min(18,8+Number(r.wip||0))),0,Math.PI*2);ctx.fill();ctx.fillStyle="#334155";ctx.font="bold 13px Arial";ctx.fillText(String(r.label||"").slice(0,18),xx+10,yy-8);});
  ctx.fillStyle="#64748b";ctx.font="15px Arial";ctx.fillText("Menor Lead Time",x,y+h+35);ctx.textAlign="right";ctx.fillText("Mayor Lead Time",x+w,y+h+35);ctx.textAlign="left";ctx.save();ctx.translate(45,y+h/2);ctx.rotate(-Math.PI/2);ctx.textAlign="center";ctx.fillText("Cumplimiento",0,0);ctx.restore();
  return canvas.toDataURL("image/png");
}
function v235CanvasRiskMatrix(risks){
  var canvas=document.createElement("canvas");canvas.width=1100;canvas.height=600;var ctx=canvas.getContext("2d");
  ctx.fillStyle="#ffffff";ctx.fillRect(0,0,1100,600);ctx.fillStyle="#061b46";ctx.font="bold 28px Arial";ctx.fillText("Matriz de riesgos operativos",35,45);
  var x=90,y=100,size=390,cell=size/3,colors=[["#ecfdf5","#ecfdf5","#fff7ed"],["#ecfdf5","#fff7ed","#fee2e2"],["#fff7ed","#fee2e2","#fee2e2"]];
  for(var impact=1;impact<=3;impact++){for(var prob=1;prob<=3;prob++){ctx.fillStyle=colors[impact-1][prob-1];ctx.fillRect(x+(prob-1)*cell,y+(3-impact)*cell,cell,cell);ctx.strokeStyle="#cbd5e1";ctx.strokeRect(x+(prob-1)*cell,y+(3-impact)*cell,cell,cell);}}
  var groups={};(risks||[]).forEach(function(r){var k=r.probability+"|"+r.impact;if(!groups[k])groups[k]=[];groups[k].push(r);});
  Object.keys(groups).forEach(function(k){var p=k.split("|"),prob=Number(p[0]),impact=Number(p[1]),xx=x+(prob-.5)*cell,yy=y+(3-impact+.5)*cell;ctx.fillStyle="#061b46";ctx.beginPath();ctx.arc(xx,yy,23,0,Math.PI*2);ctx.fill();ctx.fillStyle="#ffffff";ctx.font="bold 20px Arial";ctx.textAlign="center";ctx.fillText(groups[k].length,xx,yy+7);ctx.textAlign="left";});
  ctx.fillStyle="#64748b";ctx.font="17px Arial";ctx.fillText("Probabilidad →",x+130,y+size+38);ctx.save();ctx.translate(45,y+195);ctx.rotate(-Math.PI/2);ctx.textAlign="center";ctx.fillText("Impacto",0,0);ctx.restore();
  (risks||[]).slice(0,7).forEach(function(r,i){var yy=95+i*63,xx=560;ctx.fillStyle=r.level==="Alto"?"#dc2626":r.level==="Medio"?"#d97706":"#0f9f6e";v235CanvasRoundRect(ctx,xx,yy,90,28,12);ctx.fill();ctx.fillStyle="#ffffff";ctx.font="bold 14px Arial";ctx.textAlign="center";ctx.fillText(r.level,xx+45,yy+20);ctx.textAlign="left";ctx.fillStyle="#061b46";ctx.font="bold 16px Arial";ctx.fillText(String(r.risk).slice(0,39),xx+110,yy+15);ctx.fillStyle="#64748b";ctx.font="14px Arial";ctx.fillText(String(r.evidence).slice(0,56),xx+110,yy+38);});
  return canvas.toDataURL("image/png");
}
function v235ExcelConditionalPercent(sheet,column,start,end){
  if(end<start)return;
  sheet.addConditionalFormatting({
    ref:column+start+":"+column+end,
    rules:[
      {type:"cellIs",operator:"greaterThanOrEqual",formulae:[85],style:{fill:{type:"pattern",pattern:"solid",bgColor:{argb:"FFC6EFCE"},fgColor:{argb:"FFC6EFCE"}},font:{color:{argb:"FF006100"}}}},
      {type:"cellIs",operator:"between",formulae:[65,84.999],style:{fill:{type:"pattern",pattern:"solid",bgColor:{argb:"FFFFEB9C"},fgColor:{argb:"FFFFEB9C"}},font:{color:{argb:"FF9C6500"}}}},
      {type:"cellIs",operator:"lessThan",formulae:[65],style:{fill:{type:"pattern",pattern:"solid",bgColor:{argb:"FFFFC7CE"},fgColor:{argb:"FFFFC7CE"}},font:{color:{argb:"FF9C0006"}}}}
    ]
  });
}

/* ---------- EXCEL V235 ---------- */
async function v232GenerateExcel(meta,analysis){
  await v234LoadExcelLibrary();
  var ExcelJS=window.ExcelJS,m=analysis.m,w=m.specialWait||{},r=m.reliability||{};
  var workbook=new ExcelJS.Workbook();
  workbook.creator=meta.author;workbook.lastModifiedBy=meta.author;workbook.created=meta.generatedAt;workbook.modified=meta.generatedAt;
  workbook.calcProperties.fullCalcOnLoad=true;

  /* Dashboard */
  var dash=workbook.addWorksheet("Dashboard",{views:[{showGridLines:false}]});
  dash.properties.tabColor={argb:"FF061B46"};
  dash.mergeCells("A1:L3");var head=dash.getCell("A1");head.value=meta.title;head.font={bold:true,size:24,color:{argb:"FFFFFFFF"}};head.fill={type:"pattern",pattern:"solid",fgColor:{argb:"FF061B46"}};head.alignment={vertical:"middle",horizontal:"left",wrapText:true};
  dash.mergeCells("A4:L4");dash.getCell("A4").value=(meta.periodName||meta.scope)+" · Elaborado por "+meta.author+" · "+meta.position;dash.getCell("A4").font={italic:true,size:10,color:{argb:"FF475569"}};
  dash.columns=Array.from({length:12},function(){return {width:14};});
  var cards=[
    ["Índice general",analysis.score+"%",analysis.scoreState.label],
    ["Total cargado",m.totalLoaded||app.cases.length||0,"Pedidos"],
    ["Trazados",m.cases||0,v235Percent(m.cases,Math.max(1,m.totalLoaded||m.cases))+"% cobertura"],
    ["WIP",m.wip||0,(m.lateWip||0)+" atrasados"],
    ["Throughput",m.throughput||0,"por día"],
    ["LT P50",v234MsHours(m.leadP50||0),"horas"],
    ["Confiabilidad",Number(r.avg||0)+"%",Number(r.low||0)+" críticos"],
    ["No entregas",m.noDeliveryCount||0,(w.noDeliveryOpen||0)+" abiertas"]
  ];
  cards.forEach(function(c,i){
    var row=6+Math.floor(i/4)*4,col=1+(i%4)*3;
    dash.mergeCells(row,col,row+2,col+2);var cell=dash.getCell(row,col);
    cell.value={richText:[{text:c[0]+"\n",font:{bold:true,size:9,color:{argb:"FF64748B"}}},{text:String(c[1])+"\n",font:{bold:true,size:20,color:{argb:"FF061B46"}}},{text:String(c[2]),font:{size:8,color:{argb:"FF64748B"}}}]};
    cell.alignment={vertical:"middle",horizontal:"left",wrapText:true};cell.fill={type:"pattern",pattern:"solid",fgColor:{argb:"FFF8FAFC"}};cell.border={top:{style:"thin",color:{argb:"FFD8E2EF"}},left:{style:"thin",color:{argb:"FFD8E2EF"}},bottom:{style:"thin",color:{argb:"FFD8E2EF"}},right:{style:"thin",color:{argb:"FFD8E2EF"}}};
  });
  v234ExcelAddImage(workbook,dash,v235CanvasGauge(analysis.score,analysis.scoreState.label),{tl:{col:0,row:15},ext:{width:590,height:260}});
  v234ExcelAddImage(workbook,dash,v235CanvasLine("Pedidos cerrados por día",m.throughputSeries||[],function(x){return x.day;},function(x){return x.count;}),{tl:{col:6,row:15},ext:{width:590,height:260}});
  v234ExcelAddImage(workbook,dash,v235CanvasQuadrant("Lead Time vs. cumplimiento",analysis.processes),{tl:{col:0,row:31},ext:{width:590,height:310}});
  v234ExcelAddImage(workbook,dash,v235CanvasRiskMatrix(analysis.risks),{tl:{col:6,row:31},ext:{width:590,height:320}});
  dash.getCell("A51").value="Conclusión ejecutiva";dash.getCell("A51").font={bold:true,size:14,color:{argb:"FF061B46"}};dash.mergeCells("A52:L56");dash.getCell("A52").value=v234PdfConclusion(analysis);dash.getCell("A52").alignment={wrapText:true,vertical:"top"};dash.getCell("A52").fill={type:"pattern",pattern:"solid",fgColor:{argb:"FFEFF6FF"}};
  dash.pageSetup={orientation:"landscape",fitToPage:true,fitToWidth:1,fitToHeight:1,paperSize:9};

  /* Resumen analítico */
  var summary=v234ExcelSheet(workbook,"Resumen analítico","Resumen analítico y decisiones",meta.scope,["Tipo","Contenido"],[
    ["Estado general",analysis.score+"% · "+analysis.scoreState.label],
    ["Conclusión",v234PdfConclusion(analysis)]
  ].concat(
    analysis.strengths.map(function(x){return ["Fortaleza",x];}),
    analysis.findings.map(function(x){return ["Hallazgo",x];}),
    analysis.recommendations.map(function(x){return ["Recomendación",x];}),
    analysis.decisions.map(function(x){return ["Decisión",x.title+" | "+x.signal+" | "+x.decision+" | Responsable: "+x.owner];})
  ));
  summary.properties.tabColor={argb:"FFF2B705"};

  /* Tendencias */
  if(meta.includeTrends){
    var trendRows=(m.throughputSeries||[]).map(function(x){return [x.day,x.count];});
    var trends=v234ExcelSheet(workbook,"Tendencias","Tendencias y comparación temporal",meta.scope,["Fecha","Pedidos cerrados"],trendRows);
    trends.getColumn(1).width=16;trends.getColumn(2).width=20;
    v234ExcelAddImage(workbook,trends,v235CanvasLine("Pedidos cerrados por día",m.throughputSeries||[],function(x){return x.day;},function(x){return x.count;}),{tl:{col:3,row:3},ext:{width:760,height:330}});
    v234ExcelAddImage(workbook,trends,v235CanvasDonut("Antigüedad del WIP",m.wipBuckets||[],function(x){return x.label;},function(x){return x.count;}),{tl:{col:3,row:21},ext:{width:760,height:340}});
    if(analysis.comparison){
      trends.getCell("A"+(trends.rowCount+3)).value="Comparación temporal";trends.getCell("A"+(trends.rowCount+3)).font={bold:true,size:14,color:{argb:"FF061B46"}};
      var rr=trends.rowCount+4;
      [["Indicador","Periodo anterior","Periodo reciente","Variación"],
       ["Casos cerrados",analysis.comparison.previous.cases,analysis.comparison.recent.cases,v235PctChange(analysis.comparison.recent.cases,analysis.comparison.previous.cases)+"%"],
       ["LT promedio (h)",v234MsHours(analysis.comparison.previous.avgLt),v234MsHours(analysis.comparison.recent.avgLt),v235PctChange(analysis.comparison.recent.avgLt,analysis.comparison.previous.avgLt)+"%"],
       ["LT P50 (h)",v234MsHours(analysis.comparison.previous.p50),v234MsHours(analysis.comparison.recent.p50),v235PctChange(analysis.comparison.recent.p50,analysis.comparison.previous.p50)+"%"]].forEach(function(row){trends.addRow(row);});
      v234ExcelStyleHeader(trends.getRow(rr));
    }
  }

  /* Procesos */
  var process=v234ExcelSheet(workbook,"Procesos","Desempeño y salud por proceso",meta.scope,
    ["Proceso","Casos","WIP","Atrasados","LT promedio (h)","P50 (h)","P90 (h)","Trabajo (h)","Bloqueo (h)","Cumplimiento (%)","Salud (%)","Estado"],
    analysis.processHealth.map(function(x){return [x.label,x.cases||0,x.wip||0,x.wipLate||0,v234MsHours(x.avg||0),v234MsHours(x.p50||0),v234MsHours(x.p90||0),v234MsHours(x.cases?x.active/x.cases:0),v234MsHours(x.cases?x.wait/x.cases:0),Number(x.slaPct||0),x.health,x.healthStatus.label];})
  );
  v235ExcelConditionalPercent(process,"J",5,process.rowCount);v235ExcelConditionalPercent(process,"K",5,process.rowCount);
  v234ExcelAddImage(workbook,process,v235CanvasQuadrant("Lead Time vs. cumplimiento",analysis.processes),{tl:{col:0,row:process.rowCount+2},ext:{width:790,height:400}});
  v234ExcelAddImage(workbook,process,v234CanvasChart("Salud integral por proceso",analysis.processHealth,function(x){return x.health;},function(x){return x.label;},function(x){return x.health+"%";},function(x){return x.healthStatus.cls;}),{tl:{col:7,row:process.rowCount+2},ext:{width:730,height:400}});

  /* Áreas */
  var areas=v234ExcelSheet(workbook,"Áreas","Desempeño y diagnóstico por área",meta.scope,
    ["Área","Casos","Intervenciones","WIP","Cerrados","LT promedio (h)","Trabajo (h)","Cumplimiento (%)","Confiabilidad (%)","No entregas","Actores","Salud (%)","Estado"],
    analysis.areaHealth.map(function(x){return [x.label,x.cases||0,x.area==="ventas"?(x.interventions||0):"",x.wip||0,x.closed||0,v234MsHours(x.avg||0),v234MsHours(x.work||0),Number(x.compliance||0),Number(x.reliability||0),x.noDeliveries||0,x.workers||0,x.health,x.healthStatus.label];})
  );
  v235ExcelConditionalPercent(areas,"H",5,areas.rowCount);v235ExcelConditionalPercent(areas,"I",5,areas.rowCount);v235ExcelConditionalPercent(areas,"L",5,areas.rowCount);
  v234ExcelAddImage(workbook,areas,v234CanvasChart("Salud integral por área",analysis.areaHealth,function(x){return x.health;},function(x){return x.label;},function(x){return x.health+"%";},function(x){return x.healthStatus.cls;}),{tl:{col:0,row:areas.rowCount+2},ext:{width:820,height:410}});

  /* Actores */
  if(meta.includeActors){
    var actors=v234ExcelSheet(workbook,"Actores","Productividad por actor","Super Admin excluido de las mediciones.",
      ["Actor","Rol","Casos","WIP","Cerrados","Trabajo directo (h)","Promedio (h)","Cumplimiento (%)","Carga directa (%)","Procesos"],
      analysis.actors.map(function(x){return [x.user,roleTitle(x.role),x.count||0,x.open||0,x.closed||0,v234MsHours(x.active||0),v234MsHours(x.directPerCase||0),Number(x.compliance||0),Number(x.directLoadPct||0),x.processList||""];})
    );
    v235ExcelConditionalPercent(actors,"H",5,actors.rowCount);
    v234ExcelAddImage(workbook,actors,v234CanvasChart("Trabajo directo por actor",analysis.actors.slice().sort(function(a,b){return b.active-a.active;}),function(x){return x.active;},function(x){return x.user;},function(x){return v225Time(x.active);}),{tl:{col:0,row:actors.rowCount+2},ext:{width:800,height:480}});
  }

  /* Esperas y Pareto */
  if(meta.includeWaits){
    var waits=v234ExcelSheet(workbook,"Esperas","Novedades, reprocesos y no entregas",meta.scope,
      ["Pedido","Categoría","Área","Proceso","Inicio","Fin / corte","Duración (h)","Abierto","Origen","Detalle"],
      (w.all||[]).map(function(x){return [x.pedido,x.category,v225AreaLabel(x.area),processTitle(x.process),x.start?new Date(x.start):"",x.end?new Date(x.end):"",v234MsHours(x.duration||0),x.open?"Sí":"No",x.source,x.detail];})
    );
    waits.getColumn(5).numFmt="dd/mm/yyyy hh:mm";waits.getColumn(6).numFmt="dd/mm/yyyy hh:mm";
    v234ExcelAddImage(workbook,waits,v235CanvasDonut("Composición de esperas",[
      {label:"Novedades",value:w.novelty||0,count:(w.noveltyRows||[]).length},
      {label:"Reprocesos",value:w.rework||0,count:(w.reworkRows||[]).length},
      {label:"No entregas",value:w.noDelivery||0,count:(w.noDeliveryRows||[]).length}
    ],function(x){return x.label;},function(x){return x.value;}),{tl:{col:0,row:waits.rowCount+2},ext:{width:800,height:350}});
    v234ExcelAddImage(workbook,waits,v234CanvasChart("Pareto de causas",analysis.pareto,function(x){return x.value;},function(x){return x.label;},function(x){return v225Time(x.value);}),{tl:{col:7,row:waits.rowCount+2},ext:{width:760,height:420}});
  }

  /* Riesgos */
  if(meta.includeRisks){
    var risks=v234ExcelSheet(workbook,"Riesgos","Matriz de riesgos operativos",meta.scope,
      ["Nivel","Riesgo","Fuente","Probabilidad","Impacto","Puntuación","Evidencia","Tratamiento"],
      analysis.risks.map(function(x){return [x.level,x.risk,x.source,x.probability,x.impact,x.score,x.evidence,x.treatment];})
    );
    v234ExcelAddImage(workbook,risks,v235CanvasRiskMatrix(analysis.risks),{tl:{col:0,row:risks.rowCount+2},ext:{width:930,height:500}});
  }

  /* Alertas */
  if(meta.includeAlerts){
    v234ExcelSheet(workbook,"Alertas","Alertas y riesgos prioritarios",meta.scope,
      ["Prioridad","Pedido","Proceso","Hallazgo","Acción sugerida"],
      (m.alertRows||[]).map(function(x){return [x.severity==="bad"?"Alta":"Media",x.pedido||"",x.proceso||"",x.detalle||"",x.accion||""];})
    );
  }

  /* Decisiones */
  v234ExcelSheet(workbook,"Decisiones","Decisiones sugeridas para comité",meta.scope,
    ["Tema","Señal observada","Decisión sugerida","Responsable"],
    analysis.decisions.map(function(x){return [x.title,x.signal,x.decision,x.owner];}).concat(
      analysis.managementQuestions.map(function(x){return ["Pregunta de comité",x,"Definir respuesta y evidencia","Comité de seguimiento"];})
    )
  );

  /* Plan */
  if(meta.includeActionPlan){
    v234ExcelSheet(workbook,"Plan de acción","Plan de acción propuesto","Generado a partir de las desviaciones observadas.",
      ["Prioridad","Situación","Acción","Responsable sugerido","Meta","Estado","Fecha compromiso","Avance (%)","Observaciones"],
      analysis.actions.map(function(x){return [x.priority,x.issue,x.action,x.owner,x.target,"Pendiente","",0,""];})
    );
  }

  /* Pedidos */
  if(meta.includeOrders){
    v234ExcelSheet(workbook,"Pedidos críticos","Anexo de pedidos críticos",meta.scope,
      ["Pedido","OC","Cliente","Proceso","Responsable","Tiempo en proceso (h)","Meta (h)","Estado","Bloqueo","Próxima acción","LT total (h)"],
      (m.wipRows||[]).map(function(x){return [x.pedido,x.oc,x.cliente,x.processLabel,x.responsable,v234MsHours(x.age||0),Number(x.slaHours||0),x.late?"Fuera de meta":"Dentro",x.blocker||"",x.next||"",v234MsHours(x.lead||0)];})
    );
  }

  /* Calidad */
  v234ExcelSheet(workbook,"Calidad del dato","Confiabilidad y calidad del registro",meta.scope,
    ["Indicador","Resultado","Meta / interpretación"],
    [
      ["Confiabilidad general",Number(r.avg||0)+"%","Meta recomendada ≥ 90%"],
      ["Registros confiables",r.high||0,"Confiabilidad ≥ 90%"],
      ["Registros por revisar",r.medium||0,"Entre 70% y 89%"],
      ["Registros críticos",r.low||0,"Menor a 70%"],
      ["Responsable identificado",Number(r.responsiblePct||0)+"%","Meta 100%"],
      ["Proceso identificado",Number(r.processPct||0)+"%","Meta 100%"],
      ["Estado identificado",Number(r.statusPct||0)+"%","Meta 100%"],
      ["No trazados",m.notTraced||0,"Corregir o completar"]
    ]
  );

  /* Metodología */
  if(meta.includeMethodology){
    v234ExcelSheet(workbook,"Metodología","Metodología, fórmulas y fuentes","Criterios aplicados por el VSM.",
      ["Elemento","Criterio aplicado"],
      [
        ["Jornada","07:00–12:00 y 13:40–17:30; se excluyen sábados, domingos y festivos."],
        ["Lead Time","Tiempo laboral desde el inicio hasta el cierre o corte."],
        ["P50 / P90","Mediana y percentil 90."],
        ["Trabajo directo","Actividad operativa válida; Super Admin excluido."],
        ["Reproceso","Exceso sobre la meta luego de retornar a una etapa anterior."],
        ["No entrega","Desde confirmación hasta solución o cierre."],
        ["Salud de proceso","45% cumplimiento, 20% eficiencia, 25% WIP dentro de meta y 10% estabilidad."],
        ["Salud de área","45% cumplimiento, 30% confiabilidad, 15% control de WIP y 10% control de no entregas."],
        ["Índice general","Cumplimiento, confiabilidad, WIP, cobertura, no entregas y reprocesos."],
        ["Fuentes","cases, case_events, reportes_novedad, processStats, requirements, noDeliveryReports, stateHistory y flowTrace."]
      ]
    );
  }

  /* Conclusiones */
  v234ExcelSheet(workbook,"Conclusiones","Conclusiones y recomendaciones",meta.scope,
    ["Tipo","Contenido"],
    [["Conclusión general",v234PdfConclusion(analysis)]].concat(
      analysis.strengths.map(function(x){return ["Fortaleza",x];}),
      analysis.findings.map(function(x){return ["Hallazgo",x];}),
      analysis.recommendations.map(function(x){return ["Recomendación",x];})
    )
  );

  workbook.eachSheet(function(sheet){
    if(sheet.name!=="Dashboard")sheet.views=[{state:"frozen",ySplit:4}];
    sheet.pageSetup={orientation:"landscape",fitToPage:true,fitToWidth:1,fitToHeight:0,paperSize:9};
    sheet.headerFooter={oddHeader:"&CElectroingeniería · "+meta.title,oddFooter:"&L"+meta.author+" · "+meta.department+"&RPágina &P de &N"};
  });
  var buffer=await workbook.xlsx.writeBuffer();
  v234DownloadBlob(new Blob([buffer],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}),v232FileName(meta,"xlsx"));
}

var V236_OFICIOS_TEMPLATE="data:image/jpeg;base64,/9j/4QoCRXhpZgAATU0AKgAAAAgABwESAAMAAAABAAEAAAEaAAUAAAABAAAAYgEbAAUAAAABAAAAagEoAAMAAAABAAIAAAExAAIAAAAiAAAAcgEyAAIAAAAUAAAAlIdpAAQAAAABAAAAqAAAANQALcbAAAAnEAAtxsAAACcQQWRvYmUgUGhvdG9zaG9wIENDIDIwMTUgKFdpbmRvd3MpADIwMTc6MDU6MjYgMTE6NDQ6MTYAAAOgAQADAAAAAf//AACgAgAEAAAAAQAACeugAwAEAAAAAQAADOsAAAAAAAAABgEDAAMAAAABAAYAAAEaAAUAAAABAAABIgEbAAUAAAABAAABKgEoAAMAAAABAAIAAAIBAAQAAAABAAABMgICAAQAAAABAAAIyAAAAAAAAABIAAAAAQAAAEgAAAAB/9j/7QAMQWRvYmVfQ00AAf/uAA5BZG9iZQBkgAAAAAH/2wCEAAwICAgJCAwJCQwRCwoLERUPDAwPFRgTExUTExgRDAwMDAwMEQwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwBDQsLDQ4NEA4OEBQODg4UFA4ODg4UEQwMDAwMEREMDAwMDAwRDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDP/AABEIAKAAewMBIgACEQEDEQH/3QAEAAj/xAE/AAABBQEBAQEBAQAAAAAAAAADAAECBAUGBwgJCgsBAAEFAQEBAQEBAAAAAAAAAAEAAgMEBQYHCAkKCxAAAQQBAwIEAgUHBggFAwwzAQACEQMEIRIxBUFRYRMicYEyBhSRobFCIyQVUsFiMzRygtFDByWSU/Dh8WNzNRaisoMmRJNUZEXCo3Q2F9JV4mXys4TD03Xj80YnlKSFtJXE1OT0pbXF1eX1VmZ2hpamtsbW5vY3R1dnd4eXp7fH1+f3EQACAgECBAQDBAUGBwcGBTUBAAIRAyExEgRBUWFxIhMFMoGRFKGxQiPBUtHwMyRi4XKCkkNTFWNzNPElBhaisoMHJjXC0kSTVKMXZEVVNnRl4vKzhMPTdePzRpSkhbSVxNTk9KW1xdXl9VZmdoaWprbG1ub2JzdHV2d3h5ent8f/2gAMAwEAAhEDEQA/APU7LK6mOsscGMYJc5xgADu4lRqvrtc5rZDmiSHNc0xufWD7w36TqnqGbTkXY7mY1jab5a6uyxrntBa5r/fXVbjPs4+h6yo0VjB9J2W9s11kNc7a615hjXucaqsetv0PzK/0vrIG7jQBBJ4tfVHT0nh/SU6qSrHqGJG4WbhIBLQSBP7xH+d/UQMrr3S8N9bci3YLQ8sMEz6YDn+xv6V3s3v3tr9Nno3eonAEmgLKCQNSadBJZf8Azm6Fu2fa2bjBa0BxLg7b6Tqm7f0rMje37K+v+lf9p/VUK/rV0GxpLMprnTAY33uP0uGVeo76DPV2fzlVP6S/0k725/uy+xHHH94fa66Sq4HU8PqFZfivD9oaXAdtw3MLX/QtY78y2p1lVn+DerSaQQaOi4G9lJJJIKUkvPev9Zy6PrxVgV5uUwPvwg3GrJFOxzmetu2/mv8A0nrbv/Vfbuyb9zgNu0EtB29wdsfTanzxmIiT+kLC2M+InT5TTbSVM5N3YtmYgtjmP5f0vpqVeTYYJG5scNbrP+e5MXNpJMDIB4nseU6Sn//Q9VQ7KKbY9VjX7ZjcAeeURJJSD7FiRHpMg6RHnKHkdMwr7G22Y9NljN+11jA4j1G+ldt/42s7LP31bSRBI2VTk4f1b6ViPdbXj1vsdZ6rX2De5pBYWMqcR+jqp9Kr0K/8Gi1dC6VS4upwsatxkS2sDkPY7j95l1rP7a0UkTOZ3kftWiER0H2NXB6dh4IeMWirHFhlwqbtBjRv+a1WkkkCSTZ1XAAaBSSSSCnLt+r2FZ1K7qQsuZdk+j67WPhjxRPohzC0/vO+itE00kkmtpJ5MBTSRMias7IAA26sBTSJhjRPOg1TtrraZa0NPEgAKSSCVJJJJKf/0fVUkkklKSSSSUpJJJJSkkkklKSSSSUpJJJJSkkkklKSSSSU/wD/0vVUkkklKSSSSUpJJJJSkkkklKSSSSUpJJJJSkkkklKSSSSU/wD/0/VUlXvcRk4zQSA5zpAMTDXct/PVhKlKSSSSUpJJJJSkkkklKSSSSUpJJJJSkkkklKSSSSU//9T02+kvycawMDhU5xLtJbLHM7+73T+arCSSV7eClJJJJKUkkkkpSSSg+1jPpHXwHKSmaSGy+t5jg9pUzwkprWZDiYYYaO/cpmZD2n3Hc3v4oUEaHkaFJJTfBkSOE6jWCGNB5ACr32uLiwGGjQ+ZSU2klQaS0y0wfJH+0uidJ28fyphJT//V9VSSSSUpJJJJSkkkklKVAkuJceTqr6q20ODiWCWnWO4SUhV2pxdW0nkjVVmUWOOo2juSj2WCpgAGvDR8ElL2UseZOh8QmZQxhnUkcSg/aLZmR8IR6rRY3wI5CSkip3sLbCeztQVbJAEkwPEqHqUv9sgz2KSmmi+g+ODO2fnP0f8ANVhtdbTIaAfFTSU//9b1VJJJJSkkkklKSSQshxFRjvokpTsisGNT8FNljHiWmfFUVOlxbY2O5g/NJTdVbKB3tPYiFZUXsa8bXCQkpoo+KDuce0QpfZWz9IwisY1g2tEBJTWyHl1hb2bwEJHyKnbt7RIPKCASYAJKSm1jvLmQdS0xKb1HTP8Awm2PKIUqa/TZB5OpT+mJn+VujziElP8A/9f1VJJJJSkkkklKUXsD2lp791JJJTSdTY0xtJ8xqi00ODt79I4CsIZuqBjcElMyQBJ4CqPve46EtHYBWne+shpncCAVRSUlrve0+4y3vPKtqgASYHJ0Ct3EtpMeAH8ElLOyK2mNXfBSrtZZ9HnwPKpKTCWvaRyCkpvJJnENBJ4Gqq/abPxn5fupKf/Q9SssbUwvfO0ckAn/AKlD+242vuOkSdro147eSOklopCcvHDi0uMifzXfm/SjROcmkCZOrQ/6LuDp+6ipJKQfbcfc9suDq9HAscO+zT2+73fupzl0AkEnQgH2ujWe+3+SioQxKQ0Nl8B24e93P+cjopFk5lQqBlwa4BxO13B3fyf5CrfaKQCS7QRrB78dlayMGq1p+lM7o3vAn+y72qu+gEkO9RpdJIa97dT3G13klopnjZlAeWh8g9truR/ZRLL8J0OcS3cJDtrhIH9lRpwGQC42iBtb+lsBjnX3or6aWCXOs10A9R//AJNBTGu/DZLmk6cktdwf7Km7Jx3N2kkhwPDXdgS783+SkMps6tMIzXBw3NMgpKc+2xlQ3OLi0wZax50du2zDf5DlKuylpD7HEAbdNruXDcydFde8MbuKrnKsnQADw5S0UzGRTeXUsJ3wZBa5vHtP0mhA2P8ADvt+atVXCzThw5CIkp//2f/tEjhQaG90b3Nob3AgMy4wADhCSU0EBAAAAAAADxwBWgADGyVHHAIAAAIAAAA4QklNBCUAAAAAABDNz/p9qMe+CQVwdq6vBcNOOEJJTQQ6AAAAAAD/AAAAEAAAAAEAAAAAAAtwcmludE91dHB1dAAAAAUAAAAAUHN0U2Jvb2wBAAAAAEludGVlbnVtAAAAAEludGUAAAAASW1nIAAAAA9wcmludFNpeHRlZW5CaXRib29sAAAAAAtwcmludGVyTmFtZVRFWFQAAAAJADIAZABvACAAcABpAHMAbwAAAAAAD3ByaW50UHJvb2ZTZXR1cE9iamMAAAARAEEAagB1AHMAdABlACAAZABlACAAcAByAHUAZQBiAGEAAAAAAApwcm9vZlNldHVwAAAAAQAAAABCbHRuZW51bQAAAAxidWlsdGluUHJvb2YAAAAJcHJvb2ZDTVlLADhCSU0EOwAAAAACLQAAABAAAAABAAAAAAAScHJpbnRPdXRwdXRPcHRpb25zAAAAFwAAAABDcHRuYm9vbAAAAAAAQ2xicmJvb2wAAAAAAFJnc01ib29sAAAAAABDcm5DYm9vbAAAAAAAQ250Q2Jvb2wAAAAAAExibHNib29sAAAAAABOZ3R2Ym9vbAAAAAAARW1sRGJvb2wAAAAAAEludHJib29sAAAAAABCY2tnT2JqYwAAAAEAAAAAAABSR0JDAAAAAwAAAABSZCAgZG91YkBv4AAAAAAAAAAAAEdybiBkb3ViQG/gAAAAAAAAAAAAQmwgIGRvdWJAb+AAAAAAAAAAAABCcmRUVW50RiNSbHQAAAAAAAAAAAAAAABCbGQgVW50RiNSbHQAAAAAAAAAAAAAAABSc2x0VW50RiNQeGxAcsAAAAAAAAAAAAp2ZWN0b3JEYXRhYm9vbAEAAAAAUGdQc2VudW0AAAAAUGdQcwAAAABQZ1BDAAAAAExlZnRVbnRGI1JsdAAAAAAAAAAAAAAAAFRvcCBVbnRGI1JsdAAAAAAAAAAAAAAAAFNjbCBVbnRGI1ByY0BZAAAAAAAAAAAAEGNyb3BXaGVuUHJpbnRpbmdib29sAAAAAA5jcm9wUmVjdEJvdHRvbWxvbmcAAAAAAAAADGNyb3BSZWN0TGVmdGxvbmcAAAAAAAAADWNyb3BSZWN0UmlnaHRsb25nAAAAAAAAAAtjcm9wUmVjdFRvcGxvbmcAAAAAADhCSU0D7QAAAAAAEAEsAAAAAQACASwAAAABAAI4QklNBCYAAAAAAA4AAAAAAAAAAAAAP4AAADhCSU0EDQAAAAAABAAAAB44QklNBBkAAAAAAAQAAAAeOEJJTQPzAAAAAAAJAAAAAAAAAAABADhCSU0nEAAAAAAACgABAAAAAAAAAAI4QklNA/UAAAAAAEgAL2ZmAAEAbGZmAAYAAAAAAAEAL2ZmAAEAoZmaAAYAAAAAAAEAMgAAAAEAWgAAAAYAAAAAAAEANQAAAAEALQAAAAYAAAAAAAE4QklNA/gAAAAAAHAAAP////////////////////////////8D6AAAAAD/////////////////////////////A+gAAAAA/////////////////////////////wPoAAAAAP////////////////////////////8D6AAAOEJJTQQIAAAAAAAQAAAAAQAAAkAAAAJAAAAAADhCSU0EHgAAAAAABAAAAAA4QklNBBoAAAAAA4kAAAAGAAAAAAAAAAAAAAzrAAAJ6wAAACoARgBvAHIAbQBhAHQAbwBfAEgAbwBqAGEAXwBNAGUAbQBiAHIAZQB0AGUAIABlAGwAZQBjAHQAcgBvAGkAbgBnAGUAbgBpAGUAcgDtAGEALQAwADEAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAACesAAAzrAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAEAAAAAAABudWxsAAAAAgAAAAZib3VuZHNPYmpjAAAAAQAAAAAAAFJjdDEAAAAEAAAAAFRvcCBsb25nAAAAAAAAAABMZWZ0bG9uZwAAAAAAAAAAQnRvbWxvbmcAAAzrAAAAAFJnaHRsb25nAAAJ6wAAAAZzbGljZXNWbExzAAAAAU9iamMAAAABAAAAAAAFc2xpY2UAAAASAAAAB3NsaWNlSURsb25nAAAAAAAAAAdncm91cElEbG9uZwAAAAAAAAAGb3JpZ2luZW51bQAAAAxFU2xpY2VPcmlnaW4AAAANYXV0b0dlbmVyYXRlZAAAAABUeXBlZW51bQAAAApFU2xpY2VUeXBlAAAAAEltZyAAAAAGYm91bmRzT2JqYwAAAAEAAAAAAABSY3QxAAAABAAAAABUb3AgbG9uZwAAAAAAAAAATGVmdGxvbmcAAAAAAAAAAEJ0b21sb25nAAAM6wAAAABSZ2h0bG9uZwAACesAAAADdXJsVEVYVAAAAAEAAAAAAABudWxsVEVYVAAAAAEAAAAAAABNc2dlVEVYVAAAAAEAAAAAAAZhbHRUYWdURVhUAAAAAQAA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MgAwADEANQAAAAEAOEJJTQQGAAAAAAAHAAgBAQABAQD/4Q0BaHR0cDovL25zLmFkb2JlLmNvbS94YXAvMS4wLwA8P3hwYWNrZXQgYmVnaW49Iu+7vyIgaWQ9Ilc1TTBNcENlaGlIenJlU3pOVGN6a2M5ZCI/PiA8eDp4bXBtZXRhIHhtbG5zOng9ImFkb2JlOm5zOm1ldGEvIiB4OnhtcHRrPSJBZG9iZSBYTVAgQ29yZSA1LjYtYzA2NyA3OS4xNTc3NDcsIDIwMTUvMDMvMzAtMjM6NDA6NDIgICAgICAgICI+IDxyZGY6UkRGIHhtbG5zOnJkZj0iaHR0cDovL3d3dy53My5vcmcvMTk5OS8wMi8yMi1yZGYtc3ludGF4LW5zIyI+IDxyZGY6RGVzY3JpcHRpb24gcmRmOmFib3V0PSIiIHhtbG5zOnhtcD0iaHR0cDovL25zLmFkb2JlLmNvbS94YXAvMS4wLyIgeG1sbnM6ZGM9Imh0dHA6Ly9wdXJsLm9yZy9kYy9lbGVtZW50cy8xLjEvIiB4bWxuczpwaG90b3Nob3A9Imh0dHA6Ly9ucy5hZG9iZS5jb20vcGhvdG9zaG9wLzEuMC8iIHhtbG5zOnhtcE1NPSJodHRwOi8vbnMuYWRvYmUuY29tL3hhcC8xLjAvbW0vIiB4bWxuczpzdEV2dD0iaHR0cDovL25zLmFkb2JlLmNvbS94YXAvMS4wL3NUeXBlL1Jlc291cmNlRXZlbnQjIiB4bXA6Q3JlYXRlRGF0ZT0iMjAxNy0wNS0yM1QwOToyNzoxNS0wNTowMCIgeG1wOk1vZGlmeURhdGU9IjIwMTctMDUtMjZUMTE6NDQ6MTYtMDU6MDAiIHhtcDpNZXRhZGF0YURhdGU9IjIwMTctMDUtMjZUMTE6NDQ6MTYtMDU6MDAiIGRjOmZvcm1hdD0iaW1hZ2UvanBlZyIgcGhvdG9zaG9wOkNvbG9yTW9kZT0iMyIgcGhvdG9zaG9wOklDQ1Byb2ZpbGU9IkFkb2JlIFJHQiAoMTk5OCkiIHhtcE1NOkluc3RhbmNlSUQ9InhtcC5paWQ6YTUzMTFhNWUtZTA4Ni1hNzRiLTk4NTItNjNmZTVjMTFmMWI3IiB4bXBNTTpEb2N1bWVudElEPSJ4bXAuZGlkOmE1MzExYTVlLWUwODYtYTc0Yi05ODUyLTYzZmU1YzExZjFiNyIgeG1wTU06T3JpZ2luYWxEb2N1bWVudElEPSJ4bXAuZGlkOmE1MzExYTVlLWUwODYtYTc0Yi05ODUyLTYzZmU1YzExZjFiNyI+IDx4bXBNTTpIaXN0b3J5PiA8cmRmOlNlcT4gPHJkZjpsaSBzdEV2dDphY3Rpb249InNhdmVkIiBzdEV2dDppbnN0YW5jZUlEPSJ4bXAuaWlkOmE1MzExYTVlLWUwODYtYTc0Yi05ODUyLTYzZmU1YzExZjFiNyIgc3RFdnQ6d2hlbj0iMjAxNy0wNS0yNlQxMTo0NDoxNi0wNTowMCIgc3RFdnQ6c29mdHdhcmVBZ2VudD0iQWRvYmUgUGhvdG9zaG9wIENDIDIwMTUgKFdpbmRvd3MpIiBzdEV2dDpjaGFuZ2VkPSIvIi8+IDwvcmRmOlNlcT4gPC94bXBNTTpIaXN0b3J5PiA8L3JkZjpEZXNjcmlwdGlvbj4gPC9yZGY6UkRGPiA8L3g6eG1wbWV0YT4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA8P3hwYWNrZXQgZW5kPSJ3Ij8+/+ICQElDQ19QUk9GSUxFAAEBAAACMEFEQkUCEAAAbW50clJHQiBYWVogB88ABgADAAAAAAAAYWNzcEFQUEwAAAAAbm9uZQAAAAAAAAAAAAAAAAAAAAAAAPbWAAEAAAAA0y1BREJFAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAKY3BydAAAAPwAAAAyZGVzYwAAATAAAABrd3RwdAAAAZwAAAAUYmtwdAAAAbAAAAAUclRSQwAAAcQAAAAOZ1RSQwAAAdQAAAAOYlRSQwAAAeQAAAAOclhZWgAAAfQAAAAUZ1hZWgAAAggAAAAUYlhZWgAAAhwAAAAUdGV4dAAAAABDb3B5cmlnaHQgMTk5OSBBZG9iZSBTeXN0ZW1zIEluY29ycG9yYXRlZAAAAGRlc2MAAAAAAAAAEUFkb2JlIFJHQiAoMTk5OCkAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFhZWiAAAAAAAADzUQABAAAAARbMWFlaIAAAAAAAAAAAAAAAAAAAAABjdXJ2AAAAAAAAAAECMwAAY3VydgAAAAAAAAABAjMAAGN1cnYAAAAAAAAAAQIzAABYWVogAAAAAAAAnBgAAE+lAAAE/FhZWiAAAAAAAAA0jQAAoCwAAA+VWFlaIAAAAAAAACYxAAAQLwAAvpz/7gAhQWRvYmUAZEAAAAABAwAQAwIDBgAAAAAAAAAAAAAAAP/bAIQAAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQIBAQEBAQECAgICAgICAgICAgICAgMDAwMDAwMDAwMDAwMDAwEBAQEBAQECAQECAwICAgMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMD/8IAEQgM6wnrAwERAAIRAQMRAf/EAXsAAQEAAgICAwEAAAAAAAAAAAABBwgGCQUKAgQLAwEBAQABBQEBAQEAAAAAAAAAAAECAwQFBwgGCQoLEAAAAQoFAgIHBgYBAgQHAAMBABARAgMEBQYHCCAhMUEJMEBwElBgMhMzNgqAFBUXNzkiNRYYOBkaQiM0Jyk6kMDQ4EMmKCUkShEAAAQEAgYGCAEEBg4NEA8ZAQIDBAARBQYhB/AxQVFhEnGBkaETCBCxwdHh8SIUFTIjFglAYHBCUjMgMFBiciS1drYXd7c4eICCkkNTNCU1ddWWN5iiY3OTdLRFlSY2RlYnlxgostKDo7PTRFSUxNRVZaVmhtZHV4enuMJkhabXSFhoOaTGkMDQ4GeIChIAAgECAwMFCAsJCwgGBwcFAQIRAAMhEgQQMQVBUSITBiAwcPBhcYGRQFBggKGxwdEysxThQrIj03S0NQfxUnKC0jNzk5QVdZBikqJDozSEwoNUpNQWU8PjJERkNsDQ4GPE1RcIJVUmGP/aAAwDAQECEQMRAAAA9/gAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAxLnjxSzYTTzoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA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AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA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";

/* ============================================================
   V236 · INFORME SOBRE PLANTILLA OFICIOS + VISUALES POWER BI
============================================================ */
function v236Safe(value){
  return String(value==null?"":value)
    .replace(/[→➜⇒]/g,"->")
    .replace(/[≥]/g,">=")
    .replace(/[≤]/g,"<=")
    .replace(/[•·]/g," - ")
    .replace(/[–—]/g,"-")
    .replace(/\s+/g," ").trim();
}
function v236Color(name){
  return {
    navy:"#002b5c",blue:"#0057b8",blue2:"#1d70b7",sky:"#eaf3fb",
    yellow:"#f5c400",green:"#15a36d",orange:"#d97706",red:"#d92d20",
    gray:"#667085",light:"#f5f7fa",line:"#d7e1ea",white:"#ffffff"
  }[name]||name;
}
function v236DailyTrend(m){
  var map={};
  (m.caseRows||[]).filter(function(x){return x.closed&&isFinite(x.end);}).forEach(function(x){
    var d=new Date(x.end),key=d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
    if(!map[key])map[key]={day:key,count:0,lead:[]};
    map[key].count++;map[key].lead.push(Number(x.lead||0));
  });
  return Object.keys(map).sort().map(function(k){
    var r=map[k];return {day:k,count:r.count,avgLt:v232Average(r.lead)};
  });
}
function v236WaitRows(analysis){
  var rows=((analysis.m.specialWait||{}).all||[]),seen={};
  return rows.filter(function(x){
    var key=[x.pedido,x.category,x.area,x.process,Math.round(Number(x.start||0)/60000),Math.round(Number(x.end||0)/60000),Math.round(Number(x.duration||0)/60000)].join("|");
    if(seen[key])return false;seen[key]=1;return true;
  });
}
function v236EnhanceAnalysis(analysis){
  analysis.dailyTrend=v236DailyTrend(analysis.m);
  analysis.reportWaitRows=v236WaitRows(analysis);
  analysis.topProcesses=analysis.processHealth.slice().sort(function(a,b){return Number(a.health||0)-Number(b.health||0);});
  analysis.topAreas=analysis.areaHealth.slice().sort(function(a,b){return Number(a.health||0)-Number(b.health||0);});
  analysis.keyMessage=v234PdfConclusion(analysis);
  return analysis;
}

/* --------------------- CANVAS POWER BI --------------------- */
function v236Canvas(w,h){
  var c=document.createElement("canvas");c.width=w;c.height=h;var x=c.getContext("2d");
  x.fillStyle="#f4f7fb";x.fillRect(0,0,w,h);return {canvas:c,ctx:x};
}
function v236Round(ctx,x,y,w,h,r,fill,stroke){
  ctx.save();ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();
  if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=1;ctx.stroke();}ctx.restore();
}
function v236ShadowCard(ctx,x,y,w,h,r){
  ctx.save();ctx.shadowColor="rgba(16,24,40,.12)";ctx.shadowBlur=18;ctx.shadowOffsetY=7;v236Round(ctx,x,y,w,h,r,"#ffffff",null);ctx.restore();
}
function v236Title(ctx,title,subtitle,w){
  ctx.fillStyle=v236Color("navy");ctx.font='700 30px "Century Gothic",Arial';ctx.fillText(title,42,52);
  if(subtitle){ctx.fillStyle="#667085";ctx.font='400 16px "Century Gothic",Arial';ctx.fillText(subtitle,42,82);}
  ctx.fillStyle=v236Color("yellow");ctx.fillRect(42,96,95,6);
  ctx.fillStyle="#dce6f0";ctx.fillRect(137,98,w-179,2);
}
function v236StatusColor(v){return Number(v)>=85?v236Color("green"):Number(v)>=65?v236Color("orange"):v236Color("red");}
function v236DashboardCanvas(analysis){
  var o=v236Canvas(1600,900),c=o.ctx,m=analysis.m,r=m.reliability||{},signals=analysis.signals||[];
  v236Title(c,"Dashboard ejecutivo","Indicadores consolidados para toma de decisiones",1600);
  v236ShadowCard(c,42,128,430,330,22);
  var cx=257,cy=290,rad=116,score=analysis.score,color=v236StatusColor(score);
  c.lineWidth=27;c.strokeStyle="#e8eef5";c.beginPath();c.arc(cx,cy,rad,Math.PI*.78,Math.PI*2.22);c.stroke();
  c.strokeStyle=color;c.beginPath();c.arc(cx,cy,rad,Math.PI*.78,Math.PI*.78+Math.PI*1.44*(score/100));c.stroke();
  c.textAlign="center";c.fillStyle=v236Color("navy");c.font='700 66px "Century Gothic",Arial';c.fillText(score+"%",cx,cy+20);
  c.font='700 18px "Century Gothic",Arial';c.fillStyle=color;c.fillText(analysis.scoreState.label.toUpperCase(),cx,cy+62);c.textAlign="left";
  c.fillStyle="#475467";c.font='400 15px "Century Gothic",Arial';c.fillText("Índice compuesto de desempeño",92,425);
  var cards=[
    ["Pedidos trazados",m.cases||0,"Cobertura "+v235Percent(m.cases,Math.max(1,m.totalLoaded||m.cases))+"%"],
    ["WIP actual",m.wip||0,(m.lateWip||0)+" fuera de meta"],
    ["Lead Time P50",v225Time(m.leadP50||0),"P90 "+v225Time(m.leadP90||0)],
    ["Throughput",String(m.throughput||0)+"/día",String(m.closed||0)+" cerrados"],
    ["Confiabilidad",String(Number(r.avg||0))+"%",String(Number(r.low||0))+" críticos"],
    ["No entregas",m.noDeliveryCount||0,String(((m.specialWait||{}).noDeliveryOpen||0))+" abiertas"]
  ];
  cards.forEach(function(k,i){
    var col=i%3,row=Math.floor(i/3),x=510+col*345,y=128+row*160;
    v236ShadowCard(c,x,y,310,132,18);c.fillStyle="#eef5fb";v236Round(c,x+18,y+18,50,50,14,"#eef5fb",null);
    c.fillStyle=v236Color("blue");c.font='700 20px "Century Gothic",Arial';c.fillText(String(i+1).padStart(2,"0"),x+30,y+51);
    c.fillStyle="#667085";c.font='600 14px "Century Gothic",Arial';c.fillText(k[0],x+82,y+38);
    c.fillStyle=v236Color("navy");c.font='700 32px "Century Gothic",Arial';c.fillText(String(k[1]),x+82,y+78);
    c.fillStyle="#98a2b3";c.font='400 13px "Century Gothic",Arial';c.fillText(String(k[2]),x+82,y+104);
  });
  v236ShadowCard(c,42,500,1516,340,22);
  c.fillStyle=v236Color("navy");c.font='700 22px "Century Gothic",Arial';c.fillText("Semáforos de control",70,548);
  signals.slice(0,6).forEach(function(s,i){
    var x=70+(i%3)*490,y=590+Math.floor(i/3)*105,w=445;
    c.fillStyle="#f8fafc";v236Round(c,x,y,w,78,14,"#f8fafc","#e2e8f0");
    c.fillStyle=v236StatusColor(s.value);v236Round(c,x,y,8,78,4,v236StatusColor(s.value),null);
    c.fillStyle="#667085";c.font='600 14px "Century Gothic",Arial';c.fillText(s.label,x+24,y+27);
    c.fillStyle=v236Color("navy");c.font='700 27px "Century Gothic",Arial';c.fillText(String(s.value)+s.suffix,x+24,y+59);
    c.textAlign="right";c.fillStyle=v236StatusColor(s.value);c.font='700 13px "Century Gothic",Arial';c.fillText(s.status.label,x+w-20,y+51);c.textAlign="left";
  });
  return o.canvas.toDataURL("image/png");
}
function v236TrendCanvas(analysis){
  var o=v236Canvas(1600,820),c=o.ctx,rows=analysis.dailyTrend||[];
  v236Title(c,"Tendencia del flujo","Cierres diarios y evolución del Lead Time promedio",1600);
  v236ShadowCard(c,42,128,1516,630,22);
  var x=110,y=190,w=1360,h=440,counts=rows.map(function(r){return r.count;}),lts=rows.map(function(r){return v234MsHours(r.avgLt);});
  var maxC=Math.max.apply(Math,[1].concat(counts)),maxLt=Math.max.apply(Math,[1].concat(lts));
  c.strokeStyle="#e4e7ec";c.lineWidth=1;c.font='400 12px "Century Gothic",Arial';c.fillStyle="#98a2b3";
  for(var g=0;g<=5;g++){var yy=y+h*g/5;c.beginPath();c.moveTo(x,yy);c.lineTo(x+w,yy);c.stroke();c.fillText(String(Math.round(maxC*(1-g/5))),x-34,yy+4);}
  if(rows.length>1){
    var grad=c.createLinearGradient(0,y,0,y+h);grad.addColorStop(0,"rgba(0,87,184,.28)");grad.addColorStop(1,"rgba(0,87,184,.02)");
    c.beginPath();rows.forEach(function(r,i){var xx=x+i*w/(rows.length-1),yy=y+h-(r.count/maxC)*h;if(i===0)c.moveTo(xx,yy);else c.lineTo(xx,yy);});c.lineTo(x+w,y+h);c.lineTo(x,y+h);c.closePath();c.fillStyle=grad;c.fill();
    c.beginPath();rows.forEach(function(r,i){var xx=x+i*w/(rows.length-1),yy=y+h-(r.count/maxC)*h;if(i===0)c.moveTo(xx,yy);else c.lineTo(xx,yy);});c.strokeStyle=v236Color("blue");c.lineWidth=5;c.stroke();
    rows.forEach(function(r,i){
      var xx=x+i*w/(rows.length-1),yy=y+h-(r.count/maxC)*h;
      c.fillStyle=v236Color("yellow");c.beginPath();c.arc(xx,yy,7,0,Math.PI*2);c.fill();
      if(i===0||i===rows.length-1||i%Math.max(1,Math.floor(rows.length/8))===0){
        c.textAlign="center";c.fillStyle="#667085";c.font='400 12px "Century Gothic",Arial';
        c.fillText(r.day.slice(5),xx,y+h+28);c.textAlign="left";
      }
    });
    c.beginPath();rows.forEach(function(r,i){var xx=x+i*w/(rows.length-1),yy=y+h-(v234MsHours(r.avgLt)/maxLt)*h;if(i===0)c.moveTo(xx,yy);else c.lineTo(xx,yy);});c.strokeStyle=v236Color("orange");c.lineWidth=3;c.setLineDash([8,7]);c.stroke();c.setLineDash([]);
  }
  c.fillStyle=v236Color("blue");c.fillRect(112,682,20,5);c.fillStyle="#475467";c.font='600 14px "Century Gothic",Arial';c.fillText("Pedidos cerrados",142,688);
  c.strokeStyle=v236Color("orange");c.setLineDash([8,7]);c.beginPath();c.moveTo(305,684);c.lineTo(335,684);c.stroke();c.setLineDash([]);c.fillText("LT promedio",347,688);
  c.fillStyle="#667085";c.font='400 14px "Century Gothic",Arial';c.fillText("Último corte: "+(rows.length?rows[rows.length-1].count:0)+" cierre(s)",1180,688);
  return o.canvas.toDataURL("image/png");
}
function v236ProcessCanvas(analysis){
  var o=v236Canvas(1600,900),c=o.ctx,rows=analysis.processHealth.slice().sort(function(a,b){return b.avg-a.avg;});
  v236Title(c,"Desempeño por proceso","Lead Time, cumplimiento, WIP y salud integral",1600);
  v236ShadowCard(c,42,128,880,710,22);c.fillStyle=v236Color("navy");c.font='700 21px "Century Gothic",Arial';c.fillText("Lead Time promedio",72,174);
  var max=Math.max.apply(Math,[1].concat(rows.map(function(r){return v234MsHours(r.avg);})));rows.slice(0,10).forEach(function(r,i){var y=215+i*57,val=v234MsHours(r.avg),bw=590*val/max;c.fillStyle="#475467";c.font='600 14px "Century Gothic",Arial';c.fillText(String(r.label).slice(0,31),72,y+16);v236Round(c,340,y,590,20,10,"#edf2f7",null);var gr=c.createLinearGradient(340,0,930,0);gr.addColorStop(0,v236Color("blue2"));gr.addColorStop(1,v236Color("blue"));v236Round(c,340,y,Math.max(8,bw),20,10,gr,null);c.textAlign="right";c.fillStyle=v236Color("navy");c.font='700 14px "Century Gothic",Arial';c.fillText(v225Time(r.avg),900,y+16);c.textAlign="left";});
  v236ShadowCard(c,960,128,598,330,22);c.fillStyle=v236Color("navy");c.font='700 21px "Century Gothic",Arial';c.fillText("Cumplimiento",990,174);rows.slice(0,5).forEach(function(r,i){var y=210+i*45;c.fillStyle="#667085";c.font='600 13px "Century Gothic",Arial';c.fillText(String(r.label).slice(0,24),990,y+14);v236Round(c,1190,y,300,15,8,"#edf2f7",null);v236Round(c,1190,y,Math.max(5,300*Math.min(1,Number(r.slaPct||0)/100)),15,8,v236StatusColor(r.slaPct),null);c.textAlign="right";c.fillStyle=v236Color("navy");c.font='700 13px "Century Gothic",Arial';c.fillText(Number(r.slaPct||0)+"%",1520,y+14);c.textAlign="left";});
  v236ShadowCard(c,960,492,598,346,22);c.fillStyle=v236Color("navy");c.font='700 21px "Century Gothic",Arial';c.fillText("Salud integral",990,538);rows.slice().sort(function(a,b){return a.health-b.health;}).slice(0,5).forEach(function(r,i){var y=573+i*48;c.fillStyle="#667085";c.font='600 13px "Century Gothic",Arial';c.fillText(String(r.label).slice(0,24),990,y+15);c.fillStyle=v236StatusColor(r.health);c.font='700 23px "Century Gothic",Arial';c.textAlign="right";c.fillText(r.health+"%",1518,y+18);c.textAlign="left";c.fillStyle="#98a2b3";c.font='400 11px "Century Gothic",Arial';c.fillText(r.healthStatus.label,1325,y+15);});
  return o.canvas.toDataURL("image/png");
}
function v236MatrixCanvas(analysis){
  var o=v236Canvas(1600,900),c=o.ctx,rows=analysis.processes;
  v236Title(c,"Matriz de procesos","Relación entre Lead Time, cumplimiento y volumen de WIP",1600);
  v236ShadowCard(c,42,128,1516,710,22);var x=130,y=210,w=1330,h=500;
  c.fillStyle="#fff6ed";c.fillRect(x,y,w/2,h/2);c.fillStyle="#ecfdf3";c.fillRect(x+w/2,y,w/2,h/2);c.fillStyle="#fef3f2";c.fillRect(x,y+h/2,w/2,h/2);c.fillStyle="#eff8ff";c.fillRect(x+w/2,y+h/2,w/2,h/2);
  c.strokeStyle="#98a2b3";c.lineWidth=4;c.beginPath();c.moveTo(x+w/2,y);c.lineTo(x+w/2,y+h);c.moveTo(x,y+h/2);c.lineTo(x+w,y+h/2);c.stroke();
  c.fillStyle="#475467";c.font='600 14px "Century Gothic",Arial';c.fillText("MENOR LEAD TIME",x,y+h+35);c.textAlign="right";c.fillText("MAYOR LEAD TIME",x+w,y+h+35);c.textAlign="left";c.save();c.translate(75,y+h/2);c.rotate(-Math.PI/2);c.textAlign="center";c.fillText("CUMPLIMIENTO",0,0);c.restore();
  c.fillStyle="#667085";c.font='600 13px "Century Gothic",Arial';c.fillText("Rápido, requiere control",x+25,y+28);c.fillText("Alto desempeño",x+w/2+25,y+28);c.fillText("Crítico",x+25,y+h/2+28);c.fillText("Lento, pero estable",x+w/2+25,y+h/2+28);
  var maxLt=Math.max.apply(Math,[1].concat(rows.map(function(r){return Number(r.avg||0);})));rows.forEach(function(r){var xx=x+Math.min(w,Number(r.avg||0)/maxLt*w),yy=y+h-Math.min(h,Number(r.slaPct||0)/100*h),rad=Math.max(10,Math.min(32,10+Number(r.wip||0)*2)),col=v236StatusColor(v235HealthScoreProcess(r));c.save();c.shadowColor="rgba(16,24,40,.18)";c.shadowBlur=8;c.fillStyle=col;c.beginPath();c.arc(xx,yy,rad,0,Math.PI*2);c.fill();c.restore();c.fillStyle="#344054";c.font='700 12px "Century Gothic",Arial';c.fillText(String(r.label).slice(0,23),xx+rad+5,yy+4);});
  c.fillStyle="#667085";c.font='400 12px "Century Gothic",Arial';c.fillText("El tamaño de cada burbuja representa el WIP del proceso.",130,790);
  return o.canvas.toDataURL("image/png");
}
function v236AreaCanvas(analysis){
  var o=v236Canvas(1600,900),c=o.ctx,rows=analysis.areaHealth;
  v236Title(c,"Desempeño por área","Cumplimiento, confiabilidad, Lead Time y salud integral",1600);
  rows.slice(0,6).forEach(function(a,i){var col=i%3,row=Math.floor(i/3),x=42+col*505,y=128+row*330;v236ShadowCard(c,x,y,470,290,22);c.fillStyle=v236StatusColor(a.health);c.fillRect(x,y,470,9);c.fillStyle=v236Color("navy");c.font='700 25px "Century Gothic",Arial';c.fillText(a.label,x+28,y+55);c.fillStyle="#667085";c.font='600 13px "Century Gothic",Arial';c.fillText("SALUD INTEGRAL",x+28,y+90);c.fillStyle=v236StatusColor(a.health);c.font='700 42px "Century Gothic",Arial';c.fillText(a.health+"%",x+28,y+136);c.fillStyle="#475467";c.font='500 14px "Century Gothic",Arial';c.fillText("LT promedio",x+28,y+180);c.fillText("Cumplimiento",x+28,y+214);c.fillText("Confiabilidad",x+28,y+248);c.textAlign="right";c.fillStyle=v236Color("navy");c.font='700 15px "Century Gothic",Arial';c.fillText(v225Time(a.avg||0),x+438,y+180);c.fillText(Number(a.compliance||0)+"%",x+438,y+214);c.fillText(Number(a.reliability||0)+"%",x+438,y+248);c.textAlign="left";});
  return o.canvas.toDataURL("image/png");
}
function v236ActorCanvas(analysis){
  var o=v236Canvas(1600,920),c=o.ctx,rows=analysis.actors.slice().sort(function(a,b){return b.active-a.active;}).slice(0,12);
  v236Title(c,"Productividad por actor","Trabajo directo trazado, WIP y cumplimiento",1600);
  v236ShadowCard(c,42,128,1516,730,22);var max=Math.max.apply(Math,[1].concat(rows.map(function(r){return Number(r.active||0);})));rows.forEach(function(r,i){var y=190+i*50,val=Number(r.active||0),bw=780*val/max;c.fillStyle="#344054";c.font='600 14px "Century Gothic",Arial';c.fillText(String(r.user).slice(0,30),72,y+15);v236Round(c,380,y,780,19,10,"#edf2f7",null);var grad=c.createLinearGradient(380,0,1160,0);grad.addColorStop(0,"#5b9bd5");grad.addColorStop(1,"#0057b8");v236Round(c,380,y,Math.max(7,bw),19,10,grad,null);c.textAlign="right";c.fillStyle=v236Color("navy");c.font='700 14px "Century Gothic",Arial';c.fillText(v225Time(r.active||0),1245,y+15);c.fillStyle=v236StatusColor(r.compliance);c.fillText(Number(r.compliance||0)+"%",1350,y+15);c.fillStyle="#667085";c.font='600 13px "Century Gothic",Arial';c.fillText(String(r.open||0)+" WIP",1490,y+15);c.textAlign="left";});
  c.fillStyle="#667085";c.font='400 13px "Century Gothic",Arial';c.fillText("Nota: el Super Admin está excluido. La actividad trazada debe interpretarse junto con complejidad, calidad y cumplimiento.",72,830);
  return o.canvas.toDataURL("image/png");
}
function v236ParetoCanvas(analysis){
  var o=v236Canvas(1600,900),c=o.ctx,rows=analysis.pareto||[];
  v236Title(c,"Pareto de causas","Tiempo asociado y porcentaje acumulado",1600);
  v236ShadowCard(c,42,128,1516,710,22);var x=130,y=215,w=1320,h=475,max=Math.max.apply(Math,[1].concat(rows.map(function(r){return Number(r.value||0);}))),total=rows.reduce(function(s,r){return s+Number(r.value||0);},0),cum=0;
  c.strokeStyle="#e4e7ec";c.lineWidth=1;for(var g=0;g<=5;g++){var yy=y+h*g/5;c.beginPath();c.moveTo(x,yy);c.lineTo(x+w,yy);c.stroke();}
  var barW=Math.max(30,(w/Math.max(1,rows.length))*0.55),points=[];rows.forEach(function(r,i){var center=x+(i+.5)*w/Math.max(1,rows.length),bh=Number(r.value||0)/max*h,top=y+h-bh,grad=c.createLinearGradient(0,top,0,y+h);grad.addColorStop(0,"#0057b8");grad.addColorStop(1,"#79b5e8");v236Round(c,center-barW/2,top,barW,bh,8,grad,null);cum+=Number(r.value||0);points.push([center,y+h-(total?cum/total:0)*h]);c.textAlign="center";c.fillStyle="#475467";c.font='600 12px "Century Gothic",Arial';c.fillText(String(r.label).slice(0,18),center,y+h+26);c.fillStyle=v236Color("navy");c.font='700 12px "Century Gothic",Arial';c.fillText(v225Time(r.value||0),center,top-10);});
  if(points.length){c.strokeStyle=v236Color("yellow");c.lineWidth=5;c.beginPath();points.forEach(function(p,i){if(i===0)c.moveTo(p[0],p[1]);else c.lineTo(p[0],p[1]);});c.stroke();points.forEach(function(p){c.fillStyle=v236Color("yellow");c.beginPath();c.arc(p[0],p[1],7,0,Math.PI*2);c.fill();});}
  c.fillStyle="#667085";c.font='400 13px "Century Gothic",Arial';c.textAlign="left";c.fillText("Barras: tiempo asociado | Línea amarilla: porcentaje acumulado",130,780);
  return o.canvas.toDataURL("image/png");
}
function v236RiskCanvas(analysis){
  var o=v236Canvas(1600,900),c=o.ctx,risks=analysis.risks||[];
  v236Title(c,"Matriz de riesgos operativos","Probabilidad, impacto, evidencia y tratamiento",1600);
  v236ShadowCard(c,42,128,650,710,22);var x=120,y=230,size=480,cell=size/3,colors=[["#ecfdf3","#ecfdf3","#fff6ed"],["#ecfdf3","#fff6ed","#fef3f2"],["#fff6ed","#fef3f2","#fef3f2"]];for(var imp=1;imp<=3;imp++){for(var pr=1;pr<=3;pr++){c.fillStyle=colors[imp-1][pr-1];c.fillRect(x+(pr-1)*cell,y+(3-imp)*cell,cell,cell);c.strokeStyle="#cbd5e1";c.strokeRect(x+(pr-1)*cell,y+(3-imp)*cell,cell,cell);}}
  var groups={};risks.forEach(function(r){var k=r.probability+"|"+r.impact;if(!groups[k])groups[k]=[];groups[k].push(r);});Object.keys(groups).forEach(function(k){var p=k.split("|"),pr=Number(p[0]),im=Number(p[1]),xx=x+(pr-.5)*cell,yy=y+(3-im+.5)*cell;c.fillStyle=v236Color("navy");c.beginPath();c.arc(xx,yy,30,0,Math.PI*2);c.fill();c.textAlign="center";c.fillStyle="#fff";c.font='700 21px "Century Gothic",Arial';c.fillText(groups[k].length,xx,yy+7);c.textAlign="left";});
  c.fillStyle="#667085";c.font='600 14px "Century Gothic",Arial';c.fillText("PROBABILIDAD",x+160,y+size+38);c.save();c.translate(72,y+240);c.rotate(-Math.PI/2);c.textAlign="center";c.fillText("IMPACTO",0,0);c.restore();
  v236ShadowCard(c,730,128,828,710,22);c.fillStyle=v236Color("navy");c.font='700 21px "Century Gothic",Arial';c.fillText("Riesgos prioritarios",765,174);risks.slice(0,8).forEach(function(r,i){var yy=210+i*72,col=r.level==="Alto"?v236Color("red"):r.level==="Medio"?v236Color("orange"):v236Color("green");v236Round(c,765,yy,96,30,15,col,null);c.textAlign="center";c.fillStyle="#fff";c.font='700 13px "Century Gothic",Arial';c.fillText(r.level.toUpperCase(),813,yy+20);c.textAlign="left";c.fillStyle=v236Color("navy");c.font='700 14px "Century Gothic",Arial';c.fillText(String(r.risk).slice(0,44),885,yy+14);c.fillStyle="#667085";c.font='400 12px "Century Gothic",Arial';c.fillText(String(r.evidence).slice(0,66),885,yy+37);c.fillText(String(r.treatment).slice(0,66),885,yy+56);});
  return o.canvas.toDataURL("image/png");
}


/* ============================================================
   V237 · VISUALIZACIONES REFINADAS TIPO POWER BI
   Mantiene datos, plantilla, tablas y estructura de V236.
============================================================ */
var V237_PALETTE={
  navy:"#002B5C",navy2:"#0B3E73",blue:"#0B66C3",blue2:"#2F80ED",
  cyan:"#5BA9E6",sky:"#EAF3FB",yellow:"#F4C300",green:"#12A66A",
  orange:"#F79009",red:"#D92D20",purple:"#7A5AF8",ink:"#26374A",
  gray:"#667085",muted:"#98A2B3",line:"#E3E9F0",soft:"#F5F8FC",
  white:"#FFFFFF"
};
function v237C(name){return V237_PALETTE[name]||name;}
function v237Clamp(value,min,max){return Math.max(min,Math.min(max,Number(value)||0));}
function v237Short(value,max){
  var text=String(value==null?"":value);
  max=max||28;
  return text.length>max?text.slice(0,max-1)+"…":text;
}
function v237Round(ctx,x,y,w,h,r,fill,stroke,lineWidth){
  ctx.save();ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);
  ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();
  if(fill){ctx.fillStyle=fill;ctx.fill();}
  if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=lineWidth||1;ctx.stroke();}
  ctx.restore();
}
function v237Card(ctx,x,y,w,h,r){
  ctx.save();
  ctx.shadowColor="rgba(16,39,68,.10)";
  ctx.shadowBlur=22;
  ctx.shadowOffsetY=8;
  v237Round(ctx,x,y,w,h,r||18,v237C("white"),null);
  ctx.restore();
  v237Round(ctx,x,y,w,h,r||18,null,v237C("line"),1);
}
function v237Canvas(w,h){
  var canvas=document.createElement("canvas");
  canvas.width=w;canvas.height=h;
  var ctx=canvas.getContext("2d");
  var grad=ctx.createLinearGradient(0,0,0,h);
  grad.addColorStop(0,"#FBFCFE");grad.addColorStop(1,"#F3F7FB");
  ctx.fillStyle=grad;ctx.fillRect(0,0,w,h);
  return {canvas:canvas,ctx:ctx};
}
function v237Title(ctx,title,subtitle,w){
  ctx.fillStyle=v237C("navy");ctx.font='700 30px "Century Gothic",Arial';
  ctx.fillText(title,42,50);
  if(subtitle){
    ctx.fillStyle=v237C("gray");ctx.font='400 15px "Century Gothic",Arial';
    ctx.fillText(subtitle,42,78);
  }
  ctx.fillStyle=v237C("yellow");v237Round(ctx,42,94,84,6,3,v237C("yellow"),null);
  ctx.fillStyle=v237C("line");ctx.fillRect(138,96,w-180,2);
}
function v237StatusColor(value){
  return Number(value)>=85?v237C("green"):Number(value)>=65?v237C("orange"):v237C("red");
}
function v237Pill(ctx,x,y,text,color,width){
  width=width||Math.max(82,ctx.measureText(String(text)).width+24);
  v237Round(ctx,x,y,width,28,14,color,null);
  ctx.fillStyle="#fff";ctx.font='700 12px "Century Gothic",Arial';
  ctx.textAlign="center";ctx.fillText(String(text),x+width/2,y+19);ctx.textAlign="left";
}
function v237MetricCard(ctx,x,y,w,h,title,value,detail,color,icon){
  v237Card(ctx,x,y,w,h,17);
  ctx.fillStyle=color||v237C("blue");v237Round(ctx,x,y,7,h,4,color||v237C("blue"),null);
  ctx.fillStyle="#F1F6FB";v237Round(ctx,x+18,y+18,46,46,14,"#F1F6FB",null);
  ctx.fillStyle=color||v237C("blue");ctx.font='700 16px "Century Gothic",Arial';
  ctx.textAlign="center";ctx.fillText(icon||"•",x+41,y+48);ctx.textAlign="left";
  ctx.fillStyle=v237C("gray");ctx.font='600 12px "Century Gothic",Arial';
  ctx.fillText(v237Short(title,28),x+78,y+31);
  ctx.fillStyle=v237C("navy");ctx.font='700 28px "Century Gothic",Arial';
  ctx.fillText(String(value),x+78,y+68);
  ctx.fillStyle=v237C("muted");ctx.font='400 11px "Century Gothic",Arial';
  ctx.fillText(v237Short(detail,34),x+78,y+91);
}
function v237DrawSpark(ctx,rows,x,y,w,h,valueFn,color){
  rows=(rows||[]).slice(-18);
  if(rows.length<2)return;
  var values=rows.map(function(r){return Number(valueFn(r))||0;});
  var max=Math.max.apply(Math,[1].concat(values)),min=Math.min.apply(Math,[0].concat(values));
  var grad=ctx.createLinearGradient(0,y,0,y+h);
  grad.addColorStop(0,"rgba(11,102,195,.22)");grad.addColorStop(1,"rgba(11,102,195,0)");
  ctx.beginPath();
  rows.forEach(function(r,i){
    var xx=x+i*w/(rows.length-1),yy=y+h-(values[i]-min)/(max-min||1)*h;
    if(i===0)ctx.moveTo(xx,yy);else ctx.lineTo(xx,yy);
  });
  ctx.lineTo(x+w,y+h);ctx.lineTo(x,y+h);ctx.closePath();ctx.fillStyle=grad;ctx.fill();
  ctx.beginPath();
  rows.forEach(function(r,i){
    var xx=x+i*w/(rows.length-1),yy=y+h-(values[i]-min)/(max-min||1)*h;
    if(i===0)ctx.moveTo(xx,yy);else ctx.lineTo(xx,yy);
  });
  ctx.strokeStyle=color||v237C("blue");ctx.lineWidth=3;ctx.stroke();
}
function v237Empty(ctx,x,y,w,h,message){
  ctx.fillStyle=v237C("soft");v237Round(ctx,x,y,w,h,14,v237C("soft"),v237C("line"));
  ctx.fillStyle=v237C("muted");ctx.font='500 15px "Century Gothic",Arial';
  ctx.textAlign="center";ctx.fillText(message||"Sin datos suficientes",x+w/2,y+h/2);ctx.textAlign="left";
}

/* DASHBOARD */
function v236DashboardCanvas(analysis){
  var o=v237Canvas(1600,900),c=o.ctx,m=analysis.m,r=m.reliability||{};
  var trends=analysis.dailyTrend||[],processes=(analysis.processHealth||[]).slice().sort(function(a,b){return a.health-b.health;});
  v237Title(c,"Dashboard ejecutivo","Lectura consolidada para toma de decisiones",1600);

  var metrics=[
    ["Pedidos trazados",m.cases||0,"Cobertura "+v235Percent(m.cases,Math.max(1,m.totalLoaded||m.cases))+"%",v237C("blue"),"01"],
    ["WIP actual",m.wip||0,(m.lateWip||0)+" fuera de meta",Number(m.lateWip||0)>0?v237C("orange"):v237C("green"),"02"],
    ["Lead Time P50",v225Time(m.leadP50||0),"P90 "+v225Time(m.leadP90||0),v237C("purple"),"03"],
    ["Throughput",String(m.throughput||0)+"/día",String(m.closed||0)+" pedidos cerrados",v237C("cyan"),"04"]
  ];
  metrics.forEach(function(k,i){v237MetricCard(c,42+i*382,120,354,112,k[0],k[1],k[2],k[3],k[4]);});

  /* Score */
  v237Card(c,42,258,370,330,20);
  c.fillStyle=v237C("navy");c.font='700 19px "Century Gothic",Arial';c.fillText("Índice de desempeño",68,300);
  c.fillStyle=v237C("muted");c.font='400 12px "Century Gothic",Arial';c.fillText("Resultado compuesto del periodo",68,324);
  var cx=227,cy=448,radius=100,score=analysis.score,color=v237StatusColor(score);
  c.lineWidth=24;c.lineCap="round";
  c.strokeStyle="#E8EEF5";c.beginPath();c.arc(cx,cy,radius,Math.PI*.78,Math.PI*2.22);c.stroke();
  c.strokeStyle=color;c.beginPath();c.arc(cx,cy,radius,Math.PI*.78,Math.PI*.78+Math.PI*1.44*(score/100));c.stroke();
  c.lineCap="butt";
  c.fillStyle=v237C("navy");c.font='700 58px "Century Gothic",Arial';c.textAlign="center";c.fillText(score+"%",cx,cy+16);
  c.fillStyle=color;c.font='700 13px "Century Gothic",Arial';c.fillText(analysis.scoreState.label.toUpperCase(),cx,cy+50);c.textAlign="left";
  c.fillStyle=v237C("gray");c.font='400 12px "Century Gothic",Arial';
  c.fillText("Confiabilidad "+Number(r.avg||0)+"%",68,558);
  c.textAlign="right";c.fillText("No entregas "+Number(m.noDeliveryCount||0),386,558);c.textAlign="left";

  /* Salud de procesos */
  v237Card(c,432,258,700,330,20);
  c.fillStyle=v237C("navy");c.font='700 19px "Century Gothic",Arial';c.fillText("Procesos que requieren atención",458,300);
  c.fillStyle=v237C("muted");c.font='400 12px "Century Gothic",Arial';c.fillText("Ranking por salud integral",458,324);
  processes.slice(0,5).forEach(function(p,i){
    var yy=357+i*45,val=Number(p.health||0),barX=690,barW=330;
    c.fillStyle=v237C("ink");c.font='600 12px "Century Gothic",Arial';c.fillText(v237Short(p.label,29),458,yy+14);
    v237Round(c,barX,yy,barW,14,7,"#EDF2F7",null);
    v237Round(c,barX,yy,Math.max(5,barW*val/100),14,7,v237StatusColor(val),null);
    c.fillStyle=v237C("navy");c.font='700 12px "Century Gothic",Arial';c.textAlign="right";c.fillText(val+"%",1092,yy+13);c.textAlign="left";
  });

  /* Control WIP */
  v237Card(c,1152,258,406,330,20);
  c.fillStyle=v237C("navy");c.font='700 19px "Century Gothic",Arial';c.fillText("Control del WIP",1178,300);
  var totalWip=Math.max(1,Number(m.wip||0)),late=Number(m.lateWip||0),onTime=Math.max(0,totalWip-late);
  c.fillStyle=v237C("muted");c.font='400 12px "Century Gothic",Arial';c.fillText("Pedidos abiertos por condición",1178,324);
  c.fillStyle="#EDF2F7";v237Round(c,1178,358,354,32,16,"#EDF2F7",null);
  if(onTime>0)v237Round(c,1178,358,354*onTime/totalWip,32,16,v237C("green"),null);
  if(late>0)v237Round(c,1178+354*onTime/totalWip,358,354*late/totalWip,32,16,v237C("red"),null);
  c.fillStyle=v237C("navy");c.font='700 34px "Century Gothic",Arial';c.fillText(String(m.wip||0),1178,449);
  c.fillStyle=v237C("gray");c.font='600 12px "Century Gothic",Arial';c.fillText("WIP total",1178,472);
  c.fillStyle=v237C("green");c.font='700 25px "Century Gothic",Arial';c.fillText(String(onTime),1320,449);
  c.fillStyle=v237C("gray");c.font='600 12px "Century Gothic",Arial';c.fillText("Dentro de meta",1320,472);
  c.fillStyle=v237C("red");c.font='700 25px "Century Gothic",Arial';c.fillText(String(late),1450,449);
  c.fillStyle=v237C("gray");c.font='600 12px "Century Gothic",Arial';c.fillText("Fuera de meta",1450,472);
  var wipPct=Math.round(onTime/totalWip*100);
  v237Pill(c,1178,510,wipPct+"% controlado",wipPct>=85?v237C("green"):wipPct>=65?v237C("orange"):v237C("red"),150);

  /* Tendencia corta */
  v237Card(c,42,610,990,246,20);
  c.fillStyle=v237C("navy");c.font='700 19px "Century Gothic",Arial';c.fillText("Tendencia reciente de cierres",68,650);
  c.fillStyle=v237C("muted");c.font='400 12px "Century Gothic",Arial';c.fillText("Últimos registros del periodo",68,674);
  if(trends.length>1){
    v237DrawSpark(c,trends,72,705,900,100,function(x){return x.count;},v237C("blue"));
    c.fillStyle=v237C("gray");c.font='400 11px "Century Gothic",Arial';
    c.fillText(trends[0].day.slice(5),72,829);c.textAlign="right";c.fillText(trends[trends.length-1].day.slice(5),972,829);c.textAlign="left";
  }else v237Empty(c,72,702,900,105,"No hay suficientes cierres para mostrar tendencia.");

  /* Semáforos */
  v237Card(c,1052,610,506,246,20);
  c.fillStyle=v237C("navy");c.font='700 19px "Century Gothic",Arial';c.fillText("Semáforos ejecutivos",1078,650);
  (analysis.signals||[]).slice(0,4).forEach(function(s,i){
    var yy=690+i*37,col=v237StatusColor(s.value);
    c.fillStyle=col;c.beginPath();c.arc(1090,yy,7,0,Math.PI*2);c.fill();
    c.fillStyle=v237C("ink");c.font='600 12px "Century Gothic",Arial';c.fillText(v237Short(s.label,27),1110,yy+4);
    c.fillStyle=v237C("navy");c.font='700 13px "Century Gothic",Arial';c.textAlign="right";c.fillText(String(s.value)+s.suffix,1520,yy+4);c.textAlign="left";
  });
  return o.canvas.toDataURL("image/png");
}

/* TENDENCIA COMBINADA */
function v236TrendCanvas(analysis){
  var o=v237Canvas(1600,900),c=o.ctx,rows=analysis.dailyTrend||[];
  v237Title(c,"Tendencia del flujo","Cierres diarios y evolución del Lead Time promedio",1600);

  var avgClose=rows.length?v232Average(rows.map(function(x){return x.count;})):0;
  var avgLt=rows.length?v232Average(rows.map(function(x){return v234MsHours(x.avgLt);})):0;
  var best=rows.slice().sort(function(a,b){return b.count-a.count;})[0]||{};
  var last=rows[rows.length-1]||{};
  [
    ["Promedio de cierres",Math.round(avgClose*100)/100+"/día","Periodo analizado",v237C("blue"),"01"],
    ["LT promedio",Math.round(avgLt*100)/100+" h","Pedidos cerrados",v237C("orange"),"02"],
    ["Mejor día",best.day?best.day.slice(5):"—",(best.count||0)+" cierres",v237C("green"),"03"],
    ["Último corte",last.day?last.day.slice(5):"—",(last.count||0)+" cierres",v237C("purple"),"04"]
  ].forEach(function(k,i){v237MetricCard(c,42+i*382,118,354,106,k[0],k[1],k[2],k[3],k[4]);});

  v237Card(c,42,250,1516,600,20);
  if(rows.length<2){v237Empty(c,82,300,1436,490,"No hay suficientes cierres para construir la tendencia.");return o.canvas.toDataURL("image/png");}
  var x=112,y=320,w=1360,h=410;
  var counts=rows.map(function(r){return Number(r.count||0);});
  var lts=rows.map(function(r){return v234MsHours(r.avgLt);});
  var maxC=Math.max.apply(Math,[1].concat(counts)),maxLt=Math.max.apply(Math,[1].concat(lts));
  var slot=w/rows.length,barW=Math.max(14,Math.min(48,slot*.52));

  c.font='400 11px "Century Gothic",Arial';c.fillStyle=v237C("muted");
  for(var g=0;g<=5;g++){
    var yy=y+h*g/5;
    c.strokeStyle="#E8EDF3";c.lineWidth=1;c.beginPath();c.moveTo(x,yy);c.lineTo(x+w,yy);c.stroke();
    c.textAlign="right";c.fillText(String(Math.round(maxC*(1-g/5))),x-14,yy+4);
    c.textAlign="left";c.fillText(String(Math.round(maxLt*(1-g/5)))+" h",x+w+14,yy+4);
  }
  rows.forEach(function(r,i){
    var center=x+(i+.5)*slot,bh=(Number(r.count||0)/maxC)*h,top=y+h-bh;
    var grad=c.createLinearGradient(0,top,0,y+h);grad.addColorStop(0,"#0B66C3");grad.addColorStop(1,"#69AFE4");
    v237Round(c,center-barW/2,top,barW,bh,8,grad,null);
  });
  c.beginPath();
  rows.forEach(function(r,i){
    var center=x+(i+.5)*slot,yy=y+h-(v234MsHours(r.avgLt)/maxLt)*h;
    if(i===0)c.moveTo(center,yy);else c.lineTo(center,yy);
  });
  c.strokeStyle=v237C("orange");c.lineWidth=4;c.stroke();
  rows.forEach(function(r,i){
    var center=x+(i+.5)*slot,yy=y+h-(v234MsHours(r.avgLt)/maxLt)*h;
    c.fillStyle="#fff";c.beginPath();c.arc(center,yy,6,0,Math.PI*2);c.fill();
    c.strokeStyle=v237C("orange");c.lineWidth=3;c.beginPath();c.arc(center,yy,6,0,Math.PI*2);c.stroke();
    if(i===0||i===rows.length-1||i%Math.max(1,Math.ceil(rows.length/8))===0){
      c.fillStyle=v237C("gray");c.font='400 11px "Century Gothic",Arial';c.textAlign="center";
      c.fillText(r.day.slice(5),center,y+h+27);c.textAlign="left";
    }
  });
  c.fillStyle=v237C("blue");v237Round(c,116,778,22,12,4,v237C("blue"),null);
  c.fillStyle=v237C("ink");c.font='600 12px "Century Gothic",Arial';c.fillText("Pedidos cerrados",148,789);
  c.strokeStyle=v237C("orange");c.lineWidth=4;c.beginPath();c.moveTo(315,784);c.lineTo(345,784);c.stroke();
  c.fillStyle="#fff";c.beginPath();c.arc(330,784,5,0,Math.PI*2);c.fill();c.strokeStyle=v237C("orange");c.lineWidth=2;c.stroke();
  c.fillStyle=v237C("ink");c.fillText("Lead Time promedio",356,789);
  c.fillStyle=v237C("muted");c.font='400 11px "Century Gothic",Arial';c.textAlign="right";
  c.fillText("Escala izquierda: cierres | Escala derecha: horas",1490,789);c.textAlign="left";
  return o.canvas.toDataURL("image/png");
}

/* PROCESOS */
function v236ProcessCanvas(analysis){
  var o=v237Canvas(1600,900),c=o.ctx,rows=(analysis.processHealth||[]).slice().sort(function(a,b){return Number(b.avg||0)-Number(a.avg||0);});
  v237Title(c,"Desempeño por proceso","Lead Time, cumplimiento, WIP y salud integral",1600);
  var slow=rows[0]||{},low=(analysis.processHealth||[]).slice().sort(function(a,b){return Number(a.slaPct||0)-Number(b.slaPct||0);})[0]||{},highWip=(analysis.processHealth||[]).slice().sort(function(a,b){return Number(b.wip||0)-Number(a.wip||0);})[0]||{};
  [
    ["Mayor Lead Time",slow.label||"—",v225Time(slow.avg||0),v237C("red"),"LT"],
    ["Menor cumplimiento",low.label||"—",Number(low.slaPct||0)+"%",v237C("orange"),"%"],
    ["Mayor WIP",highWip.label||"—",String(highWip.wip||0)+" pedidos",v237C("purple"),"WIP"]
  ].forEach(function(k,i){
    var x=42+i*506,y=118;v237Card(c,x,y,476,104,17);
    c.fillStyle=k[3];v237Round(c,x,y,7,104,4,k[3],null);
    c.fillStyle=v237C("gray");c.font='600 11px "Century Gothic",Arial';c.fillText(k[0].toUpperCase(),x+24,146);
    c.fillStyle=v237C("navy");c.font='700 17px "Century Gothic",Arial';c.fillText(v237Short(k[1],31),x+24,177);
    c.fillStyle=k[3];c.font='700 21px "Century Gothic",Arial';c.textAlign="right";c.fillText(k[2],x+448,178);c.textAlign="left";
  });

  /* LT */
  v237Card(c,42,248,900,610,20);
  c.fillStyle=v237C("navy");c.font='700 18px "Century Gothic",Arial';c.fillText("Ranking de Lead Time",68,287);
  c.fillStyle=v237C("muted");c.font='400 11px "Century Gothic",Arial';c.fillText("Horas laborales promedio por proceso",68,309);
  var max=Math.max.apply(Math,[1].concat(rows.map(function(r){return v234MsHours(r.avg||0);})));
  var chartX=345,chartW=500,targetX=chartX+chartW*Math.min(1,8/max);
  c.strokeStyle=v237C("yellow");c.lineWidth=2;c.setLineDash([6,6]);c.beginPath();c.moveTo(targetX,334);c.lineTo(targetX,810);c.stroke();c.setLineDash([]);
  c.fillStyle=v237C("orange");c.font='600 10px "Century Gothic",Arial';c.fillText("Referencia 8 h",targetX+6,344);
  rows.slice(0,8).forEach(function(r,i){
    var yy=365+i*55,val=v234MsHours(r.avg||0),bw=chartW*val/max;
    c.fillStyle=v237C("ink");c.font='600 12px "Century Gothic",Arial';c.fillText(v237Short(r.label,31),68,yy+15);
    v237Round(c,chartX,yy,chartW,18,9,"#EDF2F7",null);
    var grad=c.createLinearGradient(chartX,0,chartX+chartW,0);grad.addColorStop(0,"#6CB4E9");grad.addColorStop(1,"#0B66C3");
    v237Round(c,chartX,yy,Math.max(6,bw),18,9,grad,null);
    c.fillStyle=v237C("navy");c.font='700 12px "Century Gothic",Arial';c.textAlign="right";c.fillText(v225Time(r.avg||0),878,yy+15);c.textAlign="left";
  });

  /* Cumplimiento */
  v237Card(c,966,248,592,610,20);
  c.fillStyle=v237C("navy");c.font='700 18px "Century Gothic",Arial';c.fillText("Cumplimiento y salud",992,287);
  c.fillStyle=v237C("muted");c.font='400 11px "Century Gothic",Arial';c.fillText("Meta visual recomendada: 85%",992,309);
  (analysis.processHealth||[]).slice().sort(function(a,b){return Number(a.slaPct||0)-Number(b.slaPct||0);}).slice(0,8).forEach(function(r,i){
    var yy=352+i*58,pct=Number(r.slaPct||0),health=Number(r.health||0);
    c.fillStyle=v237C("ink");c.font='600 11px "Century Gothic",Arial';c.fillText(v237Short(r.label,25),992,yy+11);
    var bx=1195,bw=260;
    v237Round(c,bx,yy,bw,13,7,"#EDF2F7",null);
    v237Round(c,bx,yy,Math.max(5,bw*pct/100),13,7,v237StatusColor(pct),null);
    c.strokeStyle=v237C("navy");c.lineWidth=2;c.beginPath();c.moveTo(bx+bw*.85,yy-3);c.lineTo(bx+bw*.85,yy+16);c.stroke();
    c.fillStyle=v237C("navy");c.font='700 11px "Century Gothic",Arial';c.textAlign="right";c.fillText(pct+"%",1515,yy+11);c.textAlign="left";
    c.fillStyle=v237StatusColor(health);c.beginPath();c.arc(1010,yy+32,6,0,Math.PI*2);c.fill();
    c.fillStyle=v237C("gray");c.font='400 10px "Century Gothic",Arial';c.fillText("Salud "+health+"% | WIP "+Number(r.wip||0),1024,yy+36);
  });
  return o.canvas.toDataURL("image/png");
}

/* MATRIZ DE PROCESOS */
function v236MatrixCanvas(analysis){
  var o=v237Canvas(1600,900),c=o.ctx,rows=analysis.processes||[];
  v237Title(c,"Matriz de procesos","Lead Time, cumplimiento y volumen de WIP",1600);
  v237Card(c,42,120,1185,735,20);
  v237Card(c,1247,120,311,735,20);
  var x=130,y=215,w=1010,h=520;
  var maxLt=Math.max.apply(Math,[1].concat(rows.map(function(r){return v234MsHours(r.avg||0);})));
  var medianLt=v235Median(rows.map(function(r){return v234MsHours(r.avg||0);}));
  var splitX=x+w*(medianLt/maxLt),splitY=y+h*(1-.85);

  c.fillStyle="#FFF7ED";c.fillRect(x,y,splitX-x,splitY-y);
  c.fillStyle="#ECFDF3";c.fillRect(splitX,y,x+w-splitX,splitY-y);
  c.fillStyle="#FEF3F2";c.fillRect(x,splitY,splitX-x,y+h-splitY);
  c.fillStyle="#EFF8FF";c.fillRect(splitX,splitY,x+w-splitX,y+h-splitY);
  c.strokeStyle="#D0D8E2";c.lineWidth=1;c.strokeRect(x,y,w,h);
  c.strokeStyle="#7B8794";c.lineWidth=2;c.setLineDash([7,6]);
  c.beginPath();c.moveTo(splitX,y);c.lineTo(splitX,y+h);c.moveTo(x,splitY);c.lineTo(x+w,splitY);c.stroke();c.setLineDash([]);

  c.fillStyle=v237C("gray");c.font='600 11px "Century Gothic",Arial';
  c.fillText("Rápido / requiere control",x+16,y+24);
  c.fillText("Alto desempeño",splitX+16,y+24);
  c.fillText("Crítico",x+16,splitY+24);
  c.fillText("Lento / estable",splitX+16,splitY+24);
  c.font='400 10px "Century Gothic",Arial';
  for(var g=0;g<=4;g++){
    var xx=x+w*g/4,val=maxLt*g/4;
    c.strokeStyle="#E8EDF3";c.beginPath();c.moveTo(xx,y+h);c.lineTo(xx,y+h+6);c.stroke();
    c.textAlign="center";c.fillText(Math.round(val*10)/10+" h",xx,y+h+23);c.textAlign="left";
  }
  [0,25,50,75,100].forEach(function(pct){
    var yy=y+h-h*pct/100;c.strokeStyle="#E8EDF3";c.beginPath();c.moveTo(x-6,yy);c.lineTo(x,yy);c.stroke();
    c.textAlign="right";c.fillText(pct+"%",x-12,yy+4);c.textAlign="left";
  });
  c.fillStyle=v237C("gray");c.font='600 11px "Century Gothic",Arial';c.textAlign="center";c.fillText("LEAD TIME PROMEDIO",x+w/2,y+h+50);c.textAlign="left";
  c.save();c.translate(72,y+h/2);c.rotate(-Math.PI/2);c.textAlign="center";c.fillText("CUMPLIMIENTO",0,0);c.restore();

  rows.forEach(function(r,i){
    var xx=x+w*v234MsHours(r.avg||0)/maxLt,yy=y+h-h*Number(r.slaPct||0)/100;
    var radius=Math.max(10,Math.min(27,10+Math.sqrt(Number(r.wip||0))*5));
    var col=v237StatusColor(v235HealthScoreProcess(r));
    c.save();c.shadowColor="rgba(16,39,68,.20)";c.shadowBlur=9;c.fillStyle=col;c.globalAlpha=.92;
    c.beginPath();c.arc(xx,yy,radius,0,Math.PI*2);c.fill();c.restore();
    c.fillStyle="#fff";c.font='700 10px "Century Gothic",Arial';c.textAlign="center";c.fillText(String(i+1),xx,yy+4);c.textAlign="left";
  });

  c.fillStyle=v237C("navy");c.font='700 18px "Century Gothic",Arial';c.fillText("Leyenda de procesos",1273,164);
  rows.slice(0,10).forEach(function(r,i){
    var yy=202+i*55,col=v237StatusColor(v235HealthScoreProcess(r));
    c.fillStyle=col;c.beginPath();c.arc(1288,yy,12,0,Math.PI*2);c.fill();
    c.fillStyle="#fff";c.font='700 9px "Century Gothic",Arial';c.textAlign="center";c.fillText(String(i+1),1288,yy+3);c.textAlign="left";
    c.fillStyle=v237C("ink");c.font='600 11px "Century Gothic",Arial';c.fillText(v237Short(r.label,25),1310,yy-2);
    c.fillStyle=v237C("muted");c.font='400 10px "Century Gothic",Arial';c.fillText(v225Time(r.avg||0)+" | "+Number(r.slaPct||0)+"% | WIP "+Number(r.wip||0),1310,yy+17);
  });
  c.fillStyle=v237C("muted");c.font='400 10px "Century Gothic",Arial';
  c.fillText("Línea vertical: mediana de LT",1273,788);
  c.fillText("Línea horizontal: meta 85%",1273,807);
  c.fillText("Tamaño: volumen de WIP",1273,826);
  return o.canvas.toDataURL("image/png");
}

/* ÁREAS */
function v236AreaCanvas(analysis){
  var o=v237Canvas(1600,900),c=o.ctx,rows=(analysis.areaHealth||[]).slice(0,6);
  v237Title(c,"Desempeño por área","Cumplimiento, confiabilidad, Lead Time y salud integral",1600);
  rows.forEach(function(a,i){
    var col=i%2,row=Math.floor(i/2),x=42+col*770,y=118+row*245,w=736,h=220;
    v237Card(c,x,y,w,h,18);
    var color=v237StatusColor(a.health);
    v237Round(c,x,y,8,h,4,color,null);
    c.fillStyle=v237C("navy");c.font='700 21px "Century Gothic",Arial';c.fillText(a.label,x+26,y+38);
    v237Pill(c,x+w-150,y+20,a.healthStatus.label,color,126);
    c.fillStyle=v237C("gray");c.font='600 10px "Century Gothic",Arial';c.fillText("SALUD",x+26,y+77);
    c.fillStyle=color;c.font='700 38px "Century Gothic",Arial';c.fillText(a.health+"%",x+26,y+120);
    c.fillStyle=v237C("muted");c.font='400 10px "Century Gothic",Arial';c.fillText("LT "+v225Time(a.avg||0)+" | WIP "+Number(a.wip||0)+" | Casos "+Number(a.cases||0),x+26,y+149);
    var bx=x+250,bw=430;
    c.fillStyle=v237C("ink");c.font='600 11px "Century Gothic",Arial';c.fillText("Cumplimiento",bx,y+75);
    v237Round(c,bx,y+86,bw,14,7,"#EDF2F7",null);v237Round(c,bx,y+86,Math.max(5,bw*Number(a.compliance||0)/100),14,7,v237StatusColor(a.compliance),null);
    c.fillStyle=v237C("navy");c.font='700 11px "Century Gothic",Arial';c.textAlign="right";c.fillText(Number(a.compliance||0)+"%",bx+bw,y+75);c.textAlign="left";
    c.fillStyle=v237C("ink");c.font='600 11px "Century Gothic",Arial';c.fillText("Confiabilidad",bx,y+135);
    v237Round(c,bx,y+146,bw,14,7,"#EDF2F7",null);v237Round(c,bx,y+146,Math.max(5,bw*Number(a.reliability||0)/100),14,7,v237StatusColor(a.reliability),null);
    c.fillStyle=v237C("navy");c.font='700 11px "Century Gothic",Arial';c.textAlign="right";c.fillText(Number(a.reliability||0)+"%",bx+bw,y+135);c.textAlign="left";
    c.fillStyle=v237C("muted");c.font='400 10px "Century Gothic",Arial';c.fillText("No entregas: "+Number(a.noDeliveries||0)+" | Actores: "+Number(a.workers||0),bx,y+190);
  });
  return o.canvas.toDataURL("image/png");
}

/* ACTORES */
function v236ActorCanvas(analysis){
  var o=v237Canvas(1600,900),c=o.ctx,rows=(analysis.actors||[]).slice().sort(function(a,b){return Number(b.active||0)-Number(a.active||0);}).slice(0,12);
  v237Title(c,"Productividad por actor","Trabajo directo trazado, cumplimiento y WIP",1600);
  var avgCompliance=rows.length?Math.round(v232Average(rows.map(function(x){return Number(x.compliance||0);} ))):0;
  var totalWork=rows.reduce(function(s,x){return s+Number(x.active||0);},0);
  [
    ["Actores medidos",rows.length,"Super Admin excluido",v237C("blue"),"01"],
    ["Trabajo trazado",v225Time(totalWork),"Suma de actores visibles",v237C("purple"),"02"],
    ["Cumplimiento medio",avgCompliance+"%","Promedio de actores",v237StatusColor(avgCompliance),"03"]
  ].forEach(function(k,i){v237MetricCard(c,42+i*506,118,476,104,k[0],k[1],k[2],k[3],k[4]);});
  v237Card(c,42,248,1516,610,20);
  c.fillStyle=v237C("gray");c.font='600 10px "Century Gothic",Arial';
  c.fillText("ACTOR",70,286);c.fillText("TRABAJO DIRECTO",420,286);c.fillText("CUMPL.",1282,286);c.fillText("WIP",1445,286);
  var max=Math.max.apply(Math,[1].concat(rows.map(function(r){return Number(r.active||0);})));
  rows.forEach(function(r,i){
    var yy=316+i*42,val=Number(r.active||0),bw=730*val/max,col=v237StatusColor(r.compliance);
    if(i%2===0){c.fillStyle="#FAFBFD";c.fillRect(62,yy-8,1475,36);}
    c.fillStyle=v237C("ink");c.font='600 12px "Century Gothic",Arial';c.fillText(v237Short(r.user,34),70,yy+13);
    v237Round(c,420,yy,730,16,8,"#EDF2F7",null);
    var grad=c.createLinearGradient(420,0,1150,0);grad.addColorStop(0,"#79B9E8");grad.addColorStop(1,"#0B66C3");
    v237Round(c,420,yy,Math.max(5,bw),16,8,grad,null);
    c.fillStyle=v237C("navy");c.font='700 11px "Century Gothic",Arial';c.textAlign="right";c.fillText(v225Time(r.active||0),1225,yy+13);c.textAlign="left";
    v237Pill(c,1260,yy-5,Number(r.compliance||0)+"%",col,86);
    v237Round(c,1432,yy-5,76,28,14,"#EEF3F8",null);c.fillStyle=v237C("navy");c.font='700 11px "Century Gothic",Arial';c.textAlign="center";c.fillText(String(r.open||0),1470,yy+14);c.textAlign="left";
  });
  c.fillStyle=v237C("muted");c.font='400 11px "Century Gothic",Arial';
  c.fillText("La carga directa debe analizarse junto con complejidad, calidad, cumplimiento y cantidad de casos.",70,834);
  return o.canvas.toDataURL("image/png");
}

/* PARETO */
function v236ParetoCanvas(analysis){
  var o=v237Canvas(1600,900),c=o.ctx,rows=(analysis.pareto||[]).slice(0,9);
  v237Title(c,"Pareto de causas","Tiempo asociado y porcentaje acumulado",1600);
  var total=rows.reduce(function(s,r){return s+Number(r.value||0);},0);
  var cumulative=0,causes80=0;
  rows.forEach(function(r){if(cumulative<total*.8)causes80++;cumulative+=Number(r.value||0);});
  [
    ["Tiempo asociado",v225Time(total),"Total de causas",v237C("blue"),"01"],
    ["Causas identificadas",rows.length,"Clasificación Pareto",v237C("purple"),"02"],
    ["Causas que explican 80%",causes80,"Prioridad de intervención",v237C("orange"),"03"]
  ].forEach(function(k,i){v237MetricCard(c,42+i*506,118,476,104,k[0],k[1],k[2],k[3],k[4]);});
  v237Card(c,42,248,1516,610,20);
  if(!rows.length){v237Empty(c,82,300,1436,490,"No existen causas suficientes para construir el Pareto.");return o.canvas.toDataURL("image/png");}
  var x=118,y=330,w=1360,h=390,max=Math.max.apply(Math,rows.map(function(r){return Number(r.value||0);})),slot=w/rows.length,barW=Math.min(92,slot*.58),cum=0,points=[];
  for(var g=0;g<=5;g++){
    var yy=y+h*g/5;c.strokeStyle="#E8EDF3";c.lineWidth=1;c.beginPath();c.moveTo(x,yy);c.lineTo(x+w,yy);c.stroke();
    c.fillStyle=v237C("muted");c.font='400 10px "Century Gothic",Arial';c.textAlign="right";c.fillText(Math.round(max*(1-g/5))+" h",x-12,yy+4);
    c.textAlign="left";c.fillText(Math.round((1-g/5)*100)+"%",x+w+12,yy+4);
  }
  var line80=y+h*.2;c.strokeStyle=v237C("orange");c.lineWidth=2;c.setLineDash([7,6]);c.beginPath();c.moveTo(x,line80);c.lineTo(x+w,line80);c.stroke();c.setLineDash([]);
  c.fillStyle=v237C("orange");c.font='600 10px "Century Gothic",Arial';c.fillText("80%",x+w+12,line80+4);
  rows.forEach(function(r,i){
    var center=x+(i+.5)*slot,val=Number(r.value||0),bh=val/max*h,top=y+h-bh;
    var grad=c.createLinearGradient(0,top,0,y+h);
    if(i===0){grad.addColorStop(0,"#003B70");grad.addColorStop(1,"#0B66C3");}
    else{grad.addColorStop(0,"#4A9BDB");grad.addColorStop(1,"#9AC9EA");}
    v237Round(c,center-barW/2,top,barW,bh,8,grad,null);
    cum+=val;points.push([center,y+h-(cum/total)*h]);
    c.fillStyle=v237C("navy");c.font='700 10px "Century Gothic",Arial';c.textAlign="center";c.fillText(v225Time(val),center,top-9);
    c.save();c.translate(center,y+h+25);c.rotate(-Math.PI/8);c.fillStyle=v237C("ink");c.font='600 10px "Century Gothic",Arial';c.textAlign="right";c.fillText(v237Short(r.label,20),0,0);c.restore();
  });
  c.strokeStyle=v237C("yellow");c.lineWidth=4;c.beginPath();points.forEach(function(p,i){if(i===0)c.moveTo(p[0],p[1]);else c.lineTo(p[0],p[1]);});c.stroke();
  points.forEach(function(p){c.fillStyle="#fff";c.beginPath();c.arc(p[0],p[1],6,0,Math.PI*2);c.fill();c.strokeStyle=v237C("yellow");c.lineWidth=3;c.stroke();});
  c.fillStyle=v237C("blue");v237Round(c,120,799,24,12,4,v237C("blue"),null);
  c.fillStyle=v237C("ink");c.font='600 11px "Century Gothic",Arial';c.fillText("Tiempo asociado",154,809);
  c.strokeStyle=v237C("yellow");c.lineWidth=4;c.beginPath();c.moveTo(305,805);c.lineTo(335,805);c.stroke();
  c.fillStyle=v237C("ink");c.fillText("Porcentaje acumulado",348,809);
  return o.canvas.toDataURL("image/png");
}

/* RIESGOS */
function v236RiskCanvas(analysis){
  var o=v237Canvas(1600,900),c=o.ctx,risks=(analysis.risks||[]).slice(0,9);
  v237Title(c,"Matriz de riesgos operativos","Probabilidad, impacto, evidencia y tratamiento",1600);
  v237Card(c,42,118,700,740,20);v237Card(c,762,118,796,740,20);

  c.fillStyle=v237C("navy");c.font='700 19px "Century Gothic",Arial';c.fillText("Mapa de calor",70,160);
  c.fillStyle=v237C("muted");c.font='400 11px "Century Gothic",Arial';c.fillText("Cantidad de riesgos por probabilidad e impacto",70,182);
  var x=145,y=245,size=500,cell=size/3;
  var colors=[
    ["#EAF8F1","#EAF8F1","#FFF4E5"],
    ["#EAF8F1","#FFF4E5","#FDECEC"],
    ["#FFF4E5","#FDECEC","#FDECEC"]
  ];
  var groups={};
  risks.forEach(function(r){var key=Number(r.probability)+"|"+Number(r.impact);if(!groups[key])groups[key]=[];groups[key].push(r);});
  for(var impact=1;impact<=3;impact++){
    for(var probability=1;probability<=3;probability++){
      var xx=x+(probability-1)*cell,yy=y+(3-impact)*cell,key=probability+"|"+impact,count=(groups[key]||[]).length;
      v237Round(c,xx+4,yy+4,cell-8,cell-8,14,colors[impact-1][probability-1],"#D6DEE8",1);
      c.fillStyle=v237C("gray");c.font='600 10px "Century Gothic",Arial';c.fillText("P"+probability+" / I"+impact,xx+16,yy+24);
      if(count){
        var level=probability*impact>=7?v237C("red"):probability*impact>=4?v237C("orange"):v237C("green");
        c.fillStyle=level;c.beginPath();c.arc(xx+cell/2,yy+cell/2,29,0,Math.PI*2);c.fill();
        c.fillStyle="#fff";c.font='700 22px "Century Gothic",Arial';c.textAlign="center";c.fillText(String(count),xx+cell/2,yy+cell/2+7);c.textAlign="left";
      }else{
        c.fillStyle="#C7D0DA";c.font='600 18px "Century Gothic",Arial';c.textAlign="center";c.fillText("0",xx+cell/2,yy+cell/2+6);c.textAlign="left";
      }
    }
  }
  c.fillStyle=v237C("gray");c.font='600 11px "Century Gothic",Arial';c.textAlign="center";c.fillText("PROBABILIDAD",x+size/2,y+size+36);c.textAlign="left";
  c.save();c.translate(88,y+size/2);c.rotate(-Math.PI/2);c.textAlign="center";c.fillText("IMPACTO",0,0);c.restore();

  c.fillStyle=v237C("navy");c.font='700 19px "Century Gothic",Arial';c.fillText("Riesgos prioritarios",790,160);
  c.fillStyle=v237C("muted");c.font='400 11px "Century Gothic",Arial';c.fillText("Evidencia y acción sugerida",790,182);
  risks.slice(0,7).forEach(function(r,i){
    var yy=210+i*84,col=r.level==="Alto"?v237C("red"):r.level==="Medio"?v237C("orange"):v237C("green");
    if(i%2===0){c.fillStyle="#FAFBFD";v237Round(c,785,yy-8,748,72,12,"#FAFBFD",null);}
    v237Pill(c,800,yy,r.level.toUpperCase(),col,92);
    c.fillStyle=v237C("navy");c.font='700 13px "Century Gothic",Arial';c.fillText(v237Short(r.risk,43),910,yy+16);
    c.fillStyle=v237C("gray");c.font='400 10px "Century Gothic",Arial';c.fillText(v237Short(r.evidence,72),910,yy+37);
    c.fillStyle=v237C("blue");c.font='600 10px "Century Gothic",Arial';c.fillText("Acción: "+v237Short(r.treatment,63),910,yy+56);
  });
  return o.canvas.toDataURL("image/png");
}

/* --------------------- PDF SOBRE PLANTILLA --------------------- */
function v236PdfState(doc){
  return {pageWidth:doc.internal.pageSize.getWidth(),pageHeight:doc.internal.pageSize.getHeight(),margin:58,top:145,bottom:708,contentWidth:doc.internal.pageSize.getWidth()-116,y:155,section:""};
}
function v236PdfBackground(doc,state){
  doc.addImage(V236_OFICIOS_TEMPLATE,"JPEG",0,0,state.pageWidth,state.pageHeight,"EI_OFICIOS_TEMPLATE","FAST");
  doc.setFillColor(214,222,231);doc.roundedRect(48,119,state.pageWidth-96,596,12,12,"F");
  doc.setFillColor(255,255,255);doc.roundedRect(44,115,state.pageWidth-96,596,12,12,"F");
}
function v236PdfHeader(doc,state,title,subtitle){
  v236PdfBackground(doc,state);
  doc.setFillColor(0,43,92);doc.roundedRect(56,128,state.pageWidth-112,42,8,8,"F");
  doc.setFillColor(245,196,0);doc.roundedRect(56,128,8,42,4,4,"F");
  doc.setTextColor(255,255,255);doc.setFont("helvetica","bold");doc.setFontSize(14);doc.text(v236Safe(title),76,151);
  if(subtitle){doc.setTextColor(102,112,133);doc.setFont("helvetica","normal");doc.setFontSize(8);doc.text(v236Safe(subtitle),58,184);state.y=199;}else state.y=190;
  state.section=title;
}
function v236PdfNewPage(doc,state,title,subtitle){doc.addPage("letter","portrait");v236PdfHeader(doc,state,title,subtitle);}
function v236PdfImagePage(doc,state,title,subtitle,dataUrl,height){
  v236PdfNewPage(doc,state,title,subtitle);var h=height||470,w=state.contentWidth,x=state.margin,y=state.y+8;doc.addImage(dataUrl,"PNG",x,y,w,h,undefined,"FAST");state.y=y+h+10;
}
function v236PdfTextPage(doc,state,title,subtitle,paragraphs,bullets){
  v236PdfNewPage(doc,state,title,subtitle);doc.setTextColor(16,32,51);doc.setFont("helvetica","normal");doc.setFontSize(9.2);(paragraphs||[]).forEach(function(p){var lines=doc.splitTextToSize(v236Safe(p),state.contentWidth-10);doc.text(lines,state.margin+5,state.y);state.y+=lines.length*12+10;});(bullets||[]).forEach(function(b){var lines=doc.splitTextToSize(v236Safe(b),state.contentWidth-28);doc.setFillColor(245,196,0);doc.circle(state.margin+8,state.y-3,2.5,"F");doc.text(lines,state.margin+20,state.y);state.y+=lines.length*12+8;});
}
function v236PdfTable(doc,state,title,subtitle,head,body,options){
  options=options||{};doc.addPage("letter","portrait");
  doc.autoTable({
    startY:199,head:[head.map(v236Safe)],body:(body.length?body:[["Sin datos"]]).map(function(r){return r.map(v236Safe);}),
    margin:{left:58,right:58,top:199,bottom:88},theme:"grid",
    styles:{font:"helvetica",fontSize:options.fontSize||6.6,cellPadding:2.8,textColor:[16,32,51],lineColor:[213,224,234],lineWidth:.35,overflow:"linebreak",valign:"top"},
    headStyles:{fillColor:[0,43,92],textColor:[255,255,255],fontStyle:"bold"},alternateRowStyles:{fillColor:[247,249,252]},columnStyles:options.columnStyles||{},
    willDrawPage:function(){v236PdfHeader(doc,state,title,subtitle);},
    didDrawPage:function(){doc.setTextColor(102,112,133);doc.setFontSize(7);doc.text(v236Safe(title),58,700);}
  });
  state.y=(doc.lastAutoTable&&doc.lastAutoTable.finalY||199)+12;
}
function v236PdfKpiRow(doc,state,items){
  var gap=8,w=(state.contentWidth-gap*(items.length-1))/items.length,h=68;items.forEach(function(k,i){var x=state.margin+i*(w+gap),y=state.y;doc.setFillColor(247,249,252);doc.setDrawColor(215,225,234);doc.roundedRect(x,y,w,h,7,7,"FD");doc.setTextColor(102,112,133);doc.setFont("helvetica","bold");doc.setFontSize(6.5);doc.text(v236Safe(k[0]),x+8,y+15);doc.setTextColor(0,43,92);doc.setFontSize(15);doc.text(v236Safe(k[1]),x+8,y+39);doc.setTextColor(102,112,133);doc.setFont("helvetica","normal");doc.setFontSize(6.4);doc.text(doc.splitTextToSize(v236Safe(k[2]),w-16),x+8,y+53);});state.y+=h+12;
}
function v236PdfFinalize(doc,meta){
  var pages=doc.getNumberOfPages();for(var i=1;i<=pages;i++){doc.setPage(i);var pw=doc.internal.pageSize.getWidth();doc.setFillColor(0,43,92);doc.roundedRect(pw-112,690,54,15,7,7,"F");doc.setTextColor(255,255,255);doc.setFont("helvetica","bold");doc.setFontSize(6.5);doc.text("Página "+i+" / "+pages,pw-85,700,{align:"center"});doc.setTextColor(102,112,133);doc.setFont("helvetica","normal");doc.setFontSize(6.2);doc.text(v236Safe(meta.author+" | "+meta.department),58,700);}
}

/* V237: inserción proporcional de gráficas, sin estiramiento vertical. */
function v236PdfImagePage(doc,state,title,subtitle,dataUrl,height){
  v236PdfNewPage(doc,state,title,subtitle);
  var props=doc.getImageProperties(dataUrl);
  var aspect=(props&&props.width&&props.height)?props.width/props.height:(16/9);
  var maxW=state.contentWidth;
  var maxH=Math.min(Number(height||470),470);
  var w=maxW,h=w/aspect;
  if(h>maxH){h=maxH;w=h*aspect;}
  var x=state.margin+(state.contentWidth-w)/2;
  var y=state.y+14;
  doc.setFillColor(246,249,252);
  doc.setDrawColor(220,228,237);
  doc.roundedRect(x-7,y-7,w+14,h+14,8,8,"FD");
  doc.addImage(dataUrl,"PNG",x,y,w,h,undefined,"FAST");
  state.y=y+h+16;
}

async function v232GeneratePdf(meta,analysis){
  try{
    analysis=v236EnhanceAnalysis(analysis);await v234LoadPdfLibraries();var PDF=window.jspdf.jsPDF;var doc=new PDF({orientation:"portrait",unit:"pt",format:"letter",compress:true});var state=v236PdfState(doc),m=analysis.m,w=m.specialWait||{},r=m.reliability||{};
    /* Portada en plantilla */
    v236PdfBackground(doc,state);doc.setFillColor(0,43,92);doc.roundedRect(58,145,state.contentWidth,220,14,14,"F");doc.setFillColor(245,196,0);doc.roundedRect(58,145,10,220,5,5,"F");doc.setTextColor(245,196,0);doc.setFont("helvetica","bold");doc.setFontSize(9);doc.text(v236Safe(meta.confidentiality.toUpperCase()+" | INFORME VSM"),84,178);doc.setTextColor(255,255,255);doc.setFontSize(25);var t=doc.splitTextToSize(v236Safe(meta.title),state.contentWidth-60);doc.text(t,84,220);doc.setFont("helvetica","normal");doc.setFontSize(10);doc.setTextColor(221,231,242);doc.text(doc.splitTextToSize(v236Safe(meta.objective),state.contentWidth-60),84,220+t.length*30+20);
    doc.setFillColor(247,249,252);doc.roundedRect(58,390,220,150,12,12,"F");doc.setTextColor(0,43,92);doc.setFont("helvetica","bold");doc.setFontSize(34);doc.text(analysis.score+"%",82,448);doc.setFontSize(8);doc.text("ÍNDICE GENERAL",82,470);var sc=v235Status(analysis.score);doc.setFillColor(sc.color[0],sc.color[1],sc.color[2]);doc.roundedRect(82,486,120,20,8,8,"F");doc.setTextColor(255,255,255);doc.setFontSize(7);doc.text(v236Safe(sc.label.toUpperCase()),142,499,{align:"center"});
    doc.setTextColor(0,43,92);doc.setFontSize(7);doc.text("ELABORADO POR",318,414);doc.text("ÁREA RESPONSABLE",318,455);doc.text("DIRIGIDO A",318,496);doc.text("PERIODO / ALCANCE",318,537);doc.setTextColor(52,64,84);doc.setFont("helvetica","normal");doc.setFontSize(9);doc.text(doc.splitTextToSize(v236Safe(meta.author+" | "+meta.position),230),318,429);doc.text(v236Safe(meta.department),318,470);doc.text(v236Safe(meta.audience),318,511);doc.text(doc.splitTextToSize(v236Safe(meta.periodName||meta.scope),230),318,552);
    doc.setTextColor(102,112,133);doc.setFontSize(7);doc.text(v236Safe("Generado el "+meta.generatedAt.toLocaleString("es-CO")+" | "+VERSION),58,680);
    /* páginas gráficas */
    v236PdfImagePage(doc,state,"1. Dashboard ejecutivo","Lectura consolidada de indicadores y semáforos",v236DashboardCanvas(analysis),455);
    v236PdfTextPage(doc,state,"2. Diagnóstico ejecutivo","Fortalezas, hallazgos y lectura gerencial",[analysis.keyMessage],analysis.strengths.concat(analysis.findings));
    if(meta.includeTrends)v236PdfImagePage(doc,state,"3. Tendencias del flujo","Evolución de cierres y Lead Time promedio",v236TrendCanvas(analysis),420);
    v236PdfImagePage(doc,state,"4. Desempeño por proceso","Visualizaciones ejecutivas refinadas para priorización",v236ProcessCanvas(analysis),470);
    v236PdfImagePage(doc,state,"5. Matriz de procesos","Lead Time, cumplimiento y WIP",v236MatrixCanvas(analysis),470);
    v236PdfTable(doc,state,"6. Detalle por proceso","Indicadores calculados con horas laborales",["Proceso","Casos","WIP","Atras.","LT prom.","P50","P90","Cumpl.","Salud"],analysis.processHealth.map(function(x){return [x.label,x.cases||0,x.wip||0,x.wipLate||0,v225Time(x.avg||0),v225Time(x.p50||0),v225Time(x.p90||0),(x.slaPct||0)+"%",x.health+"%"];}),{fontSize:6.4});
    v236PdfImagePage(doc,state,"7. Desempeño por área","Diagnóstico comparativo de áreas",v236AreaCanvas(analysis),470);
    v236PdfTable(doc,state,"8. Detalle por área","Cumplimiento, confiabilidad y salud",["Área","Casos","WIP","Cerrados","LT prom.","Cumpl.","Confiab.","No entregas","Salud"],analysis.areaHealth.map(function(x){return [x.label,x.cases||0,x.wip||0,x.closed||0,v225Time(x.avg||0),(x.compliance||0)+"%",(x.reliability||0)+"%",x.noDeliveries||0,x.health+"%"];}),{fontSize:6.4});
    if(meta.includeActors){v236PdfImagePage(doc,state,"9. Productividad por actor","Carga directa, cumplimiento y WIP",v236ActorCanvas(analysis),485);v236PdfTable(doc,state,"10. Detalle de productividad","Super Admin excluido",["Actor","Rol","Casos","WIP","Cerrados","Trabajo","Prom.","Cumpl.","Carga"],analysis.actors.slice(0,60).map(function(x){return [x.user,roleTitle(x.role),x.count||0,x.open||0,x.closed||0,v225Time(x.active||0),v225Time(x.directPerCase||0),(x.compliance||0)+"%",(x.directLoadPct||0)+"%"];}),{fontSize:6});}
    if(meta.includeWaits){v236PdfImagePage(doc,state,"11. Pareto de causas","Novedades, reprocesos y no entregas",v236ParetoCanvas(analysis),470);v236PdfTable(doc,state,"12. Trazabilidad de tiempos especiales","Registros únicos utilizados en el informe",["Pedido","Categoría","Área","Proceso","Duración","Abierto","Origen"],analysis.reportWaitRows.slice(0,120).map(function(x){return [x.pedido,x.category,v225AreaLabel(x.area),processTitle(x.process),v225Time(x.duration||0),x.open?"Sí":"No",x.source];}),{fontSize:5.8,columnStyles:{6:{cellWidth:145}}});}
    if(meta.includeRisks){v236PdfImagePage(doc,state,"13. Matriz de riesgos","Probabilidad, impacto y tratamiento",v236RiskCanvas(analysis),470);v236PdfTable(doc,state,"14. Registro de riesgos","Riesgos priorizados",["Nivel","Riesgo","Fuente","Prob.","Impacto","Evidencia","Tratamiento"],analysis.risks.map(function(x){return [x.level,x.risk,x.source,x.probability,x.impact,x.evidence,x.treatment];}),{fontSize:5.8,columnStyles:{5:{cellWidth:125},6:{cellWidth:135}}});}
    v236PdfTextPage(doc,state,"15. Decisiones y recomendaciones","Acciones que deben resolverse en comité",analysis.decisions.map(function(x){return x.title+": "+x.signal+". "+x.decision+" Responsable sugerido: "+x.owner+"."}),analysis.managementQuestions.concat(analysis.recommendations));
    if(meta.includeActionPlan)v236PdfTable(doc,state,"16. Plan de acción propuesto","Priorización de acciones",["Prioridad","Situación","Acción","Responsable","Meta"],analysis.actions.map(function(x){return [x.priority,x.issue,x.action,x.owner,x.target];}),{fontSize:6.2,columnStyles:{2:{cellWidth:165}}});
    if(meta.includeOrders)v236PdfTable(doc,state,"17. Pedidos críticos","Anexo operativo",["Pedido","OC","Cliente","Proceso","Responsable","Tiempo","Meta","Estado","Próxima acción"],(m.wipRows||[]).slice(0,180).map(function(x){return [x.pedido,x.oc,x.cliente,x.processLabel,x.responsable,v225Time(x.age||0),(x.slaHours||0)+" h",x.late?"Fuera de meta":"Dentro",x.next||""];}),{fontSize:5.5,columnStyles:{2:{cellWidth:88},8:{cellWidth:110}}});
    if(meta.includeMethodology)v236PdfTable(doc,state,"18. Metodología y fuentes","Criterios aplicados",["Elemento","Criterio"],[
      ["Plantilla","Formato institucional OFICIOS, tamaño carta, logos y datos de contacto."],["Jornada","07:00-12:00 y 13:40-17:30; sábados, domingos y festivos excluidos."],["Lead Time","Tiempo laboral desde el inicio hasta el cierre o corte."],["P50 / P90","Mediana y percentil 90."],["Trabajo directo","Actividad operativa válida; Super Admin excluido."],["Reproceso","Exceso sobre la meta al retornar a una etapa anterior."],["No entrega","Desde confirmación hasta solución o cierre."],["Fuentes","cases, case_events, reportes_novedad, processStats, requirements, noDeliveryReports, stateHistory y flowTrace."]],{fontSize:6.7,columnStyles:{0:{cellWidth:105}}});
    v236PdfTextPage(doc,state,"19. Conclusión","Síntesis para toma de decisiones",[analysis.keyMessage,"Próximo control recomendado: medir nuevamente cumplimiento, WIP, confiabilidad y tiempos especiales después de ejecutar las acciones de prioridad alta.","Elaborado por "+meta.author+" | "+meta.position+" | Dirigido a "+meta.audience+"."],[]);
    v236PdfFinalize(doc,meta);doc.save(v232FileName(meta,"pdf"));
  }catch(e){console.error("[V236 Informe PDF]",e);v234OpenPrintFallback(meta,analysis);status("El motor PDF no pudo cargarse. Se abrió la versión imprimible completa.","ok");}
}

/* --------------------- EXCEL V236 --------------------- */
async function v232GenerateExcel(meta,analysis){
  analysis=v236EnhanceAnalysis(analysis);await v234LoadExcelLibrary();var ExcelJS=window.ExcelJS,m=analysis.m,w=m.specialWait||{},r=m.reliability||{};var workbook=new ExcelJS.Workbook();workbook.creator=meta.author;workbook.created=meta.generatedAt;workbook.modified=meta.generatedAt;
  var templateId=workbook.addImage({base64:V236_OFICIOS_TEMPLATE,extension:"jpeg"});
  var cover=workbook.addWorksheet("Portada",{views:[{showGridLines:false}]});if(cover.addBackgroundImage)cover.addBackgroundImage(templateId);cover.columns=Array.from({length:12},function(){return {width:13};});cover.mergeCells("B8:K12");var ct=cover.getCell("B8");ct.value=meta.title;ct.font={bold:true,size:24,color:{argb:"FF002B5C"}};ct.alignment={wrapText:true,vertical:"middle"};cover.mergeCells("B14:K17");cover.getCell("B14").value=meta.objective;cover.getCell("B14").alignment={wrapText:true,vertical:"top"};cover.mergeCells("B20:E24");cover.getCell("B20").value="ÍNDICE GENERAL\n"+analysis.score+"%\n"+analysis.scoreState.label.toUpperCase();cover.getCell("B20").font={bold:true,size:16,color:{argb:"FFFFFFFF"}};cover.getCell("B20").alignment={wrapText:true,vertical:"middle",horizontal:"center"};cover.getCell("B20").fill={type:"pattern",pattern:"solid",fgColor:{argb:"FF002B5C"}};cover.mergeCells("G20:K26");cover.getCell("G20").value="ELABORADO POR\n"+meta.author+" | "+meta.position+"\n\nÁREA RESPONSABLE\n"+meta.department+"\n\nDIRIGIDO A\n"+meta.audience+"\n\nPERIODO / ALCANCE\n"+(meta.periodName||meta.scope);cover.getCell("G20").alignment={wrapText:true,vertical:"top"};cover.getCell("G20").font={size:11,color:{argb:"FF344054"}};cover.pageSetup={orientation:"portrait",fitToPage:true,fitToWidth:1,fitToHeight:1,paperSize:1};
  var dash=workbook.addWorksheet("Dashboard",{views:[{showGridLines:false}]});dash.columns=Array.from({length:14},function(){return {width:12};});dash.mergeCells("A1:N3");dash.getCell("A1").value="Dashboard ejecutivo VSM";dash.getCell("A1").font={bold:true,size:22,color:{argb:"FFFFFFFF"}};dash.getCell("A1").fill={type:"pattern",pattern:"solid",fgColor:{argb:"FF002B5C"}};dash.getCell("A1").alignment={vertical:"middle"};v234ExcelAddImage(workbook,dash,v236DashboardCanvas(analysis),{tl:{col:0,row:4},ext:{width:1120,height:630}});dash.mergeCells("A39:N43");dash.getCell("A39").value=analysis.keyMessage;dash.getCell("A39").alignment={wrapText:true,vertical:"top"};dash.getCell("A39").font={bold:true,size:12,color:{argb:"FF002B5C"}};dash.getCell("A39").fill={type:"pattern",pattern:"solid",fgColor:{argb:"FFEAF3FB"}};dash.pageSetup={orientation:"landscape",fitToPage:true,fitToWidth:1,fitToHeight:1,paperSize:1};
  var trend=v234ExcelSheet(workbook,"Tendencias","Tendencias del flujo",meta.scope,["Fecha","Cierres","LT promedio (h)"],analysis.dailyTrend.map(function(x){return [x.day,x.count,v234MsHours(x.avgLt)];}));v234ExcelAddImage(workbook,trend,v236TrendCanvas(analysis),{tl:{col:4,row:3},ext:{width:900,height:470}});
  var proc=v234ExcelSheet(workbook,"Procesos","Desempeño por proceso",meta.scope,["Proceso","Casos","WIP","Atrasados","LT promedio (h)","P50 (h)","P90 (h)","Cumplimiento (%)","Salud (%)","Estado"],analysis.processHealth.map(function(x){return [x.label,x.cases||0,x.wip||0,x.wipLate||0,v234MsHours(x.avg||0),v234MsHours(x.p50||0),v234MsHours(x.p90||0),Number(x.slaPct||0),x.health,x.healthStatus.label];}));v234ExcelAddImage(workbook,proc,v236ProcessCanvas(analysis),{tl:{col:0,row:proc.rowCount+2},ext:{width:930,height:520}});v234ExcelAddImage(workbook,proc,v236MatrixCanvas(analysis),{tl:{col:8,row:proc.rowCount+2},ext:{width:930,height:520}});v235ExcelConditionalPercent(proc,"H",5,proc.rowCount);v235ExcelConditionalPercent(proc,"I",5,proc.rowCount);
  var area=v234ExcelSheet(workbook,"Áreas","Desempeño por área",meta.scope,["Área","Casos","WIP","Cerrados","LT promedio (h)","Cumplimiento (%)","Confiabilidad (%)","No entregas","Salud (%)","Estado"],analysis.areaHealth.map(function(x){return [x.label,x.cases||0,x.wip||0,x.closed||0,v234MsHours(x.avg||0),Number(x.compliance||0),Number(x.reliability||0),x.noDeliveries||0,x.health,x.healthStatus.label];}));v234ExcelAddImage(workbook,area,v236AreaCanvas(analysis),{tl:{col:0,row:area.rowCount+2},ext:{width:980,height:540}});v235ExcelConditionalPercent(area,"F",5,area.rowCount);v235ExcelConditionalPercent(area,"G",5,area.rowCount);v235ExcelConditionalPercent(area,"I",5,area.rowCount);
  if(meta.includeActors){var act=v234ExcelSheet(workbook,"Actores","Productividad por actor","Super Admin excluido",["Actor","Rol","Casos","WIP","Cerrados","Trabajo directo (h)","Promedio (h)","Cumplimiento (%)","Carga directa (%)"],analysis.actors.map(function(x){return [x.user,roleTitle(x.role),x.count||0,x.open||0,x.closed||0,v234MsHours(x.active||0),v234MsHours(x.directPerCase||0),Number(x.compliance||0),Number(x.directLoadPct||0)];}));v234ExcelAddImage(workbook,act,v236ActorCanvas(analysis),{tl:{col:0,row:act.rowCount+2},ext:{width:930,height:540}});}
  if(meta.includeWaits){var waits=v234ExcelSheet(workbook,"Esperas","Novedades, reprocesos y no entregas",meta.scope,["Pedido","Categoría","Área","Proceso","Inicio","Fin","Duración (h)","Abierto","Origen","Detalle"],analysis.reportWaitRows.map(function(x){return [x.pedido,x.category,v225AreaLabel(x.area),processTitle(x.process),x.start?new Date(x.start):"",x.end?new Date(x.end):"",v234MsHours(x.duration||0),x.open?"Sí":"No",x.source,x.detail];}));v234ExcelAddImage(workbook,waits,v236ParetoCanvas(analysis),{tl:{col:0,row:waits.rowCount+2},ext:{width:930,height:520}});}
  if(meta.includeRisks){var risks=v234ExcelSheet(workbook,"Riesgos","Matriz de riesgos",meta.scope,["Nivel","Riesgo","Fuente","Probabilidad","Impacto","Puntuación","Evidencia","Tratamiento"],analysis.risks.map(function(x){return [x.level,x.risk,x.source,x.probability,x.impact,x.score,x.evidence,x.treatment];}));v234ExcelAddImage(workbook,risks,v236RiskCanvas(analysis),{tl:{col:0,row:risks.rowCount+2},ext:{width:980,height:540}});}
  v234ExcelSheet(workbook,"Decisiones","Decisiones y recomendaciones",meta.scope,["Tipo","Señal / contenido","Responsable"],analysis.decisions.map(function(x){return [x.title,x.signal+" | "+x.decision,x.owner];}).concat(analysis.recommendations.map(function(x){return ["Recomendación",x,""];})));
  if(meta.includeActionPlan)v234ExcelSheet(workbook,"Plan de acción","Plan de acción propuesto",meta.scope,["Prioridad","Situación","Acción","Responsable","Meta","Estado","Fecha compromiso","Avance (%)","Observaciones"],analysis.actions.map(function(x){return [x.priority,x.issue,x.action,x.owner,x.target,"Pendiente","",0,""];}));
  if(meta.includeOrders)v234ExcelSheet(workbook,"Pedidos críticos","Anexo operativo",meta.scope,["Pedido","OC","Cliente","Proceso","Responsable","Tiempo (h)","Meta (h)","Estado","Próxima acción"],(m.wipRows||[]).map(function(x){return [x.pedido,x.oc,x.cliente,x.processLabel,x.responsable,v234MsHours(x.age||0),Number(x.slaHours||0),x.late?"Fuera de meta":"Dentro",x.next||""];}));
  v234ExcelSheet(workbook,"Conclusiones","Conclusiones y metodología",meta.scope,["Tipo","Contenido"],[["Conclusión general",analysis.keyMessage],["Plantilla","Formato institucional OFICIOS, tamaño carta."],["Fuente","Datos actuales del VSM y Firebase."]].concat(analysis.strengths.map(function(x){return ["Fortaleza",x];}),analysis.findings.map(function(x){return ["Hallazgo",x];}),analysis.recommendations.map(function(x){return ["Recomendación",x];})));
  workbook.eachSheet(function(s){s.headerFooter={oddHeader:"&CElectroingeniería | "+meta.title,oddFooter:"&L"+meta.author+" | "+meta.department+"&RPágina &P de &N"};});var buffer=await workbook.xlsx.writeBuffer();v234DownloadBlob(new Blob([buffer],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}),v232FileName(meta,"xlsx"));
}

function configureVsmNavigation(){
  var back=$('vsmBackLink');if(!back)return;
  var query=new URLSearchParams(location.search),candidate=query.get('returnTo')||'';
  if(!candidate){try{candidate=sessionStorage.getItem('ei_nova_return_url')||'';}catch(e){}}
  if(candidate){try{var target=new URL(candidate,location.href);if(target.origin===location.origin)back.href=target.href;}catch(e){}}
  if(window.EI_EMBEDDED===true)back.hidden=true;
}
function bindBase(){['fFrom','fTo','fProcess','fStatus','fOrderType','fUser','fView'].forEach(function(id){$(id).addEventListener('change',function(){refresh().catch(function(e){loading(false);status('Error recalculando: '+esc(e.message||e),'bad');});});});$('fSearch').addEventListener('input',function(){clearTimeout(window.__vsmSearch);window.__vsmSearch=setTimeout(function(){refresh().catch(function(e){loading(false);status('Error filtrando: '+esc(e.message||e),'bad');});},250);});$('btnLoad').onclick=function(){loadCases(false).catch(function(e){loading(false);status('Error cargando datos: '+esc(e.message||e),'bad');});};$('btnLoadAll').onclick=function(){loadCases(true).catch(function(e){loading(false);status('Error cargando histórico: '+esc(e.message||e),'bad');});};$('btnExport').onclick=function(){exportExcel().catch(function(e){loading(false);status('Error exportando Excel: '+esc(e.message||e),'bad');});};if($('btnReset'))$('btnReset').onclick=resetVsmFilters;}
(async function(){try{configureVsmNavigation();bind();renderCalendarSummary();renderTraceSources();await initFirebase();await loadBusinessCalendarConfig();$('fFrom').value='';$('fTo').value='';await loadCases(false);if(/[?&]export=1/.test(location.search))setTimeout(function(){$('btnExport').click();},900);}catch(e){loading(false);status('Error inicializando VSM: '+esc(e.message||e),'bad');}})();
})();
