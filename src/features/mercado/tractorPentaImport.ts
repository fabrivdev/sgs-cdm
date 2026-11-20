import { parseMovements, readReport, type Movement } from "./model";
import { completePower, tractorPowerBand } from "./power";
import {
  monthIndex,
  readSourceWorkbook,
  sourceText,
  sourceUpper,
  type MarketUpload,
  type SourceFile,
} from "./penta";

const unknown = "Sin identificar";
const missingPower = "Sin potencia informada";
const brandAliases = new Map([
  ["KUBOCA", "KUBOTA"],
  ["DEUTZ-FARH", "DEUTZ FAHR"],
  ["DEUTZ-FAHR", "DEUTZ FAHR"],
  ["CASE", "CASE IH"],
  ["MASSEY FERGUSSON", "MASSEY FERGUSON"],
  ["CLASS", "CLAAS"],
  ["JHON DEERE", "JOHN DEERE"],
  ["JOHN DEEERE", "JOHN DEERE"],
  ["JOHN DEERER", "JOHN DEERE"],
  ["JOHN DEREE", "JOHN DEERE"],
]);
const compact = (v: string) => sourceUpper(v).replace(/[^A-Z0-9]/g, "");
const otherEquipment =
  /\b(?:AERONAV\w*|AEROPORT\w*|TOPADORA|SKIDDER|FORESTAL|FELLER BUNCHER|FORWARDER|ARRASTRAR TRONCOS|TRANSPORTADOR AGRICOLA|MOTOCULT\w*|MICRO\s?TRACT?OR|CORTA\s?CESPED)\b/;
const singleMachine =
  /\b(?:CHASIS|CHASSIS|VIN|UNA UNIDAD|1\s*(?:\)|\.)?\s*(?:UNA?\s+)?(?:UND?|UNID(?:AD)?|USED)\b)/;
const modelPrefixes = new Set([
  "PUMA",
  "FARMALL",
  "MAGNUM",
  "MAXXUM",
  "AXION",
  "ARION",
  "ELIOS",
  "NEXOS",
  "TT",
  "MF",
  "FT",
  "BM",
  "BH",
  "TM",
  "SOLIS",
  "AGROPLUS",
  "LANDPOWER",
  "AGROLUX",
  "AGROFARM",
  "LOVOL",
  "MAJOR",
  "TRD",
]);
const importerByRuc = new Map([
  ["800133668", "Automaq"],
  ["800025920", "Kurosu"],
]);
const importerAliases = [
  [/^AUTOMOTORES Y MAQUINARIA\b|^AUTOMAQ\b/, "Automaq"],
  [/^KUROSU\b/, "Kurosu"],
  [/^DE LA SOBERA\b/, "De La Sobera"],
  [/^COMERCIO DE TRACTORES E IMPLEMENTOS\b|^COTRIPAR\b/, "Cotripar"],
  [/^DLS MOTORS\b/, "DLS Motors"],
  [/\bCIABAY\b|^COMERCIAL E INDUSTRIAL AMAMBAY\b/, "Ciabay"],
  [/^RIEDER\b/, "Rieder y Cía."],
  [/^AGROBAY\b/, "Agrobay"],
  [/^TRACTO AGRO VIAL\b/, "Tracto Agro Vial"],
  [/^(?:SACI )?H[ .]*PETERSEN\b/, "Hpetersen"],
  [/^TAPE RUVICHA\b/, "Tape Ruvicha"],
] as const;

function priceBand(value: number) {
  if (value <= 0) return "Sin FOB positivo";
  if (value < 25_000) return "Menos de USD 25.000";
  if (value < 50_000) return "USD 25.000 a <50.000";
  if (value < 100_000) return "USD 50.000 a <100.000";
  if (value < 150_000) return "USD 100.000 a <150.000";
  return "USD 150.000 o más";
}

function modelFrom(text: string, brand: string, catalog: Map<string, string>) {
  const inDescription = (body: string) => {
    const tokens = body.match(/[A-Z]+|\d+/g) ?? [];
    let best = "";
    for (let i = 0; i < tokens.length; i++) {
      for (let end = i + 1; end <= Math.min(i + 6, tokens.length); end++) {
        const key = tokens.slice(i, end).join("");
        if (key.length > best.length && catalog.has(key)) best = key;
      }
    }
    return catalog.get(best);
  };
  const tagged = text.match(/\b(?:MODELO|MOD|MODEL)\b[\s.:,-]*(.+)/)?.[1];
  const modelText = tagged?.startsWith(brand + " ")
    ? tagged.slice(brand.length + 1)
    : tagged;
  const exact = modelText?.match(
    /^([A-Z0-9][A-Z0-9./-]*)(?:\s+([A-Z0-9./-]+))?/,
  );
  if (exact) {
    const [, first, second] = exact;
    const candidate =
      second &&
      (modelPrefixes.has(first) ||
        (/^\d{1,3}$/.test(second) && /^[A-Z]+\d?$/.test(first)))
        ? first + second
        : first;
    const key = compact(candidate);
    if (/\d/.test(key) && !/^(?:4X4|4WD|2WD|20[0-2]\d)$/.test(key))
      return catalog.get(key) ?? key;
  }
  return inDescription(text) ?? unknown;
}

export async function readTractorUpload(
  file: SourceFile,
  existing: Movement[],
): Promise<MarketUpload> {
  const { book, date, extract } = await readSourceWorkbook(file, [
    "Base analítica",
    "SubItems",
    "Parámetros",
  ]);
  if (!book.Sheets.SubItems && book.Sheets["Base analítica"])
    return { rows: await readReport(file) };
  const { start, end, rows } = extract(/\b87019[1-5]/);
  const existingById = new Map(existing.map((row) => [row[0], row]));
  const existingImporters = new Map(
    existing.map((row) => [compact(row[7]), row[7]]),
  );
  const models = new Map<string, Map<string, string>>();
  for (const row of existing) {
    if (row[4] === unknown) continue;
    const byBrand = models.get(row[3]) ?? new Map<string, string>();
    const key = compact(row[4]);
    if (key.length >= 3 && /\d/.test(key) && !/^20[0-2]\d$/.test(key))
      byBrand.set(key, row[4]);
    models.set(row[3], byBrand);
  }
  const pending = new Map<string, Movement>();
  for (const row of rows) {
    const ncm = sourceText(row["Código NCM"]);
    const regime = sourceUpper(row["Régimen Código"]);
    const description = sourceUpper(
      row["Descripción Subitem"] || row["Descripción"],
    );
    if (
      !["IC04", "IC07", "IC09"].includes(regime) ||
      !/^87019[1-5]/.test(ncm) ||
      /^87019[45]10/.test(ncm) ||
      otherEquipment.test(description)
    )
      continue;
    const [year, month] = date(row["Fecha Canc."]);
    const index = monthIndex(year, month);
    if (index < start || index > end) continue;
    const despacho = sourceText(row.Despacho);
    if (!despacho || row.Item == null || row.Subitem == null)
      throw new Error("Hay un subítem sin despacho, ítem o número de subítem.");
    const id = [despacho, sourceText(row.Item), sourceText(row.Subitem)].join(
      "|",
    );
    const prior = existingById.get(id);
    const rawBrand = sourceUpper(row["Marca Subitem"]).replace(/\s+/g, " ");
    const brand =
      brandAliases.get(rawBrand) ??
      (rawBrand === "J2A" && /\bKAWASHIMA\b/.test(description)
        ? "KAWASHIMA"
        : /^(?:NO DISPONIBLE|SIN DATOS|SIN MARCAS?)?$/.test(rawBrand)
          ? "SIN MARCA"
          : rawBrand);
    const matching = prior?.[3] === brand ? prior : undefined;
    const model =
      matching?.[4] && matching[4] !== unknown
        ? matching[4]
        : modelFrom(description, brand, models.get(brand) ?? new Map());
    const rated = description.match(/\b(\d{2,3}(?:[.,]\d+)?)\s*(HP|CV|KW)\b/);
    const horsepower = rated
      ? Number(rated[1].replace(",", ".")) *
        (rated[2] === "KW" ? 1.341 : rated[2] === "CV" ? 0.9863 : 1)
      : 0;
    const ratedBand =
      horsepower >= 10 && horsepower < 1_000
        ? tractorPowerBand(horsepower)
        : missingPower;
    const power =
      matching?.[5] && matching[5] !== missingPower ? matching[5] : ratedBand;
    const declaredUnits = description.match(
      /\b(\d{1,2})\s*[.)-]?\s*(?:UNA?\s+)?UNI(?:DAD(?:ES)?|D)?\b/,
    )?.[1];
    const quantity = Number(row.Cantidad);
    const units =
      declaredUnits && Number(declaredUnits) > 0
        ? Number(declaredUnits)
        : quantity === 7 &&
            (prior?.[9] === 1 || singleMachine.test(description))
          ? 1
          : quantity;
    const fob = Number(row["U$S FOB"]);
    const importer = sourceText(row["Probable Importador"]);
    const importerCode = sourceText(row.RUC).replace(/[-.\s]/g, "");
    const importerName =
      importerByRuc.get(importerCode) ??
      importerAliases.find(([pattern]) =>
        pattern.test(sourceUpper(importer)),
      )?.[1] ??
      existingImporters.get(compact(importer)) ??
      (/^(?:NO DISPONIBLE|SIN DATOS|NO DEFINIDO)?$/.test(sourceUpper(importer))
        ? unknown
        : importer);
    const state = sourceUpper(row["Estado Mercadería"]) || unknown;
    const movement: Movement = [
      id,
      year,
      month,
      brand,
      model,
      power,
      priceBand(fob / units),
      importerName,
      state,
      units,
      fob,
    ];
    const other = pending.get(id);
    if (other && JSON.stringify(other) !== JSON.stringify(movement))
      throw new Error(
        "El archivo contiene versiones distintas de un mismo subítem.",
      );
    pending.set(id, movement);
  }
  if (!pending.size)
    throw new Error(
      "El extracto no contiene tractores agrícolas a consumo en ese período.",
    );
  const incoming = parseMovements([...pending.values()]);
  return {
    period: { start, end },
    rows: completePower([...existing, ...incoming]).slice(existing.length),
  };
}
