# Panorama: período automático, preparación local 02/11/2026

Regla autorizada: los primeros cinco días hábiles del mes se solicita el acumulado disponible. Desde el sexto se solicita el mes actual, que Auto solo confirma si la fuente acredita actualización. Las elecciones manuales Mes/Acum. prevalecen hasta pulsar Auto. No se decide por cantidad de movimientos ni importes cero.

## Calendario y preferencias

`automaticPeriod.ts` cuenta lunes a viernes, incluyendo el día de análisis en America/Asuncion. `businessCalendar.ts` lee únicamente `fecha` del mes transcurrido de `dias_no_laborales`, bajo el permiso existente `servicios.calendario` y su RLS. No trae calendarios externos ni inventa feriados. Sin permiso o ante error/timeout, cuenta lunes a viernes y muestra que no verificó los días no laborables. El timeout de presentación es de diez segundos, sin reintentos automáticos. Las fotografías no esperan ese calendario.

Nueva clave local `sig-cdm:panorama:periods:v1:<usuario>`: solo guarda excepciones manuales por tema. No altera la selección de cuatro temas. Los usuarios existentes no tenían períodos persistidos: comienzan en Auto; una preferencia nueva sobrevive recarga/cambio de mes y se separa por usuario. Storage events sincronizan otras pestañas. Si falla la escritura se conserva durante la sesión y se informa. El día se revisa cada minuto y al recuperar foco; el cambio de período entra en la clave de consulta.

## Actualización y límite pendiente

Los contratos de ventas, OS importadas y clientes no acreditan una fecha de completitud del origen. `cutoff`, fecha de última factura, fecha de importación y éxito HTTP no se reinterpretan como prueba. La extensión `sourceFreshness: {through, complete}` requiere evidencia explícita; no se fabrica para esos cargadores.

La Agenda sí es una lectura completa y paginada de jornadas nativas actuales, sin fuente importada, y conserva ese alcance en su evidencia. Desde el sexto día, Auto consulta el mes y muestra los valores disponibles con advertencia si no puede acreditar actualización. No transforma esa incertidumbre en error ni borra el KPI; tampoco retrocede silenciosamente al acumulado. Mes/Acum. manual siguen consultables con advertencia. Durante los primeros cinco días el acumulado puede mostrarse como disponible con la misma advertencia; Campi no lo narra como actualizado. Errores reales conservan su mensaje; no se convierten en ceros.

Para habilitar automáticamente el mes en los demás temas falta un contrato de completitud por origen, rango y todas las secciones contribuyentes. No se cambió SQL, RLS ni consultas para inventarlo. Esta preparación no afirma que esos orígenes estén atrasados: su actualización es desconocida.

### Auditoría adicional de metadatos

- Ocho temas tienen actualización no acreditada por sus payloads: Evolución de ventas, Facturación neta, Resolución de OS, OS facturadas a clientes, Productividad, Eficiencia, Retención y Cobertura de posventa. Ya no quedan bloqueados por esa ausencia: mantienen KPI/gráfico consultados y una advertencia. Campi conserva la advertencia cuando no hay otro comentario verificable.
- `newSystemPersist.ts:553` guarda `snapshot_scope`, `sourcePeriodFrom/To` y `technicalLoadState` en metadata de importación. Existe un contrato FULL en `billingSourceAccreditation.ts`, pero `automaticBillingSnapshotDeclaration` usa Created del XML y, si falta, la última fecha observada. El registro no conserva esa distinción como evidencia de corte. No se puede usar indiscriminadamente como frescura; sería convertir una última transacción en actualización, expresamente prohibido.
- `campi_os_snapshot_numeros_v1` concilia identidades y lotes del último XML para OS abiertas. No acredita que el histórico de cierres o el libro de horas estén completos hasta hoy. `actualizado_en` acredita escritura, no fecha real de extracción.
- `totvs_cxc_cargas` tiene fecha_corte/corte_evidencia y estado de carga, pero corresponde a Cuentas por cobrar, no a las fuentes de estos indicadores. `kardex_cargado_en` tampoco es corte de inventario. No se reutilizan señales de otro dominio.
- Solución mínima sin cambios remotos: período calendario + valores observados + actualización desconocida explícita. Para confirmar actualización de los ocho temas hace falta conservar procedencia del corte (reporte/declaración acreditada, no última transacción), carga completada, rango y secciones/sucursales cubiertas, y exponer solo ese agregado bajo los permisos actuales. No está aprobado modificar importadores/RPC/ACL por esta tarea.

## Coherencia

`PanoramaDashboard` resuelve una elección por tema para consulta, tarjeta, gráfico, enlaces y badge. Los comentarios no cambian a otra ventana diaria/semanal/acumulada secundaria mientras la tarjeta muestra otra. La rotación entre temas, intervalo, pausas y animaciones se conservan. Stock, clasificación y pedidos mantienen fotografías y no reciben Auto. Cobertura usa atenciones del período sobre propietarios únicos del parque actual; no suma fotografías mensuales.

Los títulos conservan el tema y muestran el período elegido como prosa. Cuando el inicio real es 01/07/2026, la etiqueta y las variantes acumuladas dicen Desde julio de 2026, sin insinuar enero-junio ni sumar medianas o porcentajes. No cambian fórmulas, cantidades ni ventanas de los cargadores.

## Validación e integración

La mejora se integró por fragmentos al checkout local servido, conservando sus diferencias ajenas de propuestas y cobertura y respaldando los archivos. No se restauró el recorrido de prueba eliminado.

La versión preparada para main parte de d2a68936 y conserva el código vigente de esa rama, sin copiar las diferencias antiguas del checkout servido. Validación final sobre este worktree: 128 pruebas aprobadas en 12 archivos y lint focalizado sin errores. Cubre días 1–5/sexto, fines de semana, calendario configurado y sus permisos, cambio de mes, elección manual persistente y aislamiento de usuarios, snapshots, cero real, fuente desconocida/atrasada y coherencia entre tarjetas y badge. Los fixtures no acreditan frescura productiva.

Computer Use continúa bloqueado: no se realizó QA visual nueva. Commit y push no publican Lovable ni ejecutan SQL; la publicación pública corresponde al usuario. No se modifican permisos, fórmulas ni animaciones.

Tipado de tsconfig.app.json aprobado. Build final aprobado en 44,79 s, con avisos existentes de Browserslist y chunks grandes.
