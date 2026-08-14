/**
 * Escala tipográfica única de la app.
 *
 * Todos los tamaños están fijados en px para que no dependan del tamaño base
 * del documento. Cualquier página o componente debe usar estos tokens en lugar
 * de `text-[13px]` / `text-[12px]` / `text-[14px]` sueltos: así el menú, los filtros, las
 * tablas y los KPIs mantienen el mismo peso visual en toda la app.
 */

// Layout de página
export const pageShell = "w-full min-w-0 space-y-3 px-4 py-3 sm:px-5 sm:py-4 lg:px-6";
export const pageShellWide = pageShell;

// Jerarquía de texto
export const pageTitle = "text-[18px] font-semibold leading-6 tracking-[-0.02em]";
export const pageDescription = "text-[10px] leading-4 text-muted-foreground";
export const sectionTitle = "text-[13px] font-semibold leading-5 tracking-[-0.01em]";
export const kpiValue = "text-[20px] font-semibold leading-6 tabular-nums tracking-[-0.02em]";
export const bodyText = "text-[13px] leading-5";
export const tableText = "text-[13px] leading-5";
export const tableHeadText = "text-[11px] leading-4 font-medium tracking-[0.02em] text-muted-foreground";

// Etiqueta de campo/filtro: "Sucursal", "Período rápido", etc.
export const filterLabel = "text-[11px] leading-4 font-medium tracking-[0.02em] text-muted-foreground";
// Etiqueta de card pequeño (KPIs, métricas).
export const cardLabel = "text-[10px] leading-3.5 font-medium tracking-[0.02em] text-muted-foreground";
// Texto secundario de apoyo: contadores, fechas, metadatos.
export const metaText = "text-[11px] leading-4 text-muted-foreground";

// Densidad de controles (inputs, selects, botones de filtro)
export const controlHeight = "h-8";
export const controlText = "text-[12px]";
export const controlClass = `${controlHeight} ${controlText}`;


// Altura estándar de gráficos del dashboard
export const chartHeight = "h-[240px]";

// Iconos: escala única de la app.
// - iconXs: dentro de badges/pills/texto meta
// - iconSm: default (botones, filtros, tablas, KPIs)
// - iconMd: títulos de sección, acciones principales, menú lateral
// - iconLg: solo estados vacíos / error
export const iconXs = "h-3 w-3 shrink-0";
export const iconSm = "h-3.5 w-3.5 shrink-0";
export const iconMd = "h-4 w-4 shrink-0";
export const iconLg = "h-5 w-5 shrink-0";
// Contenedor con fondo: solo menú lateral, encabezado de panel/drawer y estados vacíos.
export const iconTile = "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary";
