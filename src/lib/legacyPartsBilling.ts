/** Conserva S/E con signo original: no transforma devoluciones en ventas. */
export function validateLegacyPartsMovement(movement: string, date: string | null, code: string,
  quantity: number, amount: number, excelRow: number): "S" | "E" {
  const kind = movement.trim().toUpperCase();
  const error = (reason: string): never => { throw new Error(`Fact. Repuestos, fila ${excelRow}: ${reason}`); };
  if (kind !== "S" && kind !== "E") return error("tipo de movimiento distinto de S/E");
  const parsed = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T00:00:00Z`) : null;
  if (!date || !parsed || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date
    || !code || date > "2026-06-30") return error("fecha/código histórico inválido");
  if (!Number.isFinite(quantity) || !Number.isFinite(amount)) return error("cantidad/importe inválido");
  if (kind === "E" && (quantity > 0 || amount >= 0)) return error("E debe tener importe negativo y cantidad no positiva");
  if (kind === "S" && (quantity < 0 || amount < 0)) return error("S no puede tener cantidad/importe negativo");
  return kind;
}

export function legacyPartsNumber(value: unknown, excelRow: number, label: string): number {
  if (value == null || String(value).trim() === "") throw new Error(`Fact. Repuestos, fila ${excelRow}: falta ${label}`);
  const text = String(value).trim().replace(/\s/g, "");
  const normalized = text.includes(",") && text.includes(".") ? text.replace(/\./g, "").replace(",", ".") : text.replace(",", ".");
  const result = typeof value === "number" ? value : Number(normalized);
  if (!Number.isFinite(result)) throw new Error(`Fact. Repuestos, fila ${excelRow}: ${label} inválido`);
  return result;
}
