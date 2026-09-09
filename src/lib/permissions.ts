import type { Role } from "@/lib/constants";

export const SECTION_ROUTES = [
  { id: "servicios.planificador", module: "servicios", route: "/" },
  { id: "servicios.trabajos", module: "servicios", route: "/trabajos" },
  { id: "servicios.calendario", module: "servicios", route: "/calendario" },
  { id: "servicios.dashboard", module: "servicios", route: "/dashboard" },
  { id: "servicios.comisiones", module: "servicios", route: "/comisiones" },
  { id: "servicios.historial", module: "servicios", route: "/historial" },
  { id: "parque.clientes", module: "parque", route: "/parque-clientes" },
  { id: "parque.maquinas", module: "parque", route: "/parque-maquinas" },
  { id: "parque.stock", module: "parque", route: "/parque-stock" },
  { id: "parque.operaciones", module: "parque", route: "/parque-operaciones" },
  { id: "parque.importaciones", module: "parque", route: "/parque-importaciones" },
  { id: "repuestos.stock", module: "repuestos", route: "/repuestos" },
  { id: "repuestos.compras", module: "repuestos", route: "/repuestos/compras" },
  { id: "repuestos.sugerencias", module: "repuestos", route: "/repuestos/sugerencias" },
  { id: "admin.usuarios", module: "admin", route: "/admin" },
  { id: "admin.importaciones", module: "admin", route: "/admin" },
  { id: "admin.parametros", module: "admin", route: "/admin" },
] as const;

export type SectionKey = (typeof SECTION_ROUTES)[number]["id"];

export function sectionsFromLegacyModules(modules: readonly string[], roles: readonly Role[] = []) {
  const sections = SECTION_ROUTES
    .filter((section) => modules.includes(section.module))
    .map((section) => section.id);
  if (roles.includes("admin") || roles.includes("superadmin")) {
    sections.push("admin.usuarios", "admin.importaciones", "admin.parametros");
  }
  return Array.from(new Set(sections));
}

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
  sectionAccess: readonly string[] = [],
) {
  if (isSuperAdmin || roles.includes("superadmin")) return "/";
  const effectiveSections = sectionAccess.length ? sectionAccess : sectionsFromLegacyModules(moduloAccess, roles);
  const first = SECTION_ROUTES.find((section) => effectiveSections.includes(section.id));
  if (first) return first.route;
  return "/sin-acceso";
}
