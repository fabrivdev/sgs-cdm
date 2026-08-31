const BRANCH_SUFFIX = /\s*(?:[-–—|/]\s*|\(\s*)(?:SANTA\s+RITA|SANTA\s+ROSA|CAMPO\s*(?:9|NUEVE)|MISIONES|LOMA\s+PLATA|KATUET[EÉ])\s*\)?\s*$/i;

function normalized(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

export function canonicalClientName(value: string | null | undefined) {
  let name = String(value ?? "").trim().replace(/\s+/g, " ");
  let previous = "";
  while (name && name !== previous) {
    previous = name;
    name = name.replace(BRANCH_SUFFIX, "").trim();
  }
  return name;
}

export type ClientIdentityRow = {
  id: string;
  nombre: string;
  ruc?: string | null;
  cod_entidad?: string | null;
};

export type CanonicalClientOption<T extends ClientIdentityRow = ClientIdentityRow> = T & { sourceIds: string[] };

/**
 * El maestro puede traer una fila por tienda y la base historica puede tener
 * codigos distintos para la misma razon social. En los selectores se expone
 * una sola empresa, conservando un id real para las relaciones existentes.
 */
export function canonicalClientOptions<T extends ClientIdentityRow>(rows: T[]): CanonicalClientOption<T>[] {
  const groups: T[][] = [];
  const groupByKey = new Map<string, T[]>();

  for (const row of rows) {
    const identityKeys = [row.ruc, row.cod_entidad]
      .map(normalized)
      .filter((key) => key.length >= 5)
      .map((key) => `identity:${key}`);
    const nameKey = normalized(canonicalClientName(row.nombre));
    const keys = [...identityKeys, nameKey && `name:${nameKey}`].filter(Boolean) as string[];
    const existingGroups = Array.from(new Set(keys.map((key) => groupByKey.get(key)).filter(Boolean))) as T[][];
    const group = existingGroups[0] ?? [];

    if (!existingGroups.length) groups.push(group);
    for (const other of existingGroups.slice(1)) {
      for (const item of other) group.push(item);
      const index = groups.indexOf(other);
      if (index >= 0) groups.splice(index, 1);
      for (const [key, value] of groupByKey) if (value === other) groupByKey.set(key, group);
    }

    group.push(row);
    for (const key of keys) groupByKey.set(key, group);
  }

  return groups
    .map((group): CanonicalClientOption<T> => {
      const ranked = [...group].sort((a, b) => {
        const aCanonical = canonicalClientName(a.nombre);
        const bCanonical = canonicalClientName(b.nombre);
        const aExact = normalized(a.nombre) === normalized(aCanonical) ? 0 : 1;
        const bExact = normalized(b.nombre) === normalized(bCanonical) ? 0 : 1;
        return aExact - bExact || aCanonical.length - bCanonical.length || a.nombre.localeCompare(b.nombre);
      });
      const keeper = ranked[0];
      return { ...keeper, nombre: canonicalClientName(keeper.nombre), sourceIds: group.map((row) => row.id) };
    })
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
}

export function canonicalClientId<T extends ClientIdentityRow>(options: CanonicalClientOption<T>[], sourceId: string | null | undefined) {
  if (!sourceId) return "";
  return options.find((option) => option.sourceIds.includes(sourceId))?.id ?? sourceId;
}
