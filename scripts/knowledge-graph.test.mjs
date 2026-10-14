import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractCode, extractSchema, extractSql, validateBusinessMap, validateKnowledgeLinks, disconnectedKnowledgeNotes } from './knowledge-graph.mjs';
import { buildNotes } from './sync-obsidian-knowledge.mjs';

test('AST captura llamadas tipadas y casts, sin confundir comentarios o copiar contenido', () => {
  const source = `import { x } from '@/hooks/x';
    // supabase.rpc('falsa');
    export const example = 'dato-privado-que-no-se-copia';
    supabase.rpc<MyType>('ventas_reales', {secret:'no-publicar'});
    (supabase.from('productos' as any) as any).select('*');
    supabase.rpc(dynamicName);`;
  const result = extractCode(source, 'example.ts');
  assert.deepEqual(result.imports, ['@/hooks/x']);
  assert.deepEqual(result.exports, ['example']);
  assert.deepEqual(result.rpcs.map((item) => item.name), ['ventas_reales']);
  assert.deepEqual(result.tables.map((item) => item.name), ['productos']);
  assert.equal(result.dynamicCalls, 1);
  assert.ok(!JSON.stringify(result).includes('privado'));
  assert.ok(!JSON.stringify(result).includes('no-publicar'));
});

test('extrae columnas y FK tipadas sin registros ni Insert/Update duplicados', () => {
  const source = `export type Database = { public: { Tables: {
    maquinas: { Row: { id: string; cliente_id: string | null }; Insert:{ignored:string}; Relationships:[{referencedRelation:'clientes'}] };
    clientes: {Row:{id:string}; Relationships:[]};
  }; Views:{ vista:{ Row:{total:number|null}; Relationships:[] } } } }`;
  const schema = extractSchema(source);
  assert.equal(schema.size, 3);
  assert.deepEqual(schema.get('maquinas').columns.map((item) => item.name), ['id', 'cliente_id']);
  assert.deepEqual(schema.get('maquinas').relations, ['clientes']);
  assert.equal(schema.get('vista').kind, 'vista');
});

test('incluye imports lazy literales sin ejecutar código ni inventar rutas dinámicas', () => {
  const result = extractCode(`const NotFound = lazy(() => import('./pages/NotFound')); import(variable);`, 'App.tsx');
  assert.deepEqual(result.imports, ['./pages/NotFound']);
});

test('detecta islas aunque todos sus enlaces tengan destino, admite enlaces entrantes', () => {
  const notes = new Map([
    ['14-Atlas-de-la-app.md', '[[00-Inicio]]'],
    ['00-Inicio.md', ''],
    ['Codigo/a.md', '[[00-Inicio]]'],
    ['Funciones/a.md', '[[Funciones/b]]'],
    ['Funciones/b.md', '[[Funciones/a]]'],
    ['Datos/sola.md', ''],
  ]);
  assert.deepEqual(validateKnowledgeLinks(notes), []);
  assert.deepEqual(disconnectedKnowledgeNotes(notes), ['Datos/sola.md', 'Funciones/a.md', 'Funciones/b.md']);
});

test('atlas real no tiene enlaces rotos ni notas fuera de su componente principal', (t) => {
  const root=fileURLToPath(new URL('../', import.meta.url));
  const vault=fs.mkdtempSync(path.join(os.tmpdir(),'cdm-atlas-links-'));
  t.after(()=>{assert.equal(path.dirname(vault),path.resolve(os.tmpdir()));assert.ok(path.basename(vault).startsWith('cdm-atlas-links-'));fs.rmSync(vault,{recursive:true,force:true});});
  for(const name of fs.readdirSync(path.join(root,'docs/knowledge')).filter(n=>n.endsWith('.md')))for(const m of fs.readFileSync(path.join(root,'docs/knowledge',name),'utf8').matchAll(/\[\[(SIG CDM\/Personal\/[^\]|]+)(?:\|[^\]]+)?\]\]/g)){const target=path.join(vault,m[1]+'.md');fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,'# Fixture');}
  const {notes} = buildNotes(root,vault);
  const internal=new Map([...notes].map(([n,s])=>[n,s.replace(/\[\[SIG CDM\/Personal\/[^\]]+\]\]/g,'Referencia personal verificada')]));
  assert.deepEqual(validateKnowledgeLinks(internal), []);
  assert.deepEqual(disconnectedKnowledgeNotes(notes), []);
  assert.match(notes.get('Codigo/src__App_tsx.md'), /Codigo\/src__pages__NotFound_tsx/);
  assert.match(notes.get('10-Mapa-del-codigo.md'), /Codigo\/src__components__ventas__serviceSalesTable_ts/);
  assert.match(notes.get('11-Migraciones.md'), /Funciones\/proteger_rol_superadmin/);
});

test('extrae definición SQL, dependencias y configuración sin publicar defaults', () => {
  const source = `-- create function public.falsa() as $$ select 1 $$;
    create table public.productos(id uuid);
    create or replace function public.calcular(p_buscar text default 'privado', p_marcas text[] default ARRAY['oculto','secreto'], p_n integer default 3)
    returns numeric language sql stable security definer set statement_timeout = '120s'
    as $body$ select public.normalizar(p.nombre) from public.productos p join public.clientes c on c.id=p.id;
      select 'public.falsa() from public.otratabla'; $body$;`;
  const info = extractSql(source, 'migration.sql');
  assert.deepEqual(info.declaredRelations, ['productos']);
  assert.equal(info.functions.length, 1);
  const fn = info.functions[0];
  assert.equal(fn.args, 'p_buscar text, p_marcas text[], p_n integer');
  assert.deepEqual(fn.calls, ['normalizar']);
  assert.deepEqual(fn.relations, ['clientes', 'productos']);
  assert.equal(fn.security, 'SECURITY DEFINER');
  assert.equal(fn.timeout, '120s');
  for (const secret of ['privado','oculto','secreto']) assert.ok(!JSON.stringify(info).includes(secret));
});

test('verifica referencias funcionales y enlaces, no acepta nodos inventados', () => {
  const model = JSON.parse(fs.readFileSync(fileURLToPath(new URL('../docs/knowledge/mapa-negocio.json', import.meta.url)), 'utf8'));
  assert.doesNotThrow(() => validateBusinessMap(model));
  model.flows[0].rules.push('inventada');
  assert.throws(() => validateBusinessMap(model), /desconocido/);
  const notes = new Map([['Entidades/OS.md', '[[SIG CDM/Generado/Funciones/ventas|Ventas]]'], ['Funciones/ventas.md', '[[SIG CDM/Generado/Entidades/OS|OS]]']]);
  assert.deepEqual(validateKnowledgeLinks(notes), []);
  notes.set('14-Inicio.md', '[[sin-destino]]');
  assert.equal(validateKnowledgeLinks(notes).length, 1);
});
