import { describe, expect, it } from "vitest";
import {
  candidatosPedido,
  estadoSolicitud,
  matchAutomatico,
  resolverSolicitudes,
  solicitudesPorPedido,
  type PedidoCandidato,
  type SolicitudLineaCompleta,
  type VinculoManualExistente,
} from "@/lib/imports";

describe("estadoSolicitud", () => {
  it("clasifica como reposicion_stock cuando no hay precio", () => {
    expect(estadoSolicitud(0)).toBe("reposicion_stock");
  });

  it("clasifica como cotizada cuando hay precio", () => {
    expect(estadoSolicitud(22.45)).toBe("cotizada");
  });
});

describe("candidatosPedido", () => {
  const pedidos: PedidoCandidato[] = [
    { sucursal: "Santa Rita", nroPedido: "000008", item: "0001", productoCodigo: "REPIN003203", fecha: "2026-07-16", precioUnitario: 17.54 },
    { sucursal: "Santa Rita", nroPedido: "000037", item: "0001", productoCodigo: "REPIN003187", fecha: "2026-07-30", precioUnitario: 22.45 },
    { sucursal: "Katuete", nroPedido: "000009", item: "0001", productoCodigo: "REPIN003203", fecha: "2026-07-20", precioUnitario: 17.50 },
  ];

  it("no da candidatos para una solicitud sin precio (reposicion de stock)", () => {
    const resultado = candidatosPedido(
      { sucursal: "Santa Rita", productoCodigo: "REPIN003203", fechaEmision: "2026-07-09", precioUnitario: 0 },
      pedidos,
    );
    expect(resultado).toEqual([]);
  });

  it("encuentra el unico candidato con mismo producto, sucursal y precio parecido", () => {
    const resultado = candidatosPedido(
      { sucursal: "Santa Rita", productoCodigo: "REPIN003203", fechaEmision: "2026-07-09", precioUnitario: 17.60 },
      pedidos,
    );
    expect(resultado).toHaveLength(1);
    expect(resultado[0].nroPedido).toBe("000008");
  });

  it("descarta un pedido con precio muy distinto aunque coincida producto y sucursal", () => {
    const resultado = candidatosPedido(
      { sucursal: "Santa Rita", productoCodigo: "REPIN003203", fechaEmision: "2026-07-09", precioUnitario: 100 },
      pedidos,
    );
    expect(resultado).toEqual([]);
  });

  it("descarta un pedido anterior a la fecha de la solicitud", () => {
    const resultado = candidatosPedido(
      { sucursal: "Santa Rita", productoCodigo: "REPIN003203", fechaEmision: "2026-08-01", precioUnitario: 17.54 },
      pedidos,
    );
    expect(resultado).toEqual([]);
  });

  it("descarta pedidos de otra sucursal aunque el producto y precio coincidan", () => {
    const resultado = candidatosPedido(
      { sucursal: "Santa Rita", productoCodigo: "REPIN003203", fechaEmision: "2026-07-09", precioUnitario: 17.50 },
      pedidos,
    );
    expect(resultado.every((c) => c.sucursal === "Santa Rita")).toBe(true);
  });
});

describe("matchAutomatico", () => {
  it("devuelve el candidato cuando hay exactamente uno", () => {
    const candidato: PedidoCandidato = {
      sucursal: "Santa Rita",
      nroPedido: "000008",
      item: "0001",
      productoCodigo: "REPIN003203",
      fecha: "2026-07-16",
      precioUnitario: 17.54,
    };
    expect(matchAutomatico([candidato])).toBe(candidato);
  });

  it("no elige automaticamente cuando hay varios candidatos", () => {
    const candidatos: PedidoCandidato[] = [
      { sucursal: "Santa Rita", nroPedido: "000008", item: "0001", productoCodigo: "REPIN005893", fecha: "2026-07-16", precioUnitario: 10 },
      { sucursal: "Santa Rita", nroPedido: "000009", item: "0001", productoCodigo: "REPIN005893", fecha: "2026-07-16", precioUnitario: 10.5 },
    ];
    expect(matchAutomatico(candidatos)).toBeNull();
  });

  it("devuelve null cuando no hay ningun candidato", () => {
    expect(matchAutomatico([])).toBeNull();
  });
});

describe("resolverSolicitudes / solicitudesPorPedido", () => {
  const pedidos: PedidoCandidato[] = [
    { sucursal: "Santa Rita", nroPedido: "000008", item: "0001", productoCodigo: "REPIN003203", fecha: "2026-07-16", precioUnitario: 17.54 },
    { sucursal: "Santa Rita", nroPedido: "000009", item: "0001", productoCodigo: "REPIN005893", fecha: "2026-07-16", precioUnitario: 10 },
    { sucursal: "Santa Rita", nroPedido: "000037", item: "0002", productoCodigo: "REPIN005893", fecha: "2026-07-30", precioUnitario: 10.2 },
  ];

  it("resuelve por match automatico cuando hay un solo candidato", () => {
    const solicitudes: SolicitudLineaCompleta[] = [
      { sucursal: "Santa Rita", nroSolicitud: "000008", item: "0001", productoCodigo: "REPIN003203", fechaEmision: "2026-07-09", precioUnitario: 17.6 },
    ];
    const [resolucion] = resolverSolicitudes(solicitudes, pedidos, []);

    expect(resolucion.estado).toBe("cotizada");
    expect(resolucion.esManual).toBe(false);
    expect(resolucion.pedidoVinculado?.nroPedido).toBe("000008");
  });

  it("prioriza el vinculo manual por sobre el match automatico", () => {
    const solicitudes: SolicitudLineaCompleta[] = [
      { sucursal: "Santa Rita", nroSolicitud: "000009", item: "0005", productoCodigo: "REPIN005893", fechaEmision: "2026-07-09", precioUnitario: 10.1 },
    ];
    const vinculos: VinculoManualExistente[] = [
      { sucursal: "Santa Rita", nroSolicitud: "000009", item: "0005", pedidoSucursal: "Santa Rita", pedidoNroPedido: "000037" },
    ];
    const [resolucion] = resolverSolicitudes(solicitudes, pedidos, vinculos);

    expect(resolucion.esManual).toBe(true);
    expect(resolucion.pedidoVinculado?.nroPedido).toBe("000037");
    expect(resolucion.candidatos).toHaveLength(2);
  });

  it("una solicitud de reposicion de stock (sin precio) queda sin pedido vinculado", () => {
    const solicitudes: SolicitudLineaCompleta[] = [
      { sucursal: "Santa Rita", nroSolicitud: "000005", item: "0001", productoCodigo: "REPIN003203", fechaEmision: "2026-07-09", precioUnitario: 0 },
    ];
    const [resolucion] = resolverSolicitudes(solicitudes, pedidos, []);

    expect(resolucion.estado).toBe("reposicion_stock");
    expect(resolucion.pedidoVinculado).toBeNull();
  });

  it("solicitudesPorPedido arma la vista inversa: que solicitudes apuntan a cada pedido", () => {
    const solicitudes: SolicitudLineaCompleta[] = [
      { sucursal: "Santa Rita", nroSolicitud: "000008", item: "0001", productoCodigo: "REPIN003203", fechaEmision: "2026-07-09", precioUnitario: 17.6 },
      { sucursal: "Santa Rita", nroSolicitud: "000009", item: "0005", productoCodigo: "REPIN005893", fechaEmision: "2026-07-09", precioUnitario: 10.1 },
    ];
    const vinculos: VinculoManualExistente[] = [
      { sucursal: "Santa Rita", nroSolicitud: "000009", item: "0005", pedidoSucursal: "Santa Rita", pedidoNroPedido: "000037" },
    ];
    const resoluciones = resolverSolicitudes(solicitudes, pedidos, vinculos);
    const inversa = solicitudesPorPedido(resoluciones);

    expect(inversa.get("Santa Rita|000008|0001")).toEqual([
      { sucursal: "Santa Rita", nroSolicitud: "000008", item: "0001", fechaEmision: "2026-07-09", esManual: false },
    ]);
    expect(inversa.get("Santa Rita|000037|0002")).toEqual([
      { sucursal: "Santa Rita", nroSolicitud: "000009", item: "0005", fechaEmision: "2026-07-09", esManual: true },
    ]);
  });
});
