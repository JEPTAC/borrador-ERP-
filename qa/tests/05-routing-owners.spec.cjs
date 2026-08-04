"use strict";

const { test, expect } = require("@playwright/test");
const config = require("../lib/config.cjs");
const erp = require("../lib/erp.cjs");
const journal = require("../lib/journal.cjs");
const admin = require("../lib/supabase-admin.cjs");

async function waitStored(reference) {
  for (let retry = 0; retry < 12; retry += 1) {
    const stored = await admin.getCaseByReference(reference);
    if (stored) return stored;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  return null;
}

async function searchVisible(page, reference) {
  await erp.gotoModule(page, "inicio", "cases");
  const search = page.locator("#fSearch");
  if (await search.isVisible().catch(() => false)) {
    await search.fill(reference);
    await page.waitForTimeout(700);
  }
  return page.locator(".case-card", { hasText: reference }).count();
}

test.describe("Propietarios logísticos por tipo de entrega", () => {
  test("Duvan recibe rutas locales y Javier recibe ruta nacional", async ({ browser, page }, testInfo) => {
    test.setTimeout(12 * 60 * 1000);
    expect(admin.enabled(), "La prueba de enrutamiento requiere SUPABASE_SERVICE_ROLE_KEY").toBeTruthy();

    const creator = config.requiredAccount(config.accounts, "sales", "admin");
    const duvan = config.findAccount(config.accounts, "logistics_local");
    const javier = config.findAccount(config.accounts, "logistics_national");
    expect(duvan, "Falta la cuenta logistics_local de Duvan en ERP_TEST_ACCOUNTS_JSON").toBeTruthy();
    expect(javier, "Falta la cuenta logistics_national de Javier en ERP_TEST_ACCOUNTS_JSON").toBeTruthy();

    journal.installPageDiagnostics(page, { suite: "routing-owners", account: creator.key });
    await erp.login(page, creator);

    const prefix = `${config.qaPrefix}-ROUTE-${config.runId}`;
    const localRef = `${prefix}-LOCAL-PVN`;
    const nationalRef = `${prefix}-NACIONAL-PVN`;

    await erp.createOrder(page, {
      reference: localRef,
      orderKind: "PVN",
      priorityMode: "normal",
      requestedDelivery: "despacho_local",
      paymentCondition: "CREDITO",
      clientFinancialStatus: "AL_DIA"
    }, 1);
    await erp.createOrder(page, {
      reference: nationalRef,
      orderKind: "PVN",
      priorityMode: "normal",
      requestedDelivery: "despacho_nacional",
      paymentCondition: "CREDITO",
      clientFinancialStatus: "AL_DIA"
    }, 2);

    const localStored = await waitStored(localRef);
    const nationalStored = await waitStored(nationalRef);
    expect(localStored, "No se persistió el pedido local").toBeTruthy();
    expect(nationalStored, "No se persistió el pedido nacional").toBeTruthy();
    expect(String(localStored.assigned_email || "").toLowerCase()).toBe("d.diaz@ei.com.co");
    expect(String(nationalStored.assigned_email || "").toLowerCase()).toBe("j.laverde@ei.com.co");
    expect(localStored.raw_data.deliveryRouteOwner).toBe("local_delivery");
    expect(nationalStored.raw_data.deliveryRouteOwner).toBe("national_delivery");

    const localContext = await browser.newContext();
    const localPage = await localContext.newPage();
    journal.installPageDiagnostics(localPage, { suite: "routing-local", account: duvan.key });
    await erp.login(localPage, duvan);
    expect(await searchVisible(localPage, localRef), "Duvan no ve el pedido local asignado").toBeGreaterThan(0);
    expect(await searchVisible(localPage, nationalRef), "Duvan no debe operar el pedido nacional").toBe(0);
    await journal.evidence(localPage, testInfo, "routing-duvan", { localRef, nationalRef });
    await localContext.close();

    const nationalContext = await browser.newContext();
    const nationalPage = await nationalContext.newPage();
    journal.installPageDiagnostics(nationalPage, { suite: "routing-national", account: javier.key });
    await erp.login(nationalPage, javier);
    expect(await searchVisible(nationalPage, nationalRef), "Javier no ve el pedido nacional asignado").toBeGreaterThan(0);
    expect(await searchVisible(nationalPage, localRef), "Javier no debe operar el pedido local").toBe(0);
    await journal.evidence(nationalPage, testInfo, "routing-javier", { localRef, nationalRef });
    await nationalContext.close();

    journal.write("routing_verified", {
      local: { reference: localRef, owner: localStored.assigned_email },
      national: { reference: nationalRef, owner: nationalStored.assigned_email }
    });
    if (config.cleanup) await admin.cleanup(prefix);
  });
});
