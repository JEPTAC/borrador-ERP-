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
  const apps=json("core/config/applications.json");assert.strictEqual(apps.version,"8.0.0");assert.strictEqual(apps.applications.length,1);assert.strictEqual(apps.applications[0].id,"trazabilidad");
});

test("Supabase es el backend activo",()=>{
  const config=read("core/js/config.js"),supabase=read("core/js/supabase.js"),bootstrap=read("engine/shared/js/bootstrap.js");
  assert.ok(config.includes("hezjxcxxcjlpmyalftam.supabase.co"));assert.ok(config.includes("sb_publishable_"));
  assert.ok(!/sb_secret_|service_role|BEGIN PRIVATE KEY/.test([config,supabase,bootstrap].join("\n")));
  assert.ok(supabase.includes("createClient"));assert.ok(supabase.includes("signInWithPassword"));assert.ok(supabase.includes("onAuthStateChange"));
  assert.ok(bootstrap.includes("supabase-legacy-adapter.js"));assert.ok(!bootstrap.includes("firebase-config.js"));
});

test("catálogo V8 mínimo por roles exactos",()=>{
  const catalog=json("apps/trazabilidad/config/transactions.json");assert.strictEqual(catalog.version,"8.0.0");
  const model=json("apps/trazabilidad/config/operating-model.json"),roles=json("core/config/roles.json");
  assert.strictEqual(Object.keys(model.roles).length,13);
  const exactGroups=new Set(Object.values(model.roles).map(x=>x.group));
  assert.strictEqual(exactGroups.size,13);assert.ok(Object.keys(roles.aliases).length>=13);
  const actions=new Map();let count=0;
  for(const mod of catalog.modules){assert.ok(mod.actions&&mod.actions.length);for(const action of mod.actions){count++;actions.set(`${mod.id}:${action.id}`,action);exists(`engine/modules/${action.module}/index.html`);}}
  assert.ok(count>=20&&count<=30,`Catálogo no simplificado: ${count}`);
  assert.ok(actions.get("sales:credit-create").groups.includes("sales")&&actions.get("sales:credit-create").groups.includes("admin"));
  ["picking","admin","management","audit","logistics_manager"].forEach(g=>assert.ok(actions.get("picking:picking-workspace").groups.includes(g),`Alistamiento no visible para ${g}`));
  ["national_dispatch","admin","management","audit","logistics_manager"].forEach(g=>assert.ok(actions.get("national:national-dispatch").groups.includes(g),`Despacho nacional no visible para ${g}`));
  assert.ok(!/novedades/i.test(JSON.stringify(catalog)),"Las novedades no deben ser un módulo independiente");
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

test("contrato de excepciones V8 completo y auditable",()=>{
  const ex=json("engine/shared/json/exception-contract.json"),model=json("apps/trazabilidad/config/operating-model.json");
  assert.strictEqual(ex.version,"8.0.0");assert.strictEqual(ex.exceptions.length,20);
  const codes=new Set(ex.exceptions.map(x=>x.code));
  ["missing_required_data","duplicate_reference","priority","client_arrears","payment_pending","credit_application","stock_exception","cut_required","route_change","payment_exception","pvn_invoice_upload","no_delivery","cancellation","reopen","drive_offline","concurrent_transition","inactive_or_unauthorized_user"].forEach(code=>assert.ok(codes.has(code),`Falta excepción ${code}`));
  ["route_change","stock_exception","reopen","payment_exception"].forEach(type=>assert.ok(model.approvalTypes[type].includes("gerencia"),`Gerencia no está configurada como aprobador de ${type}`));
  assert.ok(read("docs/MATRIZ_PERMISOS_V8.md").includes("aux_logistica"));
  assert.ok(read("docs/MATRIZ_EXCEPCIONES_V8.md").includes("No entrega"));
});

test("diagnóstico integral restringido y modelo V8 endurecido",()=>{
  const runtime=read("engine/shared/js/runtime/app-runtime.js"),sql=read("supabase/sql/05_REESTRUCTURAR_ROLES_Y_FLUJO_V8.sql"),edge=read("supabase/functions/trigger-erp-diagnostic/index.ts"),supabase=read("core/js/supabase.js");
  ["renderErpDiagnostics","runErpDiagnostic","triggerErpBot","testDiagnosticDrive","diagnostico_erp"].forEach(token=>assert.ok(runtime.includes(token),`Falta ${token}`));
  assert.ok(runtime.includes("d.diaz@ei.com.co"));assert.ok(runtime.includes("j.laverde@ei.com.co"));assert.ok(runtime.includes("192 combinaciones"));
  ["erp_current_exact_role","case_comments","workflow_requests","erp_request_approval","erp_decide_approval","despacho_nacional","recepcion_mercancia"].forEach(token=>assert.ok(sql.includes(token),`SQL V8 incompleto: ${token}`));
  assert.ok(edge.includes('!== "super_admin"'));assert.ok(edge.includes("workflow_dispatch")||edge.includes("dispatches"));
  assert.ok(supabase.includes("inheritedClient"));assert.ok(supabase.includes("initPromise"));
});

console.log("\nPruebas funcionales estáticas V8 aprobadas.");
