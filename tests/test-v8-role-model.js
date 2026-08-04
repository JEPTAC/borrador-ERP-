const fs=require("fs"),path=require("path");
const root=path.resolve(__dirname,"..");
function readJson(p){return JSON.parse(fs.readFileSync(path.join(root,p),"utf8"));}
const roles=readJson("core/config/roles.json");
const tx=readJson("apps/trazabilidad/config/transactions.json");
const model=readJson("apps/trazabilidad/config/operating-model.json");
const flow=readJson("engine/shared/json/flow-contract.json");
const required=["super_admin","gerencia","jefe_logistica","ventas","compras","aux_logistica","auxiliar_corte","despacho_nacional","coordinador_logistico","caja","cartera","recepcion_mercancia","auditoria"];
for(const r of required){if(!model.roles[r])throw new Error("Falta rol "+r);}
if(model.deliveryRoutes.despacho_nacional.ownerRole!=="despacho_nacional")throw new Error("Ruta nacional incorrecta");
if(model.deliveryRoutes.despacho_local.ownerRole!=="coordinador_logistico")throw new Error("Ruta local incorrecta");
if(flow.requiredOrderFields.length<5)throw new Error("Campos obligatorios incompletos");
const actionGroups=tx.modules.flatMap(m=>m.actions||[]).flatMap(a=>a.groups||[]);
for(const g of actionGroups){if(g!=="all"&&!roles.labels[g])throw new Error("Grupo sin etiqueta: "+g);}
console.log("V8 role-first OK",required.length,"roles",tx.modules.length,"módulos");
