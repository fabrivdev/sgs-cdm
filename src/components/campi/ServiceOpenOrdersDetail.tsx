import { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { loadServiceOpenOrdersDetail, type ServiceOpenOrdersDetailData } from '@/lib/campi/serviceOpenOrdersDetail';
import type { PanoramaStory } from '@/lib/campi/panoramaStoryTypes';

const integer = new Intl.NumberFormat('es-PY', { maximumFractionDigits: 0 });
const share = (value: number, total: number) => `${new Intl.NumberFormat('es-PY', { maximumFractionDigits: 1 }).format(total ? value / total * 100 : 0)}%`;
type View = 'orders' | 'brand' | 'branch' | 'age';

function Bars({ title, rows, total, category }: { title: string; rows: { name: string; count: number }[]; total: number; category: string }) {
  return <section className="machine-orders-section service-open-section" aria-label={title}>
    <h3>{title}</h3>
    <div className="machine-orders-bars">{rows.map(row => <div className="machine-orders-bar-row" key={row.name} data-category={category}>
      <span className="machine-orders-bar-label" title={row.name}>{row.name}</span>
      <span className="machine-orders-bar-track" aria-hidden="true"><span style={{ width: `${total ? row.count / total * 100 : 0}%` }} /></span>
      <strong>{integer.format(row.count)}</strong><span className="machine-orders-bar-share">{share(row.count, total)}</span>
    </div>)}</div>
  </section>;
}

export function ServiceOpenOrdersDetail({ story, open }: { story: PanoramaStory; open: boolean }) {
  const scope = story.openOrders;
  const [data, setData] = useState<ServiceOpenOrdersDetailData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [reload, setReload] = useState(0);
  const [view, setView] = useState<View>('orders');
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  useEffect(() => {
    if (!open || !scope) return;
    let active = true;
    setLoading(true); setError(''); setData(null);
    loadServiceOpenOrdersDetail(scope).then(result => { if (active) setData(result); })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'No se pudo cargar el detalle de OS.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [open, scope, reload]);
  const sorted = useMemo(() => data ? [...data.orders].sort((a, b) => (b.age ?? -1) - (a.age ?? -1) || a.number.localeCompare(b.number)) : [], [data]);
  if (!scope) return null;
  if (loading) return <p className="machine-orders-feedback" role="status">Cargando OS…</p>;
  if (error) return <div className="machine-orders-feedback" role="alert"><p>{error}</p><Button variant="outline" size="sm" onClick={() => setReload(value => value + 1)}><RefreshCw className="mr-2 h-4 w-4" />Reintentar</Button></div>;
  if (!data) return null;
  const cards = [
    { label: 'OS abiertas', value: integer.format(scope.count) },
    { label: 'Clientes', value: data.clients === null ? '—' : integer.format(data.clients) },
    { label: 'Antigüedad media', value: data.averageAge === null ? '—' : `${integer.format(data.averageAge)} días` },
  ];
  const summary = view === 'brand' ? scope.brands.map(row => ({ name: row.name, count: row.count }))
    : view === 'branch' ? data.branches : scope.ages.map(row => ({ name: row.label, count: row.count }));
  const groupedOrders = selectedGroup === null ? sorted : sorted.filter(row => view === 'brand' ? row.brand === selectedGroup
    : view === 'branch' ? row.branch === selectedGroup
      : (row.age === null ? 'Sin fecha válida' : row.age <= 7 ? '0–7 días' : row.age <= 30 ? '8–30 días' : row.age <= 90 ? '31–90 días' : 'Más de 90 días') === selectedGroup);
  const hasModels = data.orders.some(row => row.model);
  const p90 = story.supporting.find(row => row.label === 'Percentil 90 de edad')?.value;
  return <div className="machine-orders-detail service-open-detail">
    <dl className="machine-orders-kpis">{cards.map(card => <div key={card.label}><dt>{card.label}</dt><dd>{card.value}</dd>{card.label === 'Antigüedad media' && p90 !== null && p90 !== undefined && <p>P90: {integer.format(p90)} días</p>}</div>)}</dl>
    <div className="service-open-grid">
      <Bars title="OS por marca" rows={scope.brands.map(row => ({ name: row.name, count: row.count }))} total={scope.count} category="brand" />
      <Bars title="OS por sucursal" rows={data.branches} total={scope.count} category="branch" />
      <Bars title="Antigüedad de las OS" rows={scope.ages.map(row => ({ name: row.label, count: row.count }))} total={scope.count} category="age" />
      {data.types.length > 1 && <Bars title="Tipo de tiempo" rows={data.types} total={scope.count} category="type" />}
    </div>
    <section className="machine-orders-section machine-orders-table-section service-open-table-section">
      <div className="service-open-tabs" role="tablist" aria-label="Detalle de OS abiertas">
        {([['orders', 'Órdenes'], ['brand', 'Por marca'], ['branch', 'Por sucursal'], ['age', 'Antigüedad']] as const).map(([key, label]) =>
          <button key={key} type="button" role="tab" aria-selected={view === key} onClick={() => { setView(key); setSelectedGroup(null); setShowAll(false); }}>{label}</button>)}
      </div>
      {view !== 'orders' && <div className="service-open-group-list" aria-label={view === 'brand' ? 'Marcas' : view === 'branch' ? 'Sucursales' : 'Rangos de antigüedad'}>
        {summary.map(group => <button type="button" key={group.name} aria-pressed={selectedGroup === group.name} onClick={() => { setSelectedGroup(group.name); setShowAll(false); }}>
          <span>{group.name}</span><strong>{integer.format(group.count)}</strong><span>{share(group.count, scope.count)}</span>
        </button>)}
      </div>}
      {(view === 'orders' || selectedGroup !== null) && <>
        {selectedGroup !== null && <button type="button" className="service-open-clear-group" onClick={() => setSelectedGroup(null)}>{selectedGroup} ×</button>}
        <div className="machine-orders-table-wrap"><table><thead><tr><th>OS</th><th>Cliente</th><th>Marca</th>{hasModels && <th>Modelo</th>}<th>Sucursal</th><th className="numeric">Días</th></tr></thead>
          <tbody>{groupedOrders.slice(0, showAll ? undefined : 8).map(order => <tr key={order.number}>
            <td><Link to={`/servicios/ordenes?estado=abierta&cohorte=open&q=${encodeURIComponent(order.number)}`}>{order.number}<ArrowUpRight className="h-3 w-3" /></Link></td>
            <td title={order.client}><span className="machine-orders-client">{order.client}</span></td>
            <td>{order.brand}</td>{hasModels && <td title={order.model ?? ''}>{order.model ?? '—'}</td>}<td>{order.branch}</td>
            <td className="numeric">{order.age === null ? '—' : integer.format(order.age)}</td>
          </tr>)}</tbody></table></div>
        {groupedOrders.length > 8 && <button type="button" className="machine-orders-show-all" onClick={() => setShowAll(value => !value)}>{showAll ? 'Ver menos' : `Ver todas las OS (${groupedOrders.length})`}<ArrowUpRight className="h-4 w-4" /></button>}
      </>}
    </section>
  </div>;
}
