import { describe, expect, it } from "vitest";
import { firstAccessibleRoute, roleHasCapability } from "@/lib/permissions";

describe("matriz de permisos", () => {
  it("no concede modulos por ser administrador", () => {
    expect(firstAccessibleRoute(["parque"], ["admin"], false)).toBe("/parque-clientes");
    expect(firstAccessibleRoute([], ["admin"], false)).toBe("/admin");
  });

  it("reserva el acceso global para el superadministrador", () => {
    expect(firstAccessibleRoute([], ["admin"], true)).toBe("/");
  });

  it("diferencia consulta, gestion y ejecucion", () => {
    expect(roleHasCapability(["gerencia"], "dashboard:ver")).toBe(true);
    expect(roleHasCapability(["gerencia"], "servicios:gestionar")).toBe(false);
    expect(roleHasCapability(["jefatura"], "parque:gestionar")).toBe(true);
    expect(roleHasCapability(["jefatura"], "parque:eliminar")).toBe(false);
    expect(roleHasCapability(["operativo"], "servicios:ejecutar")).toBe(true);
    expect(roleHasCapability(["operativo"], "datos:exportar")).toBe(false);
  });
});
