import { estadoTrabajoLabel, estadoJornadaLabel } from "@/lib/trabajos";

interface Evento {
  id: string;
  tipo_evento: string;
  payload: any;
  creado_en: string;
}

export interface EventoHumano {
  id: string;
  fecha: string;
  texto: string;
  detalle: any;
}

function nombreTec(id: string | null | undefined, profileMap: Map<string, { nombre: string }>) {
  if (!id) return "—";
  return profileMap.get(id)?.nombre ?? "técnico";
}

export function humanizarEvento(ev: Evento, profileMap: Map<string, { nombre: string }>): EventoHumano {
  const p = ev.payload ?? {};
  let texto = "Evento del trabajo.";

  switch (ev.tipo_evento) {
    case "trabajo_creado":
      texto = "Se creó el trabajo.";
      break;
    case "trabajo_actualizado":
      texto = "Se actualizaron los datos del trabajo.";
      break;
    case "cambio_estado":
    case "estado_cambiado": {
      const de = estadoTrabajoLabel(p.de);
      const a = estadoTrabajoLabel(p.a);
      texto = `El trabajo cambió de ${de} a ${a}.`;
      break;
    }
    case "programacion_creada":
      texto = `Se programó una nueva fecha para el ${p.fecha ?? "—"}${
        p.tecnico ? ` con el técnico ${nombreTec(p.tecnico, profileMap)}` : ""
      }.`;
      break;
    case "programacion_actualizada":
      texto = `Se modificó la programación del ${p.fecha ?? "—"}.`;
      break;
    case "programacion_eliminada":
      texto = `Se eliminó la programación del ${p.fecha ?? "—"}.`;
      break;
    case "jornada_creada":
      texto = `Se cargó una jornada del ${p.fecha ?? "—"} (${estadoJornadaLabel(p.estado)}).`;
      break;
    case "jornada_actualizada":
      if (p.de && p.a) {
        texto = `Se actualizó una jornada: pasó de ${estadoJornadaLabel(p.de)} a ${estadoJornadaLabel(p.a)}.`;
      } else {
        texto = `Se actualizó una jornada del ${p.fecha ?? "—"}.`;
      }
      break;
    case "jornada_eliminada":
      texto = `Se eliminó una jornada del ${p.fecha ?? "—"}.`;
      break;
    default:
      texto = `Evento: ${ev.tipo_evento.replace(/_/g, " ")}.`;
  }

  return { id: ev.id, fecha: ev.creado_en, texto, detalle: p };
}
