import { describe, expect, it } from "vitest";
import { mapMachineRegistrySheet, parseMachineStockXml, reconcileMachineStockChassis } from "@/lib/imports";

const SAMPLE = `<?xml version="1.0"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Worksheet ss:Name="Stock de Maquinarias"><Table>
<Row><Cell><Data ss:Type="String">FILIAL</Data></Cell><Cell><Data ss:Type="String">DEPOSITO</Data></Cell><Cell><Data ss:Type="String">Producto</Data></Cell><Cell><Data ss:Type="String">TIPO</Data></Cell><Cell><Data ss:Type="String">MARCA</Data></Cell><Cell><Data ss:Type="String">MODELO</Data></Cell><Cell><Data ss:Type="String">ESTADO</Data></Cell><Cell><Data ss:Type="String">CHASIS</Data></Cell><Cell><Data ss:Type="String">Saldo Actual</Data></Cell></Row>
<Row><Cell><Data ss:Type="String">01 - Santa Rita</Data></Cell><Cell><Data ss:Type="String">MN - MAQUINAS NUEVAS</Data></Cell><Cell><Data ss:Type="String">VEIC_000033</Data></Cell><Cell><Data ss:Type="String">SEMBRADORA</Data></Cell><Cell><Data ss:Type="String">HORSCH</Data></Cell><Cell><Data ss:Type="String">MAESTRO CF 18.45</Data></Cell><Cell><Data ss:Type="String">Nuevo</Data></Cell><Cell><Data ss:Type="String">24491382</Data></Cell><Cell><Data ss:Type="Number">1</Data></Cell></Row>
</Table></Worksheet></Workbook>`;

describe("stock de maquinarias TOTVS", () => {
  it("mapea la fila y normaliza la sucursal y el estado", () => {
    const result = parseMachineStockXml("stock_de_maquinarias.xml", SAMPLE);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      productCode: "VEIC_000033",
      branch: "Santa Rita",
      warehouse: "MN - MAQUINAS NUEVAS",
      brand: "HORSCH",
      model: "MAESTRO CF 18.45",
      condition: "Nuevo",
      chassis: "24491382",
      balance: 1,
      sourceRow: 2,
    });
  });

  it("conserva unidades con el mismo producto cuando tienen chasis distintos", () => {
    const duplicatedProduct = SAMPLE.replace(
      "</Table>",
      '<Row><Cell><Data ss:Type="String">01 - Santa Rita</Data></Cell><Cell><Data ss:Type="String">MN - MAQUINAS NUEVAS</Data></Cell><Cell><Data ss:Type="String">VEIC_000033</Data></Cell><Cell><Data ss:Type="String">SEMBRADORA</Data></Cell><Cell><Data ss:Type="String">HORSCH</Data></Cell><Cell><Data ss:Type="String">MAESTRO CF 18.45</Data></Cell><Cell><Data ss:Type="String">Nuevo</Data></Cell><Cell><Data ss:Type="String">24491383</Data></Cell><Cell><Data ss:Type="Number">1</Data></Cell></Row></Table>',
    );
    const result = parseMachineStockXml("stock_de_maquinarias.xml", duplicatedProduct);

    expect(result.rows).toHaveLength(2);
    expect(result.rows.map((row) => row.chassis)).toEqual(["24491382", "24491383"]);
  });

  it("completa un chasis-placeholder desde Maquinarias por CODPRO exacto", () => {
    const stock = parseMachineStockXml(
      "stock_de_maquinarias.xml",
      SAMPLE.replace("24491382", "MAESTRO CF 18.45"),
    ).rows;
    const registry = mapMachineRegistrySheet("maquinarias.xml", {
      name: "Maquinarias",
      headers: ["CODPRO", "Chasis", "MODELO"],
      rows: [{ CODPRO: " VEIC_000033 ", Chasis: "24491382", MODELO: "MAESTRO CF 18.45" }],
    }).rows;

    const result = reconcileMachineStockChassis(stock, registry);

    expect(result.rows[0].chassis).toBe("24491382");
    expect(result.rows[0].raw).toMatchObject({
      CHASIS_STOCK_ORIGINAL: "MAESTRO CF 18.45",
      CHASIS_RESPALDO_MAQUINARIAS: "24491382",
      CHASIS_FUENTE: "maquinarias_por_codpro",
    });
    expect(result.filledFromRegistry).toBe(1);
    expect(result.unresolvedPlaceholders).toBe(0);
  });

  it("no agrega máquinas ajenas al stock ni pisa un chasis válido en conflicto", () => {
    const stock = parseMachineStockXml("stock_de_maquinarias.xml", SAMPLE).rows;
    const registry = mapMachineRegistrySheet("maquinarias.xml", {
      name: "Maquinarias",
      headers: ["CODPRO", "Chasis"],
      rows: [
        { CODPRO: "VEIC_000033", Chasis: "OTRO-CHASIS" },
        { CODPRO: "VEIC_999999", Chasis: "NO-DEBE-ENTRAR" },
      ],
    }).rows;

    const result = reconcileMachineStockChassis(stock, registry);

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].chassis).toBe("24491382");
    expect(result.validConflicts).toBe(1);
    expect(result.filledFromRegistry).toBe(0);
  });

  it("deja visible un placeholder cuando Maquinarias tampoco informa chasis", () => {
    const stock = parseMachineStockXml(
      "stock_de_maquinarias.xml",
      SAMPLE.replace("24491382", "MAESTRO CF 18.45"),
    ).rows;
    const registry = mapMachineRegistrySheet("maquinarias.xml", {
      name: "Maquinarias",
      headers: ["CODPRO", "Chasis"],
      rows: [{ CODPRO: "VEIC_000033", Chasis: "" }],
    }).rows;

    const result = reconcileMachineStockChassis(stock, registry);

    expect(result.rows[0].chassis).toBe("MAESTRO CF 18.45");
    expect(result.unresolvedPlaceholders).toBe(1);
  });

  it("no elige entre dos filas de Maquinarias con el mismo CODPRO", () => {
    const stock = parseMachineStockXml(
      "stock_de_maquinarias.xml",
      SAMPLE.replace("24491382", "MAESTRO CF 18.45"),
    ).rows;
    const registry = mapMachineRegistrySheet("maquinarias.xml", {
      name: "Maquinarias",
      headers: ["CODPRO", "Chasis"],
      rows: [
        { CODPRO: "VEIC_000033", Chasis: "24491382" },
        { CODPRO: "VEIC_000033", Chasis: "24491383" },
      ],
    }).rows;

    const result = reconcileMachineStockChassis(stock, registry);

    expect(result.rows[0].chassis).toBe("MAESTRO CF 18.45");
    expect(result.ambiguousProductCodes).toBe(1);
    expect(result.unresolvedPlaceholders).toBe(1);
  });
});
