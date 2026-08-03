(function () {
  "use strict";

  var config = window.EI_NOVA_CONFIG;
  var state = {
    ready: false,
    initializing: null,
    app: null,
    auth: null,
    db: null,
    error: null,
    sdkVersion: null
  };

  function sdkComplete() {
    var fb = window.firebase;
    return !!(
      fb &&
      typeof fb.initializeApp === "function" &&
      Array.isArray(fb.apps) &&
      typeof fb.auth === "function" &&
      typeof fb.firestore === "function"
    );
  }

  function waitForSdk() {
    if (window.EI_FIREBASE_SDK_READY && typeof window.EI_FIREBASE_SDK_READY.then === "function") {
      return window.EI_FIREBASE_SDK_READY;
    }
    if (sdkComplete()) return Promise.resolve(window.firebase);
    return Promise.reject(new Error("No se inició el cargador de Firebase."));
  }

  function validateConfig() {
    var firebaseConfig = config && config.firebase;
    var required = ["apiKey", "authDomain", "projectId", "appId"];
    if (!firebaseConfig) throw new Error("No existe la configuración de Firebase.");
    var missing = required.filter(function (key) { return !firebaseConfig[key]; });
    if (missing.length) {
      throw new Error("La configuración de Firebase está incompleta: " + missing.join(", ") + ".");
    }
    return firebaseConfig;
  }

  function init() {
    if (state.ready) return Promise.resolve(state);
    if (state.initializing) return state.initializing;

    state.initializing = waitForSdk()
      .then(function () {
        if (!sdkComplete()) {
          var status = window.EI_FIREBASE_SDK_STATUS || {};
          throw new Error(
            "El SDK de Firebase no terminó de cargar App, Auth y Firestore." +
            (status.detail ? " " + status.detail : "")
          );
        }

        var fb = window.firebase;
        var firebaseConfig = validateConfig();

        state.app = fb.apps.length ? fb.app() : fb.initializeApp(firebaseConfig);
        state.auth = fb.auth(state.app);
        state.db = fb.firestore(state.app);
        state.sdkVersion = window.EI_FIREBASE_SDK_VERSION || null;

        try {
          state.db.settings({ ignoreUndefinedProperties: true });
        } catch (_settingsError) {
          // Firestore puede haber iniciado antes; no es un fallo de conexión.
        }

        state.ready = true;
        state.error = null;
        return state;
      })
      .catch(function (error) {
        state.ready = false;
        state.error = error;
        state.initializing = null;
        throw error;
      });

    return state.initializing;
  }

  function profileFor(user) {
    if (!user) return Promise.reject(new Error("No existe una sesión autenticada."));

    return init().then(function () {
      var requests = [
        state.db.collection("users").doc(user.uid).get().catch(function () { return null; })
      ];

      if (user.email) {
        requests.push(
          state.db.collection("users").doc(user.email).get().catch(function () { return null; })
        );
      }

      return Promise.all(requests).then(function (results) {
        var doc = null;
        results.some(function (result) {
          if (result && result.exists) {
            doc = result;
            return true;
          }
          return false;
        });

        if (!doc) {
          throw new Error("Su cuenta está autenticada, pero no tiene un perfil activo en la colección users.");
        }

        var data = doc.data() || {};
        if (data.isActive === false) {
          throw new Error("Su usuario está inactivo. Comuníquese con el administrador.");
        }

        var role = data.role || data.rol;
        if(!role)throw new Error("El perfil no tiene un rol configurado.");

        return {
          uid: user.uid,
          email: user.email || data.email || "",
          name: data.name || data.displayName || user.displayName || user.email || "Usuario",
          role: role,
          raw: data,
          profileId: doc.id
        };
      });
    });
  }

  function saveProfile(profile) {
    try { sessionStorage.setItem(config.sessionKey, JSON.stringify(profile)); } catch (_error) {}
    return profile;
  }

  function readProfile() {
    try { return JSON.parse(sessionStorage.getItem(config.sessionKey) || "null"); }
    catch (_error) { return null; }
  }

  function clearProfile() {
    try { sessionStorage.removeItem(config.sessionKey); } catch (_error) {}
  }

  function requireSession(options) {
    options = options || {};
    return init().then(function () {
      return new Promise(function (resolve, reject) {
        var settled = false;
        var unsubscribe = state.auth.onAuthStateChanged(function (user) {
          if (settled) return;
          settled = true;
          if (typeof unsubscribe === "function") unsubscribe();

          if (!user) {
            clearProfile();
            if (options.redirect !== false) location.href = options.loginUrl || "../index.html";
            reject(new Error("No hay una sesión activa."));
            return;
          }

          profileFor(user)
            .then(function (profile) {
              saveProfile(profile);
              resolve({ user: user, profile: profile, auth: state.auth, db: state.db });
            })
            .catch(function (error) {
              clearProfile();
              reject(error);
            });
        }, function (error) {
          if (settled) return;
          settled = true;
          reject(error);
        });
      });
    });
  }

  window.EI_FIREBASE = {
    state: state,
    init: init,
    profileFor: profileFor,
    saveProfile: saveProfile,
    readProfile: readProfile,
    clearProfile: clearProfile,
    requireSession: requireSession
  };
})();
