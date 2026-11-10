import { SupplierFields } from "./SupplierFields";
import {
  ResponsiveDrawerBody,
  ResponsiveDrawerFooter,
} from "@/components/ui/responsive-drawer";
import { useAuth } from "@/hooks/useAuth";
import { useEffect, useRef, useState } from "react";
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
import { submitInvoice, fleetRpc } from "./managementApi";
const empty = {
  plate: "",
  supplier: "",
  supplier_tax_id: "",
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
  const { user } = useAuth();
  const draftKey =
    "fleet-invoice-draft:" +
    (user?.id ?? "local") +
    (embedded ? ":" + plate : "");
  const [draft] = useState(() => {
    try {
      return JSON.parse(sessionStorage.getItem(draftKey) ?? "null") as {
        values: typeof empty;
        id: string;
        reserved: boolean;
        file: { name: string; size: number; type: string } | null;
      } | null;
    } catch {
      return null;
    }
  });
  const [confirmation, setConfirmation] = useState("");
  const [values, setValues] = useState(draft?.values ?? { ...empty, plate }),
    [file, setFile] = useState<File | null>(null),
    [pending, setPending] = useState(false),
    [error, setError] = useState("");
  const request = useRef(draft?.id ?? crypto.randomUUID()),
    reserved = useRef(draft?.reserved ?? false),
    input = useRef<HTMLInputElement>(null);
  const expectedFile = useRef(draft?.file ?? null);
  useEffect(() => {
    try {
      sessionStorage.setItem(
        draftKey,
        JSON.stringify({
          values,
          id: request.current,
          reserved: reserved.current,
          file: expectedFile.current,
        }),
      );
    } catch {
      /* Storage may be unavailable; the form still works. */
    }
  }, [values, pending, draftKey]);
  const errorField = /RUC/i.test(error)
    ? "supplier_tax_id"
    : /chapa/i.test(error)
      ? "plate"
      : /fecha/i.test(error)
        ? "invoice_date"
        : /clasificaci/i.test(error)
          ? "classification"
          : /archivo|PDF/i.test(error)
            ? "file"
            : null;
  useEffect(() => {
    if (errorField) document.getElementById("invoice-" + errorField)?.focus();
  }, [error, errorField]);
  const change = (key: string, value: unknown) => {
    setValues((v) => ({ ...v, [key]: value }));
    setError("");
  };
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    if (
      reserved.current &&
      expectedFile.current &&
      file &&
      (file.name !== expectedFile.current.name ||
        file.size !== expectedFile.current.size ||
        file.type !== expectedFile.current.type)
    ) {
      setError(
        "Seleccioná el mismo archivo del intento anterior. Jefatura puede completar la carga con otro archivo.",
      );
      return;
    }
    if (!/^[0-9][0-9 .-]{2,19}$/.test(values.supplier_tax_id ?? "")) {
      setError("Ingresá el RUC del proveedor");
      return;
    }
    if (!values.supplier.trim()) {
      setError(
        "Completá el proveedor: seleccioná una coincidencia o ingresá el nombre si el RUC no está en el maestro",
      );
      return;
    }
    const problem = invoiceValidation(values, file);
    if (problem) {
      setError(problem);
      return;
    }
    setPending(true);
    setError("");
    try {
      await submitInvoice(
        request.current,
        values,
        file!,
        (reservedId) => {
          request.current = reservedId || request.current;
          reserved.current = true;
          expectedFile.current = {
            name: file!.name,
            size: file!.size,
            type: file!.type,
          };
          try {
            sessionStorage.setItem(
              draftKey,
              JSON.stringify({
                values,
                id: request.current,
                reserved: true,
                file: expectedFile.current,
              }),
            );
          } catch {
            /* unavailable storage */
          }
        },
        reserved.current,
      );
      toast.success("Factura cargada");
      setConfirmation(
        `Factura ${values.invoice_number} · ${values.plate}: carga completada`,
      );
      expectedFile.current = null;
      try {
        sessionStorage.removeItem(draftKey);
      } catch {
        /* unavailable storage */
      }
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
  const Container = embedded ? "div" : PageShell;
  const Body = embedded ? ResponsiveDrawerBody : "div";
  const Footer = embedded ? ResponsiveDrawerFooter : "div";
  return (
    <Container
      className={embedded ? "flex min-h-0 flex-1 flex-col" : undefined}
    >
      {!embedded && <PageHeader title="Cargar factura de mantenimiento" />}
      <form
        onSubmit={submit}
        className={
          embedded ? "flex min-h-0 flex-1 flex-col" : "max-w-3xl space-y-5"
        }
      >
        <Body className="space-y-5">
          {confirmation && (
            <p role="status" className="text-sm">
              {confirmation}
            </p>
          )}
          <fieldset disabled={pending} className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2 grid grid-cols-2 gap-3">
              <SupplierFields
                ruc={values.supplier_tax_id}
                name={values.supplier}
                disabled={pending}
                onChange={(supplier_tax_id, supplier) => {
                  setValues((v) => ({ ...v, supplier_tax_id, supplier }));
                  setError("");
                }}
              />
            </div>
            {(
              [
                ["plate", "Chapa"],
                ["invoice_number", "N.º de factura"],
                ["invoice_date", "Fecha de factura"],
              ] as const
            ).map(([key, label]) => (
              <div key={key} className="space-y-1">
                <Label htmlFor={"invoice-" + key}>{label}</Label>
                <Input
                  id={"invoice-" + key}
                  aria-invalid={errorField === key || undefined}
                  aria-describedby={
                    errorField === key ? "invoice-error" : undefined
                  }
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
                    disabled={pending}
                    type="button"
                    variant="outline"
                    className="w-full justify-start"
                    id="invoice-classification"
                    aria-describedby={
                      errorField === "classification"
                        ? "invoice-error"
                        : undefined
                    }
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
              <Label htmlFor="invoice-description">
                Descripción del trabajo
              </Label>
              <Textarea
                id="invoice-description"
                required
                maxLength={4000}
                rows={3}
                value={values.description}
                onChange={(e) => change("description", e.target.value)}
              />
            </div>
          </fieldset>
          <div className="space-y-1">
            <Label htmlFor="invoice-file">Archivo de factura</Label>
            <Input
              ref={input}
              id="invoice-file"
              aria-invalid={errorField === "file" || undefined}
              aria-describedby={
                errorField === "file" ? "invoice-error" : undefined
              }
              disabled={pending}
              type="file"
              accept="application/pdf,image/jpeg,image/png"
              required
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setError("");
              }}
            />
          </div>
          {reserved.current && (
            <p role="status" className="text-sm">
              Carga pendiente: {expectedFile.current?.name}. Seleccioná el
              archivo para reintentar.
            </p>
          )}
          {error && (
            <p
              id="invoice-error"
              role="alert"
              className="text-sm text-destructive"
            >
              {error}
            </p>
          )}
        </Body>
        <Footer className="flex justify-end gap-2">
          {reserved.current && (
            <Button
              disabled={pending}
              type="button"
              variant="outline"
              onClick={async () => {
                setPending(true);
                setError("");
                try {
                  await fleetRpc("fleet_discard_reserved_invoice", {
                    p_id: request.current,
                  });
                  reserved.current = false;
                  expectedFile.current = null;
                  request.current = crypto.randomUUID();
                  sessionStorage.removeItem(draftKey);
                  setValues({ ...empty, plate });
                  setFile(null);
                  if (input.current) input.current.value = "";
                } catch (e) {
                  setError(String((e as { message?: string }).message ?? e));
                } finally {
                  setPending(false);
                }
              }}
            >
              Descartar intento
            </Button>
          )}
          <Button disabled={pending} type="submit">
            {pending
              ? "Cargando…"
              : reserved.current
                ? "Reintentar carga"
                : "Cargar factura"}
          </Button>
        </Footer>
      </form>
    </Container>
  );
}
