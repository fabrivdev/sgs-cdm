import { useId, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  fleetResponsibleName,
  structuredResponsibleName,
  personKey,
} from "./responsibleNames";
import type { FleetResponsibleCandidate } from "./model";
export function ResponsiblePicker({
  value,
  candidates,
  onChange,
  newNames,
  newSurnames,
  onQueryState,
}: {
  value: string;
  candidates: FleetResponsibleCandidate[];
  onChange: (value: string) => void;
  newNames: string;
  newSurnames: string;
  onQueryState: (dirty: boolean) => void;
}) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const current = candidates.find((p) => p.id === value);
  const label =
    value === "__new__"
      ? structuredResponsibleName(newNames, newSurnames) || "Nuevo responsable"
      : current
        ? fleetResponsibleName(current.nombre, current.short_name)
        : "Sin responsable";
  const matches = candidates.filter((p) =>
    personKey(
      p.nombre + " " + fleetResponsibleName(p.nombre, p.short_name),
    ).includes(personKey(query)),
  );
  const options = [
    ...(!query ? [{ id: "", label: "Sin responsable", full: "" }] : []),
    ...matches.map((p) => ({
      id: p.id,
      label: fleetResponsibleName(p.nombre, p.short_name),
      full: p.nombre,
    })),
    { id: "__new__", label: "Agregar nuevo responsable", full: "" },
  ];
  function choose(next: string) {
    onChange(next);
    setOpen(false);
    setQuery("");
    setEditing(false);
    onQueryState(false);
  }
  return (
    <>
      <div className="relative">
        <Label htmlFor="vehicle-responsible">Responsable</Label>
        <Input
          id="vehicle-responsible"
          role="combobox"
          onClick={() => setOpen(true)}
          autoComplete="off"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={open ? id : undefined}
          aria-activedescendant={open ? id + "-" + active : undefined}
          value={editing ? query : label}
          title={current?.nombre}
          onFocus={(e) => {
            e.target.select();
            setOpen(true);
            setActive(0);
          }}
          onBlur={() => {
            setOpen(false);
          }}
          onChange={(e) => {
            setEditing(true);
            setQuery(e.target.value);
            setOpen(true);
            setActive(0);
            onQueryState(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              setOpen(true);
              setActive(
                (i) =>
                  (i + (e.key === "ArrowDown" ? 1 : -1) + options.length) %
                  options.length,
              );
            }
            if (e.key === "Enter" && open) {
              e.preventDefault();
              choose(options[active]?.id ?? "");
            }
            if (e.key === "Escape" && open) {
              e.preventDefault();
              e.stopPropagation();
              setOpen(false);
              setQuery("");
              setEditing(false);
              onQueryState(false);
            }
          }}
        />
        {open && (
          <ul
            role="listbox"
            id={id}
            aria-label="Responsables"
            className="absolute z-30 max-h-60 w-full overflow-auto rounded-md border bg-popover shadow-md"
          >
            {options.map((p, i) => (
              <li
                role="option"
                id={id + "-" + i}
                key={p.id}
                aria-selected={i === active}
                title={p.full}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(p.id)}
                className={
                  "cursor-pointer px-3 py-2 text-sm hover:bg-accent " +
                  (i === active ? "bg-accent" : "")
                }
              >
                {p.label}
                {p.full &&
                  options.filter((o) => o.label === p.label).length > 1 && (
                    <span className="block text-xs text-muted-foreground">
                      {p.full}
                    </span>
                  )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
