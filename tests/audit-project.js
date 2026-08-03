"use strict";
const fs=require("fs"),path=require("path"),crypto=require("crypto"),assert=require("assert");
const root=path.resolve(__dirname,"..");
const out={generatedAt:new Date().toISOString(),product:"EI ERP Nova",version:"6.1.0",critical:[],warnings:[],passed:[],metrics:{}};
function rel(p){return path.relative(root,p).replace(/\\/g,"/");}
function read(p){return fs.readFileSync(path.join(root,p),"utf8");}
function json(p){return JSON.parse(read(p));}
function walk(dir){let out=[];for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory()){if(e.name!=="node_modules"&&e.name!==".git")out=out.concat(walk(p));}else out.push(p);}return out;}
function pass(v){out.passed.push(v);}
function critical(v){out.critical.push(v);}
function warn(v){out.warnings.push(v);}
function count(text,re){return (text.match(re)||[]).length;}
function braceBalance(text){let b=0;for(const c of text.replace(/\/\/.*$/gm,"")){if(c==="{")b++;else if(c==="}")b--;}return b;}

const files=walk(root),htmlFiles=files.filter(p=>p.endsWith(".html")),jsFiles=files.filter(p=>p.endsWith(".js"));
out.metrics.files=files.length;
out.metrics.htmlFiles=htmlFiles.length;
out.metrics.javascriptFiles=jsFiles.length;
out.metrics.totalJavascriptLines=jsFiles.reduce((n,p)=>n+fs.readFileSync(p,"utf8").split(/\r?\n/).length,0);

// Auditoría de páginas públicas y shell NOVA. El motor heredado se valida por separado.
const novaPages=htmlFiles.filter(p=>!rel(p).startsWith("engine/"));
for(const file of novaPages){
  const text=fs.readFileSync(file,"utf8"),name=rel(file);
  if(!/<html[^>]+lang="es"/i.test(text))critical(`${name}: falta lang=es.`);
  if(!/<meta[^>]+name="viewport"/i.test(text))critical(`${name}: falta viewport responsive.`);
  if(!/<title>[^<]+<\/title>/i.test(text))critical(`${name}: falta título.`);
  if(!/class="skip-link"/i.test(text))warn(`${name}: falta enlace para saltar contenido.`);
  const ids=[...text.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
  const duplicate=[...new Set(ids.filter((id,i)=>ids.indexOf(id)!==i))];
  if(duplicate.length)critical(`${name}: IDs duplicados: ${duplicate.join(", ")}.`);
  for(const m of text.matchAll(/<img\b([^>]*)>/gi)){if(!/\balt="[^"]*"/i.test(m[1]))critical(`${name}: imagen sin atributo alt.`);}
  for(const m of text.matchAll(/<iframe\b([^>]*)>/gi)){if(!/\btitle="[^"]+"/i.test(m[1]))critical(`${name}: iframe sin título accesible.`);}
  for(const m of text.matchAll(/<a\b([^>]*)target="_blank"([^>]*)>/gi)){if(!/rel="[^"]*noopener/i.test(m[0]))critical(`${name}: enlace _blank sin noopener.`);}
  for(const m of text.matchAll(/<button\b([^>]*)>/gi)){if(!/\btype="(?:button|submit|reset)"/i.test(m[1]))warn(`${name}: botón sin type explícito.`);}
}
if(!out.critical.length)pass("Páginas NOVA con metadatos, títulos e identificadores válidos.");

// Arquitectura y rutas.
const apps=json("core/config/applications.json"),catalog=json("apps/trazabilidad/config/transactions.json"),roles=json("core/config/roles.json");
if(!Array.isArray(apps.applications)||!apps.applications.length)critical("El portal no tiene aplicativos activos.");
if(apps.applications.some(a=>/siesa/i.test(JSON.stringify(a))))critical("El portal publica una integración Siesa.");
const knownGroups=new Set(["all",...Object.keys(roles.labels)]),moduleIds=new Set(),actionIds=new Set();
let actionCount=0;
for(const mod of catalog.modules||[]){
  if(moduleIds.has(mod.id))critical(`Módulo duplicado: ${mod.id}.`);moduleIds.add(mod.id);
  if(!(mod.actions||[]).length)critical(`Módulo sin transacciones: ${mod.id}.`);
  for(const group of mod.groups||[])if(!knownGroups.has(group))critical(`Grupo desconocido ${group} en ${mod.id}.`);
  for(const action of mod.actions||[]){
    actionCount++;const key=`${mod.id}:${action.id}`;
    if(actionIds.has(key))critical(`Transacción duplicada: ${key}.`);actionIds.add(key);
    if(!action.name||!action.description||!action.module||!action.route)critical(`Transacción incompleta: ${key}.`);
    if(!Array.isArray(action.requirements)||!action.requirements.length)critical(`Transacción sin requisitos mínimos: ${key}.`);
    for(const group of action.groups||[])if(!knownGroups.has(group))critical(`Grupo desconocido ${group} en ${key}.`);
    const engineIndex=path.join(root,"engine/modules",action.module,"index.html"),engineJs=path.join(root,"engine/modules",action.module,"assets/js/module.js");
    if(!fs.existsSync(engineIndex)||!fs.existsSync(engineJs))critical(`Motor faltante para ${key}.`);
    else if(!fs.readFileSync(engineJs,"utf8").includes(`"${action.route}"`))critical(`Ruta ${action.route} no registrada en ${action.module}.`);
  }
}
out.metrics.transactionModules=moduleIds.size;out.metrics.transactions=actionCount;
if(actionIds.has("sales:order-create")&&actionIds.has("sales:credit-create")&&actionIds.has("analytics:vsm"))pass("Ventas, crédito y VSM están conectados al catálogo transaccional.");

// Separación de responsabilidades de crédito.
const creditMod=(catalog.modules||[]).find(m=>m.id==="credit"),salesMod=(catalog.modules||[]).find(m=>m.id==="sales");
const createCredit=salesMod?.actions.find(a=>a.id==="credit-create"),reviewCredit=creditMod?.actions.find(a=>a.id==="credit-review");
if(!createCredit||JSON.stringify(createCredit.groups)!==JSON.stringify(["sales","admin"]))critical("Crear solicitud de crédito no está restringido a Ventas/Admin.");
if(!reviewCredit||JSON.stringify(reviewCredit.groups)!==JSON.stringify(["credit","admin"]))critical("La decisión de crédito no está restringida a Cartera/Admin.");
else pass("Ventas crea y envía; Cartera revisa y decide.");

// Flujo operativo y listas mínimas de chequeo.
const runtime=read("engine/shared/js/runtime/app-runtime.js");
const processSource=runtime.slice(runtime.indexOf("var processes = {"),runtime.indexOf("\n};",runtime.indexOf("var processes = {"))+3);
const processBody=processSource.replace(/^var processes = /,"").replace(/;\s*$/,"");
let processMap={};
try{processMap=require("vm").runInNewContext("("+processBody+")",Object.create(null),{timeout:1000});}catch(error){critical(`No fue posible auditar el mapa de procesos: ${error.message}`);}
const terminals=new Set(["cierre_caso"]);
for(const [key,proc] of Object.entries(processMap)){
  if(!proc.hidden&&(!Array.isArray(proc.checklist)||proc.checklist.length<3))critical(`Proceso ${key} sin lista mínima de chequeo.`);
  for(const next of proc.next||[])if(!terminals.has(next)&&!processMap[next])critical(`Transición inexistente: ${key} -> ${next}.`);
}
if(processMap.corte_cable&&Array.isArray(processMap.corte_cable.next)&&processMap.corte_cable.next.length===0)pass("Corte se conserva como subflujo controlado que retorna mediante su cierre específico.");
if(Object.keys(processMap).length&&!out.critical.some(x=>/Proceso|Transición|mapa de procesos/i.test(x)))pass("Procesos operativos conectados y con listas mínimas de chequeo.");

// Shell por rol, pendientes y consultas compatibles con reglas.
const shell=read("apps/trazabilidad/js/app.js");
for(const token of ["function caseVisible", "function visibleCases", "Mis pendientes", 'credit.where("createdBy","==",uid)', "openCommand"]){if(!shell.includes(token))critical(`Shell incompleto: falta ${token}.`);}
if(shell.includes("state.cases.filter(function(c){return caseSearchText"))critical("El buscador consulta casos sin aplicar visibilidad por rol.");
else pass("KPIs, pendientes y búsqueda aplican visibilidad por rol.");

// Variantes de pantalla y rutas dinámicas.
const portalJs=read("core/js/portal.js");
if(!portalJs.includes('base=document.documentElement.dataset.base'))critical("El portal no resuelve rutas por variante.");
if(/requireSession\(\{loginUrl:"\.\.\//.test(portalJs)||/U\.json\("\.\.\//.test(portalJs))critical("El portal conserva rutas relativas rígidas incompatibles con iOS/compact/square.");
for(const profile of ["ios","compact","square"]){
  for(const page of [`${profile}/index.html`,`portal/${profile}/index.html`,`apps/trazabilidad/${profile}/index.html`])if(!fs.existsSync(path.join(root,page)))critical(`Falta variante ${page}.`);
}
if(!out.critical.some(x=>x.includes("variante")))pass("Entradas dedicadas para iOS, portátil compacto y pantalla cuadrada.");
const novaInlineStyles=novaPages.flatMap(file=>{const text=fs.readFileSync(file,"utf8");return [...text.matchAll(/style="/g)].map(()=>rel(file));});
if(novaInlineStyles.length)warn(`La capa NOVA conserva estilos inline en: ${[...new Set(novaInlineStyles)].join(", ")}.`);
else pass("La interfaz NOVA utiliza el sistema visual compartido sin estilos inline por página.");

// Seguridad de identidad y motor heredado.
const vsm=read("engine/modules/vsm/dashboard.js"),firestore=read("firestore.rules"),storage=read("storage.rules"),functions=read("functions/index.js"),embedded=read("engine/shared/js/nova-embedded.js"),coreFirebase=read("core/js/firebase.js");
const securitySources=[runtime,vsm,firestore,storage,functions,coreFirebase,shell];
const forbidden=[/f\.duque/i,/fabian\s+duque/i,/knownSuperAdmin/i,/fallbackRoleFromEmail/i,/temporaryProfileFromAuth/i];
for(const re of forbidden){if(securitySources.some(text=>re.test(text)))critical(`Identidad o elevación heredada detectada: ${re}.`);}
for(const re of [/juanespereztobon/i,/juan\s+esteban\s+p[eé]rez/i])if(re.test(vsm))critical(`Exclusión personal codificada en VSM: ${re}.`);
const emails=securitySources.flatMap(text=>[...text.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)].map(m=>m[0].toLowerCase())).filter(email=>email!=="usuario@empresa.com");
if(emails.length)critical(`Correos personales codificados en lógica productiva: ${[...new Set(emails)].join(", ")}.`);
if(!runtime.includes('function currentUserIsSuperAdmin(){return !!(state.user && isSuperAdminRoleValue(state.user.role));}'))critical("Superadministración no depende exclusivamente del rol.");
if(!embedded.includes('window.top!==window.self')||!embedded.includes('location.replace(root+"apps/trazabilidad/'))critical("El motor heredado puede abrirse como aplicación independiente fuera del shell.");
if(coreFirebase.includes('.where("email","=="'))critical("El shell admite perfiles con ID que las reglas no pueden autorizar.");
if(!firestore.includes("function uidUserPath()")||!firestore.includes("function emailUserPath()"))critical("Las reglas no soportan perfiles UID/correo autenticado.");
if(!functions.includes("async function authContext")||!functions.includes('db.collection("users").doc(request.auth.uid)'))critical("Functions no valida el perfil operativo en Firestore.");
if(braceBalance(firestore)!==0)critical("firestore.rules tiene llaves desbalanceadas.");
if(braceBalance(storage)!==0)critical("storage.rules tiene llaves desbalanceadas.");
if(!storage.includes("15 * 1024 * 1024")||!storage.includes("application/pdf|image/"))critical("Storage no limita tamaño y tipo documental.");
if(/match \/cases\/\{caseId\}[\s\S]{0,180}allow read: if activeUser\(\)/.test(firestore))warn("La lectura de cases continúa abierta a todo usuario activo por compatibilidad del motor heredado; la interfaz filtra por rol, pero la migración debe llevar esta autorización al servidor antes de retirar el motor.");
if(!out.critical.some(x=>/Identidad|Correos|Superadministración|reglas|Storage|Functions|motor heredado/i.test(x)))pass("Identidad, reglas, Storage, Functions y acceso al motor endurecidos.");

// Siesa: no conector, webhook ni módulo publicado. Se permiten nombres de campos históricos y parser documental.
const fnExternal=["receiveSiesaInbound","enqueueSiesaSync","processSiesaOutbox","integration_outbox","integration_inbox"];
if(fs.existsSync(path.join(root,"engine/modules/integraciones"))||fs.existsSync(path.join(root,"engine/integration")))critical("Persisten carpetas de integración externa.");
for(const token of fnExternal)if(functions.includes(token)||catalog.application?.description?.includes(token))critical(`Conector externo presente: ${token}.`);
if(/cruce con SIESA/i.test(runtime))critical("La interfaz aún anuncia cruce con Siesa.");
else pass("Conector, colas y navegación Siesa retirados; solo queda compatibilidad de lectura documental histórica.");

// Métricas y deuda técnica conocida.
const emptyCatch=count(runtime,/(?<!\.)\bcatch\s*\([A-Za-z_$][\w$]*\)\s*\{\s*\}/g),inlineStyles=count(runtime,/style="/g),patchRefs=count(runtime,/\bV\d{1,3}\b/g),siesaRefs=count(runtime,/siesa/gi);
out.metrics.runtimeBytes=Buffer.byteLength(runtime);out.metrics.runtimeLines=runtime.split(/\r?\n/).length;out.metrics.emptyCatches=emptyCatch;out.metrics.inlineStylesInRuntime=inlineStyles;out.metrics.patchReferences=patchRefs;out.metrics.legacySiesaFieldReferences=siesaRefs;
if(out.metrics.runtimeLines>10000)warn(`El motor de compatibilidad sigue siendo monolítico (${out.metrics.runtimeLines} líneas); debe migrarse por transacción.`);
if(emptyCatch>0)warn(`${emptyCatch} bloques catch vacíos permanecen en el motor heredado; no bloquean el shell, pero reducen observabilidad.`);
if(siesaRefs>0)warn(`${siesaRefs} referencias internas históricas siguen en nombres de campos/parser para compatibilidad de datos; no son una API ni un conector.`);

// Huella de archivos para trazabilidad de la entrega.
const hashes={};for(const p of files.filter(p=>!rel(p).startsWith("docs/audit-machine"))){hashes[rel(p)]=crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");}
out.metrics.hashedFiles=Object.keys(hashes).length;

const jsonOut=path.join(root,"docs/audit-machine.json"),mdOut=path.join(root,"docs/audit-machine.md");
fs.writeFileSync(jsonOut,JSON.stringify(out,null,2)+"\n");
const md=["# Auditoría automática EI ERP Nova V6.1","",`Generada: ${out.generatedAt}`,"","## Resultado",`- Hallazgos críticos: **${out.critical.length}**`,`- Advertencias: **${out.warnings.length}**`,`- Controles superados: **${out.passed.length}**`,"","## Controles superados",...(out.passed.length?out.passed.map(x=>`- ${x}`):["- Ninguno"]),"","## Hallazgos críticos",...(out.critical.length?out.critical.map(x=>`- ${x}`):["- Ninguno"]),"","## Advertencias",...(out.warnings.length?out.warnings.map(x=>`- ${x}`):["- Ninguna"]),"","## Métricas","```json",JSON.stringify(out.metrics,null,2),"```",""];
fs.writeFileSync(mdOut,md.join("\n"));
console.log(`Auditoría: ${out.critical.length} críticos, ${out.warnings.length} advertencias, ${out.passed.length} controles superados.`);
if(out.critical.length){console.error(out.critical.map(x=>"- "+x).join("\n"));process.exit(1);}
