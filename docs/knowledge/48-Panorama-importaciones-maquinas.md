# Panorama: avance anual de importaciones de máquinas

## Diseño y alcance vigentes

Referencia aprobada: https://www.figma.com/design/IkBozPmGN7IgABQz3ss2by?node-id=46-304. Se reutiliza ApprovedPanoramaCard, la misma familia de las otras doce tarjetas. KPI: porcentaje completado; contexto: completadas / total y año; debajo: total por marca; a la derecha: cuatro barras horizontales por estado. Mes/Acum. permanece visible y deshabilitado, porque el indicador tiene una única cohorte anual. No existe una pestaña Auto.

La propuesta anterior por meses/histórico queda reemplazada. El registro isApprovedCard incluye maquinas_importacion; PanoramaDashboard y cualquier invocación directa de PanoramaStoryCard seleccionan el render aprobado. La clave de caché annual-eta-v2 impide reutilizar el payload mensual previo. No se modifican prioridades guardadas ni otros temas.

## Cohorte y cálculo

Año dinámico de la fecha de análisis de Panorama. Se incluyen unidades no canceladas cuyo embarque estimado efectivo (eta) pertenece a ese año: el mismo campo para Planificado, En tránsito, Arribado y Completado. No sustituir ETA por ATA cuando cambia el estado. Sin ETA válida y otros años quedan fuera del denominador; se documentan en el contrato. No se inventa fecha ni año.

Porcentaje = completadas / total de la cohorte × 100. Denominador cero: porcentaje desconocido, no 0%. Marca usa la normalización existente y preserva Sin marca si falta. Los totales por marca y estados concilian con el mismo universo. Un registro por unidad; nunca sumar cantidad_lote ni agregar poblaciones de Stock y Parque. Lectura completa paginada con orden/contador e identidades verificadas, permiso existente parque.importaciones, fuente maquinaria_importacion_unidades_operativas.

Estado efectivo de machineImportStatus.ts: cancelada tiene prioridad; Completado requiere confirmación física no ambigua en Stock o Parque (puede faltar ATA histórica); Arribado tiene ATA sin confirmación suficiente para completar; tránsito procede del estado fuente; el resto permanece Planificado. Estado comercial y reserva no sustituyen llegada. Reprogramar ETA puede cambiar la cohorte; el indicador no reconstruye el plan original ni una tasa histórica de cierre.

Campi comparte la cohorte, porcentaje y totales del mismo objeto de tarjeta. Su texto describe el avance anual, sin meses, llegadas previstas inferidas ni comparaciones históricas. La fecha de lectura no es garantía de actualización del origen. El enlace abre Importaciones operativas; no inventa parámetros de filtro que el destino no consume.

## Verificación y publicación

Pruebas enfocadas: año dinámico y frontera anual; rango completo; ETA/ATA y completado sin ATA; fechas inválidas/ausentes; canceladas; marcas; identidad; paginación; denominador cero; transición de estado; selector visible deshabilitado; registro real Dashboard y llamada legacy; coherencia de Campi. Tipos, lint y build se ejecutan sobre la copia integrada servida en http://localhost:8080/panorama.

La comprobación visual de la versión anual en la sesión real quedó bloqueada por Computer Use al no poder determinar la URL actual de Chrome con confianza suficiente. Se detuvo la automatización de esa sesión, sin eludir el control. No presentar las capturas reales de la versión mensual anterior como QA del diseño anual final. La revisión visual real final queda pendiente. El usuario confirmó expresamente subir este cambio a main con ese límite informado; no se presenta como QA visual aprobada. Publicación Lovable exclusivamente a cargo del usuario. No requiere SQL, RLS ni cambios de permisos. No hay obsidian-sync.local en el checkout.

## Corrección visual local pendiente de revisión

Se eliminan las excepciones de tamaño y color del tema. Se usa el tono canónico de Abastecimiento de panoramaTopicTone: acento #c2410c y fondo #fff7ed. El verde #00855f y las barras gris/naranja/verde estaban en la propuesta Figma; la instrucción posterior exige coherencia con la familia temática existente. No se presenta esa mezcla como un error de transcripción.

KPI: 30px fijo pasa al clamp compartido de 20px a 30px (3.4cqw). Contexto: 13px/20px pasa a 13px/1.3; marcas mantienen peso 600. Números de barras: 12px pasa a 13px/18px y peso 600; etiquetas usan la regla compartida de 12px/16px. Se retiran excepciones de altura mínima 256px, padding 17px y separación 18px: se heredan 228px, 8px verticales y 10px; encabezado hereda 36px en lugar de 38px. Barras heredan acento mezclado con blanco al 62%, sin colores particulares por estado. Sólo se mantienen columnas necesarias para los nombres de estados. Datos, cohorte, filtros, textos y otras tarjetas no cambian.

Prueba de regresión: tono canónico, clases compartidas y ausencia de sobrescrituras de tipografía/color. La comparación visual en Chrome continúa bloqueada por el control de Computer Use previamente informado; no se elude ni se declara aprobada. El usuario confirmó subir la corrección a main con el límite de QA visual informado. La confirmación no autoriza SQL ni publicación Lovable.
