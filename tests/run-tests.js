"use strict";
const fs=require("fs"),path=require("path"),assert=require("assert"),vm=require("vm");
const root=path.resolve(__dirname,"..");
function read(rel){return fs.readFileSync(path.join(root,rel),"utf8");}
function json(rel){return JSON.parse(read(rel));}
function exists(rel){assert.ok(fs.existsSync(path.join(root,rel)),`Falta ${rel}`);}
function test(name,fn){try{fn();console.log("✓",name);}catch(error){console.error("✗",name);throw error;}}

test("arquitectura ERP de tres niveles",()=>{
  ["index.html","portal/index.html","apps/trazabilidad/index.html","engine/modules/ventas/index.html"].forEach(exists);
  ["ios/index.html","compact/index.html","square/index.html","portal/ios/index.html","portal/compact/index.html","portal/square/index.html","apps/trazabilidad/ios/index.html","apps/trazabilidad/compact/index.html","apps/trazabilidad/square/index.html"].forEach(exists);
  const apps=json("core/config/applications.json");assert.strictEqual(apps.version,"7.0.0");assert.strictEqual(apps.applications.length,1);assert.strictEqual(apps.applications[0].id,"trazabilidad");
});

test("Supabase es el backend activo",()=>{
  const config=read("core/js/config.js"),supabase=read("core/js/supabase.js"),bootstrap=read("engine/shared/js/bootstrap.js");
  assert.ok(config.includes("hezjxcxxcjlpmyalftam.supabase.co"));assert.ok(config.includes("sb_publishable_"));
  assert.ok(!/sb_secret_|service_role|BEGIN PRIVATE KEY/.test([config,supabase,bootstrap].join("\n")));
  assert.ok(supabase.includes("createClient"));assert.ok(supabase.includes("signInWithPassword"));assert.ok(supabase.includes("onAuthStateChange"));
  assert.ok(bootstrap.includes("supabase-legacy-adapter.js"));assert.ok(!bootstrap.includes("firebase-config.js"));
});

test("catálogo por rol, PVP, crédito, Corte y VSM",()=>{
  const catalog=json("apps/trazabilidad/config/transactions.json");assert.strictEqual(catalog.version,"7.0.0");
  const actions=new Map();let count=0;
  for(const mod of catalog.modules){assert.ok(mod.actions&&mod.actions.length);for(const action of mod.actions){count++;actions.set(`${mod.id}:${action.id}`,action);exists(`engine/modules/${action.module}/index.html`);const moduleJs=read(`engine/modules/${action.module}/assets/js/module.js`);assert.ok(moduleJs.includes(`"${action.route}"`),`Ruta no registrada: ${action.route}`);}}
  assert.ok(count>=32);assert.deepStrictEqual(actions.get("sales:credit-create").groups,["sales","admin"]);assert.deepStrictEqual(actions.get("credit:credit-review").groups,["credit","admin"]);assert.strictEqual(actions.get("analytics:vsm").openMode,"page");
  assert.ok(read("engine/shared/js/runtime/app-runtime.js").includes('value="PVP"'));
  for(const profile of ["index.html","ios/index.html","compact/index.html","square/index.html"])exists(`apps/trazabilidad/corte/${profile}`);
});

test("crédito usa Supabase y documentos Drive",()=>{
  const credit=read("engine/modules/creditos/assets/js/credit-runtime.js"),docs=json("engine/modules/creditos/assets/json/credit-documents.json"),drive=read("engine/shared/js/drive-client.js");
  assert.strictEqual(docs.documents.length,15);assert.ok(credit.includes('collection("credit_requests")'));assert.ok(credit.includes('DRIVE.upload'));assert.ok(credit.includes('credit_transition'));
  assert.ok(drive.includes("https://www.googleapis.com/drive/v3/files"));assert.ok(drive.includes("drive.file"));assert.ok(!/client_secret|private_key/.test(drive));
});

test("SQL contiene escritura transaccional, RLS, VSM y guardián",()=>{
  const sql=read("supabase/sql/00_ACTIVAR_TODO_EI_ERP_V7.sql");
  ["erp_apply_operations","erp_validate_case_change","erp_scan_flow_health","credit_transition","v_vsm_timeline_complete","v_vsm_flow_health","enable row level security","supabase_realtime"].forEach(token=>assert.ok(sql.includes(token),`Falta ${token}`));
  assert.ok(sql.includes("El pedido PVE debe ser liberado por Compras"));assert.ok(sql.includes("cortes pendientes"));assert.ok(sql.includes("business_seconds_between"));
});

test("VSM consulta todo mediante paginación y Realtime",()=>{
  const vsm=read("engine/modules/vsm/dashboard.js");
  ["fetchAll","v_vsm_case_summary","v_vsm_timeline_complete","v_vsm_process_summary","v_vsm_flow_health","erp_scan_flow_health","postgres_changes"].forEach(token=>assert.ok(vsm.includes(token),`VSM incompleto: ${token}`));
  assert.ok(read("engine/modules/vsm/dashboard.html").includes("07:00–12:00"));
});

test("compatibilidad del motor escribe por RPC atómica",()=>{
  const compat=read("engine/shared/js/supabase-compat.js"),adapter=read("engine/shared/js/supabase-legacy-adapter.js");
  assert.ok(compat.includes('rpc("erp_apply_operations"'));assert.ok(compat.includes("fetchPages"));assert.ok(adapter.includes("__eiSupabaseAdapter"));
  assert.ok(!adapter.includes("trazabilidadlog.firebaseapp.com"));
});

test("inicio accesible y responsive",()=>{
  const html=read("index.html"),shell=read("core/css/shell.css");
  ["skip-link","aria-live","autocomplete=\"username\"","autocomplete=\"current-password\"","mobile-web-app-capable"].forEach(x=>assert.ok(html.includes(x),`Falta ${x}`));
  assert.ok(shell.includes('data-layout="ios"'));assert.ok(shell.includes('data-layout="compact"'));assert.ok(shell.includes('data-layout="square"'));assert.ok(shell.includes("env(safe-area-inset-bottom)"));
});

test("Siesa no está publicado como módulo ni conector",()=>{
  assert.ok(!fs.existsSync(path.join(root,"engine/modules/integraciones")));assert.ok(!fs.existsSync(path.join(root,"engine/integration")));
  assert.ok(!/siesa/i.test(read("apps/trazabilidad/config/transactions.json")));assert.ok(!/siesa/i.test(read("core/config/applications.json")));
});

console.log("\nPruebas funcionales estáticas V7 aprobadas.");
