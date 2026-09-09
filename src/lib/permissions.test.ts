import { describe, expect, it } from "vitest";
import { firstAccessibleRoute, roleHasCapability, SECTION_ROUTES } from "@/lib/permissions";

describe("matriz de permisos", () => {
  it("no concede modulos por ser administrador", () => {
    expect(firstAccessibleRoute(["parque"], ["admin"], false)).toBe("/parque-clientes");
    expect(firstAccessibleRoute([], ["admin"], false)).toBe("/admin");
  });

  it("respeta la primera sección habilitada dentro de un módulo", () => {
    expect(firstAccessibleRoute(["parque"], ["jefatura"], false, ["parque.stock"])).toBe("/parque-stock");
    expect(firstAccessibleRoute(["parque"], ["jefatura"], false, ["parque.importaciones"])).toBe("/parque-importaciones");
  });

  it("no publica las vistas retiradas como secciones funcionales", () => {
    expect(SECTION_ROUTES.some((section) => section.id === "servicios.agenda")).toBe(false);
    expect(SECTION_ROUTES.some((section) => section.id === "servicios.historial")).toBe(false);
  });

  it("reserva el acceso global para el superadministrador", () => {
    expect(firstAccessibleRoute([], ["admin"], true)).toBe("/");
    expect(firstAccessibleRoute([], ["superadmin"], false)).toBe("/");
    expect(roleHasCapability(["superadmin"], "administracion:gestionar")).toBe(true);
    expect(roleHasCapability(["superadmin"], "parque:eliminar")).toBe(true);
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
