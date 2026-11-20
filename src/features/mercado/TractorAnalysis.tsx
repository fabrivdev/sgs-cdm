import { useState } from "react";
import { Link } from "react-router-dom";
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
  const peak = Math.max(1, ...groups.map((group) => group.units));
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
                  <th scope="row">
                    <Link to={href("marcas", { potencia: group.name })}>
                      {group.name} ›
                    </Link>
                  </th>
                  <td
                    className="market-opportunity-volume"
                    title={`${year - 1}: ${number(group.prior)} unidades`}
                  >
                    <span>{number(group.units)}</span>
                    <i
                      aria-hidden="true"
                      style={{ width: (group.units / peak) * 100 + "%" }}
                    />
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

function ModelPosition({ current, year, href }: Omit<Period, "previous">) {
  const states = [...new Set(current.map((row) => row[8]))];
  const [preferred, setPreferred] = useState("NUEVO");
  const state = states.includes(preferred)
    ? preferred
    : (states[0] ?? preferred);
  const { points, covered, priced } = positioning(current, state);
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
        to={href("modelos")}
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
                    <Link
                      className="market-range-point"
                      key={point.model}
                      style={{ left: scale(point.price) }}
                      title={`${point.model} · ${money(point.price)} · ${number(point.units)} uds.`}
                      aria-label={`${point.model} · ${money(point.price)} · ${number(point.units)} uds.`}
                      to={href("importadores", {
                        modelos: point.model,
                        potencia: band,
                        estado: state,
                      })}
                    />
                  ))}
                </div>
                <div className="market-range-values">
                  {median !== null && <span>Mediana {money(median)}</span>}
                  {claasModels.map((point) => (
                    <Link
                      key={point.model}
                      to={href("importadores", {
                        modelos: point.model,
                        potencia: band,
                        estado: state,
                      })}
                    >
                      {point.model.replace("CLAAS · ", "")} ·{" "}
                      {money(point.price)} · {number(point.units)} uds.
                    </Link>
                  ))}
                </div>
              </div>
            ))}
            <div className="market-range-axis">
              <span>$0</span>
              <span>{money(limit / 2)}</span>
              <span>{money(limit)}</span>
            </div>
          </div>
          <p className="market-analysis-note">
            La franja gris va del menor al mayor FOB medio por modelo.{" "}
            {number(covered)} de {number(priced)} unidades con FOB tienen modelo
            y HP.
          </p>
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

function FobBridge({ current, previous, year, href }: Period) {
  const bridge = priceBridge(current, previous);
  const effects = bridge?.steps.length
    ? [
        {
          name: "Modelos sin comparación",
          description: "Aparecen en un solo período o faltan datos",
          delta:
            bridge.steps[0].to -
            bridge.steps[0].from +
            (bridge.steps[3].to - bridge.steps[3].from),
        },
        {
          name: "Mezcla de modelos comparables",
          description: "Cambios en las unidades de los mismos modelos",
          delta: bridge.steps[1].to - bridge.steps[1].from,
        },
        {
          name: "FOB de los mismos modelos",
          description: "Variación dentro de cada modelo comparable",
          delta: bridge.steps[2].to - bridge.steps[2].from,
        },
      ]
    : [];
  const max = Math.max(1, ...effects.map((effect) => Math.abs(effect.delta)));
  const change = bridge ? bridge.after - bridge.before : 0;
  return (
    <Card className="market-panel">
      <Heading
        title="Qué cambió el FOB por tractor"
        detail="Comparación interanual de unidades con FOB informado"
        to={href("precios")}
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
            <div>
              <span>Cambio por tractor</span>
              <strong>{signedMoney(change)}</strong>
              <small>{percent(change / bridge.before)}</small>
            </div>
          </div>
          {effects.length ? (
            <>
              <div className="market-effect-axis">
                <div>
                  <span>Redujo</span>
                  <span>Aumentó</span>
                </div>
              </div>
              <ul className="market-effect-list">
                {effects.map((effect) => (
                  <li key={effect.name}>
                    <div>
                      <strong>{effect.name}</strong>
                      <small>{effect.description}</small>
                    </div>
                    <div className="market-effect-track" aria-hidden="true">
                      <i
                        style={{
                          left:
                            effect.delta < 0
                              ? 50 - (Math.abs(effect.delta) / max) * 50 + "%"
                              : "50%",
                          width: (Math.abs(effect.delta) / max) * 50 + "%",
                        }}
                        data-direction={effect.delta < 0 ? "down" : "up"}
                      />
                    </div>
                    <strong className="market-effect-value">
                      {signedMoney(effect.delta)}
                    </strong>
                  </li>
                ))}
              </ul>
              <p className="market-analysis-note">
                Para aislar mezcla y FOB, se comparan marca, modelo y estado.
                Unidades comparables: {number(bridge.coverage.priorUnits)}/
                {number(bridge.coverage.priorTotal)} en {year - 1} y{" "}
                {number(bridge.coverage.recentUnits)}/
                {number(bridge.coverage.recentTotal)} en {year}.
              </p>
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

function ImporterConcentration({
  current,
  year,
  href,
}: Omit<Period, "previous">) {
  const groups = compare(current, [], (row) => label(row, "importadores"));
  const identified = groups.filter(
    (group) =>
      !["", "sin identificar", "sin datos", "no informado", "n/d"].includes(
        group.name.trim().toLowerCase(),
      ),
  );
  const knownUnits = identified.reduce((sum, group) => sum + group.units, 0);
  const total = totals(current).units;
  const heads = identified.slice(0, 7);
  const rest = knownUnits - heads.reduce((sum, group) => sum + group.units, 0);
  const leaders = heads.slice(0, 3);
  const leaderUnits = leaders.reduce((sum, row) => sum + row.units, 0);
  const displayed = [
    ...heads.map((row) => ({ name: row.name, units: row.units, other: false })),
    ...(rest ? [{ name: "Otros importadores", units: rest, other: true }] : []),
  ];
  return (
    <Card className="market-panel">
      <Heading
        title="Quiénes concentran las importaciones"
        detail={`Unidades por importador identificado · ${year}`}
        to={href("importadores")}
      />
      {displayed.length ? (
        <>
          <div className="market-importer-summary">
            <strong>{percent(ratio(leaderUnits, knownUnits))}</strong>
            <span>
              en{" "}
              {leaders.length === 1
                ? "el principal importador"
                : `los ${leaders.length} principales importadores`}
            </span>
          </div>
          <ul className="market-importer-list">
            {displayed.map((row, index) => {
              const content = (
                <>
                  <span className="market-importer-name">{row.name}</span>
                  <span className="market-importer-value">
                    <strong>{number(row.units)}</strong> uds. ·{" "}
                    {percent(ratio(row.units, knownUnits))}
                  </span>
                </>
              );
              return (
                <li
                  key={row.name}
                  data-other={row.other || undefined}
                  data-leading={index < leaders.length || undefined}
                >
                  <div className="market-importer-line">
                    {row.other ? (
                      <div>{content}</div>
                    ) : (
                      <Link to={href("marcas", { importadores: row.name })}>
                        {content}
                      </Link>
                    )}
                  </div>
                  <div className="market-importer-track" aria-hidden="true">
                    <i
                      style={{ width: (row.units / knownUnits) * 100 + "%" }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="market-analysis-note">
            Cuota sobre {number(knownUnits)} unidades con importador
            identificado. {number(total - knownUnits)} sin identificar.
          </p>
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
