import { Fragment, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, ChevronRight, Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { months, number, percent, ratio } from "./model";
import { salesTotal, type SalesPeriod } from "./marketShareModel";
import { distributorHistory, pointsLabel, standings, unknownDealer, type Dimension, type MarketStanding } from "./marketShareAnalytics";
import { Delta } from "./MarketShareCharts";

const showUnits = (value: number | null) => value === null ? "—" : number(value);
const changeRate = (item: MarketStanding) => item.delta === null ? null : ratio(item.delta, item.priorUnits ?? 0);
const signedRate = (value: number | null) => (value && value > 0 ? "+" : "") + percent(value);
const searchable = (name: string) => name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
type Column = "rank" | "name" | "priorUnits" | "units" | "delta" | "growth" | "priorShare" | "share" | "points";

function ShareCell({ row, scale, year }: { row: MarketStanding; scale: number; year: number }) {
  const priorLabel = String(year - 1) + " · " + percent(row.priorShare);
  return <div className="ms-share-cell">
    {row.share !== null && <div className="market-share-track ms-share-track">
      <b style={{ width: Math.min(100, row.share / scale * 100) + "%" }} />
      {row.priorShare !== null && <span className="market-share-prior" role="img" aria-label={priorLabel} title={priorLabel}
        style={{ "--market-prior-share": Math.min(100, row.priorShare / scale * 100) + "%" } as React.CSSProperties} />}
    </div>}
    <span>{percent(row.share)}</span>
  </div>;
}

export function StandingTable({ rows, by, current, previous, year, benchmark }: {
  rows: MarketStanding[]; by: Dimension; current: SalesPeriod[]; previous: SalesPeriod[]; year: number; benchmark: string;
}) {
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [sort, setSort] = useState<{ key: Column; asc: boolean }>({ key: "units", asc: false });
  const other = by === "marca" ? "distribuidor" : "marca";
  const entity = by === "marca" ? "Marca" : "Distribuidor";
  const title = by === "marca" ? "Ranking de marcas" : "Ranking de distribuidores";
  const cols: { key: Column; label: string; name?: string }[] = [
    { key: "rank", label: "Pos.", name: "Posición" }, { key: "name", label: entity },
    { key: "priorUnits", label: "Uds. " + (year - 1) }, { key: "units", label: "Uds. " + year },
    { key: "delta", label: "Δ uds.", name: "Cambio en unidades" }, { key: "growth", label: "Δ %", name: "Variación porcentual" },
    { key: "priorShare", label: "Cuota " + (year - 1) }, { key: "share", label: "Cuota " + year },
    { key: "points", label: "Δ p. p.", name: "Cambio de cuota en puntos porcentuales" },
  ];
  const shown = rows.filter(({ name }) => searchable(name).includes(searchable(query.trim())))
    .sort((a, b) => {
      const left = sort.key === "growth" ? changeRate(a) : a[sort.key];
      const right = sort.key === "growth" ? changeRate(b) : b[sort.key];
      if (left === null || right === null) return left === right ? 0 : left === null ? 1 : -1;
      const order = typeof left === "string" ? left.localeCompare(String(right), "es") : left - Number(right);
      return sort.asc ? order : -order;
    });
  const detail = expanded ? standings(current, previous, other, [], { by, name: expanded }) : [];
  const scale = Math.max(.01, ...rows.flatMap((row) => [row.share ?? 0, row.priorShare ?? 0]));
  const marketUnits = salesTotal(current);
  const priorUnits = previous.length ? salesTotal(previous) : null;
  const marketDelta = priorUnits === null ? null : marketUnits - priorUnits;

  function metricCells(row: MarketStanding) {
    const comparison = row.partialComparison ? "Variación sobre ventas con distribuidor identificado" : undefined;
    return <>
      <td>{showUnits(row.priorUnits)}</td>
      <td className="ms-current">{showUnits(row.units)}</td>
      <td title={comparison}><Delta value={row.delta} /></td>
      <td title={comparison}><Delta value={changeRate(row)} format={signedRate} /></td>
      <td>{percent(row.priorShare)}</td>
      <td className="ms-current"><ShareCell row={row} scale={scale} year={year} /></td>
      <td title={comparison}><Delta value={row.points} format={pointsLabel} /></td>
    </>;
  }

  return <Card className="ms-panel">
    <div className="ms-table-head">
      <h2>{title}</h2>
      {!!rows.length && <label className="ms-search"><Search aria-hidden="true" />
        <Input type="search" placeholder={"Buscar " + entity.toLowerCase()} aria-label={"Buscar " + entity.toLowerCase()} value={query}
          onChange={(event) => setQuery(event.target.value)} />
      </label>}
    </div>
    {!rows.length ? <p className="ms-unavailable">Sin desglose para este período.</p> :
      <div className="ms-table-scroll" tabIndex={0} role="region" aria-label={title}>
        <table className="ms-table ms-standing">
          <thead><tr>{cols.map(({ key, label, name }) => {
            const active = key === sort.key;
            const Icon = active ? (sort.asc ? ArrowUp : ArrowDown) : ArrowUpDown;
            return <th key={key} scope="col" aria-sort={active ? (sort.asc ? "ascending" : "descending") : undefined}
              className={key === "units" || key === "share" ? "ms-current" : undefined}>
              <button type="button" aria-label={name ?? label} onClick={() => setSort({ key, asc: active ? !sort.asc : key === "name" || key === "rank" })}>
                {label}<Icon aria-hidden="true" />
              </button>
            </th>;
          })}</tr></thead>
          <tbody>
            {shown.map((row) => {
              const open = expanded === row.name;
              const move = row.priorRank !== null && row.rank !== null ? row.priorRank - row.rank : null;
              return <Fragment key={row.name}>
                <tr className={row.name === benchmark ? "ms-reference-row" : undefined}>
                  <td><span className="ms-rank">
                    {row.rank ?? "—"}
                    {!!move && <span className={move > 0 ? "ms-positive" : "ms-negative"} title={`Posición ${year - 1}: ${row.priorRank}`}>
                      {move > 0 ? "↑" : "↓"}{Math.abs(move)}
                    </span>}
                  </span></td>
                  <th scope="row"><button type="button" className="ms-expand" aria-expanded={open} onClick={() => setExpanded(open ? null : row.name)}>
                    {open ? <ChevronDown aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}{row.name}
                  </button></th>
                  {metricCells(row)}
                </tr>
                {open && (detail.length ? detail.map((child) => <tr className="ms-child" key={child.name}>
                  <td /><th scope="row">{child.name}</th>{metricCells(child)}
                </tr>) : <tr className="ms-child"><td /><td colSpan={8}>Sin {other === "marca" ? "marcas" : "distribuidores"} en este corte.</td></tr>)}
              </Fragment>;
            })}
            {!shown.length && <tr><td className="ms-empty-cell" colSpan={cols.length}>Sin coincidencias.</td></tr>}
          </tbody>
          <tfoot><tr>
            <th scope="row" colSpan={2}>Total del mercado</th>
            <td>{showUnits(priorUnits)}</td><td>{number(marketUnits)}</td><td><Delta value={marketDelta} /></td>
            <td><Delta value={marketDelta === null ? null : ratio(marketDelta, priorUnits ?? 0)} format={signedRate} /></td>
            <td>{percent(priorUnits ? 1 : null)}</td><td>{percent(marketUnits ? 1 : null)}</td><td>—</td>
          </tr></tfoot>
        </table>
      </div>}
  </Card>;
}

type HistoryProps = {
  dataset: SalesPeriod[]; years: number[]; year: number; cutoff: number;
};

export function DistributorHistory({ dataset, years, year, cutoff, benchmark }: HistoryProps & { benchmark: string }) {
  const { periods, rows, aggregateOnly } = distributorHistory(dataset, years, cutoff);
  const dealerRows = rows.filter((row) => row.name !== unknownDealer);
  const unknown = rows.find((row) => row.name === unknownDealer);
  const maxByYear = periods.map((_, index) => Math.max(1, ...dealerRows.map((row) => row.values[index] ?? 0)));
  const aggregateTotal = aggregateOnly.reduce<number>((sum, units) => sum + (units ?? 0), 0);
  const total = periods.some((period) => period.units !== null)
    ? periods.reduce((sum, period) => sum + (period.units ?? 0), 0)
    : null;
  const title = "Ranking histórico de distribuidores";
  return <Card className="ms-panel">
    <h2>{title}</h2>
    <div className="ms-table-scroll" tabIndex={0} role="region" aria-label={title}>
      <table className="ms-table ms-dealer-history">
        <thead><tr>
          <th scope="col">Distribuidor</th>
          {periods.map((period) => <th key={period.year} scope="col" className={period.year === year ? "ms-current" : undefined}
            title={period.units === null ? "Corte incompleto" : period.counts ? undefined : "Total de mercado sin desglose"}>{period.year}</th>)}
          <th scope="col" aria-sort="descending">Total</th>
        </tr></thead>
        <tbody>
          {dealerRows.map((row) => <tr key={row.name} className={row.name === benchmark ? "ms-reference-row" : undefined}>
            <th scope="row">{row.name}</th>
            {row.values.map((units, index) => <td key={periods[index].year}
              className={periods[index].year === year ? "ms-current" : undefined}
              title={units === null ? (periods[index].counts ? "Distribuidor no identificado en este corte" : "Sin desglose para este corte") : undefined}
              style={units ? { "--ms-year-fill": (100 * units / maxByYear[index]) + "%" } as React.CSSProperties : undefined}>
              {showUnits(units)}
            </td>)}
            <td className="ms-history-total">{number(row.total)}</td>
          </tr>)}
          {unknown && <tr>
            <th scope="row">{unknownDealer}</th>
            {unknown.values.map((units, index) => <td key={periods[index].year}>{showUnits(units)}</td>)}
            <td className="ms-history-total">{number(unknown.total)}</td>
          </tr>}
          {aggregateOnly.some((units) => units !== null) && <tr>
            <th scope="row">Sin desglose disponible</th>
            {aggregateOnly.map((units, index) => <td key={periods[index].year}>{showUnits(units)}</td>)}
            <td className="ms-history-total">{number(aggregateTotal)}</td>
          </tr>}
        </tbody>
        <tfoot><tr>
          <th scope="row">Total al corte ({months[cutoff - 1]})</th>
          {periods.map((period) => <td key={period.year}>{showUnits(period.units)}</td>)}
          <td>{showUnits(total)}</td>
        </tr></tfoot>
      </table>
    </div>
  </Card>;
}

export function SalesCalendar({ dataset, years, year, cutoff }: HistoryProps) {
  const rows = years.map((entry) => {
    const periods = dataset.filter((period) => period.anio === entry);
    return { year: entry, months: new Map(periods.map((period) => [period.mes, period.total])) };
  });
  const max = Math.max(1, ...dataset.map((period) => period.total));
  function accumulated(row: (typeof rows)[number] | undefined, through: number) {
    const values = months.slice(0, through).map((_, index) => row?.months.get(index + 1));
    return values.some((value) => value === undefined) ? null : values.reduce<number>((sum, value) => sum + (value ?? 0), 0);
  }
  return <Card className="ms-panel">
    <h2>Calendario de ventas</h2>
    <div className="ms-table-scroll" tabIndex={0} role="region" aria-label="Calendario de ventas">
      <table className="ms-table ms-calendar">
        <thead><tr><th scope="col">Año</th>
          {months.map((month, index) => <th scope="col" key={month} className={index + 1 === cutoff ? "ms-cutoff" : undefined}>{month}</th>)}
          <th scope="col">Al corte ({months[cutoff - 1]})</th><th scope="col">Δ %</th><th scope="col">Año completo</th>
        </tr></thead>
        <tbody>{rows.map((row) => {
          const total = accumulated(row, cutoff);
          const prior = accumulated(rows.find((entry) => entry.year === row.year - 1), cutoff);
          return <tr key={row.year} className={row.year === year ? "ms-reference-row" : undefined}>
            <th scope="row">{row.year}</th>
            {months.map((month, index) => {
              const units = row.months.get(index + 1);
              return <td key={month} className={index + 1 === cutoff ? "ms-cutoff" : undefined}
                style={units ? { backgroundColor: `hsl(var(--primary) / ${.06 + .37 * units / max})` } : undefined}>{showUnits(units ?? null)}</td>;
            })}
            <td className="ms-current">{showUnits(total)}</td>
            <td><Delta value={total === null || !prior ? null : ratio(total - prior, prior)} format={signedRate} /></td>
            <td>{showUnits(accumulated(row, 12))}</td>
          </tr>;
        })}</tbody>
      </table>
    </div>
  </Card>;
}
