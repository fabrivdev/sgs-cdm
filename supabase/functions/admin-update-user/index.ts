import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: rolesData } = await admin.from("user_roles").select("role").eq("user_id", user.id);
    const isAdmin = (rolesData ?? []).some((r: { role: string }) =>
      r.role === "admin" || r.role === "superadmin"
    );
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Solo admin puede modificar usuarios" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { profile_id, user_id, email, password } = body ?? {};
    if (!profile_id && !user_id) {
      return new Response(JSON.stringify({ error: "Falta profile_id o user_id" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!email && !password) {
      return new Response(JSON.stringify({ error: "Nada para actualizar" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (password && String(password).length < 6) {
      return new Response(JSON.stringify({ error: "La contraseña debe tener al menos 6 caracteres" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let authUserId: string | null = null;

    if (profile_id) {
      // Try linked schema first; fall back to legacy where profile.id == auth.users.id
      try {
        const { data: profileData } = await (admin as any)
          .from("profiles")
          .select("id, auth_user_id")
          .eq("id", profile_id)
          .maybeSingle();
        if (profileData) {
          authUserId = profileData.auth_user_id ?? profileData.id;
        }
      } catch {
        // auth_user_id column may not exist
      }
      if (!authUserId) {
        const { data: legacyProfile } = await admin
          .from("profiles")
          .select("id")
          .eq("id", profile_id)
          .maybeSingle();
        if (!legacyProfile) {
          return new Response(JSON.stringify({ error: "No se encontró el técnico seleccionado" }), {
            status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        authUserId = legacyProfile.id;
      }
    } else {
      // Legacy path: user_id is the auth.users.id directly (also equals profile.id)
      authUserId = String(user_id);
    }

    const { data: targetRoles } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", authUserId!);
    if ((targetRoles ?? []).some((item: { role: string }) => item.role === "superadmin")) {
      return new Response(JSON.stringify({ error: "Las credenciales del superadministrador están protegidas" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }


    const attrs: { email?: string; password?: string } = {};
    if (email) attrs.email = String(email).trim().toLowerCase();
    if (password) attrs.password = String(password);

    const { error: updErr } = await admin.auth.admin.updateUserById(authUserId!, attrs);
    if (updErr) {
      return new Response(JSON.stringify({ error: updErr.message }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true, auth_user_id: authUserId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
