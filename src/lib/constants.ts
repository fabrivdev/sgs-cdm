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
/**
 * Nivel jerarquico global (no por modulo). "Cabecilla" y "tecnico" ya no son
 * valores guardados: son un nombre de presentacion para operativo/jefatura
 * cuando el usuario tiene acceso al modulo Servicios (ver nivelLabel() mas
 * abajo). Para cualquier otro modulo, o sin Servicios habilitado, se
 * muestra el nombre generico del nivel.
 */
export const ROLES = ["admin", "gerencia", "jefatura", "operativo"] as const;
export const TIPOS_TRABAJO = ["Visita de campo", "Máquina en taller"] as const;

/** Modulos habilitables por usuario (independiente del nivel). Espejo de la tabla public.modulos. */
export const MODULOS = ["servicios", "parque", "repuestos"] as const;
export const MODULO_LABELS: Record<(typeof MODULOS)[number], string> = {
  servicios: "Servicios",
  parque: "Parque",
  repuestos: "Repuestos",
};

export type Sucursal = (typeof SUCURSALES)[number];
export type Marca = (typeof MARCAS)[number];
export type Estado = (typeof ESTADOS)[number];
export type AssignableRole = (typeof ROLES)[number];
export type Role = AssignableRole | "superadmin";
export type Modulo = (typeof MODULOS)[number];
export type TipoTrabajo = (typeof TIPOS_TRABAJO)[number];

/** Nombres genericos del nivel. Para el alias usado en Servicios, ver nivelLabel() abajo. */
export const ROLE_LABELS: Record<Role, string> = {
  superadmin: "Superadministrador",
  admin: "Administrador",
  gerencia: "Gerencia",
  jefatura: "Jefatura",
  operativo: "Operativo",
};

/**
 * Nombre a mostrar para un nivel: "Tecnico"/"Cabecilla" solo cuando el
 * usuario tiene acceso al modulo Servicios, si no el nombre generico del
 * nivel. No hay alias especial para otros modulos todavia.
 */
export function nivelLabel(nivel: Role | null | undefined, moduloAccess: readonly string[] = []): string {
  if (!nivel) return "—";
  const tieneServicios = moduloAccess.includes("servicios");
  if (nivel === "operativo" && tieneServicios) return "Técnico";
  if (nivel === "jefatura" && tieneServicios) return "Cabecilla";
  return ROLE_LABELS[nivel];
}

export const FMT_DATE = "dd/MM/yyyy";
export const FMT_DATE_SHORT = "dd/MM";
export const FMT_DATE_DB = "yyyy-MM-dd";

export const DIAS_JORNADA_VENCIDA = 7;
export const MAX_SEARCH_RESULTS = 12;
export const MAX_TOP_RANKING = 5;
export const MAX_EVENTOS_DIA_CALENDARIO = 3;
export const MAX_DISPONIBILIDADES_DIA = 2;
