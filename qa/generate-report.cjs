"use strict";

const fs = require("fs");
const path = require("path");
const config = require("./lib/config.cjs");

const out = path.resolve(process.cwd(), "qa-output");
fs.mkdirSync(out, { recursive: true });

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch (_) { return fallback; }
}
function readJournal() {
  const file = path.join(out, "journal.ndjson");
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean).map(line => {
    try { return JSON.parse(line); } catch (_) { return { type: "invalid_journal_line", line }; }
  });
}
function flattenSuites(suites, output = []) {
  for (const suite of suites || []) {
    for (const spec of suite.specs || []) {
      for (const test of spec.tests || []) output.push({ title: spec.title, file: spec.file, ...test });
    }
    flattenSuites(suite.suites, output);
  }
  return output;
}

const playwright = readJson(path.join(out, "playwright-results.json"), { suites: [] });
const journal = readJournal();
const tests = flattenSuites(playwright.suites);
const failedTests = tests.filter(test => (test.results || []).some(result => result.status === "failed" || result.status === "timedOut"));
const passedTests = tests.filter(test => (test.results || []).some(result => result.status === "passed"));
const counts = journal.reduce((acc, row) => { acc[row.type] = (acc[row.type] || 0) + 1; return acc; }, {});
const issues = journal.filter(row => ["page_error", "request_failed", "http_error", "route_failed", "matrix_case_failed", "flow_outcome", "form_fill_error"].includes(row.type));
const flowBlocks = journal.filter(row => row.type === "flow_outcome" && !row.closed);
const routeFailures = journal.filter(row => row.type === "route_failed");
const matrixFailures = journal.filter(row => row.type === "matrix_case_failed");

const report = {
  generatedAt: new Date().toISOString(),
  baseURL: config.baseURL,
  mode: config.mode,
  runId: config.runId,
  summary: {
    testsPassed: passedTests.length,
    testsFailed: failedTests.length,
    routesFailed: routeFailures.length,
    matrixFailures: matrixFailures.length,
    flowBlocks: flowBlocks.length,
    consoleErrors: counts.browser_console || 0,
    pageErrors: counts.page_error || 0,
    failedRequests: counts.request_failed || 0,
    httpErrors: counts.http_error || 0
  },
  failedTests: failedTests.map(test => ({ title: test.title, file: test.file, results: test.results })),
  routeFailures,
  matrixFailures,
  flowBlocks,
  issues,
  eventCounts: counts
};

fs.writeFileSync(path.join(out, "DIAGNOSTICO_ERP.json"), JSON.stringify(report, null, 2));

const lines = [
  "# Diagnóstico automático · EI ERP Trazabilidad",
  "",
  `- Generado: **${report.generatedAt}**`,
  `- URL examinada: **${report.baseURL}**`,
  `- Modo: **${report.mode}**`,
  `- Ejecución: **${report.runId}**`,
  "",
  "## Resultado general",
  "",
  `- Pruebas superadas: **${report.summary.testsPassed}**`,
  `- Pruebas fallidas: **${report.summary.testsFailed}**`,
  `- Rutas con error: **${report.summary.routesFailed}**`,
  `- Combinaciones fallidas: **${report.summary.matrixFailures}**`,
  `- Flujos bloqueados: **${report.summary.flowBlocks}**`,
  `- Errores JavaScript: **${report.summary.pageErrors}**`,
  `- Solicitudes de red fallidas: **${report.summary.failedRequests}**`,
  `- Respuestas HTTP 4xx/5xx: **${report.summary.httpErrors}**`,
  ""
];

function section(title, rows, format) {
  lines.push(`## ${title}`, "");
  if (!rows.length) lines.push("- Ninguno.", "");
  else { rows.slice(0, 200).forEach(row => lines.push(`- ${format(row)}`)); lines.push(""); }
}
section("Pruebas fallidas", report.failedTests, row => `**${row.title}** · ${row.file || "sin archivo"}`);
section("Rutas que no abrieron", routeFailures, row => `**${row.module}/${row.route}** · ${row.error}`);
section("Combinaciones que fallaron", matrixFailures, row => `**${row.reference}** · ${row.error}`);
section("Flujos bloqueados", flowBlocks, row => `**${row.reference}** · ${row.blocked || "sin detalle"} · pasos: ${row.steps}`);
section("Errores de navegador y red", issues.filter(row => ["page_error", "request_failed", "http_error", "browser_console"].includes(row.type)), row => `**${row.type}** · ${row.status || ""} ${row.message || row.text || row.failure || ""} · ${row.url || row.pageUrl || ""}`);

lines.push("## Evidencias", "", "Abra `html-report/index.html` para ver cada prueba. Las capturas, trazas y videos están en `test-results/`.", "");
fs.writeFileSync(path.join(out, "DIAGNOSTICO_ERP.md"), lines.join("\n"));
console.log(`Reporte generado: ${path.join(out, "DIAGNOSTICO_ERP.md")}`);
