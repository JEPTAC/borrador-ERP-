(function(){
  "use strict";
  function normalize(value){
    return String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim().toLowerCase().replace(/[\s/-]+/g,"_");
  }
  function escapeHtml(value){
    return String(value==null?"":value).replace(/[&<>"']/g,function(ch){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch];});
  }
  function debounce(fn,wait){var timer;return function(){var args=arguments,ctx=this;clearTimeout(timer);timer=setTimeout(function(){fn.apply(ctx,args);},wait||180);};}
  function qs(sel,root){return (root||document).querySelector(sel);}
  function qsa(sel,root){return Array.prototype.slice.call((root||document).querySelectorAll(sel));}
  function json(path){return fetch(path,{cache:"no-store"}).then(function(r){if(!r.ok)throw new Error("No fue posible cargar "+path);return r.json();});}
  function formatDate(value){if(!value)return "—";try{var d=value.toDate?value.toDate():new Date(value);return d.toLocaleString("es-CO",{dateStyle:"medium",timeStyle:"short"});}catch(e){return "—";}}
  function currentBase(){return document.documentElement.dataset.base||"./";}
  function icon(name){
    var paths={
      route:'<path d="M5 5h8a3 3 0 0 1 0 6H9a3 3 0 0 0 0 6h10"/><circle cx="5" cy="5" r="2"/><circle cx="19" cy="17" r="2"/>',
      home:'<path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M9 20v-6h6v6"/>',
      sales:'<path d="M4 5h16v14H4z"/><path d="M8 9h8M8 13h5"/>',
      credit:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h4"/>',
      purchase:'<path d="M3 5h2l2 11h10l2-8H6"/><circle cx="9" cy="20" r="1"/><circle cx="17" cy="20" r="1"/>',
      receive:'<path d="M4 8h16v12H4z"/><path d="m8 4 4 4 4-4M12 8v7"/>',
      operation:'<path d="M4 20h16M6 20V9l6-5 6 5v11"/><path d="M9 20v-6h6v6"/>',
      billing:'<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6M9 16h3"/>',
      finance:'<circle cx="12" cy="12" r="9"/><path d="M15 8.5c-.7-.9-1.7-1.5-3.2-1.5-1.7 0-3 .9-3 2.2 0 3.4 6.4 1.8 6.4 5.1 0 1.4-1.3 2.5-3.3 2.5-1.5 0-2.7-.5-3.6-1.6M12 5v14"/>',
      dispatch:'<path d="M3 7h11v10H3zM14 10h4l3 3v4h-7z"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>',
      project:'<path d="M4 5h16v15H4z"/><path d="M8 5V3h8v2M8 10h8M8 14h5"/>',
      control:'<path d="M4 4h16v16H4z"/><path d="m8 12 3 3 5-6"/>',
      analytics:'<path d="M4 19V9M10 19V5M16 19v-7M22 19H2"/>',
      inventory:'<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/>',
      planning:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
      quality:'<path d="M12 3 4 6v6c0 5 3.4 8 8 9 4.6-1 8-4 8-9V6z"/><path d="m8 12 3 3 5-6"/>',
      maintenance:'<path d="m14 6 4-3 3 3-3 4"/><path d="m13 7-9 9a2 2 0 0 0 3 3l9-9"/>',
      audit:'<path d="M5 3h14v18H5z"/><path d="M9 8h6M9 12h6M9 16h4"/>',
      admin:'<circle cx="12" cy="8" r="3"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/>',
      search:'<circle cx="11" cy="11" r="7"/><path d="m16 16 5 5"/>',
      chevron:'<path d="m9 18 6-6-6-6"/>',
      menu:'<path d="M4 7h16M4 12h16M4 17h16"/>',
      close:'<path d="m6 6 12 12M18 6 6 18"/>',
      arrow:'<path d="M5 12h14M13 6l6 6-6 6"/>',
      filter:'<path d="M4 5h16l-6 7v6l-4 2v-8z"/>',
      user:'<circle cx="12" cy="8" r="3"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/>',
      logout:'<path d="M10 5H5v14h5M14 8l4 4-4 4M18 12H9"/>',
      back:'<path d="m15 18-6-6 6-6"/>',
      check:'<path d="m5 12 4 4L19 6"/>',
      file:'<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h5"/>',
      alert:'<path d="M12 3 2 21h20z"/><path d="M12 9v5M12 18h.01"/>'
    };
    return '<svg class="ei-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">'+(paths[name]||paths.route)+'</svg>';
  }
  window.EI_UTIL={normalize:normalize,escape:escapeHtml,debounce:debounce,qs:qs,qsa:qsa,json:json,formatDate:formatDate,currentBase:currentBase,icon:icon};
})();
