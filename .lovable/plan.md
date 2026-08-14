# Gerencia no ve facturación / ventas

## Qué está pasando (verificado en la base)

Las reglas de acceso a facturación para el nivel Gerencia exigen tener habilitado el módulo **Servicios**:

- `facturacion` → política "Gerencia select facturacion": módulo Servicios + rol gerencia
- `facturacion_lineas_importadas` → misma condición
- `ordenes_servicio_importadas` → misma condición

Usuarios con nivel Gerencia hoy:

| Usuario | Módulos habilitados | Ve facturación |
|---|---|---|
| ANGELA KNORST | Parque, Repuestos, Servicios | Sí |
| DIEGO BARREIRO | Parque, Repuestos, Servicios | Sí |
| JULIANA BECK | Parque, Repuestos, Servicios | Sí |
| FERNANDO PETTER | Parque, Repuestos | **No** |

Fernando es el caso reportado: al no tener Servicios, la base le devuelve cero filas de facturación, así que las ventas de Repuestos (consumo, historial, top clientes) y cualquier dato de facturación le salen vacíos.

Los permisos de tabla (GRANT) están correctos: el problema es únicamente la condición del módulo.

## Qué se va a cambiar

Gerencia pasa a ver facturación **siempre**, sin depender de qué módulos tenga habilitados. El resto queda igual:

- Admin: sin cambios (ve todo).
- Jefatura: sigue viendo solo su sucursal.
- Operativo: sigue sin acceso a datos de venta.

## Detalle técnico

Migración que reemplaza tres políticas de lectura, quitando el `has_module_access(auth.uid(), 'servicios')` y dejando solo `has_role(auth.uid(), 'gerencia')`:

- `public.facturacion` → "Gerencia select facturacion"
- `public.facturacion_lineas_importadas` → "Gerencia select facturacion lineas"
- `public.ordenes_servicio_importadas` → "Gerencia select ordenes servicio"

No cambia el esquema, ni datos, ni el frontend. El acceso a cada pantalla sigue controlado por los módulos habilitados; esto solo evita que las consultas de facturación vuelvan vacías dentro de las pantallas que el usuario sí puede abrir.

## Verificación posterior

Consultar como Fernando (gerencia, sin Servicios) que la facturación devuelva filas, y confirmar que Operativo sigue sin poder leerla.
