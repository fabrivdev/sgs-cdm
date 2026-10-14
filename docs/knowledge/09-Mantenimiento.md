# Mantenimiento de la memoria y el atlas

## Fuente canónica reconciliada el 14/10/2026

La copia de trabajo documentada en [[12-Estado-local]] contiene docs/knowledge, mapa-negocio.json y scripts/knowledge-graph.mjs y sync-obsidian-knowledge.mjs. Las notas corregidas de Obsidian se incorporaron al origen antes de regenerar. Personal permanece fuera del sincronizador.

Las notas narrativas numeradas se editan en docs/knowledge; las reglas/entidades/flujos en mapa-negocio.json. El estado de las copias (12) es curado, no se sustituye por un inventario automático de un solo checkout. Codigo/Datos/Funciones y Pantallas se regeneran del código de referencia. No confundir SQL declarado con SQL aplicado ni permisos declarados con comportamiento en producción.

## Protección contra regresiones

El manifiesto v2 identifica repositorio, commit y revisión del motor. El motor antiguo v1 rechaza este manifiesto. El motor nuevo rechaza código anterior/divergente, cambios funcionales versionados sin commit y fuentes no reconciliadas. Antes de escribir, valida todo el conjunto y aborta si una nota fue editada a mano. No fuerza checksums para silenciar conflictos. Las notas ya reconciliadas e idénticas pueden adoptarse explícitamente durante la migración inicial, con respaldo y hashes revisados.

Usar --check para revisar sin escribir; --apply solo tras resolver diferencias. La configuración local del checkout antiguo delega al motor canónico: no genera desde el código viejo. Una fuente documental modificada requiere revisar el diff y actualizar el sello de revisión; no hay actualización automática del sello.

## Evitar notas innecesarias

atlas-catalog.json es la lista explícita de notas existentes que se mantienen. Un objeto nuevo aparece en los índices 10/11 sin crear una ficha automática. Agregar una nota al catálogo solo si mejora navegación o explica una decisión. Las fichas retiradas conservan identidad y avisan que ya no se generan desde la referencia; no se borran automáticamente. Los enlaces a objetos no materializados se muestran como referencias textuales y se listan en los índices.

## Validación y límites

Comprobar enlaces, codificación, protección de cambios manuales, rechazo de versiones antiguas e idempotencia. Las ediciones en Personal requieren petición explícita. No guardar secretos ni filas privadas. Una revisión documental no ejecuta SQL ni importaciones; Fabrizio realiza la publicación pública en Lovable. Un push no prueba despliegue ni migraciones.

Para diseño, aplicar [[00-Inicio]], [[24-Condiciones-visuales-ventas]], [[25-Revision-movil-transversal]] y reglas de módulo. Render y revisión visual independiente siguen siendo necesarios: esta reconciliación no aprueba pantallas.
