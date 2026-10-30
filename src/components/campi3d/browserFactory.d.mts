import type { createWelcomeMotion } from './welcome-motion/welcomeMotion';
import type { CampiFactory } from './types';

export function createCampiFactory(options: {
  runtimeBaseUrl: string;
  assetUrl: string;
  manifestUrl: string;
  seed?: number;
  welcome?: Parameters<typeof createWelcomeMotion>[1];
}): (...args:Parameters<CampiFactory>)=>Promise<Awaited<ReturnType<CampiFactory>> & {prepare():void}>;
