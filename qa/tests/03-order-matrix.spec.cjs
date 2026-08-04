"use strict";

const { test, expect } = require("@playwright/test");
const config = require("../lib/config.cjs");
const erp = require("../lib/erp.cjs");
const journal = require("../lib/journal.cjs");
const admin = require("../lib/supabase-admin.cjs");

const dimensions = {
  orderKind: ["PVC", "PVN", "PVE", "PVP"],
  priorityMode: ["normal", "gerencia"],
  clientFinancialStatus: ["AL_DIA", "MORA"],
  requestedDelivery: ["cliente_punto", "cliente_recoge", "despacho_local", "despacho_nacional"],
  paymentCondition: ["CONTADO", "CREDITO", "MIXTO"]
};

function exhaustive() {
  const rows = [];
  for (const orderKind of dimensions.orderKind)
    for (const priorityMode of dimensions.priorityMode)
      for (const clientFinancialStatus of dimensions.clientFinancialStatus)
        for (const requestedDelivery of dimensions.requestedDelivery)
          for (const paymentCondition of dimensions.paymentCondition)
            rows.push({ orderKind, priorityMode, clientFinancialStatus, requestedDelivery, paymentCondition });
  return rows;
}

function smoke() {
  return [
    { orderKind: "PVC", priorityMode: "normal", clientFinancialStatus:"AL_DIA", requestedDelivery: "cliente_punto", paymentCondition: "CREDITO" },
    { orderKind: "PVN", priorityMode: "normal", clientFinancialStatus:"AL_DIA", requestedDelivery: "despacho_local", paymentCondition: "CONTADO" },
    { orderKind: "PVE", priorityMode: "normal", clientFinancialStatus:"AL_DIA", requestedDelivery: "despacho_nacional", paymentCondition: "MIXTO" },
    { orderKind: "PVP", priorityMode: "normal", clientFinancialStatus:"MORA", requestedDelivery: "cliente_recoge", paymentCondition: "CREDITO" },
    { orderKind: "PVC", priorityMode: "gerencia", clientFinancialStatus:"MORA", requestedDelivery: "despacho_nacional", paymentCondition: "MIXTO" },
    { orderKind: "PVE", priorityMode: "gerencia", clientFinancialStatus:"AL_DIA", requestedDelivery: "despacho_local", paymentCondition: "CREDITO" }
  ];
}

function pairwise() {
  const all = exhaustive();
  const dimensionsList = Object.keys(dimensions);
  const uncovered = new Set();
  for (let a = 0; a < dimensionsList.length; a += 1) {
    for (let b = a + 1; b < dimensionsList.length; b += 1) {
      for (const va of dimensions[dimensionsList[a]]) for (const vb of dimensions[dimensionsList[b]]) {
        uncovered.add(`${dimensionsList[a]}=${va}|${dimensionsList[b]}=${vb}`);
      }
    }
  }
  const selected = [];
  while (uncovered.size) {
    let best = null;
    let bestCovered = [];
    for (const row of all) {
      const covered = [];
      for (let a = 0; a < dimensionsList.length; a += 1) for (let b = a + 1; b < dimensionsList.length; b += 1) {
        const key = `${dimensionsList[a]}=${row[dimensionsList[a]]}|${dimensionsList[b]}=${row[dimensionsList[b]]}`;
        if (uncovered.has(key)) covered.push(key);
      }
      if (covered.length > bestCovered.length) { best = row; bestCovered = covered; }
    }
    if (!best) break;
    selected.push(best);
    bestCovered.forEach(key => uncovered.delete(key));
  }
  return selected;
}

function selectedMatrix() {
  let rows = config.mode === "exhaustive" ? exhaustive() : config.mode === "pairwise" ? pairwise() : smoke();
  if (config.maxCombinations > 0) rows = rows.slice(0, config.maxCombinations);
  return rows;
}

test.describe("Matriz combinatoria de creación de pedidos", () => {
  test("crea y verifica las combinaciones configuradas", async ({ page }, testInfo) => {
    const matrix = selectedMatrix();
    test.setTimeout(Math.max(15 * 60 * 1000, matrix.length * 45000));
    journal.installPageDiagnostics(page, { suite: "order-matrix", mode: config.mode });
    const account = config.requiredAccount(config.accounts, "sales", "admin");
    await erp.login(page, account);

    const failures = [];
    const prefix = `${config.qaPrefix}-${config.runId}`;
    journal.write("matrix_start", { mode: config.mode, combinations: matrix.length, exhaustiveTotal: exhaustive().length, prefix });

    for (let index = 0; index < matrix.length; index += 1) {
      const row = matrix[index];
      const deliveryCode = row.requestedDelivery.replace(/[^a-z]/gi, "").slice(0, 4).toUpperCase();
      const paymentCode = row.paymentCondition;
      const reference = `${prefix}-${String(index + 1).padStart(3, "0")}-${row.orderKind}-${row.priorityMode.slice(0, 3).toUpperCase()}-${row.clientFinancialStatus.slice(0,3)}-${deliveryCode}-${paymentCode}`.slice(0, 95);
      const combination = { ...row, reference };

      await test.step(`${index + 1}/${matrix.length} ${reference}`, async () => {
        try {
          await erp.createOrder(page, combination, index + 1);
          if (admin.enabled()) {
            let stored = null;
            for (let retry = 0; retry < 8 && !stored; retry += 1) {
              await page.waitForTimeout(500);
              stored = await admin.getCaseByReference(reference);
            }
            expect(stored, `No se encontró ${reference} en public.cases`).toBeTruthy();
            expect(stored.raw_data.orderKind || stored.raw_data.tipoPedido).toBe(row.orderKind);
            expect(stored.raw_data.requestedDelivery || "").toBe(row.requestedDelivery);
            expect(stored.raw_data.paymentCondition || "").toBe(row.paymentCondition);
            expect(stored.raw_data.clientFinancialStatus || "AL_DIA").toBe(row.clientFinancialStatus);
            journal.write("matrix_case_verified", {
              reference,
              status: stored.status,
              currentProcess: stored.current_process,
              assignedRole: stored.assigned_role,
              combination: row
            });
          }
        } catch (error) {
          const failure = { index: index + 1, reference, combination: row, error: error.message, url: page.url() };
          failures.push(failure);
          journal.write("matrix_case_failed", failure);
          await journal.evidence(page, testInfo, `matrix-${index + 1}-${reference}`, failure);
        }
      });
    }

    journal.write("matrix_finished", { combinations: matrix.length, failures: failures.length });
    if (config.cleanup) await admin.cleanup(prefix).catch(error => journal.write("cleanup_failed", { message: error.message }));
    expect(failures, JSON.stringify(failures, null, 2)).toEqual([]);
  });
});
