export type MatrixCompletionSource = {
  realizadas: number;
  noRealizadas: number;
  programadas: number;
  noDisponibilidad: string[];
};

/** Only work with an outcome belongs in the completion denominator. */
export function matrixCompletion(cell?: MatrixCompletionSource) {
  const completed = Math.max(0, cell?.realizadas ?? 0);
  const notCompleted = Math.max(0, cell?.noRealizadas ?? 0);
  const decided = completed + notCompleted;
  return {
    completed,
    notCompleted,
    decided,
    scheduled: Math.max(0, cell?.programadas ?? 0),
    unavailable: cell?.noDisponibilidad.length ?? 0,
    percent: decided > 0 ? Math.round((completed / decided) * 100) : null,
  };
}

export function matrixCompletionText(result: ReturnType<typeof matrixCompletion>) {
  return `${result.completed} de ${result.decided} trabajos cumplidos`;
}
