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
      return new Response(JSON.stringify({ error: "Solo admin puede crear usuarios" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { email, password, nombre, sucursal, role, profile_id } = await req.json();
    if (!email || !password || (!nombre && !profile_id)) {
      return new Response(JSON.stringify({ error: "Faltan campos requeridos" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (String(password).length < 6) {
      return new Response(JSON.stringify({ error: "La contraseña debe tener al menos 6 caracteres" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const assignableRoles = new Set(["admin", "gerencia", "jefatura", "operativo"]);
    if (role && !assignableRoles.has(String(role))) {
      return new Response(JSON.stringify({ error: "El rol solicitado no se puede asignar desde la aplicación" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let linkedProfile: { id: string; nombre: string; sucursal: string | null; auth_user_id: string | null } | null = null;
    if (profile_id) {
      const { data: profileData } = await admin
        .from("profiles")
        .select("id, nombre, sucursal, auth_user_id")
        .eq("id", profile_id)
        .maybeSingle();

      linkedProfile = profileData;
      if (!linkedProfile) {
        return new Response(JSON.stringify({ error: "No se encontró el técnico seleccionado" }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (linkedProfile.auth_user_id) {
        return new Response(JSON.stringify({ error: "Ese técnico ya tiene acceso asociado" }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const finalNombre = linkedProfile?.nombre ?? nombre;
    const finalSucursal = linkedProfile?.sucursal ?? sucursal ?? null;

    const { data: created, error: cErr } = await admin.auth.admin.createUser({
      email: String(email).trim().toLowerCase(),
      password: String(password),
      email_confirm: true,
      user_metadata: {
        nombre: finalNombre,
        sucursal: finalSucursal,
        profile_id: linkedProfile?.id ?? null,
      },
    });
    if (cErr || !created.user) {
      return new Response(JSON.stringify({ error: cErr?.message ?? "Error creando usuario" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!linkedProfile) {
      if (finalSucursal) {
        await admin.from("profiles").update({ sucursal: finalSucursal, nombre: finalNombre, auth_user_id: created.user.id }).eq("id", created.user.id);
      } else {
        await admin.from("profiles").update({ nombre: finalNombre, auth_user_id: created.user.id }).eq("id", created.user.id);
      }

      await admin.from("user_roles").insert({ user_id: created.user.id, role });
    }

    return new Response(JSON.stringify({ ok: true, user_id: created.user.id, profile_id: linkedProfile?.id ?? created.user.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
