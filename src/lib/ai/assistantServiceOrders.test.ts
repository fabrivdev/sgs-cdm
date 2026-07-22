import { describe, expect, it } from "vitest";
import {
  ASSISTANT_SERVICE_ORDER_SELECT,
  normalizeServiceOrderTechnician,
  resolveServiceOrderBranch,
  serviceOrderClientKey,
  serviceOrderTechniciansMatch,
} from "../../../supabase/functions/_shared/assistant-service-orders";

describe("assistant service-order schema", () => {
  it("never requests the logical branch as a physical OS column", () => {
    const columns = ASSISTANT_SERVICE_ORDER_SELECT.split(",");
    expect(columns).not.toContain("sucursal");
    expect(columns).toEqual(expect.arrayContaining(["os_numero", "trabajo_id", "raw_data"]));
  });
});

describe("assistant service-order branch resolution", () => {
  it("uses the linked job branch first", () => {
    const jobsById = new Map([["trabajo-1", { id: "trabajo-1", sucursal: "Misiones" }]]);
    expect(resolveServiceOrderBranch({ trabajo_id: "trabajo-1", os_numero: "01-0001" }, { jobsById }))
      .toBe("Misiones");
  });

  it("reads the source branch code persisted in raw_data", () => {
    expect(resolveServiceOrderBranch({ raw_data: { source_branch_code: "02" } })).toBe("Santa Rosa");
  });

  it("derives the branch from the qualified OS prefix", () => {
    expect(resolveServiceOrderBranch({ os_numero: "06-00000019" })).toBe("Katuete");
  });

  it("uses the stable client lookup when available", () => {
    const clientsByName = new Map([
      [serviceOrderClientKey("GANADERA EL FOGON S.A."), { nombre: "GANADERA EL FOGON S.A.", sucursal: "Santa Rita" }],
    ]);
    expect(resolveServiceOrderBranch({ cliente_nombre: "GANADERA EL FOGON SA" }, { clientsByName }))
      .toBe("Santa Rita");
  });

  it("can infer a branch embedded in the imported client name", () => {
    expect(resolveServiceOrderBranch({ cliente_nombre: "CAMPOS DEL MANANA S.A. - LOMA PLATA" }))
      .toBe("Loma Plata");
  });

  it("keeps a truthful fallback when no source can identify the branch", () => {
    expect(resolveServiceOrderBranch({ os_numero: "5741", cliente_nombre: "CLIENTE SIN SEDE" }))
      .toBe("Sin sucursal");
  });
});

describe("assistant service-order technician identity", () => {
  it("removes new-system codes from technician names", () => {
    expect(normalizeServiceOrderTechnician("ME0017 - JUAN PATINO")).toBe("JUAN PATINO");
  });

  it("unifies abbreviated new-system names with the legacy full name", () => {
    expect(serviceOrderTechniciansMatch(
      "ME0017 - JUAN PATINO",
      "JUAN DOMINGO PATIÑO CANTERO",
    )).toBe(true);
  });

  it("does not merge unrelated technicians who only share a first name", () => {
    expect(serviceOrderTechniciansMatch(
      "ME0017 - JUAN PATINO",
      "JUAN GABRIEL GAVILAN MEZA",
    )).toBe(false);
  });
});
