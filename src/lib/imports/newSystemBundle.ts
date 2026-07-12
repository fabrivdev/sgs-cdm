import type {
  CanonicalBillingCrosswalk,
  CanonicalBillingRow,
  CanonicalImportEnvelope,
  CanonicalProductRow,
  CanonicalServiceOrderRow,
} from "@/lib/imports/canonical";
import {
  buildImportInsert,
  buildImportMetadataEnvelope,
  buildProductLookup,
  buildServiceOrderLookup,
  crosswalkBillingRow,
  mapCanonicalBillingToFactLine,
  mapCanonicalOsToImportRow,
  mapFacturaVentasSheet,
  mapOrdenesServicioSheet,
  mapProductosSheet,
  parseNewSystemWorkbook,
  resolveReplacementWindow,
  summarizeDates,
} from "@/lib/imports";

interface ImportFileInput {
  fileName: string;
  xmlText: string;
}

export interface NewSystemImportBundleInput {
  facturacion: ImportFileInput;
  ordenesServicio: ImportFileInput;
  productos: ImportFileInput;
  usuarioId?: string | null;
}

export interface NewSystemImportBundle {
  facturacion: CanonicalImportEnvelope<CanonicalBillingRow>;
  ordenesServicio: CanonicalImportEnvelope<CanonicalServiceOrderRow>;
  productos: CanonicalImportEnvelope<CanonicalProductRow>;
  billingCrosswalk: CanonicalBillingCrosswalk[];
  facturacionPayload: ReturnType<typeof mapCanonicalBillingToFactLine>[];
  ordenesServicioPayload: ReturnType<typeof mapCanonicalOsToImportRow>[];
  importaciones: {
    facturacion: ReturnType<typeof buildImportInsert>;
    ordenesServicio: ReturnType<typeof buildImportInsert>;
    productos: ReturnType<typeof buildImportInsert>;
  };
  diagnostics: {
    billingRows: number;
    billingMatchedToOs: number;
    billingDirectSales: number;
    serviceOrders: number;
    products: number;
    replacement: {
      facturacion: ReturnType<typeof resolveReplacementWindow>;
      ordenesServicio: ReturnType<typeof resolveReplacementWindow>;
    };
  };
}

function firstSheet<T>(sheets: T[]) {
  if (!sheets.length) throw new Error("El XML no contiene hojas utilizables.");
  return sheets[0];
}

export function prepareNewSystemImportBundle(input: NewSystemImportBundleInput): NewSystemImportBundle {
  const factWorkbook = parseNewSystemWorkbook(input.facturacion.xmlText);
  const osWorkbook = parseNewSystemWorkbook(input.ordenesServicio.xmlText);
  const prodWorkbook = parseNewSystemWorkbook(input.productos.xmlText);

  const facturacion = mapFacturaVentasSheet(input.facturacion.fileName, firstSheet(factWorkbook.sheets));
  const ordenesServicio = mapOrdenesServicioSheet(input.ordenesServicio.fileName, firstSheet(osWorkbook.sheets));
  const productos = mapProductosSheet(input.productos.fileName, firstSheet(prodWorkbook.sheets));

  const productLookup = buildProductLookup(productos.rows);
  const osLookup = buildServiceOrderLookup(ordenesServicio.rows);

  const billingCrosswalk = facturacion.rows.map((row) =>
    crosswalkBillingRow({
      billingRowId: row.rowId,
      documentNumber: row.documentNumber,
      invoiceNumber: row.invoiceShortNumber ?? row.invoiceLongNumber,
      productCode: row.productCode,
      manufacturerCode: row.manufacturerCode,
      productGroup: row.productGroup,
      description: row.productName,
      billingTimeType: row.timeType,
      serviceOrders: osLookup,
      products: productLookup,
    }),
  );

  const crosswalkByRowId = new Map(billingCrosswalk.map((row) => [row.billingRowId, row]));

  const facturacionPayload = facturacion.rows.map((row) =>
    mapCanonicalBillingToFactLine(row, crosswalkByRowId.get(row.rowId)),
  );
  const ordenesServicioPayload = ordenesServicio.rows.map(mapCanonicalOsToImportRow);

  const factSummary = summarizeDates(facturacion.rows);
  const osSummary = summarizeDates(ordenesServicio.rows);

  const billingMatchedToOs = billingCrosswalk.filter((row) => row.serviceOrderNumber).length;
  const billingDirectSales = billingCrosswalk.filter((row) => row.matchedBy === "none").length;

  return {
    facturacion,
    ordenesServicio,
    productos,
    billingCrosswalk,
    facturacionPayload,
    ordenesServicioPayload,
    importaciones: {
      facturacion: buildImportInsert({
        tipo: "facturacion",
        archivoNombre: input.facturacion.fileName,
        origenSistema: "new_xml_facturacion",
        totalFilas: facturacion.rows.length,
        usuarioId: input.usuarioId,
        metadata: buildImportMetadataEnvelope(facturacion, {
          linkedToServiceOrders: billingMatchedToOs,
          directSales: billingDirectSales,
        }),
      }),
      ordenesServicio: buildImportInsert({
        tipo: "facturacion",
        archivoNombre: input.ordenesServicio.fileName,
        origenSistema: "new_xml_ordenes_servicio",
        totalFilas: ordenesServicio.rows.length,
        usuarioId: input.usuarioId,
        metadata: buildImportMetadataEnvelope(ordenesServicio),
      }),
      productos: buildImportInsert({
        tipo: "facturacion",
        archivoNombre: input.productos.fileName,
        origenSistema: "new_xml_productos",
        totalFilas: productos.rows.length,
        usuarioId: input.usuarioId,
        metadata: {
          sourceSystem: "new_xml_productos",
          worksheetName: productos.worksheetName,
          sourceFileName: productos.sourceFileName,
          importedAt: productos.importedAt,
          totalRows: productos.rows.length,
        },
      }),
    },
    diagnostics: {
      billingRows: facturacion.rows.length,
      billingMatchedToOs,
      billingDirectSales,
      serviceOrders: ordenesServicio.rows.length,
      products: productos.rows.length,
      replacement: {
        facturacion: resolveReplacementWindow(factSummary),
        ordenesServicio: resolveReplacementWindow(osSummary),
      },
    },
  };
}
