import { describe, expect, it, vi } from "vitest";
import { readProductivityGoal, PRODUCTIVITY_GOAL_KEY } from "./productivityGoal";

function fixture(data: unknown, error: unknown = null) {
  const eq = vi.fn();
  const result = Promise.resolve({ data, error });
  const request = { maybeSingle: () => result };
  eq.mockReturnValue(request);
  const from = vi.fn(() => ({ select: vi.fn(() => ({ eq })) }));
  return { client: { from }, from, eq };
}
describe("shared productivity goal source", () => {
  it("reads the exact saved Parameters key, including non-default values", async () => {
    const source = fixture({ valor_numero: "144.5" });
    expect(await readProductivityGoal(source.client)).toEqual({ value: 144.5, warning: null, reason: "ready" });
    expect(source.from).toHaveBeenCalledWith("app_configuracion");
    expect(source.eq).toHaveBeenCalledWith("clave", PRODUCTIVITY_GOAL_KEY);
  });
  it.each([0, -1, null, true, "", "NaN", Infinity])("rejects invalid saved value %s", async valor_numero => {
    expect(await readProductivityGoal(fixture({ valor_numero }).client)).toMatchObject({ value: null, reason: "invalid" });
  });
  it.each([["42P01", "schema"], ["PGRST205", "schema"], ["42501", "access"], ["PGRST301", "access"], ["503", "read-error"]])("distinguishes %s errors without inserting 132", async (code, reason) => {
    expect(await readProductivityGoal(fixture(null, { code }).client)).toMatchObject({ value: null, reason });
  });
  it("does not mistake a row hidden by RLS for a confirmed missing parameter", async () => {
    expect(await readProductivityGoal(fixture(null).client)).toMatchObject({ value: null, reason: "not-visible" });
  });
  it("keeps network failure unknown and propagates cancellation", async () => {
    const client = { from: () => { throw new Error("offline"); } };
    expect(await readProductivityGoal(client)).toMatchObject({ value: null, reason: "read-error" });
    await expect(readProductivityGoal(client, AbortSignal.abort())).rejects.toBeDefined();
  });
});
