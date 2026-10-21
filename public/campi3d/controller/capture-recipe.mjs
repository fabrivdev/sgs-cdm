/** Reproduce the live spring+IK runtime, not just static key samples. No renderer. */
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readCampi } from './loader.mjs';
import { CampiController } from './runtime.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((value, index, all) => value.startsWith('--') ? [value.slice(2),all[index+1]] : null).filter(Boolean));
const id = args.id;
if (!id) throw new Error('Use --id <recipe-id>. Optional: --out, --fps, --posture, --target x,y,z, --secondary x,y,z.');
const root = fileURLToPath(new URL('../',import.meta.url));
const sourceFiles=['controller/runtime.mjs','controller/recipe-engine.mjs','controller/motion-primitives.mjs','controller/arm-primitives.mjs','controller/recipes-registry.mjs','manifest.json','assets/Campi_3D_estados.glb',...(await readdir(resolve(root,'catalog/groups'))).filter(f=>f.endsWith('.mjs')).sort().map(f=>'catalog/groups/'+f)];
const sourceSha256=Object.fromEntries(await Promise.all(sourceFiles.map(async file=>[file,createHash('sha256').update(await readFile(resolve(root,file))).digest('hex')])));
const controller = new CampiController(await readCampi(resolve(root,'assets/Campi_3D_estados.glb')),{
  manifest:JSON.parse(await readFile(resolve(root,'manifest.json'))),autoPosture:false,demoAutoStates:false,seed:216834,
});
const recipe = controller.recipeEngine.get(id);
const state = args.state ?? recipe.state ?? 'sereno';
const posture = args.posture ?? 'centrado_suelto';
const severity = args.severity ?? recipe.requiresSeverity ?? 'normal';
controller.setContext({state,severity});
controller.setPosture(posture);
controller.update(2);
const target = {direction: args.target ? args.target.split(',').map(Number) : [.6,recipe.targetSector==='lower'?-.3:.1,1]};
const secondaryTarget = {direction: args.secondary ? args.secondary.split(',').map(Number) : [-.65,.05,1]};
const playResult = controller.playRecipe(id,{target,secondaryTarget,afterState:'atento',token:`capture-${id}`});
const fps = Number(args.fps ?? 24);
if (!Number.isFinite(fps) || fps<1 || fps>120) throw new Error('fps must be between 1 and 120.');
const duration = Number(args.duration ?? ((recipe.duration ?? 0)+1.5));
if (!Number.isFinite(duration) || duration<=0) throw new Error('duration must be positive and finite.');
const frames=[];
if(playResult.started) for(let i=0;i<=Math.round(duration*fps);i++){
  if(i)controller.update(1/fps);
  const snapshot=controller.snapshot();
  frames.push({...controller.capture(i+1),time:i/fps,runtimeTime:snapshot.time,recipe:snapshot.recipe,lastRecipe:snapshot.lastRecipe,ik:snapshot.ik});
}
const output={
  schema:'campi-live-recipe-capture-v1',coordinates:'glTF Y-up; meters; local transforms; quaternion XYZW',
  id,state,posture,severity,target,secondaryTarget,fps,duration,playResult,sourceSha256,
  notes:'Explicit synthetic QA targets. This is controller output, not visual or semantic acceptance.',
  nodes:controller.records.map(({name,index,node})=>({name,index,parent:node.parent?.userData.originalName??null})),frames,
};
const path=resolve(args.out??resolve(root,'controller/captures/recipes',`${id}.json`));
await mkdir(dirname(path),{recursive:true});await writeFile(path,JSON.stringify(output));
console.log(JSON.stringify({path,id,status:playResult.status,frames:frames.length,fps}));
controller.dispose();
