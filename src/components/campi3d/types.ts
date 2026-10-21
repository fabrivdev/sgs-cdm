import type { CSSProperties } from 'react';
export type CampiEmotion = 'sereno' | 'contento' | 'atento' | 'preocupado' | 'pensativo' | 'sorprendido' | 'explicativo' | 'alivio';
export type CampiPosture = 'centrado_suelto' | 'peso_izquierdo' | 'peso_derecho' | 'manos_bajas_juntas';
export interface CampiRecipeResult { started: boolean; id: string; token?: string | number | null; status: string; reason?: string; preparedPosture?: CampiPosture }
export interface CampiSnapshot { state: CampiEmotion; posture: CampiPosture; revision: number; holding: boolean; reducedMotion: boolean; paused: boolean; autoPosture: boolean; recipe?: { id: string; token?: string | number | null; status: string; progress: number; events: unknown[]; preparationRemaining?: number } | null; reducedMotionSettling?: boolean; context?: { state: CampiEmotion; severity: CampiSeverity } | null; lastRecipe?: CampiRecipeResult | { id: string; token: string | number | null; status: string } | null; }
/** Unit direction in character-local glTF Y-up space, forward +Z. Not pixels. */
export interface CampiTarget { direction: [number, number, number] }
export type CampiSeverity = 'normal' | 'important' | 'critical';
export type CampiTargets = Partial<Record<'priority1' | 'priority2' | 'priority3' | 'priority4' | 'conversation' | 'primary' | 'secondary', CampiTarget | null>>;
export interface CampiRecipeInfo { id: string; status?: string; available?: boolean; notes?: string; [key: string]: unknown }
export interface CampiReaction {
  /** Exact catalog ID; no silent fallback is permitted. */
  id: string;
  /** Change this token to explicitly replay the same recipe. */
  token: string | number;
  target?: CampiTarget;
  secondaryTarget?: CampiTarget;
  afterState?: CampiEmotion;
  intensity?: number;
}
export interface CampiView {
  update(options: CampiOptions): void;
  dispose(): void;
  listRecipes?(): CampiRecipeInfo[];
}
export interface CampiOptions {
  state: CampiEmotion;
  reaction?: CampiReaction | null;
  severity?: CampiSeverity;
  targets?: CampiTargets;
  posture?: CampiPosture;
  autoPosture: boolean;
  paused: boolean;
  reducedMotion: boolean;
}
export interface CampiMount {
  canvas: HTMLCanvasElement;
  container: HTMLElement;
  signal: AbortSignal;
  onChange(snapshot: CampiSnapshot): void;
  onError(error: Error): void;
  onRecipeResult?(result: CampiRecipeResult): void;
}
export type CampiFactory = (mount: CampiMount) => Promise<CampiView>;
export interface Campi3DProps {
  /** Keep the factory reference stable, e.g. define it outside the component. */
  factory: CampiFactory;
  state?: CampiEmotion;
  reaction?: CampiReaction | null;
  severity?: CampiSeverity;
  targets?: CampiTargets;
  posture?: CampiPosture;
  autoPosture?: boolean;
  paused?: boolean;
  reducedMotion?: boolean | 'system';
  onReady?(recipes: CampiRecipeInfo[]): void;
  onChange?(snapshot: CampiSnapshot): void;
  onError?(error: Error): void;
  onRecipeResult?(result: CampiRecipeResult): void;
  className?: string;
  style?: CSSProperties;
  /** Omit for a decorative character; contextual text belongs in the surrounding UI. */
  label?: string;
}
