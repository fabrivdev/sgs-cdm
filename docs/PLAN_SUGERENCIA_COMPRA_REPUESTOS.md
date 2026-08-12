# Plan de implementación — Sugerencia de compra de repuestos

## 1. Decisión de producto

Construir una nueva sección **Repuestos > Sugerencia de compra** como un motor de planificación de inventario parametrizable, versionado y completamente auditable.

La recomendación no será una caja negra ni un cálculo ejecutado en el navegador. PostgreSQL calculará cada corrida por lote, guardará una foto de los datos y parámetros utilizados y conservará todos los resultados intermedios que explican la cantidad sugerida.

La implementación comenzará con **CLAAS**, porque los archivos de enero y junio permiten validar el modelo en dos momentos y el corte de junio ya incluye mercadería en tránsito. Luego se habilitará **HORSCH** reutilizando el mismo motor con parámetros propios.

## 2. Qué se relevó de los archivos

Los tres libros comparten el mismo modelo analítico:

- `Segmentación de Repuestos 1-2026` de CLAAS: aproximadamente 15.688 piezas en la matriz.
- `Segmentación de Repuestos 6-2026` de CLAAS: aproximadamente 15.768 piezas y una fuente adicional de mercadería en tránsito.
- `Segmentación de Repuestos 1-2026` de HORSCH: aproximadamente 1.406 piezas en la matriz.

### Fuentes utilizadas por el cálculo

1. Maestro de piezas: código interno, código de fabricante, descripción, familia, criticidad, origen y marca.
2. Stock y costo actual.
3. Ventas y salidas por SKU, factura y fecha.
4. Lista de precios de proveedor, con costo marítimo, aéreo, peso y costos asociados.
5. Pedidos especiales o piezas bajo pedido.
6. Stock en tránsito, cuando está disponible.
7. Políticas por segmento y tabla de equivalencias entre el mix analítico y el segmento final.

### Parámetros generales observados

| Parámetro | CLAAS | HORSCH |
|---|---:|---:|
| Peso últimos 12 meses | 60% | 60% |
| Peso 12 meses anteriores | 40% | 40% |
| Lead time base | 3 meses | 4 meses |
| Ciclo de planificación | 1 mes | 1 mes |
| Horizonte base | 4 meses | 5 meses |
| Origen principal | Alemania | Brasil |

Estos valores deben ser configurables por marca y vigencia, nunca constantes en código.

### Segmentos y políticas observadas

| Segmento | Nivel de servicio | Revisión | Z base | Conducta principal |
|---|---:|---|---:|---|
| Estrella | 99% | Mensual | 2,50 | Máxima cobertura y seguridad |
| Crítico estratégico | 98% | Mensual | 2,05 | Stock asegurado con control de capital |
| Demanda volátil | 90% | Bimestral | 1,00 | Cobertura controlada por variabilidad |
| Flujo estable | 96% | Bimestral | 1,75 | Reposición automática estándar |
| Servicio económico | 88% | Trimestral | 0,80 | Stock mínimo y reposición restrictiva |
| Bajo pedido | Sin nivel fijo | Semestral | 0,00 | Sin stock planificado salvo pedido firme |

## 3. Secuencia del motor de cálculo

Cada corrida utilizará una fecha de análisis, una marca y una versión de parámetros.

### Paso A — Identidad y calidad del artículo

- Unificar código interno, código de fabricante y código incluido en la descripción.
- Resolver duplicados y variantes comerciales de una misma pieza física.
- Identificar piezas sin maestro, sin marca, sin criticidad, sin costo o con vínculos ambiguos.
- Excluir o marcar devoluciones, documentos anulados, movimientos internos y cantidades anómalas según reglas configurables.

### Paso B — Histórico de demanda

Calcular por pieza:

- unidades, costo/importe, facturas y meses con venta de los últimos 12 y 24 meses;
- unidades de los 12 meses anteriores;
- demanda media, desviación estándar y coeficiente de variación;
- días desde la última venta;
- mayor pedido y factor de pico;
- demanda de las ventanas estacionales equivalentes de los dos años anteriores;
- peso estacional por unidades y por frecuencia de pedidos;
- ventas por sucursal y demanda total de la compañía.

La fuente operativa será el histórico persistido en la app, no los Excel. Los Excel serán el patrón de validación.

### Paso C — Clasificación ABC–FSN–XYZ–VED

- **ABC:** participación acumulada del importe/costo: A hasta 80%, B hasta 95%, C el resto.
- **FSN:** N sin pedidos, sin última venta o con más de 365 días; F con al menos 6 pedidos y venta en los últimos 90 días; S en los demás casos.
- **XYZ:** X con CV ≤ 0,5 y al menos 9 meses con venta; Y con 0,5 < CV ≤ 1 y entre 4 y 8 meses; Z el resto.
- **VED:** inicial de la criticidad Vital, Esencial o Deseable.
- Concatenar las cuatro clasificaciones y convertir el código a uno de los seis segmentos mediante una tabla versionada de reglas.
- Aplicar las excepciones del archivo para piezas económicas con demanda activa, alta frecuencia o picos atípicos.

Todos los umbrales anteriores serán editables con valores iniciales iguales a los libros.

### Paso D — Demanda del horizonte

- Horizonte = lead time de la marca + frecuencia de revisión del segmento.
- Proyección base = demanda mensual ponderada 60/40 × horizonte.
- Comparar la proyección con la demanda estacional histórica.
- Usar la demanda estacional cuando el índice sea fuerte o cuando la relación contra la proyección salga del rango 0,30–1,70.
- Limitar demanda errática y picos aislados para piezas Z de baja frecuencia.
- Mantener pisos especiales para piezas Vitales y para piezas rápidas de costo bajo.

### Paso E — Seguridad, stock objetivo y necesidad

- Desviación normal del horizonte = desviación 12M × raíz del horizonte.
- Desviación estacional = diferencia de las ventanas históricas / raíz de 2.
- Seleccionar la desviación aplicable y evitar seguridad cero en piezas con demanda.
- Stock de seguridad = Z del segmento × desviación, con los límites especiales definidos en los Excel.
- Stock proyectado = stock actual + compras abiertas/en tránsito − compromisos confirmados.
- Stock objetivo = demanda ajustada del horizonte + seguridad, con límites específicos por segmento.
- Necesidad neta = stock objetivo − stock proyectado.

Antes de comprar, el motor deberá señalar una **transferencia entre sucursales** cuando exista exceso utilizable en otra ubicación. La compra sugerida será la necesidad neta de toda la compañía después de esas transferencias.

### Paso F — Cantidad y costo sugeridos

- Cero si la pieza no corresponde a revisión, pertenece a Bajo pedido o no cumple la actividad mínima.
- Para Vitales con demanda: garantizar al menos una unidad cuando exista necesidad positiva.
- Para piezas no vitales: no reponer con cero ventas recientes o una sola operación, salvo excepción aprobada.
- Sumar pedidos especiales confirmados.
- Aplicar múltiplo de empaque, MOQ, mínimo por proveedor y redondeo configurables.
- Determinar costo desde lista marítima/aérea; como respaldo, costo medio histórico y luego costo de stock.
- Calcular inversión total, moneda y modalidad logística.
- Aplicar un límite presupuestario opcional, priorizando criticidad, riesgo de rotura y retorno esperado.

## 4. Arquitectura de datos propuesta

### Reutilizar lo que ya existe

- `productos`: maestro, marca, familia y códigos.
- `repuestos_stock`: existencia vigente por sucursal y depósito.
- `facturacion_lineas_importadas`: cantidades, fechas, facturas y ventas por pieza.
- `compras_pedidos`: cantidades pedidas, entregadas y pendientes.
- `compras_solicitudes`: necesidades todavía no convertidas en pedido.
- Funciones actuales de normalización y vinculación de códigos de repuesto.

### Nuevas estructuras

1. `repuestos_modelo_versiones`: versión, marca, vigencia, estado borrador/publicado y parámetros generales.
2. `repuestos_modelo_segmentos`: nivel de servicio, Z, frecuencia y límites por segmento.
3. `repuestos_modelo_reglas_mix`: equivalencias ABC–FSN–XYZ–VED y excepciones.
4. `repuestos_articulo_planificacion`: criticidad, origen, MOQ, múltiplo, proveedor, mínimos/máximos y overrides por pieza.
5. `repuestos_precios_proveedor`: precios, moneda, transporte, peso, vigencia y modalidad.
6. `repuestos_stock_cargas` y `repuestos_stock_historico`: conservar cada foto de stock; la importación actual solo reemplaza el saldo.
7. `repuestos_ventas_mensuales`: agregado persistido por pieza, sucursal y mes para evitar recalcular todas las facturas.
8. `repuestos_corridas`: cabecera de simulación con fecha, marca, versión, fuentes, usuario y parámetros congelados.
9. `repuestos_corrida_resultados`: métricas intermedias, clasificación, demanda, seguridad, stock, necesidad, cantidad y costo por pieza.
10. `repuestos_decisiones_compra`: cantidad propuesta, cantidad ajustada, motivo, estado, aprobador y vínculo futuro con solicitud/pedido.

La configuración publicada debe ser inmutable. Cualquier cambio crea una versión nueva para poder reproducir corridas históricas.

## 5. Experiencia de usuario

### Entrada al módulo

Agregar **Sugerencia de compra** dentro de Repuestos, separada de Catálogo y stock y de Compras.

### Vista principal

- Selector CLAAS/HORSCH y alcance compañía/sucursal.
- Estado de actualización de ventas, stock, pedidos, precios y criticidad.
- Tarjetas: inversión sugerida, piezas a pedir, Vitales en riesgo, transferencias posibles, piezas sin datos y cobertura estimada.
- Comparación con la corrida anterior: inversión, unidades y piezas añadidas/retiradas.
- Botón **Nueva simulación** y acceso a corridas guardadas.

### Tabla de recomendaciones

Columnas principales:

- pieza, descripción, marca y familia;
- clasificación ABC, FSN, XYZ, VED y segmento;
- ventas 12M/24M y última venta;
- stock, tránsito, transferible y stock proyectado;
- demanda del horizonte, seguridad y stock objetivo;
- necesidad, cantidad sugerida, costo unitario e inversión;
- estado de datos, nivel de confianza y motivo principal.

Filtros por marca, segmento, criticidad, familia, sucursal, pedir/no pedir, riesgo y calidad de datos.

### Explicación por pieza

Un panel lateral mostrará un recorrido verificable:

`Histórico → Clasificación → Horizonte → Demanda → Seguridad → Stock/Tránsito → Necesidad → Redondeos → Sugerencia final`

Incluirá evolución mensual, parámetros aplicados, alertas y la posibilidad de ajustar la cantidad con un motivo obligatorio. Nunca se ocultará el valor calculado original.

### Flujo operativo

1. Jefatura ejecuta una simulación.
2. Revisa excepciones y artículos con datos incompletos.
3. Ajusta cantidades justificadas.
4. Aprueba la corrida.
5. Exporta a Excel o genera solicitudes de compra.
6. En una fase posterior, convierte las solicitudes aprobadas en pedidos y mide el resultado.

## 6. Permisos

- **Administrador:** importar fuentes, administrar reglas/versiones y corregir maestros.
- **Jefatura de Repuestos:** ejecutar simulaciones, ajustar y aprobar recomendaciones.
- **Operativo de Repuestos:** consultar resultados y detalle, sin publicar parámetros ni aprobar.
- Otros módulos no tendrán acceso salvo autorización explícita.

Las políticas deben aplicarse en base de datos, no solo ocultando botones.

## 7. Validación antes de confiar en el motor

### Prueba de paridad

Recalcular los tres libros con los mismos cortes y comparar:

- métricas 12M/24M;
- ABC, FSN, XYZ, VED y segmento;
- demanda ajustada, seguridad y stock objetivo;
- cantidad y costo sugeridos.

Objetivos iniciales:

- 100% de diferencias rastreables a una regla o dato;
- al menos 99% de coincidencia de clasificación;
- al menos 98% de coincidencia de cantidad sugerida antes de redondeos operativos;
- tolerancia monetaria menor a 0,5%.

### Backtest CLAAS

Usar el corte de enero para generar la recomendación y contrastarla con el comportamiento observado hasta junio. Evaluar roturas evitadas, exceso generado, capital requerido y artículos donde el modelo sobrestimó o subestimó demanda.

### Controles obligatorios de datos

- fecha y cobertura real del histórico;
- facturas sin fecha completadas o excluidas;
- devoluciones y cantidades negativas;
- duplicados y vínculos ambiguos;
- monedas y tipos de cambio;
- piezas sin criticidad, costo, familia u origen;
- antigüedad del stock, precios y pedidos abiertos;
- pedidos pendientes realmente en tránsito;
- diferencias entre stock global y por sucursal.

Una corrida con una fuente crítica vencida debe quedar bloqueada o marcada como simulación no aprobable.

## 8. Fases de implementación

### Fase 0 — Especificación y auditoría

- Documentar todas las fórmulas como reglas con nombre y ejemplos.
- Auditar cobertura y calidad de las fuentes actuales.
- Definir qué movimiento cuenta como venta, pedido y tránsito.
- Preparar casos dorados de ambos CLAAS y HORSCH.

**Salida:** especificación congelada del motor v1 y reporte de brechas de datos.

### Fase 1 — Base de datos e importación

- Crear tablas versionadas y políticas RLS.
- Persistir snapshots de stock en lugar de borrar el anterior.
- Incorporar criticidad/origen, precios y parámetros.
- Crear agregados mensuales e índices.

**Salida:** fuentes completas, trazables y eficientes.

### Fase 2 — Motor CLAAS

- Implementar el cálculo set-based en PostgreSQL.
- Guardar corridas y resultados intermedios.
- Ejecutar paridad enero/junio y backtest.
- Corregir diferencias antes de construir la aprobación.

**Salida:** motor CLAAS validado y reproducible.

### Fase 3 — Interfaz y flujo de revisión

- Dashboard, tabla, simulador de parámetros y detalle explicativo.
- Ajustes con motivo, aprobación y exportación.
- Alertas de calidad/frescura y comparación de escenarios.

**Salida:** piloto usable por Jefatura de Repuestos.

### Fase 4 — HORSCH y restricciones comerciales

- Activar configuración HORSCH con lead time y origen propios.
- Incorporar MOQ, múltiplos, modalidad logística y presupuesto.
- Validar con el libro HORSCH.

**Salida:** operación multi-marca.

### Fase 5 — Cierre del ciclo

- Crear solicitudes desde la corrida aprobada.
- Vincular solicitudes, pedidos y recepciones.
- Medir exactitud, roturas, exceso y ahorro por transferencias.
- Ajustar parámetros mediante versiones nuevas.

**Salida:** ciclo completo de recomendación a resultado.

## 9. Criterios de éxito

- Una corrida normal debe terminar en menos de 30 segundos y la tabla debe responder en menos de 3 segundos.
- Cada cantidad debe poder explicarse con datos, reglas y parámetros visibles.
- Ninguna corrida aprobada puede cambiar si posteriormente se modifican parámetros o fuentes.
- Las recomendaciones deben distinguir compra, transferencia y pedido especial.
- Debe existir comparación contra Excel antes de habilitar aprobaciones reales.
- Después del piloto se medirán nivel de servicio, roturas, inventario inmovilizado, precisión de demanda y aceptación/ajuste de sugerencias.

## 10. Decisiones pendientes antes de programar

1. Confirmar si la compra se planifica primero a nivel compañía o directamente por sucursal. Se recomienda compañía con transferencias previas y distribución posterior.
2. Definir la fuente oficial de criticidad, familia analítica y origen.
3. Definir la fuente periódica de precios CLAAS/HORSCH y costos logísticos.
4. Confirmar qué estados de `compras_pedidos` representan tránsito real.
5. Definir tratamiento de devoluciones, garantías, consumos internos y ventas extraordinarias.
6. Confirmar redondeo: unidad entera, decimal, empaque o MOQ por pieza.
7. Definir quién aprueba y qué límite presupuestario puede manejar cada nivel.

La implementación debe comenzar únicamente después de cerrar las decisiones 1–6 y aprobar los casos dorados de la Fase 0.
