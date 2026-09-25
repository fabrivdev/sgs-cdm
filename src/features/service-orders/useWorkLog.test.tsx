import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkLog } from "./useWorkLog";
const mocks = vi.hoisted(() => ({ user: "U1", load: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: mocks.user } }) }));
vi.mock("./workLog", () => ({ loadWorkLog: mocks.load }));
let cache: QueryClient;
function wrapper({ children }: { children: ReactNode }) { return <QueryClientProvider client={cache}>{children}</QueryClientProvider>; }
beforeEach(() => {
  vi.clearAllMocks(); mocks.user = "U1"; mocks.load.mockResolvedValue([]);
  cache = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
});
afterEach(() => { cleanup(); cache.clear(); });
describe("dated work query", () => {
  it("stays lazy outside productivity or the drawer and refuses invalid ranges", async () => {
    const { rerender, result } = renderHook(({ enabled, from }) => useWorkLog(from, "2026-09-25", enabled), {
      wrapper, initialProps: { enabled: false, from: "2026-09-01" },
    });
    expect(mocks.load).not.toHaveBeenCalled();
    rerender({ enabled: true, from: "2026-09-26" });
    expect(mocks.load).not.toHaveBeenCalled();
    rerender({ enabled: true, from: "2026-09-01" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mocks.load).toHaveBeenCalledOnce();
  });
  it("isolates the full OS drawer, dates and authenticated users", async () => {
    const { result, rerender } = renderHook(({ from, os }) => useWorkLog(from, "2026-09-25", true, os), {
      wrapper, initialProps: { from: "2026-09-01", os: null as string | null },
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    rerender({ from: "2026-09-01", os: "01-A" });
    await waitFor(() => expect(mocks.load).toHaveBeenCalledTimes(2));
    rerender({ from: "2026-09-02", os: "01-A" });
    await waitFor(() => expect(mocks.load).toHaveBeenCalledTimes(3));
    mocks.user = "U2";
    rerender({ from: "2026-09-02", os: "01-A" });
    await waitFor(() => expect(mocks.load).toHaveBeenCalledTimes(4));
  });
  it("cancels obsolete ranges without displaying previous work", async () => {
    mocks.load.mockImplementation(() => new Promise(() => {}));
    const { result, rerender } = renderHook(({ from }) => useWorkLog(from, "2026-09-25", true), {
      wrapper, initialProps: { from: "2026-09-01" },
    });
    await waitFor(() => expect(mocks.load).toHaveBeenCalledOnce());
    const signal = mocks.load.mock.calls[0][4] as AbortSignal;
    rerender({ from: "2026-09-02" });
    await waitFor(() => expect(mocks.load).toHaveBeenCalledTimes(2));
    expect(signal.aborted).toBe(true); expect(result.current.data).toBeUndefined();
  });
});
