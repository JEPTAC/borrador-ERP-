(function(){
"use strict";
var OPEN_CLASS="ei-command-open",RECENT_KEY="ei.erp.recent.v5",MAX_RECENT=7,observer=null;
function esc(v){return String(v==null?"":v).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];});}
function norm(v){return String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();}
function readRecent(){try{return JSON.parse(localStorage.getItem(RECENT_KEY)||"[]");}catch(e){return [];}}
function saveRecent(item){try{var list=readRecent().filter(function(x){return x.key!==item.key;});list.unshift(item);localStorage.setItem(RECENT_KEY,JSON.stringify(list.slice(0,MAX_RECENT)));}catch(e){}}
function registry(){return window.EI_NAV?window.EI_NAV.registry(window.EI_NAV_CONTEXT||{}):[];}
function close(){var el=document.getElementById("eiCommandPalette");if(el)el.remove();document.documentElement.classList.remove(OPEN_CLASS);}
function open(initial){
  close();var all=registry(),recentKeys=readRecent(),recent=[];recentKeys.forEach(function(saved){var found=all.filter(function(x){return x.key===saved.key;})[0];if(found)recent.push(found);});
  var overlay=document.createElement("div");overlay.id="eiCommandPalette";overlay.className="ei-command-overlay";overlay.innerHTML='<div class="ei-command-backdrop" data-command-close></div><section class="ei-command-panel" role="dialog" aria-modal="true" aria-label="Buscar y navegar en el ERP"><header><span class="ei-command-search-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="m16 16 4 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></span><input id="eiCommandInput" autocomplete="off" placeholder="Buscar módulo, proceso o función…" aria-label="Buscar en el ERP"><kbd>Esc</kbd></header><div id="eiCommandResults" class="ei-command-results"></div><footer><span>↑↓ navegar</span><span>Enter abrir</span><span>Ctrl/⌘ + K</span></footer></section>';
  document.body.appendChild(overlay);document.documentElement.classList.add(OPEN_CLASS);
  var input=document.getElementById("eiCommandInput"),results=document.getElementById("eiCommandResults"),active=0,visible=[];
  function score(item,q){var title=norm(item.title),text=norm(item.title+" "+item.subtitle+" "+item.keywords);if(title===q)return 100;if(title.indexOf(q)===0)return 75;if(text.indexOf(q)>=0)return 50;var words=q.split(/\s+/).filter(Boolean);return words.every(function(w){return text.indexOf(w)>=0;})?35:0;}
  function draw(){
    var q=norm(input.value),base=[];
    if(q){base=all.map(function(x){return {item:x,score:score(x,q)};}).filter(function(x){return x.score>0;}).sort(function(a,b){return b.score-a.score||a.item.title.localeCompare(b.item.title);}).map(function(x){return x.item;});}
    else{base=recent.concat(all.filter(function(x){return x.kind==="module"&&recent.every(function(r){return r.key!==x.key;});}));}
    var seen={};visible=base.filter(function(x){if(seen[x.key])return false;seen[x.key]=1;return true;}).slice(0,18);if(active>=visible.length)active=0;
    if(!visible.length){results.innerHTML='<div class="ei-command-empty"><strong>Sin resultados</strong><span>Busque por área, proceso, actividad o módulo.</span></div>';return;}
    var html="",last="";visible.forEach(function(x,i){var group=x.kind==="module"?"Módulos":"Funciones";if(group!==last){last=group;html+='<div class="ei-command-group-label">'+group+'</div>';}html+='<button class="ei-command-item '+(i===active?'active':'')+'" data-command-index="'+i+'"><i>'+esc(x.icon)+'</i><span><b>'+esc(x.title)+'</b><small>'+esc(x.subtitle)+(x.kind==='route'?' · función':'')+'</small></span><em>↗</em></button>';});results.innerHTML=html;
  }
  function go(index){var item=visible[index];if(!item)return;saveRecent({key:item.key});location.href=item.url;}
  input.value=initial||"";input.oninput=function(){active=0;draw();};input.onkeydown=function(e){if(e.key==="ArrowDown"){e.preventDefault();active=Math.min(visible.length-1,active+1);draw();}else if(e.key==="ArrowUp"){e.preventDefault();active=Math.max(0,active-1);draw();}else if(e.key==="Enter"){e.preventDefault();go(active);}else if(e.key==="Escape")close();};
  results.onclick=function(e){var b=e.target.closest("[data-command-index]");if(b)go(Number(b.dataset.commandIndex));};overlay.onclick=function(e){if(e.target.closest("[data-command-close]"))close();};draw();setTimeout(function(){input.focus();input.select();},0);
}
function injectLegacyTrigger(){
  var side=document.querySelector(".sidebar");if(side&&!side.querySelector(".ei-command-trigger")){var btn=document.createElement("button");btn.type="button";btn.className="ei-command-trigger";btn.innerHTML='<span><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="m16 16 4 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></span><b>Buscar o ir a…</b><kbd>Ctrl K</kbd>';btn.onclick=function(){open();};var brand=side.querySelector(".sidebar-brand"),nav=side.querySelector(".nav");if(nav)side.insertBefore(btn,nav);else if(brand&&brand.nextSibling)side.insertBefore(btn,brand.nextSibling);else side.prepend(btn);}
  var mobile=document.querySelector(".mobile-top");if(mobile&&!mobile.querySelector(".ei-command-mobile")){var mb=document.createElement("button");mb.type="button";mb.className="ei-command-mobile erp-icon-btn";mb.setAttribute("aria-label","Buscar o navegar");mb.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="m16 16 4 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';mb.onclick=function(){open();};var menu=mobile.querySelector(".mobile-menu-btn");mobile.insertBefore(mb,menu||null);}
  if(window.EI_NAV)window.EI_NAV.bind(document);
}
function observe(){if(observer)return;observer=new MutationObserver(function(){injectLegacyTrigger();});observer.observe(document.documentElement,{subtree:true,childList:true});injectLegacyTrigger();}
document.addEventListener("keydown",function(e){if((e.ctrlKey||e.metaKey)&&String(e.key).toLowerCase()==="k"){e.preventDefault();open();}else if(e.key==="Escape"&&document.documentElement.classList.contains(OPEN_CLASS))close();});
window.EI_UX={openCommandPalette:open,closeCommandPalette:close,refreshNavigation:injectLegacyTrigger};
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",observe);else observe();
})();
