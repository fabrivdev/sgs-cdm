import { useState, type ReactNode } from "react";
import {
  Bar, CartesianGrid, Cell, ComposedChart, Dot, Legend, Line, LineChart, ReferenceLine,
  ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis,
} from "recharts";
import { Card } from "@/components/ui/card";
import { number, percent } from "./model";
import { dealerConcentration, marketContributions, marketHistory, pointsLabel, signedUnits, type MarketStanding } from "./marketShareAnalytics";

const olive = "hsl(var(--primary))";
const red = "#be3442";
const ink = "hsl(var(--foreground))";
const muted = "hsl(var(--muted-foreground))";
const border = "hsl(var(--border))";
const seriesColors = [olive, "#416e9b", "#a26625", "#796795"];
const tick = { fontSize: 11, fill: muted };
const margin = { top: 12, right: 16, bottom: 5, left: 0 };
const smallDecimal = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 });

export function Delta({ value, format = signedUnits }: { value: number | null; format?: (value: number | null) => string }) {
  return <span className={value && value > 0 ? "ms-positive" : value && value < 0 ? "ms-negative" : undefined}>{format(value)}</span>;
}

function ChartPanel({ title, children, className = "" }: { title: string; children: ReactNode; className?: string }) {
  return <Card className={"ms-panel " + className}><h2>{title}</h2>{children}</Card>;
}

export function GrowthDrivers({ brands, benchmark, delta }: { brands: MarketStanding[]; benchmark: string; delta: number | null }) {
  const rows = marketContributions(brands, benchmark);
  const max = Math.max(1, ...rows.map((row) => Math.abs(row.delta)));
  const minScale = rows.some((row) => row.delta < 0) ? -max : 0;
  const maxScale = rows.some((row) => row.delta > 0) ? max : 0;
  const range = maxScale - minScale || 1;
  const zero = -minScale / range * 100;
  const axis = minScale < 0 && maxScale > 0 ? [minScale, 0, maxScale] : [minScale, maxScale];
  return <ChartPanel title="Aporte de cada marca al crecimiento">
    {rows.length ? <>
      <div className="ms-drivers" role="list" aria-label="Variación interanual en unidades">
        {rows.map(({ name, delta }) => (
          <div className="ms-driver" role="listitem" key={name}>
            <span title={name} className={name === benchmark ? "ms-reference" : undefined}>{name}</span>
            <div className="ms-driver-track" style={{ "--ms-zero": zero + "%" } as React.CSSProperties} aria-hidden="true">
              <i className={name === "Otras marcas" ? "other" : delta < 0 ? "down" : "up"}
                style={{ left: delta < 0 ? undefined : zero + "%", right: delta < 0 ? (100 - zero) + "%" : undefined,
                  width: Math.abs(delta) / range * 100 + "%" }} />
            </div>
            <strong><Delta value={delta} /></strong>
          </div>
        ))}
        <div className="ms-driver ms-driver-axis" aria-hidden="true">
          <span /><div>{axis.map((value) => <span key={value}>{signedUnits(value)}</span>)}</div><span>uds.</span>
        </div>
      </div>
      <div className="ms-chart-total"><span>Variación del mercado</span><strong><Delta value={delta} /> uds.</strong></div>
    </> : <p className="ms-unavailable">{brands.some((row) => row.delta !== null) ? "Sin cambios por marca." : "Sin desglose interanual por marca."}</p>}
  </ChartPanel>;
}

export function SharePosition({ brands, benchmark }: { brands: MarketStanding[]; benchmark: string }) {
  const rows = brands.flatMap((row) => row.points === null || row.share === null || !(row.units || row.priorUnits || row.name === benchmark)
    ? [] : [{ ...row, x: row.share * 100, y: row.points }]);
  const featured = new Set([
    brands.find((row) => (row.units ?? 0) > 0)?.name,
    [...rows].sort((a, b) => b.y - a.y)[0]?.name,
    [...rows].sort((a, b) => a.y - b.y)[0]?.name,
  ]);
  const [selected, setSelected] = useState<string>();
  const selectedRow = rows.find((row) => row.name === selected);
  const maxX = Math.max(4, ...rows.map((row) => row.x));
  const xStep = maxX >= 80 ? 25 : maxX >= 20 ? 10 : maxX >= 8 ? 5 : 2;
  const xEnd = Math.min(100, Math.ceil(maxX * 1.07 / xStep) * xStep);
  const xTicks = Array.from({ length: Math.round(xEnd / xStep) + 1 }, (_, index) => index * xStep);
  const maxY = Math.max(1, ...rows.map((row) => Math.abs(row.y)));
  const rawYStep = maxY * .6;
  const factor = 10 ** Math.floor(Math.log10(rawYStep));
  const yStep = ([1, 2, 2.5, 5, 10].find((step) => step * factor >= rawYStep) ?? 10) * factor;
  const yTicks = [-2, -1, 0, 1, 2].map((value) => value * yStep);
  return <ChartPanel title="Cuota y cambio por marca">
    {rows.length ? <>
      <div className="ms-chart ms-position" aria-label="Cuota actual frente a cambio interanual por marca">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ ...margin, left: 0, right: 30, top: 18, bottom: 15 }}>
            <CartesianGrid stroke={border} />
            <XAxis type="number" dataKey="x" domain={[0, xEnd]} ticks={xTicks} interval={0}
              tickFormatter={(value) => smallDecimal.format(value) + " %"} tick={tick}
              label={{ value: "Cuota actual", position: "insideBottom", offset: -10, fill: muted, fontSize: 11 }} />
            <YAxis type="number" dataKey="y" width={60} domain={[-2 * yStep, 2 * yStep]} ticks={yTicks} interval={0}
              tickFormatter={(value) => Number(value).toLocaleString("de-DE", { maximumFractionDigits: 1, signDisplay: "exceptZero" })}
              tick={tick}
              label={{ value: "Cambio de cuota (p. p.)", angle: -90, position: "insideLeft", offset: 6, fill: muted, fontSize: 11, dx: -1, style: { textAnchor: "middle" } }} />
            <ReferenceLine y={0} stroke={muted} />
            <Tooltip cursor={false} content={({ active, payload }) => {
              const row = active ? payload?.[0]?.payload as typeof rows[number] | undefined : undefined;
              return row ? <div className="ms-tooltip"><strong>{row.name}</strong><span>{number(row.units)} uds. · {percent(row.share)}</span><Delta value={row.points} format={pointsLabel} /></div> : null;
            }} />
            <Scatter data={rows} isAnimationActive={false}
              shape={({ cx, cy, payload }: { cx: number; cy: number; payload: typeof rows[number] }) => {
                if (!Number.isFinite(cx) || !Number.isFinite(cy)) return <g />;
                const reference = payload.name === benchmark;
                const showLabel = reference || featured.has(payload.name);
                const short = payload.name.length > 13 ? payload.name.slice(0, 12) + "…" : payload.name;
                const anchor = payload.x >= 10 ? "end" : "start";
                const active = selectedRow?.name === payload.name;
                return <g tabIndex={0} role="img" onFocus={() => setSelected(payload.name)} onBlur={() => setSelected(undefined)}
                  aria-label={payload.name + " · " + percent(payload.share) + " · " + pointsLabel(payload.points)}>
                  <Dot cx={cx} cy={cy} r={reference || showLabel ? 5.4 : 3.5} stroke={active ? ink : "hsl(var(--card))"} strokeWidth={active ? 2 : 1}
                    fill={reference ? "var(--ms-reference)" : payload.y < 0 ? red : olive} fillOpacity={showLabel ? 1 : .72} />
                  {(showLabel || active) && <text x={cx + (anchor === "end" ? -8 : 8)} y={cy - 8} textAnchor={anchor}
                    className="ms-point-label">{short}</text>}
                </g>;
              }} />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </> : <p className="ms-unavailable">Sin cuotas interanuales comparables.</p>}
  </ChartPanel>;
}

export function SalesPace({ data, years, currentYear }: { data: ReturnType<typeof marketHistory>; years: number[]; currentYear: number }) {
  return <ChartPanel title="Ritmo acumulado de ventas">
    {years.length ? <div className="ms-chart" aria-label="Ventas acumuladas por mes y año">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={margin}>
          <CartesianGrid stroke={border} vertical={false} />
          <XAxis dataKey="month" tick={tick} tickLine={false} />
          <YAxis width={43} tick={tick} tickFormatter={number} allowDecimals={false} />
          <Tooltip formatter={(value) => number(Number(value)) + " uds."} />
          <Legend iconType="plainline" />
          {years.map((year, index) => (
            <Line key={year} type="linear" dataKey={String(year)} stroke={seriesColors[index % seriesColors.length]}
              strokeDasharray={year === currentYear ? undefined : ["", "6 3", "2 3", "8 3 2 3"][index % 4]}
              strokeWidth={year === currentYear ? 3 : 2} dot={data.length === 1 ? { r: 3.5 } : false} isAnimationActive={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div> : <p className="ms-unavailable">Sin series acumuladas desde enero.</p>}
  </ChartPanel>;
}

export function DistributorPareto({ concentration }: { concentration: ReturnType<typeof dealerConcentration> }) {
  return <ChartPanel title="Concentración por distribuidor">
    {concentration.rows.length ? <div className="ms-chart" aria-label="Cuota individual y acumulada por distribuidor">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={concentration.rows} margin={{ ...margin, bottom: 28 }}>
          <CartesianGrid stroke={border} vertical={false} />
          <XAxis dataKey="name" interval={0} height={29} angle={-24} textAnchor="end" tick={tick}
            tickFormatter={(name: string) => name === "Otros distribuidores" ? "Otros" : name.length > 14 ? name.slice(0, 13) + "…" : name} />
          <YAxis width={42} domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tick={tick} tickFormatter={(value) => value + " %"} />
          <Tooltip formatter={(value, name, item) => [
            name === "Cuota individual" ? percent(Number(value) / 100) + " · " + number(item.payload.units) + " uds." : percent(Number(value) / 100),
            name,
          ]} />
          <Legend verticalAlign="top" />
          <Bar name="Cuota individual" dataKey="share" maxBarSize={44} radius={[3, 3, 0, 0]} fill={olive} isAnimationActive={false}>
            {concentration.rows.map(({ name }) => <Cell key={name} fill={name === "Otros distribuidores" || name === "Sin identificar" ? muted : olive} />)}
          </Bar>
          <Line name="Cuota acumulada" dataKey="cumulative" stroke="#416e9b" strokeWidth={2.4} dot={{ r: 3 }} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div> : <p className="ms-unavailable">Sin desglose por distribuidor.</p>}
  </ChartPanel>;
}
