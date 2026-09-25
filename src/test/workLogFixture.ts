import type { OrderWorkLog, WorkEntry } from "@/features/service-orders/workLog";
import { demoOrder } from "./serviceOrdersFixture";

export function demoWorkEntry(extra: Partial<WorkEntry> = {}): WorkEntry {
  return { id: "J1", fecha_inicio: "2026-09-10", fecha_fin: "2026-09-10", hora_inicio: "08:00:00", hora_fin: "18:00:00",
    tecnico_nombre: "TECNICO UNO", tecnico_profile_id: "T1", sucursal: "Santa Rita", tipo_tiempo: "Cliente", estado_validacion: "VALIDA", heredado: false, ...extra };
}
export function demoWorkLog(entries = [demoWorkEntry()], os = "01-00000001"): OrderWorkLog {
  return { os, order_data: demoOrder({ os_numero: os }), entries };
}
