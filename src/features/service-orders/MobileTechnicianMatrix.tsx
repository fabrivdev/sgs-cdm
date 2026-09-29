import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ResponsiveDrawer, ResponsiveDrawerBody, ResponsiveDrawerHeader } from "@/components/ui/responsive-drawer";
import { operationsDate } from "./format";
import type { OperationsModel } from "./useOperationsModel";

type Matrix = OperationsModel["matrizTécnicosDías"];
type Technician = Matrix["blocks"][number]["técnicos"][number];

/** One period at a time keeps the operational matrix readable on narrow screens. */
export function MobileTechnicianMatrix({ data, metric, onMetricChange }: {
  data: Matrix;
  metric: "trabajos" | "horas";
  onMetricChange: (value: "trabajos" | "horas") => void;
}) {
  const { buckets, blocks, bucketLabels } = data;
  const [selectedIndex, setSelectedIndex] = useState(() => {
    const current = buckets.indexOf(data.currentBucketKey ?? "");
    return current >= 0 ? current : Math.max(0, buckets.length - 1);
  });
  const [selected, setSelected] = useState<{ technician: Technician; bucket: string } | null>(null);
  const index = Math.min(selectedIndex, Math.max(0, buckets.length - 1));
  const bucket = buckets[index];

  if (!bucket || !blocks.length) return <p className="px-3 py-6 text-center text-[12px] text-muted-foreground">Sin actividad técnica para los filtros actuales.</p>;

  return <>
    <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
      <div className="flex min-w-0 items-center gap-1">
        <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" aria-label="Período anterior" disabled={index === 0} onClick={() => setSelectedIndex(index - 1)}><ChevronLeft className="h-4 w-4" /></Button>
        <span className="min-w-[72px] text-center text-[12px] font-medium">{bucketLabels[bucket] ?? bucket}</span>
        <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" aria-label="Período siguiente" disabled={index === buckets.length - 1} onClick={() => setSelectedIndex(index + 1)}><ChevronRight className="h-4 w-4" /></Button>
      </div>
      <div role="group" aria-label="Medida de la matriz" className="inline-flex overflow-hidden rounded-md border text-[11px]">
        <button type="button" aria-pressed={metric === "trabajos"} className={`min-h-9 px-2 ${metric === "trabajos" ? "bg-primary text-primary-foreground" : "bg-background"}`} onClick={() => onMetricChange("trabajos")}>Trabajos</button>
        <button type="button" aria-pressed={metric === "horas"} className={`min-h-9 border-l px-2 ${metric === "horas" ? "bg-primary text-primary-foreground" : "bg-background"}`} onClick={() => onMetricChange("horas")}>Horas</button>
      </div>
    </div>
    <div className="flex flex-wrap gap-x-3 gap-y-1 border-b px-3 py-2 text-[10px] text-muted-foreground">
      <span><span className="text-emerald-700">●</span> Realizado</span><span><span className="text-amber-700">▲</span> No realizado</span><span><span className="text-sky-700">○</span> Programado</span><span><span className="text-violet-700">ND</span> No disponible</span>
    </div>
    <div role="table" aria-label="Matriz de técnicos por período" className="divide-y">
      <div role="row" className="sr-only"><span role="columnheader">Técnico</span><span role="columnheader">Actividad</span></div>
      {blocks.map(block => <div role="rowgroup" key={block.sucursal}>
        <div role="row" className="bg-muted/30 px-3 py-2 text-[12px] font-semibold"><span role="cell">{block.sucursal}</span></div>
        {block.técnicos.map(technician => {
          const cell = technician.cells[bucket];
          const count = (cell?.realizadas ?? 0) + (cell?.noRealizadas ?? 0) + (cell?.programadas ?? 0);
          const availability = cell?.noDisponibilidad.length ?? 0;
          return <div role="row" key={technician.id} className="flex min-h-12 items-center justify-between gap-3 border-t px-3 py-2">
            <span role="cell" className="min-w-0 flex-1"><button type="button" onClick={() => setSelected({ technician, bucket })} className="min-h-11 w-full break-words text-left text-[12px] font-medium leading-snug">{technician.nombre}</button></span>
            <span role="cell" className="flex shrink-0 items-center gap-1.5 text-[11px] tabular-nums">
              {cell?.realizadas ? <span className="text-emerald-700">● {cell.realizadas}</span> : null}
              {cell?.noRealizadas ? <span className="text-amber-700">▲ {cell.noRealizadas}</span> : null}
              {cell?.programadas ? <span className="text-sky-700">○ {cell.programadas}</span> : null}
              {availability ? <span className="text-violet-700">ND</span> : null}
              {metric === "horas" && cell?.horas ? <span className="font-semibold">{cell.horas.toLocaleString("es-PY", { maximumFractionDigits: 1 })} h</span> : null}
              {!count && !availability ? <span className="text-muted-foreground">—</span> : null}
            </span>
          </div>;
        })}
      </div>)}
    </div>
    <ResponsiveDrawer open={Boolean(selected)} onOpenChange={open => !open && setSelected(null)}>
      <ResponsiveDrawerHeader><h3 className="pr-5 text-[14px] font-semibold">{selected?.technician.nombre} · {selected ? bucketLabels[selected.bucket] ?? selected.bucket : ""}</h3></ResponsiveDrawerHeader>
      <ResponsiveDrawerBody className="space-y-3 text-[12px]">
        {selected?.technician.cells[selected.bucket]?.refs.map((ref, position) => <div key={`${ref.id ?? ref.ref}-${position}`} className="border-b pb-2">
          <div className="font-medium">{ref.ref} · {ref.cliente}</div><div className="text-muted-foreground">{ref.fecha ? `${operationsDate(ref.fecha)} · ` : ""}{ref.estado}{ref.motivo ? ` · ${ref.motivo}` : ""}</div>{ref.trabajo && <div>{ref.trabajo}</div>}
        </div>)}
        {selected?.technician.cells[selected.bucket]?.noDisponibilidad.map((reason, position) => <div key={`${reason}-${position}`} className="text-violet-700">ND · {reason}</div>)}
        {!selected?.technician.cells[selected.bucket] && <p className="text-muted-foreground">Sin actividad en este período.</p>}
      </ResponsiveDrawerBody>
    </ResponsiveDrawer>
  </>;
}
