import { describe, expect, it } from "vitest";
import {
  BILLING_LINE_INSERT_OPTIONS,
  BILLING_LINE_REPAIR_DATE_OPTIONS,
  prepareBillingLineReimport,
} from "./newSystemPersist";

const line = {
  origen_sistema: "new_xml_facturacion_os",
  codigo_interno_factura: "0010010004812",
  factura: "0010010004812",
  cod_mercaderia: "REPIN002906",
  codigo_fabricante: "1503220",
  observacion: "REPUESTO",
  total_venta: 25,
  fecha_factura: null as string | null,
};

describe("reimportacion de lineas de facturacion", () => {
  it("separa la misma identidad fechada para actualizar un NULL previo", () => {
    const dated = { ...line, fecha_factura: "2026-07-20" };

    const result = prepareBillingLineReimport([line, dated]);

    expect(result.insertAll).toEqual([line, dated]);
    expect(result.repairDates).toEqual([dated]);
    expect(BILLING_LINE_INSERT_OPTIONS.ignoreDuplicates).toBe(true);
    expect(BILLING_LINE_REPAIR_DATE_OPTIONS).toEqual({
      onConflict: "origen_sistema,linea_hash",
      ignoreDuplicates: false,
    });
  });

  it("deduplica identidades fechadas dentro del mismo lote", () => {
    const first = { ...line, fecha_factura: "2026-07-20", marker: "first" };
    const last = { ...line, fecha_factura: "2026-07-20", marker: "last" };

    expect(prepareBillingLineReimport([first, last]).repairDates).toEqual([{
      ...line,
      fecha_factura: "2026-07-20",
    }]);
  });

  it("no convierte una linea sin fecha en una actualizacion destructiva", () => {
    expect(prepareBillingLineReimport([line])).toEqual({
      insertAll: [line],
      repairDates: [],
    });
  });
});
