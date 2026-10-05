export type MatrixReportData = {
  buckets: string[];
  blocks: Array<{
    sucursal: string;
    técnicos: Array<{
      nombre: string;
      cells: Record<string, {
        refs?: Array<{
          id?: string;
          fecha?: string;
          ref: string;
          cliente: string;
          trabajo?: string;
          sucursal?: string;
          tecnico?: string;
          estado: string;
        }>;
        noDisponibilidad?: string[];
      }>;
    }>;
  }>;
};

export function matrixReportRows(data: MatrixReportData) {
  const activity = new Map<string, {
    fecha: string;
    bucket: string;
    sucursal: string;
    ref: string;
    cliente: string;
    trabajo: string;
    estado: string;
    tecnicos: Set<string>;
  }>();
  const unavailable: Array<{
    fecha: string;
    bucket: string;
    sucursal: string;
    tecnico: string;
    motivo: string;
  }> = [];

  for (const block of data.blocks) {
    for (const row of block.técnicos) {
      for (const bucket of data.buckets) {
        const cell = row.cells[bucket];
        if (!cell) continue;

        for (const item of cell.refs ?? []) {
          const key = [
            item.id ?? item.ref,
            item.fecha ?? bucket,
            item.ref,
            item.cliente,
            item.trabajo ?? "",
            item.estado,
          ].join("|");
          const current = activity.get(key) ?? {
            fecha: item.fecha ?? bucket,
            bucket,
            sucursal: item.sucursal ?? block.sucursal,
            ref: item.ref,
            cliente: item.cliente,
            trabajo: item.trabajo ?? "",
            estado: item.estado,
            tecnicos: new Set<string>(),
          };
          current.tecnicos.add(item.tecnico ?? row.nombre);
          activity.set(key, current);
        }

        for (const motivo of cell.noDisponibilidad ?? []) {
          unavailable.push({ fecha: bucket, bucket, sucursal: block.sucursal, tecnico: row.nombre, motivo });
        }
      }
    }
  }

  return {
    activity: [...activity.values()].sort((a, b) =>
      a.fecha.localeCompare(b.fecha) ||
      a.sucursal.localeCompare(b.sucursal) ||
      a.cliente.localeCompare(b.cliente) ||
      a.ref.localeCompare(b.ref)
    ),
    unavailable: unavailable.sort((a, b) =>
      a.fecha.localeCompare(b.fecha) ||
      a.sucursal.localeCompare(b.sucursal) ||
      a.tecnico.localeCompare(b.tecnico)
    ),
  };
}
