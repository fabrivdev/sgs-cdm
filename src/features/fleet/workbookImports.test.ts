import { describe, it, expect } from "vitest";
import XLSX from "xlsx";
import {
  parseInitialHistory,
  parseInitialVehicles,
  parseFuel,
} from "./workbookImports.mjs";
const book = (name: string, rows: unknown[][]) => {
  const b = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(b, XLSX.utils.aoa_to_sheet(rows), name);
  return b;
};
describe("source-preserving fleet imports", () => {
  it("preserves work marks, quantities, comments and unknown cells without inventing costs or dates", () => {
    const b = book("MODELO TEST 123", [
      ["Título"],
      [null, null, "Filtros", null, null, null, null, null, "Aceite"],
      ["Fecha", "Km", "Aire", null, null, null, null, null, "Motor"],
      [
        null,
        1200,
        "X",
        null,
        null,
        null,
        null,
        null,
        7,
        null,
        null,
        "Taller",
        "001",
        "original sin encabezado",
      ],
    ]);
    b.Sheets["MODELO TEST 123"].C4.c = [
      { a: "Autor", t: "Cambiar también junta" },
    ];
    const r = parseInitialHistory(b);
    expect(r.rows).toHaveLength(1);
    expect(r.issues).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({
      plate: "TEST123",
      occurred_on: null,
      works: [
        {
          work: "Filtros / Aire",
          value: "X",
          comment: "Cambiar también junta",
        },
        { work: "Aceite / Motor", value: 7 },
      ],
    });
    expect(r.rows[0].raw_data.cells.N4.value).toBe("original sin encabezado");
    expect(r.rows[0]).not.toHaveProperty("amount");
  });
  it("requires explicit fleet sheets and rejects duplicated normalized plates", () => {
    const b = book("Base General", [
      [
        "Responsable",
        "Departamento",
        "Cargo",
        "Sucursal",
        "Chapa",
        "Chassis",
        "Marca",
        "Marca/Modelo",
        "Tipo",
        "Color",
        "Año",
        "Kilometraje",
        "Status",
        "Flota Combustible",
        "Observaciones",
      ],
      ["R", "D", null, "S", "TEST-123", null, "Marca", "Modelo"],
      ["R", "D", null, "S", "TEST 123", null, "Marca", "Modelo"],
    ]);
    expect(() => parseInitialVehicles(b)).toThrow("hojas autorizadas");
    expect(() => parseInitialVehicles(b, ["Base General"])).toThrow("repetida");
  });
  it("retains signed fuel values, reconciles the footer and rejects differing duplicate receipts", () => {
    const headers = [
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
    const a = [
      "Tarjeta: 123 - Placa: TEST123 - Marca: X",
      "001",
      "002",
      "01/10/2026",
      "10:00",
      -10,
      -100,
      1000,
      900,
      20,
      "Diesel",
      "Test",
    ];
    expect(parseFuel(book("Detalle Descuento", [headers, a]))[0]).toMatchObject(
      { liters: -10, net_amount: -100, plate: "TEST123", currency: null },
    );
    expect(() =>
      parseFuel(
        book("Detalle Descuento", [
          headers,
          a,
          [...a.slice(0, 5), 15, ...a.slice(6)],
        ]),
      ),
    ).toThrow("duplicado");
    expect(() =>
      parseFuel(
        book("Detalle Descuento", [
          headers,
          a,
          ["TOTAL CLIENTE", null, null, null, null, 1, 2],
        ]),
      ),
    ).toThrow("concilian");
  });
});
it("reads currency from the sheet or uses an explicit fallback", () => {
  const headers = [
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
    "Moneda",
  ];
  const row = [
    "Tarjeta: 123 - Placa: TEST123 - Marca: X",
    "001",
    "002",
    "01/10/2026",
    "10:00",
    10,
    100,
    1000,
    900,
    20,
    "Diesel",
    "Test",
    "USD",
  ];
  expect(
    parseFuel(book("Detalle Descuento", [headers, row]), "PYG")[0].currency,
  ).toBe("USD");
  expect(
    parseFuel(
      book("Detalle Descuento", [headers, [...row.slice(0, -1), null]]),
      "PYG",
    )[0].currency,
  ).toBe("PYG");
});
