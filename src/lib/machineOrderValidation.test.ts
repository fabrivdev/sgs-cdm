import { describe, expect, it } from "vitest";
import { catalogLineKey, catalogModelsForBrand, exactCatalogName, normalizeNpCode, reconcileCatalogLine, reviewCatalogLine, upperMachineText, validMachineDate, type MachineCatalog } from "./machineOrderValidation";

const catalog: MachineCatalog = { brands: [{ nombre: "HORSCH", activa: true }, { nombre: "ANTIGUA", activa: false }], models: [
  { id: "1", marca_nombre: "HORSCH", subgrupo: "PULVERIZADORAS", nombre: "LEEB 5.280", activo: true },
  { id: "2", marca_nombre: "HORSCH", subgrupo: "SEMBRADORAS", nombre: "MAESTRO 18 CF", activo: true },
  { id: "3", marca_nombre: "HORSCH", subgrupo: "SUELO", nombre: "RETIRADO", activo: false },
] };

describe("NP format", () => {
  it.each(["0000002", "2", "np2", "NP0002", " NP - 002 "])("normalizes %s to NP0002", value => expect(normalizeNpCode(value)).toBe("NP0002"));
  it.each(["12345", "NP12345", "NP12A3", "NP1/2", "", "NP", "-2"])("rejects %s without discarding significant digits", value => expect(normalizeNpCode(value)).toBeNull());
  it("retains the four-digit range", () => { expect(normalizeNpCode("0")).toBe("NP0000"); expect(normalizeNpCode("9999")).toBe("NP9999"); });
});

describe("catalog validation", () => {
  it("lists every active type for a brand, including LEEB, without mixing brands", () => {
    const expanded = { ...catalog, brands: [...catalog.brands, { nombre: "JACTO", activa: true }], models: [...catalog.models,
      { id: "j", marca_nombre: "JACTO", nombre: "STAR 2500", subgrupo: "PULVERIZADORAS", activo: true }] };
    expect(catalogModelsForBrand(expanded, "horsch").map(m => m.nombre)).toEqual(["LEEB 5.280", "MAESTRO 18 CF"]);
    expect(catalogModelsForBrand(expanded, "JACTO").map(m => m.nombre)).toEqual(["STAR 2500"]);
    expect(reconcileCatalogLine({ marca: "JACTO", modelo: "star 2500", subgrupo: "OTRO" }, expanded).subgrupo).toBe("PULVERIZADORAS");
  });
  it("resolves a reviewed alias and type, but never changes the model numbers", () => {
    const withAliases = { ...catalog, aliases: [
      { marca: "HORSCH", alias: "MAESTRO CF 18", modelo_catalogo_id: "2" },
      { marca: "HORSCH", alias: "LEEB 5250", modelo_catalogo_id: "1" },
      { marca: "HORSCH", alias: "LEEB", modelo_catalogo_id: "1" },
    ] };
    expect(reconcileCatalogLine({ marca: "HORSCH", modelo: "MAESTRO CF 18", subgrupo: "OTRO" }, withAliases)).toEqual({ marca: "HORSCH", modelo: "MAESTRO 18 CF", subgrupo: "SEMBRADORAS" });
    for (const modelo of ["LEEB", "LEEB 5250", "LEEB 6.280"]) {
      expect(reviewCatalogLine({ marca: "HORSCH", modelo, subgrupo: "OTRO" }, withAliases).match).toBeUndefined();
    }
  });
  it("does not resolve aliases into retired models or another brand", () => {
    const c = { ...catalog, aliases: [{ marca: "CLAAS", alias: "MAESTRO CF 18", modelo_catalogo_id: "2" }, { marca: "HORSCH", alias: "VIEJO", modelo_catalogo_id: "3" }] };
    expect(reviewCatalogLine({ marca: "CLAAS", modelo: "MAESTRO CF 18", subgrupo: "OTRO" }, c).match).toBeUndefined();
    expect(reviewCatalogLine({ marca: "HORSCH", modelo: "VIEJO", subgrupo: "OTRO" }, c).match).toBeUndefined();
  });
  it("maps formatting differences to the exact catalog name and correct type", () => {
    expect(reconcileCatalogLine({ marca: "horsch", modelo: "leeb 5 280", subgrupo: "OTRO" }, catalog)).toEqual({ marca: "HORSCH", modelo: "LEEB 5.280", subgrupo: "PULVERIZADORAS" });
  });
  it("suggests but never silently substitutes S for 5 in a model", () => {
    const line = { marca: "HORSCH", modelo: "leeb S 280", subgrupo: "PULVERIZADORAS" };
    const review = reviewCatalogLine(line, catalog);
    expect(review.match).toBeUndefined(); expect(review.needsConfirmation).toBe(true);
    expect(review.suggestions[0].nombre).toBe("LEEB 5.280");
    expect(reconcileCatalogLine(line, catalog).modelo).toBe("LEEB S 280");
  });
  it("never matches another brand's model", () => {
    expect(reviewCatalogLine({ marca: "CLAAS", modelo: "LEEB 5.280", subgrupo: "PULVERIZADORAS" }, catalog).match).toBeUndefined();
  });
  it("detects removed brands and models", () => {
    expect(reviewCatalogLine({ marca: "ANTIGUA", modelo: "X", subgrupo: "OTRO" }, catalog).archived).toBe(true);
    const review = reviewCatalogLine({ marca: "HORSCH", modelo: "retirado", subgrupo: "SUELO" }, catalog);
    expect(review.archived).toBe(true); expect(review.match).toBeUndefined(); expect(review.suggestions).toHaveLength(0);
    expect(reviewCatalogLine({ marca: "HORSCH", modelo: "RETIRADO", subgrupo: "OTRO" }, catalog).archived).toBe(true);
  });
  it("invalidates confirmation after a model or brand is changed", () => {
    const line = { marca: "HORSCH", modelo: "NUEVO 123", subgrupo: "OTRO" };
    expect(catalogLineKey(line)).not.toBe(catalogLineKey({ ...line, modelo: "NUEVO 124" }));
    expect(catalogLineKey(line)).not.toBe(catalogLineKey({ ...line, marca: "CLAAS" }));
  });
  it("does not guess a type when an exact model exists in several types", () => {
    const ambiguous = { ...catalog, models: [...catalog.models, { ...catalog.models[0], id: "4", subgrupo: "OTRO" }] };
    expect(reviewCatalogLine({ marca: "HORSCH", modelo: "LEEB 5.280", subgrupo: "TRACTORES" }, ambiguous).match).toBeUndefined();
  });
});

describe("data normalization", () => {
  it("uppercases real values preserving accents and typing spaces", () => expect(upperMachineText("José maíz ")).toBe("JOSÉ MAÍZ "));
  it("recognizes names only when the match is exact and unique", () => {
    expect(exactCatalogName("Carlos Benitez", ["CARLOS BENITEZ"])).toBe("CARLOS BENITEZ");
    expect(exactCatalogName("Carlos Benitez", ["CARLOS JAVIER BENITEZ ZARZA"])).toBeNull();
  });
  it("rejects nonexistent calendar dates", () => {
    expect(validMachineDate("2026-02-30")).toBe(false); expect(validMachineDate("2026-13-01")).toBe(false);
    expect(validMachineDate("2026-07-07")).toBe(true); expect(validMachineDate("2024-02-29")).toBe(true);
  });
});
