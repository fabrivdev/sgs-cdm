import { addDays, format, parseISO, subYears } from "date-fns";
import type { Tables } from "@/integrations/supabase/types";
import type { OperationsData, Profile } from "./useOperationsModel";

// Queries are intentionally operational. No invoice ledger, dashboard RPC or writes.
const PAGE = 1000;
export function validOperationsRange(from: string, to: string) {
  const valid = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(parseISO(value).getTime()) && format(parseISO(value), "yyyy-MM-dd") === value;
  return valid(from) && valid(to) && from <= to;
}

// Supabase imported tables have not all been regenerated in the database types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function loadOperationsData(client: any, from: string, to: string, signal?: AbortSignal): Promise<{ data: OperationsData; capacityWarning: string | null }> {
  if (!validOperationsRange(from, to)) throw new Error("Seleccioná un rango de fechas válido.");
  const start = format(subYears(parseISO(from), 1), "yyyy-MM-dd");
  const end = format(addDays(parseISO(to), 90), "yyyy-MM-dd");
  // Every required source is complete and ordered before publishing the snapshot.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function all<T>(query: any): Promise<T[]> {
    const rows: T[] = [];
    for (let offset = 0; ; offset += PAGE) {
      signal?.throwIfAborted();
      const request = query.range(offset, offset + PAGE - 1);
      const { data, error } = await (signal ? request.abortSignal(signal) : request);
      if (error) throw error;
      rows.push(...(data ?? []));
      if (!data || data.length < PAGE) return rows;
    }
  }
  async function profiles(): Promise<Profile[]> {
    for (const columns of ["id,nombre,sucursal,activo,actualizado_en,desactivado_en", "id,nombre,sucursal,activo,actualizado_en", "id,nombre,sucursal,activo"]) {
      try {
        const rows = await all<Profile>(client.from("profiles").select(columns).order("id"));
        return rows.map(row => ({ ...row, activo: row.activo ?? true, actualizado_en: row.actualizado_en ?? null,
          desactivado_en: row.desactivado_en ?? (row.activo === false ? row.actualizado_en ?? null : null) }));
      } catch (error) {
        // Only old-schema missing-column errors allow another shape, never permissions/timeouts.
        if (!(error && typeof error === "object" && "code" in error && ["42703", "PGRST204"].includes(String(error.code)))) throw error;
      }
    }
    throw new Error("No se pudieron leer los perfiles técnicos.");
  }
  const orderColumns = [
    "os_numero", "trabajo_id", "cliente_nombre", "fecha_abierta_os", "fecha_cierre_os", "fecha_emision_factura",
    "factura", "nro_chasis", "responsable", "marca", "problema", "tipo_tiempo", "servicios_cantidad", "servicios_valor",
    "repuesto_valor", "km_cantidad", "kilometro_valor", "terceros_valor", "situacion_os", "situacion_facturacion", "raw_data",
  ] as const satisfies readonly (keyof Tables<"ordenes_servicio_importadas">)[];
  const orders = async () => {
    const parts = await Promise.all(["fecha_abierta_os", "fecha_cierre_os"].map(date =>
      all<OperationsData["ordenesServicio"][number]>(client.from("ordenes_servicio_importadas").select(orderColumns.join(",")).gte(date, start).lte(date, `${to}T23:59:59`).order("os_numero"))));
    // The table primary key is the full OS number, including branch prefix and leading zeros.
    return [...new Map(parts.flat().map(row => [row.os_numero, row])).values()];
  };
  const technicians = async () => {
    const request = client.rpc("servicios_listar_tecnicos_activos");
    const { data, error } = await (signal ? request.abortSignal(signal) : request);
    if (error) throw error;
    return data ?? [];
  };
  const goal = async () => {
    const request = client.from("app_configuracion").select("valor_numero").eq("clave", "meta_horas_mensual_tecnico").maybeSingle();
    const { data, error } = await (signal ? request.abortSignal(signal) : request);
    const value = Number(data?.valor_numero);
    return !error && Number.isFinite(value) && value > 0 ? value : null;
  };
  const [servicios, trabajos, clientes, profileRows, jornadas, disponibilidades, ordenesServicio, servicioTecnicos, meta] = await Promise.all([
    all<OperationsData["servicios"][number]>(client.from("servicios").select("id,fecha_programada,tecnico_responsable_id,auxiliares,sucursal,marca,cliente_id,trabajo_descripcion").order("id")),
    all<OperationsData["trabajos"][number]>(client.from("trabajos").select("id,codigo,estado_general,legacy_servicio_id,sucursal,marca,cliente_id,descripcion_problema,motivo_bloqueo,creado_en,actualizado_en").order("id")),
    all<OperationsData["clientes"][number]>(client.from("clientes").select("id,nombre,sucursal").order("id")),
    profiles(),
    all<OperationsData["jornadas"][number]>(client.from("servicio_jornadas").select("id,servicio_id,fecha,estado,horas_trabajadas,tecnico_responsable_id,auxiliares").gte("fecha", start).lte("fecha", end).order("id")),
    all<OperationsData["disponibilidades"][number]>(client.from("tecnico_disponibilidad").select("id,tecnico_id,fecha_inicio,fecha_fin,tipo,observacion,bloquea_agenda").lte("fecha_inicio", to).gte("fecha_fin", from).order("id")),
    orders(), technicians(), goal(),
  ]);
  signal?.throwIfAborted();
  return { data: { servicios, trabajos, clientes, profiles: profileRows, jornadas, disponibilidades, ordenesServicio, servicioTecnicos, metaHorasMensual: meta ?? 0 },
    capacityWarning: meta == null ? "Meta de productividad no disponible. Revisá la configuración y los permisos; no se calcula el porcentaje." : null };
}
