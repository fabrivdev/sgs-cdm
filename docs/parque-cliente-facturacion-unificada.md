# Facturacion unificada en el detalle del cliente

El detalle de facturacion al abrir un cliente usa el mismo corte de fuentes que
el resumen de Parque:

- `facturacion` para fechas anteriores al 01/07/2026.
- `facturacion_lineas_importadas` desde el 01/07/2026.

Ambas consultas usan el `cliente_id` persistido. Las lineas TOTVS se deduplican
solo por `id`; dos lineas comerciales iguales con identidades distintas siguen
sumando. La union conserva importes negativos de notas de credito, se ordena
antes de elegir las diez ventas recientes y pagina ambas fuentes para no truncar
los totales en 1.000 registros.

Si falla cualquiera de las fuentes, el panel no presenta ceros ni resultados
parciales como si fueran completos. Esta correccion no requiere SQL y no prueba
que la importacion productiva de archivos TOTVS haya finalizado.

Verificacion local: `src/lib/clientBilling.test.ts` cubre el corte, la
deduplicacion por identidad, lineas legitimas, notas de credito, clasificacion,
YTD/anio anterior y orden global. La compilacion de produccion tambien debe
terminar correctamente antes de publicar.
