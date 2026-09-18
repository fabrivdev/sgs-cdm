import { describe, expect, it } from "vitest";
import { IMPORT_SITUATION_LABELS, importSituationState, importSituationLabel, isImportSaleInvoiced, importArrivalState } from "./machineImportStatus";

describe("importSituationState", () => {
  it("ofrece exactamente las cinco situaciones acordadas y en ese orden", () => {
    expect(Object.values(IMPORT_SITUATION_LABELS)).toEqual(["Stock", "Reservado", "En parque", "Sin chasis", "Sin conciliar"]);
  });
  it.each([
    ["DISPONIBLE", "DISPONIBLE", "Stock"],
    ["RESERVADO", "RESERVADO", "Reservado"],
    ["EN_PARQUE", "EN_PARQUE", "En parque"],
    ["VENDIDO_PENDIENTE_ENTREGA", "RESERVADO", "Reservado"],
    ["CONFLICTO", "SIN_CONCILIAR", "Sin conciliar"],
    ["SIN_CONCILIAR", "SIN_CONCILIAR", "Sin conciliar"],
    [null, "SIN_CONCILIAR", "Sin conciliar"],
    ["ESTADO_DESCONOCIDO", "SIN_CONCILIAR", "Sin conciliar"],
  ])("proyecta %s sin modificar la fuente, para filtro, orden y exportación", (source, state, label) => {
    const row = Object.freeze({ chasis: "TEST-01", estado_disponibilidad: source });
    expect(importSituationState(row)).toBe(state);
    expect(importSituationLabel(row)).toBe(label);
    expect(row.estado_disponibilidad).toBe(source);
  });
  it.each([null, "", "  ", "---"])("sin identificador válido %s muestra Sin chasis", (chasis) => {
    expect(importSituationState({ chasis, estado_disponibilidad: "RESERVADO" })).toBe("SIN_CHASIS");
  });
  it("mantiene duplicados en Sin conciliar sin cambiar la llegada ni la facturación", () => {
    const row = Object.freeze({ chasis: "TEST-01", estado_disponibilidad: "EN_PARQUE", chasis_ambiguo: true, parque_confirmado: true, ata: "2026-08-01" });
    expect(importSituationState(row)).toBe("SIN_CONCILIAR");
    expect(importArrivalState(row)).toBe("ARRIBADO");
    expect(isImportSaleInvoiced(row)).toBe(true);
  });
});

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
