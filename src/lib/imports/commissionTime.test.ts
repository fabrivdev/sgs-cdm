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
      ownerName: "CLIENTE PRUEBA",
      billedClientName: "CLIENTE FACTURADO",
      chassis: "CHASIS-123",
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
    } as unknown as CanonicalServiceOrderRow;

    const entries = buildCommissionTimeEntries([row], "import-1", [
      { id: "profile-1", nombre: "JUAN PEREZ" },
      { id: "profile-2", nombre: "ANA LOPEZ" },
    ]);
    expect(entries).toHaveLength(2);
    expect(entries.map((entry) => entry.rol_tecnico).sort()).toEqual(["AUXILIAR", "PRINCIPAL"]);
    expect(entries.every((entry) => entry.horas_calculadas === 4)).toBe(true);
    expect(entries.every((entry) => entry.estado_validacion === "REVISAR")).toBe(true);
    expect(entries.every((entry) => entry.cliente_nombre === "CLIENTE PRUEBA")).toBe(true);
    expect(entries.every((entry) => entry.nro_chasis === "CHASIS-123")).toBe(true);
  });

  it("keeps a technician outside the active roster auditable but not payable", () => {
    const row = {
      rowId: "row-inactive",
      sourceServiceOrderNumber: "124",
      branchCode: "01",
      serviceOrderNumber: "01-124",
      branch: "Santa Rita",
      status: "Cerrada",
      closeDate: "2026-08-20",
      technician: "999 - TECNICO ANTERIOR",
      auxiliaryTechnicians: [],
      timeType: "Cliente",
      documentNumber: "90002",
      productCode: "MA01",
      productName: "MANO DE OBRA",
      serviceHours: 4,
      raw: {
        ITEM: "1",
        canonical_start_date: "2026-08-20",
        canonical_start_time: "0800",
        canonical_end_date: "2026-08-20",
        canonical_end_time: "1200",
      },
    } as unknown as CanonicalServiceOrderRow;

    const [entry] = buildCommissionTimeEntries([row], "import-1", []);
    expect(entry.tecnico_profile_id).toBeNull();
    expect(entry.estado_validacion).toBe("REVISAR");
    expect(entry.horas_validas).toBeNull();
    expect(entry.motivos_validacion).toContain("TECNICO_FUERA_DE_NOMINA_ACTIVA");
  });

  it("includes technicians from MA01, KM and SE lines but excludes spare-parts lines", () => {
    const base = {
      sourceServiceOrderNumber: "200",
      branchCode: "01",
      serviceOrderNumber: "01-200",
      branch: "Santa Rita",
      ownerName: "CLIENTE PRUEBA",
      billedClientName: null,
      chassis: "CHASIS-200",
      status: "Cerrada",
      closeDate: "2026-08-20",
      auxiliaryTechnicians: [],
      timeType: "Cliente",
      documentNumber: "90200",
    };
    const rows = [
      {
        ...base,
        rowId: "labor-row",
        technician: "001 - JUAN PATINO",
        productCode: "MA01",
        productName: "MA01",
        serviceHours: 4,
        kilometreQuantity: 0,
        raw: { ITEM: "1", canonical_start_date: "2026-08-20", canonical_start_time: "0800", canonical_end_date: "2026-08-20", canonical_end_time: "1200" },
      },
      {
        ...base,
        rowId: "kilometre-row",
        technician: "002 - RUBEN CACERES",
        productCode: "KM01",
        productName: "KM",
        serviceHours: 0,
        kilometreQuantity: 25,
        raw: { ITEM: "2", canonical_start_date: "2026-08-20", canonical_start_time: "1300", canonical_end_date: "2026-08-20", canonical_end_time: "1400" },
      },
      {
        ...base,
        rowId: "third-party-row",
        technician: "004 - PABLO DIAZ",
        productCode: "SE",
        productName: "SERVICIO TERCERIZADO",
        serviceHours: 0,
        kilometreQuantity: 0,
        raw: { ITEM: "3" },
      },
      {
        ...base,
        rowId: "part-row",
        technician: "003 - PEDIDOR REPUESTOS",
        productCode: "REP001",
        productName: "FILTRO",
        serviceHours: 0,
        kilometreQuantity: 0,
        raw: { ITEM: "4", canonical_start_date: "2026-08-20", canonical_start_time: "1400", canonical_end_date: "2026-08-20", canonical_end_time: "1500" },
      },
    ] as unknown as CanonicalServiceOrderRow[];

    const entries = buildCommissionTimeEntries(rows, "import-2", [
      { id: "profile-1", nombre: "JUAN PATINO" },
      { id: "profile-2", nombre: "RUBEN CACERES" },
      { id: "profile-3", nombre: "PEDIDOR REPUESTOS" },
      { id: "profile-4", nombre: "PABLO DIAZ" },
    ]);

    expect(entries.map((entry) => entry.tecnico_nombre).sort()).toEqual(["JUAN PATINO", "PABLO DIAZ", "RUBEN CACERES"]);
    const kilometreTechnician = entries.find((entry) => entry.tecnico_nombre === "RUBEN CACERES");
    expect(kilometreTechnician?.horas_calculadas).toBe(4);
    expect(kilometreTechnician?.fecha_inicio).toBe("2026-08-20");
    expect(kilometreTechnician?.hora_inicio).toBe("08:00:00");
    expect(kilometreTechnician?.raw_data.inherited_from_ma01).toBe(true);
    const thirdPartyTechnician = entries.find((entry) => entry.tecnico_nombre === "PABLO DIAZ");
    expect(thirdPartyTechnician?.horas_calculadas).toBe(4);
    expect(thirdPartyTechnician?.fecha_inicio).toBe("2026-08-20");
    expect(thirdPartyTechnician?.hora_inicio).toBe("08:00:00");
    expect(thirdPartyTechnician?.raw_data.source_participant_origin).toBe("SE");
    expect(thirdPartyTechnician?.raw_data.inherited_from_ma01).toBe(true);
  });
});
