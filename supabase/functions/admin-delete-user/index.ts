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
      return new Response(JSON.stringify({ error: "Solo admin puede eliminar usuarios" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { profile_id, user_id } = body ?? {};
    const targetId = profile_id || user_id;
    if (!targetId) {
      return new Response(JSON.stringify({ error: "Falta profile_id o user_id" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: profileData } = await admin
      .from("profiles")
      .select("*")
      .eq("id", targetId)
      .maybeSingle();

    if (!profileData) {
      return new Response(JSON.stringify({ error: "No se encontró el técnico seleccionado" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // auth_user_id si existe (esquema linked), sino el propio profile.id es el auth user id
    const authUserId = (profileData as any).auth_user_id ?? profileData.id;
    const hasLinkedColumn = Object.prototype.hasOwnProperty.call(profileData, "auth_user_id");

    if (hasLinkedColumn && !(profileData as any).auth_user_id) {
      return new Response(JSON.stringify({ error: "Ese técnico no tiene cuenta asociada" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (authUserId === user.id) {
      return new Response(JSON.stringify({ error: "No podés eliminar tu propio acceso" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: targetRoles } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", authUserId);
    if ((targetRoles ?? []).some((item: { role: string }) => item.role === "superadmin")) {
      return new Response(JSON.stringify({ error: "El acceso del superadministrador está protegido" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (hasLinkedColumn) {
      // esquema linked: desvincular profile y borrar solo el auth user
      await admin.from("profiles").update({ auth_user_id: null }).eq("id", profileData.id);
    } else {
      // esquema actual: profile.id = auth user id. Borrar roles y profile también.
      await admin.from("user_roles").delete().eq("user_id", authUserId);
      await admin.from("profiles").delete().eq("id", profileData.id);
    }

    const { error: delErr } = await admin.auth.admin.deleteUser(authUserId);
    if (delErr && !/not.?found/i.test(delErr.message)) {
      return new Response(JSON.stringify({ error: delErr.message }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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
