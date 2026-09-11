type Order = { tipo_tiempo: string | null; raw_data: Record<string, unknown> | null };

export function serviceTypes(row: Order): string[] {
  const raw = row.raw_data ?? {};
  const values = [...(Array.isArray(raw.tipos_tiempo) ? raw.tipos_tiempo : []),
    ...Object.keys((raw.totales_por_tipo as object) ?? {}), row.tipo_tiempo];
  const types = new Set<string>();
  for (const value of values) {
    const text = String(value ?? '').toLowerCase();
    if (text.includes('cliente')) types.add('Cliente');
    if (text.includes('garant')) types.add('Garantia');
    if (text.includes('intern')) types.add('Interno');
  }
  return types.size ? [...types] : ['No informado'];
}

export function serviceOwner(row: { raw_data: Record<string, unknown> | null; cliente_nombre: string | null }) {
  // cliente_nombre historically falls back to the invoice recipient. Never label that fallback as owner.
  const raw = row.raw_data ?? {};
  return String(raw.Nombre ?? '').trim() || (raw.CLIFAC == null ? row.cliente_nombre : null) || 'Propietario no informado';
}

export function billingComponent(line: { grupo_normalizado: string | null; subgrupo_original: string | null; mercaderia?: string | null; observacion?: string | null }) {
  const group = `${line.grupo_normalizado ?? ''} ${line.subgrupo_original ?? ''}`.toLowerCase();
  if (group.includes('repuesto')) return 'repuestos';
  if (group.includes('kilometr')) return 'km';
  if (`${group} ${line.mercaderia ?? ''} ${line.observacion ?? ''}`.toLowerCase().includes('tercero')) return 'terceros';
  if (group.includes('servic') || group.includes('mano de obra')) return 'mo';
  return null;
}
