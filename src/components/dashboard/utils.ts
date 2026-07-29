import { format } from "date-fns";
import { formatGuaranies } from "@/lib/utils";
import type { Facturacion, OSImpactRow, OSRubro, WeekRow, FactMetric, OSMetric, Concepto } from "./types";

export function money(value: number) {
  return `$ ${formatGuaranies(value || 0)}`;
}

export function pct(current: number, previous: number) {
  if (!previous) return null;
  return Math.round(((current - previous) / previous) * 100);
}

export function concept(row: Facturacion): Concepto {
  const grupoFx = String(row.grupo_fx ?? "").toLowerCase();
  const group = `${row.grupo_fx ?? ""} ${row.grupo ?? ""}`.toLowerCase();
  if (grupoFx === "maquinarias" || group.includes("002 - picadoras")) return "Maquinarias";
  if (row.tipo === "Repuesto" || group.includes("repuesto")) return "Repuestos";
  if (grupoFx === "kilometraje" || group.includes("kilomet")) return "Kilometraje";
  if (grupoFx === "servicio" || group.includes("mano de obra") || group.includes("service") || group.includes("servicio")) return "Servicio";
  return "Otros";
}

export function total(rows: Facturacion[]) {
  return rows.reduce((acc, row) => acc + Number(row.total_venta || 0), 0);
}

export function weekMetric(row: WeekRow | undefined, metric: FactMetric) {
  if (!row) return 0;
  if (metric === "horasServicio") return row.horasServicio;
  if (metric === "kmFacturados") return row.kmFacturados;
  return row.total;
}

export function comparisonWeekMetric(row: WeekRow | undefined, metric: FactMetric) {
  if (!row) return 0;
  if (metric === "horasServicio") return row.comparisonHorasServicio;
  if (metric === "kmFacturados") return row.comparisonKmFacturados;
  return row.comparisonTotal;
}

export function metricUnavailable(row: WeekRow | undefined, metric: FactMetric) {
  if (!row || metric === "usd") return false;
  if (metric === "horasServicio") return row.servicio > 0 && row.horasServicio === 0;
  return row.kilometraje > 0 && row.kmFacturados === 0;
}

export function formatWeekMetric(row: WeekRow | undefined, metric: FactMetric) {
  if (metricUnavailable(row, metric)) return "Sin dato";
  return formatFactMetric(weekMetric(row, metric), metric);
}

export function formatFactMetric(value: number, metric: FactMetric) {
  if (metric === "horasServicio") return `${Number(value || 0).toFixed(1).replace(".0", "")} hs`;
  if (metric === "kmFacturados") return `${Number(value || 0).toFixed(0)} km`;
  return money(value);
}

export function factMetricLabel(metric: FactMetric) {
  if (metric === "horasServicio") return "Horas servicio";
  if (metric === "kmFacturados") return "Km fact.";
  return "Total";
}

export function formatOSMetric(value: number, metric: OSMetric) {
  if (metric === "horas") return `${Number(value || 0).toFixed(1).replace(".0", "")} hs`;
  if (metric === "km") return `${Number(value || 0).toFixed(0)} km`;
  return money(value);
}

export function osMetricValue(row: { total: number; horas: number; km: number }, metric: OSMetric) {
  if (metric === "horas") return row.horas;
  if (metric === "km") return row.km;
  return row.total;
}

export function osRubroValue(row: OSImpactRow, rubro: OSRubro) {
  if (rubro === "Servicio") return row.servicios;
  if (rubro === "Repuestos") return row.repuestos;
  return row.kilometraje;
}

export function summarizeOSImpact(rows: OSImpactRow[], key: string, label: string, start: Date, end: Date) {
  return {
    key,
    label,
    start,
    end,
    rows,
    osCount: rows.length,
    total: rows.reduce((acc, row) => acc + row.total, 0),
    horas: rows.reduce((acc, row) => acc + row.horas, 0),
    km: rows.reduce((acc, row) => acc + row.km, 0),
    servicios: rows.reduce((acc, row) => acc + row.servicios, 0),
    repuestos: rows.reduce((acc, row) => acc + row.repuestos, 0),
    kilometraje: rows.reduce((acc, row) => acc + row.kilometraje, 0),
    garantia: rows.filter((row) => row.tipo === "Garantia").reduce((acc, row) => acc + row.total, 0),
    interno: rows.filter((row) => row.tipo === "Interno").reduce((acc, row) => acc + row.total, 0),
  };
}

export function compact(value: string, max = 34) {
  return value.length > max ? `${value.slice(0, max - 1)}...` : value;
}
