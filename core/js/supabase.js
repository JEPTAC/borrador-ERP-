(function(){
  "use strict";
  if(window.EI_SUPABASE&&window.EI_SUPABASE.state){return;}
  var config=window.EI_NOVA_CONFIG||{};
  var state={ready:false,client:null,auth:null,db:null,error:null,currentUser:null};
  var initPromise=null;
  var clientSingletonKey="__EI_NOVA_SUPABASE_CLIENT__";

  function normalizeUser(user){
    if(!user)return null;
    if(!user.uid)user.uid=user.id;
    if(!user.displayName)user.displayName=(user.user_metadata&&(user.user_metadata.name||user.user_metadata.full_name))||user.email||"Usuario";
    return user;
  }
  var sdkPromise=null;
  function ensureSdk(){
    if(window.supabase&&typeof window.supabase.createClient==="function")return Promise.resolve(window.supabase);
    if(sdkPromise)return sdkPromise;
    var sources=[
      "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.0/dist/umd/supabase.js",
      "https://unpkg.com/@supabase/supabase-js@2.112.0/dist/umd/supabase.js"
    ];
    sdkPromise=new Promise(function(resolve,reject){
      function attempt(index,lastError){
        if(window.supabase&&typeof window.supabase.createClient==="function"){resolve(window.supabase);return;}
        if(index>=sources.length){reject(new Error("No cargó el SDK de Supabase desde las fuentes verificadas."+(lastError?" "+lastError:"")));return;}
        var src=sources[index],script=document.createElement("script");
        script.src=src;script.async=false;script.crossOrigin="anonymous";script.dataset.eiSupabaseSdk="2.112.0";
        script.onload=function(){
          if(window.supabase&&typeof window.supabase.createClient==="function")resolve(window.supabase);
          else{script.remove();attempt(index+1,"La fuente "+src+" respondió de forma incompleta.");}
        };
        script.onerror=function(){script.remove();attempt(index+1,"Falló "+src+".");};
        document.head.appendChild(script);
      }
      attempt(0,"");
    }).catch(function(error){sdkPromise=null;throw error;});
    return sdkPromise;
  }
  function authAdapter(client){
    return {
      get currentUser(){return state.currentUser;},
      onAuthStateChanged:function(next,error){
        var active=true;
        client.auth.getSession().then(function(result){
          if(!active)return;
          if(result.error){if(error)error(result.error);return;}
          state.currentUser=normalizeUser(result.data&&result.data.session&&result.data.session.user);
          next(state.currentUser,"INITIAL_SESSION",result.data&&result.data.session);
        }).catch(function(e){if(error)error(e);});
        var listener=client.auth.onAuthStateChange(function(event,session){
          if(!active)return;
          state.currentUser=normalizeUser(session&&session.user);
          next(state.currentUser,event,session);
        });
        return function(){active=false;try{listener.data.subscription.unsubscribe();}catch(e){}};
      },
      setPersistence:function(){return Promise.resolve();},
      signInWithEmailAndPassword:function(email,password){
        return client.auth.signInWithPassword({email:email,password:password}).then(function(result){
          if(result.error)throw result.error;
          state.currentUser=normalizeUser(result.data.user);
          return {user:state.currentUser,session:result.data.session};
        });
      },
      signInWithPopup:function(){
        return client.auth.signInWithOAuth({provider:"google",options:{redirectTo:location.origin+location.pathname.replace(/[^/]*$/,"")}}).then(function(result){
          if(result.error)throw result.error;
          return result.data;
        });
      },
      signOut:function(){return client.auth.signOut().then(function(result){if(result.error)throw result.error;state.currentUser=null;});},
      sendPasswordResetEmail:function(email){
        return client.auth.resetPasswordForEmail(email,{redirectTo:location.origin+location.pathname.replace(/[^/]*$/,"")}).then(function(result){if(result.error)throw result.error;return result;});
      },
      updatePassword:function(password){
        return client.auth.updateUser({password:password}).then(function(result){if(result.error)throw result.error;return result.data;});
      }
    };
  }
  function inheritedClient(){
    try{
      if(window.parent&&window.parent!==window&&window.parent.EI_SUPABASE&&window.parent.EI_SUPABASE.state&&window.parent.EI_SUPABASE.state.client){
        return window.parent.EI_SUPABASE.state.client;
      }
      if(window.top&&window.top!==window&&window.top.EI_SUPABASE&&window.top.EI_SUPABASE.state&&window.top.EI_SUPABASE.state.client){
        return window.top.EI_SUPABASE.state.client;
      }
    }catch(e){}
    return null;
  }
  function init(){
    if(state.ready)return Promise.resolve(state);
    if(initPromise)return initPromise;
    initPromise=ensureSdk().then(function(){
      var settings=config.supabase||{};
      if(!settings.url||!settings.publishableKey)throw new Error("La configuración pública de Supabase está incompleta.");
      var inherited=inheritedClient();
      var existing=window[clientSingletonKey];
      if(inherited){
        state.client=inherited;
        window[clientSingletonKey]={url:settings.url,key:settings.publishableKey,client:state.client,inherited:true};
      }else if(existing&&existing.url===settings.url&&existing.key===settings.publishableKey&&existing.client){
        state.client=existing.client;
      }else{
        state.client=window.supabase.createClient(settings.url,settings.publishableKey,{
          auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:"pkce",storageKey:"sb-hezjxcxxcjlpmyalftam-auth-token"},
          db:{schema:settings.schema||"public"},
          global:{headers:{"X-Client-Info":"ei-erp-nova/8.5.0"}}
        });
        window[clientSingletonKey]={url:settings.url,key:settings.publishableKey,client:state.client};
      }
      state.auth=authAdapter(state.client);
      state.db=state.client;
      state.ready=true;
      state.error=null;
      return state;
    }).catch(function(error){state.error=error;initPromise=null;throw error;});
    return initPromise;
  }
  function profileFor(user){
    user=normalizeUser(user);
    if(!user)return Promise.reject(new Error("No existe una sesión autenticada."));
    return init().then(function(){
      return state.client.from("profiles").select("*").eq("auth_user_id",user.id).maybeSingle();
    }).then(function(result){
      if(result.error)throw result.error;
      var data=result.data;
      if(!data)throw new Error("Su cuenta está autenticada, pero no está vinculada a un perfil del ERP.");
      if(data.active!==true)throw new Error("Su usuario está inactivo. Comuníquese con el administrador.");
      if(!data.role_code)throw new Error("El perfil no tiene un rol configurado.");
      return {
        uid:data.firebase_uid||user.id,
        authUid:user.id,
        email:user.email||data.email||"",
        name:data.display_name||user.displayName||user.email||"Usuario",
        role:data.role_code,
        raw:Object.assign({},data.raw_profile||{},data),
        profileId:data.firebase_uid||user.id
      };
    });
  }
  function saveProfile(profile){try{sessionStorage.setItem(config.sessionKey,JSON.stringify(profile));}catch(e){}return profile;}
  function readProfile(){try{return JSON.parse(sessionStorage.getItem(config.sessionKey)||"null");}catch(e){return null;}}
  function clearProfile(){try{sessionStorage.removeItem(config.sessionKey);}catch(e){}}
  function requireSession(options){
    options=options||{};
    return init().then(function(){
      return state.client.auth.getSession();
    }).then(function(result){
      if(result.error)throw result.error;
      var user=normalizeUser(result.data&&result.data.session&&result.data.session.user);
      if(!user){clearProfile();if(options.redirect!==false)location.href=options.loginUrl||"../index.html";throw new Error("No hay una sesión activa.");}
      state.currentUser=user;
      return profileFor(user).then(function(profile){saveProfile(profile);return {user:user,profile:profile,auth:state.auth,db:state.client,client:state.client};});
    });
  }
  window.EI_SUPABASE={state:state,init:init,profileFor:profileFor,saveProfile:saveProfile,readProfile:readProfile,clearProfile:clearProfile,requireSession:requireSession,normalizeUser:normalizeUser};
})();
