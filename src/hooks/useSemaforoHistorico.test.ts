import { afterEach, describe, expect, it, vi } from "vitest";

const client = vi.hoisted(() => ({
  rest: { ready: true },
  rpc(this: { rest: { ready: boolean } }) {
    if (!this.rest.ready) throw new Error("RPC perdió el contexto del cliente");
    return Promise.resolve({ data: { rows: [], por_color: [], sucursales: [], lineas: 0, grupos: [], franjas: [], facetas: { familias: [], depositos: [], sucursales: [] }, version: "fixture", base_antiguedad: "ULTIMA_COMPRA_V1" }, error: null });
  },
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: client }));

import { fetchSemaforoHistorico } from "./useSemaforoHistorico";
afterEach(() => vi.restoreAllMocks());

describe("consulta del semáforo histórico", () => {
  it("invoca RPC conservando el contexto del cliente", async () => {
    const result = await fetchSemaforoHistorico({ busqueda: "", marca: "", color: "", sucursal: "" }, 0);
    expect(result.lineas).toBe(0);
  });
  it("rechaza un servidor sin el universo de Panorama en lugar de mostrar otro total", async () => {
    await expect(fetchSemaforoHistorico({ busqueda: "", marca: "", color: "", sucursal: "", universo: "STOCK_POSITIVO_PANORAMA" }, 0))
      .rejects.toThrow("Falta aplicar la conciliación");
  });
  it("separa el valor positivo mostrado del bruto y conserva el modo habitual", async () => {
    const base = await client.rpc();
    const data = { ...base.data, universo: "STOCK_POSITIVO_PANORAMA", valor_kardex_usd: 80, valor_elegible_usd: 100 };
    vi.spyOn(client, "rpc").mockResolvedValue({ data, error: null });
    const filters = { busqueda: "", marca: "", color: "", sucursal: "", universo: "STOCK_POSITIVO_PANORAMA" };
    const positive = await fetchSemaforoHistorico(filters, 0);
    expect(positive.valor_kardex_usd).toBe(100);
    expect(positive).toHaveProperty("valor_bruto_usd", 80);
    expect((await fetchSemaforoHistorico({ ...filters, universo: undefined }, 0)).valor_kardex_usd).toBe(80);
  });
});
