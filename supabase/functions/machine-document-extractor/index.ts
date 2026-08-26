import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const DEFAULT_VISION_MODELS = ["qwen/qwen3.6-27b", "qwen/qwen3.8-27b"];

class ExtractionError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

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
    "producto": "tipo o descripcion de la maquina tal como aparece, por ejemplo Cosechadora",
    "modelo": "modelo exacto tal como aparece en el campo Modelo, por ejemplo Tucano 710",
    "anio": "numero o null",
    "cabezal": "texto exacto o null",
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
  const source = (fenced ?? raw).trim();
  const start = source.indexOf("{");
  if (start < 0) throw new Error("Model response did not contain JSON");

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === "{") depth += 1;
    else if (character === "}") {
      depth -= 1;
      if (depth === 0) return JSON.parse(source.slice(start, index + 1));
    }
  }

  throw new Error("Model response contained incomplete JSON");
}

async function requestDocumentExtraction(apiKey: string, prompt: string, dataUrl: string) {
  const configuredModel = Deno.env.get("GROQ_VISION_MODEL")?.trim();
  const models = configuredModel
    ? [configuredModel, ...DEFAULT_VISION_MODELS.filter((model) => model !== configuredModel)]
    : DEFAULT_VISION_MODELS;
  let lastFailure: { status: number; body: string } | undefined;

  for (const model of models) {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        temperature: 0,
        max_completion_tokens: 2200,
        reasoning_effort: "none",
        messages: [{
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        }],
      }),
    });

    if (response.ok) {
      const completion = await response.json();
      const raw = completion?.choices?.[0]?.message?.content;
      if (typeof raw === "string" && raw.trim()) {
        try {
          return { data: extractJson(raw), model: completion?.model ?? model };
        } catch (parseError) {
          console.error(
            "[machine-document-extractor] Invalid model JSON",
            model,
            completion?.choices?.[0]?.finish_reason,
            parseError,
          );
          continue;
        }
      }
      console.error("[machine-document-extractor] Empty model response", model);
      continue;
    }

    const failureBody = await response.text();
    lastFailure = { status: response.status, body: failureBody };
    console.error("[machine-document-extractor] Groq", response.status, model, failureBody);

    // Authentication and rate limits are shared across models. Retrying them
    // immediately only increases pressure on the same account quota.
    if (response.status === 401 || response.status === 403 || response.status === 429) break;
  }

  throw new ExtractionError(
    `Groq request failed (${lastFailure?.status ?? "unknown"})`,
    lastFailure?.status === 429 ? 429 : 422,
  );
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
    const prompt = `Lee ${purpose} completo y con atencion, incluyendo encabezado impreso, campos manuscritos, tablas, casillas y pie de pagina. ` +
      `Recorre el documento dos veces antes de responder. Extrae solamente lo visible, sin completar por contexto ni inventar. ` +
      `Si un dato no aparece o no se puede leer con seguridad, devuelve null (no uses la fecha actual ni nombres supuestos). ` +
      `La respuesta se revisara manualmente.\n` +
      `Para una NP, usa exactamente estos campos: el numero junto a N°, la fecha escrita en FECHA/FECHA DE OPERACION, ` +
      `cliente debe ser exclusivamente el texto escrito por el comprador junto a Apellido y Nombre/Razon Social. ` +
      `No uses el membrete CAMPOS DEL MANANA S.A., la empresa vendedora CDM, un nombre de firma, vendedor, operativo, ` +
      `domicilio ni destinatario como cliente. Conserva exactamente el nombre visible, incluidas las palabras S.A. ` +
      `Si el campo del comprador no se puede leer con seguridad, devuelve null y anotalo en campos_dudosos. ` +
      `comercial solo si hay un nombre escrito junto a Vendedor, ` +
      `Comercial u Operativo comercial. Nunca deduzcas el comercial a partir de una firma, sello o nombre del cliente. ` +
      `En cada linea lee por separado Marca, Tipo, Modelo, Año y Cabezal/Plataforma: producto debe ser el tipo o descripcion ` +
      `(por ejemplo Cosechadora), modelo debe conservar el texto exacto del campo Modelo (por ejemplo Tucano 710), ` +
      `anio solo el año visible y cabezal solo el texto visible del campo correspondiente. No pongas el tipo dentro de modelo ` +
      `ni el modelo dentro de producto. Si el manuscrito es dudoso, deja ese campo en null y anotala en campos_dudosos. ` +
      `La condicion USADA solo se marca si la maquina de esa linea se describe explicitamente como usada. ` +
      `No marques como USADA la maquina ofertada por una mencion separada de toma, permuta o entrega de otra maquina usada; ` +
      `si la condicion de la maquina listada no aparece, usa NUEVA para que quede pendiente de revision manual. ` +
      `El abastecimiento solo es STOCK o IMPORTAR cuando hay evidencia explicita; en caso contrario usa DEFINIR.\n` +
      `CLAAS y HORSCH son las unicas marcas representadas inicialmente; cualquier otra es OTROS.\n` +
      `En facturas busca especialmente chasis, numero de factura y valor total facturado. ` +
      `Se conciso: observaciones maximo 120 caracteres y no agregues explicaciones.\n` +
      `Responde exclusivamente JSON valido con esta forma:\n${schema}`;

    const extraction = await requestDocumentExtraction(apiKey, prompt, dataUrl);
    return json({ data: extraction.data, documentType, model: extraction.model });
  } catch (error) {
    console.error("[machine-document-extractor]", error);
    if (error instanceof ExtractionError) {
      if (error.status === 429) {
        return json({ error: "La lectura automatica esta ocupada. Espera unos segundos e intenta de nuevo." }, 429);
      }
      return json({ error: "No se encontraron datos legibles. Proba con una imagen mas nitida o completa los campos manualmente." }, 422);
    }
    return json({ error: "No se pudo procesar el documento. Podes continuar con carga manual." }, 500);
  }
});
