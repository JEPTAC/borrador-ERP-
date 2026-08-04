"use strict";

const fs = require("fs");
const path = require("path");

function normalizeBaseUrl(value) {
  const raw = String(value || "http://127.0.0.1:8080/").trim();
  return raw.endsWith("/") ? raw : `${raw}/`;
}

function parseJson(value, fallback) {
  if (!value) return fallback;
  try { return JSON.parse(value); }
  catch (error) { throw new Error(`ERP_TEST_ACCOUNTS_JSON no es JSON válido: ${error.message}`); }
}

function loadAccounts() {
  const fromEnv = parseJson(process.env.ERP_TEST_ACCOUNTS_JSON, null);
  if (fromEnv && typeof fromEnv === "object") return fromEnv;

  const privateFile = path.resolve(process.cwd(), "qa/accounts.private.json");
  if (fs.existsSync(privateFile)) return JSON.parse(fs.readFileSync(privateFile, "utf8"));

  if (process.env.ERP_TEST_EMAIL && process.env.ERP_TEST_PASSWORD) {
    return {
      admin: {
        email: process.env.ERP_TEST_EMAIL,
        password: process.env.ERP_TEST_PASSWORD,
        role: "super_admin"
      }
    };
  }
  return {};
}

const aliases = {
  admin: ["admin", "super_admin", "super_administrador"],
  sales: ["sales", "ventas"],
  management: ["management", "gerencia"],
  audit: ["audit", "auditoria"],
  purchases: ["purchases", "compras"],
  reception: ["reception", "recepcion", "lider_recepcion"],
  logistics: ["logistics", "jefe_logistica", "coordinador_logistico", "aux_logistica"],
  logistics_local: ["logistics_local", "local_logistics", "coordinador_logistico_local"],
  logistics_national: ["logistics_national", "national_logistics", "coordinador_logistico_national"],
  cut: ["cut", "corte", "auxiliar_corte"],
  billing: ["billing", "facturacion"],
  cash: ["cash", "caja"],
  credit: ["credit", "cartera"],
  dispatch: ["dispatch", "despacho", "despachos"]
};

function findAccount(accounts, group) {
  const candidates = aliases[group] || [group];
  for (const key of candidates) {
    if (accounts[key] && accounts[key].email && accounts[key].password) return { key, ...accounts[key] };
  }
  for (const [key, value] of Object.entries(accounts)) {
    const role = String(value.role || key).toLowerCase();
    if (candidates.includes(role) && value.email && value.password) return { key, ...value };
  }
  return null;
}

function requiredAccount(accounts, ...groups) {
  for (const group of groups) {
    const account = findAccount(accounts, group);
    if (account) return account;
  }
  const first = Object.entries(accounts).find(([, value]) => value && value.email && value.password);
  if (first) return { key: first[0], ...first[1] };
  throw new Error("No hay cuentas de prueba. Configure ERP_TEST_ACCOUNTS_JSON en GitHub Secrets.");
}

module.exports = {
  baseURL: normalizeBaseUrl(process.env.ERP_BASE_URL),
  mode: String(process.env.ERP_QA_MODE || "smoke").toLowerCase(),
  suite: String(process.env.ERP_QA_SUITE || "all").toLowerCase(),
  cleanup: !/^(0|false|no)$/i.test(String(process.env.ERP_QA_CLEANUP || "true")),
  runId: String(process.env.ERP_QA_RUN_ID || new Date().toISOString().replace(/\D/g, "").slice(0, 14)),
  maxCombinations: Number(process.env.ERP_QA_MAX_COMBINATIONS || 0),
  accounts: loadAccounts(),
  findAccount,
  requiredAccount,
  supabaseUrl: String(process.env.SUPABASE_URL || "https://hezjxcxxcjlpmyalftam.supabase.co").replace(/\/$/, ""),
  serviceRoleKey: String(process.env.SUPABASE_SERVICE_ROLE_KEY || ""),
  qaPrefix: String(process.env.ERP_QA_PREFIX || "QA-BOT")
};
