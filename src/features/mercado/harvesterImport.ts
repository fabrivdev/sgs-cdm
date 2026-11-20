import {
  harvestPriceBand,
  parseMovements,
  unknownHarvestClass,
  type Movement,
} from "./model";

type SourceRow = Record<string, unknown>;
type SourceFile = Pick<File, "name" | "arrayBuffer">;

const brandAliases: Record<string, string> = {
  CLASS: "CLAAS",
  "JHON DEERE": "JOHN DEERE",
  "JOIHN DEERE": "JOHN DEERE",
  "JOHN DEER": "JOHN DEERE",
  "FORD NEW HOLLAND": "NEW HOLLAND",
  "NEW HOLLAD": "NEW HOLLAND",
  "MASSEYS FERGUSON": "MASSEY FERGUSON",
  "MASSEY FERGUSSON": "MASSEY FERGUSON",
  "MASSEY FERGURSON": "MASSEY FERGUSON",
  CASE: "CASE IH",
};
const importerAliases: Record<string, string> = {
  "KUROSU Y CIA SA": "KUROSU",
  "AUTOMOTORES Y MAQUINARIA SAECA": "AUTOMAQ",
  "CASAS TRUCK SOCIEDAD ANONIMA IMPORT EXPORT": "CASAS TRUCK",
  "CASAS TRUCK S A": "CASAS TRUCK",
  "CAMPOS DEL MANANA S A CMSA": "CAMPOS DEL MAÑANA",
  "CAMPOS DEL MANANA S A": "CAMPOS DEL MAÑANA",
  "YGUAZU TRUCKS SOCIEDAD DE RESPONSABILIDAD LIMITADA": "YGUAZU TRUCKS",
  "YGUAZU TRUCKS SRL": "YGUAZU TRUCKS",
};
const grainModelPatterns: Record<string, RegExp> = {
  "JOHN DEERE":
    /\b(?:X9[ -]?1[01]00|S[457][ -]?[4-9]00|S[4-8][ -]?[1-9]0S?|9[5678][5678]0(?:[ -]?(?:STS|CTS|WTS))?|CTS[ -]?II|1175)(?:[ -]+(?:RICE|ARROCERA))?\b/,
  "NEW HOLLAND":
    /\b(?:CR|TC|TX|CS)\s*(?:[0-9]{1,2}[ .-][0-9]{2}|[0-9]{2,4}|[6-9])\b\+?(?:[ -]+(?:RICE|ARROCERA|ARROZ))?/,
  "CASE IH": /\b(?:[4-9][12][356][0-9]|2799)(?:[ -]+(?:RICE|ARROCERA))?\b/,
  "MASSEY FERGUSON": /\b(?:MF[ -]?)?(?:[56]69[05]|9[678]95)\b/,
  CLAAS: /\b(?:LEXION|TRION|TUCANO|AVERO|MEGA DOMINATOR)\s*[0-9]{3,4}\b/,
  FENDT: /\bIDEAL\s*(?:CL[789]|[789](?:T)?|10(?:T)?)\b/,
  VALTRA: /\bBC[ -]?[0-9]{4}\b/,
  KUBOTA: /\bHH[ -]?[0-9]{3}\b/,
};
const otherEquipment =
  /\b(?:ALGOD[O ]?N|CANA DE AZUCAR|DE CANA|DE CA A|MANI|FORRAJ\w*|FORRAG\w*|PICADORA|HILERADORA|SWATH?ER|SWTAHER|SEGADORA|PULVERIZADORA|FUMIGADORA|JAGUAR|BIG [XM]|CH570|7460)\b/;
// These models are documented as windrowers or forage harvesters.
const otherModelPatterns: Record<string, RegExp> = {
  WESTWARD: /\b7000\b/,
  "MASSEY FERGUSON": /\b(?:MF\s*)?885\b/,
  "NEW HOLLAND": /\b(?:NH\s*)?2305\b/,
};
const harvesterDescription =
  /COSECH|COSECAHD|COSCHAD|COSECCH|COLHEIT|\bCOMBINE\b/;

const text = (value: unknown) => String(value ?? "").trim();
const uppercase = (value: unknown) =>
  text(value)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toUpperCase();
const words = (value: unknown) =>
  uppercase(value)
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
const semantic = (value: unknown) => uppercase(value).replace(/\s+/g, " ");
const brandName = (value: unknown) => {
  const name = words(value);
  return (
    brandAliases[name] ??
    (name && name !== "NO DISPONIBLE" ? name : "Sin identificar")
  );
};
const importerName = (value: unknown) => {
  const name = words(value);
  if (
    !name ||
    name === "NO DISPONIBLE" ||
    name === "SIN DATOS" ||
    name === "SIN IDENTIFICAR"
  )
    return "Sin identificar";
  return (
    importerAliases[name] ?? text(value).toUpperCase().replace(/\s+/g, " ")
  );
};
function condition(value: unknown, description = "") {
  const name = words(value);
  if (
    name === "USADO" ||
    /\b(?:USAD[AO]|USED|SEMINUEV[AO])\b/.test(description)
  )
    return "USADO";
  return name === "NUEVO" ? "NUEVO" : "Sin identificar";
}
function normalizeModel(brand: string, value: unknown) {
  let name = semantic(value)
    .replace(/\b(?:ARROCERA|ARROZ)\b/g, "RICE")
    .replace(/S(6[67]0)S\b/g, "S$1")
    .trim();
  if (!name || /^(?:SIN DATOS|NO DISPONIBLE|SIN IDENTIFICAR)$/.test(name))
    return "Sin identificar";
  if (brand === "MASSEY FERGUSON") name = "MF" + name.replace(/^MF[ -]?/, "");
  if (brand === "JOHN DEERE")
    name = name
      .replace(/^(S[457]|X9)[ -]?(\d{3,4})\b/, "$1 $2")
      .replace(/^S[ -](\d{3})\b/, "S$1")
      .replace(/(\d)[ -](STS|CTS|WTS)\b/, "$1$2")
      .replace(/^(9570|9670|9770|9870)(?= |$)/, "$1STS");
  if (brand === "NEW HOLLAND")
    name = name
      .replace(/^([A-Z]+)\s+(\d)/, "$1$2")
      .replace(/^([A-Z]+\d{1,2})[ -](\d{2})$/, "$1.$2");
  return name;
}
const familyKey = (brand: string, model: string) =>
  brand + ":" + words(model.replace(/ RICE$/, "")).replace(/ /g, "");
function observedClasses(history: Movement[]) {
  const classes = new Map<string, Set<string>>();
  for (const row of history) {
    if (row[4] === "Sin identificar" || row[5] === unknownHarvestClass)
      continue;
    const key = familyKey(row[3], row[4]);
    const values = classes.get(key) ?? new Set<string>();
    values.add(row[5]);
    classes.set(key, values);
  }
  return classes;
}
function explicitClass(value: unknown) {
  const valueClass = words(value).match(/^CLASE (10|[3-9])$/)?.[1];
  return valueClass ? "Clase " + valueClass : unknownHarvestClass;
}
function movement(
  id: string,
  year: number,
  month: number,
  brand: string,
  model: string,
  group: string,
  importer: string,
  state: string,
  units: number,
  fob: number,
): Movement {
  return [
    id,
    year,
    month,
    brand,
    model,
    group,
    harvestPriceBand(fob / units),
    importer,
    state,
    units,
    fob,
  ];
}
function monthIndex(year: number, month: number) {
  return year * 12 + month - 1;
}

export async function readHarvesterReport(files: SourceFile[]) {
  const XLSX = await import("xlsx");
  const sourceRows = (sheet: import("xlsx").WorkSheet) =>
    XLSX.utils
      .sheet_to_json<SourceRow>(sheet)
      .map((row) =>
        Object.fromEntries(
          Object.entries(row).map(([key, value]) => [
            key.trim().replace(/\s+/g, " "),
            value,
          ]),
        ),
      );
  const period = (value: unknown): [number, number] => {
    if (typeof value === "number") {
      const date = XLSX.SSF.parse_date_code(value);
      if (date) return [date.y, date.m];
    }
    const iso = text(value).match(/^(\d{4})-(\d{2})-/);
    if (iso) return [Number(iso[1]), Number(iso[2])];
    const local = text(value).match(/^\d{1,2}[/-](\d{1,2})[/-](\d{4})/);
    if (local) return [Number(local[2]), Number(local[1])];
    throw new Error("Hay una fecha de despacho sin formato válido.");
  };

  let history: Movement[] | undefined;
  const exports: {
    name: string;
    start: number;
    end: number;
    rows: SourceRow[];
  }[] = [];
  for (const file of files) {
    const book = XLSX.read(await file.arrayBuffer(), {
      sheets: ["BASE", "SubItems", "Parámetros"],
    });
    if (book.Sheets.BASE) {
      if (history)
        throw new Error(
          "Seleccioná una sola base histórica OCIT de cosechadoras.",
        );
      const base = sourceRows(book.Sheets.BASE);
      if (!base.some((row) => words(row.TIPO) === "COS GRANOS"))
        throw new Error(
          file.name + " no contiene cosechadoras de granos en BASE.",
        );
      const seen = new Set<string>();
      history = [];
      for (const [index, row] of base.entries()) {
        if (words(row.TIPO) !== "COS GRANOS") continue;
        const [year, month] = period(row["FECHA DESPACHO"]);
        const signature = JSON.stringify([
          row.Despacho,
          row["FECHA DESPACHO"],
          row.MARCA,
          row.MODELO,
          row.CANTIDAD,
          row["U$S FOB"],
          row.DESCRIPCION,
        ]);
        if (seen.has(signature)) continue;
        seen.add(signature);
        const brand = brandName(row.MARCA);
        history.push(
          movement(
            "ocit:" + text(row.Despacho) + ":" + (index + 2),
            year,
            month,
            brand,
            normalizeModel(brand, row.MODELO),
            explicitClass(row.CLASE),
            importerName(row.IMPORTADOR),
            condition(row.ESTADO),
            Number(row.CANTIDAD),
            Number(row["U$S FOB"]),
          ),
        );
      }
      continue;
    }
    const sheet = book.Sheets.SubItems;
    const parameters = book.Sheets["Parámetros"];
    if (!sheet || !parameters)
      throw new Error(
        file.name + " no corresponde a una base OCIT o un export PYimport.",
      );
    const metadata = XLSX.utils
      .sheet_to_json<unknown[]>(parameters, { header: 1 })
      .flat()
      .map(text);
    const match = uppercase(
      metadata.find((entry) => /^PER[IÍ]ODO/i.test(entry)),
    ).match(/(\d{1,2})\/(\d{4})\s*-\s*(\d{1,2})\/(\d{4})/);
    if (
      !match ||
      !metadata.some(
        (entry) => /^C[oó]digo NCM:/i.test(entry) && /\b843351/.test(entry),
      )
    )
      throw new Error(
        file.name +
          " debe cubrir el NCM 843351 y declarar su período en Parámetros.",
      );
    const [, startMonth, startYear, endMonth, endYear] = match.map(Number);
    const start = monthIndex(startYear, startMonth);
    const end = monthIndex(endYear, endMonth);
    if (
      startMonth < 1 ||
      endMonth > 12 ||
      startMonth > 12 ||
      endMonth < 1 ||
      start > end
    )
      throw new Error(file.name + " declara un período inválido.");
    exports.push({ name: file.name, start, end, rows: sourceRows(sheet) });
  }
  if (!history?.length)
    throw new Error("Incluí el archivo histórico OCIT de cosechadoras.");
  const classes = observedClasses(history);
  const sorted = exports.sort((a, b) => a.start - b.start || a.end - b.end);
  let coverageEnd = Math.max(
    ...history.map((row) => monthIndex(row[1], row[2])),
  );
  const recent = new Map<string, Movement>();
  for (const source of sorted) {
    if (source.start > coverageEnd + 1)
      throw new Error(
        "Falta un período entre el histórico y " + source.name + ".",
      );
    coverageEnd = Math.max(coverageEnd, source.end);
    for (const row of source.rows) {
      const ncm = text(row["Código NCM"]).slice(0, 8);
      if (
        !["84335100", "84335919", "84335911", "84335990", "84335200"].includes(
          ncm,
        )
      )
        continue;
      if (
        !/^IMPORTACION (?:A CONSUMO|MENOR A CONSUMO)/.test(
          words(row["Régimen"]),
        )
      )
        continue;
      const description = semantic(
        row["Descripción Subitem"] || row["Descripción"],
      );
      const brand = brandName(row["Marca Subitem"]);
      const pattern = grainModelPatterns[brand];
      const modelText =
        description.match(/\b(?:MODELO?|MODEL|MOD)[.:\s]+(.+)/)?.[1] ??
        description;
      const matchModel =
        pattern?.exec(modelText)?.[0] ?? pattern?.exec(description)?.[0];
      if (
        otherEquipment.test(description) ||
        otherModelPatterns[brand]?.test(description) ||
        (ncm !== "84335100" && !matchModel) ||
        (!matchModel &&
          (!harvesterDescription.test(description) ||
            /\b(?:PLATAFORMA COSECHADORA|CABEZAL DE CORTE)\b/.test(
              description,
            )))
      )
        continue;
      const [year, month] = period(row["Fecha Canc."]);
      if (
        monthIndex(year, month) < source.start ||
        monthIndex(year, month) > source.end
      )
        continue;
      const model = normalizeModel(brand, matchModel);
      const seenClasses = classes.get(familyKey(brand, model));
      const group =
        seenClasses?.size === 1 ? [...seenClasses][0] : unknownHarvestClass;
      const count = Number(row.Cantidad);
      const declaredCount = description.match(
        /\b(\d{1,2})\s*\)?[ -]*(?:UNA?\s+)?UNI(?:DAD(?:ES)?|D)?\b/,
      )?.[1];
      const units = declaredCount
        ? Number(declaredCount)
        : count === 7
          ? 1
          : count;
      const id = [
        "pyimport",
        text(row.Despacho),
        text(row.Item),
        text(row.Subitem),
      ].join(":");
      if (!row.Despacho || row.Item == null || row.Subitem == null)
        throw new Error(
          source.name + " contiene un subítem sin identificación.",
        );
      const item = movement(
        id,
        year,
        month,
        brand,
        model,
        group,
        importerName(row["Probable Importador"]),
        condition(row["Estado Mercadería"], description),
        units,
        Number(row["U$S FOB"]),
      );
      const prior = recent.get(id);
      if (prior && JSON.stringify(prior) !== JSON.stringify(item))
        throw new Error(
          "Los extractos contienen datos diferentes para el mismo subítem.",
        );
      recent.set(id, item);
    }
  }
  if (exports.length && !recent.size)
    throw new Error(
      "En los extractos no se identificaron cosechadoras de granos importadas a consumo.",
    );
  return parseMovements([
    ...history.filter((row) => {
      const month = monthIndex(row[1], row[2]);
      return !sorted.some(
        (source) => month >= source.start && month <= source.end,
      );
    }),
    ...recent.values(),
  ]);
}
