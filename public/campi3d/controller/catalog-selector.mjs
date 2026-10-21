import { RecipeEngine, resolveRecipeTargets } from './recipe-engine.mjs';
import { mulberry32, STATE_IDS } from './logic.mjs';
import { recipes as authoredRecipes } from './recipes-registry.mjs';

/**
 * Contextual alternative selection, NOT a business-state generator.
 * No timer, renderer, state changes or automatic play are hidden in this helper.
 * The host supplies the current state, verified severity and visible targets.
 */
export class CampiRecipeSelector {
  constructor({ recipes = authoredRecipes, seed = 216834, avoidRecent = 3 } = {}) {
    this.engine = new RecipeEngine(recipes);
    this.random = mulberry32(seed);
    this.avoidRecent = Math.max(1, Math.floor(avoidRecent));
    this.history = [];
    this.lastSpecialAt = -Infinity;
    this.lastPersonalityAt = -Infinity;
  }

  eligible(context, {
    level = 'reposo', includePersonality = false, allowSpecial = false,
    allowedIds, target, secondaryTarget, afterState,
  } = {}) {
    if (!STATE_IDS.includes(context?.state)) throw new Error('A known contextual state is required.');
    if (!['reposo', 'interaccion', 'especial', 'any'].includes(level)) throw new Error('Unknown motion level.');
    // This helper receives a complete current snapshot, not a patch. Never
    // retain a target which the host has removed from the visible interface.
    this.engine.context = { state: context.state, severity: 'normal', targets: {} };
    this.engine.setContext(context);
    const allowed = allowedIds ? new Set(allowedIds) : null;
    if (allowed) for (const id of allowed) this.engine.get(id);
    return [...this.engine.registry.values()].filter(recipe => {
      if (this.engine.blockReason(recipe)) return false;
      if (allowed && !allowed.has(recipe.id)) return false;
      if (recipe.state === null && !includePersonality) return false;
      if (!allowSpecial && (recipe.level === 'especial' || recipe.special)) return false;
      if (level !== 'any' && recipe.level !== level) return false;
      if (recipe.state === 'sorprendido' && !['atento', 'contento', 'preocupado'].includes(afterState)) return false;
      return !resolveRecipeTargets(recipe, { target, secondaryTarget }, this.engine.context.targets).status;
    }).map(({ tracks, ...metadata }) => ({ ...metadata }));
  }

  /**
   * Returns a recipe ID or null when nothing suitable is available.
   * Records only the selected ID/family; it never changes context.state.
   * Time is provided by the host for deterministic special-action cooldowns.
   */
  next(context, options = {}) {
    const now = options.now ?? 0;
    const specialCooldown = options.specialCooldown ?? 18;
    const personalityCooldown = options.personalityCooldown ?? 12;
    if (!Number.isFinite(now) || !Number.isFinite(specialCooldown) || specialCooldown < 0
      || !Number.isFinite(personalityCooldown) || personalityCooldown < 0) {
      throw new Error('Selection time and cooldown must be finite; cooldown cannot be negative.');
    }
    let candidates = this.eligible(context, options).filter(recipe =>
      (!(recipe.level === 'especial' || recipe.special) || now - this.lastSpecialAt >= specialCooldown)
      && (recipe.state !== null || now - this.lastPersonalityAt >= personalityCooldown));
    const last = this.history.at(-1);
    // Never immediately repeat an automatic selection, even if only one exists.
    if (last) candidates = candidates.filter(recipe => recipe.id !== last.id);
    if (!candidates.length) return null;
    const recentIds = new Set(this.history.slice(-this.avoidRecent).map(item => item.id));
    const unrepeated = candidates.filter(recipe => !recentIds.has(recipe.id));
    if (unrepeated.length) candidates = unrepeated;
    const differentFamily = candidates.filter(recipe => recipe.family !== last?.family);
    if (differentFamily.length) candidates = differentFamily;
    const selected = candidates[Math.floor(this.random() * candidates.length)];
    this.record(selected.id, now);
    return selected.id;
  }

  record(id, now = 0) {
    const recipe = this.engine.get(id);
    this.history.push({ id, family: recipe.family, state: this.engine.context.state, time: now });
    if (this.history.length > 64) this.history.shift();
    if (recipe.level === 'especial' || recipe.special) this.lastSpecialAt = now;
    if (recipe.state === null) this.lastPersonalityAt = now;
  }

  reset() {
    this.history.length = 0;
    this.lastSpecialAt = -Infinity;
    this.lastPersonalityAt = -Infinity;
  }
}
