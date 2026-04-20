export const SUCURSALES = [
  "Santa Rita",
  "Santa Rosa",
  "Campo 9",
  "Misiones",
  "Loma Plata",
  "Katuete",
] as const;

export const MARCAS = ["CLAAS", "HORSCH"] as const;
export const ESTADOS = ["Pendiente", "Iniciado", "Completado"] as const;
export const ROLES = ["admin", "cabecilla", "tecnico"] as const;

export type Sucursal = (typeof SUCURSALES)[number];
export type Marca = (typeof MARCAS)[number];
export type Estado = (typeof ESTADOS)[number];
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Administrador",
  cabecilla: "Cabecilla",
  tecnico: "Técnico",
};
