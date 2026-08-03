(function(){
  "use strict";
  if (window.EI_FIREBASE_SDK_READY) return;

  var VERSION = "12.16.0";
  var TIMEOUT_MS = 18000;

  function available(service){
    if (!window.firebase) return false;
    if (service === "app") return typeof window.firebase.initializeApp === "function";
    return typeof window.firebase[service] === "function";
  }

  function urls(service){
    var file = "firebase-" + service + "-compat.js";
    return [
      "https://www.gstatic.com/firebasejs/" + VERSION + "/" + file,
      "https://cdn.jsdelivr.net/npm/firebase@" + VERSION + "/" + file,
      "https://unpkg.com/firebase@" + VERSION + "/" + file
    ];
  }

  function loadUrl(src, id){
    return new Promise(function(resolve, reject){
      var existing = document.getElementById(id);
      if (existing) {
        existing.addEventListener("load", function(){ resolve(src); }, {once:true});
        existing.addEventListener("error", function(){ reject(new Error("No cargó " + src)); }, {once:true});
        return;
      }
      var script = document.createElement("script");
      var settled = false;
      var timer = setTimeout(function(){
        if (settled) return;
        settled = true;
        try { script.remove(); } catch (_e) {}
        reject(new Error("Tiempo agotado cargando " + src));
      }, TIMEOUT_MS);
      script.id = id;
      script.src = src;
      script.async = false;
      script.crossOrigin = "anonymous";
      script.referrerPolicy = "strict-origin-when-cross-origin";
      script.onload = function(){
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(src);
      };
      script.onerror = function(){
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try { script.remove(); } catch (_e) {}
        reject(new Error("No cargó " + src));
      };
      document.head.appendChild(script);
    });
  }

  function loadService(service){
    if (available(service)) return Promise.resolve("already-loaded");
    var candidates = urls(service);
    var errors = [];
    function attempt(index){
      if (available(service)) return Promise.resolve("already-loaded");
      if (index >= candidates.length) {
        throw new Error("No cargó Firebase " + service + ". Fuentes probadas: " + candidates.join(" | ") + ". " + (errors[errors.length - 1] || ""));
      }
      return loadUrl(candidates[index], "ei-firebase-" + service + "-source-" + index)
        .then(function(){
          if (!available(service)) {
            errors.push("La fuente respondió, pero no publicó firebase." + service + ": " + candidates[index]);
            return attempt(index + 1);
          }
          return candidates[index];
        })
        .catch(function(error){
          errors.push(error && error.message ? error.message : String(error));
          return attempt(index + 1);
        });
    }
    return attempt(0);
  }

  window.EI_FIREBASE_SDK_VERSION = VERSION;
  window.EI_FIREBASE_SDK_READY = loadService("app")
    .then(function(){ return loadService("auth"); })
    .then(function(){ return loadService("firestore"); })
    .then(function(){
      if (!window.firebase || !window.firebase.initializeApp || !window.firebase.auth || !window.firebase.firestore) {
        throw new Error("Firebase no quedó disponible después de cargar sus componentes.");
      }
      return window.firebase;
    });
})();
