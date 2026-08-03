(function(){
  "use strict";
  var query=new URLSearchParams(location.search);
  var embedded=(query.get("embedded")==="1"||query.get("nova")==="1")&&window.top!==window.self;

  // El motor heredado no es una aplicación pública independiente. Toda apertura
  // directa vuelve al shell NOVA, que valida sesión, perfil y transacciones.
  if(!embedded){
    var marker="/engine/";
    var index=location.pathname.indexOf(marker);
    var root=index>=0?location.pathname.slice(0,index+1):"/";
    var moduleId=(document.body&&document.body.dataset.eiModule)||"home";
    location.replace(root+"apps/trazabilidad/#module="+encodeURIComponent(moduleId));
    return;
  }

  window.EI_EMBEDDED=true;
  window.EI_REQUESTED_ROUTE=query.get("route")||"";
  document.documentElement.classList.add("nova-embedded");

  function labelForField(field){
    var parent=field.closest&&field.closest("label");
    if(parent){
      var span=parent.querySelector("span");
      if(span&&span.textContent.trim())return span.textContent.trim();
      if(parent.textContent.trim())return parent.textContent.trim();
    }
    if(field.id){
      var escaped=(window.CSS&&CSS.escape)?CSS.escape(field.id):field.id.replace(/(["\\])/g,"\\$1");
      var explicit=document.querySelector('label[for="'+escaped+'"]');
      if(explicit&&explicit.textContent.trim())return explicit.textContent.trim();
    }
    return field.getAttribute("placeholder")||field.getAttribute("name")||"Campo";
  }

  function showValidationSummary(form,invalid){
    var old=form.querySelector(":scope > .nova-validation-summary");
    if(old)old.remove();
    if(!invalid.length)return;
    var box=document.createElement("div");
    box.className="nova-validation-summary";
    box.setAttribute("role","alert");
    box.innerHTML="<strong>Revise los campos obligatorios</strong><span>Faltan "+invalid.length+" dato(s): "+invalid.slice(0,5).map(labelForField).join(", ")+".</span>";
    form.insertBefore(box,form.firstChild);
    invalid[0].focus({preventScroll:true});
    invalid[0].scrollIntoView({behavior:"smooth",block:"center"});
  }

  function enhanceForm(form){
    if(form.dataset.novaEnhanced==="1")return;
    form.dataset.novaEnhanced="1";
    form.classList.add("nova-form-enhanced");
    form.querySelectorAll("input,select,textarea").forEach(function(field){
      if(!field.getAttribute("aria-label")&&!field.getAttribute("aria-labelledby"))field.setAttribute("aria-label",labelForField(field));
      if(field.required){
        field.setAttribute("aria-required","true");
        var label=field.closest("label");
        if(label)label.classList.add("nova-required-field");
      }
      if(field.tagName==="INPUT"&&field.type==="text"&&!field.autocomplete)field.autocomplete="off";
    });
    form.addEventListener("submit",function(event){
      var invalid=Array.from(form.querySelectorAll(":invalid")).filter(function(x){return !x.disabled&&x.offsetParent!==null;});
      if(invalid.length){
        event.preventDefault();
        event.stopImmediatePropagation();
        showValidationSummary(form,invalid);
      }else{
        var old=form.querySelector(":scope > .nova-validation-summary");
        if(old)old.remove();
      }
    },true);
  }

  function enhanceFilters(filters){
    if(filters.dataset.novaFilters==="1")return;
    var fields=filters.querySelectorAll("input,select,textarea");
    if(!fields.length)return;
    filters.dataset.novaFilters="1";
    filters.classList.add("nova-filter-bar");
    if(!filters.querySelector("[data-nova-clear-filters]")){
      var clear=document.createElement("button");
      clear.type="button";
      clear.className="btn nova-clear-filters";
      clear.dataset.novaClearFilters="1";
      clear.textContent="Limpiar filtros";
      clear.addEventListener("click",function(){
        fields.forEach(function(field){
          if(field.tagName==="SELECT")field.selectedIndex=0;
          else if(field.type==="checkbox"||field.type==="radio")field.checked=false;
          else field.value="";
          field.dispatchEvent(new Event("input",{bubbles:true}));
          field.dispatchEvent(new Event("change",{bubbles:true}));
        });
      });
      filters.appendChild(clear);
    }
  }

  function compactActions(container){
    if(container.dataset.novaCompacted==="1")return;
    var items=Array.from(container.children).filter(function(el){return /^(BUTTON|A)$/.test(el.tagName);});
    if(items.length<=4)return;
    container.dataset.novaCompacted="1";
    var mustKeep=items.filter(function(el){return el.matches('[type="submit"],.btn-primary,.btn-success,.erp-btn:not(.secondary)');});
    var keep=[];
    items.forEach(function(el){if(keep.length<3&&(mustKeep.indexOf(el)>=0||keep.length<1))keep.push(el);});
    items.forEach(function(el){if(keep.length<3&&keep.indexOf(el)<0)keep.push(el);});
    var rest=items.filter(function(el){return keep.indexOf(el)<0;});
    if(!rest.length)return;
    var details=document.createElement("details");
    details.className="nova-more-actions";
    var summary=document.createElement("summary");
    summary.textContent="Más acciones";
    var panel=document.createElement("div");
    panel.className="nova-more-actions-panel";
    rest.forEach(function(el){panel.appendChild(el);});
    details.appendChild(summary);details.appendChild(panel);container.appendChild(details);
  }

  function enhanceTables(root){
    root.querySelectorAll("table").forEach(function(table){
      if(table.dataset.novaTable==="1")return;
      table.dataset.novaTable="1";
      table.setAttribute("role","table");
      if(!table.parentElement.classList.contains("nova-table-scroll")&&!table.parentElement.classList.contains("table-wrap")){
        var wrap=document.createElement("div");wrap.className="nova-table-scroll";table.parentNode.insertBefore(wrap,table);wrap.appendChild(table);
      }
    });
  }

  function enhance(root){
    root=root&&root.nodeType===1?root:document;
    root.querySelectorAll("form").forEach(enhanceForm);
    root.querySelectorAll(".filters,.erp-toolbar").forEach(enhanceFilters);
    root.querySelectorAll(".top-actions").forEach(compactActions);
    enhanceTables(root);
    root.querySelectorAll(".drawer,.modal,.erp-modal").forEach(function(modal){
      if(modal.dataset.novaFocus==="1")return;
      modal.dataset.novaFocus="1";
      setTimeout(function(){var focusable=modal.querySelector("input:not([disabled]),select:not([disabled]),textarea:not([disabled]),button:not([disabled])");if(focusable)focusable.focus({preventScroll:true});},60);
    });
  }

  function mark(){
    document.body.classList.add("nova-embedded");
    enhance(document);
    try{
      parent.postMessage({type:"EI_ENGINE_TITLE",title:document.title.replace(/\s*·\s*EI ERP.*$/i,"")},location.origin);
    }catch(e){}
  }

  if(document.body)mark();
  else document.addEventListener("DOMContentLoaded",mark,{once:true});

  var scheduled=false;
  var observer=new MutationObserver(function(){
    if(scheduled)return;
    scheduled=true;
    requestAnimationFrame(function(){scheduled=false;enhance(document);});
  });
  if(document.documentElement)observer.observe(document.documentElement,{subtree:true,childList:true});

  document.addEventListener("click",function(event){
    var link=event.target.closest&&event.target.closest("a[href]");
    if(!link)return;
    try{
      var url=new URL(link.href,location.href);
      if(url.origin===location.origin&&url.pathname.indexOf("/engine/modules/")>=0){
        url.searchParams.set("embedded","1");
        url.searchParams.set("nova","1");
        link.href=url.href;
      }
    }catch(e){}
  },true);
})();
