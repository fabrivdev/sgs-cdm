import { useMemo } from "react";
import { useSectionTable } from "@/components/exports/useSectionTable";
import type { OperationsModel } from "./useOperationsModel";
import { complianceExportColumns, complianceExportRows } from "./complianceExport";

type Matrix = OperationsModel["matrizTécnicosDías"];

export function ComplianceDetailExport({ data }: { data: Matrix }) {
  const rows = useMemo(() => complianceExportRows(data), [data]);
  useSectionTable({
    rows,
    columns: complianceExportColumns,
    initialSort: { key: "fecha", direction: "asc" },
    title: "detalle de cumplimiento",
    sheetName: "Cumplimiento",
    fileName: "cumplimiento-detalle.xlsx",
  });
  return null;
}
