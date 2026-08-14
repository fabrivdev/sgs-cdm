import { useMemo, useRef, useState } from "react";
import { Search, Star, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
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
 * - Compacto: muestra chips de seleccionados + buscador.
 * - La lista solo se despliega al enfocar el buscador o escribir algo.
 */
export function TecnicosPicker({
  tecnicos,
  principalId,
  auxiliares,
  onChange,
  label = "Cuadrilla",
  helperText,
  className,
  emptyText = "No hay técnicos disponibles.",
}: Props) {
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const tecnicoById = useMemo(() => new Map(tecnicos.map((t) => [t.id, t])), [tecnicos]);

  const seleccionados = useMemo(() => {
    const ids: string[] = [];
    if (principalId) ids.push(principalId);
    for (const a of auxiliares) if (a !== principalId) ids.push(a);
    return ids;
  }, [principalId, auxiliares]);

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

  const removeId = (id: string) => {
    if (id === principalId) onChange({ principalId: null, auxiliares });
    else onChange({ principalId, auxiliares: auxiliares.filter((x) => x !== id) });
  };

  const visibles = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = [...tecnicos].sort((a, b) => {
      const aSelected = a.id === principalId || auxiliares.includes(a.id) ? 1 : 0;
      const bSelected = b.id === principalId || auxiliares.includes(b.id) ? 1 : 0;
      if (a.id === principalId && b.id !== principalId) return -1;
      if (b.id === principalId && a.id !== principalId) return 1;
      if (aSelected !== bSelected) return bSelected - aSelected;
      return a.nombre.localeCompare(b.nombre);
    });

    if (!q) return base;
    return base.filter((t) => {
      const nombre = t.nombre.toLowerCase();
      const sucursal = String(t.sucursal ?? "").toLowerCase();
      return nombre.includes(q) || sucursal.includes(q);
    });
  }, [tecnicos, query, principalId, auxiliares]);

  const listaAbierta = focused || query.trim().length > 0;

  const handleBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    // Si el foco va a otro elemento dentro del wrapper, no cerrar
    if (wrapperRef.current?.contains(e.relatedTarget as Node)) return;
    setFocused(false);
  };

  return (
    <div className={cn("space-y-1.5 min-w-0", className)}>
      {label && (
        <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
      )}

      <div
        ref={wrapperRef}
        onFocus={() => setFocused(true)}
        onBlur={handleBlur}
        className="rounded-md border bg-card overflow-hidden"
      >
        {/* Chips de seleccionados */}
        {seleccionados.length > 0 && (
          <div className="flex flex-wrap gap-1 border-b bg-muted/30 px-2 py-1.5">
            {seleccionados.map((id) => {
              const t = tecnicoById.get(id);
              if (!t) return null;
              const esPrincipal = id === principalId;
              return (
                <span
                  key={id}
                  className={cn(
                    "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px]",
                    esPrincipal
                      ? "bg-primary text-primary-foreground"
                      : "bg-background border text-foreground",
                  )}
                >
                  {esPrincipal && <Star className="h-3 w-3 fill-current" />}
                  <span className="truncate max-w-[140px]">{t.nombre}</span>
                  <button
                    type="button"
                    onClick={() => removeId(id)}
                    className="rounded hover:bg-black/10"
                    aria-label={`Quitar ${t.nombre}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              );
            })}
          </div>
        )}

        {/* Buscador */}
        <div className="px-2 py-1.5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setFocused(true)}
              placeholder={
                seleccionados.length === 0
                  ? "Buscar técnico para agregar…"
                  : "Buscar para agregar más…"
              }
              className="h-9 pl-8 text-[13px]"
            />
          </div>
        </div>

        {/* Lista (solo cuando abierto) */}
        {listaAbierta && (
          <div className="max-h-56 overflow-y-auto overflow-x-hidden divide-y divide-border border-t">
            {tecnicos.length === 0 && (
              <div className="px-3 py-6 text-center text-[12px] text-muted-foreground">
                {emptyText}
              </div>
            )}

            {tecnicos.length > 0 && visibles.length === 0 && (
              <div className="px-3 py-6 text-center text-[12px] text-muted-foreground">
                Sin coincidencias.
              </div>
            )}

            {visibles.map((t) => {
              const esPrincipal = principalId === t.id;
              const esAux = auxiliares.includes(t.id);
              const activo = esPrincipal || esAux;

              return (
                <div
                  key={t.id}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 text-[13px] min-w-0 transition-colors",
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
                    <Star className={cn("h-4 w-4", esPrincipal && "fill-current")} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {helperText && (
        <p className="text-[11px] text-muted-foreground">{helperText}</p>
      )}
    </div>
  );
}
