# Plan: Tabs en Dashboard + vista "Estado de técnicos hoy"

## 1. Reestructurar Dashboard con tabs

En `src/pages/Dashboard.tsx`, debajo del título "Dashboard" agregar un selector con dos opciones:

- **Resumen** — toda la vista actual (KPIs, banner alerta, gráficos, top técnicos, clientes a contactar). El filtro de fechas (Desde/Hasta) **solo aparece** cuando esta tab está activa.
- **Técnicos** — la nueva grilla (descrita abajo). No muestra el filtro de fechas (siempre se basa en "hoy" para disponibilidad, pero usa el período para el contador "X servicios este mes").

Implementación: usar el componente `Tabs` de shadcn (`@/components/ui/tabs`) con dos `TabsTrigger` ("Resumen", "Técnicos") debajo del header. Estado `vista: "resumen" | "tecnicos"`.

## 2. Nueva vista "Estado de técnicos hoy"

Cargar todos los técnicos no-admin desde `profiles` (ya disponibles), junto con su `sucursal`. Para determinar el estado del día:

- Calcular `hoy = format(new Date(), "yyyy-MM-dd")`.
- Para servicios "iniciados hoy": consultar `servicio_jornadas` con `fecha = hoy` y `estado = 'Iniciado'`, y unir con `servicios` para obtener `tecnico_responsable_id`, `auxiliares` y `sucursal`. Un técnico está **No disponible** si participa (responsable o auxiliar) en al menos una jornada activa hoy con estado `Iniciado`.
- Si no, está **Disponible**.

Cada tarjeta (componente `Card`):

- Borde izquierdo de 4px: gris (`border-l-muted-foreground/40`) si Disponible, verde (`border-l-estado-completado` o `#639922`) si No disponible.
- Círculo con iniciales (primeras letras de las 2 primeras palabras del nombre): fondo gris si Disponible, verde si No disponible, texto blanco.
- Nombre completo del técnico.
- Badge de estado: gris ("Disponible") o verde ("No disponible").
- Línea secundaria:
  - Disponible → "N servicios este mes" (cuenta de servicios donde participó dentro del rango `from`/`to` actual del filtro; si la tab Técnicos no usa filtro, usar mes actual por defecto).
  - No disponible → sucursal/ubicación del primer servicio activo hoy (ej. "En Encarnación").

Layout: `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3`.

Al pie: dos pills (Badge):
- "X disponibles" (estilo gris/secundario)
- "X no disponibles" (verde)

## 3. Quitar requisito de horas al completar

En `src/components/ServicioDetalleDialog.tsx`, función `save` (líneas 252-260): eliminar el bloque que valida `merged.estado === "Completado" && horas_trabajadas == null` y bloquea el guardado. También quitar el asterisco rojo `*` y el indicador visual de obligatoriedad junto al label "Horas" (línea 484).

Las horas siguen siendo un campo opcional editable; simplemente ya no impiden marcar Completado.

## Detalles técnicos

```
Dashboard
├─ Header (título)
├─ Tabs [Resumen | Técnicos]
│   ├─ Resumen
│   │   ├─ Filtro fechas (Desde/Hasta)
│   │   ├─ Banner alerta
│   │   ├─ KPIs
│   │   ├─ Charts
│   │   └─ Top técnicos / Clientes a contactar
│   └─ Técnicos
│       ├─ Grilla de tarjetas
│       └─ Pills resumen
```

Query para jornadas activas hoy:
```ts
supabase
  .from("servicio_jornadas")
  .select("servicio_id, estado, fecha, servicios!inner(tecnico_responsable_id, auxiliares, sucursal)")
  .eq("fecha", hoy)
  .eq("estado", "Iniciado")
```

## Archivos a modificar

- `src/pages/Dashboard.tsx` — agregar Tabs, mover contenido actual a tab "Resumen", crear nueva sección "Técnicos", cargar jornadas de hoy.
- `src/components/ServicioDetalleDialog.tsx` — quitar validación obligatoria de horas al completar y el indicador visual `*`.