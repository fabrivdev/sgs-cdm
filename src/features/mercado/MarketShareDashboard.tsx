import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { FiltersBar, FilterSelect } from "@/components/filters/FiltersBar";
import { KpiItem, KpiStrip, PageHeader, PageShell } from "@/components/layout/AppPrimitives";
import { months, number, percent, ratio } from "./model";
import { salesFamilies, salesTotal, type SalesFamily, type SalesPeriod } from "./marketShareModel";
import "./tractores.css";

type Breakdown = "marca" | "distribuidor";
type View = "tablero" | "marcas" | "distribuidores" | "historia";
const basePath = "/mercado/market-share";
const tabs: Record<View, string> = {
  tablero: "Tablero", marcas: "Marcas", distribuidores: "Distribuidores", historia: "Historia",
};
const unknownDealer = "Sin distribuidor informado";

function breakdown(periods: SalesPeriod[], by: Breakdown) {
  if (!periods.length || periods.some((p) => p.detalle === null)) return null;
  const grouped = new Map<string, number>();
  for (const period of periods) {
    for (const sale of period.detalle ?? []) {
      const name = sale[by] ?? unknownDealer;
      grouped.set(name, (grouped.get(name) ?? 0) + sale.unidades);
    }
  }
  return grouped;
}
function ranking(current: ReturnType<typeof breakdown>, previous: ReturnType<typeof breakdown>) {
  if (!current) return [];
  return [...new Set([...current.keys(), ...(previous?.keys() ?? [])])]
    .map((name) => ({ name, units: current.get(name) ?? 0, prior: previous ? previous.get(name) ?? 0 : null }))
    .sort((l, r) => r.units - l.units || (r.prior ?? 0) - (l.prior ?? 0) || l.name.localeCompare(r.name, "es"));
}

export function MarketShareDashboard({ periods }: { periods: SalesPeriod[] }) {
  const [params, setParams] = useSearchParams();
  const slug = useLocation().pathname.split("/").filter(Boolean).at(-1);
  const view = slug && Object.prototype.hasOwnProperty.call(tabs, slug) ? slug as View : "tablero";
  const families = (Object.keys(salesFamilies) as SalesFamily[]).filter((key) => periods.some((p) => p.familia === key));
  const requested = params.get("equipo") as SalesFamily | null;
  const family = requested && families.includes(requested) ? requested : families[0];
  const dataset = periods.filter((p) => p.familia === family);
  const years = [...new Set(dataset.map((p) => p.anio))].sort((a, b) => b - a);
  const year = years.includes(Number(params.get("año"))) ? Number(params.get("año")) : years[0];
  const lastMonth = Math.max(1, ...dataset.filter((p) => p.anio === year).map((p) => p.mes));
  const cutoff = Math.min(lastMonth, Math.max(1, Math.trunc(Number(params.get("hasta"))) || lastMonth));
  const selected = (period: number) => dataset.filter((p) => p.anio === period && p.mes <= cutoff);
  const current = selected(year);
  const previous = selected(year - 1);
  const comparable = previous.length === cutoff && current.length === cutoff;
  const total = salesTotal(current);
  const priorTotal = comparable ? salesTotal(previous) : 0;
  const change = ratio(total - priorTotal, priorTotal);
  const brandNow = breakdown(current, "marca");
  const dealerNow = breakdown(current, "distribuidor");
  const brands = ranking(brandNow, comparable ? breakdown(previous, "marca") : null);
  const dealerPrior = comparable ? breakdown(previous, "distribuidor") : null;
  const dealers = ranking(dealerNow, dealerPrior?.has(unknownDealer) ? null : dealerPrior);
  const leader = brands.find((row) => row.units > 0);
  const cdm = dealerNow?.get("Campos del Mañana");
  const monthsInScope = months.slice(0, cutoff).map((name, i) => ({
    name,
    current: current.find((period) => period.mes === i + 1)?.total ?? null,
    previous: previous.find((period) => period.mes === i + 1)?.total ?? null,
  }));
  const history = years.filter((y) => selected(y).length === cutoff).map((y) => ({year: y, units: salesTotal(selected(y))}));
  const historyMax = Math.max(1, ...history.map((y) => y.units));
  function set(name: string, value: string) {
    const next = new URLSearchParams(params);
    next.set(name, value);
    if (name === "equipo" || name === "año") next.delete("hasta");
    setParams(next);
  }
  const href = (target: View) => basePath + (target === "tablero" ? "" : "/" + target)
    + (params.size ? "?" + params.toString() : "");
  function chartRows(groups: typeof brands, benchmark: string) {
    const top = groups.filter((row) => row.units > 0 && row.name !== unknownDealer).slice(0, 6);
    const reference = groups.find((row) => row.name === benchmark && row.units > 0);
    return reference && !top.includes(reference) ? [...top, reference] : top;
  }
  function shareCard(title: string, rows: typeof brands, benchmark: string, detailView: View) {
    const groups = chartRows(rows, benchmark);
    return (
      <Card className="market-panel">
        <h2><Link to={href(detailView)}>{title}</Link></h2>
        {groups.map((row) => {
          const share = ratio(row.units, total);
          const prior = row.prior === null ? null : ratio(row.prior, priorTotal);
          const previousLabel = String(year - 1) + " · " + percent(prior);
          return (
            <div key={row.name} className={"market-rank" + (row.name === benchmark ? " market-benchmark" : "")}>
              <span>{row.name}</span>
              <div className="market-share-track">
                <b style={{ width: ((share ?? 0) * 100) + "%" }} />
                {prior !== null && (
                  <span className="market-share-prior"
                    style={{ "--market-prior-share": (prior * 100) + "%" } as React.CSSProperties}
                    role="img" aria-label={previousLabel} title={previousLabel} />
                )}
              </div>
              <strong>{percent(share)}</strong>
            </div>
          );
        })}
        {groups.some((row) => row.prior !== null && priorTotal > 0) && (
          <div className="market-legend market-share-legend"><span><b aria-hidden="true" /> {year - 1}</span></div>
        )}
        {!groups.length && <p>Sin desglose para este período.</p>}
      </Card>
    );
  }
  const breakdownRows = view === "marcas" ? brands : dealers;
  return (
    <PageShell className={"market-tractors" + (family === "pulverizadores" ? " market-horsch" : "")}>
      <PageHeader
        title="Market Share"
        tabs={<nav className="market-tabs" aria-label="Secciones de Market Share">
          {(Object.keys(tabs) as View[]).map((item) => <Link key={item} to={href(item)}
            className={view === item ? "chosen" : undefined}
            aria-current={view === item ? "page" : undefined}>{tabs[item]}</Link>)}
        </nav>}
      />
      <FiltersBar>
        <FilterSelect label="Equipo" placeholder="Equipo" value={family ?? ""} onChange={(v) => set("equipo", v)}
          options={families.map((value) => ({ value, label: salesFamilies[value] }))} />
        <FilterSelect label="Año" placeholder="Año" value={String(year)} onChange={(v) => set("año", v)} width="w-[105px]"
          options={years.map((y) => ({ value: String(y), label: String(y) }))} />
        <FilterSelect label="Acumulado hasta" placeholder="Mes" value={String(cutoff)} onChange={(v) => set("hasta", v)}
          options={months.slice(0, lastMonth).map((label, i) => ({ label, value: String(i + 1) }))} />
      </FiltersBar>
      <KpiStrip>
        <KpiItem label="Unidades vendidas" value={number(total)}
          detail={change === null ? undefined : (change > 0 ? "+" : "") + percent(change) + " interanual"}
          tone={change && change > 0 ? "positive" : change && change < 0 ? "danger" : "default"} />
        <KpiItem label="Marca líder" value={leader?.name ?? "—"}
          detail={leader ? percent(ratio(leader.units, total)) : undefined} />
        <KpiItem label="Campos del Mañana" value={cdm === undefined ? "—" : number(cdm)}
          detail={cdm === undefined ? undefined : percent(ratio(cdm, total)) + " del mercado"} />
      </KpiStrip>
      {view === "tablero" ? (
        <div className="market-panels">
          {shareCard("Participación por marca", brands, family === "pulverizadores" ? "HORSCH" : "CLAAS", "marcas")}
          <Card className="market-panel">
            <h2>Ventas por mes</h2>
            <div className="market-rhythm-chart">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthsInScope} margin={{ left: 0, right: 6, top: 6, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} tickLine={false} />
                  <YAxis allowDecimals={false} width={30} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(value) => [number(Number(value)), "Unidades"]} />
                  <Legend />
                  <Bar name={String(year - 1)} dataKey="previous" fill="hsl(var(--muted-foreground) / .45)" radius={[3, 3, 0, 0]} isAnimationActive={false} />
                  <Bar name={String(year)} dataKey="current" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
          {shareCard("Participación por distribuidor", dealers, "Campos del Mañana", "distribuidores")}
          <Card className="market-panel">
            <h2><Link to={href("historia")}>Ventas por año</Link></h2>
            {[...history].reverse().map((period) => (
              <div className="market-rank" key={period.year}>
                <span>{period.year}</span>
                <i aria-hidden="true"><b style={{ width: (period.units / historyMax * 100) + "%",
                  background: period.year === year ? undefined : "hsl(var(--muted-foreground) / .45)" }} /></i>
                <strong>{number(period.units)}</strong>
              </div>
            ))}
          </Card>
        </div>
      ) : view === "historia" ? (
        <Card className="market-panel">
          <h2>Ventas por año</h2>
          <div className="market-scroll" tabIndex={0} role="region" aria-label="Historia de ventas">
            <table>
              <thead><tr><th>Año</th><th>Unidades</th><th>Var. interanual</th></tr></thead>
              <tbody>
                {years.filter((y) => selected(y).length === cutoff).map((y) => {
                  const units = salesTotal(selected(y));
                  const previous = selected(y - 1);
                  const prior = previous.length === cutoff ? salesTotal(previous) : 0;
                  return <tr key={y}><th scope="row">{y}</th><td>{number(units)}</td><td>{percent(ratio(units - prior, prior))}</td></tr>;
                })}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <Card className="market-panel">
          <h2>{tabs[view]}</h2>
          {breakdownRows.length ? (
            <div className="market-scroll" tabIndex={0} role="region" aria-label={tabs[view]}>
              <table>
                <thead><tr><th>{view === "marcas" ? "Marca" : "Distribuidor"}</th><th>Unidades {year - 1}</th>
                  <th>Unidades {year}</th><th>Cuota {year - 1}</th><th>Cuota {year}</th><th>Variación (p. p.)</th></tr></thead>
                <tbody>
                  {breakdownRows.map((item) => {
                    const now = ratio(item.units, total);
                    const prior = item.prior === null ? null : ratio(item.prior, priorTotal);
                    return <tr key={item.name}><th scope="row">{item.name}</th>
                      <td>{item.prior === null ? "—" : number(item.prior)}</td><td>{number(item.units)}</td>
                      <td>{percent(prior)}</td><td>{percent(now)}</td>
                      <td>{now === null || prior === null ? "—" : ((now - prior) * 100).toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1, signDisplay: "exceptZero" })}</td></tr>;
                  })}
                </tbody>
              </table>
            </div>
          ) : <p>Sin desglose para este período.</p>}
        </Card>
      )}
    </PageShell>
  );
}
