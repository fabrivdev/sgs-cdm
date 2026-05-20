export const SUCURSALES = [
  "Santa Rita",
  "Santa Rosa",
  "Campo 9",
  "Misiones",
  "Loma Plata",
  "Katuete",
] as const;

export const MARCAS = ["CLAAS", "HORSCH", "OTROS"] as const;
export const ESTADOS = ["Pendiente", "Completado", "Cancelada"] as const;
export const ROLES = ["admin", "cabecilla", "tecnico"] as const;
export const TIPOS_TRABAJO = ["Visita de campo", "Máquina en taller"] as const;

export type Sucursal = (typeof SUCURSALES)[number];
export type Marca = (typeof MARCAS)[number];
export type Estado = (typeof ESTADOS)[number];
export type Role = (typeof ROLES)[number];
export type TipoTrabajo = (typeof TIPOS_TRABAJO)[number];

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Administrador",
  cabecilla: "Cabecilla",
  tecnico: "Técnico",
};
