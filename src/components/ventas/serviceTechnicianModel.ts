export type TechnicianOSDetail = {
  os_numero: string | null; tipo_tiempo: string;
  horas_os: number | null; horas_mo: number | null;
  mo_periodo: number | null; tiene_mo: boolean;
};
export type ServiceTechnicianRow = {
  tecnico_clave: string; tecnico: string;
  horas_cliente: number | null; horas_garantia: number | null;
  horas_interno: number | null; horas_otros: number | null; total_horas: number | null;
  mo_cliente: number; mo_garantia: number; mo_interno: number; mo_otros: number; mo_total: number;
  detalle_os: TechnicianOSDetail[];
};
export const addNullableHours = (a: number | null, b: number | null) =>
  a == null && b == null ? null : (a ?? 0) + (b ?? 0);

export function mergeTechnicianDetails(rows: TechnicianOSDetail[]): TechnicianOSDetail[] {
  const map = new Map<string, TechnicianOSDetail>();
  for (const row of rows) {
    const key = JSON.stringify([row.os_numero, row.tipo_tiempo]);
    const previous = map.get(key);
    map.set(key, previous ? { ...row,
      horas_os: addNullableHours(previous.horas_os, row.horas_os),
      horas_mo: addNullableHours(previous.horas_mo, row.horas_mo),
      mo_periodo: addNullableHours(previous.mo_periodo, row.mo_periodo),
      tiene_mo: previous.tiene_mo || row.tiene_mo,
    } : row);
  }
  return [...map.values()].sort((a, b) => (a.os_numero ?? "").localeCompare(b.os_numero ?? "", "es") || a.tipo_tiempo.localeCompare(b.tipo_tiempo, "es"));
}
