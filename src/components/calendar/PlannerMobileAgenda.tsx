import type { ReactNode } from "react";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { CompactListOrderMenu } from "@/components/lists/CompactListTable";
import { EstadoBadge } from "@/components/StatusBadges";
import type { SalesColumn, SalesSort } from "@/components/ventas/salesTableInteraction";
import type { Estado } from "@/lib/constants";
import { bodyText, metaText, tableTextDense } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

interface AgendaRow {
  id: string;
  jornada_id?: string | null;
  fecha_programada: string;
  trabajo_descripcion: string;
  estado: Estado;
}

/** Phone presentation only: preserve the caller's order, identities and detail action. */
export function PlannerMobileAgenda<T extends AgendaRow>({ rows, columns, sort, onSort, navigation, status, client, reference, continuity, onSelect, rowClassName }: {
  rows: readonly T[];
  columns: readonly SalesColumn<T>[];
  sort: SalesSort;
  onSort: (key: string) => void;
  navigation: ReactNode;
  status?: ReactNode;
  client: (row: T) => string;
  reference: (row: T) => string;
  continuity: (row: T) => { orden: number; total: number } | undefined;
  onSelect: (row: T) => void;
  rowClassName?: (row: T) => string;
}) {
  return <section aria-label="Agenda del Planificador" className="min-w-0">
    <div className="flex min-w-0 items-center border-b">
      <div className="min-w-0 flex-1">{navigation}</div>
      <CompactListOrderMenu label="jornadas" columns={columns} sort={sort} onSort={onSort} />
    </div>
    {status ? <div className="py-8 text-center text-[13px] text-muted-foreground">{status}</div> :
      <ul aria-label="Jornadas del Planificador" className="divide-y">
        {rows.map(row => {
          const date = parseISO(row.fecha_programada);
          const sequence = continuity(row);
          return <li key={`${row.id}-${row.jornada_id ?? row.fecha_programada}`}>
            <button type="button" onClick={() => onSelect(row)}
              aria-label={`Abrir jornada ${reference(row)} · ${client(row)} · ${format(date, "dd/MM/yyyy")}${sequence && sequence.total > 1 ? ` · Jornada ${sequence.orden}/${sequence.total}` : ""}`}
              className={cn("grid min-h-11 w-full grid-cols-[42px_minmax(0,1fr)] gap-3 py-3 pl-2 pr-1 text-left hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring", rowClassName?.(row))}>
              <time dateTime={row.fecha_programada} className="pt-0.5 text-center" title={format(date, "EEEE dd/MM/yyyy", { locale: es })}>
                <span className={cn("block capitalize", metaText)}>{format(date, "EEE", { locale: es })}</span>
                <span className={cn("block font-medium tabular-nums", tableTextDense)}>{format(date, "dd/MM")}</span>
              </time>
              <span className="block min-w-0">
                <span className={cn("block break-words font-semibold [overflow-wrap:anywhere]", bodyText)}>{client(row)}</span>
                <span className={cn("mt-0.5 line-clamp-2 break-words font-normal text-muted-foreground [overflow-wrap:anywhere]", tableTextDense)}>{row.trabajo_descripcion || "Sin descripción"}</span>
                <span className={cn("mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1", metaText)}>
                  <span className="break-all">{reference(row)}</span>
                  <EstadoBadge estado={row.estado} className="px-1.5 py-0 text-[10px] leading-4" />
                  {sequence && sequence.total > 1 && <span>Jornada {sequence.orden}/{sequence.total}</span>}
                </span>
              </span>
            </button>
          </li>;
        })}
      </ul>}
  </section>;
}
