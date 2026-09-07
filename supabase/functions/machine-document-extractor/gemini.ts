export type ExtractionIssueCode = "RATE_LIMIT" | "AUTH" | "PROVIDER" | "TIMEOUT" | "NETWORK" | "INVALID_OUTPUT" | "INVALID_INPUT" | "CONFIG";

export class ExtractionError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: ExtractionIssueCode,
    readonly model?: string,
  ) {
    super(message);
  }
}

const API = "https://generativelanguage.googleapis.com/v1beta/models";
const GENERATION_TIMEOUT_MS = 45_000;
const DISCOVERY_TIMEOUT_MS = 10_000;
const TOTAL_TIMEOUT_MS = 110_000;

export function extractionIssueMessage(error: ExtractionError): string {
  switch (error.code) {
    case "TIMEOUT": return "Gemini tardó demasiado en responder y se agotó el tiempo de lectura. Podés reintentar.";
    case "NETWORK": return "No se pudo conectar con Gemini. Podés reintentar en unos segundos.";
    case "RATE_LIMIT": return "Gemini informó que se alcanzó el límite de uso. Revisá la cuota de la API antes de reintentar.";
    case "AUTH": return "Gemini rechazó la clave o sus permisos. Un administrador debe revisar la configuración del lector.";
    case "INVALID_OUTPUT": return "Gemini respondió, pero no se pudieron leer los datos completos. Probá con una foto más nítida.";
    default: return `Gemini no pudo completar la lectura (respuesta ${error.status}). Podés reintentar.`;
  }
}

function extractJson(raw: string): unknown {
  const source = (raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] ?? raw).trim();
  const start = source.indexOf("{");
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; start >= 0 && index < source.length; index += 1) {
    const character = source[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
    } else if (character === '"') inString = true;
    else if (character === "{") depth += 1;
    else if (character === "}" && --depth === 0) return JSON.parse(source.slice(start, index + 1));
  }
  throw new ExtractionError("Incomplete JSON", 422, "INVALID_OUTPUT");
}

// The timer covers both headers and the entire body. Fetch alone can resolve
// before Gemini has finished sending its answer.
async function requestJson(url: string, init: RequestInit, timeoutMs: number, model?: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok) {
      await response.body?.cancel();
      const code = response.status === 429 ? "RATE_LIMIT"
        : [401, 403].includes(response.status) ? "AUTH" : "PROVIDER";
      throw new ExtractionError(`Gemini HTTP ${response.status}`, response.status, code, model);
    }
    return await response.json();
  } catch (error) {
    if (error instanceof ExtractionError) throw error;
    if (controller.signal.aborted || (error instanceof Error && /^(TimeoutError|AbortError)$/.test(error.name))) {
      throw new ExtractionError("Gemini timed out", 504, "TIMEOUT", model);
    }
    if (error instanceof SyntaxError) throw new ExtractionError("Invalid response JSON", 422, "INVALID_OUTPUT", model);
    throw new ExtractionError("Gemini connection failed", 503, "NETWORK", model);
  } finally {
    clearTimeout(timer);
  }
}

function modelScore(model: string) {
  return (/^gemini-\d+(?:\.\d+)?-flash$/.test(model) ? 100 : 0)
    + (model.includes("flash") ? 50 : 0)
    + (model.includes("latest") ? 20 : 0)
    - (model.includes("lite") ? 10 : 0)
    - (/preview|experimental|exp/.test(model) ? 20 : 0);
}

export async function requestDocumentExtraction(
  apiKey: string,
  prompt: string,
  dataUrl: string,
  mimeType: string,
  configuredModel?: string,
  validate: (data: unknown) => unknown = (data) => data,
) {
  const deadline = Date.now() + TOTAL_TIMEOUT_MS;
  const configured = configuredModel?.trim().replace(/^models\//, "");
  const queue = configured ? [configured] : [];
  const attempted = new Set<string>();
  let discovered = false;
  let lastFailure: ExtractionError | undefined;
  const remaining = () => deadline - Date.now();

  // A configured model is called directly. Model discovery is only needed
  // when no model is configured, or when that model could not complete.
  while (attempted.size < 3 && remaining() > 1_000) {
    if (!queue.length) {
      if (discovered) break;
      discovered = true;
      try {
        const payload = await requestJson(`${API}?pageSize=1000`, {
          headers: { "x-goog-api-key": apiKey },
        }, Math.min(DISCOVERY_TIMEOUT_MS, remaining()));
        const models = Array.isArray(payload?.models) ? payload.models : [];
        queue.push(...models
          .filter((model: { supportedGenerationMethods?: string[] }) => model.supportedGenerationMethods?.includes("generateContent"))
          .map((model: { name?: string }) => typeof model.name === "string" ? model.name.replace(/^models\//, "") : "")
          .filter((model: string) => model.startsWith("gemini-") && model.includes("flash")
            && !/(?:image|live|tts|transcribe|embedding)/.test(model) && !attempted.has(model))
          .sort((a: string, b: string) => modelScore(b) - modelScore(a)));
      } catch (error) {
        if (!(error instanceof ExtractionError)) throw error;
        if (["AUTH", "RATE_LIMIT"].includes(error.code) || !lastFailure) throw error;
        break;
      }
    }
    const model = queue.shift();
    if (!model) break;
    attempted.add(model);
    for (const jsonMode of [true, false]) {
      if (remaining() <= 1_000) break;
      const generationConfig: Record<string, unknown> = { maxOutputTokens: 8192 };
      if (jsonMode) generationConfig.responseMimeType = "application/json";
      // Gemini 2.5 supports a token budget. Do not send this option to
      // unrelated model generations with different thinking controls.
      if (/^gemini-2\.5-flash(?:-|$)/.test(model)) generationConfig.thinkingConfig = { thinkingBudget: 1024 };
      try {
        const completion = await requestJson(`${API}/${encodeURIComponent(model)}:generateContent`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [
              { text: prompt },
              { inlineData: { mimeType, data: dataUrl.slice(dataUrl.indexOf(",") + 1) } },
            ] }],
            generationConfig,
          }),
        }, Math.min(GENERATION_TIMEOUT_MS, remaining()), model);
        const candidate = completion?.candidates?.[0];
        const raw = candidate?.content?.parts
          ?.filter((part: { thought?: boolean; text?: unknown }) => !part.thought && typeof part.text === "string")
          .map((part: { text: string }) => part.text).join("").trim();
        if (!raw || (candidate.finishReason && candidate.finishReason !== "STOP")) {
          throw new ExtractionError(`Unusable completion: ${candidate?.finishReason ?? "empty"}`, 422, "INVALID_OUTPUT", model);
        }
        let data: unknown;
        try { data = validate(extractJson(raw)); }
        catch { throw new ExtractionError("Invalid document structure", 422, "INVALID_OUTPUT", model); }
        return { data, model };
      } catch (error) {
        if (!(error instanceof ExtractionError)) throw error;
        lastFailure = error;
        // Do not log invoice text, images or provider bodies containing data.
        console.warn("[machine-document-extractor] Attempt failed", { model, code: error.code, status: error.status });
        if (["AUTH", "RATE_LIMIT"].includes(error.code)) throw error;
        if (error.status === 400 && jsonMode) continue;
        // Timeouts, connection errors, removed models and malformed answers
        // all reach the next available model within the overall time budget.
        break;
      }
    }
  }
  if (remaining() <= 1_000) throw new ExtractionError("Reading deadline reached", 504, "TIMEOUT");
  throw lastFailure ?? new ExtractionError("No compatible model available", 404, "PROVIDER");
}
