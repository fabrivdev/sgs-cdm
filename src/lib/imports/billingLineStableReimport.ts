type BillingSourceLine = {
  id?: string;
  origen_sistema: string | null;
  codigo_interno_factura: string | null;
  factura: string | null;
  sucursal: string | null;
  cod_mercaderia: string | null;
  entidad_nombre: string | null;
  mercaderia: string | null;
  observacion: string | null;
  cantidad: number | null;
  valor_unitario: number | null;
  total_venta: number | null;
  moneda: string | null;
  codigo_fabricante: string | null;
  fecha_factura: string | null;
  raw_data: Record<string, unknown> | null;
};

const stable = (value: unknown) => String(value ?? "").trim().toUpperCase();

export function billingSourceLineKey(row: BillingSourceLine): string | null {
  const item = stable(row.raw_data?.ITEM);
  const document = stable(row.codigo_interno_factura || row.factura);
  const origin = stable(row.origen_sistema);
  const branch = stable(row.sucursal || row.raw_data?.FILIAL || row.raw_data?.LOJA);
  if (!origin || !document || !branch || !item) return null;
  return [origin, branch, document, item].join("|");
}

const same = (left: unknown, right: unknown) => stable(left) === stable(right);
const sameNumber = (left: unknown, right: unknown) => {
  if (left == null || right == null) return left == null && right == null;
  return Number(left) === Number(right);
};

export function sameAuditedCommercialLine(left: BillingSourceLine, right: BillingSourceLine) {
  return same(left.codigo_interno_factura || left.factura, right.codigo_interno_factura || right.factura)
    && same(left.sucursal || left.raw_data?.FILIAL || left.raw_data?.LOJA, right.sucursal || right.raw_data?.FILIAL || right.raw_data?.LOJA)
    && same(left.raw_data?.ITEM, right.raw_data?.ITEM)
    && same(left.cod_mercaderia, right.cod_mercaderia)
    && same(left.entidad_nombre, right.entidad_nombre)
    && same(left.mercaderia, right.mercaderia)
    && same(left.observacion, right.observacion)
    && sameNumber(left.cantidad, right.cantidad)
    && sameNumber(left.valor_unitario, right.valor_unitario)
    && sameNumber(left.total_venta, right.total_venta);
}

const sameCurrentHashInputs = (left: BillingSourceLine, right: BillingSourceLine) =>
  same(left.origen_sistema, right.origen_sistema)
  && same(left.codigo_interno_factura, right.codigo_interno_factura)
  && same(left.factura, right.factura)
  && same(left.cod_mercaderia, right.cod_mercaderia)
  && same(left.codigo_fabricante, right.codigo_fabricante)
  && same(left.observacion, right.observacion)
  && sameNumber(left.total_venta, right.total_venta);

export type BillingStablePlan<T extends BillingSourceLine> = {
  insert: T[];
  update: Array<{ id: string; row: T }>;
};

export function planBillingStableReimport<T extends BillingSourceLine>(
  existing: BillingSourceLine[],
  incoming: T[],
): BillingStablePlan<T> {
  const byKey = new Map<string, BillingSourceLine[]>();
  for (const row of existing) {
    const key = billingSourceLineKey(row);
    if (!key) continue;
    byKey.set(key, [...(byKey.get(key) ?? []), row]);
  }

  const plan: BillingStablePlan<T> = { insert: [], update: [] };
  for (const row of incoming) {
    const key = billingSourceLineKey(row);
    const candidates = key ? byKey.get(key) ?? [] : [];
    if (!key || candidates.length === 0) {
      plan.insert.push(row);
      continue;
    }

    const exact = candidates.filter((candidate) => sameCurrentHashInputs(candidate, row));
    if (exact.length === 1) {
      // El upsert actual ya reconoce este hash. Mantenerlo en insert evita
      // reescribir manualmente clasificaciones o metadatos del registro.
      plan.insert.push(row);
      continue;
    }
    if (candidates.length !== 1 || !candidates[0].id || !sameAuditedCommercialLine(candidates[0], row)) {
      throw new Error(`Conflicto de identidad estable en facturacion: ${key}. Requiere auditoria antes de importar.`);
    }
    plan.update.push({ id: candidates[0].id, row });
  }
  return plan;
}

export function billingSourceRepairPatch(row: BillingSourceLine) {
  return {
    fecha_factura: row.fecha_factura,
    codigo_fabricante: row.codigo_fabricante,
    moneda: row.moneda,
  };
}
