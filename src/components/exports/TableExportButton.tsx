import { useState } from "react";
import { toast } from "sonner";
import { SectionActionsMenu, type SectionAction } from "./SectionActionsMenu";

export type ExportCell = string | number | boolean | null | undefined;

export interface TableExportOption {
  label: string;
  filename: string;
  sheetName?: string;
  rows: Array<Record<string, ExportCell>> | (() => Array<Record<string, ExportCell>>);
  rowCount?: number;
}

function optionRowCount(option: TableExportOption) {
  return option.rowCount ?? (Array.isArray(option.rows) ? option.rows.length : null);
}

function safeFilename(value: string) {
  const base = value.replace(/\.xlsx$/i, "").replace(/[<>:"/\\|?*]+/g, "-").trim();
  return `${base || "exportacion"}.xlsx`;
}

function safeSheetName(value: string) {
  return value.replace(/[\\/?*:[\]]+/g, " ").trim().slice(0, 31) || "Datos";
}

export function TableExportButton({
  options,
  label = "Exportar",
  className,
  extraActions = [],
}: {
  options: TableExportOption[];
  label?: string;
  className?: string;
  extraActions?: readonly SectionAction[];
}) {
  const [exporting, setExporting] = useState(false);

  const exportOption = async (option: TableExportOption) => {
    setExporting(true);
    try {
      const XLSX = await import("xlsx");
      const rows = typeof option.rows === "function" ? option.rows() : option.rows;
      if (rows.length === 0) {
        toast.info("La tabla no tiene filas para exportar.");
        return;
      }
      const worksheet = XLSX.utils.json_to_sheet(rows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, safeSheetName(option.sheetName ?? option.label));
      XLSX.writeFile(workbook, safeFilename(option.filename));
    } catch (error) {
      toast.error(`No se pudo generar el archivo: ${error instanceof Error ? error.message : "error desconocido"}`);
    } finally {
      setExporting(false);
    }
  };

  return <SectionActionsMenu busy={exporting} className={className} options={[...options.map((option, index) => ({
    id: `${option.filename}-${index}`, label: `${label} ${option.label}`,
    disabled: optionRowCount(option) === 0, onSelect: () => exportOption(option),
  })), ...extraActions]} />;
}
