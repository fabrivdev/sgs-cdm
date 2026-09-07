import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

let cachedGeminiModels: string[] | undefined;
type ExtractionIssueCode = "RATE_LIMIT" | "AUTH" | "PROVIDER" | "INVALID_OUTPUT" | "INVALID_INPUT" | "CONFIG";

class ExtractionError extends Error {
  constructor(message: string, readonly status: number, readonly code: Exclude<ExtractionIssueCode, "INVALID_INPUT" | "CONFIG">) {
    super(message);
  }
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

// Provider availability and extraction quality are expected outcomes of this
// optional helper, not application crashes. Returning them as a successful
// function invocation lets the form show the message without Lovable's runtime
// error overlay. Authentication and authorization failures above remain HTTP
// errors because they represent an invalid caller.
const extractionIssue = (error: string, code: ExtractionIssueCode, retryable: boolean) =>
  json({ error, code, retryable });

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
    "cabezal": "solo compatibilidad: usa null y crea otra linea para el cabezal",
    "cantidad": 1,
    "condicion": "NUEVA | USADA",
    "abastecimiento": "DEFINIR | STOCK | IMPORTAR",
    "subgrupo": "TRACTORES | COSECHADORAS | PICADORAS | SEMBRADORAS | PLATAFORMAS | PLATAFORMAS/CABEZALES | PULVERIZADORAS | OTRO",
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

function geminiModelScore(model: string) {
  let score = 0;
  if (/^gemini-\d+(?:\.\d+)?-flash$/.test(model)) score += 100;
  if (model.includes("flash")) score += 50;
  if (model.includes("latest")) score += 20;
  if (model.includes("lite")) score -= 10;
  if (/preview|experimental|exp/.test(model)) score -= 20;
  return score;
}

async function listAvailableGeminiModels(apiKey: string) {
  if (cachedGeminiModels?.length) return cachedGeminiModels;
  const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000", {
    headers: { "x-goog-api-key": apiKey },
  });
  if (!response.ok) {
    const failureBody = await response.text();
    console.error("[machine-document-extractor] Gemini models.list", response.status, failureBody);
    if (response.status === 429) throw new ExtractionError("Gemini rate limit", 429, "RATE_LIMIT");
    if (response.status === 401 || response.status === 403) {
      throw new ExtractionError("Gemini authentication failed", 503, "AUTH");
    }
    throw new ExtractionError(`Gemini models.list failed (${response.status})`, 503, "PROVIDER");
  }

  const payload = await response.json();
  const models = Array.isArray(payload?.models) ? payload.models : [];
  cachedGeminiModels = models
    .filter((model: { supportedGenerationMethods?: unknown }) =>
      Array.isArray(model?.supportedGenerationMethods) &&
      model.supportedGenerationMethods.includes("generateContent")
    )
    .map((model: { name?: unknown }) => typeof model?.name === "string" ? model.name.replace(/^models\//, "") : "")
    .filter((model: string) =>
      model.includes("gemini") &&
      model.includes("flash") &&
      !/(?:image|live|tts|transcribe|embedding)/.test(model)
    )
    .sort((left: string, right: string) => geminiModelScore(right) - geminiModelScore(left))
    .slice(0, 4);

  if (!cachedGeminiModels.length) {
    throw new ExtractionError("Gemini has no compatible generateContent model", 503, "PROVIDER");
  }
  console.info("[machine-document-extractor] Available Gemini models", cachedGeminiModels);
  return cachedGeminiModels;
}

async function requestDocumentExtraction(
  apiKey: string,
  prompt: string,
  dataUrl: string,
  mimeType: string,
) {
  const configuredModel = Deno.env.get("GEMINI_VISION_MODEL")?.trim();
  const availableModels = await listAvailableGeminiModels(apiKey);
  const models = configuredModel && availableModels.includes(configuredModel)
    ? [configuredModel, ...availableModels.filter((model) => model !== configuredModel)]
    : availableModels;
  const base64Data = dataUrl.slice(dataUrl.indexOf(",") + 1);
  let lastFailure: { status: number; body: string } | undefined;
  let invalidOutput = false;

  for (const model of models) {
    for (const jsonMode of [true, false]) {
      const generationConfig: Record<string, unknown> = { maxOutputTokens: 4096 };
      if (jsonMode) generationConfig.responseMimeType = "application/json";
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey,
          },
          body: JSON.stringify({
            contents: [{
              role: "user",
              parts: [
                { text: prompt },
                { inlineData: { mimeType, data: base64Data } },
              ],
            }],
            generationConfig,
          }),
        },
      );

      if (!response.ok) {
        const failureBody = await response.text();
        lastFailure = { status: response.status, body: failureBody };
        console.error(
          "[machine-document-extractor] Gemini",
          response.status,
          model,
          jsonMode ? "json" : "plain",
          response.headers.get("retry-after"),
          failureBody,
        );
        if (response.status === 401 || response.status === 403) break;
        // A 400 can mean this model does not accept JSON mode. Retry the same
        // request without that option; the prompt still requires valid JSON.
        if (response.status === 400 && jsonMode) continue;
        break;
      }

      const completion = await response.json();
      const raw = completion?.candidates?.[0]?.content?.parts
        ?.map((part: { text?: unknown }) => typeof part?.text === "string" ? part.text : "")
        .join("")
        .trim();
      if (!raw) {
        invalidOutput = true;
        console.error(
          "[machine-document-extractor] Empty Gemini response",
          model,
          completion?.candidates?.[0]?.finishReason,
          completion?.promptFeedback,
        );
        break;
      }

      try {
        return { data: extractJson(raw), model };
      } catch (parseError) {
        invalidOutput = true;
        console.error(
          "[machine-document-extractor] Invalid Gemini JSON",
          model,
          completion?.candidates?.[0]?.finishReason,
          parseError,
        );
        break;
      }
    }
    if (lastFailure?.status === 401 || lastFailure?.status === 403) break;
  }

  if (lastFailure?.status === 429) {
    throw new ExtractionError("Gemini rate limit", 429, "RATE_LIMIT");
  }
  if (lastFailure?.status === 401 || lastFailure?.status === 403) {
    throw new ExtractionError("Gemini authentication failed", 503, "AUTH");
  }
  if (lastFailure) {
    throw new ExtractionError(`Gemini request failed (${lastFailure.status})`, 503, "PROVIDER");
  }
  if (invalidOutput) {
    throw new ExtractionError("Gemini returned invalid structured output", 422, "INVALID_OUTPUT");
  }
  throw new ExtractionError("Gemini document extraction failed", 503, "PROVIDER");
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
      return extractionIssue("Para la lectura automatica usa una foto JPG, PNG o WEBP nitida.", "INVALID_INPUT", false);
    }
    if (dataUrl.length > 16_500_000) return extractionIssue("La imagen supera el limite de 12 MB.", "INVALID_INPUT", false);

    const apiKey = Deno.env.get("GEMINI_API_KEY")?.trim();
    if (!apiKey) return extractionIssue("La lectura automatica no esta configurada.", "CONFIG", false);
    const schema = documentType === "NP" ? NP_SCHEMA : INVOICE_SCHEMA;
    const purpose = documentType === "NP"
      ? "una nota de pedido (NP) de maquinaria agricola"
      : "una factura de importacion de maquinaria agricola";
    const prompt = `Lee ${purpose} completo y con atencion, incluyendo encabezado impreso, campos manuscritos, tablas, casillas y pie de pagina. ` +
      `Recorre el documento dos veces antes de responder. Extrae solamente lo visible, sin completar por contexto ni inventar. ` +
      `Si un dato no aparece o no se puede leer con seguridad, devuelve null (no uses la fecha actual ni nombres supuestos). ` +
      `La respuesta se revisara manualmente.\n` +
      `Para una NP, usa exactamente estos campos: el numero junto a N°, la fecha escrita en FECHA/FECHA DE OPERACION, ` +
      `lee los digitos uno por uno y no sustituyas un año visible por otro. ` +
      `cliente debe ser exclusivamente el texto escrito por el comprador junto a Apellido y Nombre/Razon Social. ` +
      `No uses el membrete CAMPOS DEL MANANA S.A., la empresa vendedora CDM, un nombre de firma, vendedor, operativo, ` +
      `domicilio ni destinatario como cliente. Conserva exactamente el nombre visible, incluidas las palabras S.A. ` +
      `Si el campo del comprador no se puede leer con seguridad, devuelve null y anotalo en campos_dudosos. ` +
      `comercial solo si hay un nombre escrito junto a Vendedor, Vendedores, ` +
      `Comercial u Operativo comercial. Nunca deduzcas el comercial a partir de una firma, sello o nombre del cliente. ` +
      `Los logos CLAAS, HORSCH y CDM del membrete no son la marca de la maquina. La marca debe salir exclusivamente ` +
      `de la descripcion manuscrita de esa linea; METASA y cualquier fabricante distinto de CLAAS/HORSCH es OTROS. ` +
      `En cada linea lee por separado Marca, Tipo, Modelo y Año: producto debe ser el tipo o descripcion ` +
      `(por ejemplo Cosechadora), modelo debe conservar el texto exacto del campo Modelo (por ejemplo Tucano 710), ` +
      `y anio solo el año visible. Si el campo Cabezal/Plataforma de la maquina vendida tiene contenido, crea una SEGUNDA ` +
      `linea independiente: producto Cabezal / plataforma, modelo con ese texto exacto, subgrupo PLATAFORMAS/CABEZALES, ` +
      `misma marca, cantidad, condicion y abastecimiento; deja cabezal en null en ambas lineas. No conviertas en linea un ` +
      `cabezal mencionado solamente dentro de una toma, permuta o maquina usada entregada como parte de pago. ` +
      `Una linea fisica de la tabla puede continuar escrita en el renglon siguiente: conserva todo como UNA sola maquina. ` +
      `No dividas palabras o fragmentos de una misma descripcion en varias lineas y no crees una linea por cada renglon manuscrito. ` +
      `No pongas el tipo dentro de modelo ` +
      `ni el modelo dentro de producto. Si el manuscrito es dudoso, deja ese campo en null y anotala en campos_dudosos. ` +
      `La condicion USADA solo se marca si la maquina de esa linea se describe explicitamente como usada. ` +
      `No marques como USADA la maquina ofertada por una mencion separada de toma, permuta o entrega de otra maquina usada; ` +
      `si la condicion de la maquina listada no aparece, usa NUEVA para que quede pendiente de revision manual. ` +
      `El abastecimiento solo es STOCK o IMPORTAR cuando hay evidencia explicita; en caso contrario usa DEFINIR.\n` +
      `CLAAS y HORSCH son las unicas marcas representadas inicialmente; cualquier otra es OTROS.\n` +
      `En facturas busca especialmente chasis, numero de factura y valor total facturado. ` +
      `Se conciso: observaciones maximo 120 caracteres y no agregues explicaciones.\n` +
      `Responde exclusivamente JSON valido con esta forma:\n${schema}`;

    const extraction = await requestDocumentExtraction(apiKey, prompt, dataUrl, mimeType);
    return json({ data: extraction.data, documentType, model: extraction.model });
  } catch (error) {
    console.error("[machine-document-extractor]", error);
    if (error instanceof ExtractionError) {
      if (error.code === "RATE_LIMIT") {
        return extractionIssue("Se alcanzo el limite temporal de lecturas. Espera unos segundos e intenta de nuevo.", error.code, true);
      }
      if (error.code === "AUTH") {
        return extractionIssue("El servicio de lectura no pudo autenticarse. Un administrador debe revisar la configuracion de GEMINI_API_KEY en Supabase.", error.code, false);
      }
      if (error.code === "PROVIDER") {
        const providerStatus = error.message.match(/\((\d{3})\)/)?.[1];
        const diagnostic = providerStatus ? ` (Gemini respondio ${providerStatus})` : "";
        return extractionIssue(`El servicio de lectura no esta disponible${diagnostic}. Reintenta o completa los campos manualmente.`, error.code, true);
      }
      return extractionIssue("La imagen fue recibida, pero el lector no pudo estructurar los datos. Reintenta o completa los campos manualmente.", error.code, true);
    }
    return json({ error: "No se pudo procesar el documento. Podes continuar con carga manual." }, 500);
  }
});
