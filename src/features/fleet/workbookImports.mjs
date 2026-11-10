export function fuelCurrency(value, fallback = null) {
  const raw = String(value ?? "")
    .trim()
    .toUpperCase();
  const aliases = {
    GS: "PYG",
    "GS.": "PYG",
    GUARANIES: "PYG",
    GUARANÍES: "PYG",
    "₲": "PYG",
    US$: "USD",
    DÓLARES: "USD",
    DOLARES: "USD",
  };
  const currency = aliases[raw] ?? raw;
  if (currency && !/^[A-Z]{3}$/.test(currency))
    throw Error("Moneda del archivo no reconocida");
  if (currency) return currency;
  if (fallback && !/^[A-Z]{3}$/.test(fallback)) throw Error("Moneda inválida");
  return fallback || null;
}
import * as XLSX from "xlsx/xlsx.mjs";
const text = (v) => (v == null ? "" : String(v).trim());
const number = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const normalize = (v) =>
  text(v)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
function date(v, date1904 = false) {
  if (typeof v === "number") {
    const p = XLSX.SSF.parse_date_code(v, { date1904 });
    return p
      ? `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`
      : null;
  }
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text(v));
  const result = match ? `${match[3]}-${match[2]}-${match[1]}` : null;
  return result &&
    !Number.isNaN(Date.parse(result)) &&
    new Date(result).toISOString().slice(0, 10) === result
    ? result
    : null;
}
export function parseFuel(workbook, defaultCurrency = null) {
  const s = workbook.Sheets["Detalle Descuento"];
  if (!s) throw Error("No se encuentra Detalle Descuento.");
  const rows = XLSX.utils.sheet_to_json(s, {
    header: 1,
    defval: null,
    blankrows: true,
  });
  const h = rows.findIndex(
    (r) => r.includes("Km Actual") && r.includes("Total Neto"),
  );
  if (h < 0) throw Error("Encabezados de combustible no reconocidos.");
  const headers = rows[h],
    required = [
      "Tarjeta",
      "N° Compro.",
      "N° Boleta",
      "Fecha",
      "Hora",
      "Cant.",
      "Total Neto",
      "Km Actual",
      "Km Anterior",
      "Cant. Ant.",
      "Producto",
      "Nombre",
    ];
  if (required.some((k) => !headers.includes(k)))
    throw Error("Faltan columnas de combustible.");
  const result = [],
    seen = new Map();
  let sourceTotal = null;
  for (let i = h + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r.some((v) => text(v))) continue;
    const get = (k) => r[headers.indexOf(k)],
      raw_data = Object.fromEntries(
        headers.map((k, j) => [text(k), r[j] ?? null]),
      );
    if (r.some((v) => /^TOTAL CLIENTE/.test(text(v)))) {
      sourceTotal = {
        liters: number(get("Cant.")),
        amount: number(get("Total Neto")),
      };
      continue;
    }
    const card = /Tarjeta:\s*(\d+)/i.exec(text(get("Tarjeta")))?.[1];
    const plate =
      /Placa:\s*(.*?)\s*-\s*Marca:/i.exec(text(get("Tarjeta")))?.[1] ?? "";
    const d = date(get("Fecha"), !!workbook.Workbook?.WBProps?.date1904),
      time = text(get("Hora"));
    const liters = number(get("Cant.")),
      net_amount = number(get("Total Neto"));
    if (
      !card ||
      !text(get("N° Compro.")) ||
      !text(get("N° Boleta")) ||
      !d ||
      !/^([01]?\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(time) ||
      liters == null ||
      net_amount == null
    )
      throw Error(`Fila ${i + 1}: identidad, fecha o importe inválido.`);
    const key = `${card}:${text(get("N° Compro."))}:${text(get("N° Boleta"))}`;
    if (seen.has(key)) {
      if (seen.get(key) !== JSON.stringify(raw_data))
        throw Error(`Fila ${i + 1}: comprobante duplicado con diferencias.`);
      continue;
    }
    seen.set(key, JSON.stringify(raw_data));
    result.push({
      plate: plate === "-" ? "" : plate,
      occurred_at: `${d}T${time.length === 4 ? "0" + time : time}${time.split(":").length === 2 ? ":00" : ""}`,
      liters,
      net_amount,
      currency: fuelCurrency(get("Moneda") ?? get("Currency"), defaultCurrency),
      odometer_km: number(get("Km Actual")),
      previous_odometer_km: number(get("Km Anterior")),
      previous_liters: number(get("Cant. Ant.")),
      product: text(get("Producto")),
      station: text(get("Nombre")),
      source_key: key,
      raw_data,
    });
  }
  if (!result.length) throw Error("El archivo no contiene cargas.");
  if (
    sourceTotal &&
    (sourceTotal.liters == null ||
      sourceTotal.amount == null ||
      Math.abs(result.reduce((s, r) => s + r.liters, 0) - sourceTotal.liters) >
        0.01 ||
      Math.abs(
        result.reduce((s, r) => s + r.net_amount, 0) - sourceTotal.amount,
      ) > 0.01)
  )
    throw Error("Los movimientos no concilian con el total del archivo.");
  return result;
}
export function parseInitialVehicles(workbook, sheetNames) {
  if (!sheetNames?.length)
    throw Error("Indicá las hojas autorizadas para el padrón.");
  const result = [],
    seen = new Set(),
    issues = [];
  for (const name of sheetNames) {
    const sheet = workbook.Sheets[name];
    if (!sheet) throw Error(`No se encuentra ${name}.`);
    // Source workbook contains repeated cells far to the right: use its labeled A:O block only.
    const range = XLSX.utils.decode_range(sheet["!ref"]);
    range.e.c = 14;
    const rows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: null,
      range,
      blankrows: true,
    });
    if (rows[0]?.[4] !== "Chapa" || rows[0]?.[6] !== "Marca")
      throw Error(`Encabezados no reconocidos: ${name}`);
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if (!r.some((v) => text(v))) continue;
      const plate = text(r[4]);
      if (!normalize(plate) || !text(r[6])) {
        issues.push({
          sheet: name,
          row: i + 1,
          reason: "Chapa o marca ausente",
          values: r,
        });
        continue;
      }
      if (seen.has(normalize(plate)))
        throw Error(`Chapa repetida en el padrón: ${plate}`);
      seen.add(normalize(plate));
      const status = text(r[12]);
      result.push({
        plate,
        brand: text(r[6]),
        model: text(r[7]),
        model_year: number(r[10]),
        chassis: text(r[5]),
        department: text(r[1]),
        branch: text(r[3]),
        color: text(r[9]),
        vehicle_type: text(r[8]),
        fuel_provider: text(r[13]),
        notes: text(r[14]),
        responsible_name: text(r[0]),
        operational_status: /^operativa$/i.test(status)
          ? "Operativa"
          : /^inoperativa$/i.test(status)
            ? "Inoperativa"
            : /taller/i.test(status)
              ? "En taller"
              : "Sin informar",
        lifecycle_status: /vendid/i.test(text(r[14])) ? "Vendida" : "Activa",
        source_sheet: name,
        source_row: i + 1,
        raw_data: Object.fromEntries(rows[0].map((k, j) => [k, r[j]])),
      });
    }
  }
  return { rows: result, issues };
}
export function parseInitialHistory(workbook) {
  const rows = [],
    issues = [];
  for (const name of workbook.SheetNames) {
    if (name.trim().toUpperCase() === "CDM MANTENIMIENTO") continue;
    const s = workbook.Sheets[name];
    if (!s["!ref"]) continue;
    const range = XLSX.utils.decode_range(s["!ref"]);
    let header = 0;
    for (let i = 1; i <= Math.min(30, range.e.r + 1); i++)
      if (
        text(s[`A${i}`]?.v).toLowerCase() === "fecha" &&
        /^km\.?$/i.test(text(s[`B${i}`]?.v))
      ) {
        header = i;
        break;
      }
    if (!header) throw Error(`Encabezados no reconocidos: ${name}`);
    const match = /([A-Z]{3,4})[ -]*(\d{3})$/i.exec(name.trim());
    const plate = match ? match[1] + match[2] : "";
    for (let i = header + 1; i <= range.e.r + 1; i++) {
      const cells = {};
      for (let c = 0; c <= range.e.c; c++) {
        const coord = XLSX.utils.encode_cell({ r: i - 1, c }),
          cell = s[coord];
        if (cell && (cell.v != null || cell.f || cell.c))
          cells[coord] = {
            value: cell.v ?? null,
            format: cell.z ?? null,
            formula: cell.f ?? null,
            comments: cell.c ?? null,
          };
      }
      if (!Object.keys(cells).length) continue;
      const works = [];
      for (let c = 2; c <= 10; c++) {
        const col = XLSX.utils.encode_col(c),
          cell = s[`${col}${i}`];
        if (!cell || (!text(cell.v) && !cell.c?.length)) continue;
        let upper = text(s[`${col}${header - 1}`]?.v);
        const merge = s["!merges"]?.find(
          (m) => m.s.r === header - 2 && m.s.c <= c && m.e.c >= c,
        );
        if (!upper && merge)
          upper = text(s[XLSX.utils.encode_cell(merge.s)]?.v);
        works.push({
          work: [upper, text(s[`${col}${header}`]?.v)]
            .filter(Boolean)
            .join(" / "),
          value: cell.v ?? null,
          comment: cell.c?.map((c) => c.t).join("\n") ?? null,
          cell: `${col}${i}`,
        });
      }
      const occurred_on = date(
        s[`A${i}`]?.v,
        !!workbook.Workbook?.WBProps?.date1904,
      );
      if (!plate || !occurred_on)
        issues.push({
          sheet: name,
          row: i,
          reason: !plate
            ? "Chapa no identificada"
            : "Fecha no informada o inválida",
        });
      const invoice = s[`M${i}`];
      const invoice_number =
        invoice && XLSX.SSF.is_date(invoice.z ?? "General")
          ? null
          : text(invoice?.v) || null;
      rows.push({
        plate,
        occurred_on,
        odometer_km: number(s[`B${i}`]?.v),
        supplier: text(s[`L${i}`]?.v) || null,
        invoice_number,
        works,
        source_key: `${name}:${i}`,
        raw_data: { sheet: name, row: i, cells },
      });
    }
  }
  return { rows, issues };
}
