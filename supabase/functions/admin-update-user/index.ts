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

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: rolesData } = await admin.from("user_roles").select("role").eq("user_id", user.id);
    const isAdmin = (rolesData ?? []).some((r: { role: string }) => r.role === "admin");
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Solo admin puede modificar usuarios" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { user_id, email, password, username, login_mode, has_login_access, must_change_password } = body ?? {};
    if (!user_id) {
      return new Response(JSON.stringify({ error: "Falta user_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!email && !password && username === undefined && !login_mode && has_login_access === undefined && must_change_password === undefined) {
      return new Response(JSON.stringify({ error: "Nada para actualizar" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (password && String(password).length < 6) {
      return new Response(JSON.stringify({ error: "La contraseña debe tener al menos 6 caracteres" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const normalizedUsername = username === undefined ? undefined : normalizeUsername(String(username ?? ""));

    if (login_mode === "username" && !normalizedUsername) {
      return new Response(JSON.stringify({ error: "Debes indicar un usuario de acceso" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (normalizedUsername !== undefined && normalizedUsername) {
      const { data: existingUsername } = await admin
        .from("profiles")
        .select("id")
        .eq("username", normalizedUsername)
        .neq("id", user_id)
        .maybeSingle();

      if (existingUsername) {
        return new Response(JSON.stringify({ error: "Ese usuario ya existe" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const hasLoginAccess = has_login_access === undefined ? undefined : !!has_login_access;

    const attrs: { email?: string; password?: string } = {};
    if (hasLoginAccess === false) {
      attrs.email = buildInternalOnlyEmail();
    } else if (login_mode === "username" && normalizedUsername) {
      attrs.email = buildInternalEmail(normalizedUsername);
    } else if (email) {
      attrs.email = String(email).trim().toLowerCase();
    }
    if (password) attrs.password = String(password);

    if (attrs.email || attrs.password) {
      const { error: updErr } = await admin.auth.admin.updateUserById(user_id, attrs);
      if (updErr) {
        return new Response(JSON.stringify({ error: updErr.message }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const profilePatch: Record<string, unknown> = {};
    if (normalizedUsername !== undefined) {
      profilePatch.username = hasLoginAccess === false ? null : normalizedUsername || null;
    }
    if (login_mode === "email" || login_mode === "username") {
      profilePatch.login_mode = login_mode;
    }
    if (hasLoginAccess !== undefined) {
      profilePatch.has_login_access = hasLoginAccess;
    }
    if (must_change_password !== undefined) {
      profilePatch.must_change_password = hasLoginAccess === false ? false : !!must_change_password;
    } else if (password) {
      profilePatch.must_change_password = hasLoginAccess === false ? false : true;
    }

    if (Object.keys(profilePatch).length > 0) {
      const { error: profileErr } = await admin.from("profiles").update(profilePatch).eq("id", user_id);
      if (profileErr) {
        return new Response(JSON.stringify({ error: profileErr.message }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
