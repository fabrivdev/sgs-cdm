import { describe, expect, it } from "vitest";
import { nivelLabel } from "./constants";

describe("nivelLabel", () => {
  it("shows Tecnico for operativo only when the user has Servicios access", () => {
    expect(nivelLabel("operativo", ["servicios"])).toBe("Técnico");
    expect(nivelLabel("operativo", ["repuestos"])).toBe("Operativo");
    expect(nivelLabel("operativo", [])).toBe("Operativo");
  });

  it("shows Cabecilla for jefatura only when the user has Servicios access", () => {
    expect(nivelLabel("jefatura", ["servicios"])).toBe("Cabecilla");
    expect(nivelLabel("jefatura", ["repuestos"])).toBe("Jefatura");
    expect(nivelLabel("jefatura", [])).toBe("Jefatura");
  });

  it("never aliases admin or gerencia, regardless of modulo access", () => {
    expect(nivelLabel("admin", ["servicios"])).toBe("Administrador");
    expect(nivelLabel("gerencia", ["servicios"])).toBe("Gerencia");
  });

  it("returns a dash when there is no nivel", () => {
    expect(nivelLabel(null)).toBe("—");
    expect(nivelLabel(undefined)).toBe("—");
  });

  it("defaults moduloAccess to empty when omitted", () => {
    expect(nivelLabel("operativo")).toBe("Operativo");
  });
});
