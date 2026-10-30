# Cobertura unificada de Parque y Panorama

## Contrato vigente

`public.parque_cobertura_unificada_v1(date,date)` es la fuente compartida. Universo: propietarios únicos de máquinas principales; excluye plataformas y cabezales. Servicios cuenta OS cerradas por fecha de cierre válida, con apertura como convención histórica si falta cierre; las abiertas requieren jornada completada y fechada. Se excluyen canceladas. Una OS se cuenta una vez y cada propietario una vez por rubro. Repuestos conserva compras efectivas no anuladas según el contrato; ambos rubros usan unión de identidades, nunca suma de porcentajes. El fallback de apertura no certifica la fecha efectiva de atención.

El consumidor valida ventanas, pertenencia al universo, identidades, fechas y valores. Error, permiso ausente o contrato incompleto nunca se convierten en cero. Parque y Panorama deben cotejarse con el mismo período, universo y rubro; filtros locales diferentes pueden producir cifras diferentes legítimamente.

## Instalación y configuración

La migración `20261029230000_unified_park_coverage.sql` y el parche `20261030110000_fix_unified_coverage_subgroup_enum.sql` se instalaron con autorización específica. El parche convierte tres usos de `subgrupo` enum a texto; no cambia cálculo, datos ni ACL. La prueba sintética incluye el enum real para reproducir el anterior error 42883.

STABLE SECURITY DEFINER con controles internos de Parque; EXECUTE autenticado y sin PUBLIC, anon ni service_role. Ningún commit vuelve a ejecutar esos archivos. No ampliar permisos ni aplicar migraciones generales.

Activación frontend: `VITE_UNIFIED_PARK_COVERAGE_ENABLED=true`. Apagar el gate restaura consumidores anteriores sin borrar datos. La configuración local no se versiona. La comprobación visual funcional de cobertura quedó a cargo del usuario; lecturas técnicas y tests no sustituyen esa comprobación. Se omiten resultados de clientes y cifras operativas privadas de este documento público.

Fuentes: `src/lib/parqueCoverage.ts`, `src/lib/unifiedCoverage.ts`, `src/lib/campi/unifiedCoverageStory.ts`, `src/components/parque/ParqueTab.tsx`, `src/pages/ParqueClientes.tsx`, pruebas respectivas y `scripts/verify-unified-coverage.mjs`.
