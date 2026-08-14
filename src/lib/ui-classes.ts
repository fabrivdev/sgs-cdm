/**
 * Escala tipográfica única de la app.
 *
 * Todos los tamaños están fijados en px para que no dependan del tamaño base
 * del documento. Cualquier página o componente debe usar estos tokens en lugar
 * de `text-[13px]` / `text-[12px]` / `text-[14px]` sueltos: así el menú, los filtros, las
 * tablas y los KPIs mantienen el mismo peso visual en toda la app.
 */

// Layout de página
export const pageShell = "w-full min-w-0 space-y-4 px-4 py-4 sm:px-5 sm:py-5 lg:px-6";
export const pageShellWide = pageShell;

// Jerarquía de texto
export const pageTitle = "text-[18px] font-semibold leading-6 tracking-[-0.02em]";
export const pageDescription = "text-[10px] leading-4 text-muted-foreground";
export const sectionTitle = "text-[14px] font-semibold leading-5 tracking-[-0.01em]";
export const kpiValue = "text-[22px] font-semibold leading-7 tabular-nums tracking-[-0.02em]";
export const bodyText = "text-[13px] leading-5";
export const tableText = "text-[13px] leading-5";
export const tableHeadText = "text-[11px] font-medium uppercase tracking-[0.04em] text-muted-foreground";

// Etiqueta de campo/filtro: "SUCURSAL", "PERÍODO", etc.
export const cardLabel = "text-[10px] leading-3.5 uppercase tracking-[0.04em] text-muted-foreground font-medium";
// Texto secundario de apoyo: contadores, fechas, metadatos.
export const metaText = "text-[11px] leading-4 text-muted-foreground";

// Densidad de controles (inputs, selects, botones de filtro)
export const controlHeight = "h-8";
export const controlText = "text-[12px]";
export const controlClass = `${controlHeight} ${controlText}`;


// Altura estándar de gráficos del dashboard
export const chartHeight = "h-[240px]";
