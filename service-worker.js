const VERSION="ei-erp-nova-8.5.0-recuperacion-operativa-20260805";
const CORE=[
  "./index.html","./manifest.json",
  "./core/js/config.js","./core/js/supabase.js","./core/js/auth-page.js","./core/js/portal.js",
  "./portal/index.html","./apps/trazabilidad/index.html","./apps/trazabilidad/js/app.js",
  "./engine/shared/js/bootstrap.js","./engine/shared/js/supabase-compat.js",
  "./engine/shared/js/supabase-legacy-adapter.js","./engine/shared/js/runtime/app-runtime.js"
];
self.addEventListener("install",event=>{
  event.waitUntil(
    caches.open(VERSION)
      .then(cache=>cache.addAll(CORE.map(x=>new Request(x,{cache:"reload"}))))
      .then(()=>self.skipWaiting())
  );
});
self.addEventListener("activate",event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(k=>k!==VERSION).map(k=>caches.delete(k))))
      .then(()=>self.clients.claim())
  );
});
self.addEventListener("fetch",event=>{
  if(event.request.method!=="GET")return;
  const url=new URL(event.request.url);
  if(url.origin!==location.origin)return;
  if(url.pathname.includes("/auth/v1/")||url.pathname.includes("/rest/v1/")||url.pathname.includes("/realtime/v1/")||url.pathname.includes("/functions/v1/"))return;
  const codeLike=
    event.request.mode==="navigate"||
    ["document","script","style"].includes(event.request.destination)||
    /\.(json|js|css|html)$/.test(url.pathname);
  if(codeLike){
    event.respondWith(
      fetch(event.request,{cache:"no-store"})
        .then(response=>{
          if(response&&response.ok){
            const copy=response.clone();
            caches.open(VERSION).then(cache=>cache.put(event.request,copy));
          }
          return response;
        })
        .catch(()=>caches.match(event.request).then(cached=>cached||caches.match("./index.html")))
    );
    return;
  }
  event.respondWith(
    caches.match(event.request).then(cached=>cached||fetch(event.request).then(response=>{
      if(response&&response.ok){
        const copy=response.clone();
        caches.open(VERSION).then(cache=>cache.put(event.request,copy));
      }
      return response;
    }))
  );
});
