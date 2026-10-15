import React from "react";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: mock }));
import { useSemaforoListado } from "./useSemaforoHistorico";
const filters = { busqueda: "", marca: "", color: "", sucursal: "" };
function page(offset: number, version = "v1", brand = "HORSCH") {
  return { base_antiguedad: "ULTIMA_COMPRA_V1", version, lineas: 75, grupos: [], franjas: [], por_color: [], sucursales: [], facetas: { familias: [], depositos: [], sucursales: [] }, rows: Array.from({ length: offset === 0 ? 50 : 25 }, (_, i) => ({ codigo_interno: `${brand}-${offset+i}` })) };
}
beforeEach(() => { mock.rpc.mockReset(); });
function wrapper({ children }: { children: React.ReactNode }) { const [client] = React.useState(() => new QueryClient({defaultOptions:{queries:{retry:false,notifyOnChangeProps:"all"}}})); return <QueryClientProvider client={client}>{children}</QueryClientProvider>; }
it("acumula páginas y al filtrar inicia otro conjunto", async () => {
  mock.rpc.mockImplementation(async (_, args) => ({ data: page(args.p_offset, "v1", args.p_filtros.marca || "HORSCH"), error: null }));
  const { result, rerender } = renderHook(({ marca }) => useSemaforoListado({ ...filters, marca }, "marca"), { wrapper, initialProps: { marca: "" } });
  await waitFor(() => expect(result.current.data?.pages[0].rows).toHaveLength(50));
  await act(async () => { await result.current.fetchNextPage(); });
  await waitFor(() => expect(result.current.data?.pages.flatMap(p => p.rows)).toHaveLength(75));
  expect(result.current.hasNextPage).toBe(false);
  rerender({ marca: "CLAAS" });
  await waitFor(() => expect(result.current.data?.pages[0].rows[0].codigo_interno).toBe("CLAAS-0"));
  expect(result.current.data?.pages).toHaveLength(1);
});
it("no mezcla páginas de cortes distintos", async () => {
  mock.rpc.mockImplementation(async (_, args) => ({ data: page(args.p_offset, args.p_offset ? "v2" : "v1"), error: null }));
  const { result } = renderHook(() => useSemaforoListado(filters, "marca"), { wrapper });
  await waitFor(() => expect(result.current.data?.pages[0].rows).toHaveLength(50));
  await act(async () => { await result.current.fetchNextPage(); });
  await waitFor(() => expect(result.current.error?.message).toMatch(/inventario cambió/));
  expect(result.current.data?.pages).toHaveLength(1);
});
