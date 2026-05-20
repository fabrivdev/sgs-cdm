import { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Barra de filtros global. Diseño unificado para Trabajos / Planificador /
 * Calendario / Dashboard. Siempre inline en la parte superior, nunca modal.
 *
 * Layout: [búsqueda izquierda] [filtros compactos] [limpiar] [meta a la derecha]
 */
export function FiltersBar({
  search,
  children,
  activeCount = 0,
  onClear,
  meta,
  className,
}: {
  search?: {
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
    width?: string;
  };
  children?: ReactNode;
  activeCount?: number;
  onClear?: () => void;
  meta?: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("p-2.5", className)}>
      <div className="flex flex-wrap items-center gap-2">
        {search && (
          <div className={cn("relative", search.width ?? "w-full sm:w-[240px]")}>
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search.value}
              onChange={(e) => search.onChange(e.target.value)}
              placeholder={search.placeholder ?? "Buscar…"}
              className="h-9 pl-7 pr-7 text-sm"
            />
            {search.value && (
              <button
                onClick={() => search.onChange("")}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 hover:bg-accent"
                aria-label="Limpiar búsqueda"
                type="button"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        )}

        {children}

        {activeCount > 0 && onClear && (
          <Button variant="ghost" size="sm" onClick={onClear} className="h-9 text-xs">
            <X className="mr-1 h-3 w-3" /> Limpiar ({activeCount})
          </Button>
        )}

        {meta && (
          <div className="ml-auto text-[11px] text-muted-foreground">{meta}</div>
        )}
      </div>
    </Card>
  );
}

/** Select compacto y estandarizado para usar dentro de FiltersBar. */
export function FilterSelect({
  value,
  onChange,
  placeholder,
  options,
  width = "w-[140px]",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  options: { value: string; label: string }[];
  width?: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={cn("h-9 text-xs", width)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Input de fecha estandarizado. */
export function FilterDate({
  value,
  onChange,
  title,
  width = "w-[150px]",
}: {
  value: string;
  onChange: (v: string) => void;
  title?: string;
  width?: string;
}) {
  return (
    <Input
      type="date"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn("h-9 text-xs", width)}
      title={title}
    />
  );
}
