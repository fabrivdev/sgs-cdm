import { describe, expect, it } from "vitest";
import { machineStockReturnNotificationData, type AppNotification } from "./notifications";

const notification = (datos: AppNotification["datos"]): AppNotification => ({
  id: "notification-1",
  tipo: "stock_chasis_en_parque",
  titulo: "Posible máquina tomada como parte de pago",
  mensaje: null,
  datos,
  estado: "pendiente",
  visto_por: [],
  creado_en: "2026-09-22T12:00:00.000Z",
});

describe("machine stock return notifications", () => {
  it("preserves the Park owner and Stock destination context", () => {
    expect(machineStockReturnNotificationData(notification({
      chasis: "ABC-123",
      cliente_nombre: "CLIENTE ACTUAL",
      stock_sucursal: "Santa Rita",
      destino: "CAMPOS DEL MANANA",
    }))).toMatchObject({
      chasis: "ABC-123",
      cliente_nombre: "CLIENTE ACTUAL",
      stock_sucursal: "Santa Rita",
      destino: "CAMPOS DEL MANANA",
    });
  });

  it("ignores malformed notification data", () => {
    expect(machineStockReturnNotificationData(notification([]))).toEqual({});
  });
});
