import type { WorkBook, WorkSheet } from "xlsx";
import { marketShareLogos } from "./marketShareLogos";
import { camposDealer, parseSalesPeriods, type Sale, type SalesFamily, type SalesPeriod } from "./marketShareModel";
import { sourceUpper, type SourceFile } from "./penta";

const label = (value: unknown) => sourceUpper(value).replace(/\s+/g, " ").trim();
const key = (value: unknown) => label(value).replace(/[^A-Z0-9]+/g, " ").trim();
const monthNames = [
  ["ENE"], ["FEB"], ["MAR"], ["ABR"], ["MAY"], ["JUN"],
  ["JUL"], ["AGO"], ["SEP", "SEPT", "SET"], ["OCT"], ["NOV"], ["DIC"],
];
const dealerAliases: Readonly<Record<string, string>> = {
  "DE LA SOBERA": "De La Sobera", "DLS MOTORS": "DLS Motors", AUTOMOTOR: "Automotor",
  AUTOMAQ: "Automaq", KUROSU: "Kurosu", "TAPE RUVICHA": "Tape Ruvicha",
  AGROBAY: "Agrobay", RIEDER: "Rieder", COTRIPAR: "Cotripar", "COTRIPAR II": "Cotripar",
  "H PETERSEN": "H. Petersen", HP: "H. Petersen", CIABAY: "Ciabay", CIABBAY: "Ciabay",
  "CAMPOS D M": camposDealer, CDM: camposDealer, "TRACTO AGROVIAL": "Tracto Agrovial",
  "TRACTO A VIAL": "Tracto Agrovial", TRACTO: "Tracto Agrovial",
  "DE LA SOBERA HNOS SA": "De La Sobera", "DLS MOTORS SA": "DLS Motors",
  "AUTOM Y MAQUINARIA SA": "Automaq", "KUROSU CIA SA": "Kurosu", "RIEDER Y CIA SA": "Rieder",
  "TAPE RUVICHA SA": "Tape Ruvicha", "CIABAY SA": "Ciabay", "PETERSEN H SA": "H. Petersen",
  "COMERCIO DE TRACT E IMPL": "Cotripar", "CAMPOS DEL MANANA": camposDealer,
  "CAMPOS DEL MANANA SA": camposDealer, "CAMPOS DEL MANANA S A": camposDealer,
  "TRACTO AGRO VIAL SA": "Tracto Agrovial", "ENGINE SA": "ENGINE", "AUTOMOTOR S A": "Automotor",
  "RANPAR CARRETAS E IMPLEMENTOS SA": "RAMPAR",
};
const dealer = (value: unknown) => dealerAliases[key(value)] ?? (label(value) || null);
const brandAliases: Readonly<Record<string, string>> = {
  FARMATRAC: "FARMTRAC", DEUTZ: "DEUTZ-FAHR", "DEUTZ FAHR": "DEUTZ-FAHR",
  CASE: "CASE IH", NH: "NEW HOLLAND", "J DEERE": "JOHN DEERE",
  "JOHN DEERE AUTOMAQ": "JOHN DEERE", "JOHN DEERE KUROSU": "JOHN DEERE",
  "NEW HOLLAND TAPE": "NEW HOLLAND", "NEW HOLLAND AGROBAY": "NEW HOLLAND",
  "PLA KUROSU": "PLA", "PLA AUTOMAQ": "PLA",
};
const brand = (value: unknown) => brandAliases[key(value)] ?? label(value);

function oldEntry(value: unknown): Pick<Sale, "marca" | "distribuidor"> {
  const normalized = key(value);
  const john = normalized.match(/^J DEERE(?: (.+))?$/);
  if (john) return { marca: "JOHN DEERE", distribuidor: john[1] === "A" ? "Automaq" : john[1] === "K" ? "Kurosu" : dealer(john[1]) };
  const pair = normalized.match(/^(NH|CASE|VALTRA|FENDT|LOVOL|YTO|HANOMAG|LS|CLAAS|HORSCH|JACTO|KS|KUHN|PLA|METALFOR) (.+)$/);
  return pair ? { marca: brand(pair[1]), distribuidor: dealer(pair[2] === "TAPE" ? "TAPE RUVICHA" : pair[2]) }
    : { marca: brand(value), distribuidor: null };
}

type WorkbookParts = WorkBook & { files?: Record<string, { content?: Uint8Array }> };
const relNs = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const xml = (parts: WorkbookParts["files"], path: string) => {
  const bytes = parts?.[path]?.content;
  return bytes ? new DOMParser().parseFromString(new TextDecoder().decode(bytes), "application/xml") : null;
};
const tags = (node: Document | Element | null, name: string) =>
  node ? Array.from(node.getElementsByTagNameNS("*", name)) : [];
const targetPath = (source: string, target: string) =>
  new URL(target, "https://workbook.invalid/" + source).pathname.slice(1);
function relationships(files: WorkbookParts["files"], path: string) {
  const slash = path.lastIndexOf("/") + 1;
  return new Map(tags(xml(files, path.slice(0, slash) + "_rels/" + path.slice(slash) + ".rels"), "Relationship")
    .filter((rel) => rel.getAttribute("TargetMode") !== "External")
    .map((rel) => [rel.getAttribute("Id"), targetPath(path, rel.getAttribute("Target") ?? "")]));
}

async function logoRows(book: WorkbookParts, sheet: string, brandColumn: number) {
  const result = new Map<number, string>();
  const main = "xl/workbook.xml";
  const sheetId = tags(xml(book.files, main), "sheet").find((entry) => entry.getAttribute("name") === sheet)
    ?.getAttributeNS(relNs, "id");
  const path = relationships(book.files, main).get(sheetId ?? null);
  if (!path) return result;
  const drawingId = tags(xml(book.files, path), "drawing")[0]?.getAttributeNS(relNs, "id");
  const drawing = relationships(book.files, path).get(drawingId ?? null);
  if (!drawing) return result;
  const images = relationships(book.files, drawing);
  const known = new Map<string, string>();
  for (const element of Array.from(xml(book.files, drawing)?.documentElement.children ?? [])) {
    const start = tags(element, "from")[0];
    const row = Number(tags(start, "row")[0]?.textContent);
    const column = Number(tags(start, "col")[0]?.textContent);
    if (!Number.isInteger(row) || column !== brandColumn) continue;
    const target = images.get(tags(element, "blip")[0]?.getAttributeNS(relNs, "embed") ?? null);
    const bytes = target ? book.files?.[target]?.content : undefined;
    if (!target || !bytes) continue;
    if (!known.has(target)) {
      const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes).buffer);
      const hash = Array.from(new Uint8Array(digest), (n) => n.toString(16).padStart(2, "0")).join("");
      known.set(target, marketShareLogos[hash] ?? "");
    }
    const name = known.get(target);
    if (name) result.set(row, name);
  }
  return result;
}

type Grid = unknown[][];
function titleFamily(row: unknown[]) {
  const title = row.map(key).find((text) => /^VENTAS DE (TRACTORES|COSECHADORAS|PULVERIZADORES) ANO \d{4}$/.test(text));
  return title?.split(" ")[2].toLowerCase() as SalesFamily | undefined;
}
function quantity(value: unknown) {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 0) throw new Error("Las unidades mensuales deben ser enteros positivos o cero.");
  return n;
}
function columnLabels(grid: Grid, first: number, last: number) {
  const index = grid.findIndex((row, i) => i > first && i < last && row.some((v) => ["MARCA", "MARCAS"].includes(key(v))));
  if (index === -1) throw new Error("Falta el encabezado de marcas en una hoja anual.");
  const header = grid[index];
  const brandCol = header.findIndex((v) => ["MARCA", "MARCAS"].includes(key(v)));
  const dealerCol = header.findIndex((v) => key(v) === "DEALER");
  const months = monthNames.map((names) => header.findIndex((v) => names.includes(key(v))));
  if (months.some((col) => col < 0)) throw new Error("Faltan las columnas de meses en una hoja anual.");
  return { index, brandCol, dealerCol, months };
}
function mergedBrandRow(sheet: WorkSheet, row: number, column: number) {
  const merge = sheet["!merges"]?.find(({ s, e }) => s.c === column && e.c === column && row >= s.r && row <= e.r);
  return merge?.s.r ?? row;
}
const cadamFamilies: Record<string, SalesFamily> = {
  "TRACTOR AGRICOLA": "tractores", COSECHADORA: "cosechadoras", "PULVERIZADORA AUTOPROP": "pulverizadores",
};

function readCadam(sheet: WorkSheet, book: WorkBook, xlsx: typeof import("xlsx")) {
  const [meta, header, ...detail] = xlsx.utils.sheet_to_json<unknown[]>(sheet, { header: 1, range: 0, blankrows: true });
  const columns = ["IMPORTADOR", "MARCAS", "MES", "ANO", "CANTIDAD", "MAQUINA"];
  const start = header?.findIndex((_, index) => columns.every((name, i) => key(header[index + i]) === name)) ?? -1;
  if (start < 0) {
    throw new Error("La hoja Cadam Ventas necesita las columnas Importador, Marcas, Mes, Año, Cantidad y Máquina.");
  }
  const periods = new Map<string, SalesPeriod>();
  let recordedTotal = 0;
  for (const [index, row] of detail.entries()) {
    const cells = row.slice(start, start + columns.length);
    if (cells.every((value) => value == null || value === "")) continue;
    const [rawDealer, rawBrand, serial, year, rawUnits, machine] = cells;
    const family = cadamFamilies[key(machine)];
    const date = typeof serial === "number" ? xlsx.SSF.parse_date_code(serial, { date1904: !!book.Workbook?.WBProps?.date1904 }) : null;
    const units = String(rawUnits).trim() === "-" ? 0 : quantity(rawUnits);
    const name = brand(rawBrand);
    const distributor = dealer(rawDealer);
    if (!family || !date || date.y !== year || units === null || (units > 0 && (!name || !distributor))) {
      throw new Error("Revisá la fecha, máquina, unidades, marca o distribuidor de la fila " + (index + 3) + " de Cadam Ventas.");
    }
    recordedTotal += units;
    if (date.y > 2025) continue;
    const id = family + ":" + date.y + ":" + date.m;
    const period = periods.get(id) ?? { familia: family, anio: date.y, mes: date.m, total: 0, detalle: [] as Sale[] };
    period.total += units;
    if (units > 0) {
      const entry = period.detalle?.find((sale) => sale.marca === name && sale.distribuidor === distributor);
      if (entry) entry.unidades += units;
      else period.detalle?.push({ marca: name, distribuidor: distributor, unidades: units });
    }
    periods.set(id, period);
  }
  const declaredTotal = meta?.[start + 4];
  if (typeof declaredTotal === "number" && recordedTotal !== declaredTotal) {
    throw new Error("El total de Cadam Ventas no coincide con la suma de las filas de detalle.");
  }
  if (!periods.size) throw new Error("No hay ventas históricas hasta 2025 en Cadam Ventas.");
  return parseSalesPeriods([...periods.values()]);
}

export async function readMarketShareUpload(file: SourceFile): Promise<{ source: "cadam" | "informe"; periods: SalesPeriod[] }> {
  const xlsx = await import("xlsx");
  const book = xlsx.read(await file.arrayBuffer(), { bookFiles: true }) as WorkbookParts;
  const cadamSheet = book.SheetNames.find((name) => key(name) === "CADAM VENTAS");
  if (cadamSheet) return { source: "cadam", periods: readCadam(book.Sheets[cadamSheet], book, xlsx) };
  const annual = book.SheetNames.filter((name) => /^20\d{2}$/.test(name));
  const periods = new Map<string, SalesPeriod>();
  const historical: SalesPeriod[] = [];
  for (const name of annual) {
    const sheet = book.Sheets[name];
    const range = xlsx.utils.decode_range(sheet["!ref"] ?? "A1");
    range.s = { r: 0, c: 0 };
    const grid: Grid = xlsx.utils.sheet_to_json(sheet, { header: 1, range, blankrows: true });
    const blocks = grid.flatMap((row, i) => {
      const family = titleFamily(row);
      return family ? [{ family, first: i }] : [];
    });
    const logos = new Map<number, Map<number, string>>();
    for (const [b, { family, first }] of blocks.entries()) {
      const last = blocks[b + 1]?.first ?? grid.length;
      const { index, brandCol, dealerCol, months } = columnLabels(grid, first, last);
      const total = grid.findIndex((row, i) => i > index && i < last && key(row[brandCol]) === "TOTAL");
      if (total < 0) throw new Error("Falta el total de " + family + " en la hoja " + name + ".");
      if (dealerCol >= 0 && !logos.has(brandCol)) logos.set(brandCol, await logoRows(book, name, brandCol));
      const detail = grid.slice(index + 1, total);
      const cutoff = months.reduce((end, col, m) => detail.some((row) => typeof row[col] === "number") ? m : end, -1);
      for (const [m, col] of months.entries()) {
        if (m > cutoff) break;
        const sales = new Map<string, Sale>();
        for (const [offset, raw] of detail.entries()) {
          const units = quantity(raw[col]);
          if (!units) continue;
          const row = index + 1 + offset;
          const at = mergedBrandRow(sheet, row, brandCol);
          const text = grid[at]?.[brandCol];
          const entry = dealerCol < 0 ? oldEntry(text) : {
            marca: brand(text) || logos.get(brandCol)?.get(at) || "",
            distribuidor: dealer(raw[dealerCol]),
          };
          if (!entry.marca) throw new Error("Escribí la marca como texto en la fila " + (at + 1) + " de la hoja " + name + ".");
          const id = JSON.stringify([entry.marca, entry.distribuidor]);
          const prior = sales.get(id);
          sales.set(id, { ...entry, unidades: (prior?.unidades ?? 0) + units });
        }
        const items = [...sales.values()];
        const sum = items.reduce((n, sale) => n + sale.unidades, 0);
        const publishedTotal = quantity(grid[total][col]);
        if (publishedTotal !== null && sum !== publishedTotal)
          throw new Error("Las filas de " + family + " en " + name + " no coinciden con el total del mes " + (m + 1) + ".");
        periods.set(family + ":" + name + ":" + (m + 1), {
          familia: family, anio: Number(name), mes: m + 1, total: sum, detalle: items,
        });
      }
      for (const row of grid.slice(total + 1, last)) {
        const year = key(row[brandCol]).match(/^MERCADO (20\d{2})(?: C MARCAS CHINAS)?$/)?.[1];
        if (!year || Number(year) >= Number(name)) continue;
        for (const [m, col] of months.entries()) {
          const units = quantity(row[col]);
          if (units !== null) historical.push({ familia: family, anio: Number(year), mes: m + 1, total: units, detalle: null });
        }
      }
    }
  }
  if (!periods.size) throw new Error("No se encontraron ventas mensuales en las hojas anuales del informe.");
  for (const period of historical) {
    const id = period.familia + ":" + period.anio + ":" + period.mes;
    if (!periods.has(id)) periods.set(id, period);
  }
  return { source: "informe", periods: parseSalesPeriods([...periods.values()]) };
}
