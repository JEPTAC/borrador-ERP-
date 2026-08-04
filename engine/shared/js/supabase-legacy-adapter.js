(function(){
"use strict";
var CORE=window.EI_SUPABASE,COMPAT=window.EI_SUPABASE_COMPAT;
if(!CORE||!COMPAT)throw new Error("La capa Supabase del ERP no está disponible.");
var ready=null,db=null,auth=null;
function init(){
  if(ready)return ready;
  ready=Promise.all([CORE.init(),COMPAT.create()]).then(function(values){
    auth=values[0].auth;db=values[1].db;
    return {auth:auth,db:db,client:values[0].client};
  });
  return ready;
}
function Timestamp(value){this._date=value instanceof Date?value:new Date(value||Date.now());this.seconds=Math.floor(this._date.getTime()/1000);this.nanoseconds=(this._date.getTime()%1000)*1000000;}
Timestamp.prototype.toDate=function(){return new Date(this._date.getTime());};
Timestamp.prototype.toMillis=function(){return this._date.getTime();};
Timestamp.prototype.toJSON=function(){return this._date.toISOString();};
Timestamp.now=function(){return new Timestamp(new Date());};
Timestamp.fromDate=function(d){return new Timestamp(d);};
var FieldValue={
  serverTimestamp:function(){return new Date().toISOString();},
  increment:function(n){return {__eiOperation:"increment",value:Number(n||0)};},
  arrayUnion:function(){return {__eiOperation:"arrayUnion",values:Array.prototype.slice.call(arguments)};},
  arrayRemove:function(){return {__eiOperation:"arrayRemove",values:Array.prototype.slice.call(arguments)};},
  delete:function(){return {__eiOperation:"delete"};}
};
var legacyAuth=null,legacyCurrent=null;
function toLegacyUser(user){
  if(!user)return Promise.resolve(null);
  return CORE.profileFor(user).then(function(profile){
    var copy=Object.assign({},user,{authUid:user.id,uid:profile.uid,displayName:profile.name,email:user.email||profile.email,profile:profile});
    legacyCurrent=copy;return copy;
  }).catch(function(){legacyCurrent=user;return user;});
}
function authFacade(){
  if(legacyAuth)return legacyAuth;
  var base=CORE.state.auth;
  if(!base)throw new Error("Supabase Auth todavía no inicializó.");
  legacyAuth={
    get currentUser(){return legacyCurrent;},
    onAuthStateChanged:function(next,error){return base.onAuthStateChanged(function(user){toLegacyUser(user).then(next).catch(function(e){if(error)error(e);});},error);},
    setPersistence:function(){return Promise.resolve();},
    signInWithEmailAndPassword:function(email,password){return base.signInWithEmailAndPassword(email,password).then(function(result){return toLegacyUser(result.user).then(function(user){return {user:user,session:result.session};});});},
    signInWithPopup:function(){return base.signInWithPopup();},
    signOut:function(){legacyCurrent=null;return base.signOut();},
    sendPasswordResetEmail:function(email){return base.sendPasswordResetEmail(email);},
    createUserWithEmailAndPassword:function(email,password){
      return CORE.state.client.functions.invoke("admin-create-user",{body:{email:email,password:password}}).then(function(result){
        if(result.error)throw result.error;var u=result.data&&result.data.user;if(!u)throw new Error("La función administrativa no devolvió el usuario.");return {user:CORE.normalizeUser(u)};
      });
    }
  };
  return legacyAuth;
}
function secondaryAuth(){var base=authFacade();return {currentUser:null,createUserWithEmailAndPassword:base.createUserWithEmailAndPassword,onAuthStateChanged:base.onAuthStateChanged,setPersistence:function(){return Promise.resolve();},signOut:function(){return Promise.resolve();}};}
function appObject(name){var secondary=!!(name&&name!=="[DEFAULT]");return {name:name||"[DEFAULT]",options:{projectId:"hezjxcxxcjlpmyalftam",supabaseUrl:(window.EI_NOVA_CONFIG.supabase||{}).url},auth:function(){return secondary?secondaryAuth():authFacade();},firestore:function(){return db;},delete:function(){return Promise.resolve();}};}
var defaultApp=appObject("[DEFAULT]");
var facade={
  apps:[defaultApp],
  initializeApp:function(options,name){var a=appObject(name||"[DEFAULT]");if(name)facade.apps.push(a);return a;},
  app:function(){return defaultApp;},
  auth:function(){return authFacade();},
  firestore:function(){if(!db)throw new Error("Supabase Database todavía no inicializó.");return db;},
  functions:function(){return {httpsCallable:function(name){return function(payload){return CORE.state.client.functions.invoke(name,{body:payload||{}}).then(function(result){if(result.error)throw result.error;return {data:result.data};});};}};},
  __eiSupabaseAdapter:true
};
facade.auth.Auth={Persistence:{LOCAL:"local",SESSION:"session"}};
facade.auth.GoogleAuthProvider=function GoogleAuthProvider(){};
facade.firestore.FieldValue=FieldValue;
facade.firestore.Timestamp=Timestamp;
facade.firestore.enablePersistence=function(){return Promise.resolve();};
facade.firestore.setLogLevel=function(){};
window.firebase=facade;
window.firebaseConfig={projectId:"hezjxcxxcjlpmyalftam",backend:"supabase"};
window.EI_BACKEND_ADAPTER={init:init,get db(){return db;},get auth(){return auth;},Timestamp:Timestamp,FieldValue:FieldValue};
init().catch(function(error){console.error("[EI ERP] No inició la compatibilidad Supabase",error);});
})();
