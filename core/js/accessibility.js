(function(){
  "use strict";
  var cfg=window.EI_NOVA_CONFIG;
  var defaults={scale:1,contrast:"normal",theme:"light",motion:window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches?"reduced":"normal"};
  function read(){try{return Object.assign({},defaults,JSON.parse(localStorage.getItem(cfg.accessibilityKey)||"{}"));}catch(e){return Object.assign({},defaults);}}
  function apply(state){state=Object.assign({},defaults,state||{});document.documentElement.style.setProperty("--ei-text-scale",String(Math.max(.9,Math.min(1.25,Number(state.scale)||1))));document.documentElement.dataset.contrast=state.contrast||"normal";document.documentElement.dataset.theme=state.theme||"light";document.documentElement.dataset.motion=state.motion||"normal";try{localStorage.setItem(cfg.accessibilityKey,JSON.stringify(state));}catch(e){}return state;}
  function bind(root){root=root||document;var panel=root.querySelector("[data-a11y-panel]"),toggle=root.querySelector("[data-a11y-toggle]");if(toggle&&panel){toggle.addEventListener("click",function(){var hidden=panel.hasAttribute("hidden");if(hidden){panel.removeAttribute("hidden");toggle.setAttribute("aria-expanded","true");}else{panel.setAttribute("hidden","");toggle.setAttribute("aria-expanded","false");}});document.addEventListener("click",function(e){if(!panel.contains(e.target)&&!toggle.contains(e.target)){panel.setAttribute("hidden","");toggle.setAttribute("aria-expanded","false");}});}
    root.querySelectorAll("[data-a11y-action]").forEach(function(btn){btn.addEventListener("click",function(){var state=read(),action=btn.dataset.a11yAction;if(action==="font-up")state.scale=Math.min(1.25,(Number(state.scale)||1)+.1);if(action==="font-down")state.scale=Math.max(.9,(Number(state.scale)||1)-.1);if(action==="contrast")state.contrast=state.contrast==="high"?"normal":"high";if(action==="theme")state.theme=state.theme==="dark"?"light":"dark";if(action==="motion")state.motion=state.motion==="reduced"?"normal":"reduced";apply(state);});});
  }
  window.EI_A11Y={read:read,apply:apply,bind:bind};
  apply(read());
})();
