import { createClient } from "https://esm.sh/@supabase/supabase-js@2.112.0";

function cors(req: Request) {
  const origin = req.headers.get("origin") || "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function json(body: unknown, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json; charset=utf-8" },
  });
}

Deno.serve(async (req) => {
  const headers = cors(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return json({ error: "Método no permitido." }, 405, headers);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const githubToken = Deno.env.get("GITHUB_ACTIONS_TOKEN") || "";
    const repository = Deno.env.get("GITHUB_REPOSITORY") || "";
    const workflow = Deno.env.get("GITHUB_WORKFLOW_FILE") || "erp-diagnostic-bot.yml";
    const defaultRef = Deno.env.get("GITHUB_REF") || "main";
    if (!supabaseUrl || !serviceRole) throw new Error("Faltan secretos administrativos de Supabase.");
    if (!githubToken || !repository) throw new Error("Faltan GITHUB_ACTIONS_TOKEN o GITHUB_REPOSITORY.");

    const bearer = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!bearer) return json({ error: "Falta la sesión del usuario." }, 401, headers);

    const admin = createClient(supabaseUrl, serviceRole, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: authData, error: authError } = await admin.auth.getUser(bearer);
    if (authError || !authData.user) return json({ error: "Sesión inválida." }, 401, headers);

    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("firebase_uid,email,display_name,role_code,active")
      .eq("auth_user_id", authData.user.id)
      .maybeSingle();
    if (profileError) throw profileError;
    if (!profile?.active || String(profile.role_code || "").toLowerCase() !== "super_admin") {
      return json({ error: "Solo Super Admin puede ejecutar el diagnóstico E2E." }, 403, headers);
    }

    const body = await req.json().catch(() => ({}));
    const mode = ["smoke", "pairwise", "exhaustive"].includes(String(body.mode)) ? String(body.mode) : "exhaustive";
    const suite = ["all", "auth", "navigation", "orders", "flow", "routing"].includes(String(body.suite)) ? String(body.suite) : "all";
    const cleanup = body.cleanup !== false;
    const maxCombinations = Math.max(0, Number(body.max_combinations || 0));
    const baseUrl = String(body.base_url || "").trim();
    const ref = String(body.ref || defaultRef).trim() || defaultRef;

    const dispatchResponse = await fetch(
      `https://api.github.com/repos/${repository}/actions/workflows/${workflow}/dispatches`,
      {
        method: "POST",
        headers: {
          "Accept": "application/vnd.github+json",
          "Authorization": `Bearer ${githubToken}`,
          "X-GitHub-Api-Version": "2022-11-28",
          "Content-Type": "application/json",
          "User-Agent": "EI-ERP-Diagnostic/7.1.0",
        },
        body: JSON.stringify({
          ref,
          inputs: {
            base_url: baseUrl,
            mode,
            suite,
            cleanup: String(cleanup),
            max_combinations: String(maxCombinations),
          },
        }),
      },
    );

    if (!dispatchResponse.ok) {
      const detail = await dispatchResponse.text();
      throw new Error(`GitHub rechazó la ejecución (${dispatchResponse.status}): ${detail.slice(0, 500)}`);
    }

    await admin.from("erp_access_events").insert({
      access_event_id: `DIAG_${crypto.randomUUID()}`,
      tenant_id: "electroingenieria",
      action: "ERP_DIAGNOSTIC_E2E_TRIGGERED",
      resource: "github_actions",
      resource_id: workflow,
      source: "EDGE_FUNCTION",
      trust_level: "SUPER_ADMIN",
      created_by_uid: profile.firebase_uid,
      created_by_name: profile.display_name,
      details: { repository, workflow, ref, mode, suite, cleanup, maxCombinations, baseUrl },
      raw_data: { requestedBy: profile.email, requestedAt: new Date().toISOString() },
    }).catch(() => null);

    return json({
      ok: true,
      message: "Diagnóstico E2E iniciado.",
      repository,
      workflow,
      ref,
      inputs: { base_url: baseUrl, mode, suite, cleanup, max_combinations: maxCombinations },
    }, 202, headers);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 400, headers);
  }
});
