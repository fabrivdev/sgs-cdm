# Consumo por sucursal: eliminar el "Sin sucursal asignada"

## Qué pasa hoy

El historial de ventas del repuesto viene casi todo de la carga histórica (`legacy_historico_detallado`): 185.535 líneas, **todas con la columna de sucursal vacía**. Los otros orígenes (grid de campos, XML nuevo) sí traen sucursal.

La sucursal sí está en esos registros, pero guardada solo en el campo crudo del archivo, con el nombre original del sistema viejo:

```text
CENTRAL                  92.817
MISIONES                 33.224
KATUETE                  26.726
CAMPO 9                  21.025
LOMA PLATA                9.803
SANTA ROSA DEL AGUARAY    1.940
```

Como el gráfico "Por sucursal" y la pestaña Sucursales leen la columna oficial, todo ese volumen cae en "Sin sucursal".

## Solución

1. **Traducir y rellenar** la sucursal de las líneas históricas a partir del valor original, con el mismo mapeo que ya usa el resto de la app:
   - CENTRAL → Santa Rita
   - SANTA ROSA DEL AGUARAY → Santa Rosa
   - CAMPO 9 → Campo 9, MISIONES → Misiones, LOMA PLATA → Loma Plata, KATUETE → Katuete
2. **Arreglar la carga hacia adelante**: la función que inserta el histórico guarda la sucursal solo en el campo crudo; pasa a escribir también la columna oficial usando ese mismo mapeo, para que una re-importación no vuelva a dejarla vacía.
3. **Comportamiento en el panel**: si después del arreglo queda alguna línea sin sucursal reconocible, se sigue mostrando "Sin sucursal" al final de la lista (un dato desconocido es información, no se oculta ni se reparte).

No cambian las cantidades ni los importes: solo se completa a qué sucursal pertenece cada línea.

## Detalle técnico

- Migración nueva:
  - `UPDATE facturacion_lineas_importadas SET sucursal = <map(raw_data->>'sucursal_original')> WHERE sucursal IS NULL AND raw_data ? 'sucursal_original'`, con el mapeo en un `CASE` sobre el valor normalizado (upper + sin acentos).
  - `CREATE OR REPLACE FUNCTION repuestos_importar_facturacion_historica_lote(uuid, jsonb)` con la misma expresión de mapeo aplicada a `x.sucursal` en el `INSERT`, dejando intacto el resto (hash de línea, raw_data, conteos).
- Sin cambios en `repuesto_ventas_historial` ni en `DetalleRepuestoSheet.tsx`; la agregación por sucursal ya funciona una vez que el dato existe.
- Verificación posterior: conteo de líneas históricas con sucursal nula (debe quedar en 0) y revisión del bloque "Por sucursal" de un repuesto con consumo.
