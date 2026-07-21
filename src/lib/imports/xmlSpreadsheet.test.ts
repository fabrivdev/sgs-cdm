import { describe, expect, it } from "vitest";
import { parseSpreadsheetXml } from "@/lib/imports/xmlSpreadsheet";

describe("Spreadsheet XML", () => {
  it("preserva la primera columna cuando hay encabezados duplicados", () => {
    const workbook = parseSpreadsheetXml(`<?xml version="1.0"?>
      <Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
        xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
        <Worksheet ss:Name="Productos">
          <Table>
            <Row>
              <Cell><Data ss:Type="String">Codigo</Data></Cell>
              <Cell><Data ss:Type="String">Descripcion</Data></Cell>
              <Cell><Data ss:Type="String">Descripcion</Data></Cell>
            </Row>
            <Row>
              <Cell><Data ss:Type="String">REP001</Data></Cell>
              <Cell><Data ss:Type="String">Filtro principal</Data></Cell>
              <Cell><Data ss:Type="String"></Data></Cell>
            </Row>
          </Table>
        </Worksheet>
      </Workbook>`);

    expect(workbook.sheets[0].headers).toEqual(["Codigo", "Descripcion", "Descripcion_2"]);
    expect(workbook.sheets[0].rows[0]).toMatchObject({
      Codigo: "REP001",
      Descripcion: "Filtro principal",
      Descripcion_2: "",
    });
  });
});
