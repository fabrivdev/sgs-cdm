import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Marca } from "@/lib/constants";
import { normalizeMachineModelKey } from "@/lib/machineModels";

type ModeloCatalogo = {
  id: string;
  nombre: string;
};

export function ModeloMaquinaSelect({
  marca,
  subgrupo,
  value,
  onValueChange,
  className,
  allowCustom = true,
  disabled = false,
}: {
  marca: Marca;
  subgrupo: string;
  value?: string | null;
  onValueChange: (value: string) => void;
  className?: string;
  allowCustom?: boolean;
  disabled?: boolean;
}) {
  const [customMode, setCustomMode] = useState(false);
  const { data = [], isLoading } = useQuery({
    queryKey: ["parque-modelos-catalogo", marca, subgrupo],
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("parque_modelos_catalogo")
        .select("id, nombre")
        .eq("marca", marca)
        .eq("subgrupo", subgrupo as never)
        .eq("activo", true)
        .order("nombre");

      if (error) throw error;
      return (rows ?? []) as ModeloCatalogo[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const opciones = useMemo(() => {
    const byKey = new Map(data.map((modelo) => [normalizeMachineModelKey(modelo.nombre), modelo.nombre]));
    if (value && !byKey.has(normalizeMachineModelKey(value))) {
      byKey.set(normalizeMachineModelKey(value), value);
    }
    return [...byKey.values()].sort((a, b) => a.localeCompare(b, "es", { numeric: true }));
  }, [data, value]);

  const esModeloNuevo = Boolean(
    value?.trim() &&
    !data.some((modelo) => normalizeMachineModelKey(modelo.nombre) === normalizeMachineModelKey(value)),
  );

  useEffect(() => {
    if (!value?.trim()) return;
    setCustomMode(!data.some((modelo) => normalizeMachineModelKey(modelo.nombre) === normalizeMachineModelKey(value)));
  }, [data, value]);

  useEffect(() => setCustomMode(false), [marca, subgrupo]);

  if (!allowCustom) {
    return (
      <Select value={value || undefined} onValueChange={onValueChange} disabled={disabled || isLoading || !subgrupo}>
        <SelectTrigger className={className}><SelectValue placeholder={isLoading ? "Cargando modelos..." : "Seleccionar modelo"} /></SelectTrigger>
        <SelectContent>{opciones.map((modelo) => <SelectItem key={normalizeMachineModelKey(modelo)} value={modelo}>{modelo}</SelectItem>)}</SelectContent>
      </Select>
    );
  }

  const selectValue = customMode || esModeloNuevo ? "__OTHER__" : value || undefined;

  return (
    <div className="space-y-1.5">
      <Select
        value={selectValue}
        onValueChange={(next) => {
          if (next === "__OTHER__") {
            setCustomMode(true);
            onValueChange("");
          } else {
            setCustomMode(false);
            onValueChange(next);
          }
        }}
        disabled={disabled || isLoading || !subgrupo}
      >
        <SelectTrigger className={className}><SelectValue placeholder={isLoading ? "Cargando modelos..." : "Seleccionar modelo"} /></SelectTrigger>
        <SelectContent>
          {opciones.filter((modelo) => !esModeloNuevo || normalizeMachineModelKey(modelo) !== normalizeMachineModelKey(value)).map((modelo) => (
            <SelectItem key={normalizeMachineModelKey(modelo)} value={modelo}>{modelo}</SelectItem>
          ))}
          <SelectItem value="__OTHER__">OTRO / NUEVO MODELO</SelectItem>
        </SelectContent>
      </Select>
      {(customMode || esModeloNuevo) && (
        <Input
          value={value ?? ""}
          onChange={(event) => onValueChange(event.target.value)}
          placeholder="Escribir nuevo modelo"
          className={className}
          disabled={disabled}
          autoFocus={!value}
        />
      )}
      <p className={esModeloNuevo ? "text-[11px] text-amber-700 dark:text-amber-400" : "text-[11px] text-muted-foreground"}>
        {esModeloNuevo
          ? "Modelo nuevo: verificá el texto antes de continuar."
          : "Seleccioná un modelo o elegí otro para crear uno nuevo."}
      </p>
    </div>
  );
}
