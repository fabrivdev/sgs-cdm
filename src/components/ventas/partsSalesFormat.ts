import { endOfDay, endOfISOWeek, endOfMonth, endOfYear, format } from "date-fns";
import type { PeriodMode } from "@/components/dashboard/types";

export const PARTS_HEADERS = ["Facturado", "Ventas", "Notas de crédito", "Clientes", "Documentos", "Unidades netas"];

export function partsRange({ desde, hasta }: { desde: string; hasta: string }, selected: string | null, mode: PeriodMode) {
  if (!selected) return { desde, hasta };
  const start = new Date(`${selected}T00:00:00`);
  const end = mode === "dia" ? endOfDay(start) : mode === "semana" ? endOfISOWeek(start) : mode === "anio" ? endOfYear(start) : endOfMonth(start);
  const last = format(end, "yyyy-MM-dd");
  return { desde: selected > desde ? selected : desde, hasta: last < hasta ? last : hasta };
}

export function validPartsRange({ desde, hasta }: { desde: string; hasta: string }) {
  const validDate = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parsed = new Date(`${value}T00:00:00`);
    return !Number.isNaN(parsed.getTime()) && format(parsed, "yyyy-MM-dd") === value;
  };
  return validDate(desde) && validDate(hasta) && desde <= hasta;
}
