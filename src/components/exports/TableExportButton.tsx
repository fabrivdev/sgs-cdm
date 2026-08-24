import { useState } from "react";
import { ChevronDown, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

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
}: {
  options: TableExportOption[];
  label?: string;
  className?: string;
}) {
  const [exporting, setExporting] = useState(false);
  const available = options.filter((option) => optionRowCount(option) !== 0);

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

  const buttonContent = exporting ? (
    <><Loader2 className="h-3.5 w-3.5 animate-spin" />Preparando…</>
  ) : (
    <><Download className="h-3.5 w-3.5" />{label}</>
  );

  if (options.length <= 1) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={cn("h-8 gap-1.5 whitespace-nowrap text-[12px]", className)}
        disabled={exporting || available.length === 0}
        onClick={() => available[0] && void exportOption(available[0])}
      >
        {buttonContent}
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn("h-8 gap-1.5 whitespace-nowrap text-[12px]", className)}
          disabled={exporting || available.length === 0}
        >
          {buttonContent}<ChevronDown className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[220px]">
        <DropdownMenuLabel className="text-[11px] text-muted-foreground">Qué tabla descargar</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {options.map((option) => (
          <DropdownMenuItem
            key={`${option.filename}-${option.label}`}
            disabled={optionRowCount(option) === 0}
            onSelect={() => void exportOption(option)}
            className="gap-2 text-[12px]"
          >
            <Download className="h-3.5 w-3.5" />
            <span className="flex-1">{option.label}</span>
            {optionRowCount(option) != null && (
              <span className="text-[10px] tabular-nums text-muted-foreground">{optionRowCount(option)}</span>
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
