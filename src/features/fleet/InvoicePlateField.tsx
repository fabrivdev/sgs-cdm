import { useEffect, useId, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fleetRpc } from "./managementApi";
import { normalizePlate } from "./model";

export function InvoicePlateField({
  value,
  disabled,
  invalid,
  onChange,
}: {
  value: string;
  disabled: boolean;
  invalid: boolean;
  onChange: (value: string) => void;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [result, setResult] = useState<{ query: string; plates: string[] }>();
  const query = normalizePlate(value);
  const plates =
    open && !disabled && result?.query === query ? result.plates : [];

  useEffect(() => {
    if (!open || disabled || query.length < 2 || query.length > 12) return;
    let current = true;
    const timer = setTimeout(() => {
      fleetRpc<{ plate: string }[]>("fleet_search_invoice_plates", {
        p_plate: query,
      })
        .then((rows) => {
          if (current)
            setResult({
              query,
              plates: rows.map((row) => normalizePlate(row.plate)),
            });
        })
        .catch(() => {
          if (current) setResult(undefined);
        });
    }, 250);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [query, open, disabled]);

  function choose(plate: string) {
    onChange(plate);
    setActive(-1);
    setOpen(false);
  }

  return (
    <div className="relative space-y-1">
      <Label htmlFor="invoice-plate">Chapa</Label>
      <Input
        id="invoice-plate"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={plates.length > 0}
        aria-controls={plates.length ? id : undefined}
        aria-activedescendant={plates[active] ? id + "-" + active : undefined}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? "invoice-error" : undefined}
        autoComplete="off"
        maxLength={20}
        required
        disabled={disabled}
        value={value}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          setActive(-1);
          setOpen(false);
        }}
        onChange={(event) => {
          onChange(event.target.value);
          setActive(-1);
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape" && plates.length) {
            event.preventDefault();
            event.stopPropagation();
            setOpen(false);
            setActive(-1);
          }
          if (!plates.length) return;
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            const direction = event.key === "ArrowDown" ? 1 : -1;
            setActive((index) =>
              index < 0 && direction < 0
                ? plates.length - 1
                : (index + direction + plates.length) % plates.length,
            );
          }
          if (event.key === "Enter" && plates[active]) {
            event.preventDefault();
            choose(plates[active]);
          }
        }}
      />
      {plates.length > 0 && (
        <ul
          id={id}
          role="listbox"
          aria-label="Chapas de la flota"
          className="absolute inset-x-0 z-30 max-h-60 overflow-auto rounded-md border bg-popover shadow-md"
        >
          {plates.map((plate, index) => (
            <li
              key={plate}
              id={id + "-" + index}
              role="option"
              aria-selected={index === active}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(plate)}
              className={
                "cursor-pointer px-3 py-2 text-sm hover:bg-accent " +
                (index === active ? "bg-accent" : "")
              }
            >
              {plate}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
