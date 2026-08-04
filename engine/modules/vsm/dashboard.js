(function(){
"use strict";
var CORE=window.EI_SUPABASE;
var state={session:null,client:null,cases:[],timeline:[],processes:[],stuck:[],health:[],filteredCases:[],filteredTimeline:[],channel:null,liveTimer:null};
function el(id){return document.getElementById(id);}
function esc(v){return String(v==null?"":v).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];});}
function norm(v){return String(v||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");}
function date(v){var d=new Date(v||0);return isNaN(d.getTime())?null:d;}
function fmt(v){var d=date(v);return d?d.toLocaleString("es-CO"):"—";}
function hours(sec){sec=Number(sec||0);return (sec/3600).toLocaleString("es-CO",{minimumFractionDigits:1,maximumFractionDigits:1})+" h";}
function toast(message){var t=el("toast");t.textContent=message;t.classList.add("show");setTimeout(function(){t.classList.remove("show");},2800);}
function fetchAll(table,options){
  options=options||{};var pageSize=Number(options.pageSize||1000),max=Number(options.max||50000),rows=[];
  function page(from){
    var request=state.client.from(table).select(options.select||"*").range(from,Math.min(from+pageSize-1,max-1));
    if(options.order)request=request.order(options.order,{ascending:options.ascending!==false});
    return request.then(function(result){
      if(result.error)throw result.error;
      var batch=result.data||[];rows=rows.concat(batch);
      if(batch.length===pageSize&&rows.length<max)return page(from+pageSize);
      return rows;
    });
  }
  return page(0);
}
function runGuardian(){
  return state.client.rpc("erp_scan_flow_health").then(function(result){
    if(result.error){console.warn("El guardián no pudo ejecutarse",result.error);return null;}
    return result.data;
  });
}
function uniqOptions(id,values){var s=el(id),current=s.value,opts=Array.from(new Set(values.filter(Boolean))).sort();s.innerHTML='<option value="">Todos</option>'+opts.map(function(v){return '<option value="'+esc(v)+'">'+esc(String(v).replace(/_/g," "))+'</option>';}).join("");s.value=current;}
function matches(c){
  var term=norm(el("searchInput").value),type=el("typeFilter").value,proc=el("processFilter").value,status=el("statusFilter").value,from=el("dateFrom").value,to=el("dateTo").value;
  var hay=norm([c.reference,c.client,c.assigned_name,c.assigned_role,c.status,c.current_process,c.order_kind,c.purchase_order,c.invoice_number].join(" "));
  if(term&&hay.indexOf(term)<0)return false;
  if(type&&String(c.order_kind||"").toUpperCase()!==type)return false;
  if(proc&&c.current_process!==proc)return false;
  if(status&&c.status!==status)return false;
  var d=date(c.created_at);
  if(from&&(!d||d<new Date(from+"T00:00:00")))return false;
  if(to&&(!d||d>new Date(to+"T23:59:59")))return false;
  return true;
}
function apply(){state.filteredCases=state.cases.filter(matches);var ids=new Set(state.filteredCases.map(function(c){return c.case_id;}));state.filteredTimeline=state.timeline.filter(function(x){return ids.has(x.case_id);});render();}
function renderKpis(){
  var rows=state.filteredCases,open=rows.filter(function(c){return !/cerrad|cancelad|finalizad/i.test(c.status||"");}),avg=rows.length?rows.reduce(function(a,c){return a+Number(c.business_seconds||0);},0)/rows.length:0,events=rows.reduce(function(a,c){return a+Number(c.event_count||0);},0),evidences=rows.reduce(function(a,c){return a+Number(c.evidence_count||0);},0),closed=rows.length-open.length,critical=state.health.filter(function(h){return h.health_status==="CRITICAL"&&rows.some(function(c){return c.case_id===h.case_id;});}).length;
  el("kpiGrid").innerHTML=[
    ["Pedidos analizados",rows.length,"Según filtros"],
    ["Abiertos",open.length,"WIP actual"],
    ["Cerrados",closed,"Incluye cancelados"],
    ["LT hábil promedio",hours(avg),"Calendario laboral"],
    ["Alertas críticas",critical,"Guardián de flujo"],
    ["Evidencias",evidences,"Metadatos Drive · "+events+" eventos"]
  ].map(function(k){return '<article class="kpi"><span>'+k[0]+'</span><strong>'+k[1]+'</strong><small>'+k[2]+'</small></article>';}).join("");
}
function renderProcesses(){
  var ids=new Set(state.filteredCases.map(function(c){return c.case_id;})),rows=state.processes.filter(function(p){return ids.has(p.case_id);}),map={};
  rows.forEach(function(p){var k=p.process_code||"sin_proceso",x=map[k]||(map[k]={count:0,business:0,active:0,wait:0,dead:0});x.count++;x.business+=Number(p.business_seconds||0);x.active+=Number(p.active_ms||0);x.wait+=Number(p.wait_ms||0);x.dead+=Number(p.dead_ms||0);});
  var values=Object.keys(map).map(function(k){return {code:k,data:map[k]};}).sort(function(a,b){return b.data.business-a.data.business;}),max=Math.max.apply(null,values.map(function(x){return x.data.business;}));if(!isFinite(max)||max<=0)max=1;
  el("processScope").textContent=values.length+" procesos · "+rows.length+" intervalos";
  el("processGrid").innerHTML=values.length?values.map(function(x){var avg=x.data.count?x.data.business/x.data.count:0;return '<article class="process-card"><h3>'+esc(x.code.replace(/_/g," "))+'</h3><strong>'+hours(avg)+'</strong><small>'+x.data.count+' pedidos · Activo '+(x.data.active/3600000).toFixed(1)+' h · Espera '+(x.data.wait/3600000).toFixed(1)+' h · Muerto '+(x.data.dead/3600000).toFixed(1)+' h</small><div class="bar"><span style="width:'+Math.max(3,Math.round(x.data.business/max*100))+'%"></span></div></article>';}).join(""):'<div class="empty">No hay intervalos para estos filtros.</div>';
}
function issueText(row){
  var list=Array.isArray(row.issues)?row.issues:[];
  return list.slice(0,3).map(function(x){return x.message||x.code||"Hallazgo";}).join(" · ");
}
function renderStuck(){
  var ids=new Set(state.filteredCases.map(function(c){return c.case_id;})),healthById={};state.health.forEach(function(h){healthById[h.case_id]=h;});
  var rows=state.stuck.filter(function(c){return ids.has(c.case_id);}).map(function(c){return Object.assign({},c,healthById[c.case_id]||{});}).sort(function(a,b){return Number(b.critical_count||0)-Number(a.critical_count||0)||Number(b.business_hours_open||b.business_age_hours||0)-Number(a.business_hours_open||a.business_age_hours||0);}).slice(0,18);
  el("stuckList").innerHTML=rows.length?rows.map(function(c){var h=Number(c.business_hours_open||c.business_age_hours||0),critical=Number(c.critical_count||0),cls=critical>0||h>48?"bad":"",details=issueText(c);return '<article class="stack-item '+cls+'"><div><strong>'+esc(c.reference||c.case_id)+'</strong><small>'+esc(c.client||'')+' · '+esc(c.current_process||'sin proceso')+' · '+esc(c.assigned_name||c.assigned_role||'sin responsable')+'</small>'+(details?'<small class="issue-detail">'+esc(details)+'</small>':'')+'</div><span class="badge">'+h.toFixed(1)+' h · '+Number(c.issue_count||0)+' alertas</span></article>';}).join(""):'<div class="empty">No hay pedidos potencialmente estancados en el filtro actual.</div>';
}
function renderCoverage(){
  var rows=state.filteredCases,total=rows.length,withEvents=rows.filter(function(c){return Number(c.event_count||0)>0;}).length,withEvidence=rows.filter(function(c){return Number(c.evidence_count||0)>0;}).length,assigned=rows.filter(function(c){return c.assigned_name||c.assigned_role;}).length;
  function pct(n){return total?Math.round(n/total*100):0;}
  el("coverageGrid").innerHTML=[["Con eventos",pct(withEvents)+"%",withEvents+"/"+total],["Con evidencias",pct(withEvidence)+"%",withEvidence+"/"+total],["Con responsable",pct(assigned)+"%",assigned+"/"+total],["Filas timeline",state.filteredTimeline.length,"movimientos"]].map(function(x){return '<article><span>'+x[0]+'</span><strong>'+x[1]+'</strong><small>'+x[2]+'</small></article>';}).join("");
}
function renderTimeline(){var rows=state.filteredTimeline.slice().sort(function(a,b){return new Date(b.occurred_at)-new Date(a.occurred_at);}).slice(0,5000);el("resultCount").textContent=rows.length+" movimientos mostrados";el("timelineBody").innerHTML=rows.length?rows.map(function(x){return '<tr><td>'+esc(fmt(x.occurred_at))+'</td><td><strong>'+esc(x.reference||x.case_id)+'</strong></td><td>'+esc(x.client||"")+'</td><td><span class="badge">'+esc(x.order_kind||"")+'</span></td><td>'+esc(x.process_name||x.process_code||"")+'</td><td>'+esc(x.movement_type||"")+'</td><td>'+esc(x.responsible_name||x.responsible_role||"")+'</td><td>'+esc(x.detail||"")+'</td></tr>';}).join(""):'<tr><td colspan="8" class="empty">No hay movimientos para mostrar.</td></tr>';}
function renderCases(){var health={};state.health.forEach(function(h){health[h.case_id]=h;});var rows=state.filteredCases.slice().sort(function(a,b){return Number(b.business_seconds||0)-Number(a.business_seconds||0);});el("casesBody").innerHTML=rows.length?rows.map(function(c){var h=health[c.case_id]||{};return '<tr><td><strong>'+esc(c.reference||c.case_id)+'</strong></td><td>'+esc(c.client||"")+'</td><td><span class="badge">'+esc(c.order_kind||"")+'</span></td><td>'+esc(c.status||"")+'</td><td>'+esc(c.current_process||"")+'</td><td>'+esc(c.assigned_name||c.assigned_role||"")+'</td><td>'+hours(c.business_seconds)+'</td><td>'+Number(c.event_count||0)+'</td><td>'+Number(c.evidence_count||0)+'</td><td>'+(h.issue_count?'<span class="badge health-'+esc((h.health_status||"").toLowerCase())+'">'+Number(h.issue_count)+' alertas</span>':esc(fmt(c.updated_at||c.created_at)))+'</td></tr>';}).join(""):'<tr><td colspan="10" class="empty">No hay pedidos para mostrar.</td></tr>';}
function render(){renderKpis();renderProcesses();renderStuck();renderCoverage();renderTimeline();renderCases();}
function load(){
  el("connectionState").textContent="Actualizando guardián y VSM…";
  return runGuardian().then(function(){return Promise.all([
    fetchAll("v_vsm_case_summary",{max:20000}),
    fetchAll("v_vsm_timeline_complete",{order:"occurred_at",ascending:false,max:50000}),
    fetchAll("v_vsm_process_summary",{max:30000}),
    fetchAll("v_vsm_stuck_cases",{max:20000}),
    fetchAll("v_vsm_flow_health",{max:20000})
  ]);}).then(function(v){
    state.cases=v[0];state.timeline=v[1];state.processes=v[2];state.stuck=v[3];state.health=v[4];
    uniqOptions("processFilter",state.cases.map(function(c){return c.current_process;}));uniqOptions("statusFilter",state.cases.map(function(c){return c.status;}));
    el("connectionState").textContent="Supabase conectado · "+state.cases.length+" pedidos · "+state.timeline.length+" movimientos";el("connectionState").className="connection ok";apply();
  }).catch(function(e){el("connectionState").textContent="Error: "+e.message;el("connectionState").className="connection bad";throw e;});
}
function exportCsv(){var rows=state.filteredTimeline;if(!rows.length)return toast("No hay movimientos para exportar.");var cols=["occurred_at","reference","client","order_kind","process_code","process_name","movement_type","responsible_name","responsible_role","detail","source","source_id"],qv=function(v){return '"'+String(v==null?"":v).replace(/"/g,'""')+'"';},csv='\ufeff'+cols.map(qv).join(';')+'\n'+rows.map(function(r){return cols.map(function(c){return qv(r[c]);}).join(';');}).join('\n'),url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"})),a=document.createElement("a");a.href=url;a.download="VSM_EI_ERP_"+new Date().toISOString().slice(0,10)+".csv";a.click();setTimeout(function(){URL.revokeObjectURL(url);},1000);}
function bind(){["searchInput","typeFilter","processFilter","statusFilter","dateFrom","dateTo"].forEach(function(id){el(id).addEventListener(id==="searchInput"?"input":"change",apply);});el("clearFilters").onclick=function(){["searchInput","typeFilter","processFilter","statusFilter","dateFrom","dateTo"].forEach(function(id){el(id).value="";});apply();};el("refreshBtn").onclick=function(){load().then(function(){toast("VSM y guardián actualizados.");}).catch(function(e){toast(e.message);});};el("exportBtn").onclick=exportCsv;el("signOutBtn").onclick=function(){CORE.state.auth.signOut().finally(function(){location.href="../../../index.html";});};}
function subscribe(){state.channel=state.client.channel("vsm-live-"+Math.random().toString(36).slice(2)).on("postgres_changes",{event:"*",schema:"public",table:"case_events"},schedule).on("postgres_changes",{event:"*",schema:"public",table:"cases"},schedule).on("postgres_changes",{event:"*",schema:"public",table:"erp_flow_health"},schedule).subscribe();}
function schedule(){clearTimeout(state.liveTimer);state.liveTimer=setTimeout(load,800);}
function start(){return CORE.requireSession({loginUrl:"../../../index.html"}).then(function(s){state.session=s;state.client=s.client;bind();return load();}).then(subscribe);}
start().catch(function(e){el("connectionState").textContent="No fue posible abrir VSM: "+e.message;el("connectionState").className="connection bad";console.error(e);});
})();
