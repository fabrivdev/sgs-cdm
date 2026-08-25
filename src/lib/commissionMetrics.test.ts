import { describe, expect, it } from "vitest";
import {
  commissionClockBlockKey,
  totalUniqueCommissionOrderHours,
  uniqueCommissionBlockHours,
} from "./commissionMetrics";

const block = {
  sucursal: "Santa Rita",
  os_numero: "01-00000097",
  fecha_inicio: "2026-08-01",
  hora_inicio: "14:00:00",
  fecha_fin: "2026-08-01",
  hora_fin: "23:00:00",
  horas_calculadas: 9,
};

describe("commission OS duration", () => {
  it("counts one shared 9-hour block once for two technicians", () => {
    expect(uniqueCommissionBlockHours([
      block,
      { ...block },
    ])).toBe(9);
  });

  it("does not use the manually edited time type in block identity", () => {
    const originalKey = commissionClockBlockKey(block);
    const edited = { ...block, tipo_tiempo: "Garantia" };
    expect(commissionClockBlockKey(edited)).toBe(originalKey);
  });

  it("adds different clock blocks and keeps orders separate", () => {
    const secondBlock = {
      ...block,
      fecha_inicio: "2026-08-02",
      fecha_fin: "2026-08-02",
      hora_inicio: "10:00:00",
      hora_fin: "17:00:00",
      horas_calculadas: 7,
    };
    const anotherOrder = { ...block, os_numero: "01-00000108", horas_calculadas: 4 };

    expect(totalUniqueCommissionOrderHours([
      block,
      { ...block },
      secondBlock,
      anotherOrder,
    ])).toBe(20);
  });
});
