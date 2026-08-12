import { normalizarEstadoTrabajo } from "./trabajos";

const MS_DIA = 86_400_000;

export interface ClienteContactoInput {
  clienteId: string;
  ultSeguimientoFecha: string | null;
  ultServicioFecha: string | null;
  ultRepuestoFecha: string | null;
  tieneTrabajoAbierto: boolean;
  tieneRepEnRango: boolean;
  tieneSrvEnRango: boolean;
}

export interface KpiResult {
  totalMaquinas: number;
  totalClientes: number;
  conServicioRango: number;
  pctConServicioRango: number;
  conRepuestosRango: number;
  pctConRepuestosRango: number;
  contactadosRango: number;
  pctContactadosRango: number;
  sinContacto60d: number;
}

function parseFecha(fecha: string): Date {
  return new Date(fecha.includes("T") ? fecha : `${fecha}T00:00:00`);
}

export function diasDesde(fecha: string | null | undefined): number | null {
  if (!fecha) return null;
  return Math.floor((Date.now() - parseFecha(fecha).getTime()) / MS_DIA);
}

function fechaEnRango(fecha: string | null | undefined, desde: Date): boolean {
  if (!fecha) return false;
  return parseFecha(fecha).getTime() >= desde.getTime();
}

export function esContactadoEnRango(input: ClienteContactoInput, rangoDesde: Date): boolean {
  if (fechaEnRango(input.ultSeguimientoFecha, rangoDesde)) return true;
  if (input.tieneTrabajoAbierto) return true;
  if (input.tieneRepEnRango || input.tieneSrvEnRango) return true;
  return false;
}

export function esParaContactar(input: ClienteContactoInput): boolean {
  const diasServicio = diasDesde(input.ultServicioFecha);
  const diasSeguimiento = diasDesde(input.ultSeguimientoFecha);

  const sinServicioAnio = diasServicio == null || diasServicio > 365;
  const sinSeguimiento60 = diasSeguimiento == null || diasSeguimiento > 60;

  return sinServicioAnio && sinSeguimiento60 && !input.tieneTrabajoAbierto;
}

export function calcularKpis(
  inputs: (ClienteContactoInput & { cantMaquinas: number })[],
  rangoDesde: Date,
): KpiResult {
  let totalMaquinas = 0;
  let conServicioRango = 0;
  let conRepuestosRango = 0;
  let contactadosRango = 0;
  let sinContacto = 0;

  for (const input of inputs) {
    totalMaquinas += input.cantMaquinas;
    if (input.tieneSrvEnRango) conServicioRango++;
    if (input.tieneRepEnRango) conRepuestosRango++;
    if (esContactadoEnRango(input, rangoDesde)) contactadosRango++;
    if (esParaContactar(input)) sinContacto++;
  }

  const totalClientes = inputs.length;

  return {
    totalMaquinas,
    totalClientes,
    conServicioRango,
    pctConServicioRango: totalClientes > 0 ? Math.round((conServicioRango / totalClientes) * 100) : 0,
    conRepuestosRango,
    pctConRepuestosRango: totalClientes > 0 ? Math.round((conRepuestosRango / totalClientes) * 100) : 0,
    contactadosRango,
    pctContactadosRango: totalClientes > 0 ? Math.round((contactadosRango / totalClientes) * 100) : 0,
    sinContacto60d: sinContacto,
  };
}

export function buildClientesConTrabajoAbierto(
  trabajos: { cliente_id: string | null; estado_general: string }[],
): Set<string> {
  return new Set(
    trabajos
      .filter((t) => t.cliente_id && normalizarEstadoTrabajo(t.estado_general) !== "completado")
      .map((t) => t.cliente_id as string),
  );
}
