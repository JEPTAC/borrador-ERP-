"use strict";

const fs = require("fs");
const path = require("path");

const outputDir = path.resolve(process.cwd(), "qa-output");
const file = path.join(outputDir, "journal.ndjson");
fs.mkdirSync(outputDir, { recursive: true });

function redact(value) {
  let text = typeof value === "string" ? value : JSON.stringify(value);
  text = text.replace(/(authorization|apikey|password|token)(["'\s:=]+)[^,"'\s}]+/gi, "$1$2[REDACTED]");
  text = text.replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, "[JWT_REDACTED]");
  return text;
}

function write(type, data = {}) {
  const row = {
    at: new Date().toISOString(),
    type,
    ...data
  };
  fs.appendFileSync(file, `${redact(row)}\n`, "utf8");
  return row;
}

function installPageDiagnostics(page, context = {}) {
  page.on("console", message => {
    if (["error", "warning"].includes(message.type())) {
      write("browser_console", { ...context, level: message.type(), text: message.text(), url: page.url() });
    }
  });
  page.on("pageerror", error => write("page_error", { ...context, message: error.message, stack: error.stack, url: page.url() }));
  page.on("requestfailed", request => write("request_failed", {
    ...context,
    method: request.method(),
    url: request.url(),
    failure: request.failure() && request.failure().errorText,
    pageUrl: page.url()
  }));
  page.on("response", response => {
    if (response.status() >= 400) write("http_error", {
      ...context,
      status: response.status(),
      method: response.request().method(),
      url: response.url(),
      pageUrl: page.url()
    });
  });
  page.on("dialog", async dialog => {
    write("browser_dialog", { ...context, dialogType: dialog.type(), message: dialog.message(), url: page.url() });
    await dialog.accept().catch(() => {});
  });
}

async function evidence(page, testInfo, label, extra = {}) {
  const safe = label.replace(/[^a-z0-9_-]+/gi, "-").slice(0, 80);
  const screenshot = path.join(outputDir, `${Date.now()}-${safe}.png`);
  await page.screenshot({ path: screenshot, fullPage: true }).catch(() => {});
  await testInfo.attach(`${safe}-diagnostic`, {
    body: Buffer.from(JSON.stringify({ label, url: page.url(), ...extra }, null, 2)),
    contentType: "application/json"
  }).catch(() => {});
  write("evidence", { label, screenshot, url: page.url(), ...extra });
}

module.exports = { write, installPageDiagnostics, evidence, outputDir, file };
