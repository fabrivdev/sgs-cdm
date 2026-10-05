import { describe, expect, it } from "vitest";
import type { ClientIdentityRow } from "./clientIdentity";
import { resolveWorkClientText, searchWorkClients, workClientGroups, workClientNameKey } from "./workClientSelection";

const fields = (id: string, nombre: string, rest: Partial<ClientIdentityRow> = {}): ClientIdentityRow => ({ id, nombre, ...rest });
const branchRows = [
  fields("base", "AGRÍCOLA DEL ESTE S.A.", { ruc: "80012345-6" }),
  fields("branch", "AGRICOLA DEL ESTE SA - SANTA RITA", { ruc: "800123456", cod_entidad: "000123" }),
  fields("historic", "AGROESTE", { ruc: "80012345-6" }),
];

describe("workClientNameKey", () => {
  it("normalizes accents, spacing, case and punctuation without changing the input", () => {
    expect(workClientNameKey("  Agrícola del Este, S. A.  ")).toBe("AGRICOLADELESTESA");
    expect(workClientNameKey("Álvaro 123-4")).toBe("ALVARO1234");
  });
});

describe("workClientGroups", () => {
  it("keeps one safe identity with all original branch and historical records", () => {
    const rows = branchRows.map(row => ({ ...row, sucursal: "Santa Rita" }));
    const before = structuredClone(rows);
    const groups = workClientGroups(rows);
    expect(groups).toHaveLength(1);
    expect(groups[0].members).toEqual(rows);
    expect(groups[0].members.every(row => rows.includes(row))).toBe(true);
    expect(rows).toEqual(before);
  });

  it("groups normalized legal names and known branch suffixes without fiscal data", () => {
    const groups = workClientGroups([
      fields("one", "EMPRESA TEST S.A."),
      fields("two", "Empresa Test SA - LOMA PLATA"),
      fields("three", "OTHER COMPANY"),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups.find(group => group.members.some(row => row.id === "one"))?.members.map(row => row.id)).toEqual(["one", "two"]);
  });

  it("groups a shared complete entity code when there is no RUC conflict", () => {
    const groups = workClientGroups([
      fields("one", "Nombre legal", { cod_entidad: "001234" }),
      fields("two", "Nombre histórico", { cod_entidad: "00-1234" }),
    ]);
    expect(groups).toHaveLength(1);
  });

  it("does not join a RUC to another client's entity code", () => {
    const groups = workClientGroups([
      fields("tax", "Cliente fiscal", { ruc: "12345" }),
      fields("code", "Otro cliente", { cod_entidad: "12345" }),
    ]);
    expect(groups).toHaveLength(2);
    expect(resolveWorkClientText("12345", groups)).toEqual({ kind: "ambiguous" });
  });

  it("does not use short entity codes or malformed short RUCs to group unrelated names", () => {
    const groups = workClientGroups([
      fields("one", "Primero", { cod_entidad: "17", ruc: "1234" }),
      fields("two", "Segundo", { cod_entidad: "17", ruc: "1234" }),
    ]);
    expect(groups).toHaveLength(2);
  });

  it("separates identical names with conflicting RUCs and requires explicit identity selection", () => {
    const groups = workClientGroups([
      fields("one", "EMPRESA TEST", { ruc: "80011111-1" }),
      fields("two", "Empresa Test", { ruc: "80022222-2" }),
    ]);
    expect(groups).toHaveLength(2);
    expect(resolveWorkClientText("empresa test", groups, "one")).toEqual({ kind: "ambiguous" });
    expect(searchWorkClients(groups, "empresa test").map(match => match.client.ruc).sort()).toEqual(["80011111-1", "80022222-2"]);
  });

  it("does not let a shared entity code override conflicting RUCs", () => {
    const groups = workClientGroups([
      fields("one", "Primero", { ruc: "80011111-1", cod_entidad: "000123" }),
      fields("two", "Segundo", { ruc: "80022222-2", cod_entidad: "000123" }),
    ]);
    expect(groups).toHaveLength(2);
    expect(resolveWorkClientText("000123", groups)).toEqual({ kind: "ambiguous" });
  });

  it("keeps an unverified bridge separate instead of joining two known fiscal identities", () => {
    const rows = [
      fields("one", "Primero", { ruc: "80011111-1" }),
      fields("bridge", "Primero", { cod_entidad: "000123" }),
      fields("two", "Segundo", { ruc: "80022222-2", cod_entidad: "000123" }),
    ];
    for (const ordered of [rows, [...rows].reverse(), [rows[1], rows[2], rows[0]]]) {
      const groups = workClientGroups(ordered);
      expect(groups).toHaveLength(3);
      expect(groups.every(group => group.members.length === 1)).toBe(true);
      expect(resolveWorkClientText("Primero", groups, "one")).toEqual({ kind: "ambiguous" });
      expect(resolveWorkClientText("Segundo", groups)).toEqual({ kind: "existing", client: rows[2] });
    }
  });

  it("retains safe same-RUC aliases within a conflicted component", () => {
    const rows = [
      fields("one", "NOMBRE COMPARTIDO", { ruc: "80011111-1" }),
      fields("alias", "ALIAS UNO", { ruc: "80011111-1" }),
      fields("two", "NOMBRE COMPARTIDO", { ruc: "80022222-2" }),
    ];
    const groups = workClientGroups(rows);
    expect(groups).toHaveLength(2);
    expect(groups.find(group => group.members.some(row => row.id === "one"))?.members.map(row => row.id)).toEqual(["one", "alias"]);
    expect(resolveWorkClientText("ALIAS UNO", groups)).toEqual({ kind: "existing", client: rows[1] });
  });
});

describe("searchWorkClients", () => {
  it.each([
    ["del este", "branch"],
    ["santa rita", "branch"],
    ["agroeste", "historic"],
    ["000123", "branch"],
  ])("searches every raw alias/identifier and returns one real record for %s", (query, expectedId) => {
    const matches = searchWorkClients(workClientGroups(branchRows), query);
    expect(matches).toHaveLength(1);
    expect(matches[0].client.id).toBe(expectedId);
    expect(branchRows).toContain(matches[0].client);
    expect(matches[0].aliases).toEqual(branchRows.map(row => row.nombre).filter(name => name !== matches[0].client.nombre));
  });

  it("does not filter a matching client by branch metadata or require machine data", () => {
    const rows = [
      { ...fields("one", "CLIENTE SIN PARQUE"), sucursal: "Campo 9", maquinas: [] },
      { ...fields("two", "OTRO CLIENTE"), sucursal: "Santa Rita", maquinas: [] },
    ];
    expect(searchWorkClients(workClientGroups(rows), "sin parque")[0].client).toBe(rows[0]);
  });

  it("keeps the current raw ID when matching duplicate names and offers no duplicate choice", () => {
    const rows = [fields("one", "EMPRESA"), fields("two", "EMPRESA")];
    const matches = searchWorkClients(workClientGroups(rows), "EMPRESA", "two");
    expect(matches).toHaveLength(1);
    expect(matches[0].client.id).toBe("two");
    expect(matches[0].aliases).toEqual([]);
  });

  it("returns stable real row choices after repeated calls and catalog ordering changes", () => {
    const rows = [fields("z", "EMPRESA"), fields("a", "EMPRESA")];
    for (const ordered of [rows, [...rows].reverse(), rows]) {
      expect(searchWorkClients(workClientGroups(ordered), "EMPRESA")[0].client.id).toBe("a");
      expect(resolveWorkClientText("EMPRESA", workClientGroups(ordered))).toEqual({ kind: "existing", client: rows[1] });
    }
  });

  it("preserves all matches for the UI to visibly limit without truncating identity resolution", () => {
    const rows = Array.from({ length: 105 }, (_, i) => fields(`id-${i}`, `Empresa ${String(i).padStart(3, "0")}`));
    expect(searchWorkClients(workClientGroups(rows), "Empresa")).toHaveLength(105);
    expect(resolveWorkClientText("Empresa 104", workClientGroups(rows))).toEqual({ kind: "existing", client: rows[104] });
  });
});

describe("resolveWorkClientText", () => {
  it("reuses an exact raw alias rather than rewriting it to the canonical record", () => {
    const groups = workClientGroups(branchRows);
    expect(resolveWorkClientText("  agricola del este sa - santa rita  ", groups, "base")).toEqual({ kind: "existing", client: branchRows[1] });
    expect(resolveWorkClientText("AGROESTE", groups, "base")).toEqual({ kind: "existing", client: branchRows[2] });
  });

  it("resolves a branch-only catalog using canonical text without manufacturing an ID", () => {
    const rows = [fields("branch", "EMPRESA TEST S.A. - SANTA RITA")];
    expect(resolveWorkClientText("Empresa Test SA", workClientGroups(rows))).toEqual({ kind: "existing", client: rows[0] });
  });

  it("prefers the currently linked raw ID for identical name matches", () => {
    const rows = [fields("one", "EMPRESA", { ruc: "80011111-1" }), fields("two", "EMPRESA")];
    expect(resolveWorkClientText("empresa", workClientGroups(rows), "two")).toEqual({ kind: "existing", client: rows[1] });
  });

  it("otherwise prefers a matching name with fiscal data, then entity code", () => {
    const rows = [fields("plain", "EMPRESA"), fields("code", "EMPRESA", { cod_entidad: "001234" }), fields("ruc", "EMPRESA", { ruc: "80011111-1" })];
    expect(resolveWorkClientText("empresa", workClientGroups(rows))).toEqual({ kind: "existing", client: rows[2] });
    expect(resolveWorkClientText("empresa", workClientGroups(rows.slice(0, 2)))).toEqual({ kind: "existing", client: rows[1] });
  });

  it("resolves an exact entity code or formatted RUC so it cannot be inserted as a novel name", () => {
    const groups = workClientGroups(branchRows);
    expect(resolveWorkClientText("000123", groups)).toEqual({ kind: "existing", client: branchRows[1] });
    expect(resolveWorkClientText("80012345-6", groups).kind).toBe("existing");
    expect(resolveWorkClientText("80012345 6", groups).kind).toBe("existing");
  });

  it("allows a unique exact RUC to disambiguate identical legal names", () => {
    const rows = [fields("one", "EMPRESA", { ruc: "80011111-1" }), fields("two", "EMPRESA", { ruc: "80022222-2" })];
    expect(resolveWorkClientText("80022222-2", workClientGroups(rows), "one")).toEqual({ kind: "existing", client: rows[1] });
  });

  it("distinguishes a genuinely novel full name from an existing partial search match", () => {
    const groups = workClientGroups(branchRows);
    expect(resolveWorkClientText("AGRÍCOLA DEL ESTE LOGÍSTICA S.A.", groups)).toEqual({ kind: "new" });
    expect(resolveWorkClientText("AGRI", groups)).toEqual({ kind: "new" });
    expect(resolveWorkClientText("", groups)).toEqual({ kind: "empty" });
    expect(resolveWorkClientText("   ", groups)).toEqual({ kind: "empty" });
  });

  it("works with an empty catalog and does not mutate groups during lookup", () => {
    expect(workClientGroups([])).toEqual([]);
    expect(searchWorkClients([], "")).toEqual([]);
    expect(resolveWorkClientText("CLIENTE NUEVO", [])).toEqual({ kind: "new" });
    const groups = workClientGroups(branchRows);
    const before = structuredClone(groups);
    searchWorkClients(groups, "AGROESTE", "historic");
    resolveWorkClientText("AGROESTE", groups, "historic");
    expect(groups).toEqual(before);
  });
});
