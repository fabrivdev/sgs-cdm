# Campi: bienvenida inicial de SIG CDM

## Alcance

Campi se presenta únicamente a usuarios autenticados de Gerencia o Administración, en escritorio con «Soy Campi» y «Muy pronto». Explica que podrá ayudar a encontrar información importante, entender cambios y abrir el detalle, siempre con datos verificados y según los permisos del usuario. El saludo y las expresiones ocurren por sí solos, sin botones de respuesta prefijada. No consulta datos, no responde preguntas de negocio y no activa el asistente analítico ni el futuro Panorama. No hay migraciones ni cambios de permisos. La publicación pública en Lovable queda a cargo del usuario.

La integración está en `AppLayout` y se omite en su modo de vista previa. Solo se monta con sesión real, rol Gerencia o Administración, ancho desde 1024 px y puntero fino. Campi aparece automáticamente la primera vez que ese usuario entra desde ese navegador de escritorio. Se marca como visto al comenzar la presentación; cerrar con la X lo deja fuera de pantalla sin asomos posteriores. El botón «Conocer a Campi» del menú de cuenta permite recuperarlo voluntariamente. El estado se guarda por usuario y navegador mediante `localStorage`; no se sincroniza entre dispositivos. Los valores `hidden` guardados por versiones anteriores siguen siendo reconocidos.

## Gestos e interacción

- Entrada: anticipación, salto, aterrizaje, reverencia y saludo con poses prediseñadas.
- Reposo: respiración ligera, parpadeo y curiosidad al acercar puntero o foco.
- Saludo espontáneo: sonrisa y gesto de bienvenida. Sorpresa, guiño, enojo y tristeza quedan como repertorio para escenas posteriores, nunca como reacción al cierre.
- Cierre: la X reproduce la carrera lateral con alternancia de brazos y piernas. La secuencia conserva la pose de carrera hasta desaparecer, sin mostrar una pose quieta recortada ni un destello al volver al margen. No hay asomos automáticos ni un segundo control de ocultación.
- Menús, modales, drawers y pestaña oculta suspenden temporizadores y visibilidad. El overlay solo recibe clics en el mensaje y en el personaje mientras está presente. Cerrar devuelve el foco al menú de cuenta; el personaje cerrado no queda en la secuencia de tabulación.

El aspecto 3D se logra con poses transparentes y CSS, sin modelo 3D. `CampiDesktopSlot` carga el componente solo en escritorio. Los PNG originales del paquete se conservan como fuente visual; la app solicita WebP comprimidos según el gesto para reducir transferencia. Las escenas con planta y maquinaria CLAAS/HORSCH siguen pendientes.

## Estado de verificación

Fuente: `src/components/campi/CampiWelcome.tsx`, `CampiSprite.tsx`, `CampiActionSprite.tsx`, `campiState.ts`, `campi.css`, `src/components/AppLayout.tsx` y sus pruebas. El paquete recibido es la revisión V3. El asomo mostrado en el video V5 se retiró por decisión posterior del usuario. No se encontró el objeto local `b99ccea` en el repositorio accesible, por lo que la implementación se preparó en rama aislada desde `95e2779`, sin sobrescribir otros trabajos.

La integración inicial se revisó en el navegador local autenticado, con sesión del perfil correcto. Se comprobaron cierre, foco, recuperación y prioridad de modal. Los ajustes posteriores se revisaron en la vista aislada local y se grabaron en video; queda pendiente volver a filmarlos dentro de una sesión autenticada. La versión sin asomo se comprobó en esa vista: apareció con una clave de usuario nueva, no reapareció al cerrar y recargar, y volvió solo desde el menú. Las 38 pruebas específicas verifican también que un diálogo abierto no marque la bienvenida como vista. TypeScript, lint de los archivos tocados y build pasaron. La suite completa y el lint global informaron fallos fuera de Campi durante la integración inicial; se documentaron por separado de las comprobaciones específicas. Estas comprobaciones locales no acreditan la publicación pública.

## Panorama: prototipo en rama — 16/10/2026

El primer prototipo de Panorama se retiró de `main` mediante `6c41834`: el árbol de esa rama vuelve exactamente a la revisión anterior a Panorama. En `main` permanece únicamente la bienvenida de Campi con «Muy pronto». El desarrollo de Panorama continúa en `feat/campi-panorama`; no está publicado ni terminado.

En esa rama, `/panorama` presenta un selector de prioridades para Gerencia y Administración. Recorre las 19 secciones de negocio conocidas y ofrece únicamente las que tienen módulo y sección autorizados; Comisiones también exige Administración. Se pueden elegir y ordenar hasta tres prioridades. La preferencia v3 se guarda por usuario y navegador, sin sincronización entre dispositivos ni ampliación de permisos. Las preferencias v2 de cinco áreas no se aplican automáticamente porque sus categorías no representan los temas actuales. La pantalla mantiene el selector visible después de guardar y usa poses de saludo, respiración, parpadeo y gestos periódicos para Campi, con pausa al ocultarse la pestaña o reducirse el movimiento.

Las imágenes de referencia del 16/10 orientan las etapas posteriores, pero sus cifras son ficticias. Esta rama todavía no muestra métricas, síntesis, alertas ni respuestas de negocio. Cada cifra futura necesitará fuente, período, fecha de corte, alcance autorizado y destino de detalle. La configuración y el asistente analítico requieren más desarrollo y revisión visual antes de volver a considerar una integración en `main`.

Fuente: `src/pages/CampiPanorama.tsx`, `src/lib/campi/panoramaPreferences.ts`, `src/components/campi/CampiPanoramaAvatar.tsx`, `src/App.tsx` y `src/components/AppLayout.tsx`. Ocho pruebas específicas, TypeScript, lint y build correctos en la rama; la pantalla se inspeccionó en Chrome local autenticado. No hay migración SQL para esta etapa ni validación de producción.
