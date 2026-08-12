import { describe, expect, it, vi } from "vitest";
import { calcularKpis } from "./contacto-utils";

describe("calcularKpis", () => {
  it("calcula la cobertura de servicio y repuestos según el rango consultado", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-12T12:00:00Z"));

    const resultado = calcularKpis([
      {
        clienteId: "cliente-reciente",
        ultSeguimientoFecha: null,
        ultServicioFecha: null,
        ultRepuestoFecha: "2026-03-01",
        tieneTrabajoAbierto: false,
        tieneRepEnRango: true,
        tieneSrvEnRango: true,
        cantMaquinas: 2,
      },
      {
        clienteId: "cliente-antiguo",
        ultSeguimientoFecha: null,
        ultServicioFecha: null,
        ultRepuestoFecha: "2025-01-01",
        tieneTrabajoAbierto: false,
        tieneRepEnRango: false,
        tieneSrvEnRango: false,
        cantMaquinas: 1,
      },
    ], new Date("2025-08-12T00:00:00"));

    expect(resultado.conRepuestosRango).toBe(1);
    expect(resultado.pctConRepuestosRango).toBe(50);
    expect(resultado.conServicioRango).toBe(1);
    expect(resultado.pctConServicioRango).toBe(50);

    vi.useRealTimers();
  });
});
