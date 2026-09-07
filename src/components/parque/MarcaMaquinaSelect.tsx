import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DEFAULT_MACHINE_BRANDS, normalizeMachineBrand } from "@/lib/machineBrands";

export function MarcaMaquinaSelect({
  value,
  onValueChange,
  disabled = false,
  className,
}: {
  value?: string | null;
  onValueChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  const [customMode, setCustomMode] = useState(false);
  const normalizedValue = normalizeMachineBrand(value);
  const { data = [], isLoading } = useQuery({
    queryKey: ["maquinaria-marcas-catalogo"],
    queryFn: async () => {
      const { data: rows, error } = await (supabase as any)
        .from("maquinaria_marcas_catalogo")
        .select("nombre")
        .eq("activa", true)
        .order("nombre");
      if (error) throw error;
      return (rows ?? []).map((row: { nombre: string }) => normalizeMachineBrand(row.nombre)).filter(Boolean);
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const brands = useMemo(() => {
    const values = new Set<string>([...DEFAULT_MACHINE_BRANDS, ...data]);
    if (normalizedValue && normalizedValue !== "OTROS") values.add(normalizedValue);
    return [...values].sort((a, b) => a.localeCompare(b, "es"));
  }, [data, normalizedValue]);

  if (customMode) {
    return (
      <div className="space-y-1.5">
        <div className="flex gap-2">
          <Input
            value={normalizedValue === "OTROS" ? "" : value ?? ""}
            onChange={(event) => onValueChange(event.target.value)}
            onBlur={(event) => onValueChange(normalizeMachineBrand(event.target.value))}
            placeholder="Escribí la nueva marca"
            className={className}
            disabled={disabled}
            autoFocus
          />
          <Button type="button" variant="outline" className="shrink-0" disabled={disabled} onClick={() => { onValueChange(""); setCustomMode(false); }}>
            Ver listado
          </Button>
        </div>
        <p className="text-[11px] text-amber-700 dark:text-amber-400">La nueva marca se agregará al catálogo al guardar.</p>
      </div>
    );
  }

  return (
    <Select
      value={normalizedValue && normalizedValue !== "OTROS" ? normalizedValue : undefined}
      onValueChange={(next) => {
        if (next === "__NEW__") { onValueChange(""); setCustomMode(true); }
        else onValueChange(next);
      }}
      disabled={disabled || isLoading}
    >
      <SelectTrigger className={className}><SelectValue placeholder={isLoading ? "Cargando marcas..." : "Seleccionar marca"} /></SelectTrigger>
      <SelectContent>
        {brands.map((brand) => <SelectItem key={brand} value={brand}>{brand}</SelectItem>)}
        <SelectItem value="__NEW__">+ AGREGAR NUEVA MARCA</SelectItem>
      </SelectContent>
    </Select>
  );
}
