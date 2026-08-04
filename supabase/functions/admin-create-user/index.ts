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

function adminKey(): string {
  const explicit = Deno.env.get("SUPABASE_SECRET_KEY");
  if (explicit) return explicit;
  const dictionary = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (dictionary) {
    try {
      const parsed = JSON.parse(dictionary);
      const first = Object.values(parsed).find((value) => typeof value === "string" && value.length > 20);
      if (typeof first === "string") return first;
    } catch (_) { /* fallback below */ }
  }
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  throw new Error("La Edge Function no tiene una Secret Key administrativa configurada.");
}

Deno.serve(async (req) => {
  const headers = cors(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Método no permitido." }), { status: 405, headers: { ...headers, "Content-Type": "application/json" } });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const authorization = req.headers.get("Authorization") || "";
    const token = authorization.replace(/^Bearer\s+/i, "");
    if (!token) throw new Error("Falta la sesión del administrador.");

    const admin = createClient(url, adminKey(), { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    if (authError || !authData.user) throw new Error("Sesión no válida.");

    const { data: profile, error: profileError } = await admin.from("profiles").select("role_code,active,display_name").eq("auth_user_id", authData.user.id).maybeSingle();
    if (profileError) throw profileError;
    const role = String(profile?.role_code || "").toLowerCase();
    if (!profile?.active || !["super_admin", "super_administrador", "admin", "administrador"].includes(role)) {
      return new Response(JSON.stringify({ error: "Solo Administración puede crear usuarios." }), { status: 403, headers: { ...headers, "Content-Type": "application/json" } });
    }

    const body = await req.json();
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const name = String(body.name || email).trim();
    const requestedRole = String(body.role || "usuario").trim().toLowerCase();
    if (!email || password.length < 10) throw new Error("Correo y contraseña temporal de mínimo 10 caracteres son obligatorios.");

    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name },
      app_metadata: { role: requestedRole, created_by: authData.user.id },
    });
    if (error) throw error;

    return new Response(JSON.stringify({ user: data.user }), { status: 200, headers: { ...headers, "Content-Type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), { status: 400, headers: { ...headers, "Content-Type": "application/json" } });
  }
});
