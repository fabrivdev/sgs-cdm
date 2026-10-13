import { describe, expect, it } from "vitest";
import {
  describeImportError,
  runImportProgressStep,
  type ImportProgressEvent,
} from "./importProgress";

describe("describeImportError", () => {
  it("preserva etapa y campos seguros de PostgREST", () => {
    expect(describeImportError({
      code: "23505",
      message: "clave duplicada",
      details: "La identidad ya existe",
      hint: "Revise el origen",
      request: { headers: { authorization: "Bearer secreto" } },
    }, "billing.validate")).toBe(
      "Etapa: billing.validate | Codigo: 23505 | clave duplicada | Detalle: La identidad ya existe | Sugerencia: Revise el origen",
    );
  });

  it("nunca degrada objetos remotos a [object Object]", () => {
    expect(describeImportError({ message: { reason: "rechazado" } }, "billing.persist"))
      .toBe('Etapa: billing.persist | {"reason":"rechazado"}');
    expect(describeImportError({ unexpected: true })).toBe("Error remoto sin detalle legible");
  });

  it("acepta Error y texto sin exponer propiedades adicionales", () => {
    const error = Object.assign(new Error("fallo controlado"), { authorization: "secreto" });
    expect(describeImportError(error, "service-orders.batch"))
      .toBe("Etapa: service-orders.batch | fallo controlado");
    expect(describeImportError("fallo simple")).toBe("fallo simple");
    expect(describeImportError(new Error("Etapa: billing.validate | fallo"), "billing.validate"))
      .toBe("Etapa: billing.validate | fallo");
  });
});

describe("runImportProgressStep", () => {
  it("emite inicio y exito en orden y avanza solo al completar", async () => {
    const events: ImportProgressEvent[] = [];
    const value = await runImportProgressStep({
      callback: (event) => events.push(event),
      phase: "source.batch",
      completed: 500,
      total: 1200,
      batch: 2,
      batchRows: 500,
      action: async () => "ok",
    });

    expect(value).toBe("ok");
    expect(events.map(({ status, completed }) => ({ status, completed }))).toEqual([
      { status: "started", completed: 500 },
      { status: "succeeded", completed: 1000 },
    ]);
    expect(events[1].durationMs).toBeGreaterThanOrEqual(0);
  });

  it("emite error sin avanzar cuando la accion rechaza", async () => {
    const events: ImportProgressEvent[] = [];
    await expect(runImportProgressStep({
      callback: (event) => events.push(event),
      phase: "source.batch",
      completed: 500,
      total: 1200,
      batchRows: 500,
      action: async () => { throw new Error("fallo controlado"); },
    })).rejects.toThrow("fallo controlado");

    expect(events.map(({ status, completed }) => ({ status, completed }))).toEqual([
      { status: "started", completed: 500 },
      { status: "failed", completed: 500 },
    ]);
  });

  it("reconoce errores devueltos por Supabase sin cambiar el contrato del caller", async () => {
    const events: ImportProgressEvent[] = [];
    const response = await runImportProgressStep({
      callback: (event) => events.push(event),
      phase: "source.rpc",
      completed: 0,
      total: 10,
      batchRows: 10,
      action: async () => ({ data: null, error: { message: "rechazado" } }),
      resultError: (result) => result.error,
    });

    expect(response.error?.message).toBe("rechazado");
    expect(events.at(-1)).toMatchObject({
      status: "failed",
      completed: 0,
      error: "Etapa: source.rpc | rechazado",
    });
  });

  it("no altera la importacion si el consumidor de progreso falla", async () => {
    const result = await runImportProgressStep({
      callback: () => { throw new Error("fallo de UI"); },
      phase: "source.rpc",
      completed: 0,
      total: 1,
      batchRows: 1,
      action: async () => "persistido",
    });

    expect(result).toBe("persistido");
  });
});
