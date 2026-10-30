import { beforeEach, describe, expect, it, vi } from "vitest";
import { attachProjectedStockYtd, loadProjectedStockYtd } from "./projectedStockYtd";
import type { MachineCatalog } from "./machineOrderValidation";
const { rpc, loadMachineCatalog } = vi.hoisted(() => ({ rpc: vi.fn(), loadMachineCatalog: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));
vi.mock("@/hooks/useMachineCatalog", () => ({ loadMachineCatalog }));
const catalog: MachineCatalog = {
 brands: [{ nombre: "HORSCH", activa: true }, { nombre: "CLAAS", activa: true }],
 models: [{ id: "h", nombre: "MAESTRO EVOLUTION 32", marca_nombre: "HORSCH", subgrupo: "SEMBRADORAS", activo: true }],
 aliases: [{ marca: "HORSCH", alias: "MAESTRO 32 EV", modelo_catalogo_id: "h" }],
};
const sale = { marca: "HORSCH", tipo_maquina: "SEMBRADORAS", modelo: "MAESTRO EVOLUTION 32", condicion: "NUEVA", vendidas: 3, netas: 2, notas_credito: 1 };
const eligible = { programa: "HORSCH", marca: "HORSCH", tipo: "SEMBRADORAS", modelo: "MAESTRO EVOLUTION 32", stock: 2, pedidos_compra: 1, disponibilidad: 3, ventas_pendientes: 1, stock_proyectado: 2, arribos_periodo: 0, ventas_netas_periodo: 0 };
beforeEach(() => { rpc.mockReset(); loadMachineCatalog.mockResolvedValue(catalog); });
describe("YTD from the existing machine sales dashboard", () => {
 it("requests January through the selected cutoff, including a changed year", async () => {
  rpc.mockResolvedValue({ data: { por_modelo: [sale] }, error: null });
  expect((await loadProjectedStockYtd([eligible], "2026-10-22"))[0].vendidas_ytd).toBe(2);
  expect(rpc).toHaveBeenLastCalledWith("ventas_maquinas_dashboard_filtros_v2", expect.objectContaining({ p_desde: "2026-01-01", p_hasta: "2026-10-22", p_sucursal: null }));
  await loadProjectedStockYtd([eligible], "2027-01-02");
  expect(rpc).toHaveBeenLastCalledWith("ventas_maquinas_dashboard_filtros_v2", expect.objectContaining({ p_desde: "2027-01-01", p_hasta: "2027-01-02" }));
 });
 it("uses net units, excludes used and merges catalog aliases", () => {
  const sourceSales = [sale, { ...sale, modelo: "MAESTRO 32 EV", vendidas: 2, netas: 1 }, { ...sale, condicion: "USADA", vendidas: 9, netas: 8 }];
  const rows = attachProjectedStockYtd([eligible], sourceSales, catalog);
  expect(rows).toHaveLength(1); expect(rows[0].vendidas_ytd).toBe(3);
 });
 it("does not invent an Evolution alias or collapse a different brand", () => {
  const rows = attachProjectedStockYtd([eligible], [sale, { ...sale, modelo: "EVOLUTION 32" }, { ...sale, marca: "CLAAS" }], catalog);
  expect(rows).toHaveLength(1); expect(rows[0].vendidas_ytd).toBe(2);
 });
 it("does not duplicate sales across legacy projection rows or modify already calculated balances", () => {
  const source = attachProjectedStockYtd([eligible], [sale], catalog)[0];
  const result = attachProjectedStockYtd([{ ...source, stock: 2 }, { ...source, modelo: "MAESTRO 32 EV", stock: -1 }], [sale], catalog);
  expect(result.map(r=>r.stock)).toEqual([2,-1]);
  expect(result.map(r=>r.vendidas_ytd)).toEqual([2,null]);
 });
 it("retains negative net returns and zero monetary-only adjustments supplied by the source", () => {
  const sourceSales = [{ ...sale, vendidas: 0, notas_credito: 2, netas: -2 }, { ...sale, vendidas: 0, notas_credito: 0, netas: 0 }];
  const rows = attachProjectedStockYtd([eligible], sourceSales, catalog);
  expect(rows[0].vendidas_ytd).toBe(-2);
 });
 it("never creates stock rows or filter labels from unmatched sales, including returned KRONE", () => {
  const external = { ...sale, marca: "OTROS", tipo_maquina: "ENFARDADORA - MARCA: KRONE - MODELO: BIG PACK 1290 XC - CASIS:", modelo: "BIG PACK 1290 XC", netas: -1 };
  expect(attachProjectedStockYtd([], [external], catalog)).toEqual([]);
  const rows = attachProjectedStockYtd([eligible], [sale, external], catalog);
  expect(rows).toHaveLength(1); expect(rows[0].vendidas_ytd).toBe(2);
  expect(rows[0].stock).toBe(eligible.stock); expect(rows[0].pedidos_compra).toBe(eligible.pedidos_compra);
 });
 it("keeps legitimate unknown-brand stock balances and takes labels only from unique catalog matches", () => {
  const raw = { ...eligible, marca: "OTROS", tipo: "DESCRIPCION LARGA", modelo: "MAESTRO 32 EV" };
  const unknown = { ...eligible, marca: "KRONE", modelo: "SIN EQUIVALENCIA", stock: 5 };
  const rows = attachProjectedStockYtd([raw, unknown], [sale], catalog);
  expect(rows[0]).toMatchObject({ marca: "HORSCH", tipo: "SEMBRADORAS", modelo: "MAESTRO EVOLUTION 32", stock: 2 });
  expect(rows[1]).toMatchObject({ marca: "KRONE", modelo: "SIN EQUIVALENCIA", stock: 5 });
 });
 it("includes uniquely cataloged sales-only models without inventing stock and merges aliases once", () => {
  const extended: MachineCatalog = { ...catalog,
    models: [...catalog.models,
      { id: "evo", marca_nombre: "HORSCH", nombre: "EVO 7 TL R", subgrupo: "SUELO", activo: true },
      { id: "dakar", marca_nombre: "HORSCH", nombre: "DAKAR 8 CF", subgrupo: "SEMBRADORAS", activo: true }],
    aliases: [...catalog.aliases, { marca: "HORSCH", alias: "DAKAR OCHO", modelo_catalogo_id: "dakar", revisado_manual: true }],
  };
  const rows = attachProjectedStockYtd([eligible], [sale,
    { ...sale, modelo: "EVO 7 TL R", tipo_maquina: "SUELO", netas: 4 },
    { ...sale, modelo: "DAKAR 8 CF", netas: 6 },
    { ...sale, modelo: "DAKAR OCHO", netas: -1 }], extended);
  expect(rows).toHaveLength(3);
  expect(rows.find(r=>r.modelo_catalogo_id === "evo")).toMatchObject({vendidas_ytd:4,stock:0,pedidos_compra:0,stock_proyectado:0,tipo:"SUELO"});
  expect(rows.find(r=>r.modelo_catalogo_id === "dakar")).toMatchObject({vendidas_ytd:5,stock:0});
  expect(rows.reduce((n,r)=>n+(r.vendidas_ytd??0),0)).toBe(11);
 });
 it("does not add archived, ambiguous or wrong-brand sales-only identities", () => {
  const extended: MachineCatalog = { ...catalog, models: [...catalog.models,
    { id: "old", marca_nombre:"HORSCH", nombre:"OLD", subgrupo:"SUELO", activo:false },
    { id: "a", marca_nombre:"HORSCH", nombre:"AMBIGUOUS", subgrupo:"SUELO", activo:true },
    { id: "b", marca_nombre:"HORSCH", nombre:"AMBIGUOUS", subgrupo:"SEMBRADORAS", activo:true }] };
  expect(attachProjectedStockYtd([], [
    {...sale, modelo:"OLD"}, {...sale, modelo:"AMBIGUOUS",tipo_maquina:"OTRO"},
    {...sale,marca:"CLAAS"}], extended)).toEqual([]);
 });
 it("rejects missing net units rather than substituting gross sales", () => {
  expect(() => attachProjectedStockYtd([eligible], [{ ...sale, netas: undefined as unknown as number }], catalog)).toThrow("cantidad YTD");
 });
 it("propagates read permission errors instead of fabricating zeros", async () => {
  rpc.mockResolvedValue({ data: null, error: { message: "Sin permiso" } });
  await expect(loadProjectedStockYtd([eligible], "2026-10-22")).rejects.toThrow("Sin permiso");
 });
 it("does not accept a missing breakdown as an empty year", async () => {
  rpc.mockResolvedValue({ data: {}, error: null });
  await expect(loadProjectedStockYtd([eligible], "2026-10-22")).rejects.toThrow("desglose");
 });
});

it("uses only the confirmed catalog Evolution24 alias for YTD and preserves other configurations", () => {
 const model = { id: "cf22fb73-a282-4673-8fa2-f929473fe40f", nombre: "MAESTRO EVOLUTION 24", marca_nombre: "HORSCH", subgrupo: "SEMBRADORAS", activo: true };
 const source: MachineCatalog = { ...catalog, models: [...catalog.models, model], aliases: [...catalog.aliases, { marca: "HORSCH", alias: "EVOLUTION 24 45", modelo_catalogo_id: model.id, revisado_manual: false }] };
 const result = attachProjectedStockYtd([{ ...eligible, modelo: model.nombre }], [{ ...sale, modelo: "EVOLUTION 24.45", netas: 2 }, { ...sale, modelo: model.nombre, netas: -1 }, { ...sale, modelo: "MAESTRO DUO 24", netas: 9 }], source);
 expect(result).toHaveLength(1); expect(result[0].vendidas_ytd).toBe(1); expect(result[0].modelo).toBe(model.nombre);
 expect(source.aliases?.slice(-1)[0]?.revisado_manual).toBe(false);
 const absent = { ...source, aliases: [] }; expect(attachProjectedStockYtd([], [{ ...sale, modelo: "EVOLUTION 24.45" }], absent)).toEqual([]);
});
