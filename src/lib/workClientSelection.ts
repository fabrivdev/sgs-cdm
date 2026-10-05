import { canonicalClientName, canonicalClientOptions, type ClientIdentityRow } from "./clientIdentity";

/** Sólo para el selector de Trabajos; no modifica las identidades compartidas. */
export function workClientNameKey(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export interface WorkClientGroup<T extends ClientIdentityRow = ClientIdentityRow> {
  id: string;
  members: T[];
}

const rucKey = (row: ClientIdentityRow) => {
  const key = workClientNameKey(row.ruc ?? "");
  return key.length >= 5 ? key : "";
};

export function workClientGroups<T extends ClientIdentityRow>(rows: T[]): WorkClientGroup<T>[] {
  const byId = new Map(rows.map(row => [row.id, row]));
  // El helper histórico comparte namespace de RUC/código. Evitar una unión
  // accidental entre esos campos sin alterar sus otros consumidores.
  const namespaced = rows.map(row => ({ ...row,
    ruc: rucKey(row) ? `RUC${rucKey(row)}` : "",
    cod_entidad: workClientNameKey(row.cod_entidad ?? "").length >= 5 ? `CODE${workClientNameKey(row.cod_entidad!)}` : "",
  }));
  return canonicalClientOptions(namespaced).flatMap(option => {
    const members = option.sourceIds.map(id => byId.get(id)!);
    const rucs = new Set(members.map(rucKey).filter(Boolean));
    if (rucs.size <= 1) return [{ id: option.id, members }];

    // Un nombre/código coincidente no resuelve un conflicto entre RUCs.
    // Sin RUC no se puede atribuir una fila a ninguna de esas identidades.
    const partitions = new Map<string, T[]>();
    for (const member of members) {
      const key = rucKey(member) || `unknown:${member.id}`;
      partitions.set(key, [...(partitions.get(key) ?? []), member]);
    }
    return Array.from(partitions.values(), group => ({ id: group[0].id, members: group }));
  });
}

function preferredRow<T extends ClientIdentityRow>(rows: T[], preferredId?: string) {
  return [...rows].sort((a, b) =>
    Number(b.id === preferredId) - Number(a.id === preferredId)
    || Number(!!rucKey(b)) - Number(!!rucKey(a))
    || Number(!!b.cod_entidad) - Number(!!a.cod_entidad)
    || a.nombre.length - b.nombre.length
    || a.nombre.localeCompare(b.nombre)
    || a.id.localeCompare(b.id),
  )[0];
}

export function resolveWorkClientText<T extends ClientIdentityRow>(text: string, groups: WorkClientGroup<T>[], preferredId?: string):
  { kind: "empty" | "new" | "ambiguous" } | { kind: "existing"; client: T } {
  const key = workClientNameKey(text);
  if (!text.trim()) return { kind: "empty" };
  if (!key) return { kind: "new" };
  const canonicalKey = workClientNameKey(canonicalClientName(text));
  const matches = groups.map(group => {
    const exact = group.members.filter(row => workClientNameKey(row.nombre) === key);
    const matching = exact.length ? exact : group.members.filter(row =>
      workClientNameKey(canonicalClientName(row.nombre)) === canonicalKey
      || [row.ruc, row.cod_entidad].some(value => !!value && workClientNameKey(value) === key));
    return matching.length ? preferredRow(matching, preferredId) : null;
  }).filter((row): row is T => !!row);
  if (matches.length > 1) return { kind: "ambiguous" };
  return matches.length ? { kind: "existing", client: matches[0] } : { kind: "new" };
}

export function searchWorkClients<T extends ClientIdentityRow>(groups: WorkClientGroup<T>[], text: string, preferredId?: string) {
  const key = workClientNameKey(text);
  return groups.flatMap(group => {
    const matches = group.members.filter(row => !key || [row.nombre, row.ruc, row.cod_entidad]
      .some(value => workClientNameKey(value ?? "").includes(key)));
    if (!matches.length) return [];
    const exact = matches.filter(row => workClientNameKey(row.nombre) === key);
    const client = preferredRow(exact.length ? exact : matches, preferredId);
    const aliases = Array.from(new Set(group.members.map(row => row.nombre))).filter(name => name !== client.nombre);
    return [{ groupId: group.id, client, aliases }];
  }).sort((a, b) => a.client.nombre.localeCompare(b.client.nombre));
}
