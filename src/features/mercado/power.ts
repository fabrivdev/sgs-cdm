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
    "JOHN DEERE",
    { "6803": 133 },
    "https://www.deere.com/latin-america/es/tractores/tractores-medianos/6803-133hp/",
  ],
  [
    "JOHN DEERE",
    { "2038R": 37.3 },
    "https://www.deere.com/latin-america/es/tractores/utilitarios-compactos/2038r/",
  ],
  [
    "JOHN DEERE",
    { "5090E": 90 },
    "https://www.deere.com/latin-america/es/tractores/tractores-utilitarios/5090e-90hp/",
  ],
  [
    "JOHN DEERE",
    { "8245": 245, "8245R": 245 },
    "https://www.deere.com/latin-america/es/tractores/tractores-grandes/8245r-245hp/",
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
    "NEW HOLLAND",
    { "T9.470": 425 },
    "https://agriculture.newholland.com/en-au/oceania/products/tractors-telehandlers/new-t9-with-plm-intelligence",
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
    "CASE IH",
    { "FARMALL JXM 75": 75, "FARMALL JXM 90": 90 },
    "https://www.caseih.com/en-nz/newzealand/products/tractors/farmall-series/farmall-jxm",
  ],
  [
    "CASE IH",
    { MAGNUM355: 355 },
    "https://www.caseih.com/en-us/unitedstates/products/tractors/magnum-series/magnum-355",
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
    "MASSEY FERGUSON",
    { MF8S285: 285 },
    "https://www.masseyferguson.com/en/product/tractors/mf-8s.html",
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
    "CLAAS",
    { AXION950: 410 },
    "https://www.claas.com/es-cl/maquinas-agricolas/tractores/axion-900-lrc",
  ],
  [
    "DEUTZ FAHR",
    { AGROPLUSF804: 75 },
    "https://www.deutz-fahr.com/media/5525_5361_308.8564.3.4-3_AgroplusF_Keyline_EN_1.pdf",
  ],
  [
    "DEUTZ FAHR",
    { AGROFARM5095: 97, "AGROFARM 5105 LS E3": 106, "AGROFARM 5125 GS LRC": 126 },
    "https://www.deutz-fahr.com/media/308.8923.4.4-0_Serie_Agrofarm_5_LRC_ES.pdf",
  ],
  [
    "DEUTZ FAHR",
    { "EXPLORER 105 LS E3": 106 },
    "https://www.same-tractors.com/media/308.9025.4.1-0_Explorer_Stage_I_Stage_IIIA_ES_low.pdf",
  ],
  [
    "DEUTZ FAHR",
    { AGROLUX480: 80 },
    "https://www.deutz-fahr.com/media/308.9019.3.4-0_Agrolux_Stage_I_-_Stage_II_-_Stage_IIIA_EN.pdf",
  ],
  [
    "LANDINI",
    { SUPER110: 102 },
    "https://www.landini.it/wp-content/uploads/2025/09/LA_TractorRange2025_LRC_Brochure_56p_6737504A1_Web_EN.pdf",
  ],
  [
    "LANDINI",
    { "7-230": 205 },
    "https://www.landini.it/wp-content/uploads/2019/02/7-Series_ENG_2019-OK-3.pdf",
  ],
  [
    "LANDINI",
    { "LANDFORCE 130": 120.7 },
    "https://maquinac.com/wp-content/uploads/2018/03/Tractores-Landini-Serie-Landforce-Folleto.pdf",
  ],
  [
    "LS",
    { PLUSP90: 93 },
    "https://lstractor.com.br/produto/serie-plus/",
  ],
  [
    "LS",
    { MT790: 93, MT790F: 93 },
    "https://lstractor.com.br/wp-content/uploads/2024/04/Folheto_Serie_MT7.pdf",
  ],
  [
    "VALTRA",
    { A134H: 135 },
    "https://www.valtra.com.br/produtos/tratores/serie-a4-hitech.html",
  ],
  [
    "VALTRA",
    { BH205: 210, BH205I: 210 },
    "https://agromazzuchelli.com/images/uploads/54806e0f05864.pdf",
  ],
  [
    "VOLVO",
    { T650: 74.9 },
    "https://www.solhem9.se/broschyrbank_lantbruk/Volvo_BM_T650.pdf",
  ],
  [
    "TDER",
    { TE704: 70 },
    "https://www.tiderchina.com/product/agricultural-machinery/tractor/TE70-2.html",
  ],
  [
    "TDER",
    { TE604: 60 },
    "https://www.tiderchina.com/cn/product1/agricultural-machinery/tractor/TE60-1.html",
  ],
  [
    "TDER",
    { TE404: 40 },
    "https://www.tiderchina.com/product/agricultural-machinery/tractor/TE40-2.html",
  ],
  [
    "ALLPHA",
    { AP804: 80 },
    "https://www.allphah.com/article/read/57.html",
  ],
  [
    "YTO",
    { "YTO-E1954": 193.1 },
    "https://cdn.carguide.com.cn/syqc/1577776112209515.pdf",
  ],
  [
    "YTO",
    { NLY1154: 114.3 },
    "https://ytocorp.com/5-5-3-97-115hp-tractor-nlx-nly-series.html",
  ],
  [
    "LUTONG",
    { LTB904: 88.8 },
    "https://www.lylutong.com.cn/product-details/ltb904-tractor-ltb904-tractor/",
  ],
  [
    "QILU",
    { "QL-704E": 70 },
    "https://qilutractor.com/product/ql704e/",
  ],
  [
    "SOLIS",
    { "WT 125-4WD": 125 },
    "https://www.diskubota.com/wp-content/uploads/2024/05/FT-Sonalika-125-.pdf",
  ],
  [
    "MULLER",
    { TM14: 152.9 },
    "https://www.scribd.com/document/675913000/Muller-TM-14",
  ],
  [
    "ZOOMLION",
    { "RN904-1": 88.5 },
    "https://es.made-in-china.com/co_zoomlion/product_High-Strength-Wearing-Resistant-Medium-Farm-Tractors-with-CE-Certificate_hyenneiyn.html",
  ],
  [
    "ZOOMLION",
    { "RN1104-1": 110 },
    "https://zoomlion.do/index.php/productos/maquinarias-agricolas/rn1104",
  ],
  ["LOVOL", { TB604: 60 }, "https://lovolglobal.com/shop/tractor-tb604"],
  ["LOVOL", { TD1304: 130 }, "https://lovolglobal.com/shop/tractor-td1304"],
  ["LOVOL", { TR1504: 150 }, "https://lovolglobal.com/shop/tractor-tr1504"],
  ["LOVOL", { TD1504: 150 }, "https://wwcm.com.au/product/td1504-tractor/"],
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

const sourceModels = new Map<string, { model: string; pattern: RegExp }[]>();
for (const [brand, models] of specs) {
  const matchers = sourceModels.get(brand) ?? [];
  for (const model of Object.keys(models)) {
    const spelling = model.match(/[A-Z]+|\d+/g)?.join("[ ./-]*");
    matchers.push({
      model,
      pattern: new RegExp(`\\b(?:(?:MODELO|MOD|MODEL)[ .:-]*)?${spelling}(?![A-Z0-9]|[-/.]\\w)`),
    });
  }
  sourceModels.set(brand, matchers);
}

export function findTractorPowerModel(brand: string, description: string) {
  const models = (sourceModels.get(brand) ?? []).filter(({ pattern }) =>
    pattern.test(description),
  );
  return models.length === 1 ? models[0].model : undefined;
}

const tariffLimit = /\b(?:SUPERIOR\s+A|INFERIOR\s+(?:O\s+IGUAL\s+)?A)\s*(\d{1,3})\s*KW\b/g;
// Both NCM ranges fall entirely in the first dashboard band.
const tariffCeiling = new Map([["870191", 18], ["870192", 37]]);

export function sourceTractorPowerBand(description: string, ncm: string, modelHp?: number) {
  const limits = [...description.matchAll(tariffLimit)].map((match) => Number(match[1]));
  const equipment = description.replace(tariffLimit, "");
  const bands = new Set<string>();
  for (const [, value, unit] of equipment.matchAll(/\b(\d{2,3}(?:[.,]\d+)?)\s*(HP|CV|KW)\b/g)) {
    const hp = Number(value.replace(",", ".")) *
      (unit === "KW" ? 1.341 : unit === "CV" ? 0.9863 : 1);
    if (hp >= 10 && hp < 1_000) bands.add(tractorPowerBand(hp));
  }
  if (bands.size === 1) return [...bands][0];
  if (modelHp !== undefined) return tractorPowerBand(modelHp);
  const ceiling = tariffCeiling.get(ncm.slice(0, 6));
  if (!bands.size && ceiling && !/\b(?:DESMONTAD[OA]|MICRO\s?TRACTO\w*)\b/.test(description) &&
    limits.every((limit) => limit <= ceiling))
    return tractorPowerBand(ceiling * 1.341);
  return undefined;
}

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
