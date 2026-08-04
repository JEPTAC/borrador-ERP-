(function(root){
"use strict";
var model={"version":"8.0.0","principles":["Cada usuario operativo ve únicamente su bandeja, sus pedidos y las acciones necesarias para avanzar.","Gerencia, Jefatura logística y Auditoría son perfiles de consulta; solo ejecutan aprobaciones explícitas.","Super Admin es el único usuario maestro con administración total.","Los comentarios y novedades viven dentro del pedido; no existe un módulo independiente de novedades.","Toda transición se valida tanto en la interfaz como en PostgreSQL/RLS.","Ningún pedido puede avanzar sin cliente, modalidad de entrega y condición de pago."],"roles":{"super_admin":{"label":"Super Admin","group":"admin","viewMode":"admin","description":"Control maestro de usuarios, contraseñas, configuración, diagnóstico, VSM y excepciones.","canApprove":["priority","cancellation","route_change","stock_exception","flow_exception","reopen","payment_exception"],"routes":["*","approvals"]},"gerencia":{"label":"Gerencia","group":"management","viewMode":"oversight","description":"Consulta general y aprobación; no opera pedidos ni administra perfiles.","canApprove":["priority","cancellation","route_change","stock_exception","flow_exception","reopen","payment_exception"],"routes":["dashboard","cases","sales_reports","credit_workspace","credit_review","cartera","caja","compras","reception_goods","recepcion_pedidos","alistamiento","corte_cable","facturacion","cliente_punto","cliente_recoge","despacho_local","despacho_nacional","cierre_despacho_nacional","approvals","inventario","indicators"]},"jefe_logistica":{"label":"Jefe de logística","group":"logistics_manager","viewMode":"oversight","description":"Supervisa logística, Corte, rutas local/nacional, VSM e inventario de chipas. Solo interviene mediante aprobaciones.","canApprove":["cancellation","route_change","stock_exception","flow_exception","reopen"],"routes":["dashboard","cases","approvals","inventario","indicators","recepcion_pedidos","alistamiento","corte_cable","facturacion","cliente_punto","cliente_recoge","despacho_local","despacho_nacional","cierre_despacho_nacional"]},"ventas":{"label":"Ventas","group":"sales","viewMode":"operational","description":"Crea pedidos, solicitudes de crédito, comentarios y novedades de no entrega; consulta únicamente sus ventas.","routes":["dashboard","create","sales_reports","credit_workspace","credit_new","approvals"]},"compras":{"label":"Compras","group":"purchases","viewMode":"operational","description":"Gestiona y libera exclusivamente pedidos PVE.","routes":["dashboard","compras","approvals"]},"aux_logistica":{"label":"Auxiliar logístico","group":"picking","viewMode":"operational","description":"Solo ejecuta alistamientos asignados y retoma pedidos cuando Corte finaliza.","routes":["dashboard","alistamiento","approvals"]},"auxiliar_corte":{"label":"Auxiliar de corte","group":"cut","viewMode":"operational","description":"Ejecuta cortes asignados y puede apoyar prealistamientos controlados.","routes":["dashboard","corte_cable","approvals"]},"despacho_nacional":{"label":"Despacho nacional","group":"national_dispatch","viewMode":"operational","description":"Recepción, facturación, despacho y cierre de pedidos destinados a despacho nacional.","routes":["dashboard","recepcion_pedidos","facturacion","despacho_nacional","cierre_despacho_nacional","approvals"]},"coordinador_logistico":{"label":"Coordinador logístico local","group":"local_dispatch","viewMode":"operational","description":"Recepción, facturación y entrega de cliente en punto, cliente recoge y despacho local.","routes":["dashboard","recepcion_pedidos","facturacion","cliente_punto","cliente_recoge","despacho_local","approvals"]},"caja":{"label":"Caja","group":"cash","viewMode":"operational","description":"Valida contado/mixto, pagos, soportes y bloqueos de pago antes de liberar el pedido.","routes":["dashboard","caja","approvals"]},"cartera":{"label":"Cartera","group":"credit","viewMode":"operational","description":"Gestiona mora/retenciones y decide solicitudes de crédito.","routes":["dashboard","cartera","credit_workspace","credit_review","approvals"]},"recepcion_mercancia":{"label":"Recepción de mercancía","group":"goods_reception","viewMode":"operational","description":"Solo registra recepción física, conformidad y stickers.","routes":["dashboard","reception_goods","approvals"]},"auditoria":{"label":"Auditoría","group":"audit","viewMode":"oversight","description":"Consulta transversal de solo lectura.","routes":["dashboard","cases","sales_reports","credit_workspace","credit_review","cartera","caja","compras","reception_goods","recepcion_pedidos","alistamiento","corte_cable","facturacion","cliente_punto","cliente_recoge","despacho_local","despacho_nacional","cierre_despacho_nacional","approvals","inventario","indicators"]}},"aliases":{"admin":"super_admin","administrador":"super_admin","super_administrador":"super_admin","gerente":"gerencia","asesor_ventas":"ventas","asesor":"ventas","comercial":"ventas","auxiliar_logistica":"aux_logistica","auxiliar_de_logistica":"aux_logistica","aux_logistico":"aux_logistica","corte":"auxiliar_corte","operador_corte":"auxiliar_corte","lider_recepcion":"recepcion_mercancia","recepcion":"recepcion_mercancia","jefe_logistico":"jefe_logistica","auditor":"auditoria","despacho":"despacho_nacional","auxiliar_despacho":"despacho_nacional"},"deliveryRoutes":{"cliente_punto":{"label":"Cliente en punto","ownerRole":"coordinador_logistico","family":"local"},"cliente_recoge":{"label":"Cliente recoge","ownerRole":"coordinador_logistico","family":"local"},"despacho_local":{"label":"Despacho local","ownerRole":"coordinador_logistico","family":"local"},"despacho_nacional":{"label":"Despacho nacional","ownerRole":"despacho_nacional","family":"national"}},"financialRouting":{"clientHoldOrArrears":"cartera","CONTADO":"caja","MIXTO":"caja","CREDITO":null,"afterRelease":"PVE pasa a Compras; PVC/PVN/PVP pasan a Recepción del dueño de la ruta."},"approvalTypes":{"priority":["gerencia","super_admin"],"cancellation":["jefe_logistica","gerencia","super_admin"],"route_change":["jefe_logistica","gerencia","super_admin"],"stock_exception":["jefe_logistica","gerencia","super_admin"],"flow_exception":["jefe_logistica","gerencia","super_admin"],"reopen":["jefe_logistica","gerencia","super_admin"],"payment_exception":["caja","cartera","gerencia","super_admin"]},"requestTypes":[{"code":"cancellation","label":"Cancelación de pedido"},{"code":"route_change","label":"Cambio de modalidad de entrega"},{"code":"stock_exception","label":"Excepción de inventario o remanente"},{"code":"flow_exception","label":"Excepción de flujo"},{"code":"reopen","label":"Reapertura de pedido"},{"code":"data_correction","label":"Corrección de datos"},{"code":"payment_exception","label":"Excepción financiera"},{"code":"no_delivery","label":"Novedad de no entrega"}]};
function norm(v){return String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim().toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_+|_+$/g,"");}
function role(v){var r=norm(v);return model.roles[r]?r:(model.aliases[r]||r);}
function meta(v){return model.roles[role(v)]||{label:"Usuario",group:"user",viewMode:"operational",routes:["dashboard"]};}
function routes(v){return (meta(v).routes||[]).slice();}
function hasRoute(v,r){var list=routes(v);return list.indexOf("*")>=0||list.indexOf(r)>=0;}
function isOversight(v){return ["oversight","admin"].indexOf(meta(v).viewMode)>=0;}
function isReadOnly(v){var r=role(v);return r==="gerencia"||r==="jefe_logistica"||r==="auditoria";}
function deliveryRoute(c){
  c=c||{};
  var values=[c.pendingDeliveryType,c.requestedDelivery,c.deliveryType,c.currentProcess];
  for(var i=0;i<values.length;i++){
    var x=norm(values[i]);
    if(x==="cierre_despacho_nacional")x="despacho_nacional";
    if(model.deliveryRoutes[x])return x;
    if(/nacional|transportadora|guia|flete/.test(x))return "despacho_nacional";
    if(/local|domicilio|direccion/.test(x))return "despacho_local";
    if(/recoge/.test(x))return "cliente_recoge";
    if(/punto/.test(x))return "cliente_punto";
  }
  return "";
}
function routeOwner(c){var r=deliveryRoute(c);return r&&model.deliveryRoutes[r]?model.deliveryRoutes[r].ownerRole:"";}
function aliasesOfUser(user){
  user=user||{};var raw=[user.uid,user.id,user.userId,user.authUid,user.profileUid,user.email,user.name,user.displayName];
  if(Array.isArray(user.uidAliases))raw=raw.concat(user.uidAliases);
  return raw.map(function(v){return String(v||"").trim().toLowerCase();}).filter(Boolean);
}
function assignedAliases(c){
  c=c||{};var raw=[c.assignedUid,c.assignedTo,c.assignedEmail,c.assignedName];
  if(Array.isArray(c.assignedUserIds))raw=raw.concat(c.assignedUserIds);
  if(Array.isArray(c.assignedUsers))c.assignedUsers.forEach(function(u){raw=raw.concat([u&&u.uid,u&&u.id,u&&u.email,u&&u.name]);});
  return raw.map(function(v){return String(v||"").trim().toLowerCase();}).filter(Boolean);
}
function assignedTo(user,c){var mine=aliasesOfUser(user),hay=assignedAliases(c);return mine.some(function(x){return hay.indexOf(x)>=0;});}
function salesOwns(user,c){user=user||{};c=c||{};var mine=aliasesOfUser(user),raw=[c.createdBy,c.createdByUid,c.createdByEmail,c.createdByName,c.salesAdvisor,c.salesAdvisorEmail];return raw.map(function(v){return String(v||"").trim().toLowerCase();}).some(function(x){return mine.indexOf(x)>=0;});}
function canViewCase(user,c){
  if(!user||!c)return false;var r=role(user.role);
  if(["super_admin","gerencia","jefe_logistica","auditoria"].indexOf(r)>=0)return true;
  if(r==="ventas")return salesOwns(user,c);
  if(r==="compras")return norm(c.currentProcess)==="compras";
  if(r==="caja")return norm(c.currentProcess)==="caja"||role(c.assignedRole)==="caja";
  if(r==="cartera")return norm(c.currentProcess)==="cartera"||role(c.assignedRole)==="cartera";
  if(r==="recepcion_mercancia")return false;
  if(r==="aux_logistica")return norm(c.currentProcess)==="alistamiento"&&assignedTo(user,c);
  if(r==="auxiliar_corte")return norm(c.currentProcess)==="corte_cable"&&(assignedTo(user,c)||role(c.assignedRole)==="auxiliar_corte");
  if(r==="coordinador_logistico")return routeOwner(c)==="coordinador_logistico"&&["recepcion_pedidos","facturacion","cliente_punto","cliente_recoge","despacho_local","no_entregado"].indexOf(norm(c.currentProcess))>=0;
  if(r==="despacho_nacional")return routeOwner(c)==="despacho_nacional"&&["recepcion_pedidos","facturacion","despacho_nacional","cierre_despacho_nacional","no_entregado"].indexOf(norm(c.currentProcess))>=0;
  return false;
}
function canAccessProcess(roleValue,p){
  var r=role(roleValue),process=norm(p);
  if(r==="super_admin")return true;
  if(["gerencia","jefe_logistica","auditoria"].indexOf(r)>=0)return hasRoute(r,process);
  return hasRoute(r,process);
}
function canOperateCase(user,c){
  if(!user||!c)return false;var r=role(user.role),p=norm(c.currentProcess);
  if(r==="super_admin")return true;
  if(["gerencia","jefe_logistica","auditoria","ventas","recepcion_mercancia"].indexOf(r)>=0)return false;
  if(r==="aux_logistica")return p==="alistamiento"&&assignedTo(user,c);
  if(r==="auxiliar_corte")return p==="corte_cable"&&(assignedTo(user,c)||role(c.assignedRole)==="auxiliar_corte");
  if(r==="coordinador_logistico")return routeOwner(c)==="coordinador_logistico"&&["recepcion_pedidos","facturacion","cliente_punto","cliente_recoge","despacho_local","no_entregado"].indexOf(p)>=0;
  if(r==="despacho_nacional")return routeOwner(c)==="despacho_nacional"&&["recepcion_pedidos","facturacion","despacho_nacional","cierre_despacho_nacional","no_entregado"].indexOf(p)>=0;
  if(r==="compras")return p==="compras";
  if(r==="caja")return p==="caja";
  if(r==="cartera")return p==="cartera";
  return false;
}
function canApprove(roleValue,type){var r=role(roleValue),list=(model.approvalTypes[type]||[]);return list.indexOf(r)>=0;}
root.EI_ROLE_POLICY={model:model,normalize:norm,role:role,meta:meta,routes:routes,hasRoute:hasRoute,isOversight:isOversight,isReadOnly:isReadOnly,deliveryRoute:deliveryRoute,routeOwner:routeOwner,assignedTo:assignedTo,salesOwns:salesOwns,canViewCase:canViewCase,canAccessProcess:canAccessProcess,canOperateCase:canOperateCase,canApprove:canApprove};
})(window);