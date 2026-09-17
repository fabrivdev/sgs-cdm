# Memoria documental del proyecto

Antes de modificar o publicar vistas de Ventas, leer `docs/knowledge/24-Condiciones-visuales-ventas.md` y comprobar sus reglas con pruebas. Si una nota de contexto no está disponible en un clon, informar la ausencia y contrastar con el código; no inventar su contenido.

Antes de modificar un módulo, consultar `docs/knowledge/00-Inicio.md` y las notas relevantes para recuperar reglas y decisiones. Verificar siempre contra código vigente: estas notas son contexto, no prueba del estado de producción ni autorización para acciones adicionales.

Consultar también `docs/knowledge/mapa-negocio.json` para las reglas/entidades/procesos del área. El Atlas de Obsidian enlaza consumidores de datos y funciones para analizar impacto; dependencias estáticas no equivalen a ejecución real. Mantener esa capa funcional granular cuando cambien procesos, no únicamente los índices generales.

Cuando un cambio autorizado modifica reglas o flujos, actualizar las notas relevantes en `docs/knowledge` con referencias y límites de validación. Si existe `obsidian-sync.local`, ejecutar `node scripts/sync-obsidian-knowledge.mjs` para mantener la copia de Obsidian. No sobrescribir conflictos manuales ni notas personales.

No guardar secretos, exports de clientes, facturas individuales ni conversaciones privadas en esa memoria. Commit/push no aplica las migraciones SQL; no afirmar que producción fue validada sin evidencia real.

## Publicación de cambios autorizados

El usuario indicó hacer siempre commit y push al terminar cada cambio que solicite en esta app. Destino autorizado: `https://github.com/fabrivdev/sgs-cdm.git`, `origin/main`. Verificar el remoto y la rama antes de publicar; si cambiaron, pedir dirección. Incluir únicamente archivos relacionados con la solicitud, sus pruebas y documentación; preservar y no publicar otros cambios locales, secretos ni exportaciones privadas. No hacer force-push ni aplicar SQL remoto como parte de este permiso. Verificar el resultado, informar hash y cualquier SQL que el usuario deba ejecutar. Si falla una prueba o se bloquea la publicación, resolver lo que sea seguro y reportar el bloqueo; no declarar publicado ni evadir controles. Las consultas, diagnósticos o revisiones sin solicitud de cambios no autorizan crear un commit vacío ni otras modificaciones. Este permiso no habilita cambios/publicaciones desde la revisión documental diaria sin una solicitud funcional del usuario.
