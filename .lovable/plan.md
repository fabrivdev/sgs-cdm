# Vista lista compacta para OS ancladas

Reemplazar el grid de tarjetas actual en `src/components/trabajos/TrabajosOSTab.tsx` por una tabla legible y arreglar la duplicación "OS y OS".

## Cambios

### `src/components/trabajos/TrabajosOSTab.tsx`

1. **Eliminar** el componente helper `Cell` y el render de tarjetas por OS.
2. **Mantener** el componente `Metric` y la `Card` resumen superior con totales (count, horas, servicios, repuestos, km+terc., total).
3. **Nueva tabla** dentro de `<Card className="overflow-hidden">` + `<div className="overflow-x-auto">`:
   - `min-w-[1100px]`, `text-[12px] tabular-nums`.
   - Header `<thead>` con fondo `bg-muted/50`, sticky opcional, padding `px-3 py-2`.
   - Columnas en orden:
     1. **OS** (sortable) — `OS-####` en mono.
     2. **TR** — `t?.codigo ?? "—"` en mono, **sin** usar `trabajoReferencia` (evita la duplicación OS/OS).
     3. **Cliente** — nombre en `font-medium` + sub-línea `text-[10px] text-muted-foreground` con `mec. · Fact N° · fecha fact.` (solo se renderiza lo que existe).
     4. **Fecha OS** (sortable) — `dd/MM/yyyy`.
     5. **Horas** (sortable, right) — `servicios_cantidad`.
     6. **Servicios** (right) — `$`.
     7. **Repuestos** (right) — `$`.
     8. **Km+Terc.** (right) — suma `kilometro_valor + terceros_valor`.
     9. **TOTAL** (sortable, right, `font-semibold`).
     10. **Situación** — apila `situacion_os` y `situacion_facturacion` como dos `Badge` pequeños (`text-[10px]`) uno arriba del otro.
   - Filas: `border-b border-border/40`, `hover:bg-accent/40`, `cursor-pointer` cuando hay `trabajo_id`. Click → `setDetalleId(t.id)`.
   - Padding por celda `px-3 py-2.5`.
4. **Footer** `<tfoot>` con totales alineados a sus columnas: Horas, Servicios, Repuestos, Km+Terc., TOTAL.
5. **Texto del resumen** del filtros bar: mantener `${filtered.length} OS · Total ${fmtMoney(totales.total)} · ${fmtNum(totales.horas)} h`.

## Fuera de alcance
- No cambian filtros, carga de datos, ordenamiento ni el drawer de detalle.
- No se modifica el kanban ni `Trabajos.tsx`.
