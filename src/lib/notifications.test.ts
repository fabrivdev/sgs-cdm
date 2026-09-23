import { describe, expect, it } from "vitest";
import {
  machineSaleConfirmationClientId,
  machineSaleNotificationData,
  machineStockReturnNotificationData,
  type AppNotification,
} from "./notifications";

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

describe("machine resale notifications", () => {
  it("preserves the prior Park and credit-note context", () => {
    expect(machineSaleNotificationData({
      ...notification({
        chasis: "ABC123",
        parque_activa: true,
        cliente_actual_nombre: "CLIENTE EJEMPLO",
        vendedor: "VENDEDOR DE LA FACTURA",
        nc_documento: "0010010000001",
        nc_factura_original: "0010010000002",
        revision_sugerida: "REFACTURACION_PROBABLE",
      }),
      tipo: "venta_maquina_reingreso",
    })).toMatchObject({
      chasis: "ABC123",
      parque_activa: true,
      cliente_actual_nombre: "CLIENTE EJEMPLO",
      vendedor: "VENDEDOR DE LA FACTURA",
      nc_documento: "0010010000001",
      nc_factura_original: "0010010000002",
      revision_sugerida: "REFACTURACION_PROBABLE",
    });
  });

  it("keeps the exact current Park owner when confirming a refacturation", () => {
    expect(machineSaleConfirmationClientId({
      cliente_actual_id: "park-owner-id",
    }, "canonical-catalog-id", "REFACTURACION")).toBe("park-owner-id");
  });

  it("uses the selected customer only for a sale or transfer", () => {
    expect(machineSaleConfirmationClientId({
      cliente_actual_id: "park-owner-id",
    }, "new-owner-id", "VENTA")).toBe("new-owner-id");
  });

  it("falls back to the selected customer when a legacy notification lacks the Park owner id", () => {
    expect(machineSaleConfirmationClientId({}, "selected-owner-id", "REFACTURACION")).toBe("selected-owner-id");
  });
});
