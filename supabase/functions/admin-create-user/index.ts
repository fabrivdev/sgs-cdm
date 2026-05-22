import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const normalizeUsername = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9._-]/g, ".");

const buildInternalEmail = (username: string) =>
  `${username}.${crypto.randomUUID().slice(0, 8)}@users.cdm.local`;

const buildInternalOnlyEmail = () => `no-access.${crypto.randomUUID()}@users.cdm.local`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: uErr } = await userClient.auth.getUser();
    if (uErr || !user) {
      return new Response(JSON.stringify({ error: "No autenticado" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify caller is admin
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: rolesData } = await admin.from("user_roles").select("role").eq("user_id", user.id);
    const isAdmin = (rolesData ?? []).some((r: { role: string }) => r.role === "admin");
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Solo admin puede crear usuarios" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const {
      email,
      username,
      password,
      nombre,
      sucursal,
      role,
      login_mode,
      has_login_access,
      must_change_password,
    } = await req.json();

    const hasLoginAccess = has_login_access !== false;
    const loginMode = login_mode === "username" ? "username" : "email";
    const normalizedUsername = loginMode === "username" ? normalizeUsername(String(username ?? "")) : null;
    const authEmail = !hasLoginAccess
      ? buildInternalOnlyEmail()
      : loginMode === "email"
        ? String(email ?? "").trim().toLowerCase()
        : normalizedUsername
          ? buildInternalEmail(normalizedUsername)
          : "";
    const initialPassword = hasLoginAccess ? String(password ?? "") : crypto.randomUUID() + crypto.randomUUID().slice(0, 8);

    if (!nombre || !role || !authEmail || (hasLoginAccess && loginMode === "username" && !normalizedUsername)) {
      return new Response(JSON.stringify({ error: "Faltan campos requeridos" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (hasLoginAccess && initialPassword.length < 6) {
      return new Response(JSON.stringify({ error: "La contraseña debe tener al menos 6 caracteres" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (normalizedUsername) {
      const { data: existingUsername } = await admin
        .from("profiles")
        .select("id")
        .eq("username", normalizedUsername)
        .maybeSingle();

      if (existingUsername) {
        return new Response(JSON.stringify({ error: "Ese usuario ya existe" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const { data: created, error: cErr } = await admin.auth.admin.createUser({
      email: authEmail,
      password: initialPassword,
      email_confirm: true,
      user_metadata: { nombre, sucursal },
    });
    if (cErr || !created.user) {
      return new Response(JSON.stringify({ error: cErr?.message ?? "Error creando usuario" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Profile is auto-created by handle_new_user trigger.
    await admin
      .from("profiles")
      .update({
        sucursal,
        nombre,
        username: hasLoginAccess ? normalizedUsername : null,
        login_mode: loginMode,
        has_login_access: hasLoginAccess,
        must_change_password: hasLoginAccess ? must_change_password !== false : false,
      })
      .eq("id", created.user.id);

    // Assign role
    await admin.from("user_roles").insert({ user_id: created.user.id, role });

    return new Response(JSON.stringify({ ok: true, user_id: created.user.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
