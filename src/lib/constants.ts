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
/**
 * Etiquetas visibles. El valor DB no cambia para mantener compatibilidad.
 * - Pendiente  = agenda sin resultado cargado
 * - Completado = jornada Realizada (el técnico fue y trabajó ese día)
 * - Cancelada  = jornada No realizada (no se pudo ejecutar la visita)
 */
export const ESTADO_LABELS: Record<(typeof ESTADOS)[number], string> = {
  Pendiente: "Pendiente",
  Completado: "Realizada",
  Cancelada: "No realizada",
};
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
