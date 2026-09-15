import { beforeEach, describe, expect, it, vi } from "vitest";
import { completarNotasCreditoHistoricas, importarFacturacionHistorica } from "./useSugerenciasCompra";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), rows: [] as Record<string, unknown>[] }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock("xlsx", () => ({ read: () => ({ SheetNames: ["Fact. Repuestos"], Sheets: { "Fact. Repuestos": {} } }),
  utils: { sheet_to_json: () => mocks.rows } }));
const file = { name: "FACTURACIÓN HISTORICA.xlsx", arrayBuffer: async () => new ArrayBuffer(1) } as File;
const positive = { "Tp. Movimento": "S", "Fecha Factura": "2026-06-30", "Cod. Mercaderia": "OLD1",
  "Código Factura": "H1", "Cant. Unit.": 1, "Total Venta": 30, "Entidad": "Cliente A", "Sucursal": "KATUETE" };
beforeEach(() => {
  mocks.rows = [{ ...positive }, { ...positive, "Código Factura": "H2" },
    { ...positive, "Tp. Movimento": "E", "Código Factura": "NC1", "Cant. Unit.": -1, "Total Venta": -30 }];
  mocks.rpc.mockReset().mockImplementation(async name => ({ error: null,
    data: name === "repuestos_iniciar_facturacion_historica" ? "LOAD"
      : name === "repuestos_estado_facturacion_historica" ? { cargado: true, carga_id: "LOAD" }
        : name === "repuestos_completar_notas_credito_historicas" ? { insertadas: 1 } : {} }));
});
describe("carga histórica detallada S/E", () => {
  it("carga inicial conserva S/E y las claves de fila originales", async () => {
    await importarFacturacionHistorica(file);
    const input = mocks.rpc.mock.calls.find(([name]) => name === "repuestos_importar_facturacion_historica_lote")![1];
    expect(input.p_filas.map((row: { movimiento: string }) => row.movimiento)).toEqual(["S", "S", "E"]);
    expect(input.p_filas[2].linea_clave).toBe("4|2026-06-30|NC1|OLD1");
    expect(input.p_filas[2].total_venta).toBe(-30);
    expect(mocks.rpc).toHaveBeenCalledWith("repuestos_verificar_notas_credito_historicas", {
      p_carga_id: "LOAD", p_claves: ["4|2026-06-30|NC1|OLD1"],
    });
  });
  it("complemento no inicia otra carga ni manda ventas positivas", async () => {
    const progress = vi.fn();
    expect(await completarNotasCreditoHistoricas(file, progress)).toEqual({ insertadas: 1, verificadas: 1 });
    expect(mocks.rpc).not.toHaveBeenCalledWith("repuestos_iniciar_facturacion_historica", expect.anything());
    const input = mocks.rpc.mock.calls.find(([name]) => name === "repuestos_completar_notas_credito_historicas")![1];
    expect(input.p_filas).toHaveLength(1);
    expect(input.p_filas[0].movimiento).toBe("E");
    expect(input.p_anclas).toHaveLength(2);
    expect(progress).toHaveBeenCalledWith(1, 1);
  });
  it("rechaza signo incorrecto antes de enviar datos", async () => {
    mocks.rows[2]["Total Venta"] = 30;
    await expect(completarNotasCreditoHistoricas(file)).rejects.toThrow("fila 4");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("no verifica un archivo sin devoluciones para esconder faltantes", async () => {
    mocks.rows.pop();
    await expect(completarNotasCreditoHistoricas(file)).rejects.toThrow("no contiene devoluciones");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("si falla un lote no marca el archivo como completo", async () => {
    mocks.rpc.mockImplementation(async name => name === "repuestos_estado_facturacion_historica"
      ? { data: { cargado: true, carga_id: "LOAD" }, error: null }
      : { data: null, error: { message: "Lote rechazado" } });
    await expect(completarNotasCreditoHistoricas(file)).rejects.toThrow("Lote rechazado");
    expect(mocks.rpc).not.toHaveBeenCalledWith("repuestos_verificar_notas_credito_historicas", expect.anything());
  });
});
