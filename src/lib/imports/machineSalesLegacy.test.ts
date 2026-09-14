import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import {
  inferLegacyMachineBrand,
  inferLegacyMachineChassis,
  inferLegacyMachineModel,
  inferLegacyMachineType,
  parseMachineSalesLegacyWorkbook,
} from "./machineSalesLegacy";

describe("historico de ventas de maquinas", () => {
  it("reconoce chasis, marca, tipo y modelo del archivo anterior", () => {
    const description = "SEMBRADORA MAESTRO 18.50 CF CHASSI 24491420";
    expect(inferLegacyMachineChassis(description)).toBe("24491420");
    expect(inferLegacyMachineBrand("PLANTADORA SEMBRADORA", description)).toBe("HORSCH");
    expect(inferLegacyMachineType("PLANTADORA SEMBRADORA", description)).toBe("SEMBRADORAS");
    expect(inferLegacyMachineModel(description)).toBe("MAESTRO 18.50");
  });

  it("preserva ventas y convierte devoluciones en unidades e importes negativos", () => {
    const sheet = XLSX.utils.aoa_to_sheet([
      ["Fecha Factura", "Sucursal", "Vendedor", "Cod. Mercaderia", "Nombre Mercaderia", "Tp. Movimento", "Cod. Entidad", "Entidad", "Grupo", "Código Factura", "Valor Medio", "Total Cobrado", "Saldo", "Cant. Unit.", "Total Venta"],
      ["19/01/2026", "CENTRAL", "VENDEDOR", "31230", "TRION 720 STAGE IIIA N L5500511 MOTOR 22566239", "S", "10", "CLIENTE A", "MAQ COSECHADORAS", "182150", 100, 100, 0, 1, 100],
      ["20/01/2026", "CENTRAL", "VENDEDOR", "31230", "TRION 720 STAGE IIIA N L5500511 MOTOR 22566239", "E", "10", "CLIENTE A", "MAQ COSECHADORAS", "182151", -40, -40, 0, -1, -40],
    ]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "maquinas");
    const binary = XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    const parsed = parseMachineSalesLegacyWorkbook(binary);
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0]).toMatchObject({ sucursal: "Santa Rita", cantidad: 1, total_venta: 100, chasis: "L5500511" });
    expect(parsed.rows[1]).toMatchObject({ cantidad: -1, total_venta: -40 });
    expect(parsed.facturacionNeta).toBe(60);
    expect(parsed.vendidas).toBe(1);
    expect(parsed.acreditadas).toBe(1);
  });
});
