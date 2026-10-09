import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { NewSystemImportBundle } from "./newSystemBundle";
import {
  missingPersistedServiceOrderNumbers,
  prepareServiceOrderPersistenceRows,
} from "./newSystemPersist";

const persistSource = readFileSync("src/lib/imports/newSystemPersist.ts", "utf8");
const uiSource = readFileSync("src/components/parque/ImportarTotvsTab.tsx", "utf8");

describe("persistencia independiente de OS", () => {
  it("ejecuta OS antes del preflight de facturacion y no repite el lote", () => {
    expect(uiSource.lastIndexOf("persistNewSystemServiceOrders")).toBeLessThan(
      uiSource.indexOf('mode: "validate"'),
    );
    expect(uiSource).toContain("skipServiceOrders: true");
  });

  it("no reconcilia una anulacion por ausencia", () => {
    expect(persistSource).toContain("const RECONCILE_SERVICE_ORDERS_BY_ABSENCE = false");
  });

  it("conserva el enriquecimiento de fecha sin persistir facturacion", () => {
    const bundle = {
      ordenesServicioPayload: [{ os_numero: "01-00000034", fecha_emision_factura: null }],
      facturacion: { rows: [{ rowId: "fact-1", emissionDate: "2026-08-31", dueDate: null }] },
      billingCrosswalk: [{ billingRowId: "fact-1", serviceOrderNumber: "01-00000034" }],
    } as unknown as NewSystemImportBundle;
    expect(prepareServiceOrderPersistenceRows(bundle)[0].fecha_emision_factura).toBe("2026-08-31");
  });

  it("detecta la clave que no aparece en la verificacion posterior", () => {
    expect(missingPersistedServiceOrderNumbers(
      ["01-00000034", "01-00000035"],
      [{ os_numero: "01-00000035" }],
    )).toEqual(["01-00000034"]);
  });

  it("conserva la cantidad confirmada si falla un lote posterior", () => {
    expect(persistSource).toContain("new ServiceOrderImportFailure(detail, confirmed)");
    expect(uiSource).toContain("e.confirmedServiceOrders");
  });

  it("rotula importadas y mantiene un resumen breve con cantidades", () => {
    expect(uiSource).not.toContain("OS vigentes");
    expect(uiSource).toContain("OS importadas");
    expect(uiSource).toContain("lineas de facturacion");
  });
});
