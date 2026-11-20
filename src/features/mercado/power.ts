import type { Movement } from "./model";

const missing = "Sin potencia informada";
const modelKey = (brand: string, model: string) =>
  brand.trim().toUpperCase() +
  ":" +
  model.toUpperCase().replace(/[^A-Z0-9]/g, "");

const specs = [
  [
    "JOHN DEERE",
    { "6403": 109 },
    "https://www.deere.com/assets/pdfs/region-3/products/tractors/a142mx1123-tractors-serie-6003.pdf",
  ],
  [
    "CASE IH",
    { JX75T: 75 },
    "https://www.caseih.com/en/africamiddleeast/case-ih-world/news/case-ih-donates-tractor-to-support-rural-communities-in-angola",
  ],
  [
    "NEW HOLLAND",
    { T6110: 118 },
    "https://assets.cnhindustrial.com/nhag/lar/pt-br/Documents/Folheto-tecnico-newholland-agriculture-tratores-T6.pdf",
  ],
  [
    "JOHN DEERE",
    { "7M200": 200, "7M230": 230, "6135J": 135 },
    "https://www.deere.com/latin-america/es/tractores/tractores-medianos/7200j-200hp/",
  ],
  [
    "JOHN DEERE",
    { "8400R": 400 },
    "https://www.deere.com/assets/pdfs/region-4/industries/government-and-military-sales/contracts/price-pages/agricultural/A2_afnaf_20181119.pdf",
  ],
  [
    "CASE IH",
    { FARMALL90: 90, FARMALL100: 101 },
    "https://www.caseih.com/pt-br/brasil/produtos/tratores/farmall",
  ],
  [
    "MASSEY FERGUSON",
    { MF3780: 80 },
    "https://www.masseyferguson.com/en_afr/product/tractors/mf-3700-series.html",
  ],
  [
    "MASSEY FERGUSON",
    {
      MF5M115: 115,
      MF5M115C: 115,
      MF5M115NC: 115,
      MF5M135: 135,
      MF5M135C: 135,
      MF5M135NC: 135,
    },
    "https://www.masseyferguson.com/content/dam/public/masseyfergusonglobal/markets/en_us/assets/product-brochures/tractors/mf-5m/MF25SST004FC_5M%20series%20SST_8-5x11_LR.pdf",
  ],
  [
    "MASSEY FERGUSON",
    { MF7S155: 155, MF7S180: 180 },
    "https://www.masseyferguson.com/content/masseyfergusonglobal/en_us/products/tractors/high-horse-power/mf-7s.html",
  ],
  [
    "FARMTRAC",
    { FT6075: 75, FT6090: 88 },
    "https://exports.escortskubota.com/oceania/farmtrac/utility/heritage/high",
  ],
  [
    "CLAAS",
    { AXION870: 270 },
    "https://www.claas.com/caas/v1/media/1107256/data/484b846cc41760e11976a4748cf6a1ac",
  ],
  [
    "DEUTZ FAHR",
    { AGROPLUSF804: 75 },
    "https://www.deutz-fahr.com/media/5525_5361_308.8564.3.4-3_AgroplusF_Keyline_EN_1.pdf",
  ],
  ["LOVOL", { TB604: 60 }, "https://lovolglobal.com/shop/tractor-tb604"],
  ["LOVOL", { TD1304: 130 }, "https://lovolglobal.com/shop/tractor-td1304"],
  [
    "LOVOL",
    { TR2204: 220 },
    "https://lovolglobal.com/blog/news-2/spotlight-on-25-star-models-at-sdhi-weichai-power-global-partners-conference-45",
  ],
] as const;

const catalog = new Map(
  specs.flatMap(([brand, models, source]) =>
    Object.entries(models).map(
      ([model, hp]) => [modelKey(brand, model), { hp, source }] as const,
    ),
  ),
);
export const powerSpec = (brand: string, model: string) =>
  catalog.get(modelKey(brand, model));
export function tractorPowerBand(hp: number) {
  if (hp <= 80) return "Hasta 80 HP";
  if (hp <= 120) return "81–120 HP";
  if (hp <= 170) return "121–170 HP";
  if (hp <= 230) return "171–230 HP";
  return "Más de 230 HP";
}

export function completePower(rows: Movement[]): Movement[] {
  const known = new Map<string, Set<string>>();
  for (const [, , , brand, model, power] of rows) {
    if (power === missing || model === "Sin identificar") continue;
    const key = modelKey(brand, model);
    const bands = known.get(key) ?? new Set<string>();
    bands.add(power);
    known.set(key, bands);
  }
  return rows.map((row) => {
    const [, , , brand, model, power] = row;
    if (power !== missing || model === "Sin identificar") return row;
    const spec = powerSpec(brand, model);
    const observed = known.get(modelKey(brand, model));
    const inferred = spec
      ? tractorPowerBand(spec.hp)
      : observed?.size === 1
        ? [...observed][0]
        : null;
    if (!inferred) return row;
    const enriched: Movement = [...row];
    enriched[5] = inferred;
    return enriched;
  });
}
