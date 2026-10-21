/** Numerical live-runtime audit. Does not confer semantic or visual acceptance. */
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {readCampi} from './loader.mjs';
import {CampiController} from './runtime.mjs';
const allPostures=process.argv.includes('--all-postures');
const outIndex=process.argv.indexOf('--out');
const output=outIndex<0?new URL('./runtime-validation.json',import.meta.url):process.argv[outIndex+1];
if(!output)throw new Error('--out needs a file path');
const groupFiles=(await readdir(new URL('../catalog/groups/',import.meta.url))).filter(f=>f.endsWith('.mjs')).sort();
const sourceFiles=['./runtime.mjs','./recipe-engine.mjs','./recipes-registry.mjs','./arm-primitives.mjs','./motion-primitives.mjs','./logic.mjs','./loader.mjs','./verify-recipes.mjs','../manifest.json','../assets/Campi_3D_estados.glb',...groupFiles.map(f=>'../catalog/groups/'+f)];
async function sourceHashes(){return Object.fromEntries(await Promise.all(sourceFiles.map(async file=>[file,createHash('sha256').update(await readFile(new URL(file,import.meta.url))).digest('hex')])));}
const sourceSha256=await sourceHashes();
const gltf=await readCampi(new URL('../assets/Campi_3D_estados.glb',import.meta.url));
const manifest=JSON.parse(await readFile(new URL('../manifest.json',import.meta.url)));
const c=new CampiController(gltf,{manifest,autoPosture:false,seed:216834});
const postures=['centrado_suelto','peso_izquierdo','peso_derecho','manos_bajas_juntas'];
const report={kind:'continuous-runtime-numerical-audit',generatedAt:new Date().toISOString(),nodeVersion:process.version,sourceSha256,allPostures,registeredRecipes:c.listRecipes().length,executableRecipes:c.listRecipes().filter(r=>r.available).length,fps:24,notVisualAcceptance:true,recipes:[],totals:{frames:0,maxContactError:0,minSoleHeight:Infinity,maximumLocalQuaternionStep:0},failures:[]};
let index=0;
for(const recipe of c.listRecipes()){
 if(!recipe.available){report.recipes.push({id:recipe.id,status:recipe.status,frames:0});continue;}
 for(const startPosture of (allPostures?postures:[postures[index++%4]])){
 c.recipeEngine.active=null;c.autoPostureBeforeRecipe=null;c.setAutoPosture(false);
 c.setContext({state:recipe.state??recipe.compatibleStates?.[0]??'sereno',severity:recipe.requiresSeverity??'normal',targets:{primary:null,secondary:null}});
 c.director.enter(recipe.state??recipe.compatibleStates?.[0]??'sereno',startPosture,{phaseStart:1.4,playSeconds:0,holdSeconds:100});
 c.applyStillPose();
 const options={target:{direction:[.6,recipe.targetSector==='lower'?-.3:.1,1]},secondaryTarget:{direction:[-.65,.05,1]},afterState:'atento',token:`verify-${recipe.id}-${startPosture}`};
 const started=c.playRecipe(recipe.id,options);
 if(!started.started){report.failures.push({id:recipe.id,error:started.status});continue;}
 const row={id:recipe.id,startPosture,posture:c.director.posture,preparationSeconds:c.recipeEngine.active.preparationRemaining??0,frames:0,maxContactError:0,minSoleHeight:Infinity,maximumLocalQuaternionStep:0};
 let previous=new Map([...c.nodes].map(([name,node])=>[name,node.quaternion.clone()]));
 for(let f=0;f<Math.ceil((recipe.duration+1+row.preparationSeconds)*24);f++){
  c.update(1/24);row.frames++;report.totals.frames++;
  for(const [name,node] of c.nodes){
   if(![...node.position.toArray(),...node.quaternion.toArray(),...node.scale.toArray()].every(Number.isFinite))report.failures.push({id:recipe.id,frame:f,node:name,error:'nonfinite'});
   row.maximumLocalQuaternionStep=Math.max(row.maximumLocalQuaternionStep,node.quaternion.angleTo(previous.get(name)));previous.get(name).copy(node.quaternion);
  }
  for(const support of c.lastIK){
   row.maxContactError=Math.max(row.maxContactError,support.contactError);
   const foot=c.nodes.get(`25_FOOT_${support.side}`);
   const min=Math.min(...c.soleVertices[support.side].map(v=>v.clone().applyMatrix4(foot.matrixWorld).y));
   row.minSoleHeight=Math.min(row.minSoleHeight,min);
   if(support.contactError>1e-6||support.reachExcess>1e-6||min<-.002) report.failures.push({id:recipe.id,frame:f,side:support.side,error:'support',contact:support.contactError,reach:support.reachExcess,sole:min});
  }
 }
 report.totals.maxContactError=Math.max(report.totals.maxContactError,row.maxContactError);
 report.totals.minSoleHeight=Math.min(report.totals.minSoleHeight,row.minSoleHeight);
 report.totals.maximumLocalQuaternionStep=Math.max(report.totals.maximumLocalQuaternionStep,row.maximumLocalQuaternionStep);
 report.recipes.push(row);
 }
}
report.sourceChangedDuringRun=JSON.stringify(sourceSha256)!==JSON.stringify(await sourceHashes());
if(report.sourceChangedDuringRun)report.failures.push({error:'source_changed_during_audit'});
report.executedCases=report.recipes.filter(r=>r.frames>0).length;
report.passed=report.failures.length===0;
await writeFile(output,JSON.stringify(report,null,2));
console.log(JSON.stringify({passed:report.passed,registeredRecipes:report.registeredRecipes,executableRecipes:report.executableRecipes,executedCases:report.executedCases,...report.totals,failures:report.failures.slice(0,10),failureCount:report.failures.length},null,2));
c.dispose();if(!report.passed)process.exitCode=1;
