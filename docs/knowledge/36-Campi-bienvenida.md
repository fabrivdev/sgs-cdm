# Campi: bienvenida inicial de SIG CDM

## Alcance

Campi se presenta a usuarios autenticados de escritorio con «Soy Campi» y «Muy pronto». Explica que podrá ayudar a encontrar información importante, entender cambios y abrir el detalle, siempre con datos verificados y según los permisos del usuario. El saludo y las expresiones ocurren por sí solos, sin botones de respuesta prefijada. No consulta datos, no responde preguntas de negocio y no activa el asistente analítico ni el futuro Panorama. No hay migraciones ni cambios de permisos. La publicación pública en Lovable queda a cargo del usuario.

La integración está en `AppLayout` y se omite en su modo de vista previa. Solo se monta con sesión real, ancho desde 1024 px y puntero fino. El botón «Conocer a Campi» del menú de cuenta permite recuperarlo. La primera presentación y la preferencia «Ocultar a Campi» se guardan por usuario y navegador mediante `localStorage`; no se sincronizan entre dispositivos.

## Gestos e interacción

- Entrada: anticipación, salto, aterrizaje, reverencia y saludo con poses prediseñadas.
- Reposo: respiración ligera, parpadeo y curiosidad al acercar puntero o foco.
- Saludo espontáneo: sonrisa y gesto de bienvenida. Sorpresa, guiño, enojo y tristeza quedan como repertorio para escenas posteriores, nunca como reacción al cierre.
- Cierre y «Ocultar a Campi»: ambos reproducen la misma carrera lateral con alternancia de brazos y piernas. La secuencia conserva la pose de carrera hasta desaparecer y oculta inmediatamente la figura al quedar fuera, sin mostrar una pose quieta recortada ni un destello al volver al margen. Cerrar deja un único asomo breve por visita con solo cabeza y una mano; ocultar guarda la preferencia y no programa asomos hasta que el usuario lo recupere desde el menú. No hay asomos espontáneos con movimiento reducido.
- Menús, modales, drawers y pestaña oculta suspenden temporizadores y visibilidad. El overlay solo recibe clics en Campi y su mensaje. Cerrar devuelve el foco al menú de cuenta; el personaje oculto no queda en la secuencia de tabulación.

El aspecto 3D se logra con poses transparentes y CSS, sin modelo 3D. `CampiDesktopSlot` carga el componente solo en escritorio. Los PNG originales del paquete se conservan como fuente visual; la app solicita WebP comprimidos según el gesto para reducir transferencia. Las escenas con planta y maquinaria CLAAS/HORSCH siguen pendientes.

## Estado de verificación

Fuente: `src/components/campi/CampiWelcome.tsx`, `CampiPeek.tsx`, `CampiSprite.tsx`, `CampiActionSprite.tsx`, `campiState.ts`, `campi.css`, `src/components/AppLayout.tsx` y sus pruebas. El paquete recibido es la revisión V3; el video V5 es una referencia posterior de un solo brazo. No se encontró el objeto local `b99ccea` en el repositorio accesible, por lo que la implementación se preparó en rama aislada desde `95e2779`, sin sobrescribir otros trabajos.

La integración inicial se revisó en el navegador local autenticado, con sesión del perfil correcto. Se comprobaron cierre, foco, ocultación persistente, recuperación, prioridad de modal y reaparición temporizada. El ajuste posterior del mensaje sin botones de respuesta y la carrera al elegir «Ocultar a Campi» se revisaron en la vista aislada local y se grabaron en video; se verificó también que la preferencia persiste tras recargar y que el menú lo recupera. Queda pendiente volver a filmar estos ajustes dentro de una sesión autenticada. El asomo se comparó con fotogramas del video V5; la cabeza aparece inclinada y solo una mano cerrada se ve junto al margen. También se revisó la transparencia sobre fondo oscuro. Las 37 pruebas específicas, TypeScript, lint de los archivos tocados y build pasaron. La suite completa informó 24 fallos en otros módulos (incluidos timeouts), y el lint global informó 204 errores fuera de Campi. Estas comprobaciones locales no acreditan la publicación pública.
