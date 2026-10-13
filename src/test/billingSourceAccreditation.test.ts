// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  accreditExistingBillingSource,
  toBillingSourceIdentityRpc,
  type BillingSourceAccreditationRpcClient,
} from "@/lib/imports/billingSourceAccreditation";
import type { NewSystemImportBundle } from "@/lib/imports/newSystemBundle";

const persistenceMocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  select: vi.fn(),
  insert: vi.fn(),
  upsert: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  cargarTodo: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: persistenceMocks.rpc,
    from: persistenceMocks.from,
  },
}));

vi.mock("@/hooks/useCatalogos", () => ({
  cargarTodo: persistenceMocks.cargarTodo,
}));

import { accreditHistoricalBillingSource } from "@/lib/imports/newSystemPersist";

const accreditationBundle = {
  facturacion: {
    sourceSystem: "TOTVS",
    sourceFileName: "facturas.xml",
    worksheetName: "Facturas",
    importedAt: "2026-10-08T00:00:00.000Z",
    rows: [{
      rowId: "billing-row-1",
      emissionDate: "2026-08-01",
      dueDate: null,
      branch: "Central",
      clientCode: "CLIENTE-1",
      clientName: "Cliente de prueba",
      seller: null,
      invoiceLongNumber: "DOC-1",
      invoiceShortNumber: "DOC-1",
      documentNumber: "DOC-1",
      itemNumber: "1",
      productCode: "SERV-1",
      manufacturerCode: null,
      productName: "Servicio de prueba",
      quantity: 1,
      unitValueBase: 100,
      totalValueBase: 100,
      ivaRate: 10,
      unitValueWithIva: 110,
      totalValueWithIva: 110,
      currency: "PYG",
      exchangeRate: 1,
      paymentCondition: null,
      lineType: "Servicios",
      timeType: "Cliente",
      productGroup: "SERVICIOS",
      productFamily: null,
      productBrand: null,
      linkedServiceOrder: null,
      linkedTrabajo: null,
      isDirectSale: true,
      raw: { ITEM: "1", canonical_document_kind: "FACTURA" },
    }],
  },
  ordenesServicio: {
    sourceSystem: "TOTVS",
    sourceFileName: "os.xml",
    worksheetName: "OS",
    importedAt: "2026-10-08T00:00:00.000Z",
    rows: [],
  },
  productos: {
    sourceSystem: "TOTVS",
    sourceFileName: "productos.xml",
    worksheetName: "Productos",
    importedAt: "2026-10-08T00:00:00.000Z",
    rows: [],
  },
  billingCrosswalk: [],
  facturacionPayload: [],
  ordenesServicioPayload: [],
  importaciones: {
    facturacion: { tipo: "facturacion", archivo_nombre: "facturas.xml", metadata: {} },
    ordenesServicio: { tipo: "ordenes_servicio", archivo_nombre: "os.xml", metadata: {} },
    productos: { tipo: "productos", archivo_nombre: "productos.xml", metadata: {} },
  },
  diagnostics: {
    billingRows: 1,
    billingMatchedToOs: 0,
    billingDirectSales: 1,
    serviceOrders: 0,
    serviceOrderTimeTypes: { Cliente: 0, Garantia: 0, Interno: 0, Desconocido: 0 },
    products: 0,
    replacement: {
      facturacion: { shouldReplace: false, from: "2026-08-01", to: "2026-08-01" },
      ordenesServicio: { shouldReplace: false, from: null, to: null },
    },
  },
} as unknown as NewSystemImportBundle;

describe("adaptador frontend de acreditacion historica", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    persistenceMocks.rpc.mockResolvedValue({
      data: { source_identity_status: "VALIDATED", lineas_activas: 1, excluidas_confirmadas: 0 },
      error: null,
    });
    persistenceMocks.select.mockReturnValue({});
    persistenceMocks.from.mockReturnValue({
      select: persistenceMocks.select,
      insert: persistenceMocks.insert,
      upsert: persistenceMocks.upsert,
      update: persistenceMocks.update,
      delete: persistenceMocks.remove,
    });
    persistenceMocks.cargarTodo.mockResolvedValue([]);
  });

  it("convierte SourceFileIdentity al contrato RPC y envia el conjunto completo", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { source_identity_status: "VALIDATED" }, error: null });
    const client: BillingSourceAccreditationRpcClient = { rpc };
    const sourceIdentity = { fileName: "facturas.xml", byteSize: 7683471, sha256: "a".repeat(64) };
    expect(toBillingSourceIdentityRpc(sourceIdentity)).toEqual({
      file_name: "facturas.xml",
      byte_size: 7683471,
      sha256: "a".repeat(64),
    });

    await accreditExistingBillingSource(client, {
      supportingLoadId: "11111111-1111-4111-8111-111111111111",
      sourceIdentity,
      importEnvelope: { archivo_nombre: "facturas.xml" },
      summary: [{ factura: "resumen" }],
      lines: [{ identidad: "linea-completa" }],
      from: "2026-07-01",
      to: "2026-08-31",
      replaceSummary: true,
    });

    expect(rpc).toHaveBeenCalledWith("facturacion_acreditar_fuente_existente_v1", {
      p_importacion_id: "11111111-1111-4111-8111-111111111111",
      p_source_identity: { file_name: "facturas.xml", byte_size: 7683471, sha256: "a".repeat(64) },
      p_importacion: { archivo_nombre: "facturas.xml" },
      p_resumen: [{ factura: "resumen" }],
      p_lineas: [{ identidad: "linea-completa" }],
      p_desde: "2026-07-01",
      p_hasta: "2026-08-31",
      p_reemplazar_resumen: true,
    });
  });

  it("ejecuta la entrada real y retorna antes de persistir OS o una importacion nueva", async () => {
    const result = await accreditHistoricalBillingSource({
      bundle: accreditationBundle,
      userId: "22222222-2222-4222-8222-222222222222",
      supportingLoadId: "11111111-1111-4111-8111-111111111111",
      sourceIdentity: { fileName: "facturas.xml", byteSize: 7683471, sha256: "a".repeat(64) },
      fileNames: {
        facturacion: "facturas.xml",
        ordenesServicio: "os.xml",
        productos: "productos.xml",
      },
    });

    expect(result.facturacionLineas).toBe(1);
    expect(persistenceMocks.rpc.mock.calls.filter(
      ([name]) => name === "facturacion_acreditar_fuente_existente_v1",
    )).toHaveLength(1);
    expect(persistenceMocks.rpc).toHaveBeenCalledWith(
      "facturacion_acreditar_fuente_existente_v1",
      expect.objectContaining({
        p_importacion_id: "11111111-1111-4111-8111-111111111111",
      }),
    );
    expect(persistenceMocks.from).toHaveBeenCalledTimes(1);
    expect(persistenceMocks.from).toHaveBeenCalledWith("clientes");
    expect(persistenceMocks.insert).not.toHaveBeenCalled();
    expect(persistenceMocks.upsert).not.toHaveBeenCalled();
    expect(persistenceMocks.update).not.toHaveBeenCalled();
    expect(persistenceMocks.remove).not.toHaveBeenCalled();
  });
});
