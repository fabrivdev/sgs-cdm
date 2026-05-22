import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const INVALID_CREDENTIALS = "Credenciales inválidas";

const isEmail = (value: string) => value.includes("@");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const { identifier } = await req.json();
    const rawIdentifier = String(identifier ?? "").trim();

    if (!rawIdentifier) {
      return new Response(JSON.stringify({ error: INVALID_CREDENTIALS }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (isEmail(rawIdentifier)) {
      return new Response(JSON.stringify({ email: rawIdentifier.toLowerCase() }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const normalizedUsername = rawIdentifier.toLowerCase();

    const { data: profile } = await admin
      .from("profiles")
      .select("id, activo, has_login_access, username")
      .eq("username", normalizedUsername)
      .maybeSingle();

    if (!profile || !profile.activo || !profile.has_login_access) {
      return new Response(JSON.stringify({ error: INVALID_CREDENTIALS }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: authData, error: authError } = await admin.auth.admin.getUserById(profile.id);
    if (authError || !authData.user?.email) {
      return new Response(JSON.stringify({ error: INVALID_CREDENTIALS }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ email: authData.user.email }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch {
    return new Response(JSON.stringify({ error: INVALID_CREDENTIALS }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
