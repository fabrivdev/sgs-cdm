# Cobertura unificada de Parque y Panorama

## Contrato vigente

`public.parque_cobertura_unificada_v1(date,date)` es la fuente compartida. Nuevo criterio preparado localmente: propietarios únicos de todo el parque activo, incluyendo plataformas y cabezales. No incorpora clientes sin parque. La función remota todavía conserva la exclusión anterior hasta instalar la migración autorizada indicada abajo. Servicios cuenta OS cerradas por fecha de cierre válida, con apertura como convención histórica si falta cierre; las abiertas requieren jornada completada y fechada. Se excluyen canceladas. Una OS se cuenta una vez y cada propietario una vez por rubro. Repuestos conserva compras efectivas no anuladas según el contrato; ambos rubros usan unión de identidades, nunca suma de porcentajes. El fallback de apertura no certifica la fecha efectiva de atención.

El consumidor valida ventanas, pertenencia al universo, identidades, fechas y valores. Error, permiso ausente o contrato incompleto nunca se convierten en cero. Parque y Panorama deben cotejarse con el mismo período, universo y rubro; filtros locales diferentes pueden producir cifras diferentes legítimamente.

## Instalación y configuración

La migración `20261029230000_unified_park_coverage.sql` y el parche `20261030110000_fix_unified_coverage_subgroup_enum.sql` se instalaron con autorización específica. El parche convierte tres usos de `subgrupo` enum a texto; no cambia cálculo, datos ni ACL. La prueba sintética incluye el enum real para reproducir el anterior error 42883.

STABLE SECURITY DEFINER con controles internos de Parque; EXECUTE autenticado y sin PUBLIC, anon ni service_role. Ningún commit vuelve a ejecutar esos archivos. No ampliar permisos ni aplicar migraciones generales.

Activación frontend por defecto, también si falta la variable. Sólo `VITE_UNIFIED_PARK_COVERAGE_ENABLED=false` restaura explícitamente los consumidores anteriores sin borrar datos. Parque, Panorama y la clave de caché comparten el mismo helper. La configuración local no se versiona. La comprobación visual funcional de cobertura quedó a cargo del usuario; lecturas técnicas y tests no sustituyen esa comprobación. Se omiten resultados de clientes y cifras operativas privadas de este documento público.

Fuentes: `src/lib/parqueCoverage.ts`, `src/lib/unifiedCoverage.ts`, `src/lib/campi/unifiedCoverageStory.ts`, `src/components/parque/ParqueTab.tsx`, `src/pages/ParqueClientes.tsx`, pruebas respectivas y `scripts/verify-unified-coverage.mjs`.

## Cambio pendiente de activación: todo el parque

`20261030180000_unified_coverage_all_park.sql` reemplaza únicamente el cuerpo de `public.parque_cobertura_unificada_v1(date,date)`: retira las dos exclusiones por subgrupo en el CTE de máquinas y cambia la política a `all_park_closed_or_completed_v2`. Conserva activos con propietario, deduplicación, reglas OS, fechas, compras/NC, permisos internos, SECURITY DEFINER, search_path y ACL. Sin cambios de tablas, datos, índices ni grants/revokes. La guarda exige propietario ejecutor y hash del cuerpo anterior parcheado; no sobrescribe una versión divergente.

El consumidor exige la nueva política: no rotula el antiguo universo como completo. Parque inicia y limpia filtros incluyendo plataformas; una exclusión manual sigue siendo un filtro explícito. Instalación y subida a main autorizadas. La instalación remota sigue pendiente: no hay conector SQL disponible y Computer Use permanece bloqueado. No publicar el consumidor sin instalar previamente la migración. La validación sintética usa PGlite, no datos ni consultas productivas. No se certifican cantidades actuales de propietarios con este cambio.

Compatibilidad de activación: el cambio de `policy` requiere coordinar la función con el consumidor nuevo. El consumidor anterior que tenga el gate unificado activo rechazará la política nueva; el nuevo rechazará la antigua. No instalar aisladamente sin acordar esa transición y la publicación que hace el usuario. No hay fallback silencioso entre universos. Reversión: restaurar el cuerpo previo parcheado y el consumidor previo juntos, conservando ACL; no hay backfill ni datos que revertir.

Validación local final: 76 pruebas de código, verificación SQL sintética PGlite, lint sin errores, tipado global y build aprobados. La comprobación real de numeradores/denominador queda pendiente de instalación y lectura autorizada. SHA256 del SQL: `76AA47E05BF24D679CEF67E56A7984979F2CF14787C5E9118ABB146D79F4E2AB`.
