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

## Panorama: primera configuración — 16/10/2026

La ruta `/panorama` abre una primera configuración para Gerencia y Administración. Permite elegir y ordenar hasta tres temas de interés entre los que tienen secciones autorizadas. Tras guardar, muestra esos temas y accesos directos únicamente a las secciones asignadas. Si se revoca una sección, su enlace desaparece; si un tema pierde todos los enlaces, tampoco se muestra. La preferencia se guarda por usuario y navegador, sin sincronización entre dispositivos; no concede permisos. Una preferencia local anterior de cinco áreas se conserva solo en sus tres primeras áreas aún permitidas.

Las imágenes de referencia recibidas el 16/10 muestran la dirección para el futuro Panorama: Campi sintetiza mejoras, riesgos y datos insuficientes; cada cifra debe tener fuente, período, corte y un detalle accionable. Esas imágenes indican expresamente que sus cifras son ficticias. Esta primera etapa no presenta números, síntesis, alertas ni respuestas de negocio hasta verificar sus contratos de fuente, comparación y alcance. Tampoco cambia el cálculo de ningún módulo. La bienvenida original permanece separada y conserva «Muy pronto» para la capacidad analítica pendiente.

Fuente: `src/pages/CampiPanorama.tsx`, `src/lib/campi/panoramaPreferences.ts`, `src/App.tsx` y `src/components/AppLayout.tsx`. Pruebas locales de filtro por permiso, revocación, límite de tres, orden y persistencia: 7 correctas; TypeScript y lint específicos correctos. Vista autenticada revisada en Chrome local con perfil Administrador: selección, guardado, enlaces y ausencia de errores de consola. Esta revisión no acredita el despliegue público. No hay migración SQL en esta etapa.
