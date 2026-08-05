const VERSION="ei-erp-nova-8.2.0-rpc-runtime-20260805-1";
const CORE=[
  "./index.html","./manifest.json","./core/css/tokens.css","./core/css/base.css","./core/css/auth.css","./core/css/portal.css","./core/css/shell.css",
  "./core/js/config.js","./core/js/utils.js","./core/js/accessibility.js","./core/js/supabase.js","./core/js/auth-page.js","./core/js/portal.js",
  "./core/config/applications.json","./core/config/roles.json","./core/assets/logo-electroingenieria.jpeg","./core/assets/app-icon.svg",
  "./portal/index.html","./apps/trazabilidad/index.html","./apps/trazabilidad/js/app.js","./apps/trazabilidad/config/transactions.json",
  "./engine/shared/js/supabase-compat.js","./engine/shared/js/supabase-legacy-adapter.js","./engine/shared/js/bootstrap.js","./engine/shared/js/runtime/app-runtime.js","./engine/shared/js/drive-client.js"
];
self.addEventListener("install",event=>{event.waitUntil(caches.open(VERSION).then(cache=>cache.addAll(CORE)).then(()=>self.skipWaiting()));});
self.addEventListener("activate",event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==VERSION).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener("fetch",event=>{
  if(event.request.method!=="GET")return;
  const url=new URL(event.request.url);
  if(url.origin!==location.origin)return;
  if(url.pathname.includes("/auth/v1/")||url.pathname.includes("/rest/v1/")||url.pathname.includes("/realtime/v1/")||url.pathname.includes("/functions/v1/"))return;
  const isPage=event.request.mode==="navigate"||event.request.destination==="document";
  if(isPage){event.respondWith(fetch(event.request,{cache:"no-store"}).then(response=>{const copy=response.clone();caches.open(VERSION).then(c=>c.put(event.request,copy));return response;}).catch(()=>caches.match(event.request).then(r=>r||caches.match("./index.html"))));return;}
  event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request).then(response=>{if(response.ok&&["script","style","image","font"].includes(event.request.destination)){const copy=response.clone();caches.open(VERSION).then(c=>c.put(event.request,copy));}return response;})));
});
