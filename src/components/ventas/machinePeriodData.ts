import type { PeriodMode } from '@/components/dashboard/types';
import type { MaquinasDashboardResponse, MaquinasResumen } from './MaquinasVentas';
import { periodWindows } from './salesPeriodComparison';
/** The RPC supplies a complete line ledger for this filtered range. Never derive money from units. */
export function machinePeriodData(data: MaquinasDashboardResponse, from: string, to: string, mode: PeriodMode): MaquinasDashboardResponse {
  const empty: MaquinasResumen = {total:0,facturas:0,clientes:0,vendidas:0,notas_credito:0,netas:0,promedio_unidad:0};
  const lines = Array.isArray(data.lineas) ? data.lineas : null;
  return { ...data, periodos: periodWindows(from,to,mode).map(window => {
    const original = data.periodos.find(row=>row.periodo===window.periodo);
    const inPeriod = lines?.filter(row=>row.fecha.slice(0,10)>=window.from && row.fecha.slice(0,10)<=window.to);
    const amountsKnown = inPeriod && inPeriod.every(row=>row.facturado != null && Number.isFinite(Number(row.facturado)))
      && Math.abs(inPeriod.reduce((sum,row)=>sum+Number(row.facturado),0) - Number(original?.total ?? 0)) < 0.005;
    return { ...(original ?? empty), periodo:window.periodo,
      venta_bruta: amountsKnown ? inPeriod.reduce((sum,row)=>sum+Math.max(0,Number(row.facturado)),0) : undefined,
      notas_credito_monto: amountsKnown ? inPeriod.reduce((sum,row)=>sum+Math.abs(Math.min(0,Number(row.facturado))),0) : undefined,
    };
  }) };
}
