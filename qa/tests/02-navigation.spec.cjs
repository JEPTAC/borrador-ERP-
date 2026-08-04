"use strict";

const fs = require("fs");
const path = require("path");
const { test, expect } = require("@playwright/test");
const config = require("../lib/config.cjs");
const erp = require("../lib/erp.cjs");
const journal = require("../lib/journal.cjs");

const catalog = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "apps/trazabilidad/config/transactions.json"), "utf8"));
const actions = catalog.modules.flatMap(module => module.actions.map(action => ({ group: module.id, ...action })));

test.describe("Navegación y carga de transacciones", () => {
  test("abre todas las rutas publicadas sin error fatal", async ({ page }, testInfo) => {
    test.setTimeout(25 * 60 * 1000);
    journal.installPageDiagnostics(page, { suite: "navigation" });
    const account = config.requiredAccount(config.accounts, "admin", "management", "audit");
    await erp.login(page, account);

    const failures = [];
    for (const action of actions) {
      await test.step(`${action.module}/${action.route}`, async () => {
        try {
          await erp.gotoModule(page, action.module, action.route);
          await expect(page.locator("#app, #erpLayout, #eiVsmFrame").first()).toBeVisible();
          const body = await page.locator("body").innerText();
          if (/No fue posible abrir|No fue posible iniciar|Supabase no conectó|Acceso no disponible/i.test(body)) {
            throw new Error(body.slice(0, 500));
          }
          journal.write("route_ok", { module: action.module, route: action.route, name: action.name });
        } catch (error) {
          failures.push({ module: action.module, route: action.route, name: action.name, error: error.message });
          journal.write("route_failed", failures[failures.length - 1]);
          await journal.evidence(page, testInfo, `route-${action.module}-${action.route}`, { error: error.message });
        }
      });
    }
    expect(failures, JSON.stringify(failures, null, 2)).toEqual([]);
  });

  test("@mobile shell principal responde en viewport móvil", async ({ page }, testInfo) => {
    journal.installPageDiagnostics(page, { suite: "navigation-mobile" });
    const account = config.requiredAccount(config.accounts, "admin", "sales");
    await erp.login(page, account);
    await page.goto(erp.url("apps/trazabilidad/ios/"), { waitUntil: "domcontentloaded" });
    await expect(page.locator("#novaShell")).toBeVisible();
    await expect(page.locator("#mobileHome")).toBeVisible();
    await journal.evidence(page, testInfo, "mobile-shell");
  });
});
