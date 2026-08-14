import { ReactNode } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";

const labelCls = "text-[10px] leading-3.5 uppercase tracking-[0.04em] text-muted-foreground font-medium";

export interface MultiOption {
  value: string;
  label: string;
}

/**
 * Multi-select compacto para usar dentro de FiltersBar.
 * Misma altura (h-9) que FilterSelect. Popover con checkboxes.
 */
export function FilterMultiSelect({
  label,
  values,
  onChange,
  options,
  placeholder = "Todos",
  width = "w-[150px]",
}: {
  label?: string;
  values: string[];
  onChange: (next: string[]) => void;
  options: MultiOption[];
  placeholder?: string;
  width?: string;
}) {
  const allSelected = values.length === 0;
  const display = allSelected
    ? placeholder
    : values.length === 1
      ? options.find((o) => o.value === values[0])?.label ?? values[0]
      : `${values.length} seleccionadas`;

  const toggle = (value: string) => {
    const next = values.includes(value)
      ? values.filter((v) => v !== value)
      : [...values, value];
    onChange(next);
  };

  return (
    <div data-filter-field className={cn("flex min-w-0 shrink-0 flex-col gap-0.5 max-sm:!w-full", width)}>
      {label ? (
        <span className={cn(labelCls, "block h-3.5 truncate whitespace-nowrap")}>{label}</span>
      ) : (
        <span className="block h-3.5" aria-hidden />
      )}

      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              "flex h-8 w-full items-center justify-between gap-1 rounded-md border bg-background px-2.5 text-[12px]",
              "hover:bg-accent focus:outline-none focus:ring-1 focus:ring-ring",
              !allSelected && "border-primary/40 bg-primary/5",
            )}
          >

            <span className="truncate">{display}</span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[240px] max-w-[calc(100vw-2rem)] p-0">
          <div className="flex items-center justify-between border-b px-2 py-1.5">
            <button
              type="button"
              onClick={() => onChange([])}
              className="text-[11px] text-muted-foreground hover:text-foreground"
            >
              Todos
            </button>
            {values.length > 0 && (
              <button
                type="button"
                onClick={() => onChange([])}
                className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                aria-label="Limpiar"
              >
                <X className="h-3 w-3" /> Limpiar
              </button>
            )}
          </div>
          <div className="max-h-[280px] overflow-y-auto py-1">
            {options.map((opt) => {
              const checked = values.includes(opt.value);
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => toggle(opt.value)}
                  className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[12px] hover:bg-accent"
                >
                  <Checkbox checked={checked} className="pointer-events-none" />
                  <span className="truncate">{opt.label}</span>
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

/** Helper para construir el predicado de filtro: array vacío = todos. */
export function matchesMulti(values: string[], target: string | null | undefined) {
  if (values.length === 0) return true;
  return target != null && values.includes(target);
}

