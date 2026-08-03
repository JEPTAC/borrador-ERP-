(function(){
  "use strict";
  var U=window.EI_UTIL,F=window.EI_FIREBASE,cfg=window.EI_NOVA_CONFIG;
  var roleConfig=null,session=null,base=document.documentElement.dataset.base||"../";
  function groupFor(role){var n=U.normalize(role);return roleConfig.aliases[n]||"user";}
  function initials(name){return String(name||"U").split(/\s+/).slice(0,2).map(function(x){return x.charAt(0);}).join("").toUpperCase();}
  function detectProfile(){
    var ua=navigator.userAgent||"",w=window.innerWidth||screen.width||1440,h=window.innerHeight||screen.height||900;
    if(/iPhone|iPad|iPod/i.test(ua))return "ios";
    if(w<=1180&&h<=820)return "compact";
    if(w<=1280&&Math.abs(w-h)<=260)return "square";
    return "";
  }
  function selectedProfile(){return document.documentElement.dataset.layoutProfile||localStorage.getItem(cfg.layoutKey)||detectProfile();}
  function portalRoot(){return new URL(base+"portal/",location.href);}
  function layoutHref(path){var profile=selectedProfile();var url=new URL(base+path,location.href);if(profile)url=new URL(profile+"/",url);return url.href;}
  function renderApps(data){var group=groupFor(session.profile.role),apps=(data.applications||[]).filter(function(app){return app.enabled!==false&&(app.groups||["all"]).some(function(g){return g==="all"||g===group;});});var grid=U.qs("#appGrid");if(!apps.length){grid.innerHTML='<div class="ei-card ei-empty">'+U.icon("route")+'<strong>No hay aplicativos asignados</strong><span>El administrador debe asociar al menos un aplicativo a su rol.</span></div>';return;}grid.innerHTML=apps.map(function(app){return '<a class="app-card" href="'+U.escape(layoutHref(app.path))+'" data-app="'+U.escape(app.id)+'"><div class="app-card-icon">'+U.icon(app.icon||"route")+'</div><h3>'+U.escape(app.name)+'</h3><p>'+U.escape(app.description)+'</p><div class="app-card-footer"><span>Abrir aplicativo</span>'+U.icon("arrow")+'</div></a>';}).join("");}
  function boot(){Promise.all([F.requireSession({loginUrl:base+"index.html"}),U.json(base+"core/config/applications.json"),U.json(base+"core/config/roles.json")]).then(function(values){session=values[0];roleConfig=values[2];U.qs("[data-user-avatar]").textContent=initials(session.profile.name);U.qs("[data-user-name]").textContent=session.profile.name;U.qs("[data-user-role]").textContent=roleConfig.labels[groupFor(session.profile.role)]||session.profile.role;U.qs("#portalGreeting").textContent="Hola, "+String(session.profile.name||"Usuario").split(" ")[0];U.qs("#portalDate").textContent=new Date().toLocaleDateString("es-CO",{weekday:"long",day:"numeric",month:"long",year:"numeric"});renderApps(values[1]);}).catch(function(error){U.qs("#appGrid").innerHTML='<div class="ei-card ei-empty">'+U.icon("alert")+'<strong>No fue posible abrir el portal</strong><span>'+U.escape(error.message||error)+'</span><a class="ei-btn" href="'+base+'index.html">Volver al inicio</a></div>';});}
  U.qs("#portalLogout").addEventListener("click",function(){F.init().then(function(){return F.state.auth.signOut();}).finally(function(){F.clearProfile();location.href=base+"index.html";});});
  var layoutSelect=U.qs("#portalLayout");
  layoutSelect.value=document.documentElement.dataset.layoutProfile||localStorage.getItem(cfg.layoutKey)||"";
  layoutSelect.addEventListener("change",function(e){
    var value=e.target.value;
    if(value)localStorage.setItem(cfg.layoutKey,value);else localStorage.removeItem(cfg.layoutKey);
    location.href=new URL(value?value+"/":"",portalRoot()).href;
  });
  window.EI_A11Y.bind(document);boot();
})();
