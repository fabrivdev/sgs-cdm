import { useEffect, useId, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { searchWorkClients, type WorkClientGroup } from "@/lib/workClientSelection";
import type { ClientIdentityRow } from "@/lib/clientIdentity";

interface Props {
  value: string;
  selectedId: string;
  groups: WorkClientGroup[];
  disabled: boolean;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  onChange: (text: string, clientId: string) => void;
}

export function TrabajoClienteInput({ value, selectedId, groups, disabled, expanded, onExpandedChange: setExpanded, onChange }: Props) {
  const id = useId();
  const [activeClientId, setActiveClientId] = useState<string | null>(null);
  const activeOption = useRef<HTMLButtonElement>(null);
  const matches = searchWorkClients(groups, value, selectedId);
  const visible = matches.slice(0, 100);
  const active = visible.findIndex(option => option.client.id === activeClientId);
  useEffect(() => { activeOption.current?.scrollIntoView?.({ block: "nearest" }); }, [active]);
  const choose = (client: ClientIdentityRow) => {
    onChange(client.nombre, client.id);
    setExpanded(false);
    setActiveClientId(null);
  };

  return (
    <div className="space-y-1.5" onBlur={event => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setExpanded(false);
    }}>
      <Label htmlFor={id}>Cliente</Label>
      <Input
        id={id}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={expanded}
        aria-controls={`${id}-options`}
        aria-activedescendant={expanded && visible[active] ? `${id}-option-${active}` : undefined}
        autoComplete="off"
        value={value}
        disabled={disabled}
        onFocus={() => setExpanded(true)}
        onClick={() => setExpanded(true)}
        onChange={event => { onChange(event.target.value, ""); setExpanded(true); setActiveClientId(null); }}
        onKeyDown={event => {
          if (event.key === "Escape" && expanded) {
            event.preventDefault(); event.stopPropagation(); setExpanded(false); setActiveClientId(null);
          } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault(); setExpanded(true);
            const next = event.key === "ArrowDown" ? Math.min(active + 1, visible.length - 1) : Math.max(active - 1, 0);
            setActiveClientId(visible[next]?.client.id ?? null);
          } else if (event.key === "Enter" && expanded && visible[active]) {
            event.preventDefault(); choose(visible[active].client);
          }
        }}
        placeholder="Buscar o escribir cliente..."
      />
      {expanded && !disabled && (
        <div className="rounded-md border bg-popover">
          <ul id={`${id}-options`} role="listbox" aria-label="Clientes existentes" className="max-h-52 overflow-y-auto p-1">
            {visible.map(({ groupId, client, aliases }, index) => (
              <li key={groupId} role="presentation">
                <button type="button" role="option" id={`${id}-option-${index}`} tabIndex={-1}
                  ref={index === active ? activeOption : undefined}
                  aria-selected={index === active}
                  className={`min-h-11 w-full rounded px-2 py-2 text-left text-sm break-words hover:bg-accent ${index === active ? "bg-accent" : ""}`}
                  onMouseDown={event => event.preventDefault()}
                  onMouseEnter={() => setActiveClientId(client.id)}
                  onClick={() => choose(client)}>
                  <span className="block font-medium">{client.nombre}</span>
                  {(client.ruc || client.cod_entidad) && <span className="block text-xs text-muted-foreground">
                    {[client.ruc && `RUC ${client.ruc}`, client.cod_entidad && `Código ${client.cod_entidad}`].filter(Boolean).join(" · ")}
                  </span>}
                  {!!aliases.length && <span className="block text-xs text-muted-foreground">Otros nombres: {aliases.join(" · ")}</span>}
                </button>
              </li>
            ))}
          </ul>
          {!visible.length && <p className="px-3 py-2 text-xs text-muted-foreground">Sin coincidencias. Si el nombre es nuevo, se creará al guardar.</p>}
          {matches.length > visible.length && <p className="px-3 py-2 text-xs text-muted-foreground">Mostrando 100 coincidencias. Escribí más para acotar la búsqueda.</p>}
        </div>
      )}
      {selectedId && !value && <p className="text-xs text-muted-foreground">El cliente vinculado no está en el catálogo disponible. Se conserva su vínculo.</p>}
    </div>
  );
}
