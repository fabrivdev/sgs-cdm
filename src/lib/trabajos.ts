export const ESTADOS_TRABAJO = [
  { key: "nuevo", label: "Nuevo / Sin revisar", color: "bg-slate-100 border-slate-300" },
  { key: "pendiente_diagnostico", label: "Pendiente de diagnóstico", color: "bg-amber-50 border-amber-200" },
  { key: "pendiente_programar", label: "Pendiente de programar", color: "bg-orange-50 border-orange-200" },
  { key: "programado", label: "Programado", color: "bg-blue-50 border-blue-200" },
  { key: "en_ejecucion", label: "En ejecución", color: "bg-emerald-50 border-emerald-200" },
  { key: "bloqueado", label: "Bloqueado", color: "bg-red-50 border-red-200" },
  { key: "terminado_pendiente_validar", label: "Terminado pendiente validar", color: "bg-violet-50 border-violet-200" },
  { key: "cerrado", label: "Cerrado", color: "bg-green-50 border-green-200" },
] as const;

export type EstadoTrabajo = (typeof ESTADOS_TRABAJO)[number]["key"];

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
