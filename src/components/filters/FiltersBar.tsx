import { ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { filterLabel as labelCls, controlHeight, controlText } from "@/lib/ui-classes";

const ctrl = `${controlHeight} ${controlText}`;

/**
 * Oculta por completo los campos que no entran en la fila (en vez de dejarlos
 * cortados a la mitad). Siguen disponibles en el panel lateral "Filtros".
 */
function useOverflowHiding(ref: React.RefObject<HTMLDivElement>) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const apply = () => {
      const items = Array.from(el.children) as HTMLElement[];
      items.forEach((item) => item.classList.remove("hidden"));
      const max = el.clientWidth;
      let hide = false;
      items.forEach((item) => {
        if (hide || item.offsetLeft - el.offsetLeft + item.offsetWidth > max + 1) {
          hide = true;
          item.classList.add("hidden");
        }
      });
    };
    apply();
    const ro = new ResizeObserver(() => apply());
    ro.observe(el);
    return () => ro.disconnect();
  });
}


function Field({ label, children, className }: { label?: string; children: ReactNode; className?: string }) {
  return (
    <div data-filter-field className={cn("flex min-w-0 flex-col gap-2 max-sm:!w-full", className)}>
      {label ? (
        <span className={cn(labelCls, "block h-4 truncate whitespace-nowrap")}>{label}</span>
      ) : (
        <span className="block h-4" aria-hidden />
      )}
      {children}
    </div>
  );
}



/**
 * Barra de filtros global. Diseño unificado para Trabajos / Planificador /
 * Calendario / Dashboard / Parque. Siempre inline, nunca modal.
 *
 * Los filtros primarios viven en una única fila (nunca se expande a dos filas);
 * los campos secundarios van detrás de "Más filtros"; el menú de sección
 * permanece inmediatamente a su derecha, también en móvil.
 */
export function FiltersBar({
  search,
  children,
  activeCount = 0,
  onClear,
  meta,
  mobileContext,
  mobileLeading,
  actions,
  secondaryActions,
  expanded,
  className,
}: {
  search?: {
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
    label?: string;
    ariaLabel?: string;
    width?: string;
  };
  children?: ReactNode;
  activeCount?: number;
  onClear?: () => void;
  /** @deprecated El contador/meta ya no se renderiza junto al botón Filtros. */
  meta?: ReactNode;
  /** Essential context stays visible on phones, independently of the filter drawer. */
  mobileContext?: ReactNode;
  /** Navigation in the search slot for phone views without search (e.g. Calendar). */
  mobileLeading?: ReactNode;
  actions?: ReactNode;
  /** Section menu, immediately after Más filtros; never duplicated in the drawer. */
  secondaryActions?: ReactNode;
  expanded?: ReactNode;
  className?: string;
}) {
  const [panelOpen, setPanelOpen] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);
  useOverflowHiding(rowRef);

  const [searchDraft, setSearchDraft] = useState(search?.value ?? "");
  const debouncedSearch = useDebouncedValue(searchDraft, 250);
  const hasControls = !!children || !!actions || !!secondaryActions || !!expanded || (activeCount > 0 && !!onClear);

  useEffect(() => {
    setSearchDraft(search?.value ?? "");
  }, [search?.value]);

  useEffect(() => {
    if (search && debouncedSearch !== search.value) search.onChange(debouncedSearch);
  }, [debouncedSearch, search]);

  const clearSearch = () => {
    setSearchDraft("");
    search?.onChange("");
  };

  const searchInput = (mobile = false) => (
    <div className="relative min-w-0 flex-1">
      <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        aria-label={search?.ariaLabel ?? search?.label ?? "Buscar"}
        aria-description={search?.placeholder}
        title={search?.placeholder}
        enterKeyHint="search"
        value={searchDraft}
        onChange={(e) => setSearchDraft(e.target.value)}
        placeholder={mobile ? "Buscar…" : search?.placeholder ?? "Buscar…"}
        className={cn(ctrl, "pl-7 pr-7", mobile && "h-9 text-base")}
      />
      {searchDraft && (
        <button
          onClick={clearSearch}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 hover:bg-accent"
          aria-label="Limpiar búsqueda"
          type="button"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );

  return (
    <Card className={cn("min-w-0 border-0 bg-transparent p-0 shadow-none sm:border sm:bg-card sm:px-3 sm:py-2", className)}>
      {mobileContext && <div className="mb-1 min-w-0 text-[11px] leading-4 text-muted-foreground sm:hidden">{mobileContext}</div>}
      <div className="flex min-w-0 flex-nowrap items-center gap-1 sm:items-end sm:gap-2">
      {/* Móvil: búsqueda. Los controles de sección se montan una sola vez. */}
      <div className="flex min-w-0 flex-1 gap-2 sm:hidden">
        {search && searchInput(true)}
        {!search && mobileLeading}
      </div>

      {/* Desktop: una sola fila, sin wrap. Lo que no entra se oculta y queda en el panel. */}
        <div ref={rowRef} className="hidden min-w-0 flex-1 flex-nowrap items-end gap-x-2 overflow-hidden sm:flex">
          {search && (
            <Field label={search.label ?? "Buscar"} className={search.width ?? "w-[240px] min-w-[150px] shrink"}>
              <div className="flex">{searchInput()}</div>
            </Field>
          )}

          {children}
        </div>

        <div className="flex shrink-0 items-end gap-0 sm:gap-2 sm:pl-2">
          {hasControls && (
              <Button
                type="button"
                variant={activeCount > 0 ? "secondary" : "outline"}
                size="sm"
                className={cn(ctrl, "relative shrink-0 gap-1 whitespace-nowrap max-sm:h-11 max-sm:w-11 max-sm:border-0 max-sm:bg-transparent max-sm:px-0 max-sm:shadow-none")}
                onClick={() => setPanelOpen(true)}
                aria-label="Más filtros"
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Más filtros</span>{activeCount > 0 && <span className="max-sm:absolute max-sm:-right-1 max-sm:-top-1 max-sm:rounded-full max-sm:bg-primary max-sm:px-1 max-sm:text-[10px] max-sm:text-primary-foreground">{activeCount}</span>}
              </Button>
          )}
          {secondaryActions}
          {actions && <div className="hidden items-end gap-2 sm:flex">{actions}</div>}
        </div>
      </div>

      {/* Panel lateral de filtros */}
      <Sheet open={panelOpen} onOpenChange={setPanelOpen}>
        <SheetContent
          side="right"
          className="flex w-[min(92vw,380px)] flex-col gap-0 p-0 [&_[data-filter-field]]:!w-full [&_[data-filter-field]]:!min-w-0"
        >
          <SheetHeader className="border-b px-4 py-3 text-left">
            <SheetTitle className="text-[14px]">Filtros</SheetTitle>
          </SheetHeader>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {children && <div className="flex flex-col gap-3">{children}</div>}
            {expanded && <div className="flex flex-col gap-3">{expanded}</div>}
            {actions && <div className="flex flex-col gap-2 border-t pt-3 sm:hidden">{actions}</div>}
          </div>

          <div className="flex items-center justify-between border-t px-4 py-3">
            <Button variant="ghost" size="sm" onClick={() => onClear?.()} disabled={!onClear || activeCount === 0}>
              <X className="mr-1 h-3.5 w-3.5" /> Limpiar{activeCount > 0 ? ` (${activeCount})` : ""}
            </Button>
            <Button size="sm" onClick={() => setPanelOpen(false)}>Aplicar</Button>
          </div>

        </SheetContent>
      </Sheet>
    </Card>
  );
}

/** Select compacto y estandarizado para usar dentro de FiltersBar. */
export function FilterSelect({
  label,
  value,
  onChange,
  placeholder,
  options,
  width = "w-[150px]",
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  options: { value: string; label: string }[];
  width?: string;
}) {
  return (
    <Field label={label} className={cn("shrink-0", width)}>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className={cn(ctrl, "w-full overflow-hidden")}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent className="max-h-[320px] min-w-[--radix-select-trigger-width] max-w-[calc(100vw-2rem)]">
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value} className="max-w-[calc(100vw-3rem)] truncate">
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

/** Input de fecha estandarizado. */
export function FilterDate({
  label,
  value,
  onChange,
  title,
  width = "w-[150px]",
  min,
  max,
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  title?: string;
  width?: string;
  min?: string;
  max?: string;
}) {
  return (
    <Field label={label} className={cn("shrink-0", width)}>
      <Input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(ctrl, "w-full")}
        title={title}
        min={min}
        max={max}
      />
    </Field>
  );
}


/** Slot personalizado dentro de FiltersBar con label uniforme (toggles, switches, etc.). */
export function FilterCustom({
  label,
  children,
  width,
}: {
  label?: string;
  children: ReactNode;
  width?: string;
}) {
  return <Field label={label} className={cn("shrink-0", width)}>{children}</Field>;
}
