# Mercado de sembradoras

Ruta `/mercado/sembradoras`. Comparte tarjetas, títulos de gráficos y navegación con Tractores y Cosechadoras. La marca de referencia es HORSCH y aparece en el ranking general aunque quede fuera de las primeras marcas. Las vistas incluyen unidades, participación y FOB, marcas, modelos, segmentos, importadores, acumulado y estacionalidad. Los filtros de grano y transporte se conservan al abrir un desglose.

El desglose usa líneas de siembra para grano grueso y surcos para grano fino. Las líneas totales multiplican la configuración identificada por las unidades. Cuando la configuración falta o presenta variantes, se conserva el valor desconocido del campo. Las configuraciones explícitas del extracto prevalecen sobre coincidencias únicas por marca y modelo. HORSCH documenta la nomenclatura de [Maestro CF](https://www.horsch.com/es_py/productos/sembradoras-de-precision/maestro/maestro-cf) y las [barras intercambiables Dakar y Maestro](https://www.horsch.com/pt/home/detail/dakar-cf-e-maestro-cf-versatilidade-com-sistema-de-troca-de-barra).

- Inicialización en Administración → Datos con OCIT Plantadoras y el extracto Penta/PYimport que continúa su período. Fuentes verificadas para la primera carga: `OCIT_Plantadoras.xlsx` y `detalle_PYimport_2026-10-4-163928.xlsx`, con cobertura hasta septiembre de 2026.
- Para actualizar, cargar solo el Excel original completo del mes o período elegido. El RPC reemplaza ese período y conserva el resto. El extracto puede incluir NCM sin equipos completos. La importación excluye repuestos y equipos manuales detectados.
- Acceso al tablero mediante `mercado.sembradoras`. La carga usa permisos de Administración → Datos. La migración `20261120140000_mercado_sembradoras.sql` crea la tabla y habilita el reemplazo por período.

La base histórica OCIT no tiene registros de agosto de 2025. Los gráficos históricos conservan el hueco y se omite el cálculo de variación cuando falta algún mes del período comparado.
