import { describe, expect, it } from "vitest";
import { decodeXmlBytes, parseSpreadsheetXml } from "@/lib/imports/xmlSpreadsheet";

describe("Spreadsheet XML", () => {
  it("respeta ISO-8859-1 declarado y conserva tildes", () => {
    const source = '<?xml version="1.0" encoding="ISO-8859-1"?><x>Dep\u00f3sito</x>';
    const bytes = Uint8Array.from([...source].map((character) => character.charCodeAt(0)));
    expect(decodeXmlBytes(bytes)).toContain("Dep\u00f3sito");
  });

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

  it("respeta ss:Index y decodifica entidades XML en el lector r\u00e1pido", () => {
    const workbook = parseSpreadsheetXml(`<?xml version="1.0"?>
      <Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
        <Worksheet ss:Name="A &amp; B"><Table>
          <Row><Cell><Data ss:Type="String">Uno</Data></Cell><Cell ss:Index="3"><Data ss:Type="String">Tres</Data></Cell></Row>
          <Row><Cell><Data ss:Type="String">x &amp; y</Data></Cell><Cell ss:Index="3"><Data ss:Type="String">&#241;</Data></Cell></Row>
        </Table></Worksheet>
      </Workbook>`);
    expect(workbook.sheets[0]).toMatchObject({
      name: "A & B",
      headers: ["Uno", "col_2", "Tres"],
      rows: [{ Uno: "x & y", col_2: "", Tres: "\u00f1" }],
    });
  });
});
