export type ResolvableEntityField = "cliente" | "tecnico";

export type EntityCandidateMap = Partial<Record<ResolvableEntityField, readonly string[]>>;

const genericAliases = new Set([
  "CLIENTE", "CLIENTES", "TECNICO", "TECNICOS", "RESPONSABLE", "AUXILIAR",
  "SIN CLIENTE", "SIN TECNICO", "SIN TECNICO ASIGNADO", "SIN DATO",
]);

export function normalizeEntityText(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function withoutCompanySuffix(value: string) {
  return value
    .replace(/\s+(?:S\s*A|SA|S\s*R\s*L|SRL|E\s*A\s*S|EAS|LTDA|S\s*A\s*C\s*I|SACI|SOCIEDAD ANONIMA)$/g, "")
    .trim();
}

function aliasesFor(value: string) {
  const rawParts = value.split(/\s+-\s+/).map((part) => part.trim()).filter(Boolean);
  const normalizedFull = normalizeEntityText(value);
  const aliases = new Set<string>([normalizedFull, withoutCompanySuffix(normalizedFull)]);
  for (const part of rawParts) {
    const normalized = normalizeEntityText(part);
    aliases.add(normalized);
    aliases.add(withoutCompanySuffix(normalized));
  }
  return [...aliases].filter((alias) => {
    if (!alias || genericAliases.has(alias) || alias.length < 5) return false;
    const meaningfulTokens = alias.split(" ").filter((token) => token.length > 1);
    return meaningfulTokens.length >= 2 || alias.length >= 8;
  });
}

function fieldPreference(question: string) {
  const normalized = ` ${normalizeEntityText(question)} `;
  const technician = [" TECNICO ", " RESPONSABLE ", " AUXILIAR ", " PARTICIPANTE "].some((signal) => normalized.includes(signal));
  const client = [" CLIENTE ", " PROPIETARIO ", " DUENO ", " ENTIDAD "].some((signal) => normalized.includes(signal));
  if (technician && !client) return ["tecnico"] as const;
  if (client && !technician) return ["cliente"] as const;
  return ["cliente", "tecnico"] as const;
}

/**
 * Resuelve solamente nombres que existen en los datos consultados. No hace
 * fuzzy matching: una coincidencia dudosa es peor que pedir una aclaracion.
 */
export function resolveNamedEntityFilters(
  question: string,
  candidates: EntityCandidateMap,
  blockedValues: readonly string[] = [],
) {
  const haystack = ` ${normalizeEntityText(question)} `;
  const blocked = new Set(blockedValues.map(normalizeEntityText));
  const result: Partial<Record<ResolvableEntityField, string | string[]>> = {};

  for (const field of fieldPreference(question)) {
    const matches = new Map<string, { value: string; length: number }>();
    for (const rawValue of candidates[field] ?? []) {
      const value = String(rawValue ?? "").trim();
      if (!value) continue;
      for (const alias of aliasesFor(value)) {
        if (blocked.has(alias) || !haystack.includes(` ${alias} `)) continue;
        const key = normalizeEntityText(value);
        const prior = matches.get(key);
        if (!prior || alias.length > prior.length) matches.set(key, { value, length: alias.length });
      }
    }
    if (!matches.size) continue;

    const longest = Math.max(...[...matches.values()].map((match) => match.length));
    const selected = [...matches.values()]
      .filter((match) => match.length === longest)
      .map((match) => match.value)
      .sort((a, b) => a.localeCompare(b));
    result[field] = selected.length === 1 ? selected[0] : selected;

    // Sin una palabra que indique rol, una coincidencia nominal segura basta.
    // Evita aplicar a la vez cliente y tecnico cuando comparten un nombre.
    if (fieldPreference(question).length > 1) break;
  }
  return result;
}
