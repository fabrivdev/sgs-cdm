const TARGET_NAMES = ['priority1', 'priority2', 'priority3', 'priority4', 'conversation', 'primary', 'secondary'];
export function reactionChanged(next, previous) {
  return next.reaction?.id !== previous?.reaction?.id || next.reaction?.token !== previous?.reaction?.token;
}
export function contextChanged(next, previous) {
  return !previous || previous.state !== next.state || previous.posture !== next.posture || previous.severity !== next.severity || JSON.stringify(previous.targets) !== JSON.stringify(next.targets);
}
export function applySelection(controller, next, previous) {
  if (contextChanged(next, previous)) {
    if (typeof controller.setContext === 'function') controller.setContext({ state: next.state, severity: next.severity ?? 'normal', targets: Object.fromEntries(TARGET_NAMES.map(name => [name, next.targets?.[name] ?? null])) });
    else {
      if ((next.severity && next.severity !== 'normal') || next.targets) throw new Error('Campi contextual severity/targets require the v5 runtime.');
      controller.setState(next.state);
    }
    if (next.posture) controller.setPosture(next.posture);
  }
  if (reactionChanged(next, previous)) {
    if (next.reaction) {
      if (typeof controller.playRecipe !== 'function') throw new Error('This Campi runtime does not support catalog recipes. Deploy the v5 runtime.');
      const { id, ...recipeOptions } = next.reaction;
      return controller.playRecipe(id, { afterState: next.state, ...recipeOptions });
    } else controller.stopRecipe?.();
  }
}
