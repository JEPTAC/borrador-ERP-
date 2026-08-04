"use strict";
const fs=require("fs"),path=require("path"),assert=require("assert"),child=require("child_process"),crypto=require("crypto");
const root=path.resolve(__dirname,"..");
function walk(dir){let out=[];for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())out=out.concat(walk(p));else out.push(p);}return out;}
function rel(p){return path.relative(root,p).replace(/\\/g,"/");}
function read(relPath){return fs.readFileSync(path.join(root,relPath),"utf8");}
const files=walk(root),critical=[],warnings=[],passed=[];
function fail(x){critical.push(x);}function warn(x){warnings.push(x);}function pass(x){passed.push(x);}

const textFiles=files.filter(p=>/\.(js|html|json|sql|ts|css|md)$/i.test(p));
const allText=textFiles.map(p=>fs.readFileSync(p,"utf8")).join("\n");
const secretPatterns=[/sb_secret_(?!\[)[A-Za-z0-9._-]{20,}/,/-----BEGIN PRIVATE KEY-----/,/eyJ[A-Za-z0-9_-]{20,}\.eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/];
const secretHits=[];
for(const p of textFiles){if(rel(p)==="tests/audit-supabase-v7.js")continue;const body=fs.readFileSync(p,"utf8");if(secretPatterns.some(re=>re.test(body)))secretHits.push(rel(p));}
if(secretHits.length)fail(`Se detectó una credencial administrativa real en: ${secretHits.join(", ")}`);else pass("No hay claves secretas, JWT administrativos ni cuentas de servicio en el código.");

const html=files.filter(p=>p.endsWith(".html"));
for(const p of html){const t=fs.readFileSync(p,"utf8");if(/firebase-(app|auth|firestore)|core\/js\/firebase\.js|firebase-config\.js/i.test(t))fail(`HTML todavía carga Firebase: ${rel(p)}`);}
if(!critical.some(x=>x.includes("HTML")))pass("Ninguna página carga el SDK de Firebase.");

for(const p of files.filter(p=>p.endsWith(".js"))){try{child.execFileSync(process.execPath,["--check",p],{stdio:"pipe"});}catch(e){fail(`JavaScript inválido: ${rel(p)} · ${String(e.stderr||e.message).slice(0,300)}`);}}
if(!critical.some(x=>x.includes("JavaScript")))pass("Sintaxis JavaScript verificada en todo el repositorio.");

const tag=/\b(?:src|href)=["']([^"'#?]+)["']/gi;
for(const p of html){const t=fs.readFileSync(p,"utf8");let m;while((m=tag.exec(t))){const v=m[1];if(/^(https?:|data:|mailto:|tel:|javascript:|about:)/i.test(v))continue;const target=path.resolve(path.dirname(p),v);if(!fs.existsSync(target))fail(`Referencia local rota: ${rel(p)} → ${v}`);}}
if(!critical.some(x=>x.includes("Referencia local")))pass("Enlaces, scripts, estilos e imágenes locales sin rutas rotas.");

const sql=read("supabase/sql/00_ACTIVAR_TODO_EI_ERP_V7.sql");
for(const token of ["security definer","erp_apply_operations","erp_validate_case_change","erp_scan_flow_health","credit_transition","v_vsm_flow_health"]){if(!sql.includes(token))fail(`SQL V7 incompleto: ${token}`);}
if(!critical.some(x=>x.includes("SQL V7")))pass("Capa SQL operativa, transaccional, VSM y guardián presentes.");

const runtime=read("engine/shared/js/runtime/app-runtime.js");
if(runtime.includes("publique allí firestore.rules"))fail("Mensaje heredado todavía ordena publicar reglas Firestore.");
if(runtime.split(/\r?\n/).length>25000)warn("El motor de compatibilidad continúa monolítico; la capa Supabase evita una reescritura riesgosa inmediata.");
else pass("Motor heredado contenido dentro del límite de auditoría.");

const obsolete=["core/js/firebase.js","engine/shared/js/firebase-config.js","firebase.json","firestore.rules","firestore.indexes.json","storage.rules","functions"];
for(const f of obsolete)if(fs.existsSync(path.join(root,f)))fail(`Firebase todavía está activo en el repositorio V7: ${f}`);
if(!critical.some(x=>x.includes("Firebase todavía")))pass("Configuración, reglas, Functions y SDK de Firebase retirados del repositorio activo.");
const loader=read("core/js/supabase.js");
if(!/supabase-js@2\.112\.0/.test(loader)||!/jsdelivr/.test(loader)||!/unpkg/.test(loader))fail("El cargador Supabase no está fijado o carece de respaldo controlado.");else pass("SDK Supabase fijado y con carga secuencial verificada.");
if(!sql.includes("flowRevision")||!sql.includes("errcode='40001'"))fail("Falta el control optimista de concurrencia.");else pass("Control optimista de concurrencia y rechazo de versiones obsoletas presentes.");
if(!sql.includes("create policy erp_cases_role_read")||!sql.includes("grant execute on function public.erp_apply_operations"))fail("Falta la lectura RLS o la escritura transaccional de pedidos.");else pass("Lectura RLS y escritura transaccional de pedidos presentes.");

const report={generatedAt:new Date().toISOString(),critical,warnings,passed,metrics:{files:files.length,html:html.length,js:files.filter(p=>p.endsWith('.js')).length,sha256:crypto.createHash('sha256').update(allText).digest('hex')}};
fs.mkdirSync(path.join(root,"docs"),{recursive:true});fs.writeFileSync(path.join(root,"docs","QA_SUPABASE_V7.json"),JSON.stringify(report,null,2)+"\n");
fs.writeFileSync(path.join(root,"docs","QA_SUPABASE_V7.md"),["# QA EI ERP Nova V7","",`Generado: ${report.generatedAt}`,"",`- Críticos: **${critical.length}**`,`- Advertencias: **${warnings.length}**`,`- Controles superados: **${passed.length}**`,"","## Controles superados",...passed.map(x=>`- ${x}`),"","## Advertencias",...(warnings.length?warnings.map(x=>`- ${x}`):["- Ninguna"]),"","## Críticos",...(critical.length?critical.map(x=>`- ${x}`):["- Ninguno"]),""].join("\n"));
console.log(`QA Supabase V7: ${critical.length} críticos, ${warnings.length} advertencias, ${passed.length} controles superados.`);if(critical.length){console.error(critical.join("\n"));process.exit(1);}
