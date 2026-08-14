import { ReactNode, useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { cardLabel as labelCls, controlHeight, controlText } from "@/lib/ui-classes";

const ctrl = `${controlHeight} ${controlText}`;

function Field({ label, children, className }: { label?: string; children: ReactNode; className?: string }) {
  return (
    <div data-filter-field className={cn("flex min-w-0 flex-col gap-0.5 max-sm:!w-full", className)}>
      {label ? (
        <span className={cn(labelCls, "block h-3.5 truncate whitespace-nowrap")}>{label}</span>
      ) : (
        <span className="block h-3.5" aria-hidden />
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
 * lo secundario va detrás del botón "Filtros", que abre un panel lateral.
 */
export function FiltersBar({
  search,
  children,
  activeCount = 0,
  onClear,
  meta,
  actions,
  expanded,
  className,
}: {
  search?: {
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
    label?: string;
    width?: string;
  };
  children?: ReactNode;
  activeCount?: number;
  onClear?: () => void;
  meta?: ReactNode;
  actions?: ReactNode;
  expanded?: ReactNode;
  className?: string;
}) {
  const [panelOpen, setPanelOpen] = useState(false);
  const [searchDraft, setSearchDraft] = useState(search?.value ?? "");
  const debouncedSearch = useDebouncedValue(searchDraft, 250);
  const hasControls = !!children || !!actions || !!expanded || (activeCount > 0 && !!onClear);

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

  const searchInput = (
    <div className="relative min-w-0 flex-1">
      <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        enterKeyHint="search"
        value={searchDraft}
        onChange={(e) => setSearchDraft(e.target.value)}
        placeholder={search?.placeholder ?? "Buscar…"}
        className={cn(ctrl, "pl-7 pr-7")}
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
    <Card className={cn("min-w-0 px-3 py-2", className)}>
      {/* Móvil: búsqueda + botón de panel */}
      <div className="flex gap-2 sm:hidden">
        {search && searchInput}
        {hasControls && (
          <Button
            type="button"
            variant={activeCount > 0 ? "default" : "outline"}
            size="icon"
            className={cn(controlHeight, "w-8 shrink-0")}
            onClick={() => setPanelOpen(true)}
            aria-label="Filtros"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
      {meta && <div className="mt-1 text-right text-[10px] text-muted-foreground sm:hidden">{meta}</div>}

      {/* Desktop: una sola fila, sin wrap. Lo que no entra se oculta y queda en el panel. */}
      <div className="hidden min-w-0 flex-nowrap items-end gap-x-2 sm:flex">
        <div className="flex min-w-0 flex-1 flex-nowrap items-end gap-x-2 overflow-hidden">
          {search && (
            <Field label={search.label ?? "Buscar"} className={search.width ?? "w-[240px] min-w-[150px] shrink"}>
              <div className="flex">{searchInput}</div>
            </Field>
          )}

          {children}
        </div>

        <div className="flex shrink-0 items-end gap-2 pl-2">
          {(expanded || children) && (
            <Field>
              <Button
                type="button"
                variant={activeCount > 0 ? "secondary" : "outline"}
                size="sm"
                className={cn(ctrl, "shrink-0 gap-1 whitespace-nowrap")}
                onClick={() => setPanelOpen(true)}
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                Filtros{activeCount > 0 ? ` ${activeCount}` : ""}
              </Button>
            </Field>
          )}
          {meta && <div className="whitespace-nowrap pb-1 text-[10px] text-muted-foreground">{meta}</div>}
          {actions && <div className="flex items-end gap-2">{actions}</div>}
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
          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {children && <div className="flex flex-col gap-3">{children}</div>}
            {expanded && <div className="flex flex-col gap-3">{expanded}</div>}
            {actions && <div className="flex flex-col gap-2 border-t pt-3 sm:hidden">{actions}</div>}
          </div>

          <div className="flex items-center justify-between border-t px-4 py-3">
            {activeCount > 0 && onClear ? (
              <Button variant="ghost" size="sm" onClick={onClear}>
                <X className="mr-1 h-3.5 w-3.5" /> Limpiar ({activeCount})
              </Button>
            ) : (
              <span />
            )}
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
