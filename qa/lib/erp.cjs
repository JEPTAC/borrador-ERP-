"use strict";

const path = require("path");
const config = require("./config.cjs");
const { write } = require("./journal.cjs");

const fixtures = {
  png: path.resolve(process.cwd(), "qa/fixtures/qa-evidence.png"),
  csv: path.resolve(process.cwd(), "qa/fixtures/qa-order-lines.csv"),
  txt: path.resolve(process.cwd(), "qa/fixtures/qa-note.txt")
};

function url(relative = "") { return new URL(relative, config.baseURL).href; }

async function login(page, account) {
  write("login_start", { account: account.key || account.role || account.email, email: account.email });
  await page.goto(url("index.html"), { waitUntil: "domcontentloaded" });
  const change = page.locator("#changeAccount");
  if (await change.isVisible().catch(() => false)) await change.click();
  if (await page.locator("#continueSession").isVisible().catch(() => false)) {
    await page.locator("#continueSession").click();
  } else {
    await page.locator('#loginForm input[name="email"]').fill(account.email);
    await page.locator('#loginForm input[name="password"]').fill(account.password);
    await page.locator("#loginSubmit").click();
  }
  await page.waitForURL(/\/portal\//, { timeout: 30000 }).catch(async () => {
    const status = await page.locator("#authStatus").innerText().catch(() => "Sin mensaje");
    throw new Error(`No inició sesión ${account.email}: ${status}`);
  });
  write("login_ok", { email: account.email, url: page.url() });
}

async function logout(page) {
  await page.goto(url("index.html"), { waitUntil: "domcontentloaded" });
  const change = page.locator("#changeAccount");
  if (await change.isVisible().catch(() => false)) await change.click().catch(() => {});
  await page.context().clearCookies();
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); }).catch(() => {});
}

async function gotoModule(page, moduleName, route) {
  const target = url(`engine/modules/${moduleName}/?route=${encodeURIComponent(route)}`);
  await page.goto(target, { waitUntil: "domcontentloaded" });
  await page.locator("#app").waitFor({ state: "visible", timeout: 30000 });
  await page.waitForFunction(() => {
    const text = document.body.innerText || "";
    return !/Cargando\s+(Ventas|Compras|Recepción|Operación|Facturación|Despachos|Inicio)/i.test(text) || document.querySelector(".app-layout, .erp-shell, #erpLayout");
  }, null, { timeout: 30000 }).catch(() => {});
  const fatal = await page.locator("text=/No fue posible abrir|Inicio bloqueado|No fue posible iniciar/i").first().isVisible().catch(() => false);
  if (fatal) throw new Error(`El módulo ${moduleName}/${route} mostró un error fatal.`);
  return target;
}

async function createOrder(page, combination, index = 0) {
  await gotoModule(page, "ventas", "create");
  const reference = combination.reference;
  await page.locator("#reference").fill(reference);
  await page.locator("#purchaseOrder").fill(`OC-${reference}`);
  await page.locator("#orderKind").selectOption(combination.orderKind);
  await page.locator("#client").fill(`CLIENTE AUTOMÁTICO ${index}`);
  await page.locator("#priorityMode").selectOption(combination.priorityMode);
  await page.locator('[name="priorityReason"]').fill(`Prueba automática ${combination.priorityMode} ${combination.clientFinancialStatus || "AL_DIA"}`);
  await page.locator('[name="clientFinancialStatus"]').selectOption(combination.clientFinancialStatus || "AL_DIA");
  await page.locator("#requestedDelivery").selectOption(combination.requestedDelivery);
  await page.locator("#paymentCondition").selectOption(combination.paymentCondition);
  await page.locator("#description").fill(`BOT QA ${config.runId}: ${JSON.stringify(combination)}`);
  if (combination.clientFinancialStatus === "MORA") {
    await page.locator("#retainedSupport").setInputFiles(fixtures.png);
  }
  await page.locator('#caseForm button[type="submit"]').click();
  await page.waitForFunction(ref => !document.querySelector("#caseForm") || (document.body.innerText || "").includes(ref), reference, { timeout: 30000 });
  write("order_created_ui", { reference, combination, url: page.url() });
  return reference;
}

async function openCase(page, reference, moduleName = "inicio", route = "cases") {
  await gotoModule(page, moduleName, route);
  const search = page.locator("#fSearch");
  if (await search.isVisible().catch(() => false)) {
    await search.fill(reference);
    await page.waitForTimeout(500);
  }
  const card = page.locator(".case-card", { hasText: reference }).first();
  await card.waitFor({ state: "visible", timeout: 30000 });
  await card.locator('[data-action="open"]').click();
  await page.waitForFunction(ref => (document.body.innerText || "").includes(ref) && !document.querySelector("#fSearch"), reference, { timeout: 20000 }).catch(() => {});
  write("case_opened", { reference, url: page.url() });
}

async function fillGenericForm(page, options = {}) {
  const form = page.locator("#drawer form:visible, form:visible").last();
  if (!(await form.isVisible().catch(() => false))) return false;

  const files = form.locator('input[type="file"]');
  for (let i = 0; i < await files.count(); i += 1) {
    const input = files.nth(i);
    const accept = String(await input.getAttribute("accept") || "").toLowerCase();
    const file = accept.includes("csv") ? fixtures.csv : fixtures.png;
    await input.setInputFiles(file).catch(async () => input.setInputFiles(fixtures.txt));
  }

  const texts = form.locator('input:not([type="file"]):not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), textarea');
  for (let i = 0; i < await texts.count(); i += 1) {
    const field = texts.nth(i);
    if (!(await field.isEnabled().catch(() => false))) continue;
    const current = await field.inputValue().catch(() => "");
    if (current) continue;
    const name = String(await field.getAttribute("name") || await field.getAttribute("id") || "campo");
    let value = `Prueba automática QA ${config.runId}`;
    if (/quantity|cantidad|metros|amount|monto|duration|remanente|rollMeters/i.test(name)) value = "10";
    if (/date|fecha/i.test(name)) value = new Date().toISOString().slice(0, 10);
    if (/time|hora/i.test(name)) value = "10:00";
    await field.fill(value).catch(() => {});
  }

  const selects = form.locator("select");
  for (let i = 0; i < await selects.count(); i += 1) {
    const select = selects.nth(i);
    if (!(await select.isEnabled().catch(() => false))) continue;
    const current = await select.inputValue().catch(() => "");
    if (current) continue;
    const optionsList = await select.locator("option:not([disabled])").evaluateAll(opts => opts.map(o => ({ value: o.value, text: o.textContent })).filter(o => o.value));
    if (optionsList.length) await select.selectOption(optionsList[0].value).catch(() => {});
  }

  const checks = form.locator('input[type="checkbox"]');
  for (let i = 0; i < await checks.count(); i += 1) await checks.nth(i).check().catch(() => {});

  const submit = form.locator('button[type="submit"]:visible, input[type="submit"]:visible').last();
  if (await submit.isVisible().catch(() => false)) {
    await submit.click();
    await page.waitForTimeout(options.waitMs || 1200);
    return true;
  }
  return false;
}

async function clickAction(page, action, extra = {}) {
  const button = page.locator(`[data-action="${action}"]:visible`).first();
  if (!(await button.isVisible().catch(() => false))) return { clicked: false, action };
  const before = await page.locator("body").innerText().catch(() => "");
  await button.click();
  await page.waitForTimeout(500);
  const submitted = await fillGenericForm(page, extra).catch(error => {
    write("form_fill_error", { action, message: error.message, url: page.url() });
    return false;
  });
  const after = await page.locator("body").innerText().catch(() => "");
  const result = { clicked: true, submitted, action, changed: before !== after };
  write("action_executed", { ...result, url: page.url() });
  return result;
}

async function visibleActions(page) {
  return page.locator("[data-action]:visible").evaluateAll(nodes => [...new Set(nodes.map(n => n.getAttribute("data-action")).filter(Boolean))]);
}

module.exports = { url, login, logout, gotoModule, createOrder, openCase, fillGenericForm, clickAction, visibleActions, fixtures };
