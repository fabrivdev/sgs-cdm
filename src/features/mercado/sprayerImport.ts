import {
  sprayerBoomBand,
  sprayerPowerBand,
  sprayerPriceBand,
  sprayerTankBand,
  unknownSprayerBoom,
  unknownSprayerPower,
} from "./marketFamily";
import { parseMovements, type Movement, type EquipmentMovement } from "./model";
import {
  monthIndex,
  readSourceWorkbook,
  sourceText,
  sourceUpper,
  type MarketUpload,
  type SourceFile,
  type SourceRow,
} from "./penta";

const unknown = "Sin identificar";
const brandAliases: Record<string, string> = {
  "JHON DEERE": "JOHN DEERE",
  "JOHN DEER": "JOHN DEERE",
  "MASSEY FERGUSSON": "MASSEY FERGUSON",
  CASE: "CASE IH",
  HORSH: "HORSCH",
};
const modelPatterns: Record<string, RegExp> = {
  JACTO: /\bUNIPORT\s*\d{4}(?:\s+(?:PLUS|STAR|ELECTROVORTEX))?\b/,
  "JOHN DEERE": /\b(?:4030|40[68]|410|412|430|440|612)\s*R\b|\b230\s*M\b|\b(?:[MR]\s*)?(?:40[234][058]|4[679]30|4830)\b/,
  HORSCH: /\b(?:LEEB\s*)?([4568])[., ]?(\d{3})\s*(VL|VN|PT)\b/,
  "CASE IH": /\bPATRIOT\s*\d{3,4}\b/,
  "NEW HOLLAND": /\bDEFENSOR\s*SP\s*\d{4}\b|\bSPX\s*(?:II|2)\b/,
  "MASSEY FERGUSON": /\bMF\s*(?:\d{3}R|\d{4}X?)\b/,
  VALTRA: /\b(?:BS\s*\d{4}H?|R\s*\d{3}Y(?:\s+VT)?)\b/,
  STARA: /\bIMPERADOR\s*\d(?:[.,]\d|\d{3})\b/,
  KUHN: /\b(?:FIGHTER\s*\d{4}|BOXER\s*\d{4}\s*[MH]?|STRONGER(?:\s*\d{4})?\s*HD|STRONGER\s*\d{4})\b/,
  BALDAN: /\bAVOLA\s*\d{4}\b/,
  KS: /\b(?:STARKER(?:\s+CLASSIC)?|SUPREMO)\s*\d{4}(?:\s*R)?(?:\s+4X2)?\b/,
  PLA: /\b(?:12[05]\s*J|HYDRA\s*200)\b/,
  JAN: /\bPOWER\s*JET\s*\d{4}\b/,
  METALFOR: /\bM\s*70[34]0\b/,
};
const machine = /PULVERIZ|PULVERIS|FUMIGADOR|\bSPRAYER\b/;
const selfPropelled = /\b(?:AUTO[ -]?(?:PROPULSAD\w*|PROPELID\w*)|SELF[ -]?PROPELLED)\b/;
const outside = /\b(?:DRON(?:ES?)?|DJI|MOCHILAS?|ARRASTRE|TRACCIONADO|IRRIGAC\w*|PIVOTE|GOTEO|TURBINA CONTRA INCENDIO|PULVERIZADORAS? DE PUNTA)\b/;
const parts = /^\W*(?:\d+\W*)?(?:UN(?:I(?:D(?:AD(?:ES)?)?)?)?\W+(?:DE\s+)?)?(?:PARTES?|REPUESTOS?|BOQUILLAS?|PICOS?|PUNTAS?|KIT|BOMBA|PROLONGADOR|MANGUERAS?|BARRAS?|BOTALON(?:ES)?)\b/;

function canonicalBrand(value: unknown, details = "") {
  const brand = sourceUpper(value).replace(/[^A-Z0-9]+/g, " ").trim();
  if (brand === "CNHI" && /\bPATRIOT\b/.test(details)) return "CASE IH";
  return brandAliases[brand] ?? (brand && brand !== "NO DISPONIBLE" ? brand : unknown);
}
function canonicalModel(brand: string, description: string) {
  const text = description.replace(/\bMODELOM(?=\s+\d)/g, "MODELO M");
  const match = modelPatterns[brand]?.exec(text);
  if (!match) return undefined;
  if (brand === "HORSCH") return "LEEB " + match[1] + "." + match[2] + " " + match[3];
  if (brand === "JOHN DEERE" && match[0] === "4030R" && /\b1N0430R[A-Z0-9]+\b/.test(text)) return "430R";
  return match[0].trim()
    .replace(/^([MR]|MF|BS)\s+(?=\d)/, "$1")
    .replace(/^(BOXER \d+)\s+([MH])$/, "$1$2")
    .replace(/^DEFENSOR\s+SP\s*/, "DEFENSOR SP")
    .replace(/^IMPERADOR (\d)[.,]0$/, (_, n) => "IMPERADOR " + n + "000")
    .replace(/^STRONGER\s+HD$/, "STRONGER 4000HD")
    .replace(/^STRONGER (\d+) HD$/, "STRONGER $1HD")
    .replace(/^UNIPORT(?=\d)/, "UNIPORT ");
}
function historicalModel(value: unknown, brand: string) {
  const model = sourceUpper(value);
  return canonicalModel(brand, model) ?? (model || unknown);
}
function referenceKey(brand: string, model: string) {
  const key = sourceUpper(model).replace(/[^A-Z0-9]/g, "");
  if (brand === "JACTO" && key === "UNIPORT2000PLUS") return brand + ":UNIPORT2000";
  if (brand === "MASSEY FERGUSON" && key === "MF8225X") return brand + ":MF8225";
  if (brand === "KS" && key === "SUPREMO2500R4X2") return brand + ":SUPREMO2500R";
  return brand + ":" + key;
}
function measured(value: unknown, min: number, max: number) {
  const raw = sourceText(value);
  const n = Number(raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw.replace(/\.(?=\d{3}$)/, ""));
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}
function boom(value: unknown) {
  const widths = (sourceUpper(value).match(/\d{1,2}(?:[.,]\d+)?/g) ?? [])
    .map((raw) => measured(raw, 6, 70))
    .filter((width): width is number => width !== null);
  const groups = new Set(widths.map(sprayerBoomBand));
  return groups.size === 1 ? [...groups][0] : unknownSprayerBoom;
}
function importer(value: unknown) {
  const name = sourceUpper(value).replace(/[.]+/g, " ").replace(/\s+/g, " ").trim();
  if (/^CAMPOS DEL MANANA\b/.test(name)) return "Campos del Mañana";
  if (/^AUTOMAQ\b|^AUTOMOTORES Y MAQUINARIA\b/.test(name)) return "Automaq";
  if (/^KUROSU\b/.test(name)) return "Kurosu";
  if (/^DE LA SOBERA\b/.test(name)) return "De La Sobera";
  if (/^YGUAZU TRUCKS\b/.test(name)) return "Yguazú Trucks";
  if (/^CASAS TRUCK\b/.test(name)) return "Casas Truck";
  return /^(?:NO DISPONIBLE|SIN DATOS)?$/.test(name) ? unknown : sourceText(value);
}
function sprayerUnits(row: SourceRow, description: string, brand: string, model?: string) {
  const quantity = Number(row.Cantidad);
  if (quantity <= 1) return quantity;
  const declared = description.replace(/^\W*(?:L[AO]S DEM[ A]S(?: APARATOS)?[\s:.,-]+EN\b)?\W*/, "");
  if (/^0?1\b[\s.)-]*(?:UNA?\s+)?(?:UNI(?:DAD|D)?\b|(?:PULVERIZADOR|FUMIGADOR)\w*\b)/.test(declared))
    return 1;
  const netWeight = Number(row["Kgs. Netos"]);
  // These used Deere declarations repeat quantity 7 with the net weight of one chassis.
  const oneChassis = netWeight >= 10_000 && netWeight <= 18_000 &&
    /^PULVERIZADOR AGRICOLA\b/.test(declared);
  return quantity === 7 && brand === "JOHN DEERE" &&
    (model === "4730" || model === "R4038") && sourceUpper(row["Estado Mercadería"]) === "USADO" &&
    oneChassis ? 1 : quantity;
}

function movement(
  row: SourceRow, id: string, year: number, month: number, brand: string, model: string,
  litres: number | null, widthBand: string, hpBand: string, importerValue: unknown,
  units = Number(row.Cantidad),
): EquipmentMovement {
  const fob = Number(row["U$S FOB"]);
  return [id, year, month, brand, model, sprayerTankBand(litres), sprayerPriceBand(fob / units),
    importer(importerValue), sourceUpper(row["Estado Mercadería"]) || unknown, units, fob,
    litres, widthBand, hpBand];
}
function unique<T>(values: Set<T> | undefined) {
  return values?.size === 1 ? [...values][0] : undefined;
}
function reference(rows: Movement[]) {
  const models = new Map<string, { tank: Set<number>; width: Set<string>; power: Set<string> }>();
  for (const row of rows) {
    if (row[4] === unknown) continue;
    const key = referenceKey(row[3], row[4]);
    const item = models.get(key) ?? { tank: new Set<number>(), width: new Set<string>(), power: new Set<string>() };
    if (row[11] != null) item.tank.add(row[11]);
    if (row[12] && row[12] !== unknownSprayerBoom) item.width.add(row[12]);
    if (row[13] && row[13] !== unknownSprayerPower) item.power.add(row[13]);
    models.set(key, item);
  }
  return models;
}

const manufacturerTanks: Readonly<Record<string, number>> = {
  "CASE IH:PATRIOT2550": 2500,
  "CASE IH:PATRIOT3550": 3500,
  "HORSCH:LEEB5280VL": 5000,
  "JACTO:UNIPORT4530": 4500,
  "JOHN DEERE:230M": 3000,
  "JOHN DEERE:430R": 3000,
  "JOHN DEERE:440R": 4000,
  "VALTRA:R535YVT": 3500,
};

const candidateNcm = /\b8424(?:49|81|82|89)/;
export async function readSprayerUpload(files: SourceFile[], existing: Movement[] = []): Promise<MarketUpload> {
  let history: EquipmentMovement[] | undefined;
  const extracts: (ReturnType<Awaited<ReturnType<typeof readSourceWorkbook>>["extract"]> & {
    date: (value: unknown) => [number, number];
  })[] = [];
  for (const file of files) {
    const { book, rows, date, extract } = await readSourceWorkbook(file, ["base", "BASE", "SubItems", "Parámetros"]);
    const base = book.Sheets.base ?? book.Sheets.BASE;
    if (!base) {
      extracts.push({ ...extract(candidateNcm), date });
      continue;
    }
    if (history) throw new Error("Seleccioná una sola base histórica OCIT de pulverizadores.");
    const records = rows(base);
    if (!records.some((row) => row.TANQUE != null && row.BARRA != null && row.HP != null))
      throw new Error(file.name + " no corresponde a OCIT Pulverizadores.");
    history = records.flatMap((row, i) => {
      if (!row.Despacho || !row["Fecha Canc."] || !/^SEGMENTO [A-D]$/.test(sourceUpper(row.LINEA))) return [];
      const [year, month] = date(row["Fecha Canc."]);
      const brand = canonicalBrand(row["Marca Subitem"]);
      return [movement(row, "ocit:" + sourceText(row.Despacho) + ":" + (i + 2), year, month, brand,
        historicalModel(row["Descripción Subitem"], brand), measured(row.TANQUE, 400, 20_000),
        boom(row.BARRA), sprayerPowerBand(measured(row.HP, 60, 900)), row.Importador)];
    });
  }
  if (!history && extracts.length !== 1) throw new Error("Seleccioná un solo extracto original Penta/PYimport para actualizar.");
  const periods = extracts.map(({ start, end }) => ({ start, end }));
  const covered = (index: number) => periods.some(({ start, end }) => index >= start && index <= end);
  const known = reference(history ?? existing.filter((row) => row[0].startsWith("ocit:")));
  const earlier = reference(history ? [] : existing.filter((row) => !row[0].startsWith("ocit:") && !covered(monthIndex(row[1], row[2]))));
  const incoming = new Map<string, EquipmentMovement>();
  for (const source of extracts) for (const row of source.rows) {
    if (!candidateNcm.test(sourceText(row["Código NCM"])) ||
        !["IC04", "IC07", "IC09"].includes(sourceUpper(row["Régimen Código"]))) continue;
    const details = sourceUpper(row["Descripción Subitem"] || row["Descripción"]).replace(/\s+/g, " ");
    const product = details.replace(/^\W*(?:LOS DEM[ A]S\s*)?(?:PULVERIZADOR(?:ES|AS)?(?: AGRICOLA| PARA AGRICULTURA U HORTICULTURA)?\s*)?[:;.,\s-]*EN\b/, "")
      .replace(/^\W*APARATOS MECANICOS(?: \(INCLUSO MANUALES\))?[\s.;,:-]+EN\b/, "");
    const brand = canonicalBrand(row["Marca Subitem"], details);
    const model = canonicalModel(brand, details);
    const key = model ? referenceKey(brand, model) : "";
    const observed = known.get(key) ?? earlier.get(key);
    if (outside.test(product) || parts.test(product) ||
        !(selfPropelled.test(product) && (machine.test(product) || model) ||
          model && (machine.test(product) || /^842449/.test(sourceText(row["Código NCM"]))))) continue;
    const [year, month] = source.date(row["Fecha Canc."]);
    const index = monthIndex(year, month);
    if (index < source.start || index > source.end) continue;
    if (!row.Despacho || row.Item == null || row.Subitem == null) throw new Error(source.name + " contiene un subítem sin identificación.");
    const tank = details.match(/\bTANQUE(?:\s+PRINCIPAL)?(?:\s+DE)?\s*[:=]?\s*(\d[\d.,]*)\s*(?:L(?:ITROS?|TS?)?\b)/)?.[1];
    const width = details.match(/\b(?:BARRAS?|BARAS?|BOTALON(?:ES)?)(?:\s+DE)?\s*[:=]?\s*(\d{1,2}(?:[.,]\d+)?)\s*M(?:ETROS?)?\b/)?.[1];
    const hpMatch = details.match(/\b(\d{2,3}(?:[.,]\d+)?)\s*(HP|KW|CV)\b/);
    const declaredPower = hpMatch ? measured(hpMatch[1], 60, 900) : null;
    const hp = declaredPower === null ? null : Math.round(declaredPower * (hpMatch?.[2] === "KW" ? 1.341 : hpMatch?.[2] === "CV" ? 0.9863 : 1));
    const id = ["pyimport", sourceText(row.Despacho), sourceText(row.Item), sourceText(row.Subitem)].join(":");
    const item = movement(row, id, year, month, brand, model ?? unknown,
      measured(tank, 400, 20_000) ?? manufacturerTanks[key] ?? unique(observed?.tank) ?? null,
      width ? boom(width) : unique(observed?.width) ?? (key === "CASE IH:PATRIOT3550" ? sprayerBoomBand(30) : unknownSprayerBoom),
      hp !== null ? sprayerPowerBand(hp) : unique(observed?.power) ?? unknownSprayerPower, row["Probable Importador"],
      sprayerUnits(row, details, brand, model));
    const duplicate = incoming.get(id);
    if (duplicate && JSON.stringify(duplicate) !== JSON.stringify(item))
      throw new Error("El mismo subítem aparece con valores distintos.");
    incoming.set(id, item);
  }
  if (extracts.length && !incoming.size) throw new Error("El extracto no contiene pulverizadores autopropulsados a consumo en ese período.");
  if (!history) return { rows: parseMovements([...incoming.values()]), period: periods[0] };
  if (!history.length) throw new Error("La base OCIT no contiene movimientos históricos.");
  let last = Math.max(...history.map((row) => monthIndex(row[1], row[2])));
  for (const source of [...extracts].sort((a, b) => a.start - b.start)) {
    if (source.start > last + 1) throw new Error("Falta un período entre el histórico y " + source.name + ".");
    last = Math.max(last, source.end);
  }
  return { rows: parseMovements([...history.filter((row) => !covered(monthIndex(row[1], row[2]))), ...incoming.values()]) };
}
