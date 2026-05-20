import { Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import type { Sucursal } from "@/lib/constants";

export interface TecnicoOption {
  id: string;
  nombre: string;
  sucursal?: Sucursal | null;
}

interface Props {
  tecnicos: TecnicoOption[];
  principalId: string | null;
  auxiliares: string[];
  onChange: (next: { principalId: string | null; auxiliares: string[] }) => void;
  label?: string;
  helperText?: string;
  className?: string;
  emptyText?: string;
}

/**
 * Selector unificado de cuadrilla.
 * - Click en la fila (checkbox / nombre) => alterna como auxiliar
 * - Click en la estrella => marca como principal (uno solo)
 *
 * Layout fijo, sin scroll horizontal, nombres truncados.
 */
export function TecnicosPicker({
  tecnicos,
  principalId,
  auxiliares,
  onChange,
  label = "Cuadrilla",
  helperText = "Tocá la estrella para marcar al técnico principal. El resto quedan como auxiliares.",
  className,
  emptyText = "No hay técnicos disponibles.",
}: Props) {
  const toggleAux = (id: string) => {
    if (id === principalId) {
      onChange({ principalId: null, auxiliares });
      return;
    }
    const has = auxiliares.includes(id);
    onChange({
      principalId,
      auxiliares: has ? auxiliares.filter((x) => x !== id) : [...auxiliares, id],
    });
  };

  const togglePrincipal = (id: string) => {
    if (principalId === id) {
      onChange({ principalId: null, auxiliares });
      return;
    }
    onChange({
      principalId: id,
      auxiliares: auxiliares.filter((x) => x !== id),
    });
  };

  return (
    <div className={cn("space-y-1.5 min-w-0", className)}>
      {label && (
        <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
      )}

      <div className="rounded-md border bg-card overflow-hidden">
        <div className="max-h-56 overflow-y-auto overflow-x-hidden divide-y divide-border">
          {tecnicos.length === 0 && (
            <div className="px-3 py-6 text-center text-xs text-muted-foreground">
              {emptyText}
            </div>
          )}

          {tecnicos.map((t) => {
            const esPrincipal = principalId === t.id;
            const esAux = auxiliares.includes(t.id);
            const activo = esPrincipal || esAux;

            return (
              <div
                key={t.id}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 text-sm min-w-0 transition-colors",
                  esPrincipal && "bg-primary/5 border-l-2 border-primary",
                  !esPrincipal && esAux && "bg-accent/40",
                )}
              >
                <Checkbox
                  checked={activo}
                  onCheckedChange={() => toggleAux(t.id)}
                  className="shrink-0"
                  aria-label={`Seleccionar ${t.nombre}`}
                />

                <button
                  type="button"
                  onClick={() => toggleAux(t.id)}
                  className="flex-1 min-w-0 flex items-center gap-2 text-left"
                >
                  <span className="truncate flex-1 min-w-0">{t.nombre}</span>

                  {esPrincipal && (
                    <span className="shrink-0 rounded bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
                      Principal
                    </span>
                  )}
                  {!esPrincipal && esAux && (
                    <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      Auxiliar
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => togglePrincipal(t.id)}
                  className={cn(
                    "shrink-0 rounded p-1 transition-colors",
                    esPrincipal
                      ? "text-primary"
                      : "text-muted-foreground/40 hover:text-primary",
                  )}
                  title={esPrincipal ? "Quitar como principal" : "Marcar como principal"}
                  aria-label={esPrincipal ? "Quitar como principal" : "Marcar como principal"}
                >
                  <Star
                    className={cn("h-4 w-4", esPrincipal && "fill-current")}
                  />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {helperText && (
        <p className="text-[11px] text-muted-foreground">{helperText}</p>
      )}
    </div>
  );
}
