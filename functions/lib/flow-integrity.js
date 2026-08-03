"use strict";

const contract = require("../config/flow-contract.json");

function normalize(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase().replace(/[\s/-]+/g, "_");
}
function orderTypeOf(item = {}) {
  const explicit = String(item.orderType || item.orderKind || item.tipoPedido || item.tipo_pedido || "").toUpperCase();
  const text = [explicit, item.reference, item.caseNumber, item.orderNumber, item.pveNumber, item.pvpNumber, item.pvcNumber, item.pvnNumber].join(" ").toUpperCase();
  for (const type of ["PVE", "PVP", "PVC", "PVN"]) if (explicit === type || new RegExp(`(^|[^A-Z0-9])${type}([^A-Z0-9]|$)`).test(text)) return type;
  return "NORMAL";
}
function isClosed(item = {}) {
  return contract.terminalStatuses.includes(normalize(item.status)) || Boolean(item.closedAt || item.cancelledAt);
}
function cutIsDone(row = {}) {
  const status = normalize(row.status || row.estadoCorte || row.cutStatus);
  if (["finalizado","terminado","completado","cerrado","cancelado","no_aplica","no_aplica_medida_completa","no_aplica_no_necesita_corte"].includes(status)) return true;
  if (row.registeredAt || row.completedAt || row.finishedAt) return /finaliz|terminad|complet|conforme|autorizad|registrad|cerrad/i.test(status) || Boolean(row.registeredAt);
  return false;
}
function pendingCuts(item = {}) {
  const rows = Array.isArray(item.cutRequests) ? item.cutRequests : [];
  return rows.filter(row => !cutIsDone(row)).length;
}
function validateTransition(item = {}, nextProcess, options = {}) {
  const current = normalize(item.currentProcess || item.process);
  const next = normalize(nextProcess);
  const errors = [];
  if (!current) errors.push("El pedido no tiene proceso actual.");
  if (!next) errors.push("El proceso destino es obligatorio.");
  if (isClosed(item)) errors.push("El pedido está cerrado o cancelado y no puede avanzar.");
  const definition = contract.processes[current];
  if (current && !definition) errors.push(`Proceso actual desconocido: ${current}.`);
  if (next && next !== "cierre_caso" && !contract.processes[next]) errors.push(`Proceso destino desconocido: ${next}.`);
  if (definition && !definition.next.includes(next) && !(options.allowControlledReturn && current === "corte_cable" && next === "alistamiento")) errors.push(`Transición no autorizada: ${current} → ${next}.`);
  const type = orderTypeOf(item);
  if (type === "PVE" && next === "recepcion_pedidos" && !(item.purchaseFlow && item.purchaseFlow.releasedAt) && item.purchaseReleased !== true && current !== "compras") errors.push("El PVE debe ser liberado por Compras antes de Recepción.");
  if (current === "alistamiento" && next === "facturacion" && pendingCuts(item) > 0) errors.push("Existen cortes pendientes; el pedido no puede pasar a Facturación.");
  return {ok: errors.length === 0, errors, current, next, orderType: type};
}
function deriveProcessStart(item = {}, process) {
  const key = normalize(process || item.currentProcess);
  const stats = item.processStats && item.processStats[key] || {};
  return stats.activeStartedAt || stats.waitStartedAt || stats.deadStartedAt || stats.startedAt || item.processStartedAt || item.statusStartedAt || item.updatedAt || item.createdAt || null;
}
function inspectCase(item = {}) {
  const issues = [];
  const process = normalize(item.currentProcess || item.process);
  const status = normalize(item.status);
  if (!item.id && !item.reference && !item.caseNumber) issues.push({code:"CASE_WITHOUT_IDENTITY",severity:"HIGH",message:"Pedido sin identificador operativo."});
  if (!process) issues.push({code:"MISSING_PROCESS",severity:"CRITICAL",message:"Pedido sin proceso actual."});
  else if (!contract.processes[process]) issues.push({code:"UNKNOWN_PROCESS",severity:"CRITICAL",message:`Proceso no reconocido: ${process}.`});
  if (isClosed(item) && !item.closedAt && !item.cancelledAt) issues.push({code:"CLOSED_WITHOUT_DATE",severity:"HIGH",message:"Estado terminal sin fecha de cierre."});
  if (contract.waitingStatuses.includes(status) && !(item.openRequirement || item.waitReason || item.waitStartedAt)) issues.push({code:"WAIT_WITHOUT_CONTEXT",severity:"HIGH",message:"Pedido en espera sin motivo, responsable o fecha de inicio."});
  if (contract.activeStatuses.includes(status) && !deriveProcessStart(item, process)) issues.push({code:"ACTIVE_WITHOUT_START",severity:"MEDIUM",message:"Proceso activo sin fecha de inicio medible."});
  if (orderTypeOf(item) === "PVE" && process === "recepcion_pedidos" && !(item.purchaseFlow && item.purchaseFlow.releasedAt) && item.purchaseReleased !== true) issues.push({code:"PVE_BYPASSED_PURCHASES",severity:"CRITICAL",message:"PVE en Recepción sin liberación de Compras."});
  const downstreamProcesses = ["facturacion","caja","cliente_punto","cliente_recoge","despacho_local","despacho_nacional","cierre_despacho_nacional","cierre_caso"];
  if (pendingCuts(item) > 0 && downstreamProcesses.includes(process)) issues.push({code:"CUTS_OUTSIDE_SUBFLOW",severity:"CRITICAL",message:"Pedido avanzó después de Alistamiento con cortes todavía pendientes."});
  if (process === "corte_cable" && pendingCuts(item) === 0) issues.push({code:"CUT_FINISHED_NOT_RETURNED",severity:"HIGH",message:"Cortes finalizados, pero el pedido no regresó a Alistamiento."});
  const assignedIds = Array.isArray(item.assignedUserIds) ? item.assignedUserIds.filter(Boolean) : [];
  if (!isClosed(item) && !item.assignedRole && !item.assignedTo && !item.assignedUid && assignedIds.length === 0) issues.push({code:"UNASSIGNED_OPEN_CASE",severity:"MEDIUM",message:"Pedido abierto sin responsable asignado."});
  if (!isClosed(item) && process === "cierre_caso") issues.push({code:"CLOSURE_PROCESS_NOT_CLOSED",severity:"HIGH",message:"El pedido llegó a cierre, pero conserva un estado no terminal."});
  if (isClosed(item) && item.openRequirement) issues.push({code:"CLOSED_WITH_OPEN_REQUIREMENT",severity:"HIGH",message:"Pedido cerrado con un requerimiento todavía abierto."});
  if (contract.waitingStatuses.includes(status) && item.activeStartedAt) issues.push({code:"WAIT_WITH_ACTIVE_TIMER",severity:"MEDIUM",message:"El pedido está en espera, pero conserva un cronómetro activo."});
  if (status === "en_proceso" && item.waitStartedAt) issues.push({code:"ACTIVE_WITH_WAIT_TIMER",severity:"MEDIUM",message:"El pedido está en proceso, pero conserva un cronómetro de espera abierto."});
  if (status === "asignado" && !item.deadStartedAt && !item.statusStartedAt) issues.push({code:"ASSIGNED_WITHOUT_QUEUE_START",severity:"LOW",message:"Pedido asignado sin marca de inicio de cola."});
  if (item.openRequirement && !contract.waitingStatuses.includes(status)) issues.push({code:"OPEN_REQUIREMENT_OUTSIDE_WAIT",severity:"MEDIUM",message:"Existe un requerimiento abierto, pero el pedido no está en un estado de espera."});
  if (process === "facturacion" && pendingCuts(item) > 0) issues.push({code:"BILLING_WITH_PENDING_CUTS",severity:"CRITICAL",message:"Pedido en Facturación con cortes pendientes."});
  const pendingLines = (Array.isArray(item.orderItems) ? item.orderItems : []).filter(line => !line.alistamientoStatus || /PENDIENTE|NOVEDAD|NO_ENCONTRADO/i.test(String(line.alistamientoStatus))).length;
  if (process === "facturacion" && pendingLines > 0) issues.push({code:"BILLING_WITH_PENDING_PICKING",severity:"HIGH",message:`Pedido en Facturación con ${pendingLines} línea(s) de alistamiento sin resolver.`});
  if (Number(item.flowRevision || 0) > 0 && !item.lastEventId) issues.push({code:"REVISION_WITHOUT_LAST_EVENT",severity:"LOW",message:"El pedido tiene revisiones de flujo, pero no identifica el último evento."});
  return issues;
}

const PROCESS_OWNER = {
  compras: {role:"compras", name:"Compras"},
  recepcion_pedidos: {role:"coordinador_logistico", name:"Logística / recepción"},
  alistamiento: {role:"aux_logistica", name:"Auxiliar logística"},
  corte_cable: {role:"auxiliar_corte", name:"Auxiliar de corte"},
  facturacion: {role:"facturacion", name:"Facturación"},
  caja: {role:"caja", name:"Caja"},
  cartera: {role:"cartera", name:"Cartera"},
  cliente_punto: {role:"coordinador_logistico", name:"Logística / despacho"},
  cliente_recoge: {role:"coordinador_logistico", name:"Logística / despacho"},
  despacho_local: {role:"coordinador_logistico", name:"Logística / despacho"},
  despacho_nacional: {role:"coordinador_logistico", name:"Logística / despacho"},
  cierre_despacho_nacional: {role:"coordinador_logistico", name:"Logística / despacho"},
  cierre_caso: {role:"coordinador_logistico", name:"Logística / despacho"},
};
function deterministicRepair(item = {}) {
  if (isClosed(item)) return {repairable:false, reasonCodes:[], patch:{}};
  const issues = inspectCase(item);
  const codes = new Set(issues.map(issue => issue.code));
  let targetProcess = "";
  const reasons = [];
  if (codes.has("PVE_BYPASSED_PURCHASES")) {
    targetProcess = "compras"; reasons.push("PVE_BYPASSED_PURCHASES");
  } else if (codes.has("BILLING_WITH_PENDING_CUTS") || codes.has("CUTS_OUTSIDE_SUBFLOW")) {
    targetProcess = "corte_cable";
    if (codes.has("BILLING_WITH_PENDING_CUTS")) reasons.push("BILLING_WITH_PENDING_CUTS");
    if (codes.has("CUTS_OUTSIDE_SUBFLOW")) reasons.push("CUTS_OUTSIDE_SUBFLOW");
  } else if (codes.has("BILLING_WITH_PENDING_PICKING")) {
    targetProcess = "alistamiento"; reasons.push("BILLING_WITH_PENDING_PICKING");
  } else if (codes.has("CUT_FINISHED_NOT_RETURNED")) {
    targetProcess = "alistamiento"; reasons.push("CUT_FINISHED_NOT_RETURNED");
  }
  const current = normalize(item.currentProcess || item.process);
  const owner = PROCESS_OWNER[targetProcess || current];
  const patch = {};
  if (targetProcess && targetProcess !== current) {
    patch.currentProcess = targetProcess;
    patch.status = "asignado";
    patch.assignedRole = owner ? owner.role : "";
    patch.assignedName = owner ? owner.name : "";
    patch.assignedTo = "";
    patch.assignedUid = "";
    patch.assignedEmail = "";
    patch.assignedUsers = [];
    patch.assignedUserIds = [];
    patch.activeStartedAt = null;
    patch.waitStartedAt = null;
    patch.openRequirement = null;
  } else if (codes.has("UNASSIGNED_OPEN_CASE") && owner) {
    patch.assignedRole = owner.role;
    patch.assignedName = owner.name;
    reasons.push("UNASSIGNED_OPEN_CASE");
  }
  if (codes.has("WAIT_WITH_ACTIVE_TIMER")) { patch.activeStartedAt = null; reasons.push("WAIT_WITH_ACTIVE_TIMER"); }
  if (codes.has("ACTIVE_WITH_WAIT_TIMER")) { patch.waitStartedAt = null; reasons.push("ACTIVE_WITH_WAIT_TIMER"); }
  return {repairable:Object.keys(patch).length > 0, reasonCodes:[...new Set(reasons)], patch};
}
module.exports = {contract, normalize, orderTypeOf, isClosed, cutIsDone, pendingCuts, validateTransition, deriveProcessStart, inspectCase, deterministicRepair, PROCESS_OWNER};
