import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { Card } from "@/components/ui/card";
import {
  compare,
  label,
  money,
  months,
  number,
  percent,
  ratio,
  totals,
  type Movement,
} from "./model";
import {
  hpBands,
  positioning,
  priceBridge,
  seasonality,
} from "./marketAnalysis";

type LinkTo = (
  view:
    "marcas" | "modelos" | "importadores" | "historia" | "precios" | "potencia",
  filters?: Record<string, string | null>,
) => string;
const primary = "hsl(var(--primary))";
const claas = "#78a912";
const grid = "hsl(var(--border))";
const positive = "#15803d";
const negative = "#b91c1c";
const compact = (value: number) =>
  Intl.NumberFormat("es-PY", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
const shortBands = ["≤80", "81–120", "121–170", "171–230", ">230"];

function Heading({
  title,
  detail,
  to,
}: {
  title: string;
  detail: string;
  to: string;
}) {
  return (
    <>
      <h2>
        <Link to={to}>
          {title}
          <span aria-hidden="true">›</span>
        </Link>
      </h2>
      <p>{detail}</p>
    </>
  );
}

type Period = {
  current: Movement[];
  previous: Movement[];
  year: number;
  href: LinkTo;
};
function PowerOpportunity({ current, previous, year, href }: Period) {
  const groups = compare(current, previous, (row) => row[5]).sort((a, b) => {
    const order = [...hpBands, "Sin potencia informada"];
    return order.indexOf(a.name) - order.indexOf(b.name);
  });
  const brand = new Map(
    compare(
      current.filter((row) => row[3] === "CLAAS"),
      [],
      (row) => row[5],
    ).map((group) => [group.name, group.units]),
  );
  const priced = new Map(
    compare(
      current.filter((row) => row[10] > 0),
      [],
      (row) => row[5],
    ).map((group) => [group.name, group]),
  );
  return (
    <Card className="market-panel">
      <Heading
        title="Mapa de oportunidades por potencia"
        detail={`Volumen y cuota CLAAS dentro del filtro · ${year}`}
        to={href("potencia")}
      />
      <div
        className="market-scroll"
        tabIndex={0}
        role="region"
        aria-label="Comparación por potencia"
      >
        <table>
          <thead>
            <tr>
              <th scope="col">Banda HP</th>
              <th scope="col">Unidades</th>
              <th scope="col">Variación</th>
              <th scope="col">FOB medio</th>
              <th scope="col">Cuota CLAAS</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => {
              const price = priced.get(group.name);
              const change = group.prior ? group.units / group.prior - 1 : null;
              return (
                <tr key={group.name}>
                  <th scope="row">
                    <Link to={href("marcas", { potencia: group.name })}>
                      {group.name} ›
                    </Link>
                  </th>
                  <td title={`${year - 1}: ${number(group.prior)} unidades`}>
                    {number(group.units)}
                  </td>
                  <td
                    data-tone={
                      change && change > 0
                        ? "up"
                        : change && change < 0
                          ? "down"
                          : undefined
                    }
                  >
                    {percent(change)}
                  </td>
                  <td>
                    {money(price ? ratio(price.fob, price.units) : null)}
                    {price && (
                      <small className="market-price-count">
                        {number(price.units)} uds.
                      </small>
                    )}
                  </td>
                  <td>
                    {percent(ratio(brand.get(group.name) ?? 0, group.units))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!groups.length && <p>Sin movimientos en el período seleccionado.</p>}
    </Card>
  );
}

function ModelPosition({ current, year, href }: Omit<Period, "previous">) {
  const navigate = useNavigate();
  const states = [...new Set(current.map((row) => row[8]))];
  const [preferred, setPreferred] = useState("NUEVO");
  const state = states.includes(preferred)
    ? preferred
    : (states[0] ?? preferred);
  const { points, covered, priced } = positioning(current, state);
  const peers = points.filter((point) => !point.model.startsWith("CLAAS · "));
  const claasModels = points.filter((point) =>
    point.model.startsWith("CLAAS · "),
  );
  return (
    <Card className="market-panel">
      <Heading
        title="CLAAS frente a modelos comparables"
        detail={`FOB por tractor según banda de potencia · ${year}`}
        to={href("modelos")}
      />
      {states.length > 1 && (
        <label className="market-analysis-control">
          Estado{" "}
          <select
            value={state}
            onChange={(event) => setPreferred(event.target.value)}
          >
            {states.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
      )}
      {points.length ? (
        <>
          <div
            className="market-analysis-chart"
            role="img"
            aria-label="Comparación de modelos según banda HP y valor FOB medio"
          >
            <ResponsiveContainer>
              <ScatterChart
                margin={{ top: 10, right: 18, bottom: 4, left: 12 }}
              >
                <CartesianGrid stroke={grid} vertical={false} />
                <XAxis
                  dataKey="power"
                  type="number"
                  ticks={[0, 1, 2, 3, 4]}
                  tickFormatter={(n) => shortBands[n]}
                  domain={[-0.45, 4.45]}
                  tick={{ fontSize: 11 }}
                />
                <YAxis
                  dataKey="price"
                  type="number"
                  tickFormatter={(n) => "$" + compact(n)}
                  tick={{ fontSize: 11 }}
                  width={60}
                />
                <ZAxis dataKey="units" type="number" range={[28, 250]} />
                <Tooltip
                  content={({ payload }) => {
                    const point = payload?.[0]?.payload as
                      (typeof points)[number] | undefined;
                    return point ? (
                      <div className="market-chart-tooltip">
                        <strong>{point.model}</strong>
                        <div>
                          {point.band} · {money(point.price)} ·{" "}
                          {number(point.units)} uds.
                        </div>
                      </div>
                    ) : null;
                  }}
                />
                <Scatter
                  name="Otras marcas"
                  data={peers}
                  fill="hsl(var(--muted-foreground))"
                  fillOpacity={0.37}
                  isAnimationActive={false}
                  onClick={(point) =>
                    navigate(
                      href("importadores", {
                        modelos: point.model,
                        potencia: point.band,
                        estado: state,
                      }),
                    )
                  }
                />
                <Scatter
                  name="CLAAS"
                  data={claasModels}
                  fill={claas}
                  stroke="hsl(var(--foreground))"
                  isAnimationActive={false}
                  onClick={(point) =>
                    navigate(
                      href("importadores", {
                        modelos: point.model,
                        potencia: point.band,
                        estado: state,
                      }),
                    )
                  }
                />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
          <p className="market-analysis-note">
            Puntos verdes: CLAAS. Tamaño por unidades. {number(covered)} de{" "}
            {number(priced)} unidades con FOB tienen modelo y HP.
          </p>
          <details className="market-analysis-details">
            <summary>Ver modelos y unidades</summary>
            <div className="market-scroll">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Modelo y banda</th>
                    <th scope="col">Unidades</th>
                    <th scope="col">FOB medio</th>
                  </tr>
                </thead>
                <tbody>
                  {[...claasModels, ...peers].map((point) => (
                    <tr key={point.model + point.band}>
                      <th scope="row">
                        <Link
                          to={href("importadores", {
                            modelos: point.model,
                            potencia: point.band,
                            estado: state,
                          })}
                        >
                          {point.model} · {point.band} ›
                        </Link>
                      </th>
                      <td>{number(point.units)}</td>
                      <td>{money(point.price)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      ) : (
        <p>Sin modelos con potencia y FOB informado para este filtro.</p>
      )}
    </Card>
  );
}

function FobBridge({ current, previous, year, href }: Period) {
  const bridge = priceBridge(current, previous);
  const bars = bridge
    ? [
        { name: String(year - 1), from: 0, to: bridge.before, endpoint: true },
        ...bridge.steps.map((step) => ({ ...step, endpoint: false })),
        { name: String(year), from: 0, to: bridge.after, endpoint: true },
      ].map((step) => ({
        ...step,
        base: Math.min(step.from, step.to),
        height: Math.abs(step.to - step.from),
      }))
    : [];
  return (
    <Card className="market-panel">
      <Heading
        title="Puente del FOB medio por tractor"
        detail="Efecto de la mezcla, los valores FOB y los modelos sin par"
        to={href("precios")}
      />
      {bridge ? (
        <>
          <div
            className="market-analysis-chart"
            role="img"
            aria-label="Cascada del valor FOB medio entre períodos"
          >
            <ResponsiveContainer>
              <ComposedChart
                data={bars}
                margin={{ top: 8, right: 10, bottom: 4, left: 12 }}
              >
                <CartesianGrid stroke={grid} vertical={false} />
                <XAxis dataKey="name" interval={0} hide />
                <YAxis
                  width={56}
                  tick={{ fontSize: 10 }}
                  tickFormatter={(n) => "$" + compact(n)}
                />
                <Tooltip
                  content={({ payload }) => {
                    const bar = payload?.[0]?.payload as
                      (typeof bars)[number] | undefined;
                    return bar ? (
                      <div className="market-chart-tooltip">
                        <strong>{bar.name}</strong>
                        <div>
                          {money(bar.endpoint ? bar.to : bar.to - bar.from)}
                        </div>
                      </div>
                    ) : null;
                  }}
                />
                <Bar
                  dataKey="base"
                  stackId="bridge"
                  fill="transparent"
                  isAnimationActive={false}
                />
                <Bar
                  dataKey="height"
                  stackId="bridge"
                  isAnimationActive={false}
                  maxBarSize={42}
                >
                  {bars.map((bar) => (
                    <Cell
                      key={bar.name}
                      fill={
                        bar.endpoint
                          ? primary
                          : bar.to >= bar.from
                            ? "#7299b2"
                            : "#c59372"
                      }
                    />
                  ))}
                </Bar>
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div
            className="market-bridge-labels"
            style={{
              gridTemplateColumns: `repeat(${bars.length}, minmax(0, 1fr))`,
            }}
          >
            {bars.map((bar, index) => (
              <div key={bar.name} title={bar.name}>
                <span>
                  {bar.endpoint
                    ? bar.name
                    : ["Salen", "Mezcla", "FOB", "Entran"][index - 1]}
                </span>
                <strong>
                  {!bar.endpoint && bar.to !== bar.from
                    ? bar.to > bar.from
                      ? "+"
                      : "−"
                    : ""}
                  {money(bar.endpoint ? bar.to : Math.abs(bar.to - bar.from))}
                </strong>
              </div>
            ))}
          </div>
          {bridge.steps.length ? (
            <p className="market-analysis-note">
              Comparables por marca, modelo y estado. Cobertura sobre unidades
              con FOB: {number(bridge.coverage.priorUnits)}/
              {number(bridge.coverage.priorTotal)} en {year - 1} y{" "}
              {number(bridge.coverage.recentUnits)}/
              {number(bridge.coverage.recentTotal)} en {year}.
            </p>
          ) : (
            <p>
              Sin modelos identificados en común. Se muestran los dos promedios
              con FOB.
            </p>
          )}
        </>
      ) : (
        <p>Se necesitan unidades con FOB en ambos períodos.</p>
      )}
    </Card>
  );
}

function ImporterConcentration({
  current,
  year,
  href,
}: Omit<Period, "previous">) {
  const groups = compare(current, [], (row) => label(row, "importadores"));
  const unknown = (value: string) =>
    ["", "sin identificar", "sin datos", "no informado", "n/d"].includes(
      value.trim().toLowerCase(),
    );
  const identified = groups.filter((group) => !unknown(group.name));
  const knownUnits = identified.reduce(
    (count, group) => count + group.units,
    0,
  );
  const total = totals(current).units;
  const heads = identified.slice(0, 7);
  const rest =
    knownUnits - heads.reduce((count, group) => count + group.units, 0);
  const displayed = [
    ...heads,
    ...(rest ? [{ name: "Otros importadores", units: rest }] : []),
  ];
  let running = 0;
  const chart = displayed.map((row, index) => ({
    ...row,
    id: index < heads.length ? String(index + 1) : "Otros",
    cumulative: (running += row.units) / knownUnits,
  }));
  return (
    <Card className="market-panel">
      <Heading
        title="Concentración por importador"
        detail={`Unidades y cuota acumulada entre importadores identificados · ${year}`}
        to={href("importadores")}
      />
      {chart.length ? (
        <>
          <div
            className="market-analysis-chart"
            role="img"
            aria-label="Distribución de unidades y línea de participación acumulada por importador"
          >
            <ResponsiveContainer>
              <ComposedChart
                data={chart}
                margin={{ top: 8, right: 6, left: 10 }}
              >
                <CartesianGrid stroke={grid} vertical={false} />
                <XAxis dataKey="id" tick={{ fontSize: 11 }} />
                <YAxis
                  yAxisId="units"
                  width={42}
                  tick={{ fontSize: 10 }}
                  allowDecimals={false}
                />
                <YAxis
                  yAxisId="share"
                  width={45}
                  orientation="right"
                  domain={[0, 1]}
                  ticks={[0, 0.25, 0.5, 0.75, 1]}
                  tickFormatter={(n) => Math.round(n * 100) + "%"}
                  tick={{ fontSize: 10 }}
                />
                <Tooltip
                  content={({ payload }) => {
                    const row = payload?.[0]?.payload as
                      (typeof chart)[number] | undefined;
                    return row ? (
                      <div className="market-chart-tooltip">
                        <strong>{row.name}</strong>
                        <div>
                          {number(row.units)} uds. · {percent(row.cumulative)}{" "}
                          acumulado
                        </div>
                      </div>
                    ) : null;
                  }}
                />
                <Bar
                  yAxisId="units"
                  dataKey="units"
                  fill={primary}
                  maxBarSize={30}
                  isAnimationActive={false}
                />
                <Line
                  yAxisId="share"
                  dataKey="cumulative"
                  stroke="#5685a3"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  isAnimationActive={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <p className="market-analysis-note">
            {number(knownUnits)} de {number(total)} unidades con importador
            identificado. Barras: unidades. Línea: cuota acumulada.
          </p>
          <details className="market-analysis-details">
            <summary>Ver importadores del gráfico</summary>
            <ol>
              {heads.map((row) => (
                <li key={row.name}>
                  <Link to={href("marcas", { importadores: row.name })}>
                    {row.name} ›
                  </Link>{" "}
                  · {number(row.units)} uds.
                </li>
              ))}
            </ol>
          </details>
        </>
      ) : (
        <p>Sin importadores identificados en el período seleccionado.</p>
      )}
    </Card>
  );
}

function Seasonality({
  rows,
  scoped,
  year,
  end,
  month,
  href,
}: {
  rows: Movement[];
  scoped: Movement[];
  year: number;
  end: number;
  month: number;
  href: LinkTo;
}) {
  const selected = month
    ? [month]
    : Array.from({ length: end }, (_, index) => index + 1);
  const { grid: periods, baseline } = seasonality(rows, scoped, year, selected);
  const peak = Math.max(
    1,
    ...periods.flatMap((period) => period.values.map((value) => value ?? 0)),
  );
  return (
    <Card className="market-panel market-seasonality">
      <Heading
        title="Estacionalidad de importación"
        detail="Unidades por mes y mediana de años anteriores"
        to={href("historia")}
      />
      <div
        className="market-scroll"
        tabIndex={0}
        role="region"
        aria-label="Mapa de calor por año y mes"
      >
        <table>
          <thead>
            <tr>
              <th scope="col">Año</th>
              {selected.map((value) => (
                <th scope="col" key={value}>
                  {months[value - 1]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {periods.map((period) => (
              <tr key={period.year}>
                <th scope="row">{period.year}</th>
                {period.values.map((value, index) => {
                  const historical = baseline[index];
                  return (
                    <td
                      key={selected[index]}
                      style={
                        value === null
                          ? undefined
                          : {
                              background: `hsl(var(--primary) / ${0.04 + (0.48 * value) / peak})`,
                            }
                      }
                    >
                      {value === null ? (
                        "—"
                      ) : (
                        <Link
                          to={href("marcas", {
                            año: String(period.year),
                            mes: String(selected[index]),
                          })}
                          title={
                            historical === null
                              ? "Sin mediana histórica"
                              : `Mediana: ${number(historical)} uds. · diferencia: ${number(value - historical)} uds.`
                          }
                        >
                          {number(value)}
                        </Link>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">Mediana histórica</th>
              {baseline.map((value, index) => (
                <td key={selected[index]}>
                  {value === null ? "—" : value.toLocaleString("de-DE")}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </Card>
  );
}

export function TractorAnalysis(
  props: Period & {
    rows: Movement[];
    scoped: Movement[];
    end: number;
    month: number;
  },
) {
  return (
    <div className="market-panels">
      <PowerOpportunity {...props} />
      <ModelPosition {...props} />
      <FobBridge {...props} />
      <ImporterConcentration {...props} />
      <Seasonality {...props} />
    </div>
  );
}
