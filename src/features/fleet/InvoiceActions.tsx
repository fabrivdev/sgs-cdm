import { useEffect, useState, useRef } from "react";
import { MoreVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  ResponsiveDrawer,
  ResponsiveDrawerHeader,
  ResponsiveDrawerBody,
  ResponsiveDrawerFooter,
} from "@/components/ui/responsive-drawer";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  fleetRpc,
  replaceInvoiceFile,
  loadInvoiceAudit,
  invoiceUrl,
} from "./managementApi";
import { maintenanceCategories, type Invoice } from "./managementModel";

function auditValue(key: string, value: unknown) {
  if (value == null || value === "") return "—";
  if (key === "status")
    return (
      (
        {
          pending: "Incompleta",
          uploaded: "Completa",
          void: "Anulada",
        } as Record<string, string>
      )[String(value)] ?? String(value)
    );
  if (key === "invoice_date" || key === "performed_on")
    return String(value).split("-").reverse().join("/");
  return Array.isArray(value)
    ? value.join(", ")
    : typeof value === "number"
      ? value.toLocaleString("es-PY")
      : String(value);
}
export function InvoiceActions({
  invoice,
  onSaved,
  initialMode,
  onClose,
}: {
  invoice: Invoice;
  onSaved: () => Promise<void>;
  initialMode: "edit" | "file" | "void" | "audit";
  onClose: () => void;
}) {
  const [mode, setMode] = useState<"edit" | "file" | "void" | "audit" | null>(
    initialMode,
  );
  const [data, setData] = useState(invoice),
    [reason, setReason] = useState(""),
    [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [audit, setAudit] = useState<
    Awaited<ReturnType<typeof loadInvoiceAudit>>
  >([]);
  const request = useRef(crypto.randomUUID());
  useEffect(() => {
    if (initialMode !== "audit") return;
    let active = true;
    setBusy(true);
    loadInvoiceAudit(invoice.id)
      .then((rows) => {
        if (active) setAudit(rows);
      })
      .catch(() => {
        if (active) setError("No se pudo cargar el historial");
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [invoice.id, initialMode]);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (mode === "edit" && !data.categories.length) {
      setError("Seleccioná una clasificación");
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (mode === "file") {
        if (!file) throw Error("Seleccioná el archivo");
        await replaceInvoiceFile(request.current, invoice, file, reason);
      } else
        await fleetRpc("fleet_correct_invoice", {
          p_id: invoice.id,
          p_version: invoice.version ?? 1,
          p_data: data,
          p_reason: reason,
          p_void: mode === "void",
        });
      await onSaved();
      setMode(null);
    } catch (e) {
      setError(String((e as { message?: string }).message ?? e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <ResponsiveDrawer
        title={
          mode === "edit"
            ? "Corregir factura"
            : mode === "file"
              ? "Completar o reemplazar archivo"
              : mode === "void"
                ? "Anular factura"
                : "Cambios de factura"
        }
        size="xl"
        open={!!mode}
        onOpenChange={(v) => {
          if (!v && !busy) onClose();
        }}
      >
        <ResponsiveDrawerHeader>
          <h2 className="font-semibold">
            {mode === "edit"
              ? "Corregir factura"
              : mode === "file"
                ? "Completar o reemplazar archivo"
                : mode === "void"
                  ? "Anular factura"
                  : "Cambios de factura"}
          </h2>
        </ResponsiveDrawerHeader>
        {mode === "audit" ? (
          <ResponsiveDrawerBody className="space-y-3">
            {busy
              ? "Cargando…"
              : audit.length
                ? audit.map((a) => (
                    <div key={a.id} className="border-b py-2 text-sm">
                      <p>
                        {new Date(a.occurred_at).toLocaleString("es-PY")} ·{" "}
                        {a.actor_name ?? "—"} ·{" "}
                        {a.reason ?? "Registro de importe"}
                      </p>
                      <dl className="grid grid-cols-3 gap-2">
                        <dt>Campo</dt>
                        <dt>Anterior</dt>
                        <dt>Nuevo</dt>
                        {Object.keys(a.after_data)
                          .filter(
                            (k) =>
                              [
                                "performed_on",
                                "odometer_km",
                                "supplier_tax_id",
                                "plate",
                                "supplier",
                                "invoice_number",
                                "invoice_date",
                                "description",
                                "categories",
                                "amount",
                                "currency",
                                "status",
                                "filename",
                              ].includes(k) &&
                              JSON.stringify(a.before_data[k]) !==
                                JSON.stringify(a.after_data[k]),
                          )
                          .map((k) => (
                            <div key={k} className="contents">
                              <dt>
                                {
                                  (
                                    {
                                      performed_on: "Fecha del trabajo",
                                      odometer_km: "Kilometraje del trabajo",
                                      supplier_tax_id: "RUC",
                                      plate: "Chapa",
                                      supplier: "Proveedor",
                                      invoice_number: "N.º factura",
                                      invoice_date: "Fecha",
                                      description: "Descripción",
                                      categories: "Clasificación",
                                      amount: "Importe",
                                      currency: "Moneda",
                                      status: "Estado",
                                      filename: "Archivo",
                                    } as Record<string, string>
                                  )[k]
                                }
                              </dt>
                              <dd className="break-words">
                                {auditValue(k, a.before_data[k])}
                              </dd>
                              <dd className="break-words">
                                {auditValue(k, a.after_data[k])}
                              </dd>
                            </div>
                          ))}
                      </dl>
                      {a.before_data.storage_path && (
                        <Button
                          variant="link"
                          onClick={async () => {
                            const win = window.open("about:blank", "_blank");
                            if (!win) return;
                            win.opener = null;
                            try {
                              win.location.replace(
                                await invoiceUrl({
                                  storage_path: String(
                                    a.before_data.storage_path,
                                  ),
                                }),
                              );
                            } catch {
                              win.close();
                              setError("No se pudo abrir el archivo");
                            }
                          }}
                        >
                          Archivo anterior
                        </Button>
                      )}
                    </div>
                  ))
                : "Sin cambios registrados"}
            {error && <p role="alert">{error}</p>}
          </ResponsiveDrawerBody>
        ) : (
          <form onSubmit={save} className="flex min-h-0 flex-1 flex-col">
            <ResponsiveDrawerBody className="space-y-4">
              <fieldset disabled={busy} className="space-y-4">
                {mode === "edit" && (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      {(
                        [
                          "plate",
                          "supplier",
                          "invoice_number",
                          "invoice_date",
                        ] as const
                      ).map((k, i) => (
                        <div key={k}>
                          <Label htmlFor={"correction-" + k}>
                            {
                              [
                                "Chapa",
                                "Proveedor",
                                "N.º factura",
                                "Fecha de factura",
                              ][i]
                            }
                          </Label>
                          <Input
                            id={"correction-" + k}
                            required
                            type={k === "invoice_date" ? "date" : "text"}
                            value={data[k]}
                            onChange={(e) =>
                              setData({ ...data, [k]: e.target.value })
                            }
                          />
                        </div>
                      ))}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label htmlFor="performed-on">Fecha del trabajo</Label>
                        <Input
                          id="performed-on"
                          type="date"
                          value={data.performed_on ?? ""}
                          onChange={(e) =>
                            setData({
                              ...data,
                              performed_on: e.target.value || null,
                            })
                          }
                        />
                      </div>
                      <div>
                        <Label htmlFor="work-odometer">
                          Kilometraje del trabajo
                        </Label>
                        <Input
                          id="work-odometer"
                          type="number"
                          min="0"
                          step="1"
                          value={data.odometer_km ?? ""}
                          onChange={(e) =>
                            setData({
                              ...data,
                              odometer_km:
                                e.target.value === ""
                                  ? null
                                  : Number(e.target.value),
                            })
                          }
                        />
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="correction-ruc">RUC del proveedor</Label>
                      <Input
                        id="correction-ruc"
                        required
                        pattern="[0-9][0-9 .-]{2,19}"
                        maxLength={20}
                        value={data.supplier_tax_id ?? ""}
                        onChange={(e) =>
                          setData({ ...data, supplier_tax_id: e.target.value })
                        }
                      />
                    </div>
                    <fieldset>
                      <legend className="text-sm">Clasificación</legend>
                      <div className="grid grid-cols-2 gap-2">
                        {maintenanceCategories.map((c) => (
                          <label key={c} className="flex gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={data.categories.includes(c)}
                              onChange={(e) =>
                                setData({
                                  ...data,
                                  categories: e.target.checked
                                    ? [...data.categories, c]
                                    : data.categories.filter((x) => x !== c),
                                })
                              }
                            />
                            {c}
                          </label>
                        ))}
                      </div>
                    </fieldset>
                    <Label htmlFor="correction-description">
                      Descripción del trabajo
                    </Label>
                    <Textarea
                      id="correction-description"
                      required
                      maxLength={4000}
                      value={data.description}
                      onChange={(e) =>
                        setData({ ...data, description: e.target.value })
                      }
                    />
                  </>
                )}
                {mode === "file" && (
                  <div>
                    <Label htmlFor="replacement-file">Archivo de factura</Label>
                    <Input
                      id="replacement-file"
                      type="file"
                      accept="application/pdf,image/jpeg,image/png"
                      required
                      onChange={(e) => {
                        setFile(e.target.files?.[0] ?? null);
                        request.current = crypto.randomUUID();
                      }}
                    />
                  </div>
                )}
                <div>
                  <Label htmlFor="correction-reason">Motivo</Label>
                  <Textarea
                    id="correction-reason"
                    required
                    maxLength={1000}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </div>
              </fieldset>
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
            </ResponsiveDrawerBody>
            <ResponsiveDrawerFooter>
              <Button disabled={busy} type="submit">
                {busy
                  ? "Guardando…"
                  : mode === "void"
                    ? "Anular factura"
                    : "Guardar"}
              </Button>
            </ResponsiveDrawerFooter>
          </form>
        )}
      </ResponsiveDrawer>
    </>
  );
}

export function InvoiceActionMenu({
  invoice,
  onSelect,
}: {
  invoice: Invoice;
  onSelect: (mode: "edit" | "file" | "void" | "audit") => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon" variant="outline" aria-label="Acciones de factura">
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {invoice.status !== "void" && (
          <>
            <DropdownMenuItem onSelect={() => onSelect("edit")}>
              Corregir datos
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onSelect("file")}>
              {invoice.status === "pending"
                ? "Completar carga"
                : "Reemplazar archivo"}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onSelect("void")}>
              Anular factura
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuItem onSelect={() => onSelect("audit")}>
          Ver cambios y archivos anteriores
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
