import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { mobileHeaderCreateButton } from "@/lib/ui-classes";

const fleetPage = readFileSync("src/pages/Flota.tsx", "utf8");
const workPage = readFileSync("src/pages/Trabajos.tsx", "utf8");
const adminPage = readFileSync("src/pages/Admin.tsx", "utf8");
const parkPage = readFileSync("src/pages/ParqueClientes.tsx", "utf8");
const operationsPage = readFileSync("src/pages/MaquinariaOperaciones.tsx", "utf8");
const plannerPage = readFileSync("src/pages/Planificador.tsx", "utf8");

describe("mobile header create buttons", () => {
  it("keeps a transparent 44 px target with explicit interaction states only on phones", () => {
    expect(mobileHeaderCreateButton.split(" ").every((token) => token.startsWith("max-sm:"))).toBe(true);
    expect(mobileHeaderCreateButton).toContain("max-sm:h-11");
    expect(mobileHeaderCreateButton).toContain("max-sm:w-11");
    expect(mobileHeaderCreateButton).toContain("max-sm:bg-transparent");
    expect(mobileHeaderCreateButton).toContain("max-sm:text-primary");
    expect(mobileHeaderCreateButton).toContain("max-sm:hover:bg-primary/10");
    expect(mobileHeaderCreateButton).toContain("max-sm:focus-visible:ring-primary");
    expect(mobileHeaderCreateButton).toContain("max-sm:disabled:bg-transparent");
  });

  it("applies one shared treatment to every page-header creation flow", () => {
    [workPage, fleetPage, adminPage, parkPage, operationsPage, plannerPage].forEach((source) => {
      expect(source).toContain("mobileHeaderCreateButton");
      expect(source).not.toContain('className="max-sm:w-11 max-sm:px-0"');
    });
    expect(plannerPage).not.toContain('className="max-sm:w-11 max-sm:bg-transparent max-sm:px-0 max-sm:text-primary');
    expect(fleetPage).toContain('aria-label="Nuevo vehículo"');
    expect(fleetPage).toContain('<Plus className="h-4 w-4 sm:mr-1.5" />');
    expect(fleetPage).toContain('<span className="hidden sm:inline">Nuevo vehículo</span>');
    expect(fleetPage).toContain('aria-label="Registrar lectura" className={mobileHeaderCreateButton}');
    expect(fleetPage).toContain('<Gauge className="h-4 w-4 sm:mr-1.5" />');
    expect(fleetPage).toContain('<span className="hidden sm:inline">Registrar lectura</span>');
    expect(fleetPage).not.toContain('className="h-11 px-3 sm:h-9"');
    expect(fleetPage).not.toContain('<span className="sm:hidden">+ Nuevo</span>');
  });
});
