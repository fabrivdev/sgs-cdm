import { describe, expect, it } from "vitest";
import { parseMachineStockXml } from "@/lib/imports";

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
});
