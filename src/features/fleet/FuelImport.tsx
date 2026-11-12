import { useState } from "react";
import { toast } from "sonner";
import {
  ResponsiveDrawer,
  ResponsiveDrawerHeader,
  ResponsiveDrawerBody,
  ResponsiveDrawerFooter,
} from "@/components/ui/responsive-drawer";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { fleetRpc } from "./managementApi";
import { fmt } from "./workspaceModel";
export function FuelImport({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [file, setFile] = useState<File | null>(null),
    [currency, setCurrency] = useState(""),
    [rows, setRows] = useState<Record<string, unknown>[] | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function read() {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const XLSX = await import("xlsx"),
        { parseFuel } = await import("./workbookImports.mjs");
      if (file.size > 20 * 1024 * 1024) throw Error("El Excel supera 20 MB");
      setRows(
        parseFuel(
          XLSX.read(await file.arrayBuffer(), { type: "array" }),
          currency || null,
        ),
      );
    } catch (e) {
      setError(String((e as { message?: string }).message ?? e));
    } finally {
      setBusy(false);
    }
  }
  const missing = rows?.some((r) => !r.currency);
  return (
    <ResponsiveDrawer
      open
      onOpenChange={(v) => {
        if (!v && !busy) onClose();
      }}
      title="Importar combustible"
    >
      <ResponsiveDrawerHeader>
        <h2>Importar combustible</h2>
      </ResponsiveDrawerHeader>
      <ResponsiveDrawerBody className="space-y-3">
        <label className="block text-[11px]">
          Planilla
          <Input
            type="file"
            accept=".xlsx,.xls"
            disabled={busy}
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setRows(null);
            }}
          />
        </label>
        <label className="block text-[11px]">
          Moneda para filas sin moneda
          <select
            aria-label="Moneda para filas sin moneda"
            className="h-9 w-full rounded-md border bg-background"
            value={currency}
            disabled={busy}
            onChange={(e) => setCurrency(e.target.value)}
          >
            <option value="">Seleccionar</option>
            {["PYG", "USD", "BRL", "ARS", "EUR"].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        {rows && (
          <dl className="grid grid-cols-2 text-sm">
            <dt>Movimientos</dt>
            <dd>{rows.length}</dd>
            <dt>Litros netos</dt>
            <dd>{fmt(rows.reduce((n, r) => n + Number(r.liters), 0))}</dd>
          </dl>
        )}
        {missing && !currency && (
          <p role="alert" className="text-sm text-destructive">
            Elegí la moneda que falta en el archivo
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </ResponsiveDrawerBody>
      <ResponsiveDrawerFooter>
        <Button
          disabled={busy || !file || !!(rows && missing && !currency)}
          onClick={async () => {
            if (!rows) {
              await read();
              return;
            }
            setBusy(true);
            setError("");
            try {
              const inserted = await fleetRpc<number>(
                "fleet_import_fuel_entries",
                {
                  p_rows: rows.map((r) => ({
                    ...r,
                    currency: r.currency || currency,
                  })),
                },
              );
              toast.success(
                `Nuevos: ${inserted}. Ya registrados: ${rows.length - inserted}.`,
              );
              await onSaved();
              onClose();
            } catch (e) {
              setError(String((e as { message?: string }).message ?? e));
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Procesando…" : rows ? "Importar" : "Revisar archivo"}
        </Button>
      </ResponsiveDrawerFooter>
    </ResponsiveDrawer>
  );
}
