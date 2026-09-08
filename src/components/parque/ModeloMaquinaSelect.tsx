import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { normalizeMachineBrand } from "@/lib/machineBrands";
import { catalogModelsForBrand, reviewCatalogLine, upperMachineText, type MachineCatalogModel } from "@/lib/machineOrderValidation";
import { useMachineCatalog } from "@/hooks/useMachineCatalog";
import { MachineCatalogManager } from "./MachineCatalogManager";

export function ModeloMaquinaSelect({ marca, subgrupo, value, onValueChange, className, allowCustom = true, disabled = false }: {
  marca: string;
  subgrupo: string;
  value?: string | null;
  // Update type and model together, including when the previous type was incorrect.
  onValueChange: (value: string, model?: MachineCatalogModel) => void;
  className?: string;
  allowCustom?: boolean;
  disabled?: boolean;
}) {
  const [customMode, setCustomMode] = useState(false);
  const catalog = useMachineCatalog();
  const options = useMemo(() => catalog.data ? catalogModelsForBrand(catalog.data, marca) : [], [catalog.data, marca]);
  const match = catalog.data ? reviewCatalogLine({ marca, subgrupo, modelo: value ?? "" }, catalog.data).match : undefined;
  const unknown = Boolean(value?.trim() && catalog.data && !match);
  useEffect(() => setCustomMode(false), [marca]);

  if (allowCustom && (customMode || unknown)) return (
    <div className="space-y-1.5">
      <div className="flex gap-2">
        <Input value={value ?? ""} onChange={event => { setCustomMode(true); onValueChange(upperMachineText(event.target.value)); }}
          placeholder="Escribí el nombre del nuevo modelo" className={className} disabled={disabled} autoFocus />
        <Button type="button" variant="outline" className="shrink-0" disabled={disabled} onClick={() => { onValueChange(""); setCustomMode(false); }}>Ver catálogo</Button>
      </div>
      {catalog.isError ? <p className="text-[11px] text-destructive">No se pudo verificar el catálogo. <button type="button" className="underline" onClick={() => catalog.refetch()}>Reintentar</button></p>
        : <p className="text-[11px] text-amber-700 dark:text-amber-400">Modelo fuera del listado: verificá el nombre y el tipo. Se agregará al catálogo compartido al guardar.</p>}
      <MachineCatalogManager kind="modelo" disabled={disabled} />
    </div>
  );

  return (
    <div className="space-y-1.5">
      <Select value={match?.id ?? (value ? "__CURRENT__" : "")} onValueChange={id => {
        if (id === "__OTHER__") { setCustomMode(true); onValueChange(""); return; }
        const model = options.find(m => m.id === id);
        if (model) { setCustomMode(false); onValueChange(model.nombre, model); }
      }} disabled={disabled || catalog.isLoading || catalog.isError || !normalizeMachineBrand(marca)}>
        <SelectTrigger className={className}><SelectValue placeholder={catalog.isLoading ? "Cargando modelos..." : "Seleccionar modelo"} /></SelectTrigger>
        <SelectContent>
          {value && !match && <SelectItem value="__CURRENT__" disabled>{value}</SelectItem>}
          {options.map(model => <SelectItem key={model.id} value={model.id}>{model.nombre} · {model.subgrupo}</SelectItem>)}
          {allowCustom && <SelectItem value="__OTHER__">OTRO / NUEVO MODELO</SelectItem>}
        </SelectContent>
      </Select>
      {catalog.isError ? <p className="text-[11px] text-destructive">No se pudo verificar el catálogo. <button type="button" className="underline" onClick={() => catalog.refetch()}>Reintentar</button></p>
        : <p className="text-[11px] text-muted-foreground">Todos los modelos de la marca. Al seleccionar uno se completa su tipo.</p>}
      {allowCustom && <MachineCatalogManager kind="modelo" disabled={disabled} />}
    </div>
  );
}
