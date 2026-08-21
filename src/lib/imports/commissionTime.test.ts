import { describe, expect, it } from "vitest";
import type { CanonicalServiceOrderRow } from "@/lib/imports/canonical";
import {
  buildCommissionTimeEntries,
  calculateCommissionDuration,
  normalizeCommissionTime,
} from "@/lib/imports/commissionTime";

describe("commission time calculation", () => {
  it("normalizes compact and colon time values", () => {
    expect(normalizeCommissionTime("800")).toBe("08:00:00");
    expect(normalizeCommissionTime("16:30")).toBe("16:30:00");
    expect(normalizeCommissionTime("2470")).toBeNull();
  });

  it("uses timestamps and flags a wrong reported quantity", () => {
    const result = calculateCommissionDuration({
      startDate: "2026-08-20",
      startTime: "12:00:00",
      endDate: "2026-08-20",
      endTime: "16:00:00",
      reportedHours: 3.27,
    });
    expect(result.calculatedHours).toBe(4);
    expect(result.status).toBe("REVISAR");
    expect(result.reasons).toContain("DIFERENCIA_MAYOR_A_15_MINUTOS");
  });

  it("accepts a coherent duration and rejects incomplete timestamps", () => {
    expect(calculateCommissionDuration({
      startDate: "2026-08-20",
      startTime: "08:00:00",
      endDate: "2026-08-20",
      endTime: "12:00:00",
      reportedHours: 4,
    }).status).toBe("VALIDA");
    expect(calculateCommissionDuration({
      startDate: "2026-08-20",
      startTime: null,
      endDate: "2026-08-20",
      endTime: "12:00:00",
      reportedHours: 4,
    }).status).toBe("INVALIDA");
  });
});

describe("commission entries", () => {
  it("creates one ledger line per participating technician without duplicating a repeated name", () => {
    const row = {
      rowId: "row-1",
      sourceServiceOrderNumber: "123",
      branchCode: "01",
      serviceOrderNumber: "01-123",
      branch: "Santa Rita",
      status: "Cerrada",
      closeDate: "2026-08-20",
      technician: "001 - JUAN PEREZ",
      auxiliaryTechnicians: ["002 - ANA LOPEZ", "001 - JUAN PEREZ"],
      timeType: "Cliente",
      documentNumber: "90001",
      productCode: "-------",
      productName: "MA01",
      serviceHours: 3.27,
      raw: {
        ITEM: "1",
        canonical_start_date: "2026-08-20",
        canonical_start_time: "1200",
        canonical_end_date: "2026-08-20",
        canonical_end_time: "1600",
      },
    } as CanonicalServiceOrderRow;

    const entries = buildCommissionTimeEntries([row], "import-1", [
      { id: "profile-1", nombre: "JUAN PEREZ" },
      { id: "profile-2", nombre: "ANA LOPEZ" },
    ]);
    expect(entries).toHaveLength(2);
    expect(entries.map((entry) => entry.rol_tecnico).sort()).toEqual(["AUXILIAR", "PRINCIPAL"]);
    expect(entries.every((entry) => entry.horas_calculadas === 4)).toBe(true);
    expect(entries.every((entry) => entry.estado_validacion === "REVISAR")).toBe(true);
  });
});
