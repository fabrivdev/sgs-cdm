# Campi: bienvenida inicial de SIG CDM

## Alcance

Campi se presenta únicamente a usuarios autenticados de Gerencia o Administración, en escritorio con «Soy Campi» y «Muy pronto». Explica que podrá ayudar a encontrar información importante, entender cambios y abrir el detalle, siempre con datos verificados y según los permisos del usuario. El saludo y las expresiones ocurren por sí solos, sin botones de respuesta prefijada. No consulta datos, no responde preguntas de negocio y no activa el asistente analítico ni el futuro Panorama. No hay migraciones ni cambios de permisos. La publicación pública en Lovable queda a cargo del usuario.

La integración está en `AppLayout` y se omite en su modo de vista previa. Solo se monta con sesión real, rol Gerencia o Administración, ancho desde 1024 px y puntero fino. Campi aparece automáticamente la primera vez que ese usuario entra desde ese navegador de escritorio. Se marca como visto al comenzar la presentación; cerrar con la X lo deja fuera de pantalla sin asomos posteriores. El botón «Conocer a Campi» del menú de cuenta permite recuperarlo voluntariamente. El estado se guarda por usuario y navegador mediante `localStorage`; no se sincroniza entre dispositivos. Los valores `hidden` guardados por versiones anteriores siguen siendo reconocidos.

## Gestos e interacción

- Entrada: anticipación, salto, aterrizaje, reverencia y saludo con poses prediseñadas.
- Reposo: respiración ligera, parpadeo, curiosidad al acercar el puntero y gestos amables espontáneos. Al hacer clic o activar el personaje con teclado, Campi responde con saludo, pasos o una celebración breve, incluso durante la entrada. No inicia una consulta ni inventa datos.
- Saludo espontáneo: sonrisa y gesto de bienvenida. Sorpresa, guiño, enojo y tristeza quedan como repertorio para escenas posteriores, nunca como reacción al cierre.
- Cierre: la X reproduce la carrera lateral con alternancia de brazos y piernas. La secuencia conserva la pose de carrera hasta desaparecer, sin mostrar una pose quieta recortada ni un destello al volver al margen. No hay asomos automáticos ni un segundo control de ocultación.
- Menús, modales, drawers y pestaña oculta suspenden temporizadores y visibilidad. El overlay solo recibe clics en el mensaje y en el personaje mientras está presente. Cerrar devuelve el foco al menú de cuenta; el personaje cerrado no queda en la secuencia de tabulación.

El aspecto 3D se logra con poses transparentes y CSS, sin modelo 3D. `CampiDesktopSlot` carga el componente solo en escritorio. Los PNG originales del paquete se conservan como fuente visual; la app solicita WebP comprimidos según el gesto para reducir transferencia. Las escenas con planta y maquinaria CLAAS/HORSCH siguen pendientes.

## Estado de verificación

Fuente: `src/components/campi/CampiWelcome.tsx`, `CampiSprite.tsx`, `CampiActionSprite.tsx`, `campiState.ts`, `campi.css`, `src/components/AppLayout.tsx` y sus pruebas. El paquete recibido es la revisión V3. El asomo mostrado en el video V5 se retiró por decisión posterior del usuario. No se encontró el objeto local `b99ccea` en el repositorio accesible, por lo que la implementación se preparó en rama aislada desde `95e2779`, sin sobrescribir otros trabajos.

La integración inicial se revisó en el navegador local autenticado, con sesión del perfil correcto. Se comprobaron cierre, foco, recuperación y prioridad de modal. Los ajustes posteriores se revisaron en la vista aislada local y se grabaron en video; queda pendiente volver a filmarlos dentro de una sesión autenticada. La versión sin asomo se comprobó en esa vista: apareció con una clave de usuario nueva, no reapareció al cerrar y recargar, y volvió solo desde el menú. Las 38 pruebas específicas verifican también que un diálogo abierto no marque la bienvenida como vista. TypeScript, lint de los archivos tocados y build pasaron. La suite completa y el lint global informaron fallos fuera de Campi durante la integración inicial; se documentaron por separado de las comprobaciones específicas. Estas comprobaciones locales no acreditan la publicación pública.
