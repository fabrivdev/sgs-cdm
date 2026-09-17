import { useId } from "react";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ImportUnitForm, ImportUnitSection } from "@/lib/machineImportValues";

const fields: Record<ImportUnitSection, { name: keyof ImportUnitForm; label: string; type?: string }[]> = {
  unit: [{ name: "llave_interna", label: "Llave interna de esta unidad" }, { name: "chasis", label: "Chasis" }],
  purchase: [{ name: "eta", label: "Embarque estimado", type: "date" }, { name: "valor_oc", label: "Valor OC de esta unidad", type: "number" }, { name: "moneda_oc", label: "Moneda OC", type: "currency" }],
  invoice: [{ name: "invoice_supplier", label: "Número de factura" }, { name: "factura_proveedor_fecha", label: "Fecha de factura", type: "date" }, { name: "factura_proveedor_moneda", label: "Moneda factura", type: "currency" }, { name: "valor_factura_proveedor", label: "Valor facturado de esta unidad", type: "number" }],
  stock: [{ name: "costo_final", label: "Costo definitivo con IVA", type: "number" }, { name: "costo_stock_moneda", label: "Moneda costo", type: "currency" }],
};

export function ImportUnitFields({ section, form, onChange, onCancel, onSave, saving }: {
  section: ImportUnitSection; form: ImportUnitForm; onChange: (form: ImportUnitForm) => void;
  onCancel: () => void; onSave: () => void; saving: boolean;
}) {
  const prefix = useId();
  return <div className="space-y-3">
    <div className="grid gap-3 sm:grid-cols-2">{fields[section].map(field => {
      const id = prefix + field.name;
      return <div key={field.name} className="space-y-1">
        <Label htmlFor={id} className="text-[11px] text-muted-foreground">{field.label}</Label>
        {field.type === "currency" ? <Select value={form[field.name]} onValueChange={value => onChange({ ...form, [field.name]: value })}>
          <SelectTrigger id={id} aria-label={field.label} className="h-9 text-[12px]"><SelectValue /></SelectTrigger>
          <SelectContent>{["USD", "EUR", "PYG"].map(currency => <SelectItem key={currency} value={currency}>{currency}</SelectItem>)}</SelectContent>
        </Select> : <Input id={id} type={field.type ?? "text"} min={field.type === "number" ? 0 : undefined} step={field.type === "number" ? "0.01" : undefined} value={form[field.name]} onChange={event => onChange({ ...form, [field.name]: event.target.value })} />}
      </div>;
    })}</div>
    <div className="flex justify-end gap-2"><Button variant="outline" size="sm" onClick={onCancel}>Cancelar</Button><Button size="sm" onClick={onSave} disabled={saving}><Save className="mr-1.5 h-3.5 w-3.5" />Guardar unidad</Button></div>
  </div>;
}
