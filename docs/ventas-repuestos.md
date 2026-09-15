# Ventas de Repuestos

## Alcance y fuentes

La pantalla reutiliza `ventas_area_movimientos_base` y selecciona únicamente
`area_calculada = 'repuestos'`. Conserva el corte del 01/07/2026, moneda USD y
exclusiones del histórico. Los repuestos vinculados a OS siguen en Servicios;
no se suman por segunda vez. El histórico no permite separar ese canal.
Por ello, las variaciones que cruzan el corte tienen distinta cobertura.

`cliente_nombre_canonico` unifica las variantes de CAMPOS DEL MAÑANA S.A.
antes de agrupar y contar clientes. No modifica nombres en las fuentes.

## Métricas

- Facturado: suma firmada del importe del período.
- Ventas: importe de líneas no identificadas como nota de crédito.
- Notas de crédito: importe firmado de esas líneas; ventas + NC = facturado.
  En el histórico se identifican por importe negativo; en el actual se respeta
  además la clasificación documental de la fuente.
- Documentos: identidad por origen, fecha, sucursal, número y clase documental.
  Varias líneas de la misma factura cuentan una sola vez. Sin número, cada
  línea queda diferenciada: no se inventa una agrupación documental.
- Unidades: sólo sistema actual. NC con cantidad positiva se presenta negativa.
  Si un grupo incluye histórico, sus unidades se muestran como no disponibles.
  Por repuesto se separan vendidas, devueltas y netas, sin mezclar artículos.
- Participación: facturado del grupo / facturado completo de la selección.
- Promedio por documento: facturado / documentos. No es precio por artículo.

## Fechas, vistas y presentación

Panorama utiliza el rango superior completo. Seleccionar un período intersecta
sus límites con ese rango y recorta KPI, resumen, clientes, repuestos, detalle
y análisis. Agosto finaliza el 31/08; no incluye el 01/09. La fila final del
Panorama conserva el total del rango superior y permite volver a éste.
LM compara la agrupación anterior (día, semana, mes o año); LY el año anterior.
Meses completos comparan meses completos, incluidos últimos días y bisiestos;
períodos recortados conservan el recorte. No se inventa un porcentaje sin base.

Resumen presenta composición por sucursal y origen. Clientes son los compradores
del período, con promedio por documento y comparación del mismo rango del año
anterior; no es una lista de clientes perdidos. En esa lista se reemplaza el
conteo trivial de un cliente por fila por el promedio, conservando el orden
de importes. Repuestos agrupa por código interno y código de fabricante; sin
ambos códigos, diferencia las descripciones actuales para no fusionar artículos.

Detalle es plano y paginado en el servidor: una fila por línea facturada,
incluyendo facturas repetidas, ambos códigos y cantidad firmada. El histórico
se identifica explícitamente como sin detalle por artículo. Código de fabricante
no equivale a nombre del fabricante; no se deduce éste de una descripción.

Se conservó Análisis financiero paginado (repuesto/cliente/sucursal vs mes o
sucursal), sin permitir sucursal contra sí misma. Importes usan el formateador
`$` de la app. Tablas densas, encabezados centrados y desplazamiento horizontal
local cuando es necesario. El total del detalle queda fuera del scroll.

## Implementación y verificación

Migración manual: `20260915150000_rebuild_parts_sales_dashboard.sql`.
Requiere las funciones previas, incluyendo la migración de identidad de Campos
del 15/09 a las 12:00. Crea únicamente RPCs; no cambia registros ni permisos.
Las RPCs públicas requieren sesión y acceso a `repuestos.ventas`; el helper
de movimientos no es ejecutable por `anon` ni `authenticated`.

Los resúmenes se calculan antes de paginar, sin el límite viejo de 500 líneas.
React Query comparte panorama/resumen sin selección, conserva cache por filtros,
cancela solicitudes obsoletas y no reintenta automáticamente consultas fallidas.
Sólo se carga el listado del tab activo. No se amplió el timeout de PostgreSQL.

Prueba SQL aislada (PGlite, no producción):
`node scripts/verify-parts-sales-sql.mjs`.
Pruebas de UI: `RepuestosVentas.test.tsx` y `partsSalesFormat.test.ts`.
Verifican conciliación, NC, documentos, Campos, filtros, permisos, paginación
de 524 líneas, meses completos, bisiestos y selección de agosto.

La aceptación con datos reales y los tiempos de consulta quedan por comprobar
después de aplicar la migración en la base. Commit/push no aplican SQL.
