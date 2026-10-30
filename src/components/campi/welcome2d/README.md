# Bienvenida v2: prototipo local de poses completas

Se usan exclusivamente campi-reposo-v2.png, campi-saludo-v2.png y campi-presentacion-v2.png, conservados sin edición de píxeles. La primera pose de reposo es el neutro canónico al entrar y al terminar cada gesto. No se mezclan el PNG original, las expresiones antiguas ni la lámina de 24 poses.

Los recortes siguen los límites alfa inspeccionados. El anclaje usa las botas y una escala uniforme: figura visible de unos 300 px, sin deformación, blur ni fundidos de siluetas. Las figuras fuente tienen aproximadamente 490 px útiles de alto; no se promete nitidez nativa a cualquier densidad de pantalla.

Secuencia: pausa breve, saludo, presentación y reposo con cambios de peso, mano en cintura y parpadeo. El CTA permanece disponible; interrumpe mediante un retorno por poses compatibles e invitación. Cancela al desmontar y pausa al ocultar la página. Movimiento reducido conserva el neutro y navegación inmediata.

El fondo reutiliza GradientWaves y las capas de Auth.tsx. Selector, badges y móvil quedan fuera de esta etapa. Carrera, frenada, giro y salida caminando siguen pendientes: no se simulan deslizando una pose. Las transiciones son discretas y necesitan aprobación visual; los tests no acreditan animación final.

Validación final: 31 pruebas focalizadas y lint aprobados. La comprobación visual local confirmó neutro con ambos ojos abiertos y presentación con brazos abiertos. QA interactivo posterior completó el CTA: mano al pecho, brazos abiertos, invitación lateral y llegada al selector; reentrada comprobada. Se observaron saludo y retorno al neutro canónico. Pantalla revisada en 1366×768 y 1920×1080; build aprobado en 33,29 s. Las poses discretas no se presentan como fluidez final.


## Entrada y selector escritorio (28 octubre, etapa posterior v2)

CampiWelcomeActor conserva poses v2 y añade revelado escénico de 700 ms al cargar las tres láminas; no representa carrera ni desliza pies. CampiOnboardingScene conserva bienvenida saliente y selector entrante durante un empuje horizontal de 600 ms. Al retomar directamente selector no repite empuje; reduced motion elimina animaciones. Los temporizadores se cancelan al volver/cerrar.

Campi desaparece completamente del selector, incluido el editor de prioridades. CampiPanorama conserva permisos, selección, reemplazo y orden; Tu enfoque pasa abajo a cuatro columnas. Se reducen textos repetidos sin eliminar errores ni instrucciones de reemplazo. BusinessCampi usa CampiIdentity con el neutro canónico v2, sin botones de detalle ni nuevas secuencias.

QA local: 47 pruebas aprobadas, lint aprobado y build 33,23 s. Selector visible sin scroll en 1366×768 (contenido hasta y688) y 1920×1080. Se probó selección temporal de cuatro temas, reentrada, CTA, se capturó el empuje y se cerró preview recuperando los cuatro temas originales. No guardó cambios. Reduced motion y doble ejecución cubiertos por pruebas, no emulación visual del sistema. Tipado global conserva cuatro diagnósticos ya registrados: ApprovedMonthlyColumns.test.tsx, PanoramaStoryCard.tsx y dos en projectedStockYtd.test.ts.

Revisión independiente de código encontró empuje indebido al retomar selector; corregido condicionando a bienvenida retenida. Revisión visual independiente pendiente: el agente no pudo reclamar la pestaña por pertenecer a otra sesión; no se eludió esa restricción. QA visual realizado por implementador. Sin publicación, push ni cambios productivos. Móvil diferido.


## Entrada caminando: corrección pendiente de assets

Se retiró el revelado horizontal rechazado (campi-stage-reveal); no se reemplaza con deslizamiento ni fundido. La bienvenida vuelve provisionalmente al neutro y saludo v2 existentes. No constituye entrada terminada. Las tres láminas disponibles no contienen marcha; las poses antiguas de corrida no se mezclan con v2.

Mínimo solicitado para producción de assets: ocho poses completas de ciclo de marcha hacia la derecha (contacto, descenso, paso, elevación; luego apoyos opuestos) más cuatro de llegada (paso corto, doble apoyo, giro al usuario, neutro canónico). Mantener cámara, escala, proporciones, luz y plano de suelo; transparencia y rostro abierto. Integración futura debe sincronizar desplazamiento con pie apoyado, desacelerar al llegar y comenzar saludo después de detenerse. CTA temprano, cancelación y reduced motion conservan sus guardas. Empuje de 600 ms, selector, badge y preferencias permanecen intactos.


## Integración local v5: pasos laterales canónicos

Insumo local: carpeta campi-canonical-sidestep-v5 guardada por el usuario. Se inspeccionó step-wide.png y el código/HANDOFF. Los PNG reposo y saludo coinciden SHA256 con los ya utilizados; no se reemplazaron assets. Se excluyen giro, malla frontal, warping, fundido y saludo simulado del demo.

entryRenderer.js encapsula la entrada lateral con dos saltitos; sin IDs DOM, eventos globales ni RAF propio. Conserva apoyos e IK del demo y destino compatible con el SVG: centro horizontal, suelo H/2+255*s, s=min(min(W,368)/600,min(H,350)/570). Congela distancia lógica y duración por ejecución; resize aplica la escala y anclaje compartidos a la escena. Puede cambiar posición en pantalla durante resize; no implica reiniciar tiempo.

entryGate.js arranca el timeline real únicamente después del endpoint canónico; no llama onAdvance al llegar. CampiWelcomeActor posee un único RAF, precarga, ResizeObserver y limpieza; hidden inicial/cambios y matchMedia pausan o saltan entrada. CTA en entrada cancela y avanza una vez manteniendo pose hasta el empuje; CTA posterior delega invitación existente. Reduced motion usa neutro y navegación inmediata. Remontaje crea instancias nuevas.

Pruebas: 52 aprobadas incluyendo conservación de contactos, endpoint tras resize, start-after-entry, cancelación/doble clic, reentrada y selector/preferencias. Lint aprobado. Tipado global conserva cuatro diagnósticos ya registrados en ApprovedMonthlyColumns.test.tsx, PanoramaStoryCard.tsx y projectedStockYtd.test.ts. Revisión independiente de código sin bloqueantes; tests geométricos usan canvas simulado, no certifican píxeles.

QA visual v5 local pendiente: pestaña anterior 926972564 ya no existe; resolución de http://127.0.0.1:5174/panorama en Chrome agotó 10 s en Emulation.setFocusEmulationEnabled dos veces. No se enumeraron otras pestañas ni se sustituyó la cuenta por otra. No se acredita aún recorrido real, continuidad canvas→SVG, resize visual o reduced motion real. Selector, badge, fondo y empuje de 600 ms se conservaron. Sin push/publicación/productivo.


## Entrada vertical local (sustituye v5 lateral)

La entrada lateral fue rechazada y ya no es la predeterminada. entryRenderer.js mantiene el atlas canonico, cae de frente desde arriba durante 0,65 s, absorbe durante 0,22 s, rebota 0,30 s, asienta 0,24 s y mantiene neutro 0,15 s antes del timeline vigente (pausa 0,35 s y saludo 2,4 s). Sin giro, crossfade, malla ni escala no uniforme. Casco/torso rigidos; flexion moderada de piernas, pies fijos al aterrizar y sin piezas sinteticas agregadas. Un solo rebote de 20 unidades fuente (aprox. 12 px visibles).

CampiWelcomeActor.tsx extiende el canvas 180 px hacia arriba conservando el ancla del SVG; evita el corte interno a la altura de la cabeza visto en la primera comprobacion. Gate, CTA, cancelacion, reduced motion, pausa oculta y empuje al selector de 600 ms conservados. No se modificaron badge, selector, preferencias ni assets.

Verificacion final: 53 pruebas / 8 archivos aprobados; lint aprobado; build 21,96 s. QA real en Chrome local con fabrizio.vega: fotogramas de caida desde borde superior de bienvenida, apoyo, rebote, neutro y saludo; reentrada, CTA/doble clic, selector sin Campi y cierre de preview conservando las cuatro prioridades. La pestaña mantenia el renderer anterior hasta recarga explicita: se recargo y verifico la version vertical. No se hizo grabacion continua de video ni emulacion visual de reduced motion/resize en este lote; esos controles quedan cubiertos por tests y contrato compartido, no por aprobacion estetica del usuario. Sin publicacion/push/productivo.


## Correcciones locales de continuidad y badge (validacion visual pendiente)

Se identifico por codigo que spriteFrame(rest) cambiaba el cuerpo completo al frame 5 para parpadear; el actor ahora conserva frame 0 y su viewBox, y aplica solo un recorte del visor de frame 5. No cambia atlas ni agrega un personaje nuevo. Se suavizaron fronteras de caida/aterrizaje/rebote mediante smoothstep y sin cuadrado, sin modificar escala/proporciones. Pruebas verifican continuidad de posicion y velocidad cercana a cero en fronteras, no continuidad de aceleracion ni fluidez percibida.

Badge: BusinessCampi usa campi-badge-avatar; regla especifica en panorama-dashboard.css elimina translateY, usa grid-row auto y centra el avatar 90x112 dentro del badge. Datos/comentarios/acciones intactos. Selector sigue sin Campi.

Se preparo inspeccion lenta solo DEV mediante ?campi-motion=slow (velocidad 0,25); no cambia preferencias ni afecta builds publicos. No se logro ejecutar la inspeccion lenta: Chrome se desvinculo con Debugger unattached al cerrar preview, y la recuperacion acotada fallo igual. No se cambio cuenta, no se forzo otra via. Estado del clic de cierre no comprobado tras desconexion. No certificar badge/visor/fluidez posterior por tests. Revision independiente solo codigo sin bloqueantes: quedan posibles seams del visor y del cambio PNG/piezas por revisar.

55 pruebas en 8 archivos aprobadas. El saludo/presentacion siguen usando pocas poses completas: faltan intermedios consistentes, pose de caida con brazos abiertos y expresiones alineadas. No se implementaron brazos expresivos nuevos ni sorpresa. La solucion es parcial y no constituye aprobacion estetica. Sin push/publicacion/productivo.
