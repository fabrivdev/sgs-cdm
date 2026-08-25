import { describe, expect, it } from "vitest";
import { resolveDashboardServiceOrderBranch, serviceOrderBranchFromNumber } from "./serviceOrderBranch";

describe("dashboard service-order branch resolution", () => {
  it("derives the branch from the qualified OS number", () => {
    expect(serviceOrderBranchFromNumber("02-00000019")).toBe("Katuete");
    expect(serviceOrderBranchFromNumber("06/00000019")).toBe("Santa Rosa");
  });

  it("prefers the linked job and imported branch before the OS prefix", () => {
    expect(resolveDashboardServiceOrderBranch({
      jobBranch: "Misiones",
      rawData: { source_branch_code: "02" },
      orderNumber: "01-00000001",
    })).toBe("Misiones");

    expect(resolveDashboardServiceOrderBranch({
      rawData: { Sucursal: "03" },
      orderNumber: "01-00000001",
    })).toBe("Campo 9");

    expect(resolveDashboardServiceOrderBranch({
      rawData: { Sucursal: "02", source_branch_code: "02", canonical_branch: "Katuete" },
    })).toBe("Katuete");
  });

  it("keeps client fallbacks for legacy unqualified OS numbers", () => {
    expect(resolveDashboardServiceOrderBranch({
      orderNumber: "6137",
      clientBranch: "Loma Plata",
    })).toBe("Loma Plata");

    expect(resolveDashboardServiceOrderBranch({
      orderNumber: "6137",
      clientName: "CAMPOS DEL MANANA S.A. - SANTA RITA",
    })).toBe("Santa Rita");
  });

  it("returns null only when no source identifies the branch", () => {
    expect(resolveDashboardServiceOrderBranch({
      orderNumber: "6137",
      clientName: "CLIENTE SIN SEDE",
    })).toBeNull();
  });

  it("uses the technician branch only as the last reliable fallback", () => {
    expect(resolveDashboardServiceOrderBranch({
      orderNumber: "6137",
      clientName: "CLIENTE SIN SEDE",
      technicianBranch: "Santa Rosa",
    })).toBe("Santa Rosa");
  });
});
