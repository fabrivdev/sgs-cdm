import { describe, expect, it } from "vitest";
import { isImportSaleInvoiced, importArrivalState } from "./machineImportStatus";

describe("importArrivalState", () => {
  it("no deduce tránsito a partir de ETA ni stock antes del arribo", () => {
    expect(importArrivalState({ eta: "2026-10-01", costo_stock_habilitado: true })).toBe("PLANIFICADO");
    expect(importArrivalState({ estado_fuente: "EN_TRANSITO", costo_stock_habilitado: true })).toBe("EN_TRANSITO");
  });
  it("separa arribado de completado y respeta conflictos", () => {
    expect(importArrivalState({ ata: "2026-09-01" })).toBe("ARRIBADO");
    expect(importArrivalState({ ata: "2026-09-01", costo_stock_habilitado: true })).toBe("COMPLETADO");
    expect(importArrivalState({ ata: "2026-09-01", costo_stock_habilitado: true, estado_disponibilidad: "CONFLICTO" })).toBe("ARRIBADO");
  });
  it("no inventa fechas para registros históricos ni oculta cancelaciones", () => {
    expect(importArrivalState({ estado_fuente: "Completado", costo_stock_habilitado: true })).toBe("PLANIFICADO");
    expect(importArrivalState({ estado_fuente: "Arribado" })).toBe("PLANIFICADO");
    expect(importArrivalState({ estado_fuente: "CANCELADA" })).toBe("CANCELADO");
    expect(importArrivalState({ estado_fuente: "CANCELADA", parque_confirmado: true })).toBe("CANCELADO");
  });
  it("completa por chasis confirmado en stock o parque, incluso sin ATA", () => {
    expect(importArrivalState({ stock_fisico_confirmado: true, estado_fuente: "ARRIBADA" })).toBe("COMPLETADO");
    expect(importArrivalState({ parque_confirmado: true, stock_fisico_confirmado: false, estado_disponibilidad: "EN_PARQUE" })).toBe("COMPLETADO");
    expect(importArrivalState({ ata: "2026-08-01", parque_confirmado: true })).toBe("COMPLETADO");
  });
  it("no usa una etiqueta comercial ni un chasis ambiguo como confirmación", () => {
    expect(importArrivalState({ ata: "2026-08-01", estado_disponibilidad: "EN_PARQUE", parque_confirmado: false })).toBe("ARRIBADO");
    expect(importArrivalState({ stock_fisico_confirmado: true, chasis_ambiguo: true, ata: "2026-08-01" })).toBe("ARRIBADO");
    expect(importArrivalState({ parque_confirmado: true, chasis_ambiguo: true })).toBe("PLANIFICADO");
  });
  it("confirma la llegada física aunque la reserva esté vinculada a otra NP", () => {
    expect(importArrivalState({ ata: "2026-05-23", stock_fisico_confirmado: true, estado_disponibilidad: "RESERVADO" })).toBe("COMPLETADO");
    expect(importArrivalState({ ata: "2026-05-23", stock_fisico_confirmado: true, estado_disponibilidad: "CONFLICTO" })).toBe("COMPLETADO");
    expect(importArrivalState({ ata: "2026-05-23", stock_fisico_confirmado: false, costo_stock_habilitado: true })).toBe("ARRIBADO");
  });
});

describe("isImportSaleInvoiced", () => {
  it("prioriza la evidencia actual del parque sobre el valor historico de importacion", () => {
    expect(isImportSaleInvoiced({ venta_facturada: "FALSE", estado_disponibilidad: "EN_PARQUE" })).toBe(true);
  });

  it("mantiene como no facturada una importacion disponible sin evidencia de venta", () => {
    expect(isImportSaleInvoiced({ venta_facturada: "FALSE", estado_disponibilidad: "DISPONIBLE" })).toBe(false);
  });

  it("acepta los valores afirmativos importados", () => {
    expect(isImportSaleInvoiced({ venta_facturada: true, estado_disponibilidad: null })).toBe(true);
    expect(isImportSaleInvoiced({ venta_facturada: "SI", estado_disponibilidad: null })).toBe(true);
  });
});
