"use strict";

const { test, expect } = require("@playwright/test");
const config = require("../lib/config.cjs");
const erp = require("../lib/erp.cjs");
const journal = require("../lib/journal.cjs");
const admin = require("../lib/supabase-admin.cjs");

const actionPriority = [
  "approve", "approveCartera", "boxHold", "pveGoodsOk", "accept",
  "receptionPdf", "assignAlistamiento", "alistChecklist", "alistFound",
  "planCuts", "alistToBilling", "delivery", "cashInvoice",
  "deliveryEvidence", "evidence", "close"
];
const ignored = new Set([
  "logout", "openMobileMenu", "closeMobileMenu", "open", "certificate", "notifyOn",
  "deleteCase", "deleteReceptionPedidoCase", "cancelOrder", "requestCancelOrder",
  "clearPwa", "forceRefreshCases", "forceProtectedRefresh", "forceStrictTraceCorrection",
  "forceReleaseSalesBlocks", "forceCajaPvcPveToCartera", "generalReport", "reportNonConformity"
]);

async function refreshCaseDetail(page, reference) {
  await erp.openCase(page, reference);
}

async function explore(page, reference, testInfo) {
  const history = [];
  let previousSignature = "";
  let stagnant = 0;

  for (let step = 1; step <= 30; step += 1) {
    const stored = admin.enabled() ? await admin.getCaseByReference(reference) : null;
    const state = stored ? {
      status: stored.status,
      currentProcess: stored.current_process,
      assignedRole: stored.assigned_role,
      closedAt: stored.raw_data && stored.raw_data.closedAt
    } : {};
    const signature = JSON.stringify(state);
    if (signature === previousSignature) stagnant += 1; else stagnant = 0;
    previousSignature = signature;

    const actions = (await erp.visibleActions(page)).filter(action => !ignored.has(action));
    const chosen = actionPriority.find(action => actions.includes(action)) || actions[0];
    const entry = { step, reference, state, actions, chosen: chosen || null, url: page.url() };
    history.push(entry);
    journal.write("flow_step", entry);

    if (state.closedAt || /^cerrado|cancelado/i.test(String(state.status || ""))) return { closed: true, history };
    if (!chosen) {
      await journal.evidence(page, testInfo, `flow-blocked-${reference}-${step}`, entry);
      return { closed: false, blocked: "No hay acción operativa visible", history };
    }
    if (stagnant >= 4) {
      await journal.evidence(page, testInfo, `flow-stagnant-${reference}-${step}`, entry);
      return { closed: false, blocked: "El estado no cambió después de varias acciones", history };
    }

    const result = await erp.clickAction(page, chosen, { waitMs: 1500 });
    if (!result.clicked) return { closed: false, blocked: `No se pudo pulsar ${chosen}`, history };

    await page.waitForTimeout(1000);
    if (!(await page.locator(".case-data-panel, .case-card-main").first().isVisible().catch(() => false))) {
      await refreshCaseDetail(page, reference).catch(error => journal.write("flow_reopen_failed", { reference, step, message: error.message }));
    }
  }
  return { closed: false, blocked: "Se alcanzó el máximo de 30 pasos", history };
}

test.describe("Explorador automático del flujo completo", () => {
  test("recorre pedidos QA y diagnostica el punto de bloqueo", async ({ page }, testInfo) => {
    test.setTimeout(45 * 60 * 1000);
    journal.installPageDiagnostics(page, { suite: "flow-explorer" });
    const account = config.requiredAccount(config.accounts, "admin");
    await erp.login(page, account);

    const prefix = `${config.qaPrefix}-FLOW-${config.runId}`;
    const scenarios = [
      { orderKind: "PVN", priorityMode: "normal", clientFinancialStatus: "AL_DIA", requestedDelivery: "despacho_local", paymentCondition: "CONTADO" },
      { orderKind: "PVE", priorityMode: "normal", clientFinancialStatus: "AL_DIA", requestedDelivery: "despacho_nacional", paymentCondition: "MIXTO" },
      { orderKind: "PVC", priorityMode: "normal", clientFinancialStatus: "MORA", requestedDelivery: "cliente_punto", paymentCondition: "CREDITO" },
      { orderKind: "PVP", priorityMode: "priority", clientFinancialStatus: "MORA", requestedDelivery: "cliente_recoge", paymentCondition: "MIXTO" }
    ];

    const outcomes = [];
    for (let index = 0; index < scenarios.length; index += 1) {
      const reference = `${prefix}-${index + 1}-${scenarios[index].orderKind}`;
      await erp.createOrder(page, { ...scenarios[index], reference }, index + 1);
      await refreshCaseDetail(page, reference);
      const outcome = await explore(page, reference, testInfo);
      outcomes.push({ reference, ...outcome });
      journal.write("flow_outcome", { reference, closed: outcome.closed, blocked: outcome.blocked || null, steps: outcome.history.length });
    }

    await journal.evidence(page, testInfo, "flow-summary", { outcomes: outcomes.map(x => ({ reference: x.reference, closed: x.closed, blocked: x.blocked, steps: x.history.length })) });
    if (config.cleanup) await admin.cleanup(prefix).catch(error => journal.write("cleanup_failed", { message: error.message }));

    const blocked = outcomes.filter(outcome => !outcome.closed);
    expect(blocked, `El bot encontró flujos bloqueados:\n${JSON.stringify(blocked.map(x => ({ reference: x.reference, blocked: x.blocked, last: x.history.slice(-1)[0] })), null, 2)}`).toEqual([]);
  });
});
