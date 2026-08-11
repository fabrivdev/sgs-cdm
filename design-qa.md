# Design QA — menú lateral y microanimaciones

## Resultado

**final result: passed**

## Evidencia

- Fuente visual principal: `C:\Users\Usuario\AppData\Local\Temp\codex-clipboard-a3a0b4e1-1781-49b7-9aea-3e2b20740d69.png`
- Fuente visual secundaria: `C:\Users\Usuario\AppData\Local\Temp\codex-clipboard-358413e9-070c-4d73-bcfc-b53f9e789379.png`
- Captura renderizada: `C:\Users\Usuario\Documents\Codex\2026-08-11\r\sidebar-expanded-latest.png`
- Comparación conjunta: `C:\Users\Usuario\Documents\Codex\2026-08-11\r\sidebar-comparison.png`
- Captura colapsada: `C:\Users\Usuario\Documents\Codex\2026-08-11\r\sidebar-collapsed.png`
- Captura móvil: `C:\Users\Usuario\Documents\Codex\2026-08-11\r\sidebar-mobile.png`
- Viewport principal: 1536 × 1024 CSS px, densidad reportada 1.
- Estado: Planificador activo, módulo Servicios expandido.

## Comparación completa

- La implementación mantiene la identidad SIG existente y limita el rediseño al menú lateral.
- La jerarquía visual coincide con la referencia: marca, rótulo de módulos, bloques de módulo, acordeón contextual y pie institucional.
- Se preservaron las rutas, permisos y agrupaciones reales. No se incorporaron los destinos ficticios de las referencias.
- El ancho es deliberadamente más compacto que el mock para proteger el espacio de trabajo de tablas y planificadores.

## Comparación enfocada del menú

- Tipografía: Inter y pesos 500–700 reproducen correctamente la jerarquía; títulos, módulos y páginas mantienen legibilidad.
- Espaciado: cabecera, tarjetas de módulo, sangría de submenú y separación vertical siguen el ritmo del ejemplo.
- Color: se reutilizaron los tokens oliva de SIG, con superficies blancas y acentos verdes suaves.
- Activos: el módulo y la ruta actual se distinguen sin usar un bloque verde excesivamente pesado.
- Iconos e imágenes: se reutilizó el logo oficial y la biblioteca Lucide existente; no hay recursos aproximados ni placeholders.
- Contenido: las etiquetas corresponden a los módulos y páginas reales de SIG.

## Interacciones probadas

- Expansión exclusiva de Servicios, Parque y Repuestos.
- Sincronización automática del acordeón con la ruta activa.
- Navegación desde Catálogo y Stock a `/repuestos`.
- Colapso a rail de 50 px y restauración del menú expandido.
- Aparición del contenido de ruta, presión de botones, tabs, selectores, diálogos, sheets y menús.
- `prefers-reduced-motion` desactiva las transiciones no esenciales.
- En 390 × 844 el sidebar permanece oculto y la navegación inferior existente continúa activa, sin overflow horizontal.
- Consola sin errores. Permanecen únicamente dos avisos futuros preexistentes de React Router.

## Hallazgos

- P0: ninguno.
- P1: ninguno.
- P2: ninguno.
- P3: el mock incluye destinos que no existen en SIG; se omitieron intencionalmente para mantener la arquitectura del producto.

## Historial de comparación

1. Primera captura: el botón colapsado se superponía visualmente con el logo y el subtítulo podía truncarse.
2. Corrección: el botón se desplazó fuera del rail colapsado y se ajustó el tamaño del subtítulo.
3. Segunda comparación conjunta: composición, jerarquía y estados aprobados sin hallazgos P0/P1/P2.
