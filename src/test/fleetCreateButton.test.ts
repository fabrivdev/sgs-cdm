import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const fleetPage = readFileSync("src/pages/Flota.tsx", "utf8");
const workPage = readFileSync("src/pages/Trabajos.tsx", "utf8");

describe("fleet create button", () => {
  it("reuses the compact native mobile create pattern", () => {
    const nativeClasses = 'className="max-sm:w-11 max-sm:px-0"';

    expect(workPage).toContain(nativeClasses);
    expect(fleetPage).toContain(nativeClasses);
    expect(fleetPage).toContain('aria-label="Nuevo vehículo"');
    expect(fleetPage).toContain('<Plus className="h-4 w-4 sm:mr-1.5" />');
    expect(fleetPage).toContain('<span className="hidden sm:inline">Nuevo vehículo</span>');
    expect(fleetPage).not.toContain('className="h-11 px-3 sm:h-9"');
    expect(fleetPage).not.toContain('<span className="sm:hidden">+ Nuevo</span>');
  });
});
