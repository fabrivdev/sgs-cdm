# SGS-CDM: inicio

Excepción específica vigente del 14/10/2026: Repuestos > Análisis exige una sola línea visual por registro también en teléfono. No aplicar allí MobileRecord ni identidad apilada; ocultar secundarios en ficha/Excel cuando no entren. Sin subtítulos ni textos explicativos permanentes. Ver [[06-Repuestos]]. Las demás secciones conservan sus acuerdos.

Revisión documental: 14/10/2026. La referencia exacta de código para las fichas generadas consta en `atlas-review.json` y en el manifiesto de sincronización; las notas funcionales indican sus propias comprobaciones y límites. El despliegue Lovable y la aplicación de SQL no se infieren de un commit.

## Para retomar el trabajo

1. [[08-Pendientes-y-validacion|Pendientes actuales]]: qué falta y qué evidencia permite cerrarlo.
2. [[12-Estado-local|Copias de trabajo]]: dónde está cada avance; no mezclar ni sobrescribir.
3. Abrir la nota del módulo y contrastarla con el código indicado. No rehacer una corrección que ya esté en main.

## Reglas y módulos

- [[02-Servicios-y-comisiones|Servicios y comisiones]] · [[26-Ordenes-servicio-y-productividad|OS, productividad y eficiencia]].
- [[03-Ventas-y-conciliacion|Ventas y conciliación]].
- [[04-Parque-y-operaciones|Parque y operaciones]] · [[05-Importaciones|Importaciones y facturas por unidad]].
- [[06-Repuestos|Repuestos y semáforo de stock]].
- [[15-Panel-gerencial|Panel gerencial y absorción]].
- [[07-Accesos-y-asistente|Accesos y asistente]] · [[01-Arquitectura|Arquitectura]].
- [[SIG CDM/Personal/Objetivos/01-Importadores-TOTVS|Importador TOTVS]] · [[SIG CDM/Personal/Objetivos/13-Calidad-duplicados-TOTVS|Reparación histórica de duplicados]].

## Antes de cambiar una vista

Leer [[24-Condiciones-visuales-ventas]] cuando corresponda, [[25-Revision-movil-transversal]], [[SIG CDM/Generado/Reglas/visual-movil-transversal|regla móvil]] y la nota del módulo. Reutilizar PageShell, PageHeader, KpiStrip, FiltersBar, Tabs, CompactListTable, MobileRecord y ResponsiveDrawer.

Desde 640 px: columnas separadas y una línea por registro. Bajo 640 px: agrupación de identidad/contexto cuando ayude a leer, sin perder métricas ni acciones. Planificador conserva su agenda sin horas; Calendario y matrices mantienen sus excepciones. Probar 320/390/639/640/768/1280 px, carga/vacío/error/permisos, teclado, foco, filtros, detalle y Excel. Build y pruebas no sustituyen render y revisión visual independiente. Reutilizar sesiones útiles de navegador y cerrar las pestañas propias.

## Cómo interpretar la memoria

- **Acuerdo:** regla confirmada por Fabrizio; no demuestra implementación.
- **Código integrado:** presente en main; no demuestra publicación ni SQL aplicado.
- **Local:** cambio pendiente en una copia identificada.
- **Producción:** solo se acredita con comprobación real o declaración del usuario identificada como tal.
- **Histórico por comprobar:** evidencia de otra fecha; no es un fallo actual confirmado.

El [[14-Atlas-de-la-app|atlas]] permite explorar dependencias; sus inventarios técnicos se generan desde el código de referencia registrado en cada ficha; no acreditan el despliegue público. [[13-Revision-del-conocimiento|Registro de revisión]] delimita qué se revisó. [[09-Mantenimiento|Mantenimiento]] explica cómo evitar que una sincronización restaure estados viejos. [[SIG CDM/Personal/Objetivos/00-Objetivos|Objetivos personales]] conserva los demás trabajos sin duplicar esta lista.

La publicación pública la realiza Fabrizio en Lovable. No ejecutar reparaciones, migraciones ni importaciones como consecuencia de leer una nota.
