import { Star, StarOff } from "lucide-react";
import { cn } from "@/lib/utils";
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
 * Selector unificado de cuadrilla: una sola lista de técnicos.
 * - Click en la fila => marca/desmarca como auxiliar
 * - Click en la estrella => marca/desmarca como principal (uno solo)
 * Excluí del listado a admins y cabecillas antes de pasar `tecnicos`.
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
      // el principal no puede ser aux a la vez
      onChange({ principalId: null, auxiliares: [...auxiliares, id].filter(x => x !== id) });
      return;
    }
    const has = auxiliares.includes(id);
    onChange({
      principalId,
      auxiliares: has ? auxiliares.filter(x => x !== id) : [...auxiliares, id],
    });
  };

  const togglePrincipal = (id: string) => {
    if (principalId === id) {
      onChange({ principalId: null, auxiliares });
      return;
    }
    onChange({
      principalId: id,
      auxiliares: auxiliares.filter(x => x !== id),
    });
  };

  return (
    <div className={cn("space-y-1.5", className)}>
      {label && <div className="text-xs font-medium text-muted-foreground">{label}</div>}
      <div className="rounded-md border bg-card">
        <div className="max-h-44 overflow-y-auto divide-y">
          {tecnicos.length === 0 && (
            <div className="px-3 py-4 text-xs text-muted-foreground text-center">{emptyText}</div>
          )}
          {tecnicos.map(t => {
            const esPrincipal = principalId === t.id;
            const esAux = auxiliares.includes(t.id);
            const activo = esPrincipal || esAux;
            return (
              <div
                key={t.id}
                className={cn(
                  "flex items-center justify-between gap-2 px-2.5 py-1.5 text-sm",
                  activo && "bg-accent/40",
                )}
              >
                <label className="flex flex-1 items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={activo}
                    onChange={() => toggleAux(t.id)}
                    className="h-3.5 w-3.5"
                  />
                  <span className="truncate">{t.nombre}</span>
                  {esPrincipal && (
                    <span className="ml-1 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                      Principal
                    </span>
                  )}
                  {!esPrincipal && esAux && (
                    <span className="ml-1 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      Auxiliar
                    </span>
                  )}
                </label>
                <button
                  type="button"
                  onClick={() => togglePrincipal(t.id)}
                  className={cn(
                    "rounded p-1 transition-colors",
                    esPrincipal ? "text-amber-500" : "text-muted-foreground/40 hover:text-amber-500",
                  )}
                  title={esPrincipal ? "Quitar como principal" : "Marcar como principal"}
                >
                  {esPrincipal ? <Star className="h-4 w-4 fill-current" /> : <StarOff className="h-4 w-4" />}
                </button>
              </div>
            );
          })}
        </div>
      </div>
      {helperText && <p className="text-[10px] text-muted-foreground">{helperText}</p>}
    </div>
  );
}
