"use strict";
const fs=require("fs"),path=require("path"),assert=require("assert");
const root=path.resolve(__dirname,"..");
function read(rel){return fs.readFileSync(path.join(root,rel),"utf8");}
function json(rel){return JSON.parse(read(rel));}
function exists(rel){assert.ok(fs.existsSync(path.join(root,rel)),`Falta ${rel}`);}
function walk(dir,exts){let out=[];for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,entry.name);if(entry.isDirectory())out=out.concat(walk(p,exts));else if(!exts||exts.includes(path.extname(entry.name)))out.push(p);}return out;}
function test(name,fn){try{fn();console.log("✓",name);}catch(e){console.error("✗",name);throw e;}}

test("arquitectura de tres niveles",()=>{
  ["index.html","portal/index.html","apps/trazabilidad/index.html","engine/modules/ventas/index.html"].forEach(exists);
  ["ios/index.html","compact/index.html","square/index.html","portal/ios/index.html","portal/compact/index.html","portal/square/index.html","apps/trazabilidad/ios/index.html","apps/trazabilidad/compact/index.html","apps/trazabilidad/square/index.html"].forEach(exists);
  const apps=json("core/config/applications.json").applications;
  assert.strictEqual(apps.length,1,"Solo deben publicarse aplicativos realmente integrados");
  assert.strictEqual(apps[0].id,"trazabilidad");
  assert.ok(apps[0].enabled);
});

test("catálogo transaccional conectado",()=>{
  const catalog=json("apps/trazabilidad/config/transactions.json");
  const ids=new Set(),actions=new Set();let count=0;
  for(const mod of catalog.modules){assert.ok(mod.id&&mod.name&&mod.group);assert.ok(!ids.has(mod.id),`Módulo duplicado ${mod.id}`);ids.add(mod.id);assert.ok(Array.isArray(mod.actions)&&mod.actions.length,`Sin acciones ${mod.id}`);
    for(const action of mod.actions){count++;const key=mod.id+":"+action.id;assert.ok(!actions.has(key),`Acción duplicada ${key}`);actions.add(key);assert.ok(action.module&&action.route&&action.engine,`Acción incompleta ${key}`);assert.ok(Array.isArray(action.requirements)&&action.requirements.length,`Sin requisitos mínimos ${key}`);exists(`engine/modules/${action.module}/index.html`);
      const moduleJs=read(`engine/modules/${action.module}/assets/js/module.js`);assert.ok(moduleJs.includes(`"${action.route}"`),`Ruta ${action.route} no registrada en ${action.module}`);
    }
  }
  assert.ok(count>=25,`Catálogo insuficiente: ${count}`);
  assert.ok(actions.has("sales:order-create"));assert.ok(actions.has("sales:credit-create"));assert.ok(actions.has("analytics:vsm"));
});

test("PVP y crédito permanecen en el flujo",()=>{
  const runtime=read("engine/shared/js/runtime/app-runtime.js"),credit=read("engine/modules/creditos/assets/js/credit-runtime.js"),docs=json("engine/modules/creditos/assets/json/credit-documents.json");
  assert.ok(runtime.includes('value="PVP"'),"PVP no está disponible al crear pedido");
  assert.ok(runtime.includes("PVP-0000"),"Falta ayuda de referencia PVP");
  assert.ok(credit.includes('collection("credit_requests")'));
  assert.strictEqual(docs.documents.length,15,"El expediente S-FT-22 debe conservar 15 documentos");
  assert.ok(credit.includes('CREATE_ROLES=ADMIN_ROLES.concat(["ventas"'),"Creación debe pertenecer a Ventas");
  assert.ok(!credit.includes('CREATE_ROLES=REVIEW_ROLES'),"Cartera no debe heredar creación");
  const catalog=json("apps/trazabilidad/config/transactions.json"),sales=catalog.modules.find(m=>m.id==="sales"),portfolio=catalog.modules.find(m=>m.id==="credit");
  assert.deepStrictEqual(sales.actions.find(a=>a.id==="credit-create").groups,["sales","admin"]);
  assert.deepStrictEqual(portfolio.actions.find(a=>a.id==="credit-review").groups,["credit","admin"]);
  assert.ok(portfolio.actions.find(a=>a.id==="credit-workspace").groups.includes("audit"),"Auditoría debe consultar sin decidir");
});

test("flujos conectados y chequeos mínimos",()=>{
  const runtime=read("engine/shared/js/runtime/app-runtime.js"),start=runtime.indexOf("var processes = {"),end=runtime.indexOf("\n};",start);
  assert.ok(start>=0&&end>start,"No se encontró el mapa de procesos");
  const source=runtime.slice(start,end+3).replace(/^var processes = /,"").replace(/;\s*$/,"");
  const processes=require("vm").runInNewContext("("+source+")",Object.create(null),{timeout:1000}),terminals=new Set(["cierre_caso"]);
  assert.ok(Object.keys(processes).length>=12,"Mapa de procesos incompleto");
  for(const [key,proc] of Object.entries(processes)){
    if(!proc.hidden)assert.ok(Array.isArray(proc.checklist)&&proc.checklist.length>=3,`Lista mínima insuficiente en ${key}`);
    for(const next of proc.next||[])assert.ok(terminals.has(next)||processes[next],`Transición rota ${key} -> ${next}`);
  }
  assert.deepStrictEqual(Array.from(processes.corte_cable.next),[],"Corte debe conservarse como subflujo y volver por su cierre específico");
});

test("autenticación accesible y sin roles inferidos",()=>{
  const html=read("index.html"),auth=read("core/js/auth-page.js"),fb=read("core/js/firebase.js");
  ["skip-link","aria-live","autocomplete=\"username\"","autocomplete=\"current-password\"","data-a11y-toggle"].forEach(x=>assert.ok(html.includes(x),`Falta ${x}`));
  assert.ok(auth.includes("signInWithEmailAndPassword"));assert.ok(auth.includes("signInWithPopup"));
  assert.ok(fb.includes('if(!role)throw new Error'),"El perfil debe exigir rol");
  assert.ok(!fb.includes("fallbackRoleFromEmail"));assert.ok(!auth.includes("fallbackRoleFromEmail"));
});

test("responsive dedicado",()=>{
  const shell=read("core/css/shell.css"),auth=read("core/css/auth.css");
  assert.ok(shell.includes('data-layout="ios"'));assert.ok(shell.includes('data-layout="compact"'));assert.ok(shell.includes('data-layout="square"'));
  assert.ok(shell.includes("env(safe-area-inset-bottom)"));assert.ok(shell.includes("100dvh"));assert.ok(auth.includes("@media(max-width:540px)"));
  for(const profile of ["ios","compact","square"]){assert.ok(read(`${profile}/index.html`).includes(`data-layout-profile="${profile}"`));assert.ok(read(`apps/trazabilidad/${profile}/index.html`).includes(`data-layout="${profile}"`));}
  const portal=read("core/js/portal.js");assert.ok(portal.includes('base=document.documentElement.dataset.base'),"Las variantes del portal deben resolver rutas desde data-base");assert.ok(!/U\.json\("\.\.\//.test(portal),"El portal conserva rutas rígidas");
});

test("motor embebido sin navegación duplicada",()=>{
  const css=read("engine/shared/css/nova-embedded.css"),bootstrap=read("engine/shared/js/bootstrap.js");
  assert.ok(css.includes(".erp-sidebar"));assert.ok(css.includes(".bottom-nav"));assert.ok(css.includes("display:none!important"));
  assert.ok(bootstrap.includes("requestedRoute"));assert.ok(bootstrap.includes("EI_REQUESTED_ROUTE"));
  const embedded=read("engine/shared/js/nova-embedded.js");assert.ok(embedded.includes("window.top!==window.self"),"embedded=1 no debe funcionar en primer nivel");assert.ok(embedded.includes('location.replace(root+"apps/trazabilidad/'),"Apertura directa debe volver al shell");
  for(const dir of fs.readdirSync(path.join(root,"engine/modules"))){const p=`engine/modules/${dir}/index.html`;if(fs.existsSync(path.join(root,p)))assert.ok(read(p).includes("nova-embedded"),`No usa tema embebido: ${p}`);}
});

test("diseño NOVA unificado y búsqueda por rol",()=>{
  const html=walk(root,[".html"]).filter(p=>!p.includes(path.sep+"engine"+path.sep));
  for(const file of html)assert.ok(!/style="/.test(fs.readFileSync(file,"utf8")),`Estilo inline fuera del sistema visual: ${path.relative(root,file)}`);
  const shell=read("apps/trazabilidad/js/app.js");
  ["function caseVisible","function visibleCases","Mis pendientes",'credit.where("createdBy","==",uid)',"openCommand","caseSearchText"].forEach(token=>assert.ok(shell.includes(token),`Shell incompleto: ${token}`));
  assert.ok(!shell.includes("state.cases.filter(function(c){return caseSearchText"),"Búsqueda sin filtro por rol");
  assert.ok(read("core/css/shell.css").includes("env(safe-area-inset-bottom)"));
});

test("Siesa externo retirado",()=>{
  assert.ok(!fs.existsSync(path.join(root,"engine/modules/integraciones")));
  assert.ok(!fs.existsSync(path.join(root,"engine/integration")));
  const apps=read("core/config/applications.json"),tx=read("apps/trazabilidad/config/transactions.json"),fn=read("functions/index.js");
  assert.ok(!/siesa/i.test(apps));assert.ok(!/siesa/i.test(tx));
  ["receiveSiesaInbound","enqueueSiesaSync","processSiesaOutbox"].forEach(x=>assert.ok(!fn.includes(x),`Conector externo presente: ${x}`));
});

test("seguridad y despliegue",()=>{
  const firebase=json("firebase.json"),rules=read("firestore.rules"),storage=read("storage.rules"),runtime=read("engine/shared/js/runtime/app-runtime.js"),vsm=read("engine/modules/vsm/dashboard.js"),fn=read("functions/index.js"),core=read("core/js/firebase.js");
  assert.strictEqual(firebase.hosting.public,".");assert.ok(firebase.hosting.headers.some(x=>JSON.stringify(x).includes("Content-Security-Policy")));
  assert.ok(rules.includes("match /credit_requests/"));assert.ok(storage.includes("credit_requests"));assert.ok(storage.includes("15 * 1024 * 1024"));
  assert.ok(rules.includes("function uidUserPath()")&&rules.includes("function emailUserPath()"));assert.ok(!core.includes('.where("email","=="'));
  assert.ok(fn.includes("async function authContext"));
  const production=[runtime,vsm,rules,storage,fn,core].join("\n");
  [/f\.duque/i,/fabian\s+duque/i,/knownSuperAdmin/i,/fallbackRoleFromEmail/i].forEach(re=>assert.ok(!re.test(production),`Identidad codificada: ${re}`));
  [/juanespereztobon/i,/juan\s+esteban\s+p[eé]rez/i].forEach(re=>assert.ok(!re.test(vsm),`Exclusión personal codificada en VSM: ${re}`));
  let balance=0;for(const ch of rules.replace(/\/\/.*$/gm,"")){if(ch==="{")balance++;if(ch==="}")balance--;}assert.strictEqual(balance,0,"Llaves desbalanceadas en firestore.rules");
});

test("referencias locales",()=>{
  const files=walk(root,[".html"]);let checked=0;
  for(const file of files){const text=fs.readFileSync(file,"utf8");const re=/(?:src|href)="([^"]+)"/g;let m;while((m=re.exec(text))){let ref=m[1];if(!ref||ref.startsWith("http")||ref.startsWith("#")||ref.startsWith("data:")||ref.startsWith("mailto:")||ref.startsWith("about:")||ref.includes("__"))continue;ref=ref.split("?")[0].split("#")[0];if(!ref)continue;const target=path.resolve(path.dirname(file),ref);if(ref.endsWith("/")){assert.ok(fs.existsSync(path.join(target,"index.html")),`Enlace roto ${path.relative(root,file)} -> ${ref}`);}else{assert.ok(fs.existsSync(target),`Referencia rota ${path.relative(root,file)} -> ${ref}`);}checked++;}}
  assert.ok(checked>100,`Pocas referencias verificadas: ${checked}`);console.log(`  ${checked} referencias verificadas`);
});

test("JSON y JavaScript",()=>{
  walk(root,[".json"]).forEach(p=>JSON.parse(fs.readFileSync(p,"utf8")));
  const {spawnSync}=require("child_process");const scripts=walk(root,[".js"]).filter(p=>!p.includes(path.sep+"node_modules"+path.sep));
  for(const script of scripts){const r=spawnSync(process.execPath,["--check",script],{encoding:"utf8"});assert.strictEqual(r.status,0,`${path.relative(root,script)}: ${r.stderr}`);}
});
console.log("QA GENERAL EI ERP NOVA V6 OK");
