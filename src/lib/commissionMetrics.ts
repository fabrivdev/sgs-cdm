export interface CommissionClockRow {
  sucursal?: string | null;
  os_numero: string;
  fecha_inicio?: string | null;
  hora_inicio?: string | null;
  fecha_fin?: string | null;
  hora_fin?: string | null;
  horas_calculadas?: number | null;
}

/**
 * Identifica una jornada real de la OS. El técnico y el tipo de tiempo no
 * forman parte de la clave porque varios participantes comparten el mismo
 * bloque de trabajo y una corrección administrativa no cambia su duración.
 */
export function commissionClockBlockKey(row: CommissionClockRow) {
  return [row.fecha_inicio, row.hora_inicio, row.fecha_fin, row.hora_fin]
    .map((value) => String(value ?? ""))
    .join("|");
}

export function uniqueCommissionBlockHours(rows: CommissionClockRow[]) {
  const blocks = new Map<string, number>();
  for (const row of rows) {
    const key = commissionClockBlockKey(row);
    const value = Number(row.horas_calculadas ?? 0);
    blocks.set(key, Math.max(blocks.get(key) ?? 0, value));
  }
  return Array.from(blocks.values()).reduce((sum, value) => sum + value, 0);
}

/** Suma duración de OS, no horas-persona. */
export function totalUniqueCommissionOrderHours(rows: CommissionClockRow[]) {
  const orders = new Map<string, CommissionClockRow[]>();
  for (const row of rows) {
    const key = `${row.sucursal ?? ""}|${row.os_numero}`;
    orders.set(key, [...(orders.get(key) ?? []), row]);
  }
  return Array.from(orders.values()).reduce(
    (total, orderRows) => total + uniqueCommissionBlockHours(orderRows),
    0,
  );
}
