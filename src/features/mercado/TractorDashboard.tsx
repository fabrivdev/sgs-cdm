import { useMemo } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import {
  compare,
  dimensions,
  dimensionKeys,
  harvestClasses,
  harvestPriceBands,
  label,
  leadingBrands,
  money,
  months,
  number,
  percent,
  pricedAverage,
  ratio,
  totals,
  unknownHarvestClass,
  type Dimension,
  type Movement,
} from "./model";
import { FiltersBar, FilterSelect } from "@/components/filters/FiltersBar";
import { Card } from "@/components/ui/card";
import { PageHeader, PageShell } from "@/components/layout/AppPrimitives";
import { completePower, powerSpec } from "./power";
import { TractorAnalysis } from "./TractorAnalysis";
import "./tractores.css";

const tractorTitles = {
  ...dimensions,
  historia: "Historia",
  resumen: "Tablero",
};
type View = keyof typeof tractorTitles;
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

const harvesterTitles = { ...tractorTitles, potencia: "Clases" };
const harvesterBands = {
  potencia: [...harvestClasses, unknownHarvestClass],
  precios: harvestPriceBands,
};

export function TractorDashboard({
  rows: data,
  harvester = false,
}: {
  rows: Movement[];
  harvester?: boolean;
}) {
  const rows = useMemo(
    () => (harvester ? data : completePower(data)),
    [data, harvester],
  );
  const machine = harvester ? "cosechadora" : "tractor";
  const root = harvester ? "/mercado/cosechadoras" : "/mercado/tractores";
  const titles = harvester ? harvesterTitles : tractorTitles;
  const bands = harvester ? harvesterBands : orderedBands;
  const routeKey = (key: string) =>
    harvester && key === "potencia" ? "clases" : key;
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const slug = location.pathname.split("/").filter(Boolean).at(-1) || "";
  const view =
    (Object.keys(titles) as View[]).find((key) => routeKey(key) === slug) ??
    "resumen";
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
  const active = dimensionKeys.filter((d) => params.has(routeKey(d)));
  const monthOnly = Number(params.get("mes"));
  const accumulatedScope = rows.filter(
    (r) =>
      r[2] <= end &&
      (!state || r[8] === state) &&
      active.every((d) => label(r, d) === params.get(routeKey(d))),
  );
  const scoped = monthOnly
    ? accumulatedScope.filter((r) => r[2] === monthOnly)
    : accumulatedScope;
  const current = scoped.filter((r) => r[1] === year),
    previous = scoped.filter((r) => r[1] === year - 1);
  const a = totals(previous),
    b = totals(current);
  function href(target: View, changes: Record<string, string | null> = {}) {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      if (v === null) p.delete(routeKey(k));
      else p.set(routeKey(k), v);
    }
    p.delete("buscar");
    p.delete("orden");
    const query = p.toString();
    return (
      root +
      (target === "resumen" ? "" : "/" + routeKey(target)) +
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
      aria-current={view === target ? "page" : undefined}
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
  if (brandView && bands[brandView] && !params.has("orden")) {
    const order = bands[brandView]!;
    groups = groups.sort(
      (x, y) => order.indexOf(x.name) - order.indexOf(y.name),
    );
  }
  const pricedGroups =
    harvester && brandView
      ? new Map(
          compare(
            current.filter(priceEligible),
            previous.filter(priceEligible),
            (row) => label(row, brandView),
          ).map((g) => [g.name, g]),
        )
      : null;
  const currentAverage = (group: (typeof groups)[number]) => {
    const priced = pricedGroups ? pricedGroups.get(group.name) : group;
    return priced ? ratio(priced.fob, priced.units) : null;
  };
  if (ordering === "fob") groups.sort((x, y) => y.fob - x.fob);
  if (ordering === "precio")
    groups.sort((x, y) => (currentAverage(y) ?? 0) - (currentAverage(x) ?? 0));
  if (ordering === "nombre")
    groups.sort((x, y) => x.name.localeCompare(y.name, "es"));
  groups = groups.filter((g) =>
    g.name.toLowerCase().includes(search.toLowerCase()),
  );
  const history = years
    .filter((y) => rows.some((r) => r[1] === y && r[2] >= end))
    .map((y) => {
      const period = scoped.filter((r) => r[1] === y);
      return {
        year: y,
        ...totals(period),
        average: harvester ? pricedAverage(period) : undefined,
      };
    });
  const options = (values: string[]) =>
    values.map((value) => ({ value, label: value }));
  return (
    <PageShell className="market-tractors">
      <PageHeader
        title={harvester ? "Cosechadoras" : "Tractores"}
        titleAccessory={
          <span className="text-xs text-muted-foreground">
            {harvester
              ? "Paraguay · Cosechadoras de granos"
              : "Paraguay · Importaciones"}
          </span>
        }
        tabs={
          <nav
            className="market-tabs"
            aria-label={
              harvester ? "Secciones de cosechadoras" : "Secciones de tractores"
            }
          >
            {(["resumen", ...dimensionKeys, "historia"] as View[]).map(nav)}
          </nav>
        }
      />
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
      {active.length > 0 && (
        <div className="market-filters">
          {active.map((d) => (
            <Link
              key={d}
              title={"Quitar filtro " + titles[d]}
              to={href(view, { [d]: null })}
            >
              {titles[d]} · {params.get(routeKey(d))?.replace("USD ", "$")} ×
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
          "FOB medio por " + machine,
          money(harvester ? pricedAverage(current) : ratio(b.fob, b.units)),
          annualChange(
            harvester ? pricedAverage(current) : ratio(b.fob, b.units),
            harvester ? pricedAverage(previous) : ratio(a.fob, a.units),
          ),
          "precios",
        )}
      </section>
      {view === "resumen" && (
        <>
          <div className="market-panels">
            <Card className="market-panel">
              <h2>
                {brand ? "Participación por modelo" : "Participación por marca"}
              </h2>
              {leaders.map((g) => (
                <div
                  className={
                    "market-rank" + (isClaas(g.name) ? " market-claas" : "")
                  }
                  key={g.name}
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
                </div>
              ))}
              {!leaders.length && <p>Sin movimientos en este período.</p>}
            </Card>
            <Card className="market-panel">
              <h2>Unidades por mes</h2>
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
                        <div
                          key={m.name}
                          role="img"
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
                        </div>
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
              const order = bands[d]!;
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
                    {d === "potencia"
                      ? harvester
                        ? "Unidades por clase"
                        : "Unidades por potencia"
                      : "Unidades por tramo FOB"}
                  </h2>
                  {chart.map((g) => (
                    <div
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
                    >
                      <span>{g.name.replace("USD ", "$")}</span>
                      <i className="market-paired">
                        <b style={{ width: (g.prior / max) * 100 + "%" }} />
                        <b style={{ width: (g.units / max) * 100 + "%" }} />
                      </i>
                      <strong>{number(g.units)}</strong>
                    </div>
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
          <TractorAnalysis
            current={current}
            previous={previous}
            rows={rows}
            scoped={scoped}
            accumulatedScope={accumulatedScope}
            year={year}
            end={end}
            month={monthOnly}
            harvester={harvester}
          />
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
                    ...(brandView === "modelos" && !harvester
                      ? ["HP de ficha"]
                      : []),
                    "Uds. " + (year - 1),
                    "Uds. " + year,
                    "Cuota uds.",
                    "Δ cuota (pp)",
                    "Valor FOB",
                    "Cuota FOB",
                    "$/" + machine + " " + (year - 1),
                    "$/" + machine + " " + year,
                  ].map((t) => (
                    <th key={t}>{t}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => {
                  const detail = drill(brandView, g.name);
                  const priced = pricedGroups ? pricedGroups.get(g.name) : g;
                  const [modelBrand, model] = g.name.split(" · ");
                  const spec =
                    brandView === "modelos" && !harvester && model
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
                      {brandView === "modelos" && !harvester && (
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
                      <td>
                        {money(
                          priced ? ratio(priced.priorFob, priced.prior) : null,
                        )}
                      </td>
                      <td>{money(currentAverage(g))}</td>
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
                    "FOB medio por " + machine,
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
                      {history[i + 1]?.units &&
                      (!harvester || history[i + 1].year === r.year - 1)
                        ? percent(r.units / history[i + 1].units - 1)
                        : "—"}
                    </td>
                    <td>{money(r.fob)}</td>
                    <td>
                      {money(
                        harvester ? (r.average ?? null) : ratio(r.fob, r.units),
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </PageShell>
  );
}
