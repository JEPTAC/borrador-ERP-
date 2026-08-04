"use strict";
const assert=require("assert");

const kinds=["PVC","PVN","PVE","PVP"];
const priorities=["normal","priority"];
const clientStates=["AL_DIA","MORA"];
const deliveries=["cliente_punto","cliente_recoge","despacho_local","despacho_nacional"];
const payments=["CONTADO","MIXTO","CREDITO"];

function routeOwner(delivery){return delivery==="despacho_nacional"?"despacho_nacional":"coordinador_logistico";}
function expectedGates(row){
  const gates=[];
  if(row.priority==="priority")gates.push("gerencia");
  if(row.clientState==="MORA")gates.push("cartera");
  if(row.payment==="CONTADO"||row.payment==="MIXTO")gates.push("caja");
  if(row.kind==="PVE")gates.push("compras");
  gates.push("recepcion_pedidos","alistamiento","facturacion");
  if(row.kind==="PVN"&&(row.payment==="CONTADO"||row.payment==="MIXTO"))gates.push("caja");
  gates.push(row.delivery);
  if(row.delivery==="despacho_nacional")gates.push("cierre_despacho_nacional");
  gates.push("cierre_caso");
  return gates;
}

const rows=[];
for(const kind of kinds)for(const priority of priorities)for(const clientState of clientStates)for(const delivery of deliveries)for(const payment of payments){
  const row={kind,priority,clientState,delivery,payment};
  const gates=expectedGates(row);
  assert.strictEqual(gates.filter(x=>x==="gerencia").length,priority==="priority"?1:0);
  assert.strictEqual(gates.includes("cartera"),clientState==="MORA");
  assert.strictEqual(gates.includes("caja"),payment!=="CREDITO");
  assert.strictEqual(gates.includes("compras"),kind==="PVE");
  assert.strictEqual(routeOwner(delivery),delivery==="despacho_nacional"?"despacho_nacional":"coordinador_logistico");
  assert.ok(gates.indexOf("facturacion")<gates.lastIndexOf(delivery),"Facturación debe ocurrir antes de entrega");
  const cajaCount=gates.filter(x=>x==="caja").length;
  const expectedCaja=(payment!=="CREDITO"?1:0)+(kind==="PVN"&&payment!=="CREDITO"?1:0);
  assert.strictEqual(cajaCount,expectedCaja,"Número incorrecto de intervenciones de Caja");
  if(clientState==="MORA"&&payment!=="CREDITO")assert.ok(gates.indexOf("cartera")<gates.indexOf("caja"),"Cartera debe liberar antes de Caja");
  if(kind==="PVE"){
    const previous=payment!=="CREDITO"?"caja":(clientState==="MORA"?"cartera":(priority==="priority"?"gerencia":null));
    if(previous)assert.ok(gates.indexOf(previous)<gates.indexOf("compras"),"Compras debe respetar puertas previas");
  }
  rows.push({row,gates});
}
assert.strictEqual(rows.length,192);

const approvals={
  priority:["gerencia","super_admin"],
  cancellation:["jefe_logistica","gerencia","super_admin"],
  route_change:["jefe_logistica","gerencia","super_admin"],
  stock_exception:["jefe_logistica","gerencia","super_admin"],
  flow_exception:["jefe_logistica","gerencia","super_admin"],
  reopen:["jefe_logistica","gerencia","super_admin"],
  payment_exception:["caja","cartera","gerencia","super_admin"],
  no_delivery:["coordinador_logistico|despacho_nacional","super_admin"]
};
assert.deepStrictEqual(approvals.cancellation,["jefe_logistica","gerencia","super_admin"]);
console.log("V8 flow matrix OK",rows.length,"combinaciones válidas y",Object.keys(approvals).length,"tipos de aprobación");
