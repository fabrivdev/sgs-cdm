export type BillingSourceLine = {
  id?: string;
  origen_sistema: string | null;
  codigo_interno_factura: string | null;
  factura: string | null;
  sucursal: string | null;
  cod_mercaderia: string | null;
  entidad_nombre: string | null;
  vendedor?: string | null;
  mercaderia: string | null;
  observacion: string | null;
  cantidad: number | null;
  valor_unitario: number | null;
  total_venta: number | null;
  moneda: string | null;
  codigo_fabricante: string | null;
  fecha_factura: string | null;
  raw_data: Record<string, unknown> | null;
  subgrupo_original?: string | null;
  grupo_normalizado?: string | null;
  marca_normalizada?: string | null;
  tipo_facturacion?: string | null;
  tipo_tiempo?: string | null;
};

const stable = (value: unknown) => String(value ?? "").trim().toUpperCase();
const numberValue = (value: unknown) => value == null ? null : Number(value);
const canonicalOrigin = (value: unknown) => {
  const origin = stable(value);
  return origin === "NEW_XML_FACTURACION_DIRECTA" || origin === "NEW_XML_FACTURACION_OS"
    ? "NEW_XML_FACTURACION"
    : origin;
};
const canonicalBranch = (value: unknown) => {
  const branch = stable(value);
  return branch === "04" || branch === "04 - SAN JUAN BAUTISTA" || branch === "SAN JUAN BAUTISTA"
    ? "MISIONES"
    : branch;
};

/**
 * Clave declarada por el origen TOTVS. DOCUMENTO ya contiene el numero fiscal
 * completo que entrega el archivo; no se inventan empresa o serie separadas.
 * El tipo canonico distingue factura de nota de credito aun si comparten numero.
 */
export function billingSourceLineKey(row: BillingSourceLine): string | null {
  // directa/os es una clasificacion enriquecida por el crosswalk, no una
  // coordenada de la linea fuente. Ambas variantes pertenecen al mismo XML.
  const origin = canonicalOrigin(row.origen_sistema);
  const branch = canonicalBranch(row.sucursal);
  const document = stable(row.codigo_interno_factura || row.factura);
  const item = stable(row.raw_data?.ITEM);
  const documentKind = stable(row.raw_data?.canonical_document_kind);
  if (!origin || !branch || !document || !item || !documentKind) return null;
  return [origin, branch, documentKind, document, item].join("|");
}

const commercialSnapshot = (row: BillingSourceLine) => ({
  origen_sistema: canonicalOrigin(row.origen_sistema),
  sucursal: canonicalBranch(row.sucursal),
  documento: stable(row.codigo_interno_factura || row.factura),
  factura: stable(row.factura),
  item: stable(row.raw_data?.ITEM),
  especie: stable(row.raw_data?.canonical_document_kind),
  vendedor: stable(row.vendedor),
  cod_mercaderia: stable(row.cod_mercaderia),
  codigo_fabricante: stable(row.codigo_fabricante),
  entidad_nombre: stable(row.entidad_nombre),
  mercaderia: stable(row.mercaderia),
  observacion: stable(row.observacion),
  cantidad: numberValue(row.cantidad),
  valor_unitario: numberValue(row.valor_unitario),
  total_venta: numberValue(row.total_venta),
  moneda: stable(row.moneda),
  fecha_factura: row.fecha_factura ?? null,
  linked_service_order: stable(row.raw_data?.linked_service_order),
  subgrupo_original: stable(row.subgrupo_original),
  grupo_normalizado: stable(row.grupo_normalizado),
  marca_normalizada: stable(row.marca_normalizada),
  tipo_facturacion: stable(row.tipo_facturacion),
  tipo_tiempo: stable(row.tipo_tiempo),
  // Dos lineas con valores iguales pero evidencia distinta no son duplicados
  // intercambiables: elegir una podria esconder una contradiccion de OS.
  evidence: {
    linked_service_order_evidence: row.raw_data?.linked_service_order_evidence ?? null,
    linked_service_order_known_values: row.raw_data?.linked_service_order_known_values ?? null,
    canonical_time_type_evidence: row.raw_data?.canonical_time_type_evidence ?? null,
    canonical_time_type_known_values: row.raw_data?.canonical_time_type_known_values ?? null,
    canonical_time_type_has_unknown: row.raw_data?.canonical_time_type_has_unknown ?? null,
    product_brand: row.raw_data?.product_brand ?? null,
    product_brand_evidence: row.raw_data?.product_brand_evidence ?? null,
    product_brand_known_values: row.raw_data?.product_brand_known_values ?? null,
  },
});

export function sameAuditedCommercialLine(left: BillingSourceLine, right: BillingSourceLine) {
  return JSON.stringify(commercialSnapshot(left)) === JSON.stringify(commercialSnapshot(right));
}

export type ValidatedBillingSourceBatch<T extends BillingSourceLine> = {
  rows: T[];
  collapsedExactDuplicates: number;
};

/** Valida y colapsa el lote completo antes de que el importador escriba nada. */
export function validateBillingSourceBatch<T extends BillingSourceLine>(
  incoming: T[],
): ValidatedBillingSourceBatch<T> {
  const byKey = new Map<string, T>();
  let collapsedExactDuplicates = 0;

  for (const row of incoming) {
    const origin = stable(row.origen_sistema);
    if (origin !== "NEW_XML_FACTURACION_DIRECTA" && origin !== "NEW_XML_FACTURACION_OS") {
      throw new Error(`Origen de facturacion TOTVS no permitido: ${origin || "VACIO"}. No se escribio ningun dato.`);
    }
    const key = billingSourceLineKey(row);
    if (!key) {
      throw new Error(
        "Linea TOTVS sin identidad fuente completa (origen, sucursal, DOCUMENTO, ITEM y tipo de documento). No se escribio ningun dato.",
      );
    }
    const current = byKey.get(key);
    if (!current) {
      byKey.set(key, row);
      continue;
    }
    if (!sameAuditedCommercialLine(current, row)) {
      throw new Error(`Conflicto dentro del XML para la identidad ${key}. No se escribio ningun dato.`);
    }
    collapsedExactDuplicates += 1;
  }

  return { rows: [...byKey.values()], collapsedExactDuplicates };
}
