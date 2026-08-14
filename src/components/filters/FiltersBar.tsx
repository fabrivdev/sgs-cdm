import { ReactNode, useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { cardLabel as labelCls } from "@/lib/ui-classes";

function Field({ label, children, className }: { label?: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1 max-sm:!w-full", className)}>
      {label ? <span className={labelCls}>{label}</span> : <span className="h-[14px]" aria-hidden />}
      {children}
    </div>
  );
}

/**
 * Barra de filtros global. Diseño unificado para Trabajos / Planificador /
 * Calendario / Dashboard / Parque. Siempre inline, nunca modal.
 *
 * Cada filtro lleva un pequeño título arriba para que se entienda qué hace
 * antes de seleccionar nada.
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
  const [mobileOpen, setMobileOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [searchDraft, setSearchDraft] = useState(search?.value ?? "");
  const debouncedSearch = useDebouncedValue(searchDraft, 250);
  const hasControls = !!children || !!actions || (activeCount > 0 && !!onClear);

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

  return (
    <Card className={cn("px-2 py-1", className)}>
      <div className="flex gap-2 sm:hidden">
        {search && (
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              enterKeyHint="search"
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
              placeholder={search.placeholder ?? "Buscar…"}
              className="h-9 pl-7 pr-7 text-[13px]"
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
        )}
        {hasControls && (
          <Button
            type="button"
            variant={mobileOpen || activeCount > 0 ? "default" : "outline"}
            size="icon"
            className="h-9 w-9 shrink-0"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label="Filtros"
          >
            <SlidersHorizontal className="h-4 w-4" />
          </Button>
        )}
      </div>

      {hasControls && mobileOpen && (
        <div className="mt-2 flex flex-col gap-2 rounded-md border bg-muted/20 p-2 sm:hidden">
          {children}
          {expanded && <div className="border-t pt-2">{expanded}</div>}
          {activeCount > 0 && onClear && (
            <Button variant="ghost" size="sm" onClick={onClear} className="h-9 justify-start text-xs">
              <X className="mr-1 h-3 w-3" /> Limpiar ({activeCount})
            </Button>
          )}
          {actions && <div className="flex flex-col gap-2 border-t pt-2">{actions}</div>}
          {meta && <div className="text-[11px] text-muted-foreground">{meta}</div>}
        </div>
      )}
      {!mobileOpen && meta && (
        <div className="mt-1 text-right text-[11px] text-muted-foreground sm:hidden">{meta}</div>
      )}

      <div className="hidden gap-2 sm:flex sm:flex-row sm:flex-nowrap sm:items-end">
        {search && (
          <Field label={search.label ?? "Buscar"} className={search.width ?? "w-full sm:w-[240px]"}>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                enterKeyHint="search"
                value={searchDraft}
                onChange={(e) => setSearchDraft(e.target.value)}
                placeholder={search.placeholder ?? "Buscar…"}
                className="h-9 pl-7 pr-7 text-[13px]"
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
          </Field>
        )}

        {children}

        {expanded && <Field><Popover open={moreOpen} onOpenChange={setMoreOpen}>
          <PopoverTrigger asChild><Button variant={activeCount > 0 ? "secondary" : "outline"} size="sm" className="h-9"><SlidersHorizontal className="h-3.5 w-3.5" />Filtros{activeCount > 0 ? ` ${activeCount}` : ""}</Button></PopoverTrigger>
          <PopoverContent align="end" className="w-[min(92vw,520px)] p-3"><div className="grid gap-2 sm:grid-cols-2">{expanded}</div><div className="mt-3 flex justify-between border-t pt-2">{activeCount > 0 && onClear ? <Button variant="ghost" size="sm" onClick={onClear}><X className="h-3.5 w-3.5" />Limpiar</Button> : <span />}<Button size="sm" onClick={() => setMoreOpen(false)}>Aplicar</Button></div></PopoverContent>
        </Popover></Field>}

        {activeCount > 0 && onClear && !expanded && (
          <Field>
            <Button variant="ghost" size="sm" onClick={onClear} className="h-9 text-xs">
              <X className="mr-1 h-3 w-3" /> Limpiar
            </Button>
          </Field>
        )}

        <div className="flex w-full flex-col gap-2 sm:ml-auto sm:w-auto sm:flex-row sm:items-end">
          {meta && (
            <div className="pb-0 text-[11px] text-muted-foreground sm:pb-2">{meta}</div>
          )}
          {actions && <div className="flex w-full flex-wrap gap-2 sm:w-auto">{actions}</div>}
        </div>
      </div>

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
  width = "w-[140px]",
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  options: { value: string; label: string }[];
  width?: string;
}) {
  return (
    <Field label={label} className={width}>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-9 w-full overflow-hidden text-[13px]">
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
    <Field label={label} className={width}>
      <Input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full text-[13px]"
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
  return <Field label={label} className={width}>{children}</Field>;
}
