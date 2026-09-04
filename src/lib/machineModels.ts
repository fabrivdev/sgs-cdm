export const MACHINE_SUBGROUPS = [
  "COSECHADORAS",
  "SEMBRADORAS",
  "PICADORAS",
  "PLATAFORMAS/CABEZALES",
  "PULVERIZADORAS",
  "TRACTORES",
  "SUELO",
  "OTRO",
] as const;

export type MachineSubgroup = (typeof MACHINE_SUBGROUPS)[number];

export function canonicalMachineSubgroup(value: unknown): MachineSubgroup {
  const normalized = String(value ?? "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .toLocaleUpperCase("es");
  const aliases: Partial<Record<string, MachineSubgroup>> = {
    "PLANTADORA / SEMBRADORA": "SEMBRADORAS",
    "PLANTADORA/SEMBRADORA": "SEMBRADORAS",
    TRACTOR: "TRACTORES",
    "M - COSECHADORA": "COSECHADORAS",
    PLATAFORMA: "PLATAFORMAS/CABEZALES",
    PLATAFORMAS: "PLATAFORMAS/CABEZALES",
    SUELO: "SUELO",
    "C - PICADORA": "PLATAFORMAS/CABEZALES",
    "M - PICADORA": "PICADORAS",
    PULVERIZADORA: "PULVERIZADORAS",
    "DIRECT DISC": "PLATAFORMAS/CABEZALES",
  };
  if (aliases[normalized]) return aliases[normalized]!;
  return MACHINE_SUBGROUPS.includes(normalized as MachineSubgroup)
    ? normalized as MachineSubgroup
    : "OTRO";
}

export function machineSubgroupLabel(subgroup: unknown, customSubgroup?: unknown) {
  const canonical = canonicalMachineSubgroup(subgroup);
  const custom = String(customSubgroup ?? "").trim();
  return canonical === "OTRO" && custom ? custom.toLocaleUpperCase("es") : canonical;
}

export function normalizeMachineModelKey(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLocaleUpperCase("es")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]+/g, "");
}
