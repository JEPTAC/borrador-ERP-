"use strict";
const {onDocumentCreated,onDocumentUpdated}=require("firebase-functions/v2/firestore");
const {onCall,HttpsError}=require("firebase-functions/v2/https");
const {onSchedule}=require("firebase-functions/v2/scheduler");
const admin=require("firebase-admin");
const crypto=require("node:crypto");
const {calculateAvailability,calculateNetRequirement,calculateBusinessMinutes}=require("./lib/erp-calculations");
const defaultBusinessCalendar=require("./config/business-calendar.co-2026.json");
admin.initializeApp();
const db=admin.firestore();
const FieldValue=admin.firestore.FieldValue;
const privileged=new Set(["super_admin","super_administrador","admin","administrador","gerencia","gerente","manager"]);
const planningRoles=new Set([...privileged,"jefe_logistica","jefe_logistico","jefe_de_logistica","coordinador_logistico","coordinador_logistica","lider_logistico","lider_logistica","proyectos"]);
const inventoryRoles=new Set([...planningRoles,"lider_recepcion","lider_de_recepcion","logistica","despacho","aux_logistica","auxiliar_logistica","auxiliar_de_logistica","aux_logistico","auxiliar_despacho","ventas","asesor_ventas","asesor"]);
function normalizeRole(value){return String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim().toLowerCase().replace(/[\s/-]+/g,"_");}
function roleOf(request){return normalizeRole(request.auth?.token?.role||request.auth?.token?.rol||"");}
function requireAuth(request){if(!request.auth)throw new HttpsError("unauthenticated","Autenticación requerida.");}
async function authContext(request){
 requireAuth(request);
 let profile=null;
 try{
  const byUid=await db.collection("users").doc(request.auth.uid).get();
  if(byUid.exists)profile=byUid.data();
  else if(request.auth.token.email){
   const byEmail=await db.collection("users").doc(request.auth.token.email).get();
   if(byEmail.exists)profile=byEmail.data();
   else{
    const byQuery=await db.collection("users").where("email","==",request.auth.token.email).limit(1).get();
    if(!byQuery.empty)profile=byQuery.docs[0].data();
   }
  }
 }catch(error){
  console.error("No fue posible validar el perfil operativo",error);
  throw new HttpsError("unavailable","No fue posible validar el perfil operativo.");
 }
 if(!profile)throw new HttpsError("permission-denied","El usuario no tiene un perfil operativo en Firestore.");
 if(profile.isActive===false)throw new HttpsError("permission-denied","Usuario inactivo.");
 const role=normalizeRole(profile.role||profile.rol||"");
 if(!role)throw new HttpsError("permission-denied","El perfil no tiene un rol configurado.");
 return {uid:request.auth.uid,email:request.auth.token.email||profile.email||"",role,profile};
}
async function requirePrivileged(request){const ctx=await authContext(request);if(!privileged.has(ctx.role))throw new HttpsError("permission-denied","Rol insuficiente.");return ctx;}
async function requireRoleSet(request,allowed){const ctx=await authContext(request);if(!allowed.has(ctx.role))throw new HttpsError("permission-denied","Rol insuficiente para esta operación.");return ctx;}
function clean(value){return JSON.parse(JSON.stringify(value??null));}
function sha(value){return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");}

async function businessCalendar(){
 try{const snap=await db.collection("system_config").doc("business_calendar").get();return snap.exists?{...defaultBusinessCalendar,...snap.data()}:defaultBusinessCalendar;}catch(error){console.warn("Calendario empresarial no disponible",error);return defaultBusinessCalendar;}
}
function timestampMillis(value,fallback){return value&&typeof value.toMillis==="function"?value.toMillis():Number(fallback||Date.now());}
function safeId(value){return String(value||crypto.randomUUID()).replace(/[^A-Za-z0-9_.-]/g,"_");}
function closedCase(value){return ["cerrado_conforme","cerrado_con_novedad","cancelado","anulado"].includes(String(value||"").toLowerCase());}

function balanceId(d){return [d.tenantId||"electroingenieria",d.companyCode||"EI",d.warehouseCode||"_",d.locationCode||"_",d.productCode||"_",d.lotCode||"_",d.serialCode||"_",d.stockStatus||"AVAILABLE"].map(x=>String(x).replace(/[^A-Za-z0-9_.-]/g,"_")).join("__");}
exports.applyInventoryMovement=onDocumentCreated("inventory_movements/{movementId}",async event=>{
 const movementRef=event.data.ref;
 try{
  await db.runTransaction(async tx=>{
   const movementSnap=await tx.get(movementRef);if(!movementSnap.exists)return;
   const movement=movementSnap.data();if(movement.postingStatus==="POSTED")return;
   const qty=Number(movement.quantity);
   if(!Number.isFinite(qty)||qty===0||!movement.productCode)throw Object.assign(new Error("Movimiento inválido"),{businessRule:true});
   const ref=db.collection("inventory_balances").doc(balanceId(movement));
   const snap=await tx.get(ref),before=snap.exists?Number(snap.data().quantity||0):0,after=before+qty;
   if(after<0)throw Object.assign(new Error("Inventario negativo no autorizado"),{businessRule:true});
   tx.set(ref,{tenantId:movement.tenantId||"electroingenieria",companyCode:movement.companyCode||"EI",warehouseCode:movement.warehouseCode||"",locationCode:movement.locationCode||"",productCode:movement.productCode,lotCode:movement.lotCode||"",serialCode:movement.serialCode||"",stockStatus:movement.stockStatus||"AVAILABLE",uom:movement.uom||"",quantity:after,lastMovementId:event.params.movementId,updatedAt:FieldValue.serverTimestamp()},{merge:true});
   tx.update(movementRef,{postingStatus:"POSTED",postedAt:FieldValue.serverTimestamp(),balanceBefore:before,balanceAfter:after});
   tx.set(db.collection("erp_domain_events").doc("INVENTORY__"+event.params.movementId),{tenantId:movement.tenantId||"electroingenieria",aggregateType:"INVENTORY",aggregateId:event.params.movementId,eventType:"INVENTORY_MOVEMENT_POSTED",occurredAt:FieldValue.serverTimestamp(),source:"FIRESTORE_TRIGGER",dataHash:sha(clean(movement)),payload:clean({productCode:movement.productCode,warehouseCode:movement.warehouseCode,locationCode:movement.locationCode,movementType:movement.movementType,quantity:qty,uom:movement.uom,balanceBefore:before,balanceAfter:after})},{merge:false});
  });
 }catch(error){
  if(error&&error.businessRule){await movementRef.set({postingStatus:"REJECTED",rejectionReason:String(error.message||error).slice(0,500),rejectedAt:FieldValue.serverTimestamp()},{merge:true});return;}
  throw error;
 }
});
exports.caseEventLedger=onDocumentUpdated("cases/{caseId}",async event=>{
 const before=event.data.before.data(),after=event.data.after.data(),prev=before.currentProcess||before.status||"",next=after.currentProcess||after.status||"",transitioned=prev!==next,eventKey=safeId(event.id),calendar=transitioned?await businessCalendar():null;
 const endMs=timestampMillis(after.updatedAt,Date.parse(event.time||"")||Date.now()),startValue=before.processStartedAt||before.statusStartedAt||before.updatedAt||before.createdAt,startMs=timestampMillis(startValue,endMs),elapsedMinutes=Math.max(0,Math.round((endMs-startMs)/60000)),businessMinutes=transitioned?calculateBusinessMinutes(startMs,endMs,calendar):null;
 const payload={tenantId:after.tenantId||"electroingenieria",aggregateType:"CASE",aggregateId:event.params.caseId,eventType:transitioned?"CASE_TRANSITION":"CASE_UPDATED",from:prev,to:next,actorUid:after.updatedBy||after.lastActorUid||"system",actorName:after.updatedByName||after.lastActorName||"Sistema",occurredAt:FieldValue.serverTimestamp(),source:"FIRESTORE_TRIGGER",cloudEventId:event.id,dataHash:sha(clean(after)),before:clean({status:before.status,currentProcess:before.currentProcess}),after:clean({status:after.status,currentProcess:after.currentProcess}),timing:transitioned?{elapsedMinutes,businessMinutes}:null};
 const batch=db.batch();batch.set(db.collection("erp_domain_events").doc("CASE__"+eventKey),payload,{merge:false});
 if(transitioned){batch.set(db.collection("case_process_intervals").doc(event.params.caseId+"__"+eventKey),{tenantId:after.tenantId||"electroingenieria",caseId:event.params.caseId,reference:after.reference||after.orderNumber||event.params.caseId,process:prev,nextProcess:next,startedAt:startValue||admin.firestore.Timestamp.fromMillis(startMs),endedAt:after.updatedAt||admin.firestore.Timestamp.fromMillis(endMs),elapsedMinutes,businessMinutes,actorUid:payload.actorUid,actorName:payload.actorName,excludedFromKpis:closedCase(after.status)&&["cancelado","anulado"].includes(String(after.status||"").toLowerCase()),cloudEventId:event.id,createdAt:FieldValue.serverTimestamp()},{merge:false});batch.set(db.collection("erp_sla_alerts").doc(event.params.caseId+"__"+safeId(prev)),{caseId:event.params.caseId,currentProcess:prev,status:"CLOSED",closedAt:FieldValue.serverTimestamp(),closedByTransition:event.id},{merge:true});}
 await batch.commit();
});

async function inventoryAvailability(productCode,warehouseCode,transaction){
 const balancesQuery=db.collection("inventory_balances").where("productCode","==",productCode).where("warehouseCode","==",warehouseCode);
 const reservationsQuery=db.collection("inventory_reservations").where("productCode","==",productCode).where("warehouseCode","==",warehouseCode);
 let balances,reservations;if(transaction){balances=await transaction.get(balancesQuery);reservations=await transaction.get(reservationsQuery);}else{[balances,reservations]=await Promise.all([balancesQuery.get(),reservationsQuery.get()]);}
 return calculateAvailability(balances.docs.map(d=>d.data()),reservations.docs.map(d=>d.data()));
}
exports.createInventoryReservation=onCall({enforceAppCheck:true},async request=>{
 const ctx=await requireRoleSet(request,inventoryRoles),data=request.data||{},productCode=String(data.productCode||"").trim(),warehouseCode=String(data.warehouseCode||"").trim(),caseId=String(data.caseId||"").trim(),quantity=Number(data.quantity);
 if(!productCode||!warehouseCode||!caseId||!Number.isFinite(quantity)||quantity<=0)throw new HttpsError("invalid-argument","Referencia, bodega, pedido y cantidad positiva son obligatorios.");
 const id=String(data.idempotencyKey||sha({productCode,warehouseCode,caseId,quantity,uid:ctx.uid})),ref=db.collection("inventory_reservations").doc(id);let result={};
 await db.runTransaction(async tx=>{const existing=await tx.get(ref);if(existing.exists){result={id,duplicate:true,availableAfter:existing.data().availableAfter};return;}const availability=await inventoryAvailability(productCode,warehouseCode,tx);if(quantity>availability.available)throw new HttpsError("failed-precondition","Inventario insuficiente. Disponible: "+availability.available);const availableAfter=availability.available-quantity;tx.create(ref,{tenantId:data.tenantId||"electroingenieria",companyCode:data.companyCode||"EI",siteCode:data.siteCode||"TULUA",productCode,warehouseCode,quantity,consumedQuantity:0,caseId,status:"ACTIVE",expiresAtText:String(data.expiresAtText||""),availableAtCreation:availability.available,availableAfter,createdAt:FieldValue.serverTimestamp(),createdBy:ctx.uid,createdByName:ctx.profile.name||ctx.email});tx.set(db.collection("erp_domain_events").doc("RESERVATION__"+id),{tenantId:data.tenantId||"electroingenieria",aggregateType:"INVENTORY_RESERVATION",aggregateId:id,eventType:"INVENTORY_RESERVED",occurredAt:FieldValue.serverTimestamp(),source:"CALLABLE",actorUid:ctx.uid,payload:{productCode,warehouseCode,caseId,quantity,availableAfter}},{merge:false});result={id,duplicate:false,availableAfter};});
 return {...result,ok:true,message:result.duplicate?"La reserva ya existía.":"Reserva creada. Disponible restante: "+result.availableAfter};
});
exports.runAtpCheck=onCall({enforceAppCheck:true},async request=>{
 const ctx=await authContext(request),data=request.data||{},productCode=String(data.productCode||"").trim(),warehouseCode=String(data.warehouseCode||settingsDefaultWarehouse(data)||"").trim(),quantity=Number(data.quantity);
 if(!productCode||!warehouseCode||!Number.isFinite(quantity)||quantity<=0)throw new HttpsError("invalid-argument","Referencia, bodega y cantidad positiva son obligatorios.");
 const availability=await inventoryAvailability(productCode,warehouseCode),confirmedQty=Math.max(0,Math.min(quantity,availability.available)),status=confirmedQty>=quantity?"CONFIRMED":confirmedQty>0?"PARTIAL":"UNAVAILABLE",id=String(data.idempotencyKey||sha({productCode,warehouseCode,quantity,caseId:data.caseId||"",requestedDateText:data.requestedDateText||"",uid:ctx.uid}));
 await db.collection("planning_atp_checks").doc(id).set({tenantId:data.tenantId||"electroingenieria",companyCode:data.companyCode||"EI",siteCode:data.siteCode||"TULUA",productCode,warehouseCode,requestedQty:quantity,confirmedQty,shortageQty:Math.max(0,quantity-confirmedQty),onHandQty:availability.onHand,reservedQty:availability.reserved,availableQty:availability.available,caseId:String(data.caseId||""),requestedDateText:String(data.requestedDateText||""),status,createdAt:FieldValue.serverTimestamp(),createdBy:ctx.uid,createdByName:ctx.profile.name||ctx.email},{merge:false});
 return {ok:true,id,status,confirmedQty,shortageQty:Math.max(0,quantity-confirmedQty),message:"ATP "+status+": "+confirmedQty+" de "+quantity+" disponibles."};
});
function settingsDefaultWarehouse(data){return data.defaultWarehouseCode||"PRINCIPAL";}
function parseDemandDate(value){if(!value)return null;const ms=Date.parse(value);return Number.isFinite(ms)?ms:null;}
exports.runMrp=onCall({enforceAppCheck:true,timeoutSeconds:300,memory:"512MiB"},async request=>{
 const ctx=await requireRoleSet(request,planningRoles),data=request.data||{},horizonDays=Math.max(1,Math.min(365,Number(data.horizonDays||30))),warehouseFilter=String(data.warehouseCode||"").trim(),runId=String(data.idempotencyKey||crypto.randomUUID()),runRef=db.collection("planning_runs").doc(runId),nowMs=Date.now(),horizonMs=nowMs+horizonDays*86400000;
 await runRef.set({tenantId:data.tenantId||"electroingenieria",companyCode:data.companyCode||"EI",siteCode:data.siteCode||"TULUA",name:String(data.name||"MRP "+new Date().toISOString().slice(0,10)),horizonDays,warehouseCode:warehouseFilter,status:"RUNNING",startedAt:FieldValue.serverTimestamp(),createdAt:FieldValue.serverTimestamp(),createdBy:ctx.uid,createdByName:ctx.profile.name||ctx.email});
 try{
  const [demandsSnap,balancesSnap,reservationsSnap,policiesSnap]=await Promise.all([db.collection("planning_demand").limit(3000).get(),db.collection("inventory_balances").limit(5000).get(),db.collection("inventory_reservations").limit(3000).get(),db.collection("planning_replenishment").limit(3000).get()]);
  const key=(p,w)=>String(p||"")+"__"+String(w||"PRINCIPAL"),demand=new Map(),onHand=new Map(),reserved=new Map(),policy=new Map();
  demandsSnap.docs.forEach(doc=>{const v=doc.data(),date=parseDemandDate(v.demandDate||v.demandDateText);if(date&&(date<nowMs||date>horizonMs))return;const w=v.warehouseCode||warehouseFilter||"PRINCIPAL";if(warehouseFilter&&w!==warehouseFilter)return;const k=key(v.productCode,w);demand.set(k,(demand.get(k)||0)+Number(v.quantity||0));});
  balancesSnap.docs.forEach(doc=>{const v=doc.data(),w=v.warehouseCode||"PRINCIPAL";if(warehouseFilter&&w!==warehouseFilter||String(v.stockStatus||"AVAILABLE")!=="AVAILABLE")return;const k=key(v.productCode,w);onHand.set(k,(onHand.get(k)||0)+Number(v.quantity||0));});
  reservationsSnap.docs.forEach(doc=>{const v=doc.data(),w=v.warehouseCode||"PRINCIPAL";if(warehouseFilter&&w!==warehouseFilter||!["ACTIVE","PARTIAL"].includes(String(v.status||"")))return;const k=key(v.productCode,w);reserved.set(k,(reserved.get(k)||0)+Math.max(0,Number(v.quantity||0)-Number(v.consumedQuantity||0)));});
  policiesSnap.docs.forEach(doc=>{const v=doc.data(),w=v.warehouseCode||"PRINCIPAL";if(warehouseFilter&&w!==warehouseFilter)return;policy.set(key(v.productCode,w),v);});
  const keys=new Set([...demand.keys(),...policy.keys()]),proposals=[];
  keys.forEach(k=>{const [productCode,warehouseCode]=k.split("__"),grossDemand=demand.get(k)||0,stock=onHand.get(k)||0,committed=reserved.get(k)||0,p=policy.get(k)||{},safetyStock=Number(p.minQty||0),calc=calculateNetRequirement({grossDemand,onHand:stock,reserved:committed,safetyStock,maxQty:p.maxQty,reorderPoint:p.reorderPoint||p.minQty}),available=calc.available,netRequirement=calc.netRequirement,proposedQty=calc.proposedQty;if(proposedQty>0)proposals.push({runId,productCode,warehouseCode,grossDemand,onHandQty:stock,reservedQty:committed,availableQty:available,safetyStock,netRequirement,proposedQty,proposalType:"PURCHASE_OR_TRANSFER",status:"PROPOSED"});});
  for(let i=0;i<proposals.length;i+=400){const batch=db.batch();proposals.slice(i,i+400).forEach((v,j)=>{const ref=db.collection("planning_proposals").doc(runId+"__"+String(i+j).padStart(5,"0"));batch.set(ref,{...v,tenantId:data.tenantId||"electroingenieria",companyCode:data.companyCode||"EI",createdAt:FieldValue.serverTimestamp(),createdBy:ctx.uid});});await batch.commit();}
  await runRef.update({status:"COMPLETED",completedAt:FieldValue.serverTimestamp(),proposalCount:proposals.length,sourceCounts:{demands:demandsSnap.size,balances:balancesSnap.size,reservations:reservationsSnap.size,policies:policiesSnap.size}});
  await db.collection("erp_domain_events").doc("MRP__"+runId).set({tenantId:data.tenantId||"electroingenieria",aggregateType:"MRP_RUN",aggregateId:runId,eventType:"MRP_COMPLETED",occurredAt:FieldValue.serverTimestamp(),source:"CALLABLE",actorUid:ctx.uid,payload:{horizonDays,warehouseCode:warehouseFilter,proposalCount:proposals.length}});
  return {ok:true,id:runId,proposalCount:proposals.length,message:"MRP completado: "+proposals.length+" propuestas generadas."};
 }catch(error){await runRef.update({status:"FAILED",failedAt:FieldValue.serverTimestamp(),lastError:String(error.message||error).slice(0,1000)});throw error;}
});
exports.setUserClaims=onCall({enforceAppCheck:true},async request=>{await requirePrivileged(request);const {uid,role,companyCode,siteCodes}=request.data||{};if(!uid||!role)throw new HttpsError("invalid-argument","uid y role son obligatorios.");await admin.auth().setCustomUserClaims(uid,{role:String(role),companyCode:String(companyCode||"EI"),siteCodes:Array.isArray(siteCodes)?siteCodes.slice(0,20):[]});await db.collection("erp_access_events").add({action:"SET_CUSTOM_CLAIMS",resource:"users",resourceId:uid,details:{role,companyCode,siteCodes},createdAt:FieldValue.serverTimestamp(),createdBy:request.auth.uid});return {ok:true};});
exports.monitorCaseSla=onSchedule({schedule:"every 60 minutes",timeZone:"America/Bogota"},async()=>{
 const [calendar,configSnap]=await Promise.all([businessCalendar(),db.collection("system_config").doc("erp_sla").get()]),config=configSnap.exists?configSnap.data():{},defaultHours=Number(config.defaultBusinessHours||8.5),processHours=config.processHours||{},snap=await db.collection("cases").where("status","not-in",["cerrado_conforme","cerrado_con_novedad","cancelado","anulado"]).limit(500).get(),batch=db.batch(),now=Date.now();
 snap.docs.forEach(doc=>{const c=doc.data(),process=c.currentProcess||c.status||"unknown",start=c.processStartedAt||c.statusStartedAt||c.updatedAt||c.createdAt,startMs=timestampMillis(start,now),ageBusinessMinutes=calculateBusinessMinutes(startMs,now,calendar),limitHours=Number(processHours[process]||defaultHours);if(ageBusinessMinutes>limitHours*60){const ref=db.collection("erp_sla_alerts").doc(doc.id+"__"+safeId(process));batch.set(ref,{caseId:doc.id,reference:c.reference||doc.id,currentProcess:process,status:"OPEN",ageBusinessHours:Math.round(ageBusinessMinutes/6)/10,limitHours,detectedAt:FieldValue.serverTimestamp(),lastEvaluatedAt:FieldValue.serverTimestamp()},{merge:true});}});await batch.commit();
});


// EI ERP V5 · Gestión documental de solicitudes de crédito (S-FT-22 Versión 4)
const CREDIT_DOCUMENT_IDS=["doc_01","doc_02","doc_03","doc_04","doc_05","doc_06","doc_07","doc_08","doc_09","doc_10","doc_11","doc_12","doc_13","doc_14","doc_15"];
const creditAdminRoles=new Set(["super_admin","super_administrador","admin","administrador"]);
const creditReviewRoles=new Set([...creditAdminRoles,"cartera","jefe_cartera","analista_cartera","credito","creditos","analista_credito","coordinador_cartera"]);
const creditCreateRoles=new Set([...creditAdminRoles,"ventas","asesor_ventas","asesor","comercial","ejecutivo_comercial"]);
const creditReadAllRoles=new Set([...creditReviewRoles,"gerencia","gerente","manager","auditoria","auditor"]);
function text(value,max=500){return String(value||"").trim().slice(0,max);}
function creditActor(ctx){return text(ctx.profile?.name||ctx.profile?.displayName||ctx.email||"Usuario",160);}
function creditEvent(ref,eventType,ctx,details){return {requestId:ref.id,eventType,actorUid:ctx.uid,actorName:creditActor(ctx),actorRole:ctx.role||"usuario",details:clean(details||{}),createdAt:FieldValue.serverTimestamp()};}
function creditOwnerOrViewer(ctx,data){return data.createdBy===ctx.uid||creditReadAllRoles.has(ctx.role);}
function creditMaySubmit(ctx,data){return creditAdminRoles.has(ctx.role)||(data.createdBy===ctx.uid&&creditCreateRoles.has(ctx.role));}
function sanitizeReviewChecklist(value){const input=value&&typeof value==="object"?value:{};const out={};for(const id of CREDIT_DOCUMENT_IDS){const item=input[id]||{},state=String(item.state||"").toUpperCase();out[id]={state:["SI","NO","NA"].includes(state)?state:"",observation:text(item.observation,500)};}return out;}
exports.createCreditRequest=onCall({enforceAppCheck:false},async request=>{
 const ctx=await requireRoleSet(request,creditCreateRoles),data=request.data||{},ref=db.collection("credit_requests").doc(),now=new Date(),requestCode=`CR-${now.getFullYear()}-${ref.id.slice(0,7).toUpperCase()}`;
 const payload={tenantId:text(data.tenantId||"electroingenieria",80),companyCode:text(data.companyCode||"EI",30),siteCode:text(data.siteCode||"TULUA",30),requestCode,formCode:"S-FT-22",formVersion:"4",formDate:"2026-07-15",businessName:text(data.businessName,220),contactName:text(data.contactName,180),mobile:text(data.mobile,40),businessAddress:text(data.businessAddress,300),phone:text(data.phone||data.landline,40),landline:text(data.phone||data.landline,40),nit:text(data.nit||data.taxId,60),taxId:text(data.nit||data.taxId,60),requestedLimit:Number(data.requestedLimit||0),requestedTermDays:Number(data.requestedTermDays||0),commercialNotes:text(data.commercialNotes||data.notes,1200),notes:text(data.commercialNotes||data.notes,1200),documents:{},documentCount:0,requiredDocumentCount:CREDIT_DOCUMENT_IDS.length,completeness:0,status:"DRAFT",createdAt:FieldValue.serverTimestamp(),createdBy:ctx.uid,createdByName:creditActor(ctx),updatedAt:FieldValue.serverTimestamp(),updatedBy:ctx.uid,updatedByName:creditActor(ctx)};
 if(!payload.businessName||!payload.contactName||!payload.mobile||!payload.businessAddress)throw new HttpsError("invalid-argument","Razón social, contacto, celular y dirección empresarial son obligatorios.");
 if(!Number.isFinite(payload.requestedLimit)||payload.requestedLimit<0||!Number.isFinite(payload.requestedTermDays)||payload.requestedTermDays<0)throw new HttpsError("invalid-argument","Cupo o plazo inválido.");
 const batch=db.batch();batch.set(ref,payload);batch.set(db.collection("credit_request_events").doc(),creditEvent(ref,"CREDIT_REQUEST_CREATED",ctx,{status:"DRAFT",requestCode}));await batch.commit();return {ok:true,id:ref.id,requestCode,status:"DRAFT"};
});
exports.submitCreditRequest=onCall({enforceAppCheck:false,timeoutSeconds:60},async request=>{
 const ctx=await authContext(request),id=text(request.data?.requestId,120);if(!id)throw new HttpsError("invalid-argument","requestId es obligatorio.");const ref=db.collection("credit_requests").doc(id),snap=await ref.get();if(!snap.exists)throw new HttpsError("not-found","Solicitud no encontrada.");const current=snap.data();if(!creditMaySubmit(ctx,current))throw new HttpsError("permission-denied","Solo Ventas puede enviar sus expedientes a Cartera.");if(!["DRAFT","RETURNED"].includes(current.status))throw new HttpsError("failed-precondition","La solicitud no está disponible para envío.");const documents=current.documents||{},missing=CREDIT_DOCUMENT_IDS.filter(docId=>!documents[docId]?.storagePath);if(missing.length)throw new HttpsError("failed-precondition",`Faltan ${missing.length} documentos obligatorios.`);
 const bucket=admin.storage().bucket(),expectedPrefix=`credit_requests/${current.tenantId||"electroingenieria"}/${id}/`;for(const docId of CREDIT_DOCUMENT_IDS){const item=documents[docId],path=String(item.storagePath||"");if(!path.startsWith(expectedPrefix+docId+"/"))throw new HttpsError("failed-precondition",`Ruta documental inválida para ${docId}.`);const [exists]=await bucket.file(path).exists();if(!exists)throw new HttpsError("failed-precondition",`El archivo de ${docId} no existe en almacenamiento.`);}
 await db.runTransaction(async tx=>{const fresh=await tx.get(ref);if(!fresh.exists)throw new HttpsError("not-found","Solicitud no encontrada.");const value=fresh.data();if(!["DRAFT","RETURNED"].includes(value.status))throw new HttpsError("aborted","La solicitud cambió de estado.");tx.update(ref,{status:"SUBMITTED",submittedAt:FieldValue.serverTimestamp(),submittedBy:ctx.uid,submittedByName:creditActor(ctx),documentCount:CREDIT_DOCUMENT_IDS.length,requiredDocumentCount:CREDIT_DOCUMENT_IDS.length,completeness:100,updatedAt:FieldValue.serverTimestamp(),updatedBy:ctx.uid,updatedByName:creditActor(ctx),decisionReason:FieldValue.delete()});tx.set(db.collection("credit_request_events").doc(),creditEvent(ref,"CREDIT_REQUEST_SUBMITTED",ctx,{from:value.status,to:"SUBMITTED",documents:CREDIT_DOCUMENT_IDS.length}));});return {ok:true,id,status:"SUBMITTED"};
});
exports.reviewCreditRequest=onCall({enforceAppCheck:false},async request=>{
 const ctx=await requireRoleSet(request,creditReviewRoles),id=text(request.data?.requestId,120),action=String(request.data?.action||"").toUpperCase(),reason=text(request.data?.reason,1200),checklist=sanitizeReviewChecklist(request.data?.reviewChecklist);if(!id||!["START_REVIEW","RETURN","REJECT","APPROVE"].includes(action))throw new HttpsError("invalid-argument","Solicitud o acción inválida.");if(["RETURN","REJECT"].includes(action)&&!reason)throw new HttpsError("invalid-argument","La decisión requiere un motivo.");if(action==="APPROVE"){const invalid=CREDIT_DOCUMENT_IDS.filter(k=>!["SI","NA"].includes(checklist[k].state));if(invalid.length)throw new HttpsError("failed-precondition","Todos los documentos deben validarse como Sí o N/A para aprobar.");}
 const ref=db.collection("credit_requests").doc(id);let next="";await db.runTransaction(async tx=>{const snap=await tx.get(ref);if(!snap.exists)throw new HttpsError("not-found","Solicitud no encontrada.");const current=snap.data();if(action==="START_REVIEW"&&current.status!=="SUBMITTED")throw new HttpsError("failed-precondition","Solo se puede iniciar una solicitud enviada.");if(action!=="START_REVIEW"&&!["SUBMITTED","IN_REVIEW"].includes(current.status))throw new HttpsError("failed-precondition","La solicitud no está pendiente de decisión.");next={START_REVIEW:"IN_REVIEW",RETURN:"RETURNED",REJECT:"REJECTED",APPROVE:"APPROVED"}[action];const patch={status:next,reviewChecklist:checklist,decisionReason:reason,reviewedBy:ctx.uid,reviewedByName:creditActor(ctx),updatedAt:FieldValue.serverTimestamp(),updatedBy:ctx.uid,updatedByName:creditActor(ctx)};if(action==="START_REVIEW")patch.reviewStartedAt=FieldValue.serverTimestamp();if(["RETURN","REJECT","APPROVE"].includes(action))patch.decidedAt=FieldValue.serverTimestamp();if(action==="APPROVE"){patch.approvedCreditLimit=Number(request.data?.approvedCreditLimit||current.requestedLimit||0);patch.approvedTermDays=Number(request.data?.approvedTermDays||current.requestedTermDays||0);}tx.update(ref,patch);tx.set(db.collection("credit_request_events").doc(),creditEvent(ref,"CREDIT_REQUEST_"+action,ctx,{from:current.status,to:next,reason,reviewChecklist:checklist}));});return {ok:true,id,status:next};
});
exports.getCreditDocumentUrl=onCall({enforceAppCheck:false},async request=>{
 const ctx=await authContext(request),id=text(request.data?.requestId,120),docId=text(request.data?.docId,30);if(!id||!CREDIT_DOCUMENT_IDS.includes(docId))throw new HttpsError("invalid-argument","Documento o solicitud inválida.");const snap=await db.collection("credit_requests").doc(id).get();if(!snap.exists)throw new HttpsError("not-found","Solicitud no encontrada.");const current=snap.data();if(!creditOwnerOrViewer(ctx,current))throw new HttpsError("permission-denied","No está autorizado para consultar este documento.");const item=current.documents?.[docId];if(!item?.storagePath)throw new HttpsError("not-found","Documento no cargado.");const expires=Date.now()+10*60*1000;const [url]=await admin.storage().bucket().file(item.storagePath).getSignedUrl({version:"v4",action:"read",expires});return {ok:true,url,expiresAt:new Date(expires).toISOString(),fileName:item.fileName||docId};
});
