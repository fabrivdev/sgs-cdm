import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useOrdersBilling } from "./useOrdersBilling";
import { useServiceOrders } from "./useServiceOrders";
import { demoBilling, operationsFixture } from "@/test/serviceOrdersFixture";
const mocks = vi.hoisted(() => ({ user: "U1", billing: vi.fn(), operations: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: mocks.user } }) }));
vi.mock("./billing", async original => ({ ...await original<typeof import("./billing")>(), loadOrderBilling: mocks.billing }));
vi.mock("./data", async original => ({ ...await original<typeof import("./data")>(), loadOperationsData: mocks.operations }));
let cache: QueryClient;
function wrapper({ children }: { children: ReactNode }) { return <QueryClientProvider client={cache}>{children}</QueryClientProvider>; }
beforeEach(() => {
  vi.clearAllMocks(); mocks.user = "U1";
  cache = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  mocks.billing.mockImplementation((_client, keys: string[]) => Promise.resolve(Object.fromEntries(keys.map(os => [os, demoBilling({ os })]))));
  mocks.operations.mockResolvedValue({ data: operationsFixture(), capacityWarning: null });
});
afterEach(() => { cleanup(); cache.clear(); });
describe("independent financial query", () => {
  it("finishes the operational query even while financial work is unresolved", async () => {
    mocks.billing.mockImplementation(() => new Promise(() => {}));
    const { result } = renderHook(() => ({
      base: useServiceOrders("2026-09-01", "2026-09-25"),
      financial: useOrdersBilling(["01-A"], "2026-09-25", true),
    }), { wrapper });
    await waitFor(() => expect(result.current.base.isSuccess).toBe(true));
    expect(result.current.base.data?.data.ordenesServicio).toHaveLength(2);
    expect(result.current.financial.isPending).toBe(true);
  });
  it("does not run for compliance, empty populations or disabled operational data", async () => {
    const { rerender } = renderHook(({ keys, enabled }) => useOrdersBilling(keys, "2026-09-25", enabled), {
      wrapper, initialProps: { keys: ["01-A"], enabled: false },
    });
    expect(mocks.billing).not.toHaveBeenCalled();
    rerender({ keys: [], enabled: true });
    expect(mocks.billing).not.toHaveBeenCalled();
    rerender({ keys: ["01-A"], enabled: true });
    await waitFor(() => expect(mocks.billing).toHaveBeenCalledOnce());
  });
  it("shares cache for equal identities, but never across cutoff dates or users", async () => {
    const { result, rerender } = renderHook(({ keys, date }) => useOrdersBilling(keys, date, true), {
      wrapper, initialProps: { keys: ["02-A", " 01-a "], date: "2026-09-25" },
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    rerender({ keys: ["01-A", "02-A", "01-A"], date: "2026-09-25" });
    expect(mocks.billing).toHaveBeenCalledOnce();
    expect(mocks.billing.mock.calls[0][1]).toEqual(["01-A", "02-A"]);
    rerender({ keys: ["01-A", "02-A"], date: "2026-09-26" });
    await waitFor(() => expect(mocks.billing).toHaveBeenCalledTimes(2));
    mocks.user = "U2";
    rerender({ keys: ["01-A", "02-A"], date: "2026-09-26" });
    await waitFor(() => expect(mocks.billing).toHaveBeenCalledTimes(3));
  });
  it("cancels an obsolete population and does not expose the previous amounts", async () => {
    mocks.billing.mockImplementation(() => new Promise(() => {}));
    const { result, rerender } = renderHook(({ keys }) => useOrdersBilling(keys, "2026-09-25", true), {
      wrapper, initialProps: { keys: ["01-A"] },
    });
    await waitFor(() => expect(mocks.billing).toHaveBeenCalledOnce());
    const previousSignal = mocks.billing.mock.calls[0][3] as AbortSignal;
    rerender({ keys: ["02-A"] });
    await waitFor(() => expect(mocks.billing).toHaveBeenCalledTimes(2));
    expect(previousSignal.aborted).toBe(true);
    expect(result.current.data).toBeUndefined();
  });
});
