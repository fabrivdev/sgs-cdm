/** Explicit expressive actions. Never infer anger/sadness from user behavior or business data. */
export type CampiAction = 'neutral' | 'intro' | 'angry' | 'sad' | 'celebrate' | 'step' | 'run';
export type CampiActionFrame = { at: number; body: 'rest' | 'celebrate' | 'flight' | 'run' | 'run2' | 'wave' | 'wave2'; face: 'rest' | 'angry' | 'sad' | 'smile'; motion?: 'anticipate' | 'air' | 'land' | 'bow' | 'step-left' | 'step-right' };
export const CAMPI_ACTIONS: Record<CampiAction, CampiActionFrame[]> = {
  neutral: [{ at: 0, body: 'rest', face: 'rest' }],
  intro: [{ at: 0, body: 'rest', face: 'smile', motion: 'anticipate' }, { at: 180, body: 'flight', face: 'rest', motion: 'air' }, { at: 480, body: 'rest', face: 'smile', motion: 'land' }, { at: 660, body: 'rest', face: 'smile', motion: 'bow' }, { at: 920, body: 'wave', face: 'smile' }, { at: 1150, body: 'wave2', face: 'smile' }, { at: 1390, body: 'rest', face: 'rest' }],
  angry: [{ at: 0, body: 'rest', face: 'angry' }, { at: 1800, body: 'rest', face: 'rest' }],
  sad: [{ at: 0, body: 'rest', face: 'sad' }, { at: 1800, body: 'rest', face: 'rest' }],
  celebrate: [{ at: 0, body: 'rest', face: 'smile', motion: 'anticipate' }, { at: 180, body: 'flight', face: 'rest', motion: 'air' }, { at: 520, body: 'celebrate', face: 'rest', motion: 'land' }, { at: 760, body: 'rest', face: 'smile' }, { at: 1200, body: 'rest', face: 'rest' }],
  run: [{ at: 0, body: 'run', face: 'rest' }, { at: 90, body: 'run2', face: 'rest' }, { at: 180, body: 'run', face: 'rest' }, { at: 270, body: 'run2', face: 'rest' }, { at: 360, body: 'run', face: 'rest' }, { at: 450, body: 'run2', face: 'rest' }],
  step: [{ at: 0, body: 'rest', face: 'smile' }, { at: 180, body: 'run', face: 'rest', motion: 'step-left' }, { at: 480, body: 'rest', face: 'smile' }, { at: 660, body: 'run2', face: 'rest', motion: 'step-right' }, { at: 960, body: 'rest', face: 'rest' }],
};
