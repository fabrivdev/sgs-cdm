import type { SalesColumn } from "@/components/ventas/salesTableInteraction";
import { matrixReportRows } from "@/lib/matrixReport";
import type { OperationsModel } from "./useOperationsModel";

export type ComplianceExportRow = {
  tipo: "Actividad" | "No disponibilidad";
  fecha: string;
  sucursal: string;
  tecnicos: string;
  ref: string;
  cliente: string;
  trabajo: string;
  estado: string;
};

function exportDate(value: string) {
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

export const complianceExportColumns: SalesColumn<ComplianceExportRow>[] = [
  { key: "tipo", label: "Tipo", kind: "text", value: row => row.tipo },
  // Export text explicitly to avoid a local-midnight timezone shift in XLSX.
  { key: "fecha", label: "Fecha", kind: "text", value: row => row.fecha, exportValue: row => exportDate(row.fecha) },
  { key: "sucursal", label: "Sucursal", kind: "text", value: row => row.sucursal },
  { key: "tecnicos", label: "Técnico(s)", kind: "text", value: row => row.tecnicos },
  { key: "ref", label: "OS/TR", kind: "text", value: row => row.ref },
  { key: "cliente", label: "Cliente", kind: "text", value: row => row.cliente },
  { key: "trabajo", label: "Trabajo / motivo", kind: "text", value: row => row.trabajo },
  { key: "estado", label: "Estado", kind: "text", value: row => row.estado },
];

export function complianceExportRows(data: OperationsModel["matrizTécnicosDías"]): ComplianceExportRow[] {
  const detail = matrixReportRows(data);
  return [
    ...detail.activity.map(row => ({
      tipo: "Actividad" as const,
      fecha: row.fecha,
      sucursal: row.sucursal,
      tecnicos: [...row.tecnicos].join(", "),
      ref: row.ref,
      cliente: row.cliente,
      trabajo: row.trabajo,
      estado: row.estado,
    })),
    ...detail.unavailable.map(row => ({
      tipo: "No disponibilidad" as const,
      fecha: row.fecha,
      sucursal: row.sucursal,
      tecnicos: row.tecnico,
      ref: "",
      cliente: "",
      trabajo: row.motivo,
      estado: "No disponible",
    })),
  ];
}
