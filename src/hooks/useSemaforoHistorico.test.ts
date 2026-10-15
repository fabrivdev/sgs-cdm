import { describe, expect, it, vi } from "vitest";

const client = vi.hoisted(() => ({
  rest: { ready: true },
  rpc(this: { rest: { ready: boolean } }) {
    if (!this.rest.ready) throw new Error("RPC perdió el contexto del cliente");
    return Promise.resolve({ data: { rows: [], por_color: [], sucursales: [], lineas: 0, grupos: [], franjas: [], facetas: { familias: [], depositos: [], sucursales: [] }, version: "fixture", base_antiguedad: "ULTIMA_COMPRA_V1" }, error: null });
  },
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: client }));

import { fetchSemaforoHistorico } from "./useSemaforoHistorico";

describe("consulta del semáforo histórico", () => {
  it("invoca RPC conservando el contexto del cliente", async () => {
    const result = await fetchSemaforoHistorico({ busqueda: "", marca: "", color: "", sucursal: "" }, 0);
    expect(result.lineas).toBe(0);
  });
});
