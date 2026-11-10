import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { GroupWork, MaintenanceGroup } from "./maintenanceGroups";
export function MaintenanceGroupCell({
  group,
  works,
  invoiceDescription,
}: {
  group: MaintenanceGroup;
  works: GroupWork[];
  invoiceDescription?: string;
}) {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout>>();
  const cancelClose = () => clearTimeout(closeTimer.current);
  const show = () => {
    cancelClose();
    setOpen(true);
  };
  const hideSoon = () => {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), 180);
  };
  useEffect(() => () => clearTimeout(closeTimer.current), []);
  if (!works.length)
    return <span className="block text-center text-muted-foreground">—</span>;
  return (
    <div className="flex justify-center" onClick={(e) => e.stopPropagation()}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={"Consultar " + group}
            className="inline-flex h-7 w-7 items-center justify-center rounded text-primary hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={(event) => {
              event.preventDefault();
              show();
            }}
            onMouseEnter={show}
            onMouseLeave={hideSoon}
            onFocus={show}
          >
            <Check className="h-4 w-4" aria-hidden="true" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          aria-label={group + " registrados"}
          className="max-h-80 w-80 overflow-y-auto whitespace-normal text-xs"
          onMouseEnter={cancelClose}
          onMouseLeave={hideSoon}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          <h3 className="mb-2 font-semibold">{group}</h3>
          <ul className="space-y-2">
            {works.map((work, index) => (
              <li key={index}>
                <div className="flex items-start gap-2">
                  <Check
                    className="mt-0.5 h-3 w-3 shrink-0 text-primary"
                    aria-hidden="true"
                  />
                  <span>{work.name}</span>
                </div>
                {work.observation && (
                  <p className="ml-5 mt-1 text-muted-foreground">
                    {work.observation}
                  </p>
                )}
              </li>
            ))}
          </ul>
          {invoiceDescription && (
            <div className="mt-3 border-t pt-2">
              <p className="mb-1 font-medium">Descripción de la factura</p>
              <p>{invoiceDescription}</p>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
