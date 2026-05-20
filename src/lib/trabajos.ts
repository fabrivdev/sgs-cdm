export const ESTADOS_TRABAJO = [
  { key: "pendiente", label: "Pendiente", color: "bg-amber-50 border-amber-200" },
  { key: "programado", label: "Programado", color: "bg-blue-50 border-blue-200" },
  { key: "iniciado", label: "Iniciado", color: "bg-emerald-50 border-emerald-200" },
  { key: "en_pausa", label: "En pausa", color: "bg-slate-100 border-slate-300" },
  { key: "completado", label: "Completado", color: "bg-green-50 border-green-200" },
] as const;

export type EstadoTrabajo = (typeof ESTADOS_TRABAJO)[number]["key"];

export function normalizarEstadoTrabajo(estado: string | null | undefined): EstadoTrabajo {
  switch (estado) {
    case "programado":
      return "programado";
    case "iniciado":
    case "en_ejecucion":
      return "iniciado";
    case "en_pausa":
    case "bloqueado":
      return "en_pausa";
    case "completado":
    case "cerrado":
    case "terminado_pendiente_validar":
      return "completado";
    case "pendiente":
    case "nuevo":
    case "pendiente_diagnostico":
    case "pendiente_programar":
    default:
      return "pendiente";
  }
}

export function siguientesEstadosTrabajo(estado: string | null | undefined): EstadoTrabajo[] {
  const actual = normalizarEstadoTrabajo(estado);

  switch (actual) {
    case "pendiente":
      return ["programado"];
    case "programado":
      return ["iniciado"];
    case "iniciado":
      return ["en_pausa", "completado"];
    case "en_pausa":
      return ["iniciado", "completado"];
    case "completado":
    default:
      return [];
  }
}

export function estadoTrabajoLabel(estado: string | null | undefined) {
  const key = normalizarEstadoTrabajo(estado);
  return ESTADOS_TRABAJO.find((e) => e.key === key)?.label ?? key;
}

export const PRIORIDADES = [
  { key: "baja", label: "Baja" },
  { key: "media", label: "Media" },
  { key: "alta", label: "Alta" },
  { key: "urgente", label: "Urgente" },
] as const;
export type Prioridad = (typeof PRIORIDADES)[number]["key"];

export const ESTADOS_PROGRAMACION = [
  { key: "programada", label: "Programada" },
  { key: "cumplida", label: "Cumplida" },
  { key: "reprogramada", label: "Reprogramada" },
  { key: "cancelada", label: "Cancelada" },
] as const;
export type EstadoProgramacion = (typeof ESTADOS_PROGRAMACION)[number]["key"];

export const ESTADOS_JORNADA = [
  { key: "en_curso", label: "En curso" },
  { key: "completada", label: "Completada" },
  { key: "incompleta", label: "Incompleta" },
] as const;
export type EstadoJornada = (typeof ESTADOS_JORNADA)[number]["key"];

export function prioridadBadge(p: Prioridad) {
  switch (p) {
    case "urgente": return "bg-red-600 text-white";
    case "alta": return "bg-orange-500 text-white";
    case "media": return "bg-blue-500 text-white";
    case "baja": return "bg-slate-400 text-white";
  }
}

export function calcularHoras(inicio?: string | null, fin?: string | null): number | null {
  if (!inicio || !fin) return null;
  const [hi, mi] = inicio.split(":").map(Number);
  const [hf, mf] = fin.split(":").map(Number);
  const mins = (hf * 60 + mf) - (hi * 60 + mi);
  if (mins <= 0) return null;
  return Math.round((mins / 60) * 100) / 100;
}
