import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

import { ExtractionError, extractionIssueMessage, requestDocumentExtraction, type ExtractionIssueCode } from "./gemini.ts";

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
    "marca": "fabricante exacto visible o null",
    "producto": "tipo o descripcion de la maquina tal como aparece, por ejemplo Cosechadora",
    "modelo": "modelo exacto tal como aparece en el campo Modelo, por ejemplo Tucano 710",
    "anio": "numero o null",
    "cabezal": "solo compatibilidad: usa null y crea otra linea para el cabezal",
    "cantidad": 1,
    "condicion": "NUEVA | USADA",
    "abastecimiento": "DEFINIR | STOCK | IMPORTAR",
    "subgrupo": "TRACTORES | COSECHADORAS | PICADORAS | SEMBRADORAS | PLATAFORMAS/CABEZALES | PULVERIZADORAS | SUELO | OTRO",
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
  "marca": "fabricante exacto visible o null",
  "modelo": "texto o null",
  "chasis": ["texto"],
  "confianza": {"global": 0.0, "campos_dudosos": []},
  "observaciones": "texto breve"
}`;

function validateExtraction(data: unknown, documentType: "NP" | "FACTURA_IMPORTACION") {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new ExtractionError("Gemini returned an invalid object", 422, "INVALID_OUTPUT");
  }
  const value = data as Record<string, unknown>;
  if (documentType === "NP") {
    if (!Array.isArray(value.lineas)) {
      throw new ExtractionError("Gemini response has no order lines", 422, "INVALID_OUTPUT");
    }
    const lines = value.lineas.filter((line) => {
      if (!line || typeof line !== "object" || Array.isArray(line)) return false;
      const item = line as Record<string, unknown>;
      return [item.marca, item.producto, item.modelo].some((field) => typeof field === "string" && field.trim());
    });
    if (!lines.length) {
      throw new ExtractionError("Gemini response has no usable order lines", 422, "INVALID_OUTPUT");
    }
    return { ...value, lineas: lines };
  }
  const hasInvoiceData = [value.factura_numero, value.np_numero, value.modelo]
    .some((field) => typeof field === "string" && field.trim())
    || (Array.isArray(value.chasis) && value.chasis.length > 0)
    || (typeof value.valor_facturado === "number" && Number.isFinite(value.valor_facturado));
  if (!hasInvoiceData) {
    throw new ExtractionError("Gemini response has no usable invoice data", 422, "INVALID_OUTPUT");
  }
  return value;
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
      `de la descripcion manuscrita de esa linea. Devuelve el fabricante exacto visible (por ejemplo METASA, JOHN DEERE, ` +
      `NEW HOLLAND, CLAAS o HORSCH); nunca reemplaces una marca legible por OTROS. Si no es legible, devuelve null. ` +
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
      `El abastecimiento solo es STOCK o IMPORTAR cuando hay evidencia explicita; en caso contrario usa DEFINIR. ` +
      `Clasifica C - Picadora como PLATAFORMAS/CABEZALES, M - Picadora como PICADORAS y Direct Disc como PLATAFORMAS/CABEZALES.\n` +
      `Las marcas no estan limitadas a un listado cerrado.\n` +
      `En facturas busca especialmente chasis, numero de factura y valor total facturado. ` +
      `En observaciones conserva condiciones comerciales, cuotas, fechas, anticipos, permutas y garantias visibles; no agregues explicaciones.\n` +
      `Responde exclusivamente JSON valido con esta forma:\n${schema}`;

    const extraction = await requestDocumentExtraction(
      apiKey, prompt, dataUrl, mimeType, Deno.env.get("GEMINI_VISION_MODEL"),
      (data) => validateExtraction(data, documentType),
    );
    return json({ data: extraction.data, documentType, model: extraction.model });
  } catch (error) {
    console.error("[machine-document-extractor]", error);
    if (error instanceof ExtractionError) {
      return extractionIssue(extractionIssueMessage(error), error.code, !["AUTH", "RATE_LIMIT", "CONFIG", "INVALID_INPUT"].includes(error.code));
    }
    return json({ error: "No se pudo procesar el documento. Podes continuar con carga manual." }, 500);
  }
});
