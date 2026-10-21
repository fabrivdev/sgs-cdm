import { Campi3D } from '../campi3d/Campi3D';
import { createCampiFactory } from '../campi3d/browserFactory.mjs';
import type { CampiEmotion, CampiReaction } from '../campi3d/types';

const factory = createCampiFactory({
  runtimeBaseUrl: '/campi3d/controller/',
  assetUrl: '/campi3d/assets/Campi_3D_estados.glb',
  manifestUrl: '/campi3d/manifest.json',
});

export function CampiThreeCanvas({ mood, reaction, paused, reduced, onReady, onError }: {
  mood: CampiEmotion;
  reaction: CampiReaction | null;
  paused: boolean;
  reduced: boolean;
  onReady: () => void;
  onError: (error: Error) => void;
}) {
  return <Campi3D factory={factory} state={mood} reaction={reaction} paused={paused}
    reducedMotion={reduced} autoPosture={!paused && !reduced}
    className="campi-three-canvas" style={{ width: '100%', height: '100%' }}
    onReady={onReady} onError={onError} />;
}
