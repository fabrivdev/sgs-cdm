import { readableWork, workObservation } from "./maintenancePresentation";
import { moneyCell } from "./workspaceModel";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ResponsiveDrawer,
  ResponsiveDrawerHeader,
  ResponsiveDrawerBody,
  ResponsiveDrawerFooter,
} from "@/components/ui/responsive-drawer";
import { toast } from "sonner";
import { InvoiceActions, InvoiceActionMenu } from "./InvoiceActions";
import { fleetRpc } from "./managementApi";
import { openStoredDocument } from "@/components/StoredDocumentViewer";
import {
  ManagementTable,
  type GridRow,
  type GridField,
} from "./ManagementTable";
import type { ManagementData } from "./VehiclesList";
import type { Invoice } from "./managementModel";
const show = (v: unknown) =>
  v == null || v === ""
    ? "—"
    : typeof v === "object"
      ? JSON.stringify(v)
      : String(v);
const columns: GridField[] = [
  ["date", "Fecha"],
  ["plate", "Chapa"],
  ["type", "Origen"],
  ["classification", "Descripción"],
  ["station", "Estación"],
  ["km", "Kilometraje"],
  ["liters", "Litros"],
  ["amount", "Importe"],
  ["currency", "Moneda"],
  ["supplier", "Proveedor"],
  ["invoice", "Factura"],
  ["description", "Descripción"],
  ["status", "Estado"],
];
export function ExpenseDetails({
  data,
  detail,
  onClose,
  refresh,
  vehicle,
  onVehicle: openVehicle,
}: {
  data: ManagementData;
  detail: GridRow | null;
  onClose: () => void;
  refresh: () => Promise<void>;
  vehicle?: string;
  onVehicle: (id: string) => void;
}) {
  const selectedInvoice = data.invoices.find((r) => r.id === detail?.id),
    selectedHistory = data.history.find((r) => r.id === detail?.id),
    selectedFuel = data.fuel.find((r) => r.id === detail?.id);
  const setDetail = (_value: null) => onClose();
  const [amountInvoice, setAmountInvoice] = useState<Invoice | null>(null),
    [amount, setAmount] = useState(""),
    [currency, setCurrency] = useState(""),
    [reason, setReason] = useState(""),
    [saving, setSaving] = useState(false);
  const [invoiceAction, setInvoiceAction] = useState<{
    invoice: Invoice;
    mode: "edit" | "file" | "void" | "audit";
  } | null>(null);
  return (
    <>
      {invoiceAction && (
        <InvoiceActions
          invoice={invoiceAction.invoice}
          initialMode={invoiceAction.mode}
          onClose={() => setInvoiceAction(null)}
          onSaved={async () => {
            await refresh();
            setInvoiceAction(null);
          }}
        />
      )}
      <ResponsiveDrawer
        title={
          selectedInvoice
            ? "Factura"
            : selectedHistory
              ? "Mantenimiento"
              : "Carga de combustible"
        }
        size="xl"
        open={!!detail}
        onOpenChange={(open) => {
          if (!open) setDetail(null);
        }}
      >
        <ResponsiveDrawerHeader>
          <h2 className="font-semibold">
            {selectedInvoice
              ? "Factura"
              : selectedHistory
                ? "Mantenimiento"
                : "Carga de combustible"}
          </h2>
        </ResponsiveDrawerHeader>
        <ResponsiveDrawerBody className="space-y-4">
          <dl className="grid grid-cols-2 gap-3 text-sm">
            {detail &&
              Object.entries(detail)
                .filter(
                  ([k]) =>
                    k !== "id" &&
                    k !== "sourcePlate" &&
                    !k.startsWith("group") &&
                    k !== "currency" &&
                    !(
                      selectedInvoice &&
                      ["classification", "description"].includes(k)
                    ) &&
                    !(
                      selectedHistory &&
                      (k.startsWith("work") ||
                        [
                          "invoice_date",
                          "performed",
                          "description",
                          "status",
                          "amount",
                          "km",
                        ].includes(k))
                    ),
                )
                .map(([key, value]) => (
                  <div key={key}>
                    <dt className="text-muted-foreground">
                      {columns.find((c) => c[0] === key)?.[1] ??
                        (
                          {
                            invoice_date: "Fecha de factura",
                            performed: "Fecha del trabajo",
                          } as Record<string, string>
                        )[key] ??
                        key}
                    </dt>
                    <dd>
                      {key === "amount"
                        ? moneyCell(
                            value as number | null,
                            detail.currency as string | null,
                          )
                        : ["date", "invoice_date", "performed"].includes(key)
                          ? show(value)
                              .slice(0, 10)
                              .split("-")
                              .reverse()
                              .join("/")
                          : typeof value === "number"
                            ? value.toLocaleString("es-PY")
                            : show(value)}
                    </dd>
                  </div>
                ))}
          </dl>
          {!vehicle &&
            (selectedInvoice?.vehicle_id ||
              selectedHistory?.vehicle_id ||
              selectedFuel?.vehicle_id) && (
              <Button
                variant="link"
                onClick={() =>
                  openVehicle(
                    (selectedInvoice?.vehicle_id ||
                      selectedHistory?.vehicle_id ||
                      selectedFuel?.vehicle_id)!,
                  )
                }
              >
                Ver vehículo
              </Button>
            )}
          {selectedInvoice && (
            <>
              <dl className="grid grid-cols-2 gap-3">
                <div>
                  <dt>RUC del proveedor</dt>
                  <dd>{selectedInvoice.supplier_tax_id ?? "—"}</dd>
                </div>
                <div>
                  <dt>Fecha de factura</dt>
                  <dd>
                    {selectedInvoice.invoice_date
                      .split("-")
                      .reverse()
                      .join("/")}
                  </dd>
                </div>
                <div>
                  <dt>Fecha del trabajo</dt>
                  <dd>
                    {selectedInvoice.performed_on
                      ?.split("-")
                      .reverse()
                      .join("/") ?? "—"}
                  </dd>
                </div>
                <div>
                  <dt>Kilometraje del trabajo</dt>
                  <dd>
                    {selectedInvoice.odometer_km?.toLocaleString("es-PY") ??
                      "—"}
                  </dd>
                </div>
                <div>
                  <dt>Clasificación</dt>
                  <dd>{selectedInvoice.categories.join(", ")}</dd>
                </div>
                <div>
                  <dt>Descripción del trabajo</dt>
                  <dd>{selectedInvoice.description}</dd>
                </div>
              </dl>
              <div className="flex gap-3">
                <InvoiceActionMenu
                  invoice={selectedInvoice}
                  onSelect={(mode) => {
                    setInvoiceAction({ invoice: selectedInvoice, mode });
                    setDetail(null);
                  }}
                />
                <Button
                  className={
                    selectedInvoice.status !== "uploaded" ? "hidden" : undefined
                  }
                  onClick={() =>
                    openStoredDocument(
                      "fleet-invoices",
                      selectedInvoice.storage_path,
                      selectedInvoice.filename,
                    )
                  }
                >
                  Abrir factura
                </Button>
                <Button
                  variant="outline"
                  className={
                    selectedInvoice.status !== "uploaded" ? "hidden" : undefined
                  }
                  onClick={() => {
                    setAmountInvoice(selectedInvoice);
                    setReason("");
                    setDetail(null);
                    setAmount(
                      selectedInvoice.amount == null
                        ? ""
                        : String(selectedInvoice.amount),
                    );
                    setCurrency(selectedInvoice.currency ?? "");
                  }}
                >
                  Registrar importe
                </Button>
              </div>
            </>
          )}
          {selectedHistory && (
            <>
              <dl className="grid grid-cols-2 text-sm">
                <dt>Kilometraje del trabajo</dt>
                <dd>
                  {selectedHistory.odometer_km?.toLocaleString("es-PY") ?? "—"}
                </dd>
              </dl>
              <ManagementTable
                label="Trabajos"
                showRowCount={false}
                actionsTarget={null}
                render={{
                  work: (r) => (
                    <span title={readableWork(String(r.work))}>
                      {readableWork(String(r.work))}
                    </span>
                  ),
                  comment: (r) => (
                    <span className="block whitespace-normal">
                      {r.comment || "—"}
                    </span>
                  ),
                }}
                fields={[
                  ["work", "Trabajo"],
                  ["comment", "Observaciones"],
                ]}
                rows={selectedHistory.works.map((w, i) => ({
                  id: String(i),
                  work: w.work,
                  comment: workObservation(w),
                }))}
              />
            </>
          )}
          {selectedFuel && (
            <ManagementTable
              label="Detalle de carga"
              fields={[
                ["field", "Campo"],
                ["value", "Valor"],
              ]}
              rows={Object.entries(selectedFuel.raw_data).map(
                ([key, value]) => ({ id: key, field: key, value: show(value) }),
              )}
            />
          )}
        </ResponsiveDrawerBody>
      </ResponsiveDrawer>
      <ResponsiveDrawer
        title="Importe de factura"
        open={!!amountInvoice}
        onOpenChange={(open) => {
          if (!open && !saving) setAmountInvoice(null);
        }}
      >
        <ResponsiveDrawerHeader>
          <h2 className="font-semibold">Importe de factura</h2>
        </ResponsiveDrawerHeader>
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={async (e) => {
            e.preventDefault();
            if (saving) return;
            if (!Number.isFinite(Number(amount)) || Number(amount) < 0) {
              toast.error("El importe debe ser mayor o igual a cero");
              return;
            }
            setSaving(true);
            try {
              await fleetRpc("fleet_set_invoice_amount", {
                p_id: amountInvoice!.id,
                p_amount: Number(amount),
                p_currency: currency,
                p_version: amountInvoice!.version ?? 1,
                p_reason: reason,
              });
              await refresh();
              setAmountInvoice(null);
            } catch (e) {
              toast.error(show((e as { message?: string }).message));
              void refresh();
            } finally {
              setSaving(false);
            }
          }}
        >
          <ResponsiveDrawerBody className="space-y-3">
            <Label htmlFor="amount">Importe</Label>
            <Input
              disabled={saving}
              id="amount"
              type="number"
              step="0.01"
              min="0"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <Label htmlFor="currency">Moneda</Label>
            <Input
              disabled={saving}
              id="currency"
              pattern="[A-Z]{3}"
              required
              maxLength={3}
              value={currency}
              onChange={(e) => setCurrency(e.target.value.toUpperCase())}
            />
            <Label htmlFor="amount-reason">Motivo</Label>
            <Input
              disabled={saving}
              id="amount-reason"
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </ResponsiveDrawerBody>
          <ResponsiveDrawerFooter>
            <Button disabled={saving}>Guardar</Button>
          </ResponsiveDrawerFooter>
        </form>
      </ResponsiveDrawer>
    </>
  );
}
