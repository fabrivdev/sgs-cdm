export interface TechnicianProfileReference {
  id: string;
  nombre: string;
}

type ImportedServiceOrderRawData = Record<string, unknown> | null | undefined;

const CODE_PREFIX = /^(?:[A-Z]{1,6}[\s-]*)?\d{2,}\s*(?:[-:|/]\s*)?/;

const TECHNICIAN_NAME_ALIASES: Record<string, string> = {
  "DENNIS BENITEZ": "DENIS DE LA CRUZ BENITEZ ARAUJO",
};

export function normalizeTechnicianName(value: string | null | undefined): string {
  const normalized = String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(CODE_PREFIX, "")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
  return TECHNICIAN_NAME_ALIASES[normalized] ?? normalized;
}

function matchScore(source: string, candidate: string): number {
  if (!source || !candidate) return 0;
  if (source === candidate) return 1;

  const sourceTokens = source.split(" ").filter(Boolean);
  const candidateTokens = candidate.split(" ").filter(Boolean);
  const sourceSet = new Set(sourceTokens);
  const candidateSet = new Set(candidateTokens);
  const intersection = sourceTokens.filter((token) => candidateSet.has(token)).length;
  const allSourceTokensMatch = sourceTokens.length >= 2 && intersection === sourceTokens.length;
  const allCandidateTokensMatch = candidateTokens.length >= 2 && candidateTokens.every((token) => sourceSet.has(token));

  if (allSourceTokensMatch || allCandidateTokensMatch) {
    const lengthPenalty = Math.min(Math.abs(sourceTokens.length - candidateTokens.length) * 0.02, 0.12);
    return 0.94 - lengthPenalty;
  }

  if (intersection < 2) return 0;
  const coverage = intersection / Math.max(sourceTokens.length, candidateTokens.length);
  const firstNameMatches = sourceTokens[0] === candidateTokens[0];
  return coverage + (firstNameMatches ? 0.12 : 0);
}

export function matchTechnicianProfile(
  importedName: string | null | undefined,
  profiles: TechnicianProfileReference[],
): TechnicianProfileReference | null {
  const source = normalizeTechnicianName(importedName);
  if (!source) return null;

  const ranked = profiles
    .map((profile) => ({ profile, score: matchScore(source, normalizeTechnicianName(profile.nombre)) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.profile.nombre.localeCompare(b.profile.nombre));

  const best = ranked[0];
  if (!best || best.score < 0.72) return null;
  const second = ranked[1];
  if (second && best.score - second.score < 0.08) return null;
  return best.profile;
}

export function importedServiceOrderParticipants(
  rawData: ImportedServiceOrderRawData,
  responsible?: string | null,
): string[] {
  const values: string[] = [];
  const add = (value: unknown) => {
    const name = String(value ?? "").trim();
    if (name) values.push(name);
  };

  add(responsible);

  const explicit = rawData?.tecnicos_participantes;
  if (Array.isArray(explicit)) explicit.forEach(add);

  for (const [key, value] of Object.entries(rawData ?? {})) {
    const normalizedKey = key
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();

    if (normalizedKey === "responsable" || /^mec aux [1-6]$/.test(normalizedKey)) add(value);
  }

  const unique = new Map<string, string>();
  for (const value of values) {
    const key = normalizeTechnicianName(value);
    if (key && !unique.has(key)) unique.set(key, value);
  }
  return Array.from(unique.values());
}

export function displayImportedTechnicianName(value: string | null | undefined): string {
  const normalized = normalizeTechnicianName(value);
  return normalized || "Sin técnico asignado";
}
