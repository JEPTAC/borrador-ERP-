(function(){
  "use strict";
  var config=window.EI_NOVA_CONFIG;
  var state={ready:false,app:null,auth:null,db:null,error:null};
  function init(){
    if(state.ready)return Promise.resolve(state);
    try{
      if(!window.firebase)throw new Error("No cargó el SDK de Firebase.");
      state.app=firebase.apps.length?firebase.app():firebase.initializeApp(config.firebase);
      state.auth=firebase.auth();
      state.db=firebase.firestore();
      try{state.db.settings({ignoreUndefinedProperties:true});}catch(e){}
      state.ready=true;
      return Promise.resolve(state);
    }catch(error){state.error=error;return Promise.reject(error);}
  }
  function profileFor(user){
    if(!user)return Promise.reject(new Error("No existe una sesión autenticada."));
    return init().then(function(){
      var refs=[state.db.collection("users").doc(user.uid).get().catch(function(){return null;})];
      if(user.email){refs.push(state.db.collection("users").doc(user.email).get().catch(function(){return null;}));}
      return Promise.all(refs).then(function(results){
        var doc=null;
        results.some(function(result){
          if(result&&result.exists){doc=result;return true;}
          if(result&&result.docs&&result.docs.length){doc=result.docs[0];return true;}
          return false;
        });
        if(!doc)throw new Error("Su cuenta está autenticada, pero no tiene un perfil activo en la colección users.");
        var data=doc.data()||{};
        if(data.isActive===false)throw new Error("Su usuario está inactivo. Comuníquese con el administrador.");
        var role=data.role||data.rol;
        if(!role)throw new Error("El perfil no tiene un rol configurado.");
        return {uid:user.uid,email:user.email||data.email||"",name:data.name||data.displayName||user.displayName||user.email||"Usuario",role:role,raw:data,profileId:doc.id};
      });
    });
  }
  function saveProfile(profile){try{sessionStorage.setItem(config.sessionKey,JSON.stringify(profile));}catch(e){}return profile;}
  function readProfile(){try{return JSON.parse(sessionStorage.getItem(config.sessionKey)||"null");}catch(e){return null;}}
  function clearProfile(){try{sessionStorage.removeItem(config.sessionKey);}catch(e){}}
  function requireSession(options){options=options||{};return init().then(function(){return new Promise(function(resolve,reject){var settled=false,unsub=state.auth.onAuthStateChanged(function(user){if(settled)return;settled=true;unsub();if(!user){clearProfile();if(options.redirect!==false)location.href=options.loginUrl||"../index.html";reject(new Error("No hay una sesión activa."));return;}profileFor(user).then(function(p){saveProfile(p);resolve({user:user,profile:p,auth:state.auth,db:state.db});}).catch(function(e){clearProfile();reject(e);});},function(e){if(settled)return;settled=true;reject(e);});});});}
  window.EI_FIREBASE={state:state,init:init,profileFor:profileFor,saveProfile:saveProfile,readProfile:readProfile,clearProfile:clearProfile,requireSession:requireSession};
})();
