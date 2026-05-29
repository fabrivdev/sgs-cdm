export const ESTADOS_TRABAJO = [
  { key: "pendiente", label: "Pendiente", color: "bg-amber-50 border-amber-200" },
  { key: "programado", label: "Programado", color: "bg-blue-50 border-blue-200" },
  { key: "iniciado", label: "Iniciado", color: "bg-emerald-50 border-emerald-200" },
  { key: "pausado", label: "Pausado", color: "bg-orange-50 border-orange-200" },
  { key: "completado", label: "Completado", color: "bg-green-50 border-green-200" },
] as const;

export type EstadoTrabajo = (typeof ESTADOS_TRABAJO)[number]["key"];

export function normalizarEstadoTrabajo(estado: string | null | undefined): EstadoTrabajo {
  switch (estado) {
    case "programado":
      return "programado";
    case "en_pausa":
    case "bloqueado":
      return "pausado";
    case "iniciado":
    case "en_ejecucion":
      return "iniciado";
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

export function trabajoPausado(trabajo: { estado_general?: string | null; motivo_bloqueo?: string | null } | null | undefined) {
  return trabajo?.estado_general === "bloqueado" || trabajo?.estado_general === "en_pausa" || !!trabajo?.motivo_bloqueo?.trim();
}

export function estadoTrabajoLabel(estado: string | null | undefined) {
  const key = normalizarEstadoTrabajo(estado);
  return ESTADOS_TRABAJO.find((e) => e.key === key)?.label ?? key;
}

export function trabajoOsNumero(trabajo: {
  codigo?: string | null;
  os_numero?: string | number | null;
  proxima_accion?: string | null;
} | null | undefined) {
  const os = trabajo?.os_numero != null ? String(trabajo.os_numero).trim() : "";
  if (os) return os;

  const respaldo = String(trabajo?.proxima_accion ?? "");
  const matchRespaldo = respaldo.match(/\bOS[:#\s-]*(\d+)\b/i);
  if (matchRespaldo) return matchRespaldo[1];

  const codigo = String(trabajo?.codigo ?? "");
  const matchCodigo = codigo.match(/\bOS[:#\s-]*(\d+)\b/i);
  if (matchCodigo) return matchCodigo[1];

  return "";
}

export function trabajoReferencia(trabajo: { codigo?: string | null; os_numero?: string | number | null } | null | undefined) {
  const os = trabajoOsNumero(trabajo);
  if (os) return `OS-${os}`;
  return trabajo?.codigo ?? "TR-—";
}

interface JornadaEstadoTrabajo {
  fecha?: string | null;
  fecha_programada?: string | null;
  estado?: string | null;
}

function startOfLocalDay(value: Date) {
  const d = new Date(value);
  d.setHours(0, 0, 0, 0);
  return d;
}

function fechaJornada(j: JornadaEstadoTrabajo) {
  return j.fecha ?? j.fecha_programada ?? null;
}

export function estadoTrabajoDesdeJornadas(
  jornadas: JornadaEstadoTrabajo[],
  fallback?: string | null,
  hoy = new Date(),
): EstadoTrabajo {
  const fallbackNormalizado = normalizarEstadoTrabajo(fallback);
  if (fallbackNormalizado === "pausado") return "pausado";
  if (jornadas.length === 0) return normalizarEstadoTrabajo(fallback);

  const hoyLocal = startOfLocalDay(hoy);
  const realizadas = jornadas.filter((j) => j.estado === "Completado").length;
  const pendientes = jornadas.filter((j) => j.estado === "Pendiente");
  const pendientesVigentes = pendientes.filter((j) => {
    const fecha = fechaJornada(j);
    if (!fecha) return false;
    const d = startOfLocalDay(new Date(`${fecha}T00:00:00`));
    const diasVencida = Math.floor((hoyLocal.getTime() - d.getTime()) / 86400000);
    return diasVencida <= 7;
  }).length;

  if (realizadas > 0 && pendientes.length === 0) return "completado";
  if (realizadas > 0 && pendientes.length > 0) return "iniciado";
  if (pendientesVigentes > 0) return "programado";
  return "pendiente";
}

export const PRIORIDADES = [
  { key: "baja", label: "Baja" },
  { key: "media", label: "Media" },
  { key: "alta", label: "Alta" },
  { key: "urgente", label: "Urgente" },
] as const;
export type Prioridad = (typeof PRIORIDADES)[number]["key"];

export const ESTADOS_JORNADA = [
  { key: "completada", label: "Completada" },
  { key: "incompleta", label: "Incompleta" },
] as const;
export type EstadoJornada = "completada" | "incompleta";

export function estadoJornadaLabel(estado?: string | null) {
  if (estado === "incompleta") return "Incompleta";
  return "Completada";
}

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
