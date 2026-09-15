import { describe, expect, it } from "vitest";
import { shortPersonName } from "./personName";

describe("shortPersonName", () => {
  it("uses the verified first surname, not the last word", () => {
    expect(shortPersonName("CARLOS JAVIER BENITEZ ZARZA")).toBe("CARLOS BENITEZ");
    expect(shortPersonName("OSCAR DANIEL BENITEZ MEZA")).toBe("OSCAR BENITEZ");
    expect(shortPersonName("RUBEN JUAN ANTONIO CENTURION RAMOS")).toBe("RUBEN CENTURION");
    expect(shortPersonName("ABEL LOPEZ GONZALEZ")).toBe("ABEL LOPEZ");
  });

  it("unifies short and full aliases from both systems", () => {
    expect(shortPersonName(" 000006 - Oscar Benítez ")).toBe("OSCAR BENITEZ");
    expect(shortPersonName("LUIS ANDRES CAÑETE RODRIGUEZ")).toBe("LUIS CAÑETE");
    expect(shortPersonName("000003 - Andres Cañete")).toBe("LUIS CAÑETE");
    expect(shortPersonName("HELWIN  LOPEZ BORGES")).toBe("HELWIN LOPEZ");
    expect(shortPersonName("JUAN DANIEL APODACA FERREIRA")).toBe("JUAN APODACA");
    expect(shortPersonName("ARNALDO JOSE ALMADA GONZALEZ")).toBe("ARNALDO ALMADA");
  });

  it("does not guess surnames or merge unknown people by shared words", () => {
    expect(shortPersonName("OSCAR MIGUEL BENITEZ LOPEZ")).toBe("OSCAR MIGUEL BENITEZ LOPEZ");
    expect(shortPersonName("MARIA JOSE DEL VALLE")).toBe("MARIA JOSE DEL VALLE");
    expect(shortPersonName("GERENCIA CDM")).toBe("GERENCIA CDM");
  });

  it("keeps already short names and tolerates empty values", () => {
    expect(shortPersonName("RUBEN ROTELA")).toBe("RUBEN ROTELA");
    expect(shortPersonName(null)).toBe("");
  });
});
