import { describe, expect, it } from "vitest";
import { groupParkBilling, parkBillingClientIds } from "./parkBillingIdentity";

const active = { id: "active", ruc: "2424941-6" };
const old = { id: "old", ruc: "24249416" };
const other = { id: "other", ruc: "5549523-0" };

function summary(actual: number, prior = 0, service: string | null = null) {
  return {
    fact_actual: actual, fact_prev: prior, tiene_rep_rango: false,
    tiene_srv_rango: service !== null, ult_repuesto: null, ult_servicio: service,
  };
}

describe("billing identity in Parque", () => {
  it("includes all visible sheets with the same fiscal RUC and leaves other customers separate", () => {
    expect(parkBillingClientIds(active.id, [active, old, other])).toEqual(["active", "old"]);
    expect(parkBillingClientIds(other.id, [active, old, other])).toEqual(["other"]);
    expect(parkBillingClientIds("missing", [active, old, other])).toEqual(["missing"]);
    expect(parkBillingClientIds("a", [{ id: "a", ruc: "0000000-0" }, { id: "b", ruc: "00000000" }])).toEqual(["a"]);
  });

  it("moves the hidden sheet into the park holder and counts each summary once", () => {
    const summaries = new Map([
      ["active", summary(140, 500, "2026-05-05")],
      ["old", summary(29028.21, -40, "2026-03-26")],
      ["other", summary(10)],
    ]);
    const result = groupParkBilling(summaries, [active, other], [old, active, other]);

    expect(result.get("active")).toMatchObject({
      fact_actual: 29168.21, fact_prev: 460, ult_servicio: "2026-05-05", tiene_srv_rango: true,
    });
    expect(result.has("old")).toBe(false);
    expect(result.get("other")).toEqual(summary(10));
    expect(summaries.has("old")).toBe(true);
  });

  it("recovers a missing owner summary and avoids double counting across two visible sheets", () => {
    const original = new Map([["old", summary(2170)]]);
    expect(groupParkBilling(original, [active], [active, old]).get("active")).toEqual(summary(2170));
    expect(groupParkBilling(original, [active, old], [active, old])).toEqual(original);
  });
});
