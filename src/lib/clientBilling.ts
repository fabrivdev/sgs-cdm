export const TOTVS_BILLING_START = "2026-07-01";

export type ClientBillingEntry = {
  id: string;
  fecha: string;
  tipo: "Repuesto" | "Servicio";
  total_venta: number;
  grupo: string | null;
  grupo_fx: string | null;
  cod_factura: string;
};

export type TotvsBillingLine = {
  id: string;
  fecha_factura: string | null;
  factura: string | null;
  codigo_interno_factura: string | null;
  grupo_normalizado: string | null;
  subgrupo_original: string | null;
  total_venta: number;
};

export type ClientBillingStats = {
  ytd: number;
  prev: number;
  varPct: number | null;
  lista: ClientBillingEntry[];
};

const normalizedGroup = (line: TotvsBillingLine) =>
  (line.grupo_normalizado || line.subgrupo_original || "").trim().toLowerCase();

const billingKind = (line: TotvsBillingLine): Pick<ClientBillingEntry, "tipo" | "grupo_fx"> | null => {
  const group = normalizedGroup(line);
  if (group === "repuesto" || group === "repuestos") {
    return { tipo: "Repuesto", grupo_fx: "Repuesto" };
  }
  if (["mano de obra", "servicio", "servicios"].includes(group)) {
    return { tipo: "Servicio", grupo_fx: "Mano de obra" };
  }
  if (group === "kilometraje") {
    return { tipo: "Servicio", grupo_fx: "Kilometraje" };
  }
  return null;
};

/**
 * Combines the non-overlapping legacy and TOTVS periods used throughout Parque.
 * TOTVS rows are deduplicated only by their persisted line id; equal legitimate
 * lines remain separate and are summed into their document/category entry.
 */
export function mergeClientBilling(
  legacyRows: ClientBillingEntry[],
  totvsLines: TotvsBillingLine[],
): ClientBillingEntry[] {
  const legacy = legacyRows
    .filter((row) => row.fecha.slice(0, 10) < TOTVS_BILLING_START)
    .map((row) => ({ ...row, total_venta: Number(row.total_venta) }));
  const uniqueLines = new Map(totvsLines.map((line) => [line.id, line]));
  const grouped = new Map<string, ClientBillingEntry>();

  for (const line of uniqueLines.values()) {
    const date = line.fecha_factura?.slice(0, 10);
    const kind = billingKind(line);
    if (!date || date < TOTVS_BILLING_START || !kind) continue;

    const invoice = (line.factura || line.codigo_interno_factura || "Sin número").trim();
    const group = (line.subgrupo_original || line.grupo_normalizado || kind.grupo_fx).trim();
    const key = [date, invoice, kind.tipo, kind.grupo_fx, group].join("|");
    const current = grouped.get(key);
    if (current) {
      current.total_venta += Number(line.total_venta);
    } else {
      grouped.set(key, {
        id: `totvs:${key}`,
        fecha: date,
        tipo: kind.tipo,
        total_venta: Number(line.total_venta),
        grupo: group,
        grupo_fx: kind.grupo_fx,
        cod_factura: invoice,
      });
    }
  }

  return [...legacy, ...grouped.values()].sort((a, b) =>
    b.fecha.localeCompare(a.fecha) || b.cod_factura.localeCompare(a.cod_factura, "es", { numeric: true }),
  );
}

export function calculateClientBillingStats(
  rows: ClientBillingEntry[],
  type: ClientBillingEntry["tipo"],
  currentYear: number,
): ClientBillingStats {
  let ytd = 0;
  let prev = 0;
  const matching = rows.filter((row) => {
    if (row.tipo !== type) return false;
    const group = (row.grupo_fx ?? "").trim().toUpperCase();
    return type !== "Servicio" || group === "MANO DE OBRA" || group === "KILOMETRAJE";
  });

  for (const row of matching) {
    const year = Number(row.fecha.slice(0, 4));
    if (year === currentYear) ytd += Number(row.total_venta);
    if (year === currentYear - 1) prev += Number(row.total_venta);
  }

  return {
    ytd,
    prev,
    varPct: prev > 0 ? Math.round(((ytd - prev) / prev) * 100) : ytd > 0 ? 100 : null,
    lista: matching.slice(0, 10),
  };
}
