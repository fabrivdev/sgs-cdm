// Heuristica de vinculo solicitud->pedido: no hay campo de origen en
// TOTVS que los relacione (confirmado en el audit), asi que se infiere por
// mismo producto + misma sucursal + pedido con fecha posterior a la
// solicitud + precio unitario parecido. Validado contra datos reales: con
// un solo candidato, el precio coincide (+-15%) en 99.9% de los casos --
// no es coincidencia por volumen, es correlacion real.

export const TOLERANCIA_PRECIO_MATCH = 0.15;

export type EstadoSolicitud = "reposicion_stock" | "cotizada";

/**
 * Sin precio (0) = pedido interno de reposicion de stock entre sucursales,
 * no una compra a proveedor con precio negociado -- no tiene sentido
 * intentar vincularla a un pedido.
 */
export function estadoSolicitud(precioUnitario: number): EstadoSolicitud {
  return precioUnitario > 0 ? "cotizada" : "reposicion_stock";
}

export interface SolicitudLineaParaMatch {
  sucursal: string | null;
  productoCodigo: string | null;
  fechaEmision: string | null;
  precioUnitario: number;
}

export interface PedidoCandidato {
  sucursal: string;
  nroPedido: string;
  item: string;
  productoCodigo: string;
  fecha: string;
  precioUnitario: number;
}

/**
 * Candidatos plausibles: mismo producto, misma sucursal, pedido posterior
 * (o igual) a la fecha de la solicitud, precio dentro de la tolerancia.
 * Una solicitud sin precio (reposicion de stock) nunca tiene candidatos --
 * no hay con que comparar el precio.
 */
export function candidatosPedido(
  solicitud: SolicitudLineaParaMatch,
  pedidos: PedidoCandidato[],
): PedidoCandidato[] {
  if (
    !solicitud.sucursal ||
    !solicitud.productoCodigo ||
    !solicitud.fechaEmision ||
    solicitud.precioUnitario <= 0
  ) {
    return [];
  }

  return pedidos.filter((pedido) => {
    if (pedido.sucursal !== solicitud.sucursal) return false;
    if (pedido.productoCodigo !== solicitud.productoCodigo) return false;
    if (pedido.fecha < solicitud.fechaEmision!) return false;
    const diferencia = Math.abs(pedido.precioUnitario - solicitud.precioUnitario) / solicitud.precioUnitario;
    return diferencia <= TOLERANCIA_PRECIO_MATCH;
  });
}

/** Solo hay match automatico cuando queda exactamente un candidato -- con 2+, no se elige por cuenta propia. */
export function matchAutomatico(candidatos: PedidoCandidato[]): PedidoCandidato | null {
  return candidatos.length === 1 ? candidatos[0] : null;
}

export interface SolicitudLineaCompleta {
  sucursal: string;
  nroSolicitud: string;
  item: string;
  productoCodigo: string;
  fechaEmision: string;
  precioUnitario: number;
}

export interface VinculoManualExistente {
  sucursal: string;
  nroSolicitud: string;
  item: string;
  pedidoSucursal: string;
  pedidoNroPedido: string;
}

export interface ResolucionSolicitud {
  solicitud: SolicitudLineaCompleta;
  estado: EstadoSolicitud;
  candidatos: PedidoCandidato[];
  pedidoVinculado: PedidoCandidato | null;
  esManual: boolean;
}

const claveSolicitud = (s: { sucursal: string; nroSolicitud: string; item: string }) =>
  `${s.sucursal}|${s.nroSolicitud}|${s.item}`;
const clavePedido = (p: { sucursal: string; nroPedido: string; item: string }) => `${p.sucursal}|${p.nroPedido}|${p.item}`;

/**
 * Resuelve, para cada linea de solicitud, su estado y el pedido vinculado
 * (manual si existe, si no el match automatico). Es la funcion central que
 * usan tanto la pantalla de Solicitudes (mostrar el pedido) como la de
 * Pedidos (mostrar la solicitud, via solicitudesPorPedido de vuelta).
 */
export function resolverSolicitudes(
  solicitudes: SolicitudLineaCompleta[],
  pedidos: PedidoCandidato[],
  vinculosManuales: VinculoManualExistente[],
): ResolucionSolicitud[] {
  const vinculoPorSolicitud = new Map(vinculosManuales.map((v) => [claveSolicitud(v), v]));

  return solicitudes.map((solicitud) => {
    const estado = estadoSolicitud(solicitud.precioUnitario);
    const candidatos =
      estado === "cotizada"
        ? candidatosPedido(
            {
              sucursal: solicitud.sucursal,
              productoCodigo: solicitud.productoCodigo,
              fechaEmision: solicitud.fechaEmision,
              precioUnitario: solicitud.precioUnitario,
            },
            pedidos,
          )
        : [];

    const manual = vinculoPorSolicitud.get(claveSolicitud(solicitud));
    let pedidoVinculado: PedidoCandidato | null = null;
    let esManual = false;

    if (manual) {
      pedidoVinculado =
        pedidos.find((p) => p.sucursal === manual.pedidoSucursal && p.nroPedido === manual.pedidoNroPedido) ?? null;
      esManual = pedidoVinculado !== null;
    }

    if (!pedidoVinculado) {
      pedidoVinculado = matchAutomatico(candidatos);
    }

    return { solicitud, estado, candidatos, pedidoVinculado, esManual };
  });
}

export interface SolicitudReferencia {
  sucursal: string;
  nroSolicitud: string;
  item: string;
  fechaEmision: string;
  esManual: boolean;
}

/** Vista inversa de resolverSolicitudes: por cada pedido, que solicitudes lo tienen vinculado. */
export function solicitudesPorPedido(resoluciones: ResolucionSolicitud[]): Map<string, SolicitudReferencia[]> {
  const map = new Map<string, SolicitudReferencia[]>();

  for (const resolucion of resoluciones) {
    if (!resolucion.pedidoVinculado) continue;

    const key = clavePedido(resolucion.pedidoVinculado);
    const lista = map.get(key) ?? [];
    lista.push({
      sucursal: resolucion.solicitud.sucursal,
      nroSolicitud: resolucion.solicitud.nroSolicitud,
      item: resolucion.solicitud.item,
      fechaEmision: resolucion.solicitud.fechaEmision,
      esManual: resolucion.esManual,
    });
    map.set(key, lista);
  }

  return map;
}
