
# Plan: carga rápida y progresiva del Parque de Máquinas

## Diagnóstico

Hoy, al entrar a la pestaña **Parque & Clientes → Parque**, antes de mostrar nada el frontend descarga:

- 396 máquinas activas
- ~195 clientes y ~199 contactos
- Todo el historial de seguimiento comercial
- **62.295 facturas completas** (todas las columnas, paginadas de 1.000 en 1.000 → ~63 peticiones encadenadas)

Las facturas se traen enteras solo para calcular 4 columnas agregadas:
- Días desde último repuesto / último servicio
- Facturación del rango actual
- Facturación del rango previo (mismo período año anterior)

Mientras esa descarga ocurre, la tabla muestra un spinner y la UI se siente "trabada". Además, la página padre (`ParqueClientes.tsx`) también consulta `facturacion` para sus 4 KPIs, duplicando trabajo.

## Estrategia

Dos cambios independientes y combinables:

1. **Render progresivo**: mostrar la tabla en cuanto haya clientes + máquinas + contactos. Las columnas que dependen de facturación aparecen como skeletons y se llenan después.
2. **Agregar en el servidor**: reemplazar la descarga completa de `facturacion` por funciones SQL (RPC) que devuelvan solo los agregados que la UI necesita — una fila por cliente, no 62k filas.

Resultado esperado: **primer render < 1s**, métricas de facturación visibles en 1–2s adicionales, sin volver a tocar las 62k filas.

## Cambios

### 1. Funciones SQL agregadas (Lovable Cloud)

Crear dos funciones `SECURITY INVOKER` (respetan RLS) que se invocan desde el cliente con `supabase.rpc(...)`:

- `parque_resumen_facturacion(desde date, hasta date, prev_desde date, prev_hasta date)`
  Devuelve por `cliente_id`: `fact_actual`, `fact_prev`, `tiene_rep_rango`, `tiene_srv_rango`.
- `parque_ultimas_facturas()`
  Devuelve por `cliente_id`: `ult_repuesto` (max fecha grupo_fx='Repuestos'), `ult_servicio` (max fecha grupo_fx in 'Mano de obra','Kilometraje').

Ambas filtran por los mismos criterios que hoy aplica el cliente (`grupo_fx`) y solo consideran clientes con máquinas activas.

Se agrega además un índice de apoyo:
```text
CREATE INDEX IF NOT EXISTS idx_facturacion_cliente_fecha
  ON facturacion (cliente_id, fecha);
```

### 2. `ParqueTab.tsx`: carga en dos fases

Fase A (rápida, bloqueante mínima):
- `parque_maquinas` activas, `clientes`, `contactos_cliente`, `seguimiento_comercial`.
- Setear `loading = false` y mostrar la tabla con las columnas de facturación en estado "—" / skeleton.

Fase B (no bloqueante):
- Llamar a las dos RPC en paralelo y mergearlas a un nuevo estado `factAgregados`.
- Las columnas Facturación / Var % / Días último repuesto / Días último servicio leen de ahí.

Recargar Fase B cuando cambia el rango (`rango`, `customDesde`, `customHasta`), no Fase A.

Eliminar el bucle paginado actual sobre `facturacion` y el estado `facturas`.

### 3. `ParqueClientes.tsx`: usar las mismas RPC

Su `cargarMetricas()` también consulta `facturacion`. Cambiarla para usar los mismos agregados (o una tercera RPC `parque_kpis()`), evitando la doble descarga.

### 4. Pequeñas mejoras de UX

- Cache en memoria a nivel de componente (`useRef`) para que volver a la pestaña Parque dentro de la misma sesión sea instantáneo si nada cambió.
- Mantener un skeleton de filas en lugar del spinner pantalla-completa actual.

## Detalles técnicos

- Las RPC usan `SECURITY INVOKER` + `SET search_path = public` y dependen de las RLS existentes de `facturacion` (ya filtran por sucursal/rol).
- El payload pasa de ~62k filas con 7 columnas a ~195 filas con 4 columnas: ~300× menos datos.
- No cambia ninguna lógica de negocio: los criterios (`grupo_fx ∈ {Repuestos, Mano de obra, Kilometraje}`, exclusión de plataformas/cabezales por subgrupo de máquina) se mantienen idénticos. La exclusión "incluir plataformas" sigue aplicándose en el cliente porque depende de `parque_maquinas.subgrupo`, no de la factura.
- Los tipos de Supabase se regeneran automáticamente tras la migración; no se editan manualmente.

## Archivos afectados

- Nueva migración SQL (funciones + índice).
- `src/components/parque/ParqueTab.tsx` — refactor de `cargar()` en dos fases, nuevo estado de agregados, eliminación del bucle paginado.
- `src/pages/ParqueClientes.tsx` — `cargarMetricas()` consume la RPC.
- (Opcional) pequeño componente de skeleton para las celdas de facturación.

## Fuera de alcance

- No se modifica `ClientePanel` (su carga ya es por cliente individual y es rápida).
- No se cambian filtros, ordenamiento, exportación ni el diseño de la tabla.
