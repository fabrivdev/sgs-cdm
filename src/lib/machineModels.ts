export const MACHINE_SUBGROUPS = [
  "COSECHADORAS",
  "SEMBRADORAS",
  "PICADORAS",
  "PLATAFORMAS",
  "PLATAFORMAS/CABEZALES",
  "PULVERIZADORAS",
  "TRACTORES",
  "SUELO",
  "OTRO",
] as const;

export type MachineSubgroup = (typeof MACHINE_SUBGROUPS)[number];

export function normalizeMachineModelKey(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLocaleUpperCase("es")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]+/g, "");
}
