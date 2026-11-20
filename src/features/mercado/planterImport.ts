import { parseMovements, type Movement, type PlantingMovement } from "./model";
import {
  coarseGrain, fineGrain, mixedGrain, unknownGrain, unknownTransport, unknownPlantingSegment,
  marketFamilies, plantingPriceBand, plantingSegment,
} from "./marketFamily";
import { monthIndex, readSourceWorkbook, sourceText, sourceUpper, type MarketUpload, type SourceFile } from "./penta";

const unknown = "Sin identificar";
const textKey = (value: unknown) => sourceUpper(value).replace(/[^A-Z0-9]+/g, " ").trim();
const modelKey = (brand: string, model: string) => brand + ":" + textKey(model).replace(/ /g, "");
const brandAliases: Record<string, string> = {
  MF: "MASSEY FERGUSON", "MASSEY FERGUSSON": "MASSEY FERGUSON",
  "JHON DEERE": "JOHN DEERE", "JOHN DEER": "JOHN DEERE", "CASE": "CASE IH",
  PLANTICENTER: "PLANTI CENTER", "TATU MARCHESAN": "TATU", "MARCHESAN TATU": "TATU", HORSH: "HORSCH",
};
function brandName(value: unknown) {
  const brand = textKey(value);
  return brandAliases[brand] ?? (brand && brand !== "NO DISPONIBLE" ? brand : unknown);
}
function importerName(value: unknown, ruc: unknown) {
  const label = textKey(value);
  if (textKey(ruc).replace(/ /g, "") === "800133668" || /^(?:AUTOMAQ|AUTOMOTORES Y MAQUINARIA)\b/.test(label)) return "Automaq";
  if (textKey(ruc).replace(/ /g, "") === "800025920" || /^KUROSU\b/.test(label)) return "Kurosu";
  if (/^DE LA SOBERA\b/.test(label)) return "De La Sobera";
  if (/\bCIABAY\b|^COMERCIAL E INDUSTRIAL AMAMBAY\b/.test(label)) return "Ciabay";
  if (/\bDIMASA\b|^DISTRIBUIDORA DE MAQUINARIAS AGRICOLAS\b/.test(label)) return "DIMASA";
  if (/\bCOTRIPAR\b|^COMERCIO DE TRACTORES E IMPLEMENTOS DEL PARAGUAY\b/.test(label)) return "Cotripar";
  return /^(?:NO DISPONIBLE|SIN DATOS|SIN IDENTIFICAR)?$/.test(label) ? unknown : sourceText(value).toUpperCase();
}
function cropFrom(value: unknown) {
  const clean = textKey(value);
  const coarse = /\b(?:G(?:RAN?OS?)?\s+(?:GRUESOS?|GROSSOS?)|(?:PARA|DE) (?:MAIZ|MILHO|SOJA|MANI))\b/.test(clean);
  const fine = /\b(?:G(?:RAN?OS?)?\s+FINOS?|(?:PARA|DE) (?:ARROZ|TRIGO|AVENA|INVIERNO))\b/.test(clean);
  if ((coarse && fine) || /^(?:MIXTA|HIBRIDA)$/.test(clean)) return mixedGrain;
  return coarse ? coarseGrain : fine ? fineGrain : unknownGrain;
}
function transportFrom(value: unknown) {
  const clean = textKey(value);
  if (/\bAUTO\s*TRANS(?:P\w*)?\b/.test(clean)) return "Autotransportable";
  const hit = clean.match(/(?:^|\b(?:TRANSPORTE|DESPLAZAMIENTO) )((?:LATERAL|LONGITUDINAL))\b/);
  return hit ? hit[1][0] + hit[1].slice(1).toLowerCase() : unknownTransport;
}
function count(value: unknown) {
  if (!/^\d{1,3}$/.test(sourceText(value))) return null;
  const parsed = Number(value);
  return parsed > 0 && parsed <= 200 ? parsed : null;
}
function storedSegment(value: unknown) {
  const raw = textKey(value);
  return marketFamilies.sembradoras.segments.find((label) =>
    textKey(label).replace(/^MAS DE /, "MAYOR A ").replace(/ /g, "") ===
    raw.replace(/^MAYORES A /, "MAYOR A ").replace(/ /g, ""),
  ) ?? unknownPlantingSegment;
}
function modelOf(raw: string, brand: string) {
  const text = sourceUpper(raw).replace(/\s+/g, " ");
  if (/^(?:SIN DATOS|SIN IDENTIFICAR|NO DISPONIBLE)?$/.test(text)) return unknown;
  if (brand === "HORSCH") {
    const variant = text.match(/\b(MAESTRO|DAKAR|PRONTO|SPRINTER|AVATAR)\s+(\d{1,2})(?:[.,](\d{2}))?\s*((?:EV\s*F|CF|GV(?:\s*F)?|CV|DC|SD|DUO|SW|NT|SV|SX)\b)?/);
    if (variant) {
      const [, product, digits, spacing, suffix] = variant;
      const configured = text.match(/\(\s*(?:MONTADA CON\s+)?(\d{1,2})[.,](45|50|55|60|76|81)\s*\)/);
      return product + " " + (configured && product === "MAESTRO" ? configured[1] + "." + configured[2] :
        digits + (spacing ? "." + spacing : "")) + (suffix ? " " + suffix : "");
    }
  }
  const named = text.match(/\b(?:MOMENTUM\s+\d{1,2}(?:\s*[VFM]\b)?|TEMPO\s+L\s+\d{1,2}|JM\s*\d{4}[A-Z]{0,3})\b/);
  if (named) return named[0].replace(/^JM\s+/, "JM");
  if (brand === "JOHN DEERE") {
    const code = text.match(/\b(?:MODEL[O]?\s*[:.]?\s*(?:PLANTADORA\s+|PLANTER\s+)?|JOHN DEERE\s+)([123][0-9]{3})(?:-\d{1,2})?\b/);
    if (code) return code[1];
  }
  const tagged = text.match(/\b(?:MODELO|MDOELO|MODEL|MOD)\b[\s:.,-]*(.+)/)?.[1] ?? text;
  const clean = tagged.replace(/^(?:PLANTER|PLANTADORA|SEMBRADORA)\s+/, "");
  if (/^[A-Z0-9][A-Z0-9 .+/-]{0,30}$/.test(clean) && /\d/.test(clean) &&
      !/\b(?:AN[OIO]|COR|COLOR|ACCESORIOS|LINHAS|LINEAS|SERIE)\b/.test(clean)) return clean;
  if (tagged === text) return unknown;
  const words = clean.replace(/^(?:MODELO|MODEL|MOD)[\s:.,-]+/, "").split(/[\s,;:]+/).slice(0, 5);
  const firstNumber = words.findIndex((token) => /\d/.test(token));
  return firstNumber >= 0 && words[firstNumber] && !/^20[0-2]\d$/.test(words[firstNumber].replace(/[^0-9]/g, ""))
    ? words.slice(0, firstNumber + 1).join(" ").replace(/[.,-]+$/, "") : unknown;
}

type ObservedConfig = { lines: Set<number>; grain: Set<string>; transport: Set<string>; model: string };
function catalog(rows: Movement[]) {
  const byModel = new Map<string, ObservedConfig>();
  for (const row of rows) {
    if (row[4] === unknown) continue;
    const key = modelKey(row[3], row[4]);
    const seen = byModel.get(key) ?? { lines: new Set<number>(), grain: new Set<string>(), transport: new Set<string>(), model: row[4] };
    if (row[11] != null) seen.lines.add(row[11]);
    if (row[12] && row[12] !== unknownGrain) seen.grain.add(row[12]);
    if (row[13] && row[13] !== unknownTransport) seen.transport.add(row[13]);
    byModel.set(key, seen);
  }
  return byModel;
}
const unique = <T,>(values: Set<T> | undefined) => values?.size === 1 ? [...values][0] : undefined;
const machine = /\b(?:S?EMB?RADOR\w*|SEMEAD[EO]\w*|PLA(?:NT|T)AD(?:OR|EIR)\w*|PLATANDOR\w*|PLANTER|SOWERS?)\b/;
const outsideScope = /\b(?:MOTOCULTOR|CULTIVADORA|ZANJADORA|PERNA GRILL?O|MATRACA|MATRIARCA|(?:PLANTADEIRA|SEMBRADOR(?:A|ES|AS)?)\s+MANUAL(?:ES)?|KIT\s+SEMBRADORA|DRONE|AVION AGRICOLA)\b/;
const ends = /^84323(?:010|110|190|910|990)/;
function finish(rows: Movement[]) {
  if (!rows.length) throw new Error("No se identificaron sembradoras agrícolas en los archivos.");
  return parseMovements(rows);
}

export async function readPlanterUpload(files: SourceFile[], existing: Movement[] = []): Promise<MarketUpload> {
  let historical: PlantingMovement[] | undefined;
  const extracts: (ReturnType<Awaited<ReturnType<typeof readSourceWorkbook>>["extract"]> &
    { date: (value: unknown) => [number, number] })[] = [];
  for (const file of files) {
    const { book, rows, date, extract } = await readSourceWorkbook(file, ["base", "BASE", "SubItems", "Parámetros"]);
    const base = book.Sheets.base ?? book.Sheets.BASE;
    if (!base) {
      extracts.push({ ...extract(/\b84323[019]/), date });
      continue;
    }
    if (historical) throw new Error("Seleccioná una sola base histórica OCIT de sembradoras.");
    const records = rows(base);
    if (!records.some((row) => row.LINEAS != null && row.DESPLAZAMIENTO != null))
      throw new Error(file.name + " no corresponde a OCIT Plantadoras.");
    historical = records.flatMap((row, index) => {
      if (!row["Fecha Canc."] || !row.Despacho) return [];
      if (/^843290/.test(sourceText(row["Código NCM"]))) return [];
      const [year, month] = date(row["Fecha Canc."]);
      const brand = brandName(row["Marca Subitem"]);
      const lines = count(row.LINEAS);
      const crop = cropFrom(row.TIPO);
      const fob = Number(row["U$S FOB"]);
      const units = Number(row.Cantidad);
      const originalSegment = storedSegment(row.SEGMENTO);
      const originalModel = modelOf(sourceText(row["Descripción Subitem"]), brand);
      return [[
        "ocit:" + sourceText(row.Despacho) + ":" + (index + 2), year, month,
        brand, originalModel === unknown
          ? modelOf(sourceText(row["Descripción"]), brand)
          : originalModel,
        lines !== null && crop !== unknownGrain ? plantingSegment(crop, lines) : originalSegment,
        plantingPriceBand(fob / units), importerName(row.Importador, row.RUC),
        sourceUpper(row["Estado Mercadería"]) || unknown, units, fob,
        lines, crop, transportFrom(row.DESPLAZAMIENTO),
      ] satisfies PlantingMovement];
    });
  }
  if (!historical && extracts.length !== 1)
    throw new Error("Para actualizar meses, seleccioná un solo extracto Penta/PYimport.");
  const known = catalog([...(historical ?? existing)]);
  const incoming = new Map<string, PlantingMovement>();
  for (const source of extracts) {
    for (const row of source.rows) {
      if (!ends.test(sourceText(row["Código NCM"])) ||
          !["IC04", "IC07", "IC09"].includes(sourceUpper(row["Régimen Código"]))) continue;
      const description = sourceUpper(row["Descripción Subitem"] || row["Descripción"]).replace(/\s+/g, " ");
      const product = description.replace(/^\W*SEMBRADORAS?(?:[-\s]+ABONADORAS?)?[\s.;,:-]*EN\b/, "");
      const brand = brandName(row["Marca Subitem"]);
      const detectedModel = modelOf(description, brand);
      const observed = known.get(modelKey(brand, detectedModel));
      const qty = Number(row.Cantidad);
      const fob = Number(row["U$S FOB"]);
      const ambiguousBulk = /^84323[19]900/.test(sourceText(row["Código NCM"])) &&
        qty >= 10 && fob / qty < 500 && !observed;
      if ((!machine.test(product) && !(observed && /\b(?:CHASIS|CHASSI[SS]?|VIN)\b/.test(product))) ||
          outsideScope.test(product) || ambiguousBulk ||
          /^\W*(?:\d+\W+)?(?:UNI(?:DAD(?:ES)?|D)?\W+(?:DE\s+)?)?(?:PARTES?|REPUESTOS?|MANUAL|KIT|DOSIFICADOR|CUERPO DE SIEMBRA|BARRA(?:S)? (?:SEMBRADORA|DE SIEMBRA))\b/.test(product)) continue;
      const [year, month] = source.date(row["Fecha Canc."]);
      const monthNumber = monthIndex(year, month);
      if (monthNumber < source.start || monthNumber > source.end) continue;
      const model = observed?.model ?? detectedModel;
      const maestroCF = brand === "HORSCH" && /^MAESTRO \d+(?:\.\d+)? CF$/.test(model);
      const dakarCF = brand === "HORSCH" && /^DAKAR \d+(?:\.\d+)? CF$/.test(model);
      const reported = cropFrom(description);
      const grain = reported !== unknownGrain ? reported : unique(observed?.grain) ??
        (maestroCF ? coarseGrain : dakarCF ? fineGrain : unknownGrain);
      const statedLines = description.match(/\b(\d{1,3})\s*(?:LINEAS?|LINHAS?|SURCOS?|SULCOS?|HILERAS?|FILAS?)\b/)?.[1];
      const cfConfiguration = maestroCF ? model.match(/^MAESTRO (\d+)(?:\.(?:45|50|60|76|81))? CF$/)?.[1] : undefined;
      const lines = count(statedLines) ?? count(cfConfiguration) ?? unique(observed?.lines) ?? null;
      const recordedTransport = transportFrom(product.trim());
      const transport = recordedTransport !== unknownTransport ? recordedTransport : unique(observed?.transport) ??
        (maestroCF ? "Autotransportable" : unknownTransport);
      const statedUnits = product.match(/^\W*(?:LOS DEMAS EN\s+)?(\d{1,2})\s*\)?[ -]*UN(?:ID(?:AD(?:ES)?)?|D)\b/)?.[1];
      // A subitem with its own declared unit keeps that quantity even if the parent description lists a shipment total.
      const units = Number(statedUnits) === 1 && /\b(?:CHASIS|CHASSI[SS]?|SERIE)\b/.test(product) ? 1 : qty;
      if (!row.Despacho || row.Item == null || row.Subitem == null)
        throw new Error(source.name + " contiene un subítem sin identificación.");
      const id = ["pyimport", sourceText(row.Despacho), sourceText(row.Item), sourceText(row.Subitem)].join(":");
      const item: PlantingMovement = [id, year, month, brand, model, plantingSegment(grain, lines),
        plantingPriceBand(fob / units), importerName(row["Probable Importador"], row.RUC),
        sourceUpper(row["Estado Mercadería"]) || unknown, units, fob, lines, grain, transport];
      const prior = incoming.get(id);
      if (prior && JSON.stringify(prior) !== JSON.stringify(item))
        throw new Error("Los extractos contienen datos diferentes para el mismo subítem.");
      incoming.set(id, item);
    }
  }
  if (extracts.length && !incoming.size) throw new Error("El extracto no contiene sembradoras agrícolas a consumo en ese período.");
  if (!historical) {
    const [{ start, end }] = extracts;
    return { rows: finish([...incoming.values()]), period: { start, end } };
  }
  const sorted = extracts.sort((a, b) => a.start - b.start);
  let last = Math.max(...historical.map((row) => monthIndex(row[1], row[2])));
  for (const period of sorted) {
    if (period.start > last + 1) throw new Error("Falta un período entre el histórico y " + period.name + ".");
    last = Math.max(last, period.end);
  }
  return {
    rows: finish([
      ...historical.filter((row) => {
        const month = monthIndex(row[1], row[2]);
        return !extracts.some((source) => month >= source.start && month <= source.end);
      }),
      ...incoming.values(),
    ]),
  };
}
