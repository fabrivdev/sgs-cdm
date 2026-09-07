import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExtractionError, extractionIssueMessage, requestDocumentExtraction } from "../../supabase/functions/machine-document-extractor/gemini";

const data = { np_numero: "NP1355", lineas: [{ marca: "CLAAS", modelo: "TRION 740" }] };
const answer = (value: unknown = data, finishReason = "STOP") => Response.json({ candidates: [{ finishReason, content: { parts: [{ text: JSON.stringify(value) }] } }] });
const catalog = () => Response.json({ models: [
  { name: "models/gemini-2.5-flash", supportedGenerationMethods: ["generateContent"] },
  { name: "models/gemini-2.5-flash-lite", supportedGenerationMethods: ["generateContent"] },
] });
const read = (model?: string, validate?: (value: unknown) => unknown) => requestDocumentExtraction("test-key", "Read this NP", "data:image/jpeg;base64,dGVzdA==", "image/jpeg", model, validate);
const untilAbort = (_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
  init.signal!.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
});

describe("Gemini document reading recovery", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it("uses the configured model without a dependency on models.list", async () => {
    fetchMock.mockResolvedValueOnce(answer());
    expect(await read(" models/gemini-2.5-flash ")).toEqual({ data, model: "gemini-2.5-flash" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain("/gemini-2.5-flash:generateContent");
  });

  it("allows a valid 30-second reading that used to be cut off at 25 seconds", async () => {
    fetchMock.mockImplementationOnce(() => new Promise(resolve => setTimeout(() => resolve(answer()), 30_000)));
    const result = read("gemini-2.5-flash");
    await vi.advanceTimersByTimeAsync(30_000);
    expect((await result).data).toEqual(data);
  });

  it("tries another available model after an actual timeout", async () => {
    fetchMock.mockImplementationOnce(untilAbort).mockResolvedValueOnce(catalog()).mockResolvedValueOnce(answer());
    const result = read("gemini-2.5-flash");
    await vi.advanceTimersByTimeAsync(45_000);
    expect(await result).toEqual({ data, model: "gemini-2.5-flash-lite" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("recovers when the body stalls after receiving response headers", async () => {
    fetchMock.mockImplementationOnce((_url: string, init: RequestInit) => Promise.resolve({
      ok: true,
      json: () => untilAbort(_url, init),
    })).mockResolvedValueOnce(catalog()).mockResolvedValueOnce(answer());
    const result = read("gemini-2.5-flash");
    await vi.advanceTimersByTimeAsync(45_000);
    expect((await result).data).toEqual(data);
  });

  it("discovers a replacement for a retired configured model", async () => {
    fetchMock.mockResolvedValueOnce(new Response("not found", { status: 404 })).mockResolvedValueOnce(catalog()).mockResolvedValueOnce(answer());
    expect((await read("retired-model")).data).toEqual(data);
  });

  it.each([401, 403, 429])("stops on HTTP %s without cycling through models", async (status) => {
    fetchMock.mockResolvedValueOnce(new Response("rejected", { status }));
    await expect(read("gemini-2.5-flash")).rejects.toMatchObject({ status, code: status === 429 ? "RATE_LIMIT" : "AUTH" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries invalid extracted structure using a different model", async () => {
    fetchMock.mockResolvedValueOnce(answer({})).mockResolvedValueOnce(catalog()).mockResolvedValueOnce(answer());
    const validate = (value: unknown) => { if (!(value as typeof data)?.lineas) throw new Error("No lines"); return value; };
    expect((await read("gemini-2.5-flash", validate)).data).toEqual(data);
  });

  it("does not accept output cut off by the token limit", async () => {
    fetchMock.mockResolvedValueOnce(answer(data, "MAX_TOKENS")).mockResolvedValueOnce(catalog()).mockResolvedValueOnce(answer());
    expect((await read("gemini-2.5-flash")).model).toBe("gemini-2.5-flash-lite");
  });

  it("recovers from connection failures", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed")).mockResolvedValueOnce(catalog()).mockResolvedValueOnce(answer());
    expect((await read("gemini-2.5-flash")).data).toEqual(data);
  });

  it("finishes within the overall budget when all models hang", async () => {
    fetchMock.mockImplementation((url: string, init: RequestInit) => url.includes("pageSize") ? Promise.resolve(catalog()) : untilAbort(url, init));
    const result = read("configured-model").catch(error => error);
    await vi.advanceTimersByTimeAsync(110_000);
    expect(await result).toMatchObject({ code: "TIMEOUT" });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("explains a timeout instead of presenting it as an unavailable service", () => {
    expect(extractionIssueMessage(new ExtractionError("timeout", 504, "TIMEOUT"))).toContain("agotó el tiempo");
  });
});
