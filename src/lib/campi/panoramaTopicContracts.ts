import type { StoryTopicId, StoryUnit } from './panoramaStoryTypes';

/** Reviewed business contracts. New topics require a source and a regression test,
 * not just a selector label. Inventory reading dates are never source cutoffs. */
export type TopicContract = {
  queryGroup: string;
  unit: StoryUnit;
  formula: string;
  population: string;
  period: string;
  comparison: 'equivalent-period' | 'closed-month' | 'snapshot';
  chart: 'trend' | 'billing-bridge' | 'composition' | 'concentration' | 'comparison';
  limitations: readonly string[];
  evidence: readonly string[];
  tests: readonly string[];
};
export type EnabledTopicId = Exclude<StoryTopicId, 'repuestos_clientes' | 'maquinas_proyeccion' | 'maquinas_stock' | 'repuestos_demanda' | 'servicios_trabajo' | 'servicios_agenda' | 'maquinas_importacion' | 'maquinas_parque' | 'repuestos_reposicion' | 'servicios_comisiones'>;
export const PANORAMA_CONTRACTS = {
  ventas_evolucion: {
    queryGroup: 'sales', unit: 'USD', formula: 'Ventas antes de NC del período; variación = (actual / mismo tramo LY − 1) × 100 solo con base LY positiva.',
    population: 'Movimientos de venta de cada sección autorizada, sin consolidado parcial.',
    period: 'Mes y acumulado anual hasta fecha de análisis.',
    comparison: 'equivalent-period', chart: 'trend',
    limitations: ['La fecha de factura no acredita actualización de la fuente.'],
    evidence: ['salesStories.ts'], tests: ['salesStories.test.ts'],
  },
  ventas_facturacion: {
    queryGroup: 'sales', unit: 'USD', formula: 'Ventas antes de NC + NC firmadas = neto.',
    population: 'Todas las áreas autorizadas; una fuente fallida invalida el consolidado.',
    period: 'Mes y acumulado anual hasta fecha de análisis.',
    comparison: 'equivalent-period', chart: 'billing-bridge',
    limitations: ['Cambios entre lecturas pueden incluir correcciones, no solo ventas nuevas.'],
    evidence: ['salesStories.ts'], tests: ['salesStories.test.ts'],
  },
  ventas_neto_anual: {
    queryGroup: 'sales', unit: 'USD', formula: 'Ventas antes de NC menos NC acumuladas del año hasta el corte.',
    population: 'Todas las áreas de ventas autorizadas; una fuente fallida invalida el consolidado.',
    period: 'Año hasta el día de análisis frente al mismo tramo del año anterior.', comparison: 'equivalent-period', chart: 'trend',
    limitations: ['El mes abierto es parcial y no equivale a un mes completo.'], evidence: ['salesStories.ts'], tests: ['salesStories.test.ts'],
  },
  ventas_nc_impacto: {
    queryGroup: 'sales', unit: 'USD', formula: 'Importe absoluto de NC del mes; participación sobre ventas antes de NC cuando hay base positiva.',
    population: 'Todas las áreas de ventas autorizadas.', period: 'Mes hasta el día de análisis.', comparison: 'equivalent-period', chart: 'composition',
    limitations: ['Sin ventas positivas, el porcentaje no tiene base.'], evidence: ['salesStories.ts'], tests: ['salesStories.test.ts'],
  },
  ventas_repuestos: {
    queryGroup: 'sales', unit: 'USD', formula: 'Ventas positivas de Repuestos antes de NC.', population: 'Solo Repuestos con permiso de Ventas.',
    period: 'Mes y acumulado hasta el corte.', comparison: 'equivalent-period', chart: 'trend', limitations: [], evidence: ['salesStories.ts'], tests: ['salesStories.test.ts'],
  },
  ventas_servicios: {
    queryGroup: 'sales', unit: 'USD', formula: 'Ventas positivas de Servicios antes de NC.', population: 'Solo Servicios con permiso de Ventas.',
    period: 'Mes y acumulado hasta el corte.', comparison: 'equivalent-period', chart: 'trend', limitations: [], evidence: ['salesStories.ts'], tests: ['salesStories.test.ts'],
  },
  ventas_maquinas: {
    queryGroup: 'sales', unit: 'USD', formula: 'Ventas positivas de Máquinas antes de NC.', population: 'Solo Máquinas con permiso de Ventas.',
    period: 'Mes y acumulado hasta el corte.', comparison: 'equivalent-period', chart: 'trend', limitations: [], evidence: ['salesStories.ts'], tests: ['salesStories.test.ts'],
  },
  maquinas_pedidos: {
    queryGroup: 'orders-supply', unit: 'count', formula: 'Pedidos activos pendientes; cobertura completa solo si todas sus unidades pendientes tienen stock único acreditado y no facturado.',
    population: 'Excluye operaciones cerradas, facturadas y canceladas. Clasifica unidades por stock, importación arribada, tránsito y falta de vínculo.',
    period: 'Lectura de pedidos y abastecimiento.', comparison: 'snapshot', chart: 'composition',
    limitations: ['Tener stock no reemplaza la revisión comercial para emitir factura.', 'Ampliación SQL preparada para clasificar todo el universo; requiere aprobación de despliegue y conciliación.'],
    evidence: ['campi_pedidos_abastecimiento_v1', 'campi_pedidos_con_stock_v1'], tests: ['operationsStories.test.ts'],
  },
  maquinas_pedidos_stock: {
    queryGroup: 'orders-supply', unit: 'count', formula: 'Pedidos pendientes con al menos una unidad de stock físico positivo vinculada; porcentaje sobre pedidos pendientes.',
    population: 'Pedidos activos del mismo corte de abastecimiento.', period: 'Lectura del último reporte operativo.', comparison: 'snapshot', chart: 'composition',
    limitations: ['Stock asignado no sustituye la revisión comercial antes de facturar.'], evidence: ['campi_pedidos_con_stock_v1', 'campi_pedidos_abastecimiento_v1'], tests: ['operationsStories.test.ts'],
  },
  servicios_pendientes: {
    queryGroup: 'service-outcomes', unit: 'days', formula: 'Mediana de fecha de cierre operativo menos fecha de apertura.',
    population: 'OS cerradas por fecha de cierre en el rango, con ambas fechas válidas; apertura anterior incluida.',
    period: 'Mes actual hasta hoy o desde julio de 2026 hasta hoy.', comparison: 'snapshot', chart: 'trend',
    limitations: ['No reconstruye reaperturas.', 'Lectura completa paginada; no acredita por sí sola actualización histórica del origen. Sin comparación parcial contra mes completo.'],
    evidence: ['resolutionWindow.ts', 'seriesData.ts'], tests: ['operationsStories.test.ts'],
  },
  servicios_abiertas: {
    queryGroup: 'service-outcomes', unit: 'count', formula: 'Conteo de OS abiertas presentes en el último reporte TOTVS completo.',
    population: 'OS con estado que contiene Abiert; excluye En proceso y Sin estado.',
    period: 'Foto de OS abiertas.', comparison: 'snapshot', chart: 'composition',
    limitations: ['Antigüedad no acredita atraso.', 'El universo operativo habitual agrupa otros estados; el enlace usa cohorte explícita.'],
    evidence: ['campi_resolucion_os_v1'], tests: ['operationsStories.test.ts'],
  },
  servicios_os_antiguas: {
    queryGroup: 'service-outcomes', unit: 'count', formula: 'OS abiertas con más de 90 días desde apertura / todas las OS abiertas del último reporte TOTVS.',
    population: 'Solo OS abiertas del reporte TOTVS completo.', period: 'Foto de OS abiertas.', comparison: 'snapshot', chart: 'composition',
    limitations: ['Más de 90 días no prueba incumplimiento sin fecha comprometida.'], evidence: ['campi_os_abiertas_detalle_v1'], tests: ['operationsStories.test.ts'],
  },
  servicios_os_facturadas: {
    queryGroup: 'service-client-billing', unit: 'percent', formula: 'OS cerradas con tipo de tiempo Cliente y documento positivo vinculado / OS cerradas del período × 100.',
    population: 'OS del reporte TOTVS con estado cerrado y fecha de cierre en el período; identidad única para conciliar factura.',
    period: 'Mes o acumulado anual hasta el corte.', comparison: 'snapshot', chart: 'trend',
    limitations: ['La tasa describe la cohorte de cierres, no la facturación emitida en el período.', 'Serie por mes de cierre con un corte documental común; no reconstruye facturación conocida al cierre de cada mes.'],
    evidence: ['ordenes_servicio_importadas', 'service_orders_billing_v2'], tests: ['managerialStories.test.ts'],
  },
  repuestos_stock: {
    queryGroup: 'parts-exposure', unit: 'USD', formula: 'Valor positivo de ubicaciones con stock positivo de códigos en gris o rojo.',
    population: 'REP con saldo global positivo y ubicación física positiva.',
    period: 'Clasificación al día de análisis.', comparison: 'snapshot', chart: 'composition',
    limitations: ['Fecha de clasificación no es corte de inventario.', 'Sin historia no equivale a inmóvil.', 'Ampliación SQL preparada con los umbrales existentes 366–1000 y >1000 días; sin corte histórico de inventario.'],
    evidence: ['campi_repuestos_exposicion_v1'], tests: ['partsExposure.test.ts'],
  },
  repuestos_alertas: {
    queryGroup: 'parts-exposure', unit: 'USD', formula: 'Valor positivo que alcanzaría el umbral gris/rojo dentro de 30 días.',
    population: 'Mismo universo de exposición, con última compra comprobada.',
    period: 'Ventana móvil de 30 días.', comparison: 'snapshot', chart: 'composition',
    limitations: ['Condicionado a que no haya movimientos nuevos.', 'El paso del tiempo cambia la ventana.'],
    evidence: ['campi_repuestos_exposicion_v1'], tests: ['partsExposure.test.ts'],
  },
  repuestos_concentracion: {
    queryGroup: 'parts-exposure', unit: 'percent', formula: 'Valor de las tres mayores familias antiguas / valor antiguo total × 100.',
    population: 'Mismo universo de stock antiguo, incluida categoría sin familia.',
    period: 'Foto clasificada al día de análisis.', comparison: 'snapshot', chart: 'concentration',
    limitations: ['Una composición no mide mejora.', 'Familias pueden cambiar entre lecturas.'],
    evidence: ['campi_repuestos_exposicion_v1'], tests: ['partsExposure.test.ts'],
  },
  repuestos_rojo: {
    queryGroup: 'parts-exposure', unit: 'USD', formula: 'Valor positivo de ubicaciones con stock de códigos ROJO / valor positivo total.',
    population: 'Mismo universo valorizado del semáforo de repuestos.', period: 'Clasificación al día de análisis.', comparison: 'snapshot', chart: 'composition',
    limitations: ['La categoría depende de ventas trianuales y última compra; no equivale a obsolescencia contable.'], evidence: ['campi_repuestos_exposicion_v1'], tests: ['partsExposure.test.ts'],
  },
  repuestos_sucursales: {
    queryGroup: 'parts-branches', unit: 'days', formula: 'Suma de días desde última compra × USD positivo / USD positivo con fecha.',
    population: 'Valores positivos con compra fechada; informa cobertura.',
    period: 'Edad al día de análisis.', comparison: 'snapshot', chart: 'concentration',
    limitations: ['No es rotación.', 'Sin fecha excluido del promedio.', 'Corte físico no acreditado.'],
    evidence: ['operationsStories.ts'], tests: ['operationsStories.test.ts'],
  },
  agenda_cumplimiento: {
    queryGroup: 'planning', unit: 'percent', formula: 'Jornadas completadas / jornadas evaluables hasta el corte × 100.',
    population: 'Jornadas del período con estado válido; las futuras se excluyen.',
    period: 'Mes o año hasta el corte.', comparison: 'snapshot', chart: 'trend',
    limitations: ['Una jornada completada no acredita una OS cerrada.', 'Las reprogramaciones históricas no están reconstruidas.'],
    evidence: ['servicio_jornadas'], tests: ['managerialStories.test.ts'],
  },
  servicios_productividad: {
    queryGroup: 'work-productivity', unit: 'percent', formula: 'Horas-persona trabajadas / horas-persona disponibles × 100.',
    population: 'Técnicos elegibles del libro de trabajo de Servicios desde julio de 2026.',
    period: 'Mes hasta el corte.', comparison: 'snapshot', chart: 'comparison',
    limitations: ['Registros de tiempo inválidos o superpuestos no son horas trabajadas.', 'Sin capacidad histórica comparable no se dibuja evolución de productividad.'],
    evidence: ['workedProductivity.ts', 'service_orders_work_log_v1'], tests: ['managerialStories.test.ts'],
  },
  servicios_eficiencia: {
    queryGroup: 'service-billing-efficiency', unit: 'percent', formula: 'Horas facturadas / horas trabajadas de la misma cohorte de OS cerradas × 100.',
    population: 'OS cerradas en el mes desde julio de 2026 con facturación y horas conciliadas.',
    period: 'Mes hasta el corte.', comparison: 'snapshot', chart: 'trend',
    limitations: ['Una OS sin horas o con tarifa faltante deja la cohorte no medible.', 'Falta serie mensual de cohortes conciliadas; no representa pagos de caja.'],
    evidence: ['billingEfficiency', 'service_orders_billing_v2'], tests: ['managerialStories.test.ts'],
  },
  clientes_retencion: {
    queryGroup: 'customer-cohorts', unit: 'percent', formula: 'Compradores retenidos / compradores de cohorte base × 100.',
    population: 'Compradores identificados de posventa de ventanas comparables.',
    period: 'Mes actual y mes previo equivalente hasta el corte.', comparison: 'equivalent-period', chart: 'composition',
    limitations: ['Sin recompra no significa cliente perdido.', 'Una cohorte base vacía no produce tasa.'],
    evidence: ['gerencial_clientes_resumen_v1'], tests: ['managerialStories.test.ts'],
  },
  clientes_cobertura_posventa: {
    queryGroup: 'customer-cohorts', unit: 'percent', formula: 'Propietarios elegibles con compra neta positiva de posventa / propietarios elegibles × 100.',
    population: 'Clientes únicos con parque activo del mismo corte.',
    period: 'Mes o año hasta el corte.', comparison: 'snapshot', chart: 'comparison',
    limitations: ['La ausencia de compra no demuestra abandono.', 'El agregado no separa cobertura de Servicios y Repuestos sobre la misma base de propietarios.'],
    evidence: ['gerencial_clientes_resumen_v1'], tests: ['managerialStories.test.ts'],
  },
} satisfies Record<EnabledTopicId, TopicContract>;

export function topicContract(id: StoryTopicId): TopicContract | undefined {
  return id in PANORAMA_CONTRACTS ? PANORAMA_CONTRACTS[id as EnabledTopicId] : undefined;
}
