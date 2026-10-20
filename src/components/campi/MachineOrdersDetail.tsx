import { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { loadMachineOrdersDetail, type MachineOrdersDetailData, type MachineOrderDetailRow } from '@/lib/campi/machineOrdersDetail';
import type { PanoramaStory } from '@/lib/campi/panoramaStoryTypes';

const integer = new Intl.NumberFormat('es-PY', { maximumFractionDigits: 0 });
const percent = (value: number, total: number) => `${new Intl.NumberFormat('es-PY', { maximumFractionDigits: 1 }).format(total ? value / total * 100 : 0)}%`;
const supply = [
  { key: 'stock', title: 'Stock vinculado' },
  { key: 'arrived', title: 'Importación arribada' },
  { key: 'transit', title: 'Importación en tránsito' },
  { key: 'unlinked', title: 'Sin vínculo' },
] as const;
const status: Record<MachineOrderDetailRow['status'], string> = {
  stock: 'Con stock', arrived: 'Arribada', transit: 'En tránsito', unlinked: 'Sin vínculo', mixed: 'Mixto', review: 'Por revisar',
};

function Bars({ title, rows, total, kind }: { title: string; rows: { key: string; title: string; value: number }[]; total: number; kind: 'supply' | 'age' }) {
  return <section className="machine-orders-section" aria-label={title}>
    <h3>{title}</h3>
    <div className="machine-orders-bars">{rows.map(row => <div className="machine-orders-bar-row" key={row.key} data-kind={kind} data-category={row.key}>
      <span className="machine-orders-bar-label">{row.title}</span>
      <span className="machine-orders-bar-track" aria-hidden="true"><span style={{ width: `${total ? row.value / total * 100 : 0}%` }} /></span>
      <strong>{integer.format(row.value)}</strong><span className="machine-orders-bar-share">{percent(row.value, total)}</span>
    </div>)}</div>
  </section>;
}

export function MachineOrdersDetail({ story, open }: { story: PanoramaStory; open: boolean }) {
  const scope = story.machineOrders;
  const [data, setData] = useState<MachineOrdersDetailData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [reload, setReload] = useState(0);
  const [sort, setSort] = useState<'age' | 'units'>('age');
  const [showAll, setShowAll] = useState(false);
  useEffect(() => {
    if (!open || !scope) return;
    let active = true;
    setLoading(true);
    setError('');
    setData(null);
    loadMachineOrdersDetail(scope).then(result => { if (active) setData(result); })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'No se pudo cargar el detalle.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [open, scope, reload]);
  const sorted = useMemo(() => data ? [...data.orders].sort((a, b) => sort === 'age'
    ? (b.age ?? -1) - (a.age ?? -1) || b.units - a.units
    : b.units - a.units || (b.age ?? -1) - (a.age ?? -1)) : [], [data, sort]);
  if (!scope) return null;
  if (loading) return <p className="machine-orders-feedback" role="status">Cargando pedidos…</p>;
  if (error) return <div className="machine-orders-feedback" role="alert"><p>{error}</p><Button variant="outline" size="sm" onClick={() => setReload(value => value + 1)}><RefreshCw className="mr-2 h-4 w-4" />Reintentar</Button></div>;
  if (!data) return null;
  const cards = [
    { label: 'Pedidos pendientes', value: integer.format(scope.orders), note: '' },
    { label: 'Unidades pendientes', value: integer.format(scope.units), note: '' },
    { label: 'Pedidos con stock', value: integer.format(scope.ready.length), note: `${percent(scope.ready.length, scope.orders)} de pedidos · ${integer.format(scope.readyUnits)} unidades` },
  ];
  return <div className="machine-orders-detail">
    <dl className="machine-orders-kpis">{cards.map(card => <div key={card.label}><dt>{card.label}</dt><dd>{card.value}</dd>{card.note && <p>{card.note}</p>}</div>)}</dl>
    <Bars title="Situación de abastecimiento" total={scope.units} kind="supply" rows={supply.map(item => ({ key: item.key, title: item.title, value: scope[item.key] }))} />
    <Bars title="Antigüedad de pedidos" total={scope.orders} kind="age" rows={data.ages.map((item, i) => ({ key: item.label === 'Sin fecha' ? 'unknown' : String(i), title: item.label, value: item.count }))} />
    <section className="machine-orders-section machine-orders-table-section">
      <div className="machine-orders-section-head"><h3>Pedidos principales</h3><label>Ordenar por <select value={sort} onChange={event => setSort(event.target.value as typeof sort)}><option value="age">Antigüedad</option><option value="units">Unidades</option></select></label></div>
      <div className="machine-orders-table-wrap"><table><thead><tr><th>Pedido</th><th>Cliente</th><th className="numeric">Unidades</th><th className="numeric">Antigüedad</th><th>Abastecimiento</th></tr></thead>
      <tbody>{sorted.slice(0, showAll ? undefined : 5).map(order => <tr key={order.id}>
        <td><Link to={`/parque-operaciones?operacion=${encodeURIComponent(order.id)}`}>{order.number}<ArrowUpRight className="h-3 w-3" /></Link></td>
        <td title={order.client}><span className="machine-orders-client">{order.client}</span></td>
        <td className="numeric">{integer.format(order.units)}</td>
        <td className="numeric">{order.age === null ? '—' : `${integer.format(order.age)} días`}</td>
        <td><span className="machine-orders-status" data-status={order.status}>{status[order.status]}</span></td>
      </tr>)}</tbody></table></div>
      {sorted.length > 5 && <button type="button" className="machine-orders-show-all" onClick={() => setShowAll(value => !value)}>{showAll ? 'Ver menos' : `Ver todos los pedidos (${sorted.length})`}<ArrowUpRight className="h-4 w-4" /></button>}
    </section>
  </div>;
}
