import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadProductivityGoalSetting, PRODUCTIVITY_GOAL_KEY, saveMonthlyProductivityGoal } from "./appSettings";

const mocks = vi.hoisted(() => ({ from: vi.fn(), upsert: vi.fn(), read: vi.fn(), eq: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mocks.from } }));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.from.mockImplementation(() => ({ upsert: mocks.upsert, select: () => ({ eq: mocks.eq }) }));
  mocks.eq.mockImplementation(() => ({ maybeSingle: mocks.read }));
  mocks.upsert.mockResolvedValue({ error: null });
  mocks.read.mockResolvedValue({ data: { valor_numero: "144.5" }, error: null });
});

describe("saving the productivity goal", () => {
  it("creates a missing setting and verifies it through the shared reader", async () => {
    mocks.read.mockResolvedValueOnce({ data: null, error: null });
    expect((await loadProductivityGoalSetting()).value).toBeNull();
    await expect(saveMonthlyProductivityGoal(144.5)).resolves.toBeUndefined();
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({ clave: PRODUCTIVITY_GOAL_KEY, valor_numero: 144.5 }));
    expect(mocks.eq).toHaveBeenLastCalledWith("clave", PRODUCTIVITY_GOAL_KEY);
    expect(mocks.read).toHaveBeenCalledTimes(2);
    expect(mocks.from.mock.calls.every(([table]) => table === "app_configuracion")).toBe(true);
  });
  it("does not report success when the saved row is not visible", async () => {
    mocks.read.mockResolvedValue({ data: null, error: null });
    await expect(saveMonthlyProductivityGoal(144.5)).rejects.toThrow("No se pudo verificar");
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
  });
  it("does not retry writes or report success when readback fails", async () => {
    mocks.read.mockResolvedValue({ data: null, error: { code: "42501" } });
    await expect(saveMonthlyProductivityGoal(144.5)).rejects.toThrow("No se pudo verificar");
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
  });
  it("detects a different readback value", async () => {
    mocks.read.mockResolvedValue({ data: { valor_numero: 160 }, error: null });
    await expect(saveMonthlyProductivityGoal(144.5)).rejects.toThrow("no coincide");
  });
  it("preserves a write failure instead of querying a prior value", async () => {
    const error = { code: "42501", message: "write denied" };
    mocks.upsert.mockResolvedValue({ error });
    await expect(saveMonthlyProductivityGoal(144.5)).rejects.toEqual(error);
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it.each([0, -1, NaN, Infinity])("rejects invalid input %s without writing", async value => {
    await expect(saveMonthlyProductivityGoal(value)).rejects.toThrow("mayor que cero");
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
