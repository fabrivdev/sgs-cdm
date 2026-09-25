import { emptyOperationsData, type OperationsData, type OperationsFilters, type OrdenServicioImportada } from "@/features/service-orders/useOperationsModel";

import type { OrderBilling } from "@/features/service-orders/billing";
export function demoBilling(extra: Partial<OrderBilling> = {}): OrderBilling {
  return { os: "01-00000001", matched: true, ambiguous: false, documents: ["000000000001"], date: "2026-09-10",
    labor: 600, parts: 0, travel: 180, thirdParty: 0, total: 780, laborLines: 1, missingRates: 0, billedHours: 12, ...extra };
}
export const operationsFilters: OperationsFilters = { dateFrom: "2026-09-01", dateTo: "2026-09-30", periodMode: "mes", q: "", fSucursales: [], fMarcas: [], fTiposTiempo: [], fEstadosTrabajo: [], fTécnicos: [], fResponsablesOS: [], fEstadosOS: [], fOSRubros: [] };
export function demoOrder(extra: Partial<OrdenServicioImportada> = {}): OrdenServicioImportada {
  return { os_numero: "01-00000001", trabajo_id: "W1", cliente_nombre: "CLIENTE DEMOSTRACIÓN", fecha_abierta_os: "2026-08-10", fecha_cierre_os: "2026-09-10", fecha_emision_factura: null, factura: null,
    nro_chasis: "DEMO-00001", responsable: "TECNICO UNO", marca: "CLAAS", problema: "REVISIÓN DEL SISTEMA HIDRÁULICO", tipo_tiempo: "Cliente", servicios_cantidad: 10,
    servicios_valor: 0, repuesto_valor: 0, km_cantidad: 0, kilometro_valor: 0, terceros_valor: 0, situacion_os: "Cerrada", situacion_facturacion: null, raw_data: {}, ...extra };
}
export function operationsFixture(): OperationsData {
  return { ...emptyOperationsData, metaHorasMensual: 120,
    profiles: [{ id: "T1", nombre: "TECNICO UNO", sucursal: "Santa Rita", activo: true, actualizado_en: null, desactivado_en: null },
      { id: "T2", nombre: "TECNICO DOS", sucursal: "Santa Rita", activo: false, actualizado_en: null, desactivado_en: "2026-09-16" }],
    servicioTecnicos: [{ id: "T1", nombre: "TECNICO UNO", sucursal: "Santa Rita" }],
    clientes: [{ id: "C1", nombre: "CLIENTE DEMOSTRACIÓN", sucursal: "Santa Rita" }],
    servicios: [{ id: "S1", fecha_programada: "2026-09-10", tecnico_responsable_id: "T1", auxiliares: [], sucursal: "Santa Rita", marca: "CLAAS", cliente_id: "C1", trabajo_descripcion: "REVISIÓN DEL SISTEMA HIDRÁULICO" }],
    trabajos: [{ id: "W1", codigo: "TR-DEMO1", estado_general: "programado", legacy_servicio_id: "S1", sucursal: "Santa Rita", marca: "CLAAS", cliente_id: "C1", descripcion_problema: "REVISIÓN DEL SISTEMA HIDRÁULICO", motivo_bloqueo: null }],
    jornadas: [
      { id: "J1", servicio_id: "S1", fecha: "2026-09-10", estado: "Completado", horas_trabajadas: 3, tecnico_responsable_id: "T1", auxiliares: [] },
      { id: "J2", servicio_id: "S1", fecha: "2026-09-10", estado: "Cancelada", horas_trabajadas: 0, tecnico_responsable_id: "T2", auxiliares: [] },
      { id: "J3", servicio_id: "S1", fecha: "2026-09-12", estado: "Pendiente", horas_trabajadas: 0, tecnico_responsable_id: "T1", auxiliares: [] },
    ], ordenesServicio: [demoOrder(), demoOrder({ os_numero: "01-00000002", fecha_abierta_os: "2026-09-12", fecha_cierre_os: null, situacion_os: "Abierta", responsable: "TECNICO DOS", servicios_cantidad: 0 })],
  };
}
