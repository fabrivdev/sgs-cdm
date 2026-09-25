/** Presentation-only entry point. A future cross-module Analytics area can reuse
 * these charts with its own datasets and permissions, without mounting Services.
 * Legacy exports stay in place because Sales still consumes their shared helpers.
 */
export { CumplimientoAgendaChart, TecnicosNoRealizadosRanking, MatrizTécnicosDías,
  EstadoCompacto, CargaSucursalTabla, DistribucionMarca, TrabajosAbiertosList,
  WeeklyBars, SucursalBars, MixRubros } from "@/components/dashboard/DashboardCharts";
