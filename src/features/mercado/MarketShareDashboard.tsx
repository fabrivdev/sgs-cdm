import { Link, useLocation, useSearchParams } from "react-router-dom";
import { ChartNoAxesCombined, ChartPie, Flag, Store, TrendingUp } from "lucide-react";
import { FiltersBar, FilterSelect } from "@/components/filters/FiltersBar";
import { KpiItem, KpiStrip, PageHeader, PageShell } from "@/components/layout/AppPrimitives";
import { months, number, percent, ratio } from "./model";
import { salesFamilies, salesTotal, type SalesFamily, type SalesPeriod } from "./marketShareModel";
import { dealerConcentration, marketHistory, pointsLabel, signedUnits, standings, unknownDealer } from "./marketShareAnalytics";
import { Delta, DistributorPareto, GrowthDrivers, SalesPace, SharePosition } from "./MarketShareCharts";
import { SalesCalendar, StandingTable } from "./MarketShareTables";
import "./tractores.css";
import "./marketShare.css";

const basePath = "/mercado/market-share";
const tabs = {
  tablero: "Tablero", marcas: "Marcas", distribuidores: "Distribuidores", historia: "Historia",
};
type View = keyof typeof tabs;
const referenceDealer = "Campos del Mañana";

export function MarketShareDashboard({ periods }: { periods: SalesPeriod[] }) {
  const [params, setParams] = useSearchParams();
  const slug = useLocation().pathname.split("/").filter(Boolean).at(-1);
  const view = slug && Object.prototype.hasOwnProperty.call(tabs, slug) ? slug as View : "tablero";
  const families = (Object.keys(salesFamilies) as SalesFamily[]).filter((key) => periods.some((p) => p.familia === key));
  const requested = params.get("equipo") as SalesFamily | null;
  const family = requested && families.includes(requested) ? requested : families[0];
  const benchmark = family === "pulverizadores" ? "HORSCH" : "CLAAS";
  const dataset = periods.filter((p) => p.familia === family);
  const years = [...new Set(dataset.map((p) => p.anio))].sort((a, b) => b - a);
  const year = years.includes(Number(params.get("año"))) ? Number(params.get("año")) : years[0];
  const lastMonth = Math.max(1, ...dataset.filter((p) => p.anio === year).map((p) => p.mes));
  const cutoff = Math.min(lastMonth, Math.max(1, Math.trunc(Number(params.get("hasta"))) || lastMonth));
  const selected = (period: number) => dataset.filter((p) => p.anio === period && p.mes <= cutoff);
  const current = selected(year);
  const priorPeriods = selected(year - 1);
  const comparable = priorPeriods.length === cutoff && current.length === cutoff;
  const previous = comparable ? priorPeriods : [];
  const total = salesTotal(current);
  const priorTotal = salesTotal(previous);
  const delta = comparable ? total - priorTotal : null;
  const change = delta === null ? null : ratio(delta, priorTotal);
  const brands = standings(current, previous, "marca", [benchmark]);
  const dealers = standings(current, previous, "distribuidor");
  const benchmarkRow = brands.find(({ name }) => name === benchmark);
  const cdm = dealers.find(({ name }) => name === referenceDealer);
  const cdmShare = cdm?.share ?? (dealers.length && !dealers.some(({ name }) => name === unknownDealer) ? ratio(0, total) : null);
  const winner = [...brands].filter((row) => (row.points ?? 0) > 0).sort((a, b) => (b.points ?? 0) - (a.points ?? 0))[0];
  const concentration = dealerConcentration(dealers, total);
  const concentrationChange = concentration.topThree === null || concentration.priorTopThree === null
    ? null : (concentration.topThree - concentration.priorTopThree) * 100;
  const chartYears = years.filter((entry) => entry <= year && selected(entry).some((period) => period.mes === 1)).slice(0, 4);

  function set(name: string, value: string) {
    const next = new URLSearchParams(params);
    next.set(name, value);
    if (name === "equipo" || name === "año") next.delete("hasta");
    setParams(next);
  }

  const href = (target: View) => basePath + (target === "tablero" ? "" : "/" + target)
    + (params.size ? "?" + params.toString() : "");

  return (
    <PageShell className={"market-tractors ms-dashboard" + (family === "pulverizadores" ? " market-horsch" : "")}>
      <PageHeader title="Market Share" tabs={<nav className="market-tabs" aria-label="Secciones de Market Share">
        {(Object.keys(tabs) as View[]).map((item) => <Link key={item} to={href(item)}
          className={view === item ? "chosen" : undefined}
          aria-current={view === item ? "page" : undefined}>{tabs[item]}</Link>)}
      </nav>} />
      <FiltersBar mobileLeading={family && <span className="self-center text-xs text-muted-foreground">{salesFamilies[family]} · {year} · Hasta {months[cutoff - 1].toLowerCase()}</span>}>
        <FilterSelect label="Equipo" placeholder="Equipo" value={family ?? ""} onChange={(v) => set("equipo", v)}
          options={families.map((value) => ({ value, label: salesFamilies[value] }))} />
        <FilterSelect label="Año" placeholder="Año" value={String(year)} onChange={(v) => set("año", v)} width="w-[105px]"
          options={years.map((y) => ({ value: String(y), label: String(y) }))} />
        <FilterSelect label="Acumulado hasta" placeholder="Mes" value={String(cutoff)} onChange={(v) => set("hasta", v)}
          options={months.slice(0, lastMonth).map((label, i) => ({ label, value: String(i + 1) }))} />
      </FiltersBar>
      {view === "tablero" ? <>
        <KpiStrip className="ms-kpis">
          <KpiItem label="Unidades vendidas" value={number(total)} icon={<TrendingUp />}
            detail={current.length !== cutoff ? current.length + " de " + cutoff + " meses reportados"
              : delta === null ? undefined : <Delta value={delta} format={(value) =>
              signedUnits(value) + " uds." + (change === null ? "" : " · " + (change > 0 ? "+" : "") + percent(change))} />} />
          <KpiItem label={"Cuota " + benchmark} value={percent(benchmarkRow?.share ?? null)} icon={<Flag />}
            detail={benchmarkRow && <>{number(benchmarkRow.units)} uds. {benchmarkRow.points !== null && <>· <Delta value={benchmarkRow.points} format={pointsLabel} /></>}</>} />
          <KpiItem label="Mayor ganancia de cuota" value={pointsLabel(winner?.points ?? null)} icon={<ChartNoAxesCombined />}
            tone={winner ? "positive" : "default"} detail={winner?.name} />
          <KpiItem label="Concentración de distribuidores" value={percent(concentration.topThree)} icon={<ChartPie />}
            detail={concentration.topThree !== null && <>3 líderes {concentrationChange !== null && <>· <Delta value={concentrationChange} format={pointsLabel} /></>}</>} />
          <KpiItem label="Cuota Campos del Mañana" value={percent(cdmShare)} icon={<Store />}
            detail={cdmShare !== null && <>{number(cdm?.units ?? 0)} uds. {cdm?.points != null && <>· <Delta value={cdm.points} format={pointsLabel} /></>}</>} />
        </KpiStrip>
        <div className="ms-grid">
          <GrowthDrivers brands={brands} benchmark={benchmark} delta={delta} />
          <SharePosition brands={brands} benchmark={benchmark} />
          <SalesPace data={marketHistory(dataset, chartYears, cutoff)} years={chartYears} currentYear={year} />
          <DistributorPareto concentration={concentration} />
        </div>
      </> : view === "historia" ? <>
        <SalesCalendar dataset={dataset} years={years} year={year} cutoff={cutoff} />
        <SalesPace data={marketHistory(dataset, chartYears, cutoff)} years={chartYears} currentYear={year} />
      </> : (
        <StandingTable key={view + ":" + family} rows={view === "marcas" ? brands : dealers} by={view === "marcas" ? "marca" : "distribuidor"}
          current={current} previous={previous} year={year} benchmark={view === "marcas" ? benchmark : referenceDealer} />
      )}
    </PageShell>
  );
}
