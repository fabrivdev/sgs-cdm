Plan para corregirlo:

1. Cambiar la regla de jornada activa en `ServicioDetalleDialog` para que no preserve una jornada que ya dejó de estar `Pendiente` cuando existen otras pendientes.
2. Después de guardar un resultado, seleccionar explícitamente la próxima jornada pendiente posterior a la fecha cerrada; si no hay posterior, usar la primera pendiente disponible.
3. Evitar que `fechaContexto` vuelva a forzar la fecha original del planificador después de cerrar una jornada.
4. Ajustar también el borrado/programación de jornadas para aplicar la misma regla consistente.
5. Verificar el comportamiento con el caso del ejemplo: 18/05 cerrada y 19/05 pendiente debe quedar arriba como “Jornada a cerrar”.