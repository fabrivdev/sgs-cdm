import { useRef, useState } from "react";
import { PageHeader, PageShell } from "@/components/layout/AppPrimitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { toast } from "sonner";
import { maintenanceCategories, invoiceValidation } from "./managementModel";
import { submitInvoice } from "./managementApi";
const empty = {
  plate: "",
  supplier: "",
  invoice_number: "",
  invoice_date: "",
  description: "",
  categories: [] as string[],
};
export default function InvoiceUpload({
  plate = "",
  onDone,
  embedded = false,
}: {
  plate?: string;
  onDone?: () => void;
  embedded?: boolean;
}) {
  const [values, setValues] = useState({ ...empty, plate }),
    [file, setFile] = useState<File | null>(null),
    [pending, setPending] = useState(false),
    [error, setError] = useState("");
  const request = useRef(crypto.randomUUID()),
    reserved = useRef(false),
    input = useRef<HTMLInputElement>(null);
  const change = (key: string, value: unknown) => {
    setValues((v) => ({ ...v, [key]: value }));
    setError("");
  };
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    const problem = invoiceValidation(values, file);
    if (problem) {
      setError(problem);
      return;
    }
    setPending(true);
    setError("");
    try {
      await submitInvoice(request.current, values, file!, () => {
        reserved.current = true;
      });
      toast.success("Factura cargada");
      request.current = crypto.randomUUID();
      reserved.current = false;
      setValues({ ...empty, plate });
      setFile(null);
      if (input.current) input.current.value = "";
      onDone?.();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : String(
              (e as { message?: string })?.message ??
                "No se pudo cargar. Reintentá.",
            ),
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <PageShell>
      {!embedded && <PageHeader title="Cargar factura de mantenimiento" />}
      <form onSubmit={submit} className="max-w-3xl space-y-5">
        <fieldset
          disabled={pending || reserved.current}
          className="grid gap-4 sm:grid-cols-2"
        >
          {(
            [
              ["plate", "Chapa"],
              ["supplier", "Proveedor"],
              ["invoice_number", "N.º de factura"],
              ["invoice_date", "Fecha de factura"],
            ] as const
          ).map(([key, label]) => (
            <div key={key} className="space-y-1">
              <Label htmlFor={"invoice-" + key}>{label}</Label>
              <Input
                id={"invoice-" + key}
                type={key === "invoice_date" ? "date" : "text"}
                required
                maxLength={
                  key === "plate" ? 20 : key === "invoice_number" ? 100 : 200
                }
                value={values[key]}
                onChange={(e) => change(key, e.target.value)}
              />
            </div>
          ))}
          <div className="space-y-1">
            <Label>Clasificación</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  disabled={pending || reserved.current}
                  type="button"
                  variant="outline"
                  className="w-full justify-start"
                  aria-label="Clasificación"
                >
                  <span
                    className="truncate"
                    title={values.categories.join(", ")}
                  >
                    {values.categories.length
                      ? values.categories.join(", ")
                      : "Seleccionar"}
                  </span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="space-y-2">
                {maintenanceCategories.map((c) => (
                  <label key={c} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={values.categories.includes(c)}
                      onChange={(e) =>
                        change(
                          "categories",
                          e.target.checked
                            ? [...values.categories, c]
                            : values.categories.filter((v) => v !== c),
                        )
                      }
                    />
                    {c}
                  </label>
                ))}
              </PopoverContent>
            </Popover>
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="invoice-description">Descripción del trabajo</Label>
            <Textarea
              id="invoice-description"
              required
              maxLength={4000}
              rows={3}
              value={values.description}
              onChange={(e) => change("description", e.target.value)}
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="invoice-file">Archivo de factura</Label>
            <Input
              ref={input}
              id="invoice-file"
              type="file"
              accept="application/pdf,image/jpeg,image/png"
              required
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setError("");
              }}
            />
          </div>
        </fieldset>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex justify-end">
          <Button disabled={pending} type="submit">
            {pending ? "Cargando…" : "Cargar factura"}
          </Button>
        </div>
      </form>
    </PageShell>
  );
}
