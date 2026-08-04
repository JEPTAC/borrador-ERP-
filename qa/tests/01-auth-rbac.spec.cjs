"use strict";

const { test, expect } = require("@playwright/test");
const config = require("../lib/config.cjs");
const erp = require("../lib/erp.cjs");
const journal = require("../lib/journal.cjs");

const entries = Object.entries(config.accounts).filter(([, a]) => a && a.email && a.password);

test.describe("Autenticación y acceso por rol", () => {
  test.describe.configure({ mode: "serial" });

  test("existen cuentas configuradas", async () => {
    expect(entries.length, "Configure ERP_TEST_ACCOUNTS_JSON con al menos una cuenta").toBeGreaterThan(0);
  });

  for (const [key, account] of entries) {
    test(`login y portal: ${key}`, async ({ page }, testInfo) => {
      journal.installPageDiagnostics(page, { suite: "auth", account: key });
      await erp.login(page, { key, ...account });
      await expect(page.locator("body")).toContainText(/Aplicativos|Trazabilidad|EI ERP/i);
      await page.goto(erp.url("apps/trazabilidad/"), { waitUntil: "domcontentloaded" });
      await expect(page.locator("#novaShell")).toBeVisible();
      await expect(page.locator("[data-user-name]")).not.toHaveText("Usuario", { timeout: 20000 });
      await journal.evidence(page, testInfo, `auth-${key}`, { email: account.email, role: account.role || key });
      await erp.logout(page);
    });
  }
});
