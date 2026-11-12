import { formatInvoiceNumber, guideInvoiceNumber } from "./invoiceNumber";
import { InvoicePlateField } from "./InvoicePlateField";
import { SupplierFields, type SupplierSuggestion } from "./SupplierFields";
import { extractFleetInvoice } from "./invoiceExtraction";
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
import { toast } from "sonner";
import {
  maintenanceCategories,
  invoiceValidation,
  isFleetBuyerRuc,
} from "./managementModel";
import { submitInvoice, fleetRpc } from "./managementApi";
const empty = {
  plate: "",
  supplier: "",
  supplier_tax_id: "",
  invoice_number: "",
  invoice_date: "",
  odometer_km: "",
  performed_on: "",
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
  const [values, setValues] = useState({ ...empty, plate, ...draft?.values }),
    [file, setFile] = useState<File | null>(null),
    [pending, setPending] = useState(false),
    [error, setError] = useState("");
  const request = useRef(draft?.id ?? crypto.randomUUID()),
    reserved = useRef(draft?.reserved ?? false),
    input = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState(false);
  const [readingMessage, setReadingMessage] = useState("");
  const extracted = useRef<Partial<typeof empty>>({});
  const latestValues = useRef(values);
  latestValues.current = values;
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
  useEffect(() => {
    if (!file || reserved.current) return;
    let current = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 90_000);
    setReading(true);
    setReadingMessage("");

    async function read(selected: File) {
      try {
        const fields = await extractFleetInvoice(selected, controller.signal);
        if (!current) return;
        if (fields.supplier_tax_id) {
          const [match] = await fleetRpc<SupplierSuggestion[]>(
            "fleet_supplier_identity",
            {
              p_ruc: fields.supplier_tax_id,
            },
          ).catch(() => []);
          if (match) {
            fields.supplier_tax_id = match.ruc;
            fields.supplier = match.razon_social;
          }
        }
        if (!current) return;
        const previous = latestValues.current;
        const applied: Partial<typeof empty> = {};
        for (const key of [
          "plate",
          "invoice_number",
          "invoice_date",
          "odometer_km",
          "performed_on",
          "description",
        ] as const) {
          if (!previous[key] && fields[key]) applied[key] = fields[key];
        }
        if (
          ((!previous.supplier_tax_id && !previous.supplier) ||
            isFleetBuyerRuc(previous.supplier_tax_id)) &&
          fields.supplier_tax_id
        ) {
          applied.supplier_tax_id = fields.supplier_tax_id;
          applied.supplier = fields.supplier;
        }
        if (!previous.categories.length && fields.categories.length)
          applied.categories = fields.categories;
        extracted.current = applied;
        setValues((previous) => ({ ...previous, ...applied }));
        setReadingMessage(
          Object.keys(applied).length
            ? "Revisá los datos completados y los campos que falten."
            : "No se agregaron datos automáticamente. Revisá el formulario.",
        );
      } catch {
        if (current)
          setReadingMessage(
            "No se pudo leer la factura. Podés completar los datos manualmente.",
          );
      } finally {
        window.clearTimeout(timeout);
        if (current) setReading(false);
      }
    }
    void read(file);
    return () => {
      current = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [file]);
  const errorField = /número|formato/i.test(error)
    ? "invoice_number"
    : /RUC/i.test(error)
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
    if (pending || reading) return;
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
    if (isFleetBuyerRuc(values.supplier_tax_id)) {
      setError(
        "Ingresá el RUC del proveedor. El RUC de Campos del Mañana corresponde al comprador.",
      );
      return;
    }
    if (!values.supplier.trim()) {
      setError(
        "Completá el proveedor: seleccioná una coincidencia o ingresá el nombre si el RUC no está en el maestro",
      );
      return;
    }
    if (values.odometer_km && !/^[0-9]{1,15}$/.test(values.odometer_km)) {
      setError("Ingresá un kilometraje entero y mayor o igual a cero.");
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
      extracted.current = {};
      setReadingMessage("");
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
                const previousExtraction = extracted.current;
                extracted.current = {};
                setReading(false);
                setReadingMessage("");
                setValues((previous) => {
                  const next = { ...previous };
                  for (const key of [
                    "plate",
                    "invoice_number",
                    "invoice_date",
                    "odometer_km",
                    "performed_on",
                    "description",
                  ] as const) {
                    if (previous[key] === previousExtraction[key])
                      next[key] = empty[key];
                  }
                  if (
                    previous.supplier_tax_id ===
                      previousExtraction.supplier_tax_id &&
                    previous.supplier === previousExtraction.supplier
                  ) {
                    next.supplier_tax_id = "";
                    next.supplier = "";
                  }
                  if (previous.categories === previousExtraction.categories)
                    next.categories = [];
                  return next;
                });
                setFile(e.target.files?.[0] ?? null);
                setError("");
              }}
            />
            {!file && (
              <p className="text-sm text-muted-foreground">
                Al adjuntar el archivo, Gemini lee la factura para completar los
                campos.
              </p>
            )}
            {(reading || readingMessage) && (
              <p role="status" className="text-sm text-muted-foreground">
                {reading ? "Leyendo factura…" : readingMessage}
              </p>
            )}
          </div>
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
            <InvoicePlateField
              value={values.plate}
              disabled={pending}
              invalid={errorField === "plate"}
              onChange={(value) => change("plate", value)}
            />
            {(
              [
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
                  maxLength={key === "invoice_number" ? 15 : undefined}
                  placeholder={
                    key === "invoice_number" ? "001-001-0000001" : undefined
                  }
                  pattern={
                    key === "invoice_number"
                      ? "[0-9]{3}-[0-9]{3}-[0-9]{7}"
                      : undefined
                  }
                  title={
                    key === "invoice_number"
                      ? "Completá el número: 001-001-0000001"
                      : undefined
                  }
                  onBlur={() => {
                    if (key === "invoice_number")
                      change(key, formatInvoiceNumber(values[key]));
                  }}
                  value={values[key]}
                  onChange={(e) =>
                    change(
                      key,
                      key === "invoice_number"
                        ? guideInvoiceNumber(e.target.value)
                        : e.target.value,
                    )
                  }
                />
              </div>
            ))}
            <div className="space-y-1">
              <Label htmlFor="invoice-odometer_km">
                Kilometraje del trabajo
              </Label>
              <Input
                id="invoice-odometer_km"
                inputMode="numeric"
                pattern="[0-9]{1,15}"
                maxLength={15}
                value={values.odometer_km}
                onChange={(e) => change("odometer_km", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="invoice-performed_on">Fecha del trabajo</Label>
              <Input
                id="invoice-performed_on"
                type="date"
                value={values.performed_on}
                onChange={(e) => change("performed_on", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="invoice-classification">Clasificación</Label>
              <select
                id="invoice-classification"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-invalid={errorField === "classification" || undefined}
                aria-describedby={
                  errorField === "classification" ? "invoice-error" : undefined
                }
                value=""
                onChange={(e) => {
                  const category = e.target.value;
                  if (category && !values.categories.includes(category))
                    change("categories", [...values.categories, category]);
                }}
              >
                <option value="" disabled>
                  {values.categories.length
                    ? "Agregar otra clasificación"
                    : "Seleccionar"}
                </option>
                {maintenanceCategories.map((category) => (
                  <option
                    key={category}
                    value={category}
                    disabled={values.categories.includes(category)}
                  >
                    {category}
                  </option>
                ))}
              </select>
              {values.categories.length > 0 && (
                <ul className="flex flex-wrap gap-1.5 pt-1">
                  {values.categories.map((category) => (
                    <li
                      key={category}
                      className="inline-flex items-center gap-1 rounded-md bg-muted px-2 text-sm"
                    >
                      {category}
                      <button
                        type="button"
                        aria-label={`Quitar ${category}`}
                        className="px-1 py-0.5"
                        onClick={() =>
                          change(
                            "categories",
                            values.categories.filter(
                              (value) => value !== category,
                            ),
                          )
                        }
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              )}
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
          <Button disabled={pending || reading} type="submit">
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
