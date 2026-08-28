import { useId, useMemo } from "react";
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
  const listId = useId();
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

  if (!allowCustom) {
    return (
      <Select value={value || undefined} onValueChange={onValueChange} disabled={disabled || isLoading || !subgrupo}>
        <SelectTrigger className={className}><SelectValue placeholder={isLoading ? "Cargando modelos..." : "Seleccionar modelo"} /></SelectTrigger>
        <SelectContent>{opciones.map((modelo) => <SelectItem key={normalizeMachineModelKey(modelo)} value={modelo}>{modelo}</SelectItem>)}</SelectContent>
      </Select>
    );
  }

  return (
    <div className="space-y-1">
      <Input
        list={listId}
        value={value ?? ""}
        onChange={(event) => onValueChange(event.target.value)}
        placeholder={isLoading ? "Cargando modelos..." : "Seleccionar o escribir modelo"}
        className={className}
        disabled={disabled}
      />
      <datalist id={listId}>
        {opciones.map((modelo) => (
          <option key={normalizeMachineModelKey(modelo)} value={modelo} />
        ))}
      </datalist>
      <p className={esModeloNuevo ? "text-[11px] text-amber-700 dark:text-amber-400" : "text-[11px] text-muted-foreground"}>
        {esModeloNuevo
          ? "Modelo nuevo: verificá el texto antes de continuar."
          : "Seleccioná una opción o escribí un modelo nuevo."}
      </p>
    </div>
  );
}
