# Postventa, después de completar Ventas

Referencia: Indicadores_Postventa_Agosto_2026.xlsx, aportado por el usuario.

- OS desglosadas por Cliente, Garantía e Interno, sin inventar un cuarto tipo mixto.
- Técnicos en una columna y apertura de horas por técnico con regla explícita de atribución monetaria.
- Distinguir horas OS, horas-persona del período y OS facturadas. No intercambiar fechas de trabajo, cierre y facturación.
- Separar MO, kilometraje, repuestos y terceros vinculados a OS.
- Resúmenes por propietario, marca, tipo y modelo de máquina, conciliados con el detalle.
- Cierre operativo y productividad; esta última requiere definir capacidad disponible.
- Exportación limpia y reproducible desde los mismos filtros y reglas de la app.

No iniciar este módulo hasta aprobar Servicios, Repuestos y Máquinas.

## Corrección de Servicios

La migración 20260911150000_fix_service_owner_and_time_types.sql actualiza las consultas de ventas. Debe aplicarse antes de validar el listado contra producción.
Las OS antiguas se consultan por chasis sin exigir factura ni sucursal. La ausencia de documentos vinculados no prueba que nunca se facturaron.
