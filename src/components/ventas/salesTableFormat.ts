export type SalesColumnKind = "text" | "quantity" | "money";

/** Classify visible headings consistently; override ambiguous count/amount labels. */
export function salesColumnClass(label: string, kind?: SalesColumnKind) {
  const normalized = label.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const quantity = /^(os(?: asociadas| identificadas)?|fact\.|facturas|documentos|clientes|maquinas|vendidas|nuevas|usadas|nc|nota cr\.|netas|unidades netas|cantidad|horas.*|total horas|km os|abc)$/;
  const monetary = /^(facturado|facturacion.*|mano de obra|kilometraje|repuestos|terceros|neto|ventas|notas de credito|promedio.*|ticket medio|participacion.*|variacion.*|ano anterior|actual|total(?: os)?|mo .*)$/;
  const resolved = kind ?? (quantity.test(normalized) ? "quantity" : monetary.test(normalized) ? "money" : "text");
  return resolved === "quantity" ? "text-center" : resolved === "money" ? "text-right" : "text-left";
}
