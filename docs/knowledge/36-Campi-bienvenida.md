# Campi: bienvenida inicial de SIG CDM

## Alcance

Campi se presenta únicamente a usuarios autenticados de Gerencia o Administración, en escritorio con «Soy Campi» y «Muy pronto». Explica que podrá ayudar a encontrar información importante, entender cambios y abrir el detalle, siempre con datos verificados y según los permisos del usuario. El saludo y las expresiones ocurren por sí solos, sin botones de respuesta prefijada. No consulta datos, no responde preguntas de negocio y no activa el asistente analítico ni el futuro Panorama. No hay migraciones ni cambios de permisos. La publicación pública en Lovable queda a cargo del usuario.

La integración está en `AppLayout` y se omite en su modo de vista previa. Solo se monta con sesión real, rol Gerencia o Administración, ancho desde 1024 px y puntero fino. Campi aparece automáticamente la primera vez que ese usuario entra desde ese navegador de escritorio. Se marca como visto al comenzar la presentación; cerrar con la X lo deja fuera de pantalla sin asomos posteriores. El botón «Conocer a Campi» del menú de cuenta permite recuperarlo voluntariamente. El estado se guarda por usuario y navegador mediante `localStorage`; no se sincroniza entre dispositivos. Los valores `hidden` guardados por versiones anteriores siguen siendo reconocidos.

## Gestos e interacción

- Entrada: anticipación, salto, aterrizaje, reverencia y saludo con poses prediseñadas.
- Reposo: respiración ligera, parpadeo, curiosidad al acercar el puntero y gestos espontáneos alternados después de la entrada. Tocar al personaje o activarlo con teclado dispara un gesto amable; no consulta datos ni agrega respuestas de negocio.
- Saludo espontáneo: sonrisa y gesto de bienvenida. Sorpresa, guiño, enojo y tristeza quedan como repertorio para escenas posteriores, nunca como reacción al cierre.
- Cierre: la X reproduce la carrera lateral con alternancia de brazos y piernas. La secuencia conserva la pose de carrera hasta desaparecer, sin mostrar una pose quieta recortada ni un destello al volver al margen. No hay asomos automáticos ni un segundo control de ocultación.
- Menús, modales, drawers y pestaña oculta suspenden temporizadores y visibilidad. El overlay solo recibe clics en el mensaje y en el personaje mientras está presente. Cerrar devuelve el foco al menú de cuenta; el personaje cerrado no queda en la secuencia de tabulación.

El aspecto 3D se logra con poses transparentes y CSS, sin modelo 3D. `CampiDesktopSlot` carga el componente solo en escritorio. Los PNG originales del paquete se conservan como fuente visual; la app solicita WebP comprimidos según el gesto para reducir transferencia. Las escenas con planta y maquinaria CLAAS/HORSCH siguen pendientes.

## Estado de verificación

Fuente: `src/components/campi/CampiWelcome.tsx`, `CampiSprite.tsx`, `CampiActionSprite.tsx`, `campiState.ts`, `campi.css`, `src/components/AppLayout.tsx` y sus pruebas. El paquete recibido es la revisión V3. El asomo mostrado en el video V5 se retiró por decisión posterior del usuario. No se encontró el objeto local `b99ccea` en el repositorio accesible, por lo que la implementación se preparó en rama aislada desde `95e2779`, sin sobrescribir otros trabajos.

La integración inicial se revisó en el navegador local autenticado, con sesión del perfil correcto. Se comprobaron cierre, foco, recuperación y prioridad de modal. Los ajustes posteriores se revisaron en la vista aislada local y se grabaron en video; queda pendiente volver a filmarlos dentro de una sesión autenticada. La versión sin asomo se comprobó en esa vista: apareció con una clave de usuario nueva, no reapareció al cerrar y recargar, y volvió solo desde el menú. Las 38 pruebas específicas verifican también que un diálogo abierto no marque la bienvenida como vista. TypeScript, lint de los archivos tocados y build pasaron. La suite completa y el lint global informaron fallos fuera de Campi durante la integración inicial; se documentaron por separado de las comprobaciones específicas. Estas comprobaciones locales no acreditan la publicación pública.

## Panorama: prototipo en rama — 16/10/2026

El primer prototipo de Panorama se retiró de `main` mediante `6c41834`: el árbol de esa rama vuelve exactamente a la revisión anterior a Panorama. En `main` permanece únicamente la bienvenida de Campi con «Muy pronto». El desarrollo de Panorama continúa en `feat/campi-panorama`; no está publicado ni terminado.

En la rama de Panorama, `AppLayout` ya no monta `CampiDesktopSlot` ni ofrece «Conocer a Campi» en el menú de cuenta. La bienvenida «Muy pronto» queda exclusivamente en `main` mientras Panorama está en desarrollo. El componente de bienvenida y su vista de prueba permanecen en el código como referencia, pero no aparecen en el flujo autenticado de esa rama. Campi dentro de Panorama conserva sus propias animaciones.

En esa rama, `/panorama` presenta un selector de prioridades para Gerencia y Administración. Ofrece trece temas específicos de negocio, no una copia literal de las secciones del menú. Cada tema se vincula a una o más secciones existentes y solo aparece si el usuario tiene módulo y sección autorizados; Comisiones exige además Administración. Los temas elegidos dejan el catálogo y pasan a una lista que puede ordenarse por arrastre o con botones; no existe un límite de tres ni un buscador. La preferencia v4 se guarda por usuario y navegador, sin sincronización entre dispositivos ni ampliación de permisos. Las preferencias v3 basadas en secciones no se aplican automáticamente porque no equivalen a los temas actuales. Campi se muestra de medio cuerpo, con cabeza y mano capaces de sobresalir del recuadro. Reacciona con gestos distintos al elegir, quitar, ordenar y guardar; tocarlo directamente alterna saludo, pasos y celebración. Su reposo conserva respiración, parpadeo y gestos periódicos, con pausa al ocultarse la pestaña o reducirse el movimiento.

Las imágenes de referencia del 16/10 orientan las etapas posteriores, pero sus cifras son ficticias. El primer selector no mostraba métricas, síntesis, alertas ni respuestas de negocio. Cada cifra incorporada al panel requiere fuente, período, fecha de corte, alcance autorizado y destino de detalle. La configuración y el asistente analítico requieren más desarrollo y revisión visual antes de volver a considerar una integración en `main`.

### Primer panel variable en la rama

Después de guardar prioridades, se abre un panel con Campi, un mensaje basado en las fuentes disponibles y el orden elegido. «Lectura rápida» prioriza hasta tres indicadores autorizados; un tema todavía sin indicador conserva un enlace a su sección, nunca un panel vacío. «Editar prioridades» vuelve al selector. Cada fuente se consulta solo si el usuario conserva permiso de módulo y sección. «Evolución de ventas y facturación» muestra por separado facturación de Repuestos y Servicios en USD y compara el mes en curso hasta la fecha de corte con el tramo equivalente del mes anterior. La comparación de Repuestos viene de la RPC de Ventas; Servicios consulta ambos tramos con la misma RPC y filtros. La variación numérica no se interpreta como mejora. «Demanda de repuestos» ya no presenta unidades netas sin contexto: abre Ventas de Repuestos hasta definir una lectura de demanda útil. «Stock y antigüedad de repuestos» muestra valor USD del análisis valorizado cuando existe permiso `repuestos.analisis`. «Cobertura futura de máquinas» desglosa stock actual, compras pendientes, ventas pendientes y stock proyectado, y limita explícitamente el alcance a máquinas nuevas desde el 31/08/2026. El hallazgo rojo muestra cantidad de códigos, valor USD y criterio exacto: sin ventas en los tres años evaluados y con última compra hace más de 1.000 días. Abre Análisis de Repuestos con el filtro rojo aplicado. Su proporción se calcula sobre el valor Kardex referencial del mismo corte sin repetir las cifras del encabezado. Campi adopta un recuadro ámbar y expresión curiosa cuando aparece ese hallazgo. Estas son lecturas de fuentes existentes, sin sumar áreas a las que el usuario no accede. Los otros temas todavía abren su sección autorizada, pero no presentan una cifra consolidada sin definición validada.

La migración `20261016190000_campi_panorama_visits.sql` crea un historial propio por usuario, protegido por RLS para Gerencia y Administración. Se registra una visita solo si el panel obtuvo métricas sin errores y se conserva una sesión de navegador para que recargar no cambie la base de comparación. Se comparan únicamente indicador, unidad, sección, alcance, período y versión de definición iguales; falta de dato, período nuevo o fuente fallida no equivalen a cero. Los datos de visita guardan agregados mostrados, no filas comerciales ni clientes. Estos agregados son enviados por el cliente después de consultar RPC protegidas; antes de usar cambios para alertas o afirmaciones de mejora, los cálculos y el registro deberán trasladarse a una fuente calculada por el servidor. La migración está preparada en la rama y **no está ejecutada** en la base; el panel no presenta todavía variaciones ni estados de ánimo derivados de esos registros. No se ha comprobado esta etapa en producción ni se ha integrado en `main`.

Cobertura actual del catálogo de trece temas:

| Tema | Fuente/alcance del primer indicador | Estado |
| --- | --- | --- |
| Evolución de ventas y facturación | RPC de Ventas de Repuestos y Servicios, cada área por separado, USD | Operativo; falta Máquinas |
| Demanda de repuestos | Ventas de Repuestos; falta una síntesis de demanda con contexto | Destino autorizado, sin KPI propio |
| Stock y antigüedad de repuestos | Valor Kardex referencial del Análisis valorizado | Valor operativo; falta indicador propio de antigüedad |
| Cobertura futura de máquinas | Stock actual, compras pendientes, ventas pendientes y proyectado de máquinas nuevas desde 31/08/2026 | Operativo |
| Pedidos de máquinas por cumplir | Operaciones y unidades comerciales | Definir pendientes y corte sin mezclar NP/facturas |
| Órdenes de servicio pendientes | OS importadas y estado operativo | Definir vencimiento y fuente completa |
| Disponibilidad de máquinas | Stock físico y asignaciones | Conciliar unidades repetidas y reservas |
| Trabajo realizado en servicios | Trabajos y jornadas | Definir período, cierre y conteo |
| Agenda y capacidad de servicio | Planificador, Calendario y Flota | Definir capacidad y vencimientos |
| Importaciones y arribos de máquinas | Unidades de importación y despacho | Definir estado y ETA sin doble conteo |
| Parque instalado y clientes | Parque y Clientes | Definir máquinas activas y propietario |
| Reposición y compras de repuestos | Compras y Sugerencias | Definir pedido pendiente frente a sugerencia |
| Comisiones del servicio | Jornadas y liquidaciones | Reservado a Administración; definir monto devengado/pagado |

Los diez temas sin KPI propio siguen siendo destinos autorizados sin cifra inventada. Antes de convertirlos en indicadores hay que fijar grano, unidad, corte, exclusiones, estado sin datos, permiso de lectura y destino de detalle; no interpretar una fila de tabla como KPI de negocio.

Fuente: `src/pages/CampiPanorama.tsx`, `src/lib/campi/panoramaPreferences.ts`, `src/components/campi/CampiPanoramaAvatar.tsx`, `src/components/campi/CampiWelcome.tsx`, `src/App.tsx` y `src/components/AppLayout.tsx`. Las 24 pruebas específicas de estos cambios, TypeScript, lint y build pasaron en la rama; se comprobaron clic y teclado en Chrome local autenticado. No hay migración SQL para esta etapa ni validación de producción.
