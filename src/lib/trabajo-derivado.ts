import { parseISO, isBefore, format } from "date-fns";

export type EstadoFila =
  | "fecha_pendiente"        // futura sin jornada
  | "pendiente_cargar"        // pasada/hoy sin jornada
  | "jornada_completada"
  | "jornada_incompleta"
  | "fecha_cancelada";

export interface ProgramacionRow {
  id: string;
  trabajo_id: string;
  fecha_programada: string;
  tecnico_principal_id: string | null;
  auxiliares: string[];
  observacion: string | null;
  estado?: string | null;
}

export interface JornadaRow {
  id: string;
  trabajo_id: string;
  programacion_id: string | null;
  fecha_real: string;
  tecnico_id: string;
  estado_jornada: string;
  horas_reales: number | null;
  observaciones: string | null;
  actividad_realizada: string | null;
}

export interface FilaUnificada {
  key: string;
  fecha: string;
  programacion?: ProgramacionRow;
  jornada?: JornadaRow;
  estado: EstadoFila;
}

const hoy0 = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

/** Une programaciones y jornadas en filas cronológicas (desc). */
export function unificarFechas(progs: ProgramacionRow[], jornadas: JornadaRow[]): FilaUnificada[] {
  const filas: FilaUnificada[] = [];
  const jornadasUsadas = new Set<string>();
  const hoy = hoy0();

  // Por programación: buscar jornada vinculada (por programacion_id o por fecha)
  for (const p of progs) {
    const j = jornadas.find(
      (x) =>
        !jornadasUsadas.has(x.id) &&
        (x.programacion_id === p.id || x.fecha_real === p.fecha_programada),
    );
    if (j) jornadasUsadas.add(j.id);

    let estado: EstadoFila;
    if (p.estado === "cancelada") {
      estado = "fecha_cancelada";
    } else if (j) {
      estado = j.estado_jornada === "incompleta" ? "jornada_incompleta" : "jornada_completada";
    } else {
      const fp = parseISO(p.fecha_programada);
      fp.setHours(0, 0, 0, 0);
      estado = isBefore(fp, hoy) ? "pendiente_cargar" : "fecha_pendiente";
    }

    filas.push({
      key: `p-${p.id}`,
      fecha: p.fecha_programada,
      programacion: p,
      jornada: j,
      estado,
    });
  }

  // Jornadas sueltas sin programación
  for (const j of jornadas) {
    if (jornadasUsadas.has(j.id)) continue;
    filas.push({
      key: `j-${j.id}`,
      fecha: j.fecha_real,
      jornada: j,
      estado: j.estado_jornada === "incompleta" ? "jornada_incompleta" : "jornada_completada",
    });
  }

  filas.sort((a, b) => b.fecha.localeCompare(a.fecha));
  return filas;
}

export interface ResumenDerivado {
  totalIntervenciones: number;
  totalProgramaciones: number;
  totalJornadas: number;
  pendientes: FilaUnificada[];
  futuras: FilaUnificada[];
  vencidas: FilaUnificada[];
  jornadasCompletadas: number;
  jornadasIncompletas: number;
  horasAcumuladas: number;
  proxima?: FilaUnificada;
  ultimaActividad?: string;
}

export function resumenTrabajo(filas: FilaUnificada[], jornadas: JornadaRow[]): ResumenDerivado {
  const pendientes = filas.filter((f) => f.estado === "fecha_pendiente" || f.estado === "pendiente_cargar");
  const futuras = filas.filter((f) => f.estado === "fecha_pendiente");
  const vencidas = filas.filter((f) => f.estado === "pendiente_cargar");
  const proxima = [...futuras].sort((a, b) => a.fecha.localeCompare(b.fecha))[0];
  const horasAcumuladas = jornadas.reduce((acc, j) => acc + (Number(j.horas_reales) || 0), 0);
  const jornadasCompletadas = jornadas.filter((j) => j.estado_jornada !== "incompleta").length;
  const jornadasIncompletas = jornadas.filter((j) => j.estado_jornada === "incompleta").length;
  const totalProgramaciones = filas.filter((f) => f.programacion).length;

  return {
    totalIntervenciones: filas.length,
    totalProgramaciones,
    totalJornadas: jornadas.length,
    pendientes,
    futuras,
    vencidas,
    jornadasCompletadas,
    jornadasIncompletas,
    horasAcumuladas,
    proxima,
  };
}

export type ProximaAccionTipo =
  | "sin_programaciones"
  | "tiene_futura"
  | "tiene_vencida"
  | "sin_pendientes_con_jornadas"
  | "completado"
  | "sin_actividad";

export interface ProximaAccion {
  tipo: ProximaAccionTipo;
  titulo: string;
  descripcion: string;
  primaria: { label: string; action: "programar" | "cargar_jornada" | "ver_jornadas" | "reabrir" };
  secundaria?: { label: string; action: "programar" | "cargar_jornada" | "ver_jornadas" };
}

export function calcularProximaAccion(estadoTrabajo: string, r: ResumenDerivado): ProximaAccion {
  if (estadoTrabajo === "completado") {
    return {
      tipo: "completado",
      titulo: "Trabajo completado",
      descripcion: "Todas las intervenciones tienen resultado y no quedan pendientes.",
      primaria: { label: "Programar intervención", action: "programar" },
      secundaria: { label: "Ver intervenciones", action: "ver_jornadas" },
    };
  }

  if (r.totalProgramaciones === 0 && r.totalJornadas === 0) {
    return {
      tipo: "sin_programaciones",
      titulo: "Programá la primera intervención",
      descripcion: "Este trabajo todavía no tiene visitas previstas. Programá una intervención para empezar.",
      primaria: { label: "Programar intervención", action: "programar" },
    };
  }

  if (r.vencidas.length > 0) {
    return {
      tipo: "tiene_vencida",
      titulo: `Hay ${r.vencidas.length} intervención${r.vencidas.length > 1 ? "es" : ""} pendiente${r.vencidas.length > 1 ? "s" : ""} de resultado`,
      descripcion:
        "Una visita programada ya pasó y todavía no tiene resultado. Cargá el resultado para que el trabajo siga avanzando.",
      primaria: { label: "Cargar resultado", action: "cargar_jornada" },
      secundaria: { label: "Programar otra intervención", action: "programar" },
    };
  }

  if (r.futuras.length > 0 && r.proxima) {
    return {
      tipo: "tiene_futura",
      titulo: `Próxima intervención: ${format(parseISO(r.proxima.fecha), "dd/MM/yyyy")}`,
      descripcion: "Hay una visita programada esperando ejecutarse. Podés cargar el resultado cuando se realice.",
      primaria: { label: "Cargar resultado", action: "cargar_jornada" },
      secundaria: { label: "Programar otra intervención", action: "programar" },
    };
  }

  if (r.pendientes.length === 0 && r.totalJornadas > 0) {
    return {
      tipo: "sin_pendientes_con_jornadas",
      titulo: "No hay intervenciones pendientes",
      descripcion: `Las ${r.totalJornadas} intervenciones ya tienen resultado. Si el trabajo debe seguir otro día, programá una nueva intervención.`,
      primaria: { label: "Programar intervención", action: "programar" },
      secundaria: { label: "Ver intervenciones", action: "ver_jornadas" },
    };
  }

  return {
    tipo: "sin_actividad",
    titulo: "Sin acción pendiente",
    descripcion: "Programá una nueva intervención cuando corresponda.",
    primaria: { label: "Programar intervención", action: "programar" },
  };
}

export const ESTADO_FILA_LABEL: Record<EstadoFila, string> = {
  fecha_pendiente: "Programada",
  pendiente_cargar: "Pendiente de resultado",
  jornada_completada: "Realizada",
  jornada_incompleta: "No realizada",
  fecha_cancelada: "Cancelada",
};

export function estadoFilaBadge(e: EstadoFila): string {
  switch (e) {
    case "fecha_pendiente":
      return "bg-blue-100 text-blue-800 border-blue-200";
    case "pendiente_cargar":
      return "bg-amber-100 text-amber-800 border-amber-200";
    case "jornada_completada":
      return "bg-emerald-100 text-emerald-800 border-emerald-200";
    case "jornada_incompleta":
      return "bg-orange-100 text-orange-800 border-orange-200";
    case "fecha_cancelada":
      return "bg-muted text-muted-foreground border-border";
  }
}

export function estadoFilaBorde(e: EstadoFila): string {
  switch (e) {
    case "fecha_pendiente":
      return "border-l-blue-400";
    case "pendiente_cargar":
      return "border-l-amber-500";
    case "jornada_completada":
      return "border-l-emerald-500";
    case "jornada_incompleta":
      return "border-l-orange-500";
    case "fecha_cancelada":
      return "border-l-muted-foreground/30";
  }
}

export const ESTADO_TRABAJO_HINT: Record<string, string> = {
  pendiente: "Aún no tiene intervenciones programadas.",
  programado: "Tiene intervenciones previstas, todavía sin resultado.",
  iniciado: "El trabajo está activo: ya tuvo actividad y todavía puede requerir nuevas intervenciones.",
  completado: "Todas las intervenciones tienen resultado y no quedan pendientes.",
};
