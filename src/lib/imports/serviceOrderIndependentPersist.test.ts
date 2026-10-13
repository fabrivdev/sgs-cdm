import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { NewSystemImportBundle } from "./newSystemBundle";
import {
  filterRowsForConfirmedServiceOrderExclusions,
  missingPersistedServiceOrderNumbers,
  prepareServiceOrderPersistenceRows,
} from "./newSystemPersist";

const persistSource = readFileSync("src/lib/imports/newSystemPersist.ts", "utf8");
const uiSource = readFileSync("src/components/parque/ImportarTotvsTab.tsx", "utf8");
const serviceOrderFlow = persistSource.slice(
  persistSource.indexOf("export async function persistNewSystemServiceOrders"),
  persistSource.indexOf("export async function actualizarVentasRepuestosPeriodo"),
);

describe("persistencia independiente de OS", () => {
  it("ejecuta OS antes del preflight de facturacion y no repite el lote", () => {
    const confirmFlow = uiSource.slice(uiSource.indexOf("const confirmar = async"));
    expect(confirmFlow.indexOf("persistNewSystemServiceOrders")).toBeLessThan(
      confirmFlow.indexOf('mode: "validate"'),
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

  it("agrega variantes de mayusculas como una sola OS canonica", () => {
    const bundle = {
      ordenesServicioPayload: [
        { os_numero: "02-ab", servicios_valor: 10, raw_data: {} },
        { os_numero: "02-AB", servicios_valor: 5, raw_data: {} },
      ],
      ordenesServicio: { rows: [] },
      facturacion: { rows: [] },
      billingCrosswalk: [],
    } as unknown as NewSystemImportBundle;
    const rows = prepareServiceOrderPersistenceRows(bundle);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ os_numero: "02-AB", servicios_valor: 15 });
  });

  it("detecta la clave que no aparece en la verificacion posterior", () => {
    expect(missingPersistedServiceOrderNumbers(
      ["01-00000034", "01-00000035"],
      [{ os_numero: "01-00000035" }],
    )).toEqual(["01-00000034"]);
  });

  it("delega escritura y exclusiones a un RPC transaccional autorizado", () => {
    expect(serviceOrderFlow).toContain('"totvs_importar_ordenes_servicio_lote_v1"');
    expect(serviceOrderFlow).toContain("p_importacion_id: osImport.id");
    expect(serviceOrderFlow).toContain("p_lote_numero: batch");
    expect(serviceOrderFlow).toContain("missingServiceOrderBatchRpc(error)");
    expect(serviceOrderFlow).not.toContain('.from("os_exclusiones_confirmadas")');
    expect(serviceOrderFlow).not.toContain('.from("ordenes_servicio_importadas" as any).upsert');
    expect(serviceOrderFlow).toContain("duplicados: 0");
    expect(serviceOrderFlow).not.toContain("metadata: {\n        ...importMetadata");
    expect(serviceOrderFlow).toContain("overlappingNumbers");
    expect(serviceOrderFlow).toContain("Number(data?.total) !== expectedNumbers.length");
  });

  it("no envia lineas MA01 o KM de una OS excluida a comisiones", () => {
    const rows = [
      { serviceOrderNumber: "02-00000036", productCode: "MA01" },
      { serviceOrderNumber: " 02-00000036 ", productCode: "KM" },
      { serviceOrderNumber: "02-00000037", productCode: "MA01" },
    ];
    expect(filterRowsForConfirmedServiceOrderExclusions(rows, ["02-00000036"])).toEqual([
      { serviceOrderNumber: "02-00000037", productCode: "MA01" },
    ]);
    expect(serviceOrderFlow).toContain("filterRowsForConfirmedServiceOrderExclusions(");
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

  it("mantiene el preflight tecnico y el error detallado colapsados", () => {
    const preflightToggle = uiSource.indexOf("Ver detalle del preflight");
    const firstLongBlock = uiSource.indexOf("Preflight:");
    const confirmButton = uiSource.indexOf("Confirmar importaci");
    expect(preflightToggle).toBeGreaterThan(0);
    expect(firstLongBlock).toBeGreaterThan(preflightToggle);
    expect(confirmButton).toBeGreaterThan(firstLongBlock);
    expect(uiSource).toContain("Ver detalle técnico");
    expect(uiSource).toContain("setImportError({ summary, detail })");
    expect(uiSource).toContain("conciseImportErrorSummary(");
    expect(persistSource).toContain("La respuesta transaccional de OS no coincide con el lote");
    expect(uiSource.indexOf("Requiere revisión")).toBeLessThan(preflightToggle);
  });

  it("bloquea las rutas anteriores que omiten el RPC transaccional", () => {
    const legacyUiSource = readFileSync("src/components/parque/ImportarTab.tsx", "utf8");
    const directHandler = legacyUiSource.slice(
      legacyUiSource.indexOf("const confirmarOrdenesServicio"),
      legacyUiSource.indexOf("const confirmarNuevoSistemaXml"),
    );
    const bundleHandler = legacyUiSource.slice(
      legacyUiSource.indexOf("const confirmarNuevoSistemaXml"),
      legacyUiSource.indexOf("const procesarParque"),
    );
    expect(directHandler.indexOf("Este importador anterior de OS esta deshabilitado")).toBeLessThan(
      directHandler.indexOf("upsert(chunk"),
    );
    expect(bundleHandler.indexOf("Este importador anterior esta deshabilitado")).toBeLessThan(
      bundleHandler.indexOf("persistNewSystemBundle"),
    );
    const bundleFlow = persistSource.slice(persistSource.indexOf("export async function persistNewSystemBundle"));
    expect(bundleFlow.indexOf('mode === "persist" && !skipServiceOrders')).toBeLessThan(
      bundleFlow.indexOf('supabase.from("clientes")'),
    );
    expect(legacyUiSource).not.toContain('onFile={(file) => procesarNuevoSistemaXml');
    expect(legacyUiSource).not.toContain('title={`Ordenes de servicio - ${osFile}`}');
    expect(legacyUiSource).toContain("Usa Importar datos de TOTVS");
  });
});
