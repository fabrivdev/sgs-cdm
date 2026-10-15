import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {buildKnowledgeGraph} from './knowledge-graph.mjs';

const MARKER='<!-- sig-cdm-knowledge:managed:v1 -->';
export const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const norm=s=>s.replaceAll('\\','/');
const git=(root,args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',windowsHide:true,maxBuffer:32*1024*1024}).trim();
export function safePath(root,name){
 const base=path.resolve(root),target=path.resolve(base,name),relative=path.relative(base,target);
 if(relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))throw Error('Ruta fuera del destino');
 for(let current=target;;current=path.dirname(current)){if(fs.existsSync(current)&&fs.lstatSync(current).isSymbolicLink())throw Error('Enlace/junction no admitido');if(path.dirname(current)===current)break;}
 return target;
}
const read=(root,name)=>fs.readFileSync(safePath(root,name),'utf8').replaceAll('\r\n','\n');
function walk(root,prefix=''){return fs.readdirSync(safePath(root,prefix),{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(root,prefix+e.name+'/'):[prefix+e.name]).sort();}
export function sourceDigest(root){const names=[...walk(safePath(root,'docs/knowledge')).map(n=>'docs/knowledge/'+n),'scripts/knowledge-graph.mjs','scripts/sync-obsidian-knowledge.mjs'].filter(n=>!n.endsWith('/atlas-review.json'));return hash(names.map(n=>n+'\0'+hash(read(root,n))).join('\n'));}
export function validateLinks(notes,vault){
 const missing=[];
 for(const [name,text]of notes)for(const m of text.matchAll(/\[\[([^\]|#]+)(?:[^\]]*)\]\]/g)){
  let target=m[1];if(target.startsWith('SIG CDM/Personal/')){if(!fs.existsSync(safePath(vault,target+'.md')))missing.push({name,target});continue;}
  target=target.replace(/^SIG CDM\/Generado\//,'');if(!notes.has(target+'.md'))missing.push({name,target});
 }
 if(missing.length)throw Error('Enlaces sin destino: '+JSON.stringify(missing.slice(0,12)));
}
export function buildNotes(root,vault){
 const revision=git(root,['rev-parse','HEAD']);
 const origin=git(root,['remote','get-url','origin']);
 if(!/^https:\/\/github\.com\/fabrivdev\/sgs-cdm(?:\.git)?$/.test(origin))throw Error('Repositorio distinto del autorizado');
 if(git(root,['status','--porcelain','--untracked-files=no','--','src','supabase','package.json','package-lock.json']))throw Error('Código funcional modificado sin commit');
 const review=JSON.parse(read(root,'docs/knowledge/atlas-review.json'));
 const digest=sourceDigest(root);
 if(review.sourceDigest!==digest)throw Error('Fuentes documentales cambiadas: revisar y renovar sello antes de sincronizar');
 // Documentation-only commits may follow the reviewed code; functional trees must match.
 const codeTree=hash(['src','supabase','package.json','package-lock.json'].map(n=>git(root,['rev-parse',revision+':'+n])).join('\n'));
 if(codeTree!==review.codeTree)throw Error('Código distinto de la referencia revisada; reconciliar antes de sincronizar');
 const tracked=git(root,['ls-tree','-r','--name-only','HEAD']).split('\n');
 const catalog=JSON.parse(read(root,'docs/knowledge/atlas-catalog.json'));
 if(new Set(catalog).size!==catalog.length)throw Error('Catálogo duplicado');
 const allowed=new Set(catalog),notes=new Map();
 const graph=buildKnowledgeGraph(root,tracked,n=>read(root,n));
 for(const n of catalog.filter(n=>!n.includes('/')&&!['10-Mapa-del-codigo.md','11-Migraciones.md','14-Atlas-de-la-app.md'].includes(n)))notes.set(n,read(root,'docs/knowledge/'+n));
 for(const [n,s]of graph)if(allowed.has(n))notes.set(n,s);
 const stamp=`Referencia de código revisada: ${review.codeRevision}. Árbol funcional coincidente con esa referencia. No acredita despliegue ni SQL aplicado.`;
 const code=tracked.filter(n=>/^(src|supabase\/functions)\/.*\.(ts|tsx)$/.test(n)&&!/[.]test[.]|\/ui\/|\/integrations\/|vite-env/.test(n));
 const migrations=tracked.filter(n=>/^supabase\/migrations\/.*\.sql$/.test(n));
 const list=items=>items.map(n=>'- `'+n+'`').join('\n');
 notes.set('10-Mapa-del-codigo.md',`# Mapa del código actual\n\n${stamp}\n\n## Archivos de implementación (${code.length})\n\n${list(code)}\n\n## Fichas existentes\n\n${catalog.filter(n=>/^(Codigo|Datos|Pantallas)\//.test(n)).map(n=>'- [[SIG CDM/Generado/'+n.slice(0,-3)+']]').join('\n')}\n\nLos archivos nuevos están indexados sin crear una ficha por archivo. Dependencias AST son potenciales, no trazas de ejecución. UI genérica y pruebas no generan fichas.\n`);
 notes.set('11-Migraciones.md',`# Migraciones y funciones del código actual\n\n${stamp}\n\n## Migraciones versionadas (${migrations.length})\n\n${list(migrations)}\n\n## Funciones detectadas\n\n${list([...graph.keys()].filter(n=>n.startsWith('Funciones/')).map(n=>n.slice(10,-3)))}\n\n## Fichas existentes\n\n${catalog.filter(n=>n.startsWith('Funciones/')).map(n=>'- [[SIG CDM/Generado/'+n.slice(0,-3)+']]').join('\n')}\n\nLas últimas declaraciones no prueban aplicación. ALTER, DROP, SQL dinámico y sobrecargas pueden requerir revisión manual. No ejecutar migraciones a partir de este índice.\n`);
 const routes=[...read(root,'src/lib/permissions.ts').matchAll(/\{\s*id:\s*"([\w.]+)",\s*module:\s*"(\w+)",\s*route:\s*"([\w/-]+)"\s*\}/g)];
 notes.set('10-Mapa-del-codigo.md',notes.get('10-Mapa-del-codigo.md')+'\n## Rutas y permisos declarados\n\n| Sección | Módulo | Ruta |\n| --- | --- | --- |\n'+routes.map(([,id,module,route])=>`| ${id} | ${module} | ${route} |`).join('\n')+'\n\nNo demuestra montaje activo ni permisos efectivos en producción. Consultar src/App.tsx para redirects.\n\n## Relaciones detectadas\n\n'+list([...graph.keys()].filter(n=>n.startsWith('Datos/')).map(n=>n.slice(6,-3)))+'\n');
 for(const n of catalog)if(!notes.has(n))notes.set(n,`# Referencia retirada: ${n.split('/').at(-1).slice(0,-3)}\n\n${stamp}\n\nNo se genera desde el código actual. Se conserva la identidad para no romper enlaces; no es una función o pantalla vigente acreditada. Consultar [[10-Mapa-del-codigo]] y [[11-Migraciones]].\n`);
 // Project graph onto the curated catalog: references without a useful existing note remain text.
 for(const [n,s]of notes){let text=s.replace(/\[\[SIG CDM\/Generado\/([^\]|]+)(?:\|([^\]]+))?\]\]/g,(whole,target,label)=>allowed.has(target+'.md')?whole:'`'+(label??target)+'` (sin ficha; ver índices 10/11)');
  if(n.includes('/')||n==='14-Atlas-de-la-app.md')text=text.replace(/(^# [^\n]+\n)/m,'$1\n'+stamp+'\n');
  if(n==='14-Atlas-de-la-app.md')text+=`\n## Catálogo materializado\n\nSe mantienen ${catalog.length} notas existentes. Los conteos de Alcance extraído describen candidatos del análisis, no notas creadas. No se crean fichas automáticamente.\n\n[[00-Inicio]] · [[10-Mapa-del-codigo]] · [[11-Migraciones]] · [[12-Estado-local]]\n`;
  text=text.replace(/\[\[([^/\]|]+)(?:\|([^\]]+))?\]\]/g,(whole,target,label)=>!allowed.has(target+'.md')&&fs.existsSync(safePath(root,'docs/knowledge/'+target+'.md'))?'`docs/knowledge/'+target+'.md`'+(label?' ('+label+')':''):whole);
  notes.set(n,text);
 }
 validateLinks(notes,vault);
 for(const [n,s]of notes)if(s.includes('\ufffd'))throw Error('Codificación dañada: '+n);
 return {notes,provenance:{repository:'fabrivdev/sgs-cdm',codeRevision:review.codeRevision,codeTree,sourceDigest:digest,engine:2}};
}
export function render(body){const clean=body.replaceAll(MARKER,'').trim()+'\n';return clean.startsWith('---\n')?clean+'\n'+MARKER+'\n':MARKER+'\n\n'+clean;}
export function planSync(vault,notes,provenance,{acceptManifest=null,acceptedHashes=null}={}){
 if(!fs.statSync(safePath(vault,'.obsidian')).isDirectory())throw Error('No es bóveda');
 const managed=safePath(vault,'SIG CDM/Generado'),manifestPath=safePath(managed,'.sig-cdm-sync.json');
 const raw=fs.existsSync(manifestPath)?fs.readFileSync(manifestPath,'utf8'):null,manifest=raw?JSON.parse(raw):{version:2,files:{},provenance};
 const accepting=raw&&acceptManifest===hash(raw);
 if(![1,2].includes(manifest.version))throw Error('Versión de manifiesto incompatible');
 if(manifest.version!==2&&!accepting)throw Error('Migración v1 requiere revisión explícita del manifiesto');
 if(manifest.version===2&&JSON.stringify(manifest.provenance)!==JSON.stringify(provenance)&&!accepting)throw Error('Fuente distinta de la reconciliada: no se restauran versiones anteriores');
 const result={updated:[],unchanged:[],conflicts:[],retained:Object.keys(manifest.files).filter(n=>!notes.has(n))},writes=[],observed=[];
 for(const [n,body]of notes){if(!/^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_.-]+)*\.md$/.test(n)||n.split('/').includes('..'))throw Error('Nombre no admitido');
  const target=safePath(managed,n),current=fs.existsSync(target)?fs.readFileSync(target,'utf8'):null,content=render(body);
  observed.push({target,n,before:current===null?null:hash(current)});
  if(current!==null&&hash(current)!==manifest.files[n]&&!(accepting&&acceptedHashes?.[n]===hash(current))){result.conflicts.push(n);continue;}
  if(current===content)result.unchanged.push(n);else {result.updated.push(n);writes.push({n,target,content,before:current===null?null:hash(current)});}
 }
 return {result,writes,observed,manifestPath,originalManifest:raw,manifest:{version:2,provenance,files:{...manifest.files,...Object.fromEntries([...notes].map(([n,s])=>[n,hash(render(s))]))}}};
}
export function applyPlan(vault,plan){
 if(plan.result.conflicts.length)throw Error('Conflictos: no se escribe ninguna nota');
 const lock=safePath(vault,'SIG CDM/Generado/.sync.lock'),fd=fs.openSync(lock,'wx');
 try{
  if((fs.existsSync(plan.manifestPath)?fs.readFileSync(plan.manifestPath,'utf8'):null)!==plan.originalManifest)throw Error('Manifiesto cambió durante revisión');
  for(const w of plan.observed){safePath(vault,path.relative(vault,w.target));const current=fs.existsSync(w.target)?hash(fs.readFileSync(w.target)):null;if(current!==w.before)throw Error('Nota cambió durante revisión: '+w.n);}
  const serialized=JSON.stringify(plan.manifest,null,2)+'\n';
  if(!plan.writes.length&&plan.originalManifest===serialized)return null;
  // Back up exact files before replacing; backup lives outside the vault.
  const backup=path.resolve(process.env.TEMP||process.cwd(),'sgs-atlas-backup-'+crypto.randomUUID());fs.mkdirSync(backup,{recursive:true});
  fs.writeFileSync(path.join(backup,'manifest.json'),plan.originalManifest??'');
  for(const w of plan.writes){const dst=path.join(backup,w.n);if(fs.existsSync(w.target)){fs.mkdirSync(path.dirname(dst),{recursive:true});fs.copyFileSync(w.target,dst);}fs.mkdirSync(path.dirname(w.target),{recursive:true});fs.writeFileSync(w.target,w.content);}
  fs.writeFileSync(plan.manifestPath,serialized);return backup;
 }finally{fs.closeSync(fd);fs.unlinkSync(lock);}
}
function main(){
 const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
 const args=process.argv.slice(2),value=k=>args.includes(k)?args[args.indexOf(k)+1]:null;
 const flags=new Set(['--check','--apply','--describe-source']),pairs=new Set(['--vault','--accept-manifest','--accepted-hashes']);
 for(let i=0;i<args.length;i++){if(flags.has(args[i]))continue;if(!pairs.has(args[i])||!args[i+1]||args[i+1].startsWith('--'))throw Error('Argumentos inválidos');i++;}
 if(args.includes('--check')&&args.includes('--apply'))throw Error('Elegir --check o --apply');
 if(args.includes('--describe-source')){console.log(JSON.stringify({codeRevision:git(root,['rev-parse','HEAD']),codeTree:hash(['src','supabase','package.json','package-lock.json'].map(n=>git(root,['rev-parse','HEAD:'+n])).join('\n')),sourceDigest:sourceDigest(root)},null,2));return;}
 const configPath=safePath(root,'obsidian-sync.local'),config=fs.existsSync(configPath)?JSON.parse(read(root,'obsidian-sync.local')):{};
 const vault=value('--vault')??config.vault;if(!vault)throw Error('Falta --vault o configuración local');
 const {notes,provenance}=buildNotes(root,vault);
 const accept=value('--accept-manifest'),reviewFile=value('--accepted-hashes');
 const plan=planSync(vault,notes,provenance,{acceptManifest:accept,acceptedHashes:reviewFile?JSON.parse(fs.readFileSync(reviewFile,'utf8')):null});
 const backup=args.includes('--apply')?applyPlan(vault,plan):null;
 console.log(JSON.stringify({mode:args.includes('--apply')?'applied':'check',...plan.result,provenance,backup},null,2));if(plan.result.conflicts.length)process.exitCode=2;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){try{main()}catch(e){console.error(e.message);process.exitCode=1;}}
