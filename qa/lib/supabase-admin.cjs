"use strict";

const config = require("./config.cjs");
const { write } = require("./journal.cjs");

function enabled() { return Boolean(config.serviceRoleKey); }

async function request(path, options = {}) {
  if (!enabled()) throw new Error("SUPABASE_SERVICE_ROLE_KEY no está configurada.");
  const response = await fetch(`${config.supabaseUrl}${path}`, {
    ...options,
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: options.prefer || "return=representation",
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  let body = text;
  try { body = text ? JSON.parse(text) : null; } catch (_) {}
  if (!response.ok) throw new Error(`Supabase HTTP ${response.status}: ${typeof body === "string" ? body : JSON.stringify(body)}`);
  return body;
}

async function getCaseByReference(reference) {
  const query = encodeURIComponent(reference);
  const rows = await request(`/rest/v1/cases?select=case_id,reference,status,current_process,assigned_role,updated_at,raw_data&reference=eq.${query}&limit=1`, { method: "GET" });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function cleanup(prefix) {
  if (!enabled()) {
    write("cleanup_skipped", { reason: "service_role ausente", prefix });
    return { skipped: true };
  }
  const like = encodeURIComponent(`${prefix}*`);
  const deletedCases = await request(`/rest/v1/cases?reference=like.${like}`, { method: "DELETE" });
  const deletedCredits = await request(`/rest/v1/credit_requests?request_code=like.${like}`, { method: "DELETE" }).catch(error => {
    write("cleanup_warning", { table: "credit_requests", message: error.message });
    return [];
  });
  const result = {
    cases: Array.isArray(deletedCases) ? deletedCases.length : 0,
    credits: Array.isArray(deletedCredits) ? deletedCredits.length : 0
  };
  write("cleanup_completed", { prefix, ...result });
  return result;
}

module.exports = { enabled, request, getCaseByReference, cleanup };
