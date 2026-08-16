export interface CuadrillaSource {
  tecnico_responsable_id?: string | null;
  auxiliares?: string[] | null;
}

export interface CuadrillaResuelta {
  principalId: string | null;
  auxiliares: string[];
}

/**
 * La cuadrilla cargada en la jornada manda siempre que tenga responsable propio:
 * una lista de auxiliares vacía significa "sin auxiliares", no "sin datos".
 * Solo las jornadas legado (sin responsable) heredan la cuadrilla del servicio padre.
 */
export function resolverCuadrillaJornada(
  jornada: CuadrillaSource | null | undefined,
  servicio: CuadrillaSource | null | undefined,
): CuadrillaResuelta {
  if (jornada?.tecnico_responsable_id) {
    return {
      principalId: jornada.tecnico_responsable_id,
      auxiliares: (jornada.auxiliares ?? []).filter(Boolean),
    };
  }

  return {
    principalId: servicio?.tecnico_responsable_id ?? null,
    auxiliares: ((jornada?.auxiliares && jornada.auxiliares.length > 0)
      ? jornada.auxiliares
      : servicio?.auxiliares ?? []).filter(Boolean),
  };
}

export function cuadrillaIds(cuadrilla: CuadrillaResuelta): string[] {
  return Array.from(new Set([cuadrilla.principalId, ...cuadrilla.auxiliares].filter(Boolean) as string[]));
}
