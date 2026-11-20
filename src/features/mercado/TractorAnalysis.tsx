import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import {
  compare,
  label,
  money,
  months,
  number,
  percent,
  ratio,
  type Movement,
} from "./model";
import {
  hpBands,
  positioning,
  priceBridge,
  seasonality,
} from "./marketAnalysis";

function Heading({ title, detail }: { title: string; detail: string }) {
  return (
    <>
      <h2>{title}</h2>
      <p>{detail}</p>
    </>
  );
}

type Period = {
  current: Movement[];
  previous: Movement[];
  year: number;
};
function PowerOpportunity({ current, previous, year }: Period) {
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
  const peak = Math.max(1, ...groups.map((group) => group.units));
  return (
    <Card className="market-panel">
      <Heading
        title="Mapa de oportunidades por potencia"

        detail={`Unidades y FOB por banda · ${year}`}
      />
      <div
        className="market-scroll"
        tabIndex={0}
        role="region"
        aria-label="Comparación por potencia"
      >
        <table className="market-opportunity-table">
          <thead>
            <tr>
              <th scope="col">Banda HP</th>
              <th scope="col">Unidades</th>
              <th scope="col">Var. interanual</th>
              <th scope="col">FOB medio</th>
              <th scope="col">Cuota CLAAS</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => {
              const price = priced.get(group.name);
              const classified = hpBands.includes(group.name);
              const change =
                group.prior && classified
                  ? group.units / group.prior - 1
                  : null;
              return (
                <tr
                  key={group.name}
                  data-unclassified={!classified || undefined}
                >
                  <th scope="row">{group.name}</th>
                  <td
                    className="market-opportunity-volume"
                    title={`${year - 1}: ${number(group.prior)} unidades`}
                  >
                    <span>{number(group.units)}</span>
                    <span
                      className="market-opportunity-track"
                      aria-hidden="true"
                    >
                      <i style={{ width: (group.units / peak) * 100 + "%" }} />
                    </span>
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
                    <span className="market-opportunity-change">
                      {change !== null && change !== 0 && (
                        <span aria-hidden="true">
                          {change > 0 ? "▲ " : "▼ "}
                        </span>
                      )}
                      {percent(change)}
                    </span>
                  </td>
                  <td>
                    <strong
                      title={
                        price
                          ? number(price.units) + " unidades con FOB"
                          : undefined
                      }
                    >
                      {money(price ? ratio(price.fob, price.units) : null)}
                    </strong>
                  </td>
                  <td
                    data-opportunity={
                      Boolean(brand.get(group.name)) || undefined
                    }
                  >
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

function ModelPosition({ current, year }: Omit<Period, "previous">) {
  const states = [...new Set(current.map((row) => row[8]))];
  const [preferred, setPreferred] = useState("NUEVO");
  const state = states.includes(preferred)
    ? preferred
    : (states[0] ?? preferred);
  const { points } = positioning(current, state);
  const bands = hpBands
    .map((band) => {
      const inBand = points.filter((point) => point.band === band);
      const peers = inBand.filter(
        (point) => !point.model.startsWith("CLAAS · "),
      );
      const prices = peers.map((point) => point.price).sort((a, b) => a - b);
      const middle = Math.floor(prices.length / 2);
      const median = prices.length
        ? (prices[middle] + prices[Math.floor((prices.length - 1) / 2)]) / 2
        : null;
      return {
        band,
        peers,
        low: prices[0],
        high: prices.at(-1),
        median,
        claasModels: inBand.filter((point) =>
          point.model.startsWith("CLAAS · "),
        ),
      };
    })
    .filter((band) => band.peers.length || band.claasModels.length);
  const maxPrice = Math.max(1, ...points.map((point) => point.price));
  const magnitude = 10 ** Math.floor(Math.log10(maxPrice));
  const limit = Math.ceil(maxPrice / magnitude) * magnitude;
  const scale = (price: number) =>
    Math.max(0, Math.min(100, (price / limit) * 100)) + "%";
  return (
    <Card className="market-panel">
      <Heading
        title="CLAAS frente a otros modelos"

        detail={`FOB medio por tractor · ${year}`}
      />
      <div className="market-comparison-toolbar">
        <div className="market-comparison-legend">
          <span>
            <i className="peer-key" /> Otras marcas
          </span>
          <span>
            <i className="claas-key" /> CLAAS
          </span>
        </div>
        {states.length > 1 && (
          <label className="market-analysis-control">
            Estado
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
      </div>
      {bands.length ? (
        <>
          <div className="market-price-ranges">
            {bands.map(({ band, peers, low, high, median, claasModels }) => (
              <div className="market-range" key={band}>
                <div className="market-range-label">
                  <strong>{band}</strong>
                  <span>
                    {peers.length
                      ? `${number(peers.length)} modelos de otras marcas`
                      : "Sin otras marcas"}
                  </span>
                </div>
                <div
                  className="market-range-track"
                  aria-label={
                    median === null
                      ? "Sin otras marcas"
                      : `Otras marcas: de ${money(low)} a ${money(high)}, mediana ${money(median)}`
                  }
                >
                  {median !== null && (
                    <>
                      <span
                        className="market-range-band"
                        style={{ left: scale(low), width: scale(high - low) }}
                        title={`Otras marcas: ${money(low)} a ${money(high)}`}
                      />
                      <span
                        className="market-range-median"
                        style={{ left: scale(median) }}
                        title={`Mediana de modelos: ${money(median)}`}
                      />
                    </>
                  )}
                  {claasModels.map((point) => (
                    <span
                      className="market-range-point"
                      key={point.model}
                      style={{ left: scale(point.price) }}
                      title={`${point.model} · ${money(point.price)} · ${number(point.units)} uds.`}
                      aria-label={`${point.model} · ${money(point.price)} · ${number(point.units)} uds.`}
                    />
                  ))}
                </div>
                <div className="market-range-values">
                  {median !== null && <span>Mediana {money(median)}</span>}
                  {claasModels.map((point) => (
                    <strong key={point.model}>
                      {point.model.replace("CLAAS · ", "")} ·{" "}
                      {money(point.price)} · {number(point.units)} uds.
                    </strong>
                  ))}
                </div>
              </div>
            ))}
            <div className="market-range-axis">
              {Array.from({ length: 9 }, (_, index) => (
                <span key={index} style={{ left: index * 12.5 + "%" }}>
                  {money((limit * index) / 8)}
                </span>
              ))}
            </div>
          </div>
        </>
      ) : (
        <p>Sin modelos con potencia y FOB informado para este filtro.</p>
      )}
    </Card>
  );
}

const signedMoney = (value: number) =>
  (Math.round(Math.abs(value)) === 0 ? "" : value < 0 ? "−" : "+") +
  money(Math.abs(value));

function FobBridge({ current, previous, year }: Period) {
  const bridge = priceBridge(current, previous);
  const effects = bridge?.steps.length
    ? [
        {
          name: "Modelos sin comparación",
          delta:
            bridge.steps[0].to -
            bridge.steps[0].from +
            (bridge.steps[3].to - bridge.steps[3].from),
        },
        {
          name: "Mezcla de modelos comparables",
          delta: bridge.steps[1].to - bridge.steps[1].from,
        },
        {
          name: "FOB de los mismos modelos",
          delta: bridge.steps[2].to - bridge.steps[2].from,
        },
      ]
    : [];
  const change = bridge ? bridge.after - bridge.before : 0;
  const stages = bridge
    ? [
        { name: String(year - 1), from: 0, to: bridge.before, total: true },
        ...effects.map((effect, index) => {
          const from =
            bridge.before +
            effects.slice(0, index).reduce((sum, item) => sum + item.delta, 0);
          return {
            name: effect.name,
            from,
            to: from + effect.delta,
            total: false,
          };
        }),
        { name: String(year), from: 0, to: bridge.after, total: true },
      ]
    : [];
  const scale = Math.max(
    1,
    ...stages.flatMap((stage) => [stage.from, stage.to]),
  );
  return (
    <Card className="market-panel">
      <Heading
        title="Qué cambió el FOB por tractor"

        detail="FOB por tractor · Comparación interanual"
      />
      {bridge ? (
        <>
          <div className="market-bridge-summary">
            <div>
              <span>{year - 1}</span>
              <strong>{money(bridge.before)}</strong>
            </div>
            <div>
              <span>{year}</span>
              <strong>{money(bridge.after)}</strong>
            </div>
            <div
              className="market-bridge-change"
              data-direction={change < 0 ? "down" : "up"}
            >
              <span>Variación por tractor</span>
              <strong>{percent(change / bridge.before)}</strong>
              <small>{signedMoney(change)}</small>
            </div>
          </div>
          {effects.length ? (
            <>
              <div
                className="market-waterfall"
                aria-label="Contribuciones al cambio del FOB medio"
              >
                {stages.map((stage, index) => {
                  const delta = stage.to - stage.from;
                  const height = (Math.abs(delta) / scale) * 100;
                  const bottom = (Math.min(stage.from, stage.to) / scale) * 100;
                  return (
                    <div className="market-waterfall-stage" key={stage.name}>
                      <div className="market-waterfall-plot">
                        {index === 0 && (
                          <span className="market-waterfall-zero">$0</span>
                        )}
                        {index < stages.length - 1 && (
                          <i
                            className="market-waterfall-connector"
                            aria-hidden="true"
                            style={{ bottom: (stage.to / scale) * 100 + "%" }}
                          />
                        )}
                        <div
                          className="market-waterfall-bar"
                          data-kind={
                            stage.total ? "total" : delta < 0 ? "down" : "up"
                          }
                          style={{ bottom: bottom + "%", height: height + "%" }}
                        >
                          <strong className="market-waterfall-value">
                            {stage.total ? money(stage.to) : signedMoney(delta)}
                          </strong>
                        </div>
                      </div>
                      <span className="market-waterfall-label">
                        {stage.name}
                      </span>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <p>
              No hay modelos identificados en ambos períodos para separar los
              efectos.
            </p>
          )}
        </>
      ) : (
        <p>Se necesitan unidades con FOB en ambos períodos.</p>
      )}
    </Card>
  );
}

function ImporterConcentration({ current, year }: Omit<Period, "previous">) {
  const groups = compare(current, [], (row) => label(row, "importadores"));
  const identified = groups.filter(
    (group) =>
      !["", "sin identificar", "sin datos", "no informado", "n/d"].includes(
        group.name.trim().toLowerCase(),
      ),
  );
  const knownUnits = identified.reduce((sum, group) => sum + group.units, 0);
  const heads = identified.slice(0, 7);
  const rest = knownUnits - heads.reduce((sum, group) => sum + group.units, 0);
  const displayed = [
    ...heads.map((row) => ({ name: row.name, units: row.units, other: false })),
    ...(rest ? [{ name: "Otros importadores", units: rest, other: true }] : []),
  ];
  const palette = [
    "#507914",
    "#648a1a",
    "#7e9f21",
    "#91aa27",
    "#9eaf50",
    "#a9b76b",
    "#b7c185",
  ];
  const slices = displayed.map((row, index) => ({
    ...row,
    color: row.other ? "#aeaeae" : palette[index],
  }));
  const largest = Math.max(1, ...slices.map((row) => row.units));
  const step = 10 ** Math.floor(Math.log10(largest));
  const barMax = Math.ceil(largest / step) * step;
  return (
    <Card className="market-panel">
      <Heading
        title="Quiénes concentran las importaciones"

        detail={`Unidades por importador identificado · ${year}`}
      />
      {displayed.length ? (
        <>
          <div className="market-importer-composition">
            <div className="market-importer-donut" aria-hidden="true">
              <ResponsiveContainer>
                <PieChart>
                  <Pie
                    data={slices}
                    dataKey="units"
                    nameKey="name"
                    innerRadius="53%"
                    outerRadius="96%"
                    stroke="hsl(var(--card))"
                    strokeWidth={2}
                    isAnimationActive={false}
                  >
                    {slices.map((row) => (
                      <Cell key={row.name} fill={row.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="market-importer-donut-label">
                <strong>{number(knownUnits)}</strong>
                <span>unidades</span>
              </div>
            </div>
            <ul className="market-importer-list">
              {slices.map((row) => (
                <li key={row.name} data-other={row.other || undefined}>
                  <div className="market-importer-line">
                    <span className="market-importer-name">{row.name}</span>
                    <span className="market-importer-value">
                      <strong>{number(row.units)}</strong> uds. ·{" "}
                      {percent(ratio(row.units, knownUnits))}
                    </span>
                    <div className="market-importer-track" aria-hidden="true">
                      <i
                        style={{
                          width: (row.units / barMax) * 100 + "%",
                          background: row.color,
                        }}
                      />
                    </div>
                  </div>
                </li>
              ))}
              <li
                className="market-importer-line market-importer-scale"
                aria-label="Escala de unidades"
              >
                <span className="market-importer-ticks">
                  <span>0</span>
                  <span>{number(barMax)} uds.</span>
                </span>
              </li>
            </ul>
          </div>
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
}: {
  rows: Movement[];
  scoped: Movement[];
  year: number;
  end: number;
  month: number;
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
                        <span
                          title={
                            historical === null
                              ? "Sin mediana histórica"
                              : `Mediana: ${number(historical)} uds. · diferencia: ${number(value - historical)} uds.`
                          }
                        >
                          {number(value)}
                        </span>
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
