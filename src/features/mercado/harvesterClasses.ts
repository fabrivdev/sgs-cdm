import { harvestClasses, unknownHarvestClass, type Movement } from "./model";

// Model-level corrections and technical sources are documented in 50-Mercado-cosechadoras.
const classByModel = new Map<string, number>([
  ["JOHN DEERE:9670STS", 6],
  ["JOHN DEERE:9770STS", 7],
  ["JOHN DEERE:S4400", 5],
  ["JOHN DEERE:S7700", 7],
  ["JOHN DEERE:S7800", 8],
  ["JOHN DEERE:X91100", 11],
  ["CASE IH:5160", 5],
  ["NEW HOLLAND:CR7", 7],
  ["NEW HOLLAND:CR7+", 8],
  ["NEW HOLLAND:CR8", 8],
  ["NEW HOLLAND:CR9040", 6],
  ["NEW HOLLAND:CR9065", 8],
  ["FENDT:IDEAL8", 8],
]);

function modelKey(brand: string, model: string) {
  return (
    brand +
    ":" +
    model
      .toUpperCase()
      .replace(/\s+(?:RICE|ARROCERA|ARROZ)$/, "")
      .replace(/[^A-Z0-9+]/g, "")
  );
}

function normalizedStoredModel(brand: string, model: string) {
  return brand === "JOHN DEERE"
    ? model.replace(/^(S[4-8][1-9]0)S\b/, "$1")
    : model;
}

export function completeHarvestClasses(
  rows: Movement[],
  history = rows.filter((row) => row[0].startsWith("ocit:")),
): Movement[] {
  const observed = new Map<string, Set<string>>();
  for (const row of history) {
    if (row[4] === "Sin identificar" || !harvestClasses.includes(row[5]))
      continue;
    const key = modelKey(row[3], normalizedStoredModel(row[3], row[4]));
    const values = observed.get(key) ?? new Set<string>();
    values.add(row[5]);
    observed.set(key, values);
  }
  return rows.map((row) => {
    const model = normalizedStoredModel(row[3], row[4]);
    const key = modelKey(row[3], model);
    const reviewed = classByModel.get(key);
    const matches = observed.get(key);
    const group =
      row[5] === unknownHarvestClass
        ? reviewed !== undefined
          ? "Clase " + reviewed
          : matches?.size === 1
            ? [...matches][0]
            : row[5]
        : row[5];
    if (model === row[4] && group === row[5]) return row;
    const updated: Movement = [...row];
    updated[4] = model;
    updated[5] = group;
    return updated;
  });
}
