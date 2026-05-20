import { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

const labelCls = "text-[10px] uppercase tracking-wide text-muted-foreground font-medium";

function Field({ label, children, className }: { label?: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
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
  className?: string;
}) {
  return (
    <Card className={cn("p-2.5", className)}>
      <div className="flex flex-wrap items-end gap-2">
        {search && (
          <Field label={search.label ?? "Buscar"} className={search.width ?? "w-full sm:w-[240px]"}>
            <div className="relative">
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
          </Field>
        )}

        {children}

        {activeCount > 0 && onClear && (
          <Field>
            <Button variant="ghost" size="sm" onClick={onClear} className="h-9 text-xs">
              <X className="mr-1 h-3 w-3" /> Limpiar ({activeCount})
            </Button>
          </Field>
        )}

        <div className="ml-auto flex items-end gap-2">
          {meta && (
            <div className="text-[11px] text-muted-foreground pb-2">{meta}</div>
          )}
          {actions}
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
        <SelectTrigger className="h-9 text-xs w-full">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
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
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  title?: string;
  width?: string;
}) {
  return (
    <Field label={label} className={width}>
      <Input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 text-xs w-full"
        title={title}
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
