import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

const NP_SCHEMA = `{
  "np_numero": "texto o null",
  "np_fecha": "YYYY-MM-DD o null",
  "cliente_nombre": "texto o null",
  "comercial": "texto o null",
  "lineas": [{
    "marca": "CLAAS | HORSCH | OTROS",
    "producto": "texto o null",
    "modelo": "texto o null",
    "cantidad": 1,
    "condicion": "NUEVA | USADA",
    "abastecimiento": "DEFINIR | STOCK | IMPORTAR",
    "subgrupo": "TRACTORES | COSECHADORAS | PICADORAS | SEMBRADORAS | PLATAFORMAS | PULVERIZADORAS | OTRO",
    "chasis": []
  }],
  "confianza": {"global": 0.0, "campos_dudosos": []},
  "observaciones": "texto breve"
}`;

const INVOICE_SCHEMA = `{
  "proveedor": "texto o null",
  "factura_numero": "texto o null",
  "factura_fecha": "YYYY-MM-DD o null",
  "moneda": "USD | EUR | PYG | otra o null",
  "valor_facturado": 0,
  "np_numero": "texto o null",
  "marca": "CLAAS | HORSCH | OTROS",
  "modelo": "texto o null",
  "chasis": ["texto"],
  "confianza": {"global": 0.0, "campos_dudosos": []},
  "observaciones": "texto breve"
}`;

function extractJson(raw: string) {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = fenced ?? raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);
  return JSON.parse(candidate);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Metodo no permitido" }, 405);

  try {
    const authorization = req.headers.get("Authorization") ?? "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
    });
    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) return json({ error: "Sesion no valida" }, 401);

    const { data: hasAccess, error: accessError } = await userClient.rpc("has_module_access", {
      _user_id: authData.user.id,
      _modulo_id: "parque",
    });
    if (accessError || !hasAccess) return json({ error: "Sin acceso al modulo Parque" }, 403);

    const body = await req.json();
    const documentType = body?.documentType === "FACTURA_IMPORTACION" ? "FACTURA_IMPORTACION" : "NP";
    const dataUrl = String(body?.dataUrl ?? "");
    const mimeType = String(body?.mimeType ?? "");
    if (!/^image\/(jpeg|png|webp)$/.test(mimeType) || !dataUrl.startsWith(`data:${mimeType};base64,`)) {
      return json({ error: "Para la lectura automatica usa una foto JPG, PNG o WEBP nitida." }, 400);
    }
    if (dataUrl.length > 16_500_000) return json({ error: "La imagen supera el limite de 12 MB." }, 413);

    const apiKey = Deno.env.get("GROQ_API_KEY");
    if (!apiKey) return json({ error: "La lectura automatica no esta configurada." }, 503);
    const schema = documentType === "NP" ? NP_SCHEMA : INVOICE_SCHEMA;
    const purpose = documentType === "NP"
      ? "una nota de pedido (NP) de maquinaria agricola"
      : "una factura de importacion de maquinaria agricola";
    const prompt = `Lee ${purpose}. Extrae solo lo visible, sin inventar. Si un dato no es legible usa null.\n` +
      `CLAAS y HORSCH son las unicas marcas representadas inicialmente; cualquier otra es OTROS.\n` +
      `En facturas busca especialmente chasis, numero de factura y valor total facturado.\n` +
      `Responde exclusivamente JSON valido con esta forma:\n${schema}`;

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: Deno.env.get("GROQ_VISION_MODEL") ?? "meta-llama/llama-4-scout-17b-16e-instruct",
        temperature: 0,
        max_completion_tokens: 1800,
        messages: [{
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        }],
      }),
    });
    if (!response.ok) {
      console.error("[machine-document-extractor] Groq", response.status, await response.text());
      return json({ error: "No se pudo leer el documento. Podes completar los campos manualmente." }, 502);
    }
    const completion = await response.json();
    const raw = completion?.choices?.[0]?.message?.content;
    if (!raw) return json({ error: "El documento no devolvio datos legibles." }, 422);
    return json({ data: extractJson(raw), documentType, model: completion?.model });
  } catch (error) {
    console.error("[machine-document-extractor]", error);
    return json({ error: "No se pudo procesar el documento. Podes continuar con carga manual." }, 500);
  }
});
