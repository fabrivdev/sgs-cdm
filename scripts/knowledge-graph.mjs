import ts from 'typescript';

const unique = (items) => [...new Set(items)].sort();
const slug = (value) => value.replaceAll('/', '__').replaceAll('.', '_');
const validIdentifier = (value) => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value);
const link = (name, title = name.split('/').at(-1)) => `[[SIG CDM/Generado/${name}|${title}]]`;
const list = (items) => items.length ? items.map((item) => `- ${item}`).join('\n') : 'No detectado en el alcance analizado.';
const codeId = (name) => `Codigo/${slug(name)}`;
const functionId = (name) => `Funciones/${name}`;
const tableId = (name) => `Datos/${name}`;
const nodeId = (kind, name) => `${kind}/${name}`;

const unwrap = (node) => {
  while (node && (ts.isAsExpression(node) || ts.isParenthesizedExpression(node) || ts.isTypeAssertionExpression(node))) node = node.expression;
  return node;
};
const literal = (node) => { node = unwrap(node); return node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) ? node.text : null; };
const propertyName = (node) => node?.name ? (literal(node.name) ?? node.name.getText()) : '';

export function extractCode(source, filename) {
  const ast = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true);
  const result = { imports: [], exports: [], rpcs: [], tables: [], dynamicCalls: 0 };
  function visit(node) {
    if (ts.isImportDeclaration(node)) result.imports.push(node.moduleSpecifier.text);
    if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) result.imports.push(node.moduleSpecifier.text);
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const specifier = literal(node.arguments[0]);
      if (specifier) result.imports.push(specifier);
    }
    if (node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) {
      if (node.name) result.exports.push(propertyName(node));
      if (ts.isVariableStatement(node)) for (const declaration of node.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) result.exports.push(declaration.name.text);
      }
    }
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && ['rpc', 'from'].includes(node.expression.name.text)) {
      const name = literal(node.arguments[0]);
      if (name && validIdentifier(name)) {
        const location = ast.getLineAndCharacterOfPosition(node.getStart()).line + 1;
        result[node.expression.name.text === 'rpc' ? 'rpcs' : 'tables'].push({ name, line: location });
      } else result.dynamicCalls++;
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  result.imports = unique(result.imports);
  result.exports = unique(result.exports);
  return result;
}

export function extractSchema(source) {
  const ast = ts.createSourceFile('types.ts', source, ts.ScriptTarget.Latest, true);
  const database = ast.statements.find((node) => ts.isTypeAliasDeclaration(node) && node.name.text === 'Database');
  const members = (node) => ts.isTypeLiteralNode(node) ? node.members : [];
  const field = (node, name) => members(node).find((item) => propertyName(item) === name)?.type;
  const publicType = field(database?.type, 'public');
  const result = new Map();
  for (const kind of ['Tables', 'Views']) for (const declaration of members(field(publicType, kind))) {
    const name = propertyName(declaration);
    if (!validIdentifier(name)) continue;
    const columns = members(field(declaration.type, 'Row')).map((column) => ({ name: propertyName(column), type: column.type?.getText(ast) ?? 'desconocido' }));
    const relations = [];
    const relationshipType = field(declaration.type, 'Relationships');
    if (relationshipType && ts.isTupleTypeNode(relationshipType)) for (const relationship of relationshipType.elements) {
      const target = field(relationship, 'referencedRelation');
      if (target && ts.isLiteralTypeNode(target) && ts.isStringLiteral(target.literal)) relations.push(target.literal.text);
    }
    result.set(name, { kind: kind === 'Tables' ? 'tabla' : 'vista', columns, relations: unique(relations) });
  }
  return result;
}

const withoutComments = (sql) => sql.replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\n]/g, ' ')).replace(/--[^\n]*/g, (match) => ' '.repeat(match.length));
const withoutStrings = (sql) => sql.replace(/'(?:''|[^'])*'/g, (match) => match.replace(/[^\n]/g, ' '));

function closingParen(source, start) {
  let depth = 0, quoted = false;
  for (let index = start; index < source.length; index++) {
    if (source[index] === "'") {
      if (quoted && source[index + 1] === "'") { index++; continue; }
      quoted = !quoted;
    }
    if (quoted) continue;
    if (source[index] === '(') depth++;
    if (source[index] === ')' && --depth === 0) return index;
  }
  return -1;
}

function safeArguments(source) {
  const parts = [];
  let start = 0, depth = 0, quoted = false;
  for (let index = 0; index < source.length; index++) {
    const char = source[index];
    if (char === "'") {
      if (quoted && source[index + 1] === "'") { index++; continue; }
      quoted = !quoted;
    }
    if (quoted) continue;
    if (char === '(' || char === '[') depth++;
    if (char === ')' || char === ']') depth--;
    if (char === ',' && depth === 0) { parts.push(source.slice(start, index)); start = index + 1; }
  }
  parts.push(source.slice(start));
  return parts.filter((part) => part.trim()).map((part) => {
    const clean = part.split(/\bdefault\b|=/i)[0].replace(/\s+/g, ' ').trim();
    // Never put SQL literals/default values into a note, even if parsing is partial.
    return /^[a-zA-Z0-9_.\s[\](),]+$/.test(clean) ? clean : '(argumento no parseable)';
  }).join(', ');
}

export function extractSql(source, filename) {
  const sql = withoutComments(source);
  const functions = [];
  const declaredRelations = [...withoutStrings(sql).matchAll(/create\s+(?:or\s+replace\s+)?(?:materialized\s+)?(?:table|view)\s+(?:if\s+not\s+exists\s+)?public\.([a-z0-9_]+)/gi)].map((match) => match[1]);
  for (const match of sql.matchAll(/create\s+(?:or\s+replace\s+)?function\s+public\.([a-z0-9_]+)\s*\(/gi)) {
    const start = match.index + match[0].length - 1;
    const close = closingParen(sql, start);
    if (close < 0) continue;
    const following = sql.slice(close + 1, close + 2001);
    const dollar = /\bas\s+(\$[a-zA-Z0-9_]*\$)/i.exec(following);
    if (!dollar || /create\s+(?:or\s+replace\s+)?function/i.test(following.slice(0, dollar.index))) continue;
    const bodyStart = close + 1 + dollar.index + dollar[0].length;
    const bodyEnd = sql.indexOf(dollar[1], bodyStart);
    if (bodyEnd < 0) continue;
    const body = withoutStrings(sql.slice(bodyStart, bodyEnd));
    const args = safeArguments(sql.slice(start + 1, close));
    const header = following.slice(0, dollar.index);
    const refs = [...body.matchAll(/\b(?:from|join|insert\s+into|update|delete\s+from)\s+public\.([a-z0-9_]+)/gi)].map((item) => item[1]);
    const calls = [...body.matchAll(/\bpublic\.([a-z0-9_]+)\s*\(/gi)].map((item) => item[1]);
    functions.push({ name: match[1], args, file: filename, line: source.slice(0, match.index).split('\n').length,
      relations: unique(refs), calls: unique(calls.filter((name) => name !== match[1])),
      security: /security\s+definer/i.test(header) ? 'SECURITY DEFINER' : 'INVOKER/no declarado',
      volatility: /\bimmutable\b/i.test(header) ? 'IMMUTABLE' : /\bstable\b/i.test(header) ? 'STABLE' : 'VOLATILE/no declarado',
      timeout: /statement_timeout\s*=\s*'([0-9]+(?:ms|s|min)?)'/i.exec(header)?.[1] ?? 'no declarado aquí' });
  }
  return { functions, declaredRelations: unique(declaredRelations) };
}

export function validateBusinessMap(model) {
  const sets = {};
  for (const kind of ['modules', 'entities', 'rules', 'flows', 'screens']) {
    if (!Array.isArray(model[kind])) throw new Error(`Falta sección funcional: ${kind}`);
    sets[kind] = new Set();
    for (const item of model[kind]) {
      if (!/^[A-Za-z0-9_.-]+$/.test(item.id) || sets[kind].has(item.id) || !item.title?.trim()) throw new Error(`Identidad funcional inválida: ${kind}/${item.id}`);
      sets[kind].add(item.id);
    }
  }
  const requireIds = (ids, kind) => {
    if (!Array.isArray(ids)) throw new Error(`Lista funcional inválida: ${kind}`);
    for (const id of ids) if (!sets[kind].has(id)) throw new Error(`Vínculo funcional desconocido: ${kind}/${id}`);
  };
  for (const item of model.modules) requireIds(item.related, 'modules');
  for (const item of model.entities) { requireIds([item.module], 'modules'); requireIds(item.related, 'entities'); }
  for (const item of model.rules) { requireIds([item.module], 'modules'); requireIds(item.entities, 'entities'); }
  for (const item of model.flows) { requireIds([item.module], 'modules'); requireIds(item.entities, 'entities'); requireIds(item.rules, 'rules'); }
  for (const item of model.screens) { requireIds([item.module], 'modules'); requireIds(item.flows, 'flows'); }
}

export function validateKnowledgeLinks(notes) {
  const missing = [];
  for (const [name, content] of notes) for (const match of content.matchAll(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g)) {
    const target = match[1].replace(/^SIG CDM\/Generado\//, '').split('#')[0];
    if (!notes.has(`${target}.md`)) missing.push({ source: name, target });
  }
  return missing;
}

// Obsidian shows incoming as well as outgoing links. Validate that every managed
// note belongs to the Atlas component, not just that its destinations exist.
export function disconnectedKnowledgeNotes(notes, entry = '14-Atlas-de-la-app.md') {
  if (!notes.has(entry)) throw new Error(`Falta entrada del grafo: ${entry}`);
  const graph = new Map([...notes.keys()].map((name) => [name, new Set()]));
  for (const [name, content] of notes) for (const match of content.matchAll(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g)) {
    const target = `${match[1].replace(/^SIG CDM\/Generado\//, '').split('#')[0]}.md`;
    if (!graph.has(target)) continue;
    graph.get(name).add(target);
    graph.get(target).add(name);
  }
  const seen = new Set([entry]), pending = [entry];
  while (pending.length) for (const target of graph.get(pending.pop())) {
    if (!seen.has(target)) { seen.add(target); pending.push(target); }
  }
  return [...notes.keys()].filter((name) => !seen.has(name)).sort();
}

export function buildKnowledgeGraph(root, tracked, read) {
  const notes = new Map();
  const model = JSON.parse(read('docs/knowledge/mapa-negocio.json'));
  validateBusinessMap(model);
  const codes = new Map();
  for (const name of tracked.filter((name) => /^(src|supabase\/functions)\/.*\.(ts|tsx)$/.test(name)
    && !/\.test\.|\/ui\/|\/integrations\/|vite-env/.test(name))) {
    codes.set(name, { ...extractCode(read(name), name), dependencies: [], users: [] });
  }
  const resolve = (from, spec) => {
    let base;
    if (spec.startsWith('@/')) base = `src/${spec.slice(2)}`;
    else if (spec.startsWith('.')) {
      const segments = `${from.slice(0, from.lastIndexOf('/'))}/${spec}`.split('/');
      const resolved = [];
      for (const segment of segments) { if (segment === '..') resolved.pop(); else if (segment !== '.') resolved.push(segment); }
      base = resolved.join('/');
    } else return null;
    return [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`].find((name) => codes.has(name)) ?? null;
  };
  for (const [name, info] of codes) {
    info.dependencies = unique(info.imports.map((spec) => resolve(name, spec)).filter(Boolean));
    for (const dependency of info.dependencies) codes.get(dependency).users.push(name);
  }
  const relations = extractSchema(read('src/integrations/supabase/types.ts'));
  const sqlFunctions = new Map();
  for (const file of tracked.filter((name) => /^supabase\/migrations\/\d+_[\w]+\.sql$/.test(name)).sort()) {
    const info = extractSql(read(file), file);
    for (const name of info.declaredRelations) if (!relations.has(name)) relations.set(name, { kind: 'relación SQL', columns: [], relations: [] });
    for (const fn of info.functions) {
      if (!sqlFunctions.has(fn.name)) sqlFunctions.set(fn.name, { definitions: [], latest: new Map() });
      const entry = sqlFunctions.get(fn.name);
      entry.definitions.push(fn);
      entry.latest.set(fn.args, fn);
    }
  }
  for (const info of codes.values()) {
    for (const { name } of info.rpcs) if (!sqlFunctions.has(name)) sqlFunctions.set(name, { definitions: [], latest: new Map() });
    for (const { name } of info.tables) if (!relations.has(name)) relations.set(name, { kind: 'referencia de código', columns: [], relations: [] });
  }
  for (const entry of sqlFunctions.values()) for (const fn of entry.latest.values()) for (const name of fn.relations) {
    if (!sqlFunctions.has(name) && !relations.has(name)) relations.set(name, { kind: 'referencia SQL', columns: [], relations: [] });
  }
  const functionTables = (entry) => unique([...entry.latest.values()].flatMap((fn) => fn.relations).filter((name) => relations.has(name) && !sqlFunctions.has(name)));
  const functionCalls = (entry) => unique([...entry.latest.values()].flatMap((fn) => fn.calls).filter((name) => sqlFunctions.has(name)));
  const add = (id, title, kind, content, module = 'transversal') => {
    if (notes.has(`${id}.md`)) throw new Error(`Nodo duplicado: ${id}`);
    const frontmatter = `---\nproject: sig-cdm\ntype: ${kind}\nmodule: ${module}\nstatus: codigo-local-no-verificado-en-produccion\ntags:\n  - sig-cdm\n  - ${kind}\n---\n`;
    notes.set(`${id}.md`, `${frontmatter}\n# ${title}\n\n${content}\n`);
  };
  const sourceLinks = (files) => list(files.map((name) => codes.has(name) ? link(codeId(name), name) : `\`${name}\` (referencia documental)`));
  const entityLinks = (ids) => list(ids.map((id) => link(nodeId('Entidades', id), model.entities.find((item) => item.id === id)?.title ?? id)));

  for (const [name, info] of codes) {
    const tests = tracked.filter((file) => file.replace(/\.test\.(ts|tsx)$/, '') === name.replace(/\.(ts|tsx)$/, '') && /\.test\./.test(file));
    add(codeId(name), name.split('/').at(-1), 'codigo', `Archivo: \`${name}\`.\n\n## Exportaciones\n\n${list(info.exports.map((item) => `\`${item}\``))}\n\n## Importa código local\n\n${sourceLinks(info.dependencies)}\n\n## Es utilizado por\n\n${sourceLinks(unique(info.users))}\n\n## RPC literales\n\n${list(info.rpcs.map((item) => `${link(functionId(item.name), item.name)} — línea ${item.line}`))}\n\n## Relaciones consultadas literalmente\n\n${list(info.tables.map((item) => `${link(tableId(item.name), item.name)} — línea ${item.line}`))}\n\n## Pruebas asociadas por nombre\n\n${list(tests.map((file) => `\`${file}\``))}\n\nExtracción AST estática. Importar un archivo no significa ejecutar todas sus ramas; no se ejecuta código ni se copia su contenido. Llamadas dinámicas no resueltas: ${info.dynamicCalls}.`);
  }
  for (const [name, entry] of sqlFunctions) {
    const callers = [...codes].filter(([, info]) => info.rpcs.some((item) => item.name === name)).map(([file]) => file);
    const serverCallers = [...sqlFunctions].filter(([other, info]) => other !== name && functionCalls(info).includes(name)).map(([other]) => other);
    const latest = [...entry.latest.values()];
    const tables = functionTables(entry);
    add(functionId(name), name, 'funcion', `## Declaraciones locales\n\n${latest.length ? list(latest.map((fn) => `\`${fn.file}:${fn.line}\` — argumentos sin defaults: \`${fn.args || 'sin argumentos'}\`; ${fn.security}; ${fn.volatility}; timeout ${fn.timeout}.`)) : 'Se llama desde el código, pero no se localizó una declaración parseable en migraciones versionadas. Verificar la base.'}\n\n${entry.definitions.length} declaraciones históricas detectadas; se consideran las últimas por lista textual de argumentos. Las sobrecargas/ALTER/DROP y migraciones no aplicadas impiden inferir la firma real de producción.\n\n## Relaciones referenciadas en las últimas declaraciones\n\n${list(tables.map((table) => link(tableId(table), table)))}\n\n## Funciones llamadas\n\n${list(functionCalls(entry).map((fn) => link(functionId(fn), fn)))}\n\n## Consumidores frontend/Edge Functions\n\n${sourceLinks(callers)}\n\n## Otras funciones que la llaman\n\n${list(serverCallers.map((fn) => link(functionId(fn), fn)))}\n\nDependencias SQL textuales de esquemas public, sin literales ni comentarios. SQL dinámico y funciones no calificadas pueden quedar fuera. Un SELECT detectado no demuestra un vínculo de negocio ni una FK.`);
  }
  for (const [name, relation] of relations) {
    const consumers = [...codes].filter(([, info]) => info.tables.some((item) => item.name === name)).map(([file]) => file);
    const serverConsumers = [...sqlFunctions].filter(([, entry]) => functionTables(entry).includes(name)).map(([fn]) => fn);
    add(tableId(name), name, 'dato', `Tipo de evidencia: ${relation.kind}.\n\n## Columnas declaradas en tipos locales\n\n${relation.columns.length ? `| Campo | Tipo local |\n| --- | --- |\n${relation.columns.map((column) => `| ${column.name} | \`${column.type.replaceAll('|', '\\|').replaceAll('\n', ' ')}\` |`).join('\n')}` : 'No hay columnas extraídas de tipos locales. No significa que la relación no tenga columnas.'}\n\n## Relaciones tipadas\n\n${list(relation.relations.filter((target) => relations.has(target)).map((target) => link(tableId(target), target)))}\n\n## Consultada directamente por\n\n${sourceLinks(consumers)}\n\n## Funciones SQL que la referencian\n\n${list(serverConsumers.map((fn) => link(functionId(fn), fn)))}\n\nLos tipos generados pueden estar desactualizados y las vistas tienen campos calculados. Fuente de columnas/FK: \`src/integrations/supabase/types.ts\`. Nunca se copian filas ni valores de clientes.`);
  }
  for (const entity of model.entities) add(nodeId('Entidades', entity.id), entity.title, 'entidad', `${entity.description}\n\n## Datos técnicos relacionados\n\n${list(entity.tables.filter((name) => relations.has(name)).map((name) => link(tableId(name), name)))}\n\n## Conceptos relacionados\n\n${entityLinks(entity.related)}\n\n## Reglas\n\n${list(model.rules.filter((item) => item.entities.includes(entity.id)).map((item) => link(nodeId('Reglas', item.id), item.title)))}\n\n## Procesos\n\n${list(model.flows.filter((item) => item.entities.includes(entity.id)).map((item) => link(nodeId('Flujos', item.id), item.title)))}\n\nLas asociaciones de esta nota son conceptuales; las FK tipadas se muestran aparte en los nodos de Datos.`, entity.module);
  for (const rule of model.rules) add(nodeId('Reglas', rule.id), rule.title, 'regla', `## Regla y alcance\n\n${rule.description}\n\n## Qué comprobar\n\n${rule.check}\n\n## Entidades\n\n${entityLinks(rule.entities)}\n\n## Implementación/referencias\n\n${sourceLinks(rule.sources)}\n\nEvidencia: ${rule.evidence}. No acredita validación productiva.`, rule.module);
  for (const flow of model.flows) add(nodeId('Flujos', flow.id), flow.title, 'flujo', `${flow.description}\n\n## Recorrido\n\n${flow.steps.map((step, index) => `${index + 1}. ${step}`).join('\n')}\n\n## Entidades\n\n${entityLinks(flow.entities)}\n\n## Reglas que condicionan el proceso\n\n${list(flow.rules.map((id) => link(nodeId('Reglas', id), model.rules.find((rule) => rule.id === id)?.title ?? id)))}\n\n## Código y documentación\n\n${sourceLinks(flow.sources)}\n\nRecorrido funcional documentado; comprobar guardas del servidor y migraciones aplicadas antes de operar en producción.`, flow.module);

  const routeSource = read('src/lib/permissions.ts');
  const routes = [...routeSource.matchAll(/\{\s*id:\s*"([\w.]+)",\s*module:\s*"(\w+)",\s*route:\s*"([\w/-]+)"\s*\}/g)];
  const reach = (files) => {
    const seen = new Set();
    const walk = (name) => { if (!codes.has(name) || seen.has(name)) return; seen.add(name); codes.get(name).dependencies.forEach(walk); };
    files.forEach(walk); return [...seen];
  };
  for (const [, id, routeModule, route] of routes) {
    const screen = model.screens.find((item) => item.id === id);
    const files = screen?.sources ?? [];
    const reachable = reach(files);
    const rpcs = unique(reachable.flatMap((file) => codes.get(file).rpcs.map((item) => item.name)));
    const tables = unique(reachable.flatMap((file) => codes.get(file).tables.map((item) => item.name)));
    add(nodeId('Pantallas', id.replaceAll('.', '-')), screen?.title ?? id, 'pantalla', `Ruta: \`${route}\`; permiso de sección: \`${id}\`; módulo de acceso: \`${routeModule}\`.\n\n## Para qué sirve\n\n${screen?.description ?? 'Pantalla declarada sin explicación funcional aún; pendiente de revisión.'}\n\n## Componentes de entrada\n\n${sourceLinks(files)}\n\n## Procesos asociados\n\n${list((screen?.flows ?? []).map((name) => link(nodeId('Flujos', name), model.flows.find((flow) => flow.id === name)?.title ?? name)))}\n\n## Dependencias potenciales alcanzables\n\n${reachable.length} archivos locales alcanzables por importaciones. Las siguientes RPC/relaciones son potenciales, no una traza de red: páginas compartidas, ramas condicionales y hooks pueden consultar solo un subconjunto.\n\n### RPC\n\n${list(rpcs.map((name) => link(functionId(name), name)))}\n\n### Relaciones\n\n${list(tables.map((name) => link(tableId(name), name)))}`, screen?.module ?? (routeModule === 'admin' ? 'administracion' : routeModule));
  }
  for (const module of model.modules) {
    const screens = routes.filter(([, id]) => model.screens.find((screen) => screen.id === id)?.module === module.id);
    add(nodeId('Modulos', module.id), module.title, 'modulo', `${module.description}\n\n## Pantallas\n\n${list(screens.map(([, id]) => link(nodeId('Pantallas', id.replaceAll('.', '-')), model.screens.find((screen) => screen.id === id)?.title ?? id)))}\n\n## Procesos\n\n${list(model.flows.filter((flow) => flow.module === module.id).map((flow) => link(nodeId('Flujos', flow.id), flow.title)))}\n\n## Entidades\n\n${entityLinks(model.entities.filter((entity) => entity.module === module.id).map((entity) => entity.id))}\n\n## Reglas y excepciones\n\n${list(model.rules.filter((rule) => rule.module === module.id).map((rule) => link(nodeId('Reglas', rule.id), rule.title)))}\n\n## Explicaciones generales\n\n${list(module.notes.map((note) => link(note, note)))}\n\n## Se relaciona con\n\n${list(module.related.map((id) => link(nodeId('Modulos', id), model.modules.find((item) => item.id === id)?.title ?? id)))}`, module.id);
  }
  const byType = {};
  for (const name of notes.keys()) { const type = name.split('/')[0]; byType[type] = (byType[type] ?? 0) + 1; }
  add('14-Atlas-de-la-app', 'Atlas conectado de SIG CDM', 'indice', `## Recorridos por módulo\n\n${list(model.modules.map((module) => link(nodeId('Modulos', module.id), module.title)))}\n\n## Alcance extraído\n\n${list(Object.entries(byType).map(([kind, count]) => `${kind}: ${count} notas`))}\n\n## Cómo navegar\n\nEmpezar por módulo → pantalla o proceso → entidad o regla → tabla/RPC → consumidores. El grafo global permite explorar toda la red; el grafo local de una OS, importación o función limita el ruido. Las notas técnicas tienen enlaces de ida y vuelta para analizar impacto.\n\n## Calidad de la evidencia\n\nLas explicaciones de negocio son curadas en \`docs/knowledge/mapa-negocio.json\`; las dependencias técnicas se extraen por AST de código versionado y referencias SQL. No se ejecuta código, SQL, IA ni consultas a producción. Se excluyen UI genérica, tests como nodos, credenciales y filas de datos. Los tests se citan como referencias.\n\n## Lo que todavía puede faltar\n\nSQL dinámico, llamadas con nombres variables, permisos RLS efectivos, configuración de servicios, comportamiento de producción y reglas no documentadas necesitan revisión humana o consultas autorizadas. Muchas notas técnicas no equivalen a una auditoría semántica exhaustiva.\n\n## Verificación\n\n${codes.size} archivos de código analizados; ${sqlFunctions.size} nombres de función; ${relations.size} relaciones. La actualización no agrega nodos decorativos ni duplica personas/facturas para poblar el grafo.`);
  return notes;
}
