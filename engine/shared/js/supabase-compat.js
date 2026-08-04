(function(){
"use strict";
if(window.EI_SUPABASE_COMPAT){return;}
var CORE=window.EI_SUPABASE;
if(!CORE)throw new Error("EI_SUPABASE no está disponible.");

var COLLECTIONS={
  cases:{table:"cases",id:"case_id",raw:"raw_data"},
  case_events:{table:"case_events",id:"event_id",raw:"raw_data",time:"timestamp"},
  users:{table:"profiles",id:"firebase_uid",raw:"raw_profile"},
  evidences:{table:"evidences",id:"evidence_id",raw:"raw_data",time:"uploaded_at"},
  reportes_novedad:{table:"issue_reports",id:"report_id",raw:"raw_data",time:"created_at"},
  inventario_chipas:{table:"inventory_chipas",id:"chip_id",raw:"raw_data",time:"created_at"},
  users_deleted_log:{table:"deleted_users_log",id:"log_id",raw:"raw_data",time:"deleted_at"},
  erp_access_events:{table:"erp_access_events",id:"access_event_id",raw:"raw_data",time:"created_at"},
  credit_requests:{table:"credit_requests",id:"request_id",raw:"raw_data",time:"created_at"},
  credit_request_events:{table:"credit_request_events",id:"event_id",raw:"raw_data",time:"created_at"}
};
var SERVER_FIELD_MAP={
  cases:{id:"case_id",reference:"reference",orderNumber:"reference",orderKind:"order_kind",type:"case_type",client:"client",purchaseOrder:"purchase_order",paymentCondition:"payment_condition",deliveryType:"delivery_type",priority:"priority",status:"status",currentProcess:"current_process",procedureCode:"procedure_code",salesAdvisor:"sales_advisor",createdBy:"created_by_uid",createdByUid:"created_by_uid",createdByName:"created_by_name",createdByEmail:"created_by_email",assignedTo:"assigned_to",assignedUid:"assigned_uid",assignedName:"assigned_name",assignedEmail:"assigned_email",assignedRole:"assigned_role",requestedDelivery:"requested_delivery",hasCuts:"has_cuts",billingType:"billing_type",tipoPedido:"tipo_pedido",parentCaseId:"parent_case_id",isPartialShipment:"is_partial_shipment",hasPartialShipment:"has_partial_shipment",partialShipmentOpen:"partial_shipment_open",pendingDeliveryType:"pending_delivery_type",excludeFromKpi:"exclude_from_kpi",excludeFromVsm:"exclude_from_vsm",waitStartedAt:"wait_started_at",deadStartedAt:"dead_started_at",activeStartedAt:"active_started_at",createdAt:"created_at",updatedAt:"updated_at",closedAt:"closed_at",cancelledAt:"cancelled_at"},
  case_events:{id:"event_id",caseId:"case_id",caseReference:"case_reference",caseClient:"case_client",caseStatus:"case_status",type:"event_type",eventType:"event_type",detail:"detail",process:"process_code",processName:"process_name",currentProcess:"current_process",targetRole:"target_role",sourceRole:"source_role",createdBy:"created_by_uid",createdByName:"created_by_name",createdByRole:"created_by_role",userId:"user_id",userName:"user_name",assignedTo:"assigned_to",assignedRole:"assigned_role",timestamp:"timestamp",createdAt:"timestamp",cutId:"cut_id",reason:"reason"},
  users:{uid:"firebase_uid",id:"firebase_uid",email:"email",name:"display_name",displayName:"display_name",role:"role_code",rol:"role_code",isActive:"active",active:"active",createdAt:"profile_created_at",updatedAt:"profile_updated_at"},
  evidences:{id:"evidence_id",caseId:"case_id",caseNumber:"case_number",orderReference:"order_reference",client:"client",process:"process_code",processName:"process_name",evidenceType:"evidence_type",fileName:"file_name",mimeType:"mime_type",folder:"folder",driveId:"drive_id",driveUrl:"drive_url",cutId:"cut_id",detail:"detail",responsibleRole:"responsible_role",createdBy:"created_by_uid",createdByName:"created_by_name",uploadedAt:"uploaded_at",createdAt:"created_at"},
  reportes_novedad:{id:"report_id",sourceId:"source_id",sourceType:"source_type",sourceReference:"source_reference",sourceModule:"source_module",client:"case_client",caseClient:"case_client",title:"title",description:"description",detail:"detail",category:"category",severity:"severity",status:"status",process:"process_code",processName:"process_name",createdBy:"created_by_uid",createdByName:"created_by_name",createdByRole:"created_by_role",assignedRole:"assigned_role",salesAdvisor:"sales_advisor",managedBy:"managed_by_uid",managedByName:"managed_by_name",createdAt:"created_at",updatedAt:"updated_at"},
  inventario_chipas:{id:"chip_id",caseId:"case_id",caseReference:"case_reference",cutId:"cut_id",cutCode:"cut_code",reference:"reference",description:"description",unit:"unit",warehouse:"warehouse",availableBefore:"available_before",metersCut:"meters_cut",remaining:"remaining",status:"status",client:"client",purchaseOrder:"purchase_order",source:"source",registeredByName:"registered_by_name",createdByName:"created_by_name",createdAt:"created_at",updatedAt:"updated_at"},
  credit_requests:{id:"request_id",requestCode:"request_code",status:"status",createdBy:"created_by_uid",createdByName:"created_by_name",createdByEmail:"created_by_email",companyName:"company_name",contactName:"contact_name",contactPhone:"contact_phone",companyAddress:"company_address",landline:"landline",requestedAmount:"requested_amount",requestedTerm:"requested_term",documentCount:"document_count",completeness:"completeness",documents:"documents",reviewChecklist:"review_checklist",decisionReason:"decision_reason",createdAt:"created_at",updatedAt:"updated_at",submittedAt:"submitted_at",reviewStartedAt:"review_started_at",decidedAt:"decided_at",reviewedBy:"reviewed_by_uid",reviewedByName:"reviewed_by_name"},
  credit_request_events:{id:"event_id",requestId:"request_id",type:"event_type",detail:"detail",createdBy:"created_by_uid",createdByName:"created_by_name",createdByRole:"created_by_role",createdAt:"created_at"}
};

function client(){if(!CORE.state.client)throw new Error("Supabase no inicializó.");return CORE.state.client;}
function clone(value){if(value===undefined)return undefined;return JSON.parse(JSON.stringify(value));}
function snakeToCamel(key){return key.replace(/_([a-z])/g,function(_,c){return c.toUpperCase();});}
function maybeDate(value){if(!value||typeof value!=="string")return value;if(/^\d{4}-\d{2}-\d{2}T/.test(value)){var d=new Date(value);if(!isNaN(d.getTime()))return value;}return value;}
function mergeRow(collection,row){
  var meta=COLLECTIONS[collection]||{},raw=meta.raw&&row&&row[meta.raw]&&typeof row[meta.raw]==="object"?clone(row[meta.raw]):{};
  Object.keys(row||{}).forEach(function(k){
    if(k===meta.raw)return;
    var camel=snakeToCamel(k),value=maybeDate(row[k]);
    if(raw[camel]===undefined)raw[camel]=value;
  });
  var map=SERVER_FIELD_MAP[collection]||{};
  Object.keys(map).forEach(function(camel){var col=map[camel];if(row&&row[col]!==undefined&&row[col]!==null&&row[col]!=="")raw[camel]=maybeDate(row[col]);});
  var id=meta.id&&row?row[meta.id]:row&&row.document_id;
  if(id!==undefined)raw.id=id;
  if(collection==="users"){
    raw.uid=row.firebase_uid;raw.role=row.role_code;raw.rol=row.role_code;raw.name=row.display_name;raw.displayName=row.display_name;raw.isActive=row.active;raw.active=row.active;
  }
  return raw;
}
function valueAt(obj,path){return String(path||"").split(".").reduce(function(v,k){return v==null?undefined:v[k];},obj);}
function eqValue(a,b){if(a instanceof Date)a=a.toISOString();if(b instanceof Date)b=b.toISOString();return String(a==null?"":a)===String(b==null?"":b);}
function testFilter(data,f){var actual=valueAt(data,f.field),op=f.op,expected=f.value;
  if(op==="==")return eqValue(actual,expected);
  if(op==="!=")return !eqValue(actual,expected);
  if(op==="in")return Array.isArray(expected)&&expected.some(function(x){return eqValue(actual,x);});
  if(op==="not-in")return Array.isArray(expected)&&!expected.some(function(x){return eqValue(actual,x);});
  if(op==="array-contains")return Array.isArray(actual)&&actual.some(function(x){return eqValue(x,expected);});
  if(op==="array-contains-any")return Array.isArray(actual)&&Array.isArray(expected)&&actual.some(function(x){return expected.some(function(y){return eqValue(x,y);});});
  var aa=actual instanceof Date?actual.getTime():new Date(actual).getTime();var bb=expected instanceof Date?expected.getTime():new Date(expected).getTime();
  if(isNaN(aa)||isNaN(bb)){aa=Number(actual);bb=Number(expected);}
  if(op===">")return aa>bb;if(op===">=")return aa>=bb;if(op==="<")return aa<bb;if(op==="<=")return aa<=bb;
  return true;
}
function compare(a,b,field,direction){var av=valueAt(a,field),bv=valueAt(b,field);var ad=new Date(av).getTime(),bd=new Date(bv).getTime();if(!isNaN(ad)&&!isNaN(bd)){av=ad;bv=bd;}if(av===bv)return 0;var out=av>bv?1:-1;return direction==="desc"?-out:out;}
function DocumentSnapshot(ref,data,exists){this.ref=ref;this.id=ref.id;this.exists=!!exists;this._data=data;}
DocumentSnapshot.prototype.data=function(){return clone(this._data);};
function QuerySnapshot(docs){this.docs=docs;this.size=docs.length;this.empty=!docs.length;}
QuerySnapshot.prototype.forEach=function(callback,thisArg){this.docs.forEach(function(doc,index){callback.call(thisArg,doc,index,this);},this);};
QuerySnapshot.prototype.docChanges=function(){return this.docs.map(function(doc){return {type:"added",doc:doc,oldIndex:-1,newIndex:0};});};
function mapError(error){var e=error instanceof Error?error:new Error(error&&error.message||String(error));if(error&&error.code)e.code=error.code;return e;}

function serverColumn(collection,field){
  var meta=COLLECTIONS[collection]||{},map=SERVER_FIELD_MAP[collection]||{};
  if(field==="id")return meta.id||null;
  return map[field]||null;
}
function applyServerFilter(request,column,op,value){
  if(op==="==")return request.eq(column,value);
  if(op==="!=")return request.neq(column,value);
  if(op==="in"&&Array.isArray(value))return request.in(column,value);
  if(op===">")return request.gt(column,value);
  if(op===">=")return request.gte(column,value);
  if(op==="<")return request.lt(column,value);
  if(op==="<=")return request.lte(column,value);
  return request;
}
function fetchPages(build,max){var size=1000,rows=[];function next(from){return build(from,Math.min(from+size-1,max-1)).then(function(result){if(result.error)throw result.error;var batch=result.data||[];rows=rows.concat(batch);return batch.length===size&&rows.length<max?next(from+size):rows;});}return next(0);}
function queryRows(query){
  var collection=query.collectionName,meta=COLLECTIONS[collection],hardMax=collection==="case_events"?50000:20000,residual=[];
  if(!meta)return fetchPages(function(from,to){return client().from("erp_documents").select("*").eq("collection_name",collection).range(from,to);},hardMax).then(function(rows){return rows.map(function(row){return {row:row,data:Object.assign({id:row.document_id},clone(row.raw_data||{}))};});});
  var serverFilters=[];
  query.filters.forEach(function(f){var column=serverColumn(collection,f.field);if(column&&["==","!=","in",">",">=","<","<="].indexOf(f.op)>=0)serverFilters.push({column:column,op:f.op,value:f.value});else residual.push(f);});
  var max=query.max&&!residual.length?Math.min(Number(query.max),hardMax):hardMax;
  return fetchPages(function(from,to){
    var request=client().from(meta.table).select("*");
    serverFilters.forEach(function(f){request=applyServerFilter(request,f.column,f.op,f.value);});
    query.orders.forEach(function(o){var column=serverColumn(collection,o.field);if(column)request=request.order(column,{ascending:o.direction!=="desc"});});
    return request.range(from,to);
  },max).then(function(rows){return rows.map(function(row){return {row:row,data:mergeRow(collection,row)};});});
}
function QueryRef(collection,filters,orders,max){this.collectionName=collection;this.filters=filters||[];this.orders=orders||[];this.max=max||null;}
QueryRef.prototype.where=function(field,op,value){return new QueryRef(this.collectionName,this.filters.concat([{field:field,op:op,value:value}]),this.orders,this.max);};
QueryRef.prototype.orderBy=function(field,direction){return new QueryRef(this.collectionName,this.filters,this.orders.concat([{field:field,direction:direction||"asc"}]),this.max);};
QueryRef.prototype.limit=function(max){return new QueryRef(this.collectionName,this.filters,this.orders,max);};
QueryRef.prototype.get=function(){var self=this;return queryRows(self).then(function(rows){var filtered=rows.filter(function(item){return self.filters.every(function(f){return testFilter(item.data,f);});});self.orders.slice().reverse().forEach(function(order){filtered.sort(function(a,b){return compare(a.data,b.data,order.field,order.direction);});});if(self.max)filtered=filtered.slice(0,self.max);return new QuerySnapshot(filtered.map(function(item){return new DocumentSnapshot(new DocumentRef(self.collectionName,item.data.id),item.data,true);}));});};
QueryRef.prototype.onSnapshot=function(next,error){var self=this,closed=false,timer=null,channel=null,last="";
  function deliver(){return self.get().then(function(snapshot){var signature=JSON.stringify(snapshot.docs.map(function(d){var x=d.data();return [d.id,x.updatedAt||x.timestamp||x.createdAt||""];}));if(signature!==last){last=signature;if(!closed)next(snapshot);}}).catch(function(e){if(!closed&&error)error(mapError(e));});}
  deliver();
  var meta=COLLECTIONS[self.collectionName];
  try{if(meta){channel=client().channel("erp-"+self.collectionName+"-"+Math.random().toString(36).slice(2)).on("postgres_changes",{event:"*",schema:"public",table:meta.table},function(){clearTimeout(timer);timer=setTimeout(deliver,180);}).subscribe();}else{channel=client().channel("erp-docs-"+Math.random().toString(36).slice(2)).on("postgres_changes",{event:"*",schema:"public",table:"erp_documents",filter:"collection_name=eq."+self.collectionName},function(){clearTimeout(timer);timer=setTimeout(deliver,180);}).subscribe();}}catch(e){timer=setInterval(deliver,15000);}
  return function(){closed=true;clearTimeout(timer);if(channel)client().removeChannel(channel);};
};

function DocumentRef(collection,id){this.collectionName=collection;this.id=String(id);}
DocumentRef.prototype.get=function(){var self=this,meta=COLLECTIONS[self.collectionName];
  if(self.collectionName==="users"){
    var profiles=client().from("profiles").select("*");
    var first=profiles.eq("firebase_uid",self.id).maybeSingle();
    return first.then(function(result){
      if(result.error)throw result.error;
      if(result.data)return new DocumentSnapshot(new DocumentRef("users",result.data.firebase_uid),mergeRow("users",result.data),true);
      var second=client().from("profiles").select("*").eq("auth_user_id",self.id).maybeSingle();
      return second;
    }).then(function(result){
      if(result instanceof DocumentSnapshot)return result;
      if(result.error)throw result.error;
      if(result.data)return new DocumentSnapshot(new DocumentRef("users",result.data.firebase_uid),mergeRow("users",result.data),true);
      if(self.id.indexOf("@")>=0)return client().from("profiles").select("*").ilike("email",self.id).maybeSingle().then(function(x){if(x.error)throw x.error;return x.data?new DocumentSnapshot(new DocumentRef("users",x.data.firebase_uid),mergeRow("users",x.data),true):new DocumentSnapshot(self,null,false);});
      return new DocumentSnapshot(self,null,false);
    });
  }
  var request=meta?client().from(meta.table).select("*").eq(meta.id,self.id).maybeSingle():client().from("erp_documents").select("*").eq("collection_name",self.collectionName).eq("document_id",self.id).maybeSingle();
  return request.then(function(result){if(result.error)throw result.error;if(!result.data)return new DocumentSnapshot(self,null,false);var data=meta?mergeRow(self.collectionName,result.data):Object.assign({id:result.data.document_id},clone(result.data.raw_data||{}));return new DocumentSnapshot(self,data,true);});
};
DocumentRef.prototype.set=function(data,options){return writeOperation({type:"set",collection:this.collectionName,id:this.id,data:clone(data||{}),merge:!!(options&&options.merge)});};
DocumentRef.prototype.update=function(data){return writeOperation({type:"update",collection:this.collectionName,id:this.id,data:clone(data||{}),merge:true});};
DocumentRef.prototype.delete=function(){return writeOperation({type:"delete",collection:this.collectionName,id:this.id});};

function CollectionRef(name){QueryRef.call(this,name,[],[],null);this.id=name;}
CollectionRef.prototype=Object.create(QueryRef.prototype);CollectionRef.prototype.constructor=CollectionRef;
CollectionRef.prototype.doc=function(id){return new DocumentRef(this.collectionName,id||randomId("DOC"));};
CollectionRef.prototype.add=function(data){var ref=this.doc(randomId("DOC"));return ref.set(data,{merge:false}).then(function(){return ref;});};
function randomId(prefix){try{return (prefix||"ID")+"_"+crypto.randomUUID();}catch(e){return (prefix||"ID")+"_"+Date.now()+"_"+Math.random().toString(36).slice(2);}}

function writeOperation(op){return client().rpc("erp_apply_operations",{p_operations:[op]}).then(function(result){if(result.error)throw result.error;return result.data;});}
function Transaction(){this.operations=[];}
Transaction.prototype.get=function(ref){return ref.get();};
Transaction.prototype.set=function(ref,data,options){this.operations.push({type:"set",collection:ref.collectionName,id:ref.id,data:clone(data||{}),merge:!!(options&&options.merge)});return this;};
Transaction.prototype.update=function(ref,data){this.operations.push({type:"update",collection:ref.collectionName,id:ref.id,data:clone(data||{}),merge:true});return this;};
Transaction.prototype.delete=function(ref){this.operations.push({type:"delete",collection:ref.collectionName,id:ref.id});return this;};
function Batch(){Transaction.call(this);}Batch.prototype=Object.create(Transaction.prototype);Batch.prototype.constructor=Batch;Batch.prototype.commit=function(){var ops=this.operations.slice();return client().rpc("erp_apply_operations",{p_operations:ops}).then(function(result){if(result.error)throw result.error;return result.data;});};
function CompatDB(){}
CompatDB.prototype.collection=function(name){return new CollectionRef(name);};
CompatDB.prototype.runTransaction=function(handler){var tx=new Transaction();return Promise.resolve(handler(tx)).then(function(result){if(!tx.operations.length)return result;return client().rpc("erp_apply_operations",{p_operations:tx.operations}).then(function(response){if(response.error)throw response.error;return result;});});};
CompatDB.prototype.batch=function(){return new Batch();};
CompatDB.prototype.settings=function(){};
CompatDB.prototype.enablePersistence=function(){return Promise.resolve();};

function create(){return CORE.init().then(function(){return {db:new CompatDB(),auth:CORE.state.auth,client:CORE.state.client};});}
window.EI_SUPABASE_COMPAT={create:create,CompatDB:CompatDB,CollectionRef:CollectionRef,DocumentRef:DocumentRef,serverTimestamp:function(){return new Date().toISOString();},timestampNow:function(){return new Date().toISOString();},randomId:randomId};
})();
