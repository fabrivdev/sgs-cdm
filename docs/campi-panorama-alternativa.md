# Panorama alternativo: temas con contexto

## Comparación de versiones

- Base preservada: `feat/campi-panorama`, commit `3337f6db44d1851559e47a8f9cbc54595d0de6de`.
- Alternativa: `feat/campi-panorama-alternativa`. La ruta sigue siendo `/panorama`; se compara cambiando de rama, sin tocar `main`.
- No publicación Lovable ni ejecución de SQL. La publicación pública corresponde al usuario.
- Preferencias y referencia de visita usan claves de navegador independientes de la versión original.

## Experiencia

Los cuatro temas elegidos se presentan juntos en una cuadrícula 2×2 de escritorio, con franja breve de Campi. Cada tarjeta muestra título, alcance/período, cifra principal, porcentaje cuando existe una base verificable y gráfico pequeño. El análisis, comparaciones completas, método y desglose quedan en el detalle modal. Si se eligen más de cuatro, se conservan todos en orden y se advierte que habrá filas adicionales; no se recorta la selección silenciosamente. Facturación es UN consolidado de Repuestos, Servicios y Máquinas según permisos, con desglose dentro del detalle. Campi presenta el primer tema listo en el orden elegido; no prioriza siempre el stock rojo.

La bienvenida/editor permite regresar sin guardar. El avatar del panel reserva espacio para cuerpo y sombra. Los gráficos tienen alternativa textual accesible; el detalle usa Dialog compartido y mantiene los accesos específicos al módulo como profundización opcional.

## Contratos implementados

| Tema | Fuente existente | Grano / cálculo | Permiso |
| --- | --- | --- | --- |
| Facturación | `ventas_repuestos_panorama_filtros_v1`, `ventas_servicios_panorama_v2`, `ventas_maquinas_dashboard_filtros_v2` | Suma neta de áreas autorizadas, MTD y YTD contra igual tramo LY; mes previo completo como contexto; serie mensual | `repuestos.ventas`, `servicios.ventas`, `parque.ventas`, solo las concedidas |
| Clientes de repuestos | Resumen y períodos de RPC Repuestos | DISTINCT servidor; incluye NC e identidad no informada. No equivale a compradores positivos ni clientes nuevos/perdidos. YTD nunca suma clientes mensuales | `repuestos.ventas` |
| Stock por sucursal | `repuestos_analisis_valorizado`, agregados completos | REP activos con saldo global positivo; valor Kardex referencial y unidades por sucursal, no todo el catálogo | `repuestos.analisis` |
| Situación del stock | Mismo agregado valorizado | Colores, códigos y valor; no se infiere rotación ni ausencia de movimiento por falta de vínculo | `repuestos.analisis` |
| Pedidos de máquinas pendientes | `maquinaria_pedidos_lineas_estado_actual`, unidades, `maquinaria_unidades_facturadas_confirmadas` | Unidades sin facturación según contrato Operaciones, excluye canceladas, contempla historia y conciliación por chasis; distinto de entrega pendiente | `parque.operaciones` |
| Stock físico máquinas | `parque_stock_maquinas` | Suma `saldo_actual`, nuevas/usadas/otra condición y sucursales; no equivale a libre disponibilidad comercial | `parque.stock` |
| Proyección máquinas nuevas | `parque_stock_proyectado_v1` | Stock calculado + compras pendientes − ventas pendientes, apertura informada; valida ecuación y fecha del cálculo | `parque.stock_proyectado` |
| OS abiertas | `ordenes_servicio_importadas` | Conteos exactos de estado que contiene Abierta; edad desde apertura. No se deduce estado por factura | `servicios.ordenes` |

## Límites deliberados

- No inventar fecha de actualización. Las fuentes de ventas y fotos no exponen cobertura acreditada: `cutoff=null`; rango solicitado no significa datos completos hasta hoy. Fecha de clasificación del semáforo y fecha de carga del Kardex tampoco prueban corte.
- Moneda de ventas reutiliza el contrato USD de las vistas actuales; no aplica conversión ni verifica individualmente importaciones históricas.
- Facturación consolidada falla completa si falla un área autorizada; nunca presenta un subtotal como total. Clientes funciona independientemente.
- Monto monetario pendiente de máquinas aún NO consolidado: la vista mezcla valor facturado/documental/acordado y fallback de moneda. Se presentan unidades conciliadas. Para monto hacen falta líneas acordadas, cobertura histórica y definición multimoneda explícitas.
- Distribución de repuestos usa el universo del análisis, no un agregado irrestricto de todos los tipos de producto. Exige permiso Análisis aunque el título sea distribución de stock.
- Stock físico pagina todo hasta 5.000 filas; pedidos hasta 2.000 y conciliación en lotes de 200. Si excede, cambia el conteo o falta una página, hay error explícito; nunca suma parcialmente.
- Lecturas de OS son conteos independientes, no snapshot transaccional. No etiqueta pausas como incumplidas ni inventa fechas prometidas.
- Primera versión habilita ocho temas con fuente, en lugar de trece accesos de los cuales diez no tenían síntesis. Agenda/capacidad, importaciones, comisiones y reposición requieren contratos propios antes de agregarse.

## Última visita

Referencia opcional local por usuario y navegador, independiente de la migración de visitas de la otra rama. Compara solo valor/unidad, definición, período y alcance idénticos. Se guarda cuando todos los temas respondieron sin error, incluyendo cero válido. Cambios de permisos, mes o definición no se interpretan como crecimiento. Texto: cambio del total visible; no atribuye facturas nuevas ni causas. No es evidencia contable ni historial central sincronizado.

## Rendimiento y seguridad

Ventas comparte respuesta entre facturación/clientes, máximo dos llamadas simultáneas (habitualmente seis con tres sectores, nueve en enero). Repuestos comparte una consulta valorizada entre sus dos temas. Se conservan errores y reintento, nunca dato ausente convertido en cero. Permisos de frontend se comprueban antes de consultar y antes de renderizar; las políticas/RPC del servidor deben validarse en entorno autorizado antes de integración productiva.

## Validación

- 94 pruebas Campi aprobadas en la primera ejecución integrada; verificar registro final al entregar.
- Build Vite correcto.
- Typecheck ES2021 correcto. Typecheck con lib ES2020 del repositorio tiene un fallo preexistente en `src/test/totvsBillingSnapshotVersions.test.ts:96` por `replaceAll`, fuera de este cambio.
- Revisión independiente detectó y se corrigieron permiso del tema sucursales y guardado de referencia con ceros válidos.
- Sin consultas de producción, sin SQL remoto y sin validación de importes actuales.
- Validación visual real pendiente: Chromium no pudo iniciar por restricciones del entorno. No se acredita screenshot ni pruebas físicas de tamaño. La captura sintética intentada no se generó.

## Corrección de densidad — 16/10/2026

Se retira la presentación extensa por tema de la pantalla inicial. El objetivo de diseño es cuatro temas legibles juntos en escritorio 1440×900, con gráfico de 96 px, tarjetas 2×2 y Campi en franja de 72 px. En teléfono se apilan sin perder temas. Barras con más de cuatro categorías muestran cuatro y avisan cuántas quedan en el detalle; el modal conserva todas.

Variación porcentual = (actual − anterior) / anterior × 100 únicamente para comparaciones emparejadas por el loader y base anterior positiva. Base cero, negativa, ausente o no finita no genera porcentaje. OS antiguas/abiertas, nuevas/stock físico y valor rojo/total Kardex se pueden mostrar como composición explícitamente etiquetada, nunca como evolución. Sin base válida se informa la ausencia. No cambian RPC, cálculos fuente ni los permisos del consolidado de las tres áreas.

Pruebas incorporadas: `storySummary.test.ts`, `StoryPanel.test.tsx`, y actualización del contrato visual en `PanoramaDashboard.test.tsx`. Incluyen porcentajes, cero/ausencia, detalle/reapertura, errores/reintento, cuatro y ocho temas, y conservación del alcance autorizado. La validación visual real sigue pendiente por el bloqueo de Chromium del entorno; la estimación de alturas CSS no sustituye una captura o medición de navegador.

## Interpretación determinista y referencia visual

`campiInterpretation.ts` separa relevancia del hecho y orden de prioridades. Selecciona hasta dos hechos basados en comparación válida, antigüedad de OS (>30 días, sin llamarla vencimiento), semáforo rojo acreditado o modelos con saldo proyectado negativo. No se usa `attention` como evidencia por sí sola. Cuando falta contexto, muestra un total neutral. `CampiInterpreter.tsx` ofrece preguntas concretas y respuestas con alcance, período, corte y fuente; texto libre fuera del repertorio recibe un límite explícito. No llama modelos, claves externas ni nuevas consultas. El dashboard entrega únicamente historias seleccionadas y autorizadas, y las respuestas se recalculan desde esas historias.

El hero ahora sigue el boceto: Campi grande a la izquierda, síntesis al centro y preguntas a la derecha; las tarjetas 2×2 son horizontales y mantienen números, colores y gráficos. El detalle continúa en modal. No se agregan otros cambios sin fuente, porcentajes históricos inventados, ni navegación ficticia. Validación visual real pendiente por restricción del navegador del entorno; tests DOM no prueban encaje en 1440×900.

Verificación local de esta revisión: 115 pruebas específicas de Campi y página pasaron, incluido cierre por Escape con restauración de foco, pérdida de permisos y consulta fuera de contexto. Build y lint de archivos modificados pasaron. TypeScript con la configuración existente falla únicamente en `src/test/totvsBillingSnapshotVersions.test.ts:96` por `replaceAll` con lib ES2020; una ejecución diagnóstica con lib ES2021 pasa sin modificar la configuración del proyecto. No se ejecutó la suite global ni QA visual en navegador.
