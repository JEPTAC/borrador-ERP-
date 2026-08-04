"use strict";
const assert=require("assert");
const fs=require("fs");
const path=require("path");

const root=path.resolve(__dirname,"..");
const model=JSON.parse(fs.readFileSync(path.join(root,"apps/trazabilidad/config/operating-model.json"),"utf8"));
const flow=JSON.parse(fs.readFileSync(path.join(root,"engine/shared/json/flow-contract.json"),"utf8"));
const exceptions=JSON.parse(fs.readFileSync(path.join(root,"engine/shared/json/exception-contract.json"),"utf8"));

const kinds=["PVC","PVN","PVE","PVP"];
const priorities=["normal","priority"];
const clientStates=["AL_DIA","MORA"];
const deliveries=["cliente_punto","cliente_recoge","despacho_local","despacho_nacional"];
const payments=["CONTADO","MIXTO","CREDITO"];
const cutModes=[false,true];
const deliveryOutcomes=["DELIVERED","NOT_DELIVERED"];

function expectedPath(x){
  const p=["ventas"];
  if(x.priority==="priority")p.push("gerencia");
  if(x.clientState==="MORA")p.push("cartera");
  if(x.payment!=="CREDITO")p.push("caja_inicial");
  if(x.kind==="PVE")p.push("compras");
  p.push("recepcion_pedidos","alistamiento");
  if(x.cut)p.push("corte_cable","alistamiento");
  p.push("facturacion");
  if(x.kind==="PVN"&&x.payment!=="CREDITO")p.push("caja_factura_pvn");
  p.push(x.delivery);
  if(x.delivery==="despacho_nacional")p.push("cierre_despacho_nacional");
  p.push(x.outcome==="DELIVERED"?"cierre_caso":"no_entregado");
  return p;
}

let total=0;
for(const kind of kinds)for(const priority of priorities)for(const clientState of clientStates)for(const delivery of deliveries)for(const payment of payments)for(const cut of cutModes)for(const outcome of deliveryOutcomes){
  const row={kind,priority,clientState,delivery,payment,cut,outcome};
  const pathExpected=expectedPath(row);
  total++;
  assert.strictEqual(pathExpected[0],"ventas");
  assert.ok(pathExpected.indexOf("recepcion_pedidos")<pathExpected.indexOf("alistamiento"));
  assert.ok(pathExpected.lastIndexOf("alistamiento")<pathExpected.indexOf("facturacion"));
  assert.ok(pathExpected.indexOf("facturacion")<pathExpected.indexOf(delivery));
  if(cut){
    assert.ok(pathExpected.includes("corte_cable"));
    assert.ok(pathExpected.indexOf("corte_cable")<pathExpected.lastIndexOf("alistamiento"));
  }
  const initialCash=pathExpected.filter(x=>x==="caja_inicial").length;
  assert.strictEqual(initialCash,payment==="CREDITO"?0:1);
  const finalCash=pathExpected.filter(x=>x==="caja_factura_pvn").length;
  assert.strictEqual(finalCash,kind==="PVN"&&payment!=="CREDITO"?1:0);
  if(outcome==="NOT_DELIVERED")assert.strictEqual(pathExpected.at(-1),"no_entregado");
  else assert.strictEqual(pathExpected.at(-1),"cierre_caso");
}
assert.strictEqual(total,768,"La matriz de ciclo de vida debe cubrir 768 escenarios");

const exMap=new Map(exceptions.exceptions.map(x=>[x.code,x]));
for(const code of ["missing_required_data","duplicate_reference","priority","client_arrears","payment_pending","credit_application","purchase_exception","invalid_sales_document","stock_exception","cut_required","cut_exception","route_change","payment_exception","pvn_invoice_upload","no_delivery","cancellation","reopen","drive_offline","concurrent_transition","inactive_or_unauthorized_user"]){
  assert.ok(exMap.has(code),`Falta excepción ${code}`);
}
assert.deepStrictEqual(model.approvalTypes.cancellation,["jefe_logistica","gerencia","super_admin"]);
assert.ok(model.approvalTypes.route_change.includes("gerencia"));
assert.ok(model.approvalTypes.stock_exception.includes("gerencia"));
assert.ok(model.approvalTypes.reopen.includes("gerencia"));
assert.ok(model.approvalTypes.payment_exception.includes("gerencia"));
assert.deepStrictEqual(flow.processes.corte_cable.next,["alistamiento"]);
assert.ok(flow.invariants.some(x=>/PVN contado o mixto/i.test(x)));

const noDelivery=exMap.get("no_delivery");
for(const required of ["reprogramar_misma_ruta","volver_alistamiento","enviar_caja","enviar_cartera","route_change","cancelation_request","cerrar_con_novedad"]){
  assert.ok(noDelivery.outcomes.includes(required),`No entrega no contempla ${required}`);
}

console.log("V8 lifecycle OK",total,"escenarios de ciclo de vida y",exceptions.exceptions.length,"excepciones controladas");
