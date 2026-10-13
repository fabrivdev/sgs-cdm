import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { NewSystemImportBundle } from "./newSystemBundle";
import {
  indexFirstBillingRowsById,
  missingPersistedServiceOrderNumbers,
  prepareServiceOrderPersistenceRows,
} from "./newSystemPersist";

const source = readFileSync("src/lib/imports/newSystemPersist.ts", "utf8");
const importerUi = readFileSync("src/components/parque/ImportarTotvsTab.tsx", "utf8");
type BillingRow = NewSystemImportBundle["facturacion"]["rows"][number];

describe("persistencia de facturacion del sistema nuevo", () => {
  it("valida facturacion antes de persistir OS", () => {
    const confirmFlow = importerUi.slice(importerUi.indexOf("const confirmar = async"));
    const serviceOrderImport = confirmFlow.indexOf("persistNewSystemServiceOrders");
    const billingPreflight = confirmFlow.indexOf('mode: "validate"');

    expect(serviceOrderImport).toBeGreaterThan(0);
    expect(billingPreflight).toBeLessThan(serviceOrderImport);
    expect(source).toContain("skipServiceOrders = false");
  });

  it("ejecuta el preflight transaccional antes de escribir clientes", () => {
    const preflight = importerUi.indexOf('mode: "validate"');
    const firstClientWrite = importerUi.indexOf('supabase.from("clientes").insert');
    const actualPersistence = importerUi.indexOf("const resultado = await persistNewSystemBundle");

    expect(preflight).toBeGreaterThan(0);
    expect(firstClientWrite).toBeGreaterThan(preflight);
    expect(actualPersistence).toBeGreaterThan(firstClientWrite);
  });

  it("no ejecuta borrado directo ni upsert tolerante de lineas detalladas", () => {
    expect(source).not.toContain("BILLING_LINE_INSERT_OPTIONS");
    expect(source).not.toContain("ignoreDuplicates: true");
    expect(source).not.toMatch(/facturacion_lineas_importadas[\s\S]{0,180}\.delete\(\)/);
  });

  it("distingue un fallo posterior de OS de un rollback de facturacion", () => {
    expect(source).toContain("La facturacion quedo confirmada, pero fallo la etapa posterior");
    expect(source).toContain("la facturacion reutilizara sus UUID");
  });

  it("declara cobertura fuente y refresca consolidacion en una RPC posterior no fatal", () => {
    const billingRpc = source.indexOf('"facturacion_importar_totvs_lote_con_fuente_v1"');
    const refreshRpc = source.indexOf('"totvs_refrescar_consolidacion_post_import_v1"');
    expect(source).toContain("sourcePeriodFrom: facturacionDesde");
    expect(source).toContain("sourcePeriodTo: facturacionHasta");
    expect(refreshRpc).toBeGreaterThan(billingRpc);
    expect(source).toContain("consolidacionTecnicaError = refreshError instanceof Error");
  });

  it("una carga parcial nunca habilita reemplazo ni reconciliacion por ausencia", () => {
    expect(source).toContain("billingSnapshotDeclaration = null");
    expect(source).toContain("const replaceBillingSummary = billingSnapshotScope !== null");
    expect(source).toContain("p_reemplazar_resumen: replaceBillingSummary");
  });

  it("refresca proyecciones persistidas tambien en acreditacion historica", () => {
    const partsRefresh = source.indexOf("historialRepuestos = await actualizarVentasRepuestosPeriodo");
    const accreditationReturn = source.indexOf('if (mode === "validate" || mode === "accredit")');
    expect(partsRefresh).toBeGreaterThan(0);
    expect(partsRefresh).toBeLessThan(accreditationReturn);
    expect(source.slice(0, accreditationReturn)).toContain('"refrescar_parque_ultima_actividad"');
  });
});

describe("contadores de exclusiones confirmadas", () => {
  it("usa las lineas aceptadas y excluidas devueltas por el RPC", () => {
    expect(source).toContain("data: facturacionData");
    expect(source).toContain("facturacionResultado.excluidas_confirmadas");
    expect(source).toContain("facturacionResultado.lineas_activas");
    expect(source).toContain("facturacionLineas: facturacionAceptadas");
  });

  it("cuenta las OS confirmadas por el RPC transaccional", () => {
    expect(source).toContain('"totvs_importar_ordenes_servicio_lote_v1"');
    expect(source).toContain("confirmed += persistedNumbers.length");
    expect(source).toContain("excluded += excludedNumbers.length");
    expect(source).toContain("ordenesServicioPersistidas += chunk.length");
    expect(source).toContain("insertados: ordenesServicioPersistidas");
    expect(source).toContain("ordenesServicio: ordenesServicioPersistidas");
  });

  it("identifica exactamente las claves que no aparecen en la verificacion posterior", () => {
    expect(missingPersistedServiceOrderNumbers(
      ["01-00000034", "01-00000035"],
      [{ os_numero: "01-00000035" }],
    )).toEqual(["01-00000034"]);
  });

  it("no retira OS por ausencia: conserva el estado explicito del XML", () => {
    expect(source).toContain("RECONCILE_SERVICE_ORDERS_BY_ABSENCE");
    expect(source).toContain("const RECONCILE_SERVICE_ORDERS_BY_ABSENCE = false");
  });
});

describe("indice de facturacion por rowId", () => {
  it("preserva la primera fecha si un rowId aparece mas de una vez", () => {
    const first = { rowId: "duplicada", emissionDate: "2026-07-01" } as BillingRow;
    const second = { rowId: "duplicada", emissionDate: "2026-08-31" } as BillingRow;

    const indexed = indexFirstBillingRowsById([first, second]);

    expect(indexed.get("duplicada")).toBe(first);
    expect(indexed.get("duplicada")?.emissionDate).toBe("2026-07-01");
  });

  it("enriquece la fecha de factura sin depender de persistir facturacion", () => {
    const bundle = {
      ordenesServicioPayload: [{ os_numero: "01-00000034", fecha_emision_factura: null }],
      facturacion: { rows: [{ rowId: "fact-1", emissionDate: "2026-08-31", dueDate: null }] },
      billingCrosswalk: [{ billingRowId: "fact-1", serviceOrderNumber: "01-00000034" }],
    } as unknown as NewSystemImportBundle;

    expect(prepareServiceOrderPersistenceRows(bundle)[0].fecha_emision_factura).toBe("2026-08-31");
  });
});
