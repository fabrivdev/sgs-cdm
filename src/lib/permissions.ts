import type { Role } from "@/lib/constants";

export type Capability =
  | "administracion:gestionar"
  | "dashboard:ver"
  | "servicios:gestionar"
  | "servicios:ejecutar"
  | "parque:gestionar"
  | "parque:eliminar"
  | "repuestos:gestionar"
  | "datos:exportar";

const ROLE_CAPABILITIES: Record<Role, readonly Capability[]> = {
  superadmin: [
    "administracion:gestionar",
    "dashboard:ver",
    "servicios:gestionar",
    "servicios:ejecutar",
    "parque:gestionar",
    "parque:eliminar",
    "repuestos:gestionar",
    "datos:exportar",
  ],
  admin: [
    "administracion:gestionar",
    "dashboard:ver",
    "servicios:gestionar",
    "servicios:ejecutar",
    "parque:gestionar",
    "parque:eliminar",
    "repuestos:gestionar",
    "datos:exportar",
  ],
  gerencia: ["dashboard:ver", "datos:exportar"],
  jefatura: [
    "servicios:gestionar",
    "servicios:ejecutar",
    "parque:gestionar",
    "repuestos:gestionar",
    "datos:exportar",
  ],
  operativo: ["servicios:ejecutar"],
};

export function roleHasCapability(roles: readonly Role[], capability: Capability) {
  return roles.some((role) => ROLE_CAPABILITIES[role].includes(capability));
}

export function firstAccessibleRoute(
  moduloAccess: readonly string[],
  roles: readonly Role[],
  isSuperAdmin: boolean,
) {
  if (isSuperAdmin || roles.includes("superadmin") || moduloAccess.includes("servicios")) return "/";
  if (moduloAccess.includes("parque")) return "/parque-clientes";
  if (moduloAccess.includes("repuestos")) return "/repuestos";
  if (roles.includes("admin")) return "/admin";
  return "/sin-acceso";
}
