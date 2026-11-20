import { useMemo } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import {
  compare,
  dimensions,
  dimensionKeys,
  label,
  leadingBrands,
  money,
  months,
  number,
  percent,
  ratio,
  totals,
  type Dimension,
  type Movement,
} from "./model";
import { FiltersBar, FilterSelect } from "@/components/filters/FiltersBar";
import { Card } from "@/components/ui/card";
import { completePower, powerSpec } from "./power";
import "./tractores.css";

const root = "/mercado/tractores";
const titles = {
  ...dimensions,
  historia: "Historia",
  resumen: "Tablero",
};
type View = keyof typeof titles;
const next: Record<Dimension, Dimension[]> = {
  precios: ["marcas", "modelos", "importadores"],
  potencia: ["marcas", "modelos", "importadores"],
  marcas: ["modelos", "importadores"],
  modelos: ["importadores"],
  importadores: ["marcas", "modelos"],
};
const orderedBands: Partial<Record<Dimension, string[]>> = {
  potencia: [
    "Hasta 80 HP",
    "81–120 HP",
    "121–170 HP",
    "171–230 HP",
    "Más de 230 HP",
    "Sin potencia informada",
  ],
  precios: [
    "Menos de USD 25.000",
    "USD 25.000 a <50.000",
    "USD 50.000 a <100.000",
    "USD 100.000 a <150.000",
    "USD 150.000 o más",
  ],
};
function priceEligible(row: Movement) {
  return row[10] > 0 && label(row, "precios") !== "Sin FOB positivo";
}

function YearLegend({ year }: { year: number }) {
  return (
    <div className="market-legend">
      <span>
        <i className="market-year-prior" />
        {year - 1}
      </span>
      <span>
        <i className="market-year-current" />
        {year}
      </span>
    </div>
  );
}

export function TractorDashboard({ rows: data }: { rows: Movement[] }) {
  const rows = useMemo(() => completePower(data), [data]);
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const slug = location.pathname.split("/").filter(Boolean).at(-1) || "";
  const view: View = Object.prototype.hasOwnProperty.call(titles, slug)
    ? (slug as View)
    : "resumen";
  const years = useMemo(
    () => [...new Set(rows.map((r) => r[1]))].sort((a, b) => b - a),
    [rows],
  );
  const year = years.includes(Number(params.get("año")))
    ? Number(params.get("año"))
    : years[0];
  const maxMonth = rows.reduce(
    (m, r) => (r[1] === year ? Math.max(m, r[2]) : m),
    1,
  );
  const end = Math.min(
    maxMonth,
    Math.max(1, Number(params.get("hasta")) || maxMonth),
  );
  const state = params.get("estado") || "";
  const brand = params.get("marcas");
  const rankingDimension = brand ? "modelos" : "marcas";
  const active = dimensionKeys.filter((d) => params.has(d));
  const monthOnly = Number(params.get("mes"));
  const scoped = rows.filter(
    (r) =>
      r[2] <= end &&
      (!monthOnly || r[2] === monthOnly) &&
      (!state || r[8] === state) &&
      active.every((d) => label(r, d) === params.get(d)),
  );
  const current = scoped.filter((r) => r[1] === year),
    previous = scoped.filter((r) => r[1] === year - 1);
  const a = totals(previous),
    b = totals(current);
  function href(target: View, changes: Record<string, string | null> = {}) {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      if (v === null) p.delete(k);
      else p.set(k, v);
    }
    p.delete("buscar");
    p.delete("orden");
    const query = p.toString();
    return (
      root +
      (target === "resumen" ? "" : "/" + target) +
      (query ? "?" + query : "")
    );
  }
  function set(k: string, v: string) {
    const p = new URLSearchParams(params);
    if (v) p.set(k, v);
    else p.delete(k);
    if (k === "marcas") p.delete("modelos");
    setParams(p);
  }
  function drill(d: Dimension, value: string) {
    const target = next[d].find((k) => !active.includes(k));
    return target ? href(target, { [d]: value }) : null;
  }
  const nav = (target: View) => (
    <Link
      className={view === target ? "chosen" : ""}
      key={target}
      to={href(target)}
    >
      {titles[target]}
    </Link>
  );
  const ranking = compare(current, previous, (r) => label(r, rankingDimension));
  const leaders = brand ? ranking.slice(0, 7) : leadingBrands(ranking);
  const isClaas = (name: string) =>
    name === "CLAAS" || name.startsWith("CLAAS · ");
  const monthly = compare(current, previous, (r) => String(r[2])).sort(
    (a, b) => Number(a.name) - Number(b.name),
  );
  const monthlyMax = Math.max(1, ...monthly.flatMap((m) => [m.units, m.prior]));
  const targetStep = monthlyMax / 5;
  const tickMagnitude = 10 ** Math.floor(Math.log10(targetStep));
  const tickStep = Math.max(
    1,
    Math.ceil(
      ([1, 2, 2.5, 5, 10].find((step) => step * tickMagnitude >= targetStep) ??
        10) * tickMagnitude,
    ),
  );
  const tickCount = Math.ceil(monthlyMax / tickStep);
  const plotMax = tickStep * tickCount;
  const metric = (
    name: string,
    value: string,
    change: number | null,
    to: View,
  ) => {
    const delta = change !== null && Math.abs(change) < 0.0005 ? 0 : change;
    const trend =
      delta === null || delta === 0 ? "neutral" : delta > 0 ? "up" : "down";
    return (
      <Card className="market-metric">
        <Link to={href(to)}>
          <span>{name}</span>
          <strong>{value}</strong>
          <small className="market-metric-change" data-trend={trend}>
            {delta === null
              ? "Sin base anterior"
              : (delta > 0 ? "+" : "") + percent(delta) + " interanual"}
          </small>
        </Link>
      </Card>
    );
  };
  const annualChange = (now: number | null, old: number | null) =>
    now !== null && old ? now / old - 1 : null;
  const brandView = dimensionKeys.includes(view as Dimension)
    ? (view as Dimension)
    : null;
  const search = params.get("buscar") ?? "";
  const ordering = params.get("orden") || "unidades";
  let groups = brandView
    ? compare(
        brandView === "precios" ? current.filter(priceEligible) : current,
        brandView === "precios" ? previous.filter(priceEligible) : previous,
        (r) => label(r, brandView),
      )
    : [];
  if (brandView && orderedBands[brandView] && !params.has("orden")) {
    const order = orderedBands[brandView]!;
    groups = groups.sort(
      (x, y) => order.indexOf(x.name) - order.indexOf(y.name),
    );
  }
  if (ordering === "fob") groups.sort((x, y) => y.fob - x.fob);
  if (ordering === "precio")
    groups.sort((x, y) => (y.fob / y.units || 0) - (x.fob / x.units || 0));
  if (ordering === "nombre")
    groups.sort((x, y) => x.name.localeCompare(y.name, "es"));
  groups = groups.filter((g) =>
    g.name.toLowerCase().includes(search.toLowerCase()),
  );
  const history = years
    .filter((y) => rows.some((r) => r[1] === y && r[2] >= end))
    .map((y) => ({ year: y, ...totals(scoped.filter((r) => r[1] === y)) }));
  const options = (values: string[]) =>
    values.map((value) => ({ value, label: value }));
  return (
    <main className="market-tractors">
      <header className="market-heading">
        <h1>Tractores</h1>
        <span>Paraguay · Importaciones</span>
      </header>
      <FiltersBar
        activeCount={
          active.length +
          Number(Boolean(state)) +
          Number(Boolean(monthOnly)) +
          Number(params.has("año")) +
          Number(params.has("hasta"))
        }
        onClear={() => setParams({})}
        mobileContext={
          <span>
            {year} ·{" "}
            {monthOnly ? months[monthOnly - 1] : "Ene–" + months[end - 1]}
          </span>
        }
        search={
          brandView
            ? {
                value: search,
                onChange: (value) => set("buscar", value),
                placeholder: "Buscar en el detalle…",
              }
            : undefined
        }
      >
        {view === "resumen" && (
          <FilterSelect
            label="Marca"
            placeholder="Marca"
            value={brand ?? "todas"}
            onChange={(value) => set("marcas", value === "todas" ? "" : value)}
            options={[
              { value: "todas", label: "Todas" },
              ...options(
                [...new Set(rows.map((r) => r[3]).filter(Boolean))].sort(
                  (a, b) => a.localeCompare(b, "es"),
                ),
              ),
            ]}
          />
        )}
        <FilterSelect
          label="Año"
          placeholder="Año"
          width="w-[105px]"
          value={String(year)}
          onChange={(value) => set("año", value)}
          options={options(years.map(String))}
        />
        <FilterSelect
          label="Acumulado hasta"
          placeholder="Mes de corte"
          value={String(end)}
          onChange={(value) => set("hasta", value)}
          options={months
            .slice(0, maxMonth)
            .map((label, i) => ({ label, value: String(i + 1) }))}
        />
        <FilterSelect
          label="Estado"
          placeholder="Estado"
          value={state || "todos"}
          onChange={(value) => set("estado", value === "todos" ? "" : value)}
          options={[
            { value: "todos", label: "Todos" },
            ...options([...new Set(rows.map((r) => r[8]))].sort()),
          ]}
        />
        {brandView && (
          <FilterSelect
            label="Orden"
            placeholder="Orden"
            value={params.get("orden") || "normal"}
            onChange={(value) => set("orden", value === "normal" ? "" : value)}
            options={[
              { value: "normal", label: "Predeterminado" },
              { value: "unidades", label: "Unidades" },
              { value: "fob", label: "Valor FOB" },
              { value: "precio", label: "Precio medio" },
              { value: "nombre", label: "Nombre" },
            ]}
          />
        )}
      </FiltersBar>
      <nav aria-label="Secciones de tractores">
        {(["resumen", ...dimensionKeys, "historia"] as View[]).map(nav)}
      </nav>
      {active.length > 0 && (
        <div className="market-filters">
          {active.map((d) => (
            <Link
              key={d}
              title={"Quitar filtro " + dimensions[d]}
              to={href(view, { [d]: null })}
            >
              {dimensions[d]} · {params.get(d)?.replace("USD ", "$")} ×
            </Link>
          ))}
        </div>
      )}
      {!!monthOnly && (
        <div className="market-filters">
          <Link to={href(view, { mes: null })}>{months[monthOnly - 1]} ×</Link>
        </div>
      )}
      <section className="market-metrics">
        {metric(
          "Unidades importadas",
          number(b.units),
          annualChange(b.units, a.units),
          "historia",
        )}
        {metric(
          "Valor FOB",
          money(b.fob),
          annualChange(b.fob, a.fob),
          "marcas",
        )}
        {metric(
          "FOB medio por tractor",
          money(ratio(b.fob, b.units)),
          annualChange(ratio(b.fob, b.units), ratio(a.fob, a.units)),
          "precios",
        )}
      </section>
      {view === "resumen" && (
        <>
          <div className="market-panels">
            <Card className="market-panel">
              <h2>
                <Link to={href(rankingDimension)}>
                  {brand ? "Modelos principales" : "Participación por marca"}{" "}
                  <ChevronRight />
                </Link>
              </h2>
              <p>Cuota de unidades · {year}</p>
              {leaders.map((g) => (
                <Link
                  className={
                    "market-rank" + (isClaas(g.name) ? " market-claas" : "")
                  }
                  key={g.name}
                  to={drill(rankingDimension, g.name) ?? href(rankingDimension)}
                >
                  <span>
                    {brand
                      ? g.name.split(" · ").slice(1).join(" · ")
                      : g.name.replace("USD ", "$")}
                  </span>
                  <i>
                    <b
                      style={{
                        width: (b.units ? (g.units / b.units) * 100 : 0) + "%",
                      }}
                    />
                  </i>
                  <strong>{percent(ratio(g.units, b.units))}</strong>
                </Link>
              ))}
              {!leaders.length && <p>Sin movimientos en este período.</p>}
            </Card>
            <Card className="market-panel">
              <h2>
                <Link to={href("historia")}>
                  Evolución mensual <ChevronRight />
                </Link>
              </h2>
              <p>
                Unidades · {year - 1} y {year}
              </p>
              <div className="market-month-window">
                <div className="market-month-plot">
                  <div className="market-grid" aria-hidden="true">
                    {Array.from(
                      { length: tickCount + 1 },
                      (_, i) => (tickCount - i) * tickStep,
                    ).map((tick) => (
                      <div key={tick}>
                        <span>{number(tick)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="market-months">
                    {monthly.map((m) => {
                      const month = months[Number(m.name) - 1];
                      const description =
                        month +
                        " · " +
                        (year - 1) +
                        ": " +
                        number(m.prior) +
                        " · " +
                        year +
                        ": " +
                        number(m.units);
                      return (
                        <Link
                          key={m.name}
                          to={href("marcas", { mes: m.name })}
                          aria-label={description}
                          title={description}
                        >
                          <div className="market-month-bars">
                            <div
                              aria-hidden="true"
                              className="market-month-bar market-year-prior"
                              style={{
                                height: (m.prior / plotMax) * 100 + "%",
                              }}
                            />
                            <div
                              aria-hidden="true"
                              className="market-month-bar market-year-current"
                              style={{
                                height: (m.units / plotMax) * 100 + "%",
                              }}
                            >
                              <strong>{number(m.units)}</strong>
                            </div>
                          </div>
                          <small>{month}</small>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              </div>
              <YearLegend year={year} />
            </Card>
            {(["potencia", "precios"] as const).map((d) => {
              const chart = compare(
                d === "precios" ? current.filter(priceEligible) : current,
                d === "precios" ? previous.filter(priceEligible) : previous,
                (r) => label(r, d),
              );
              const order = orderedBands[d]!;
              chart.sort(
                (x, y) => order.indexOf(x.name) - order.indexOf(y.name),
              );
              const max = Math.max(
                1,
                ...chart.flatMap((g) => [g.units, g.prior]),
              );
              return (
                <Card className="market-panel" key={d}>
                  <h2>
                    <Link to={href(d)}>
                      {d === "potencia"
                        ? "Tractores por potencia"
                        : "Distribución por precio FOB"}
                      <ChevronRight />
                    </Link>
                  </h2>
                  <p>
                    Unidades · {year - 1} y {year}
                  </p>
                  {chart.map((g) => (
                    <Link
                      key={g.name}
                      className="market-rank market-band"
                      title={
                        year -
                        1 +
                        ": " +
                        number(g.prior) +
                        " · " +
                        year +
                        ": " +
                        number(g.units)
                      }
                      to={drill(d, g.name) ?? href(d)}
                    >
                      <span>{g.name.replace("USD ", "$")}</span>
                      <i className="market-paired">
                        <b style={{ width: (g.prior / max) * 100 + "%" }} />
                        <b style={{ width: (g.units / max) * 100 + "%" }} />
                      </i>
                      <strong>{number(g.units)}</strong>
                    </Link>
                  ))}
                  {chart.length ? (
                    <YearLegend year={year} />
                  ) : (
                    <p>Sin datos en este período.</p>
                  )}
                </Card>
              );
            })}
          </div>
        </>
      )}
      {brandView && (
        <Card className="market-panel">
          <h2>{titles[view]}</h2>
          <div
            className="market-scroll"
            tabIndex={0}
            role="region"
            aria-label="Tabla desplazable"
          >
            <table>
              <thead>
                <tr>
                  {[
                    titles[view],
                    ...(brandView === "modelos" ? ["HP de ficha"] : []),
                    "Uds. " + (year - 1),
                    "Uds. " + year,
                    "Cuota uds.",
                    "Δ cuota (pp)",
                    "Valor FOB",
                    "Cuota FOB",
                    "$/tractor " + (year - 1),
                    "$/tractor " + year,
                  ].map((t) => (
                    <th key={t}>{t}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => {
                  const detail = drill(brandView, g.name);
                  const [modelBrand, model] = g.name.split(" · ");
                  const spec =
                    brandView === "modelos" && model
                      ? powerSpec(modelBrand, model)
                      : undefined;
                  return (
                    <tr
                      key={g.name}
                      className={isClaas(g.name) ? "market-claas" : undefined}
                    >
                      <th>
                        {detail ? (
                          <Link to={detail}>
                            {g.name.replace("USD ", "$")} ›
                          </Link>
                        ) : (
                          g.name.replace("USD ", "$")
                        )}
                      </th>
                      {brandView === "modelos" && (
                        <td>
                          {spec ? (
                            <a
                              href={spec.source}
                              target="_blank"
                              rel="noreferrer"
                              title="Ficha del fabricante"
                            >
                              {spec.hp}
                            </a>
                          ) : (
                            "—"
                          )}
                        </td>
                      )}
                      <td>{number(g.prior)}</td>
                      <td>{number(g.units)}</td>
                      <td>{percent(ratio(g.units, b.units))}</td>
                      <td>
                        {a.units && b.units
                          ? (
                              (g.units / b.units - g.prior / a.units) *
                              100
                            ).toLocaleString("de-DE", {
                              maximumFractionDigits: 1,
                            })
                          : "—"}
                      </td>
                      <td>{money(g.fob)}</td>
                      <td>{percent(ratio(g.fob, b.fob))}</td>
                      <td>{money(ratio(g.priorFob, g.prior))}</td>
                      <td>{money(ratio(g.fob, g.units))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      {view === "historia" && (
        <Card className="market-panel">
          <h2>Historia · Ene–{months[end - 1]}</h2>
          <div
            className="market-scroll"
            tabIndex={0}
            role="region"
            aria-label="Tabla desplazable"
          >
            <table>
              <thead>
                <tr>
                  {[
                    "Año",
                    "Unidades",
                    "Variación interanual",
                    "Valor FOB",
                    "FOB medio por tractor",
                  ].map((t) => (
                    <th key={t}>{t}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {history.map((r, i) => (
                  <tr key={r.year}>
                    <th>
                      <Link
                        to={href("marcas", {
                          año: String(r.year),
                          hasta: String(end),
                        })}
                      >
                        {r.year} ›
                      </Link>
                    </th>
                    <td>{number(r.units)}</td>
                    <td>
                      {history[i + 1]?.units
                        ? percent(r.units / history[i + 1].units - 1)
                        : "—"}
                    </td>
                    <td>{money(r.fob)}</td>
                    <td>{money(ratio(r.fob, r.units))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </main>
  );
}
