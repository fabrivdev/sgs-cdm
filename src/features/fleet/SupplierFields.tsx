import { useEffect, useId, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fleetRpc } from "./managementApi";
export interface SupplierSuggestion {
  ruc: string;
  razon_social: string;
}
export function SupplierFields({
  ruc,
  name,
  onChange,
  disabled = false,
  idPrefix = "invoice",
}: {
  ruc: string;
  name: string;
  onChange: (ruc: string, name: string) => void;
  disabled?: boolean;
  idPrefix?: string;
}) {
  const listId = useId();
  const [rows, setRows] = useState<SupplierSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [status, setStatus] = useState("");
  const [manualRuc, setManualRuc] = useState<string | null>(null);
  const manual = manualRuc === ruc && /^[0-9][0-9 .-]{2,19}$/.test(ruc);
  useEffect(() => {
    let current = true;
    setManualRuc(null);
    setRows([]);
    setActive(-1);
    setStatus("");
    if (disabled || ruc.replace(/\D/g, "").length < 3) return;
    setStatus("Buscando…");
    const timer = setTimeout(() => {
      Promise.all([
        fleetRpc<SupplierSuggestion[]>("fleet_search_suppliers", {
          p_ruc: ruc,
        }),
        fleetRpc<SupplierSuggestion[]>("fleet_supplier_identity", {
          p_ruc: ruc,
        }),
      ])
        .then(([result, exact]) => {
          if (current) {
            setRows(result);
            setManualRuc(exact.length === 0 ? ruc : null);
            setStatus(result.length ? "" : "Sin coincidencias en el maestro");
          }
        })
        .catch(() => {
          if (current)
            setStatus(
              "No se pudo consultar el maestro. Volvé a escribir el RUC para reintentar.",
            );
        });
    }, 250);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [ruc, disabled]);
  function select(row: SupplierSuggestion) {
    onChange(row.ruc, row.razon_social);
    setOpen(false);
  }
  return (
    <>
      <div className="relative space-y-1">
        <Label htmlFor={idPrefix + "-supplier_tax_id"}>RUC del proveedor</Label>
        <Input
          id={idPrefix + "-supplier_tax_id"}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open && rows.length > 0}
          aria-controls={open && rows.length ? listId : undefined}
          aria-activedescendant={
            active >= 0 ? listId + "-" + active : undefined
          }
          value={ruc}
          disabled={disabled}
          required
          maxLength={20}
          autoComplete="off"
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onChange={(e) => {
            onChange(e.target.value, "");
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape" && open) {
              e.preventDefault();
              e.stopPropagation();
              setOpen(false);
            }
            if (e.key === "ArrowDown" && rows.length) {
              e.preventDefault();
              setActive((i) => (i + 1) % rows.length);
            }
            if (e.key === "ArrowUp" && rows.length) {
              e.preventDefault();
              setActive((i) => (i - 1 + rows.length) % rows.length);
            }
            if (e.key === "Enter" && open && active >= 0) {
              e.preventDefault();
              select(rows[active]);
            }
          }}
        />
        {open && rows.length > 0 && (
          <ul
            id={listId}
            role="listbox"
            aria-label="Proveedores"
            className="absolute left-0 right-0 z-30 max-h-60 overflow-auto rounded-md border bg-popover shadow-md"
          >
            {rows.map((row, i) => (
              <li
                key={row.ruc + row.razon_social}
                id={listId + "-" + i}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => select(row)}
                className={
                  "cursor-pointer px-3 py-2 text-sm hover:bg-accent " +
                  (i === active ? "bg-accent" : "")
                }
              >
                <span className="font-medium">{row.ruc}</span>
                <span className="ml-2">{row.razon_social}</span>
              </li>
            ))}
          </ul>
        )}
        {(open || status.startsWith("No se pudo")) && status && (
          <p role="status" className="text-sm text-muted-foreground">
            {status}
          </p>
        )}
      </div>
      <div className="space-y-1">
        <Label htmlFor={idPrefix + "-supplier"}>Proveedor</Label>
        <Input
          id={idPrefix + "-supplier"}
          value={name}
          readOnly={!manual}
          disabled={disabled}
          onChange={(e) => onChange(ruc, e.target.value)}
          required
          maxLength={200}
          className={manual ? undefined : "bg-muted/30"}
        />
      </div>
    </>
  );
}
