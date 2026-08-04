"use strict";

const fs=require("fs");
const path=require("path");
const {test,expect}=require("@playwright/test");
const config=require("../lib/config.cjs");
const erp=require("../lib/erp.cjs");
const journal=require("../lib/journal.cjs");

const catalog=JSON.parse(fs.readFileSync(path.resolve(process.cwd(),"apps/trazabilidad/config/transactions.json"),"utf8"));
const roles=JSON.parse(fs.readFileSync(path.resolve(process.cwd(),"core/config/roles.json"),"utf8"));
const model=JSON.parse(fs.readFileSync(path.resolve(process.cwd(),"apps/trazabilidad/config/operating-model.json"),"utf8"));
const actions=catalog.modules.flatMap(module=>(module.actions||[]).map(action=>({moduleId:module.id,...action})));

function normalizeRole(value){
  const raw=String(value||"").trim().toLowerCase();
  return model.roles[raw]?raw:(model.aliases[raw]||roles.aliases[raw]||raw);
}
function groupFor(role){return (model.roles[normalizeRole(role)]||{}).group||"";}
function allowed(action,group){return (action.groups||[]).includes("all")||(action.groups||[]).includes(group);}
async function directAccess(page,action){
  const target=erp.url(`engine/modules/${action.module}/?route=${encodeURIComponent(action.route)}`);
  await page.goto(target,{waitUntil:"domcontentloaded"});
  await page.waitForTimeout(700);
  const body=await page.locator("body").innerText().catch(()=>"");
  const denied=/Acceso no disponible|No tiene permiso|Inicio bloqueado|Acceso restringido|No autorizado/i.test(body);
  const fatal=/Supabase no conectó|No fue posible iniciar/i.test(body);
  return {denied,fatal,body:body.slice(0,500),url:page.url()};
}

const entries=Object.entries(config.accounts).filter(([,a])=>a&&a.email&&a.password&&a.role);

test.describe("Matriz exacta de acceso por rol",()=>{
  test.describe.configure({mode:"serial"});
  test("cada rol configurado accede solo a sus rutas",async({browser},testInfo)=>{
    test.setTimeout(60*60*1000);
    expect(entries.length,"Configure cuentas por rol en ERP_TEST_ACCOUNTS_JSON").toBeGreaterThan(0);
    const failures=[];
    for(const [key,raw] of entries){
      const role=normalizeRole(raw.role||key),group=groupFor(role);
      if(!model.roles[role]){failures.push({key,role,error:"Rol no reconocido"});continue;}
      const context=await browser.newContext();
      const page=await context.newPage();
      journal.installPageDiagnostics(page,{suite:"role-access",account:key,role});
      try{
        await erp.login(page,{key,...raw});
        for(const action of actions){
          const result=await directAccess(page,action);
          const shouldAllow=allowed(action,group);
          if(result.fatal||shouldAllow===result.denied){
            failures.push({key,role,group,module:action.module,route:action.route,shouldAllow,...result});
            await journal.evidence(page,testInfo,`rbac-${key}-${action.module}-${action.route}`,failures.at(-1));
          }
        }
      }catch(error){failures.push({key,role,error:error.message});}
      await context.close();
    }
    expect(failures,JSON.stringify(failures,null,2)).toEqual([]);
  });
});
