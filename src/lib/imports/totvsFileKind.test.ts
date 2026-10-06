import { describe, expect, it } from "vitest";
import { detectTotvsFileKind } from "./totvsFileKind";

describe("detectTotvsFileKind", () => {
  it("distingue la foto de stock del reporte general de maquinarias", () => {
    expect(detectTotvsFileKind("stock_de_maquinarias_104855.xml")).toBe("stock_maquinas");
    expect(detectTotvsFileKind("maquinarias_153046.xml")).toBe("maquinarias");
  });

  it("detecta el Kardex anal\u00edtico con sufijo de hora", () => {
    expect(detectTotvsFileKind("kardex_analitico_104343.xml")).toBe("kardex");
    expect(detectTotvsFileKind("kardex-analitico-160906.xml")).toBe("kardex");
    expect(detectTotvsFileKind("Kardex Anal\u00edtico.xml")).toBe("kardex");
    expect(detectTotvsFileKind("kardex_sintetico_104941.xml")).toBe("kardex_sintetico");
  });

  it("detecta las fuentes nuevas y excluye respaldos original", () => {
    expect(detectTotvsFileKind("mayor_contable_2_monedas_140624.xml")).toBe("mayor");
    expect(detectTotvsFileKind("importaciones---despacho-161515.xml")).toBe("despacho");
    expect(detectTotvsFileKind("pedidos-de-venta-161834.xml")).toBe("pedidos_venta");
    expect(detectTotvsFileKind("facturas_-_ncp_-_ndp_-_compras_085710.xml")).toBe("facturas_compra");
    expect(detectTotvsFileKind("maestro_de_proveedores_080326.xml")).toBe("proveedores");
    expect(detectTotvsFileKind("transferencia_entre_sucursales_en_transito_104837.xml")).toBe("transferencias_transito");
    expect(detectTotvsFileKind("pedidos-de-venta-161834_original.xml")).toBe("ignorar");
    expect(detectTotvsFileKind("facturas---ndc---ncc---ventas-162303_original.xml")).toBe("ignorar");
  });
});
