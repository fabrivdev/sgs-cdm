import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { createSalesWorkbook } from "@/components/ventas/salesTableExport";
import { complianceExportColumns, complianceExportRows } from "./complianceExport";

describe("compliance detail export", () => {
  it("exports the same dated activity and unavailability detail as the matrix report", () => {
    const data = {
      buckets: ["2026-09-28", "2026-10-10"],
      bucketLabels: { "2026-09-28": "Lun 28/09", "2026-10-10": "Sab 10/10" },
      bucketMode: "dia" as const,
      overLimit: false,
      currentBucketKey: "2026-09-28",
      blocks: [{
        sucursal: "CENTRAL",
        totalActividad: 3,
        totalTécnicos: 2,
        técnicos: [
          { id: "T1", nombre: "TÉCNICO UNO", sucursal: "CENTRAL", sinAsignacion: false, tieneNoDisponibilidad: true, cells: {
            "2026-09-28": { jornadas: 1, horas: 2, realizadas: 1, noRealizadas: 0, programadas: 0, noDisponibilidad: ["Capacitación"], refs: [{ id: "J1", fecha: "2026-09-28", ref: "TR-1", cliente: "CLIENTE", trabajo: "Servicio", sucursal: "CENTRAL", tecnico: "TÉCNICO UNO", estado: "Realizada" }] },
            "2026-10-10": { jornadas: 1, horas: 0, realizadas: 0, noRealizadas: 0, programadas: 1, noDisponibilidad: [], refs: [{ id: "J2", fecha: "2026-10-10", ref: "TR-2", cliente: "CLIENTE", trabajo: "Revisión", sucursal: "CENTRAL", tecnico: "TÉCNICO UNO", estado: "Programada" }] },
          } },
          { id: "T2", nombre: "TÉCNICO DOS", sucursal: "CENTRAL", sinAsignacion: false, tieneNoDisponibilidad: false, cells: {
            "2026-09-28": { jornadas: 1, horas: 2, realizadas: 1, noRealizadas: 0, programadas: 0, noDisponibilidad: [], refs: [{ id: "J1", fecha: "2026-09-28", ref: "TR-1", cliente: "CLIENTE", trabajo: "Servicio", sucursal: "CENTRAL", tecnico: "TÉCNICO DOS", estado: "Realizada" }] },
          } },
        ],
      }],
    };

    const rows = complianceExportRows(data);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ fecha: "2026-09-28", tecnicos: "TÉCNICO UNO, TÉCNICO DOS", ref: "TR-1", estado: "Realizada" });
    expect(rows[1]).toMatchObject({ fecha: "2026-10-10", ref: "TR-2", estado: "Programada" });
    expect(rows[2]).toMatchObject({ tipo: "No disponibilidad", fecha: "2026-09-28", trabajo: "Capacitación", estado: "No disponible" });

    const workbook = createSalesWorkbook(rows, complianceExportColumns, "Cumplimiento");
    const values = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets.Cumplimiento, { header: 1, raw: false });
    expect(values[0]).toEqual(["Tipo", "Fecha", "Sucursal", "Técnico(s)", "OS/TR", "Cliente", "Trabajo / motivo", "Estado"]);
    expect(values[1]).toEqual(expect.arrayContaining(["Actividad", "28/09/2026", "TR-1", "Realizada"]));
    expect(values[2]).toEqual(expect.arrayContaining(["Actividad", "10/10/2026", "TR-2", "Programada"]));
  });
});
