import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const guaraniFormatter = new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 });

/** Formatea un número como moneda Guaraní sin símbolo: "1.234.567" */
export function formatGuaranies(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return guaraniFormatter.format(n);
}
