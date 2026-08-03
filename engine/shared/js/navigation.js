(function(){
"use strict";
var currentRole="", currentModule="", currentRoute="";
var ADMIN=["super_admin","super_administrador","admin","administrador"];
var SALES=["ventas","asesor_ventas","asesor","comercial","ejecutivo_comercial"];
var CREDIT=["cartera","jefe_cartera","analista_cartera","credito","creditos","analista_credito","coordinador_cartera"];
var AUDIT=["auditoria","auditor"];
var MANAGEMENT=["gerencia","gerente","manager"];
var LOGISTICS=["jefe_logistica","jefe_logistico","jefe_de_logistica","coordinador_logistico","coordinador_logistica","lider_logistico","lider_logistica","lider_recepcion","lider_de_recepcion","aux_logistica","auxiliar_logistica","auxiliar_de_logistica","aux_logistico","auxiliar_corte","logistica","despacho","auxiliar_despacho"];
var PURCHASE=["compras"];
var PROJECTS=["proyectos"];
var QUALITY=["calidad","quality","analista_calidad","coordinador_calidad"];
var MAINT=["mantenimiento","maintenance","tecnico_mantenimiento","coordinador_mantenimiento"];
function norm(v){return String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim().toLowerCase().replace(/[\s/-]+/g,"_");}
function esc(v){return String(v==null?"":v).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];});}
function inSet(role,list){return list.indexOf(norm(role))>=0;}
function admin(role){return inSet(role,ADMIN);}
function manager(role){return admin(role)||inSet(role,MANAGEMENT);}
function actorGroups(role){role=norm(role);return {admin:admin(role),manager:manager(role),sales:inSet(role,SALES),credit:inSet(role,CREDIT),audit:inSet(role,AUDIT),logistics:inSet(role,LOGISTICS),purchase:inSet(role,PURCHASE),projects:inSet(role,PROJECTS),quality:inSet(role,QUALITY),maintenance:inSet(role,MAINT),cash:role==="caja",reception:/recepcion/.test(role),cut:/corte/.test(role)};}
function enterpriseModuleAllowed(module,g){
  switch(module.id){
    case "maestros": return g.logistics||g.purchase||g.projects||g.quality||g.maintenance||g.audit||g.manager;
    case "inventarios": return g.logistics||g.purchase||g.projects||g.quality||g.audit||g.manager;
    case "planeacion": return g.logistics||g.purchase||g.projects||g.audit||g.manager;
    case "calidad": return g.quality||g.logistics||g.audit||g.manager;
    case "mantenimiento": return g.maintenance||g.logistics||g.audit||g.manager;
    case "auditoria": return g.audit||g.manager;
    default:return false;
  }
}
function intrinsicRouteAllowed(module,route,role){
  if(!module||module.hidden||module.enabled===false||module.id==="integraciones")return false;
  var g=actorGroups(role);if(g.admin)return true;
  switch(module.id){
    case "inicio": return route==="dashboard"||(route==="cases"&&(g.logistics||g.audit||g.manager));
    case "ventas": return g.sales||(route==="sales_reports"&&(g.audit||g.manager));
    case "creditos":
      if(route==="credit_new")return g.sales;
      if(route==="credit_review")return g.credit;
      return route==="credit_workspace"&&(g.sales||g.credit||g.audit||g.manager);
    case "compras": return route==="compras"&&(g.purchase||g.logistics||g.audit||g.manager);
    case "recepcion": return (g.logistics||g.reception||g.audit||g.manager)&&["reception_goods","recepcion_pedidos"].indexOf(route)>=0;
    case "operacion": return (g.logistics||g.cut||g.audit||g.manager)&&["alistamiento","corte_cable","cut_diag"].indexOf(route)>=0;
    case "facturacion": return route==="facturacion"&&(g.logistics||g.credit||g.cash||g.audit||g.manager);
    case "finanzas":
      if(route==="caja")return g.cash||g.audit||g.manager;
      if(route==="cartera")return g.credit||g.audit||g.manager;
      return false;
    case "despachos": return (g.logistics||g.audit||g.manager);
    case "proyectos": return route==="projects"&&(g.projects||g.audit||g.manager);
    case "control":
      if(route==="inventario")return g.sales||g.credit||g.cash||g.purchase||g.logistics||g.projects||g.quality||g.maintenance||g.audit||g.manager;
      if(route==="reports"||route==="requirements")return g.sales||g.credit||g.cash||g.purchase||g.logistics||g.projects||g.audit||g.manager;
      if(route==="approvals")return g.logistics||g.audit||g.manager;
      return false;
    case "vsm": return route==="indicators"&&(g.logistics||g.audit||g.manager);
    case "administracion": return false;
    default:return enterpriseModuleAllowed(module,g);
  }
}
function routeAllowed(module,route,role,allowedRoutes){
  var g=actorGroups(role);if(g.admin)return true;
  if(module.engine==="legacy"&&allowedRoutes&&Object.keys(allowedRoutes).length)return !!allowedRoutes[route];
  return intrinsicRouteAllowed(module,route,role);
}
function moduleAllowed(module,role,allowedRoutes){
  if(!module||module.hidden||module.enabled===false||module.id==="integraciones")return false;
  return (module.routes||[]).some(function(route){return routeAllowed(module,route,role,allowedRoutes);});
}
function accessibleModules(options){
  options=options||{};var role=norm(options.role||currentRole),allowed={};
  (options.allowedRoutes||[]).forEach(function(r){allowed[r]=true;});
  return (window.EI_V2_MODULES||[]).filter(function(m){return moduleAllowed(m,role,allowed);}).map(function(m){
    var routes=(m.routes||[]).filter(function(r){return routeAllowed(m,r,role,allowed);});
    return Object.assign({},m,{routes:routes});
  }).filter(function(m){return m.routes.length;});
}
function href(m,r){return m.url+(r?"?route="+encodeURIComponent(r):"");}
function routeLabel(r){return (window.EI_V2_ROUTE_LABELS||{})[r]||String(r||"").replace(/_/g," ");}
function context(options){options=options||{};return {role:norm(options.role||currentRole),module:options.currentModule||currentModule||(window.EI_CURRENT_MODULE&&window.EI_CURRENT_MODULE.id)||"",route:options.currentRoute||currentRoute||new URLSearchParams(location.search).get("route")||(window.EI_CURRENT_MODULE&&window.EI_CURRENT_MODULE.defaultRoute)||"",allowedRoutes:options.allowedRoutes||[]};}
function renderModule(m,ctx,mobile){
  var active=m.id===ctx.module,contains=m.routes.indexOf(ctx.route)>=0,open=active||contains;
  return '<details class="ei-nav-module'+(active?' active':'')+'" '+(open?'open':'')+' data-ei-nav-module="'+esc(m.id)+'">'+
    '<summary><span class="ei-nav-icon">'+esc(m.icon||"•")+'</span><span class="ei-nav-module-copy"><b>'+esc(m.short||m.title)+'</b><small>'+esc(m.description||m.title||"")+'</small></span><span class="ei-nav-count">'+m.routes.length+'</span><span class="ei-nav-chevron" aria-hidden="true">⌄</span></summary>'+
    '<div class="ei-nav-routes">'+m.routes.map(function(r){var selected=m.id===ctx.module&&r===ctx.route;return '<a class="ei-nav-route'+(selected?' active':'')+'" href="'+esc(href(m,r))+'" data-ei-route="'+esc(r)+'"><span></span><b>'+esc(routeLabel(r))+'</b></a>';}).join("")+'</div></details>';
}
function renderSidebar(options){
  var ctx=context(options),modules=accessibleModules(ctx),groups={},order=[];
  modules.forEach(function(m){var g=m.group||"Módulos";if(!groups[g]){groups[g]=[];order.push(g);}groups[g].push(m);});
  return order.map(function(g){return '<section class="ei-nav-group"><div class="ei-nav-group-title">'+esc(g)+'</div>'+groups[g].map(function(m){return renderModule(m,ctx,false);}).join("")+'</section>';}).join("");
}
function renderMobile(options){
  var ctx=context(options),modules=accessibleModules(ctx),groups={},order=[];
  modules.forEach(function(m){var g=m.group||"Módulos";if(!groups[g]){groups[g]=[];order.push(g);}groups[g].push(m);});
  return '<div class="ei-mobile-nav-list">'+order.map(function(g){return '<section class="ei-mobile-nav-group"><h3>'+esc(g)+'</h3>'+groups[g].map(function(m){return renderModule(m,ctx,true);}).join("")+'</section>';}).join("")+'</div>';
}
function registry(options){
  var ctx=context(options),items=[];
  accessibleModules(ctx).forEach(function(m){items.push({key:"m:"+m.id,title:m.title,subtitle:m.group||"Módulo",keywords:[m.title,m.short,m.group,m.description].join(" "),url:href(m,m.defaultRoute),icon:m.icon||"•",kind:"module"});m.routes.forEach(function(r){items.push({key:"r:"+m.id+":"+r,title:routeLabel(r),subtitle:m.title,keywords:[r,routeLabel(r),m.title,m.group,m.description].join(" "),url:href(m,r),icon:m.icon||"•",kind:"route"});});});
  return items;
}
function setContext(value){value=value||{};if(value.role!=null)currentRole=norm(value.role);if(value.module!=null)currentModule=value.module;if(value.route!=null)currentRoute=value.route;window.EI_NAV_CONTEXT={role:currentRole,module:currentModule,route:currentRoute};}
function bind(root){
  root=root||document;root.querySelectorAll(".ei-nav-module").forEach(function(d){d.addEventListener("toggle",function(){if(!d.open)return;var parent=d.closest(".ei-nav-group,.ei-mobile-nav-group");if(parent)parent.querySelectorAll(".ei-nav-module[open]").forEach(function(other){if(other!==d&&!other.classList.contains("active"))other.removeAttribute("open");});});});
}
window.EI_NAV={setContext:setContext,renderSidebar:renderSidebar,renderMobile:renderMobile,accessibleModules:accessibleModules,registry:registry,routeLabel:routeLabel,bind:bind,normalizeRole:norm};
})();
