const VERSION = "ei-erp-nova-6.2.2-20260803-4";
const CORE = [
  "./index.html", "./manifest.json",
  "./core/css/tokens.css", "./core/css/base.css", "./core/css/auth.css", "./core/css/portal.css", "./core/css/shell.css",
  "./core/js/firebase-sdk-loader.js", "./core/js/config.js", "./core/js/utils.js", "./core/js/accessibility.js", "./core/js/firebase.js", "./core/js/auth-page.js", "./core/js/portal.js",
  "./core/config/applications.json", "./core/config/roles.json",
  "./core/assets/logo-electroingenieria.jpeg", "./core/assets/app-icon.svg",
  "./portal/index.html", "./apps/trazabilidad/index.html", "./apps/trazabilidad/js/app.js", "./apps/trazabilidad/config/transactions.json"
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(VERSION)
      .then(function (cache) { return cache.addAll(CORE); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.filter(function (key) { return key !== VERSION; }).map(function (key) { return caches.delete(key); }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

function networkFirst(request) {
  return fetch(request).then(function (response) {
    if (response && response.ok) {
      var copy = response.clone();
      caches.open(VERSION).then(function (cache) { cache.put(request, copy); });
    }
    return response;
  }).catch(function () {
    return caches.match(request);
  });
}

function cacheFirst(request) {
  return caches.match(request).then(function (cached) {
    if (cached) return cached;
    return fetch(request).then(function (response) {
      if (response && response.ok) {
        var copy = response.clone();
        caches.open(VERSION).then(function (cache) { cache.put(request, copy); });
      }
      return response;
    });
  });
}

self.addEventListener("fetch", function (event) {
  if (event.request.method !== "GET") return;

  var url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.includes("/functions/") || url.pathname.includes("/firestore")) return;

  var isNavigation = event.request.mode === "navigate" || event.request.destination === "document";
  var isRuntimeCode = event.request.destination === "script" || event.request.destination === "style" || event.request.destination === "worker" || /\.(?:js|css|json)$/i.test(url.pathname);

  if (isNavigation || isRuntimeCode) {
    event.respondWith(
      networkFirst(event.request).then(function (response) {
        return response || caches.match("./index.html");
      })
    );
    return;
  }

  if (["image", "font"].includes(event.request.destination)) {
    event.respondWith(cacheFirst(event.request));
  }
});
