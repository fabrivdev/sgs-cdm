// Explicit identities: word position cannot distinguish given names from surnames.
const commercialNames = [
  ["CARLOS BENITEZ", ["CARLOS JAVIER BENITEZ ZARZA", "CARLOS BENITEZ"]],
  ["OSCAR BENITEZ", ["OSCAR DANIEL BENITEZ MEZA", "OSCAR BENITEZ"]],
  ["LUIS CAÑETE", ["LUIS ANDRES CAÑETE RODRIGUEZ", "ANDRES CAÑETE", "LUIS CAÑETE"]],
  ["JUAN APODACA", ["JUAN DANIEL APODACA FERREIRA", "JUAN APODACA"]],
  ["RUBEN CENTURION", ["RUBEN JUAN ANTONIO CENTURION RAMOS", "RUBEN CENTURION"]],
  ["HELWIN LOPEZ", ["HELWIN LOPEZ BORGES", "HELWIN LOPEZ"]],
  ["ABEL LOPEZ", ["ABEL LOPEZ GONZALEZ", "ABEL LOPEZ"]],
  ["ARNALDO ALMADA", ["ARNALDO JOSE ALMADA GONZALEZ", "ARNALDO ALMADA", "ARNADLO ALMADA"]],
  ["RUBEN ROTELA", ["RUBEN ROTELA"]],
] as const;

const nameKey = (name: string) => name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
const shortNames = new Map<string, string>(commercialNames.flatMap(([short, aliases]) =>
  aliases.map(alias => [nameKey(alias), short] as [string, string]),
));

export function shortPersonName(value: unknown) {
  const name = String(value ?? "").trim().replace(/^\d+\s*-\s*/, "").replace(/\s+/g, " ");
  // Unknown identities stay complete rather than silently choosing the wrong surname.
  return shortNames.get(nameKey(name)) ?? name;
}
