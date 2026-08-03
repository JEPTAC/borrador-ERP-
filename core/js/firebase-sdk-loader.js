(function () {
  "use strict";

  var SDK_VERSION = "12.17.0";
  var TIMEOUT_MS = 20000;
  var REQUIRED_SERVICES = ["app", "auth", "firestore"];

  function getFirebase() {
    return window.firebase || null;
  }

  function serviceAvailable(service) {
    var fb = getFirebase();
    if (!fb) return false;
    if (service === "app") {
      return typeof fb.initializeApp === "function" && Array.isArray(fb.apps);
    }
    return typeof fb[service] === "function";
  }

  function sdkComplete() {
    return REQUIRED_SERVICES.every(serviceAvailable);
  }

  function candidates(service) {
    var file = "firebase-" + service + "-compat.js";
    return [
      "https://www.gstatic.com/firebasejs/" + SDK_VERSION + "/" + file,
      "https://cdn.jsdelivr.net/npm/firebase@" + SDK_VERSION + "/" + file,
      "https://unpkg.com/firebase@" + SDK_VERSION + "/" + file
    ];
  }

  function setStatus(phase, detail) {
    window.EI_FIREBASE_SDK_STATUS = Object.freeze({
      version: SDK_VERSION,
      phase: phase,
      detail: detail || "",
      complete: sdkComplete(),
      updatedAt: new Date().toISOString()
    });
  }

  function loadScript(src, id, service) {
    return new Promise(function (resolve, reject) {
      if (serviceAvailable(service)) {
        resolve(src);
        return;
      }

      var existing = document.getElementById(id);
      if (existing) {
        if (existing.dataset.eiState === "loaded") {
          if (serviceAvailable(service)) resolve(src);
          else reject(new Error("El archivo cargó, pero Firebase " + service + " no quedó disponible: " + src));
          return;
        }
        if (existing.dataset.eiState === "failed") {
          try { existing.remove(); } catch (_removeError) {}
          existing = null;
        }
      }

      var script = existing || document.createElement("script");
      var settled = false;
      var timer = setTimeout(function () {
        if (settled) return;
        settled = true;
        script.dataset.eiState = "failed";
        if (!existing) {
          try { script.remove(); } catch (_removeError) {}
        }
        reject(new Error("Tiempo agotado cargando " + src));
      }, TIMEOUT_MS);

      function finish(ok, error) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        script.dataset.eiState = ok ? "loaded" : "failed";
        if (ok) resolve(src);
        else reject(error || new Error("No cargó " + src));
      }

      script.addEventListener("load", function () {
        if (serviceAvailable(service)) {
          finish(true);
        } else {
          finish(false, new Error("La fuente respondió, pero no publicó Firebase " + service + ": " + src));
        }
      }, { once: true });

      script.addEventListener("error", function () {
        finish(false, new Error("No cargó " + src));
      }, { once: true });

      if (!existing) {
        script.id = id;
        script.src = src;
        script.async = false;
        script.defer = false;
        script.referrerPolicy = "strict-origin-when-cross-origin";
        script.dataset.eiFirebaseService = service;
        script.dataset.eiState = "loading";
        document.head.appendChild(script);
      }
    });
  }

  function loadService(service) {
    if (serviceAvailable(service)) return Promise.resolve("already-loaded");

    var urls = candidates(service);
    var errors = [];

    function attempt(index) {
      if (serviceAvailable(service)) return Promise.resolve("already-loaded");
      if (index >= urls.length) {
        throw new Error(
          "No fue posible cargar Firebase " + service + ". " +
          "Fuentes probadas: " + urls.join(" | ") + ". " +
          "Detalle: " + errors.join(" | ")
        );
      }

      var id = "ei-firebase-" + service + "-source-" + index;
      return loadScript(urls[index], id, service).catch(function (error) {
        errors.push(error && error.message ? error.message : String(error));
        return attempt(index + 1);
      });
    }

    setStatus("loading-" + service, "Cargando Firebase " + service);
    return attempt(0);
  }

  function start() {
    if (sdkComplete()) {
      setStatus("ready", "SDK ya disponible");
      return Promise.resolve(getFirebase());
    }

    return loadService("app")
      .then(function () { return loadService("auth"); })
      .then(function () { return loadService("firestore"); })
      .then(function () {
        if (!sdkComplete()) {
          throw new Error("Firebase terminó de cargar, pero faltan App, Auth o Firestore.");
        }
        setStatus("ready", "Firebase App, Auth y Firestore disponibles");
        return getFirebase();
      })
      .catch(function (error) {
        setStatus("error", error && error.message ? error.message : String(error));
        throw error;
      });
  }

  window.EI_FIREBASE_SDK_VERSION = SDK_VERSION;
  window.EI_FIREBASE_SDK_COMPLETE = sdkComplete;

  if (!window.EI_FIREBASE_SDK_READY || typeof window.EI_FIREBASE_SDK_READY.then !== "function") {
    window.EI_FIREBASE_SDK_READY = start();
  }

  window.EI_FIREBASE_SDK_RETRY = function () {
    window.EI_FIREBASE_SDK_READY = start();
    return window.EI_FIREBASE_SDK_READY;
  };
})();
