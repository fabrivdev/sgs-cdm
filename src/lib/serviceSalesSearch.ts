// Same normalization as ventas_servicios_texto_normalizado. Search the invoice
// lines before grouping, regardless of the selected Clients perspective.
export function normalizeServiceSalesSearch(value: string | null | undefined): string {
  return (value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
}

export type ServiceSalesSearchLine = {
  texto_busqueda?: string; os?: string | null; factura?: string | null;
  propietario?: string | null; propietario_os?: string | null; cliente_os?: string | null;
  cliente?: string | null; chasis?: string | null; tipo_tiempo?: string | null; descripcion?: string | null;
};

export function matchesServiceSalesSearch(line: ServiceSalesSearchLine, search: string): boolean {
  const term = normalizeServiceSalesSearch(search);
  const text = line.texto_busqueda ?? [line.os, line.factura, line.propietario,
    line.propietario_os, line.cliente_os, line.cliente, line.chasis, line.tipo_tiempo, line.descripcion].join(' ');
  return !term || normalizeServiceSalesSearch(text).includes(term);
}
