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

### Parámetros iniciales del motor

| Parámetro | CLAAS | HORSCH |
|---|---:|---:|
| Peso últimos 12 meses | 60% | 60% |
| Peso 12 meses anteriores | 40% | 40% |
| Lead time base | 3 meses | 4 meses |
| Ciclo de planificación | 1 mes | 1 mes |
| Horizonte base | 4 meses | 5 meses |
| Origen por defecto | Alemania | Alemania |

Estos valores deben ser configurables por marca y vigencia, nunca constantes en código. Aunque el archivo HORSCH de ejemplo identifica Brasil, para la primera versión todas las piezas partirán con **Alemania** como origen y podrán corregirse manualmente.

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
- Tomar la familia analítica del maestro de productos.
- Mantener la criticidad como un dato manual por código. Los códigos nuevos quedarán pendientes de clasificación hasta que el usuario les asigne Vital, Esencial o Deseable.
- Asignar Alemania como origen predeterminado, con edición manual por pieza.
- Identificar piezas sin maestro, sin marca, sin criticidad o con vínculos ambiguos.
- En la primera versión, utilizar los movimientos de venta importados sin tratamiento especial de devoluciones, garantías, consumos internos o ventas extraordinarias. La interfaz deberá advertir esta limitación.

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

- **ABC económico:** participación acumulada del total vendido en los últimos 12 meses: A hasta 80%, B hasta 95%, C el resto. No dependerá todavía de listas de precios ni costos logísticos.
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
- En la primera versión, stock proyectado = stock actual global. El tránsito se mantendrá previsto en el modelo, pero será cero hasta implementar su importador específico.
- Stock objetivo = demanda ajustada del horizonte + seguridad, con límites específicos por segmento.
- Necesidad neta = stock objetivo − stock proyectado.

La planificación y la compra serán **globales a nivel empresa**. El motor sumará el stock y la demanda de todas las sucursales y calculará una única necesidad de compra por pieza. La distribución posterior entre sucursales quedará fuera de la primera versión.

### Paso F — Cantidad y costo sugeridos

- Cero si la pieza no corresponde a revisión, pertenece a Bajo pedido o no cumple la actividad mínima.
- Para Vitales con demanda: garantizar al menos una unidad cuando exista necesidad positiva.
- Para piezas no vitales: no reponer con cero ventas recientes o una sola operación, salvo excepción configurada.
- Sumar pedidos especiales confirmados.
- Redondear la sugerencia siempre a **unidades enteras**, elevando una necesidad positiva a la unidad completa siguiente.
- Mostrar como referencia económica el total vendido histórico. La valorización real de la compra se incorporará cuando exista un importador periódico de precios CLAAS/HORSCH y costos logísticos.
- No aplicar todavía MOQ, múltiplos de empaque, mínimos de proveedor ni límites presupuestarios.

## 4. Arquitectura de datos propuesta

### Reutilizar lo que ya existe

- `productos`: maestro, marca, familia y códigos.
- `repuestos_stock`: existencia vigente por sucursal y depósito.
- `facturacion_lineas_importadas`: cantidades, fechas, facturas y ventas por pieza.
- `compras_pedidos`: disponible para una futura definición de tránsito, pero no se utilizará como tránsito en la primera versión.
- `compras_solicitudes`: necesidades todavía no convertidas en pedido.
- Funciones actuales de normalización y vinculación de códigos de repuesto.

### Nuevas estructuras

1. `repuestos_modelo_versiones`: versión, marca, vigencia, estado borrador/publicado y parámetros generales.
2. `repuestos_modelo_segmentos`: nivel de servicio, Z, frecuencia y límites por segmento.
3. `repuestos_modelo_reglas_mix`: equivalencias ABC–FSN–XYZ–VED y excepciones.
4. `repuestos_articulo_planificacion`: criticidad manual, origen editable con Alemania por defecto y overrides por pieza.
5. `repuestos_precios_proveedor`: estructura reservada para una fase posterior; precios, moneda, transporte, peso, vigencia y modalidad.
6. `repuestos_stock_cargas` y `repuestos_stock_historico`: conservar cada foto de stock; la importación actual solo reemplaza el saldo.
7. `repuestos_ventas_mensuales`: agregado persistido por pieza, sucursal y mes para evitar recalcular todas las facturas.
8. `repuestos_corridas`: cabecera de simulación con fecha, marca, versión, fuentes, usuario y parámetros congelados.
9. `repuestos_corrida_resultados`: métricas intermedias, clasificación, demanda, seguridad, stock, necesidad, cantidad y costo por pieza.

La configuración publicada debe ser inmutable. Cualquier cambio crea una versión nueva para poder reproducir corridas históricas.

## 5. Experiencia de usuario

### Entrada al módulo

Agregar **Sugerencia de compra** dentro de Repuestos, separada de Catálogo y stock y de Compras.

### Vista principal

- Selector CLAAS/HORSCH. El alcance de cálculo será siempre la compañía completa.
- Estado de actualización de ventas, stock, maestro y criticidad.
- Tarjetas: piezas a pedir, unidades sugeridas, Vitales en riesgo, piezas sin datos y cobertura estimada.
- Comparación con la corrida anterior: inversión, unidades y piezas añadidas/retiradas.
- Botón **Nueva simulación** y acceso a corridas guardadas.

### Tabla de recomendaciones

Columnas principales:

- pieza, descripción, marca y familia;
- clasificación ABC, FSN, XYZ, VED y segmento;
- ventas 12M/24M y última venta;
- stock global, tránsito futuro y stock proyectado;
- demanda del horizonte, seguridad y stock objetivo;
- necesidad, cantidad sugerida, costo unitario e inversión;
- estado de datos, nivel de confianza y motivo principal.

Filtros por marca, segmento, criticidad, familia, pedir/no pedir, riesgo y calidad de datos.

### Explicación por pieza

Un panel lateral mostrará un recorrido verificable:

`Histórico → Clasificación → Horizonte → Demanda → Seguridad → Stock global → Necesidad → Redondeo entero → Sugerencia final`

Incluirá evolución mensual, parámetros aplicados, alertas y el detalle de la fórmula. La sección emitirá una sugerencia; no habrá aprobación ni modificación operativa de pedidos en la primera versión.

### Flujo operativo

1. El usuario ejecuta una simulación global para CLAAS o HORSCH.
2. Revisa excepciones y artículos con datos incompletos.
3. Consulta la explicación de cada sugerencia.
4. Compara escenarios de parámetros.
5. Exporta la sugerencia a Excel.

## 6. Permisos

- **Administrador:** importar fuentes, administrar reglas/versiones y corregir maestro, criticidad y origen.
- **Jefatura de Repuestos:** ejecutar simulaciones, guardar escenarios y exportar sugerencias.
- **Operativo de Repuestos:** consultar resultados y detalle.
- Otros módulos no tendrán acceso salvo autorización explícita.

Las políticas deben aplicarse en base de datos, no solo ocultando botones. No existirá un flujo de aprobación en la primera versión.

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
- al menos 98% de coincidencia de cantidad sugerida antes del redondeo a unidad entera;
- tolerancia monetaria menor a 0,5%.

### Backtest CLAAS

Usar el corte de enero para generar la recomendación y contrastarla con el comportamiento observado hasta junio. Evaluar roturas evitadas, exceso generado, capital requerido y artículos donde el modelo sobrestimó o subestimó demanda.

### Controles obligatorios de datos

- fecha y cobertura real del histórico;
- facturas sin fecha completadas o excluidas;
- devoluciones y cantidades negativas, inicialmente solo como indicadores de calidad sin modificar el cálculo;
- duplicados y vínculos ambiguos;
- monedas y tipos de cambio;
- piezas sin criticidad, costo, familia u origen;
- antigüedad del stock y del histórico de ventas;
- disponibilidad futura del importador de tránsito, sin bloquear la primera versión;
- diferencias entre stock global y por sucursal.

Una corrida con ventas, stock o maestro vencidos debe quedar bloqueada o marcada como simulación no confiable.

## 8. Fases de implementación

### Fase 0 — Especificación y auditoría

- Documentar todas las fórmulas como reglas con nombre y ejemplos.
- Auditar cobertura y calidad de las fuentes actuales.
- Documentar que la primera versión usa las ventas importadas sin excepciones y tránsito cero.
- Preparar casos dorados de ambos CLAAS y HORSCH.

**Salida:** especificación congelada del motor v1 y reporte de brechas de datos.

### Fase 1 — Base de datos e importación

- Crear tablas versionadas y políticas RLS.
- Persistir snapshots de stock en lugar de borrar el anterior.
- Incorporar criticidad manual, Alemania como origen predeterminado y parámetros versionados.
- Crear agregados mensuales e índices.

**Salida:** fuentes completas, trazables y eficientes.

### Fase 2 — Motor CLAAS

- Implementar el cálculo set-based en PostgreSQL.
- Guardar corridas y resultados intermedios.
- Ejecutar paridad enero/junio y backtest.
- Corregir diferencias antes de habilitar la sección para uso real.

**Salida:** motor CLAAS validado y reproducible.

### Fase 3 — Interfaz y flujo de revisión

- Dashboard, tabla, simulador de parámetros y detalle explicativo.
- Comparación de escenarios y exportación de la sugerencia.
- Alertas de calidad/frescura y comparación de escenarios.

**Salida:** piloto usable por Jefatura de Repuestos.

### Fase 4 — HORSCH

- Activar configuración HORSCH con lead time propio y Alemania como origen inicial editable.
- Validar con el libro HORSCH.

**Salida:** operación multi-marca.

### Fase 5 — Ampliaciones posteriores

- Incorporar el importador de tránsito y listas de precios/costos logísticos.
- Incorporar MOQ, múltiplos de empaque, modalidad logística y presupuesto.
- Definir el tratamiento de devoluciones, garantías, consumos internos y ventas extraordinarias.
- Vincular sugerencias, solicitudes, pedidos y recepciones si se decide cerrar el ciclo operativo.
- Medir exactitud, roturas, exceso y ahorro por transferencias.
- Ajustar parámetros mediante versiones nuevas.

**Salida:** ciclo completo de recomendación a resultado.

## 9. Criterios de éxito

- Una corrida normal debe terminar en menos de 30 segundos y la tabla debe responder en menos de 3 segundos.
- Cada cantidad debe poder explicarse con datos, reglas y parámetros visibles.
- Ninguna corrida guardada puede cambiar si posteriormente se modifican parámetros o fuentes.
- Las recomendaciones deben ser globales por empresa y expresarse en unidades enteras.
- Debe existir comparación contra Excel antes de habilitar el uso real.
- Después del piloto se medirán nivel de servicio, roturas, inventario inmovilizado, precisión de demanda y aceptación/ajuste de sugerencias.

## 10. Decisiones confirmadas para la primera versión

1. La planificación se realiza a nivel empresa y genera una compra global por pieza.
2. La familia proviene del maestro de productos.
3. La criticidad se asigna manualmente; los códigos nuevos deben clasificarse desde la app.
4. Todas las piezas parten con Alemania como origen y permiten edición manual.
5. El ABC económico se calcula con el total vendido histórico, sin depender de precios de proveedor.
6. El tránsito queda previsto pero en cero hasta implementar su importador específico.
7. Devoluciones, garantías, consumos internos y ventas extraordinarias no reciben tratamiento especial inicialmente.
8. La sugerencia se redondea siempre a unidad entera.
9. No existe aprobación ni límite presupuestario: el resultado es informativo y exportable.

Con estas decisiones existe alcance suficiente para comenzar la Fase 0 y preparar los casos dorados de validación.

## 11. Estado de la primera entrega funcional

Implementado en la migración `20260812230000_add_parts_purchase_suggestions_v1.sql`:

- modelos iniciales separados para CLAAS y HORSCH, con parámetros y políticas versionadas;
- tabla completa de equivalencias entre el mix ABC-FSN-XYZ-VED y los seis segmentos;
- criticidad manual por pieza y origen Alemania editable;
- corrida global de empresa que consolida stock, reconstruye 24 meses de ventas y evita contar dos veces una línea vinculada por más de un código;
- demanda ponderada 60/40, horizonte por marca/segmento, seguridad, objetivo, necesidad neta y redondeo entero;
- snapshots inmutables de parámetros, fuentes y resultados explicables;
- RLS y validación de rol: consulta para usuarios de Repuestos; configuración y ejecución para Admin/Jefatura;
- pantalla para ejecutar y consultar corridas, editar parámetros, completar criticidad/origen, revisar la explicación por pieza y exportar Excel.

La primera entrega es un **piloto analítico**, no una recomendación validada para compra automática. Antes de usarla para decisiones reales siguen pendientes la prueba de paridad contra los tres libros, el backtest CLAAS enero-junio y la verificación de casos dorados. Tampoco incluye todavía estacionalidad avanzada, stock histórico, tránsito, precios de proveedor, costos logísticos, MOQ, devoluciones ni garantías.

### Ajuste posterior a la primera corrida

La criticidad deja de ser un requisito bloqueante. Cuando una pieza no tiene V/E/D importada o manual, el motor propone una clasificación usando la criticidad predominante de su familia y una heurística conservadora cuando no existe evidencia suficiente. La propuesta automática incluye fuente, confianza y estado de revisión; participa inmediatamente del cálculo y puede reemplazarse manualmente. También se completan todas las combinaciones ABC-FSN-XYZ-VED para que una regla ausente no anule la sugerencia.
