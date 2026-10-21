import type { CampiFactory } from './types';

export function createCampiFactory(options: {
  runtimeBaseUrl: string;
  assetUrl: string;
  manifestUrl: string;
  seed?: number;
}): CampiFactory;
