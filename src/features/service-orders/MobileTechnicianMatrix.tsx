import { useState } from "react";
import { ResponsiveDrawer, ResponsiveDrawerBody, ResponsiveDrawerHeader } from "@/components/ui/responsive-drawer";
import { operationsDate } from "./format";
import { matrixCompletion, matrixCompletionText } from "@/lib/matrixCompletion";
import type { OperationsModel } from "./useOperationsModel";

type Matrix = OperationsModel["matrizTécnicosDías"];
type Technician = Matrix["blocks"][number]["técnicos"][number];

/** One period at a time keeps the operational matrix readable on narrow screens. */
export function MobileTechnicianMatrix({ data, metric, bucket }: {
  data: Matrix;
  metric: "trabajos" | "horas";
  bucket: string;
}) {
  const { blocks, bucketLabels } = data;
  const [selected, setSelected] = useState<{ technician: Technician; bucket: string } | null>(null);
  const selectedCell = selected?.technician.cells[selected.bucket];
  const selectedResult = matrixCompletion(selectedCell);

  if (!bucket || !blocks.length) return <p className="px-3 py-6 text-center text-[12px] text-muted-foreground">Sin actividad técnica para los filtros actuales.</p>;

  return <>
    <div role="table" aria-label="Matriz de técnicos por período" className="divide-y">
      <div role="row" className="grid min-h-9 grid-cols-[minmax(0,1fr)_124px] items-center gap-3 px-3 text-[11px] font-medium text-muted-foreground">
        <span role="columnheader">Técnico</span><span role="columnheader" className="text-right">Cumplimiento</span>
      </div>
      {blocks.map(block => <div role="rowgroup" key={block.sucursal}>
        <div role="row" className="bg-muted/30 px-3 py-2 text-[12px] font-semibold"><span role="cell">{block.sucursal}</span></div>
        {block.técnicos.map(technician => {
          const cell = technician.cells[bucket];
          const result = matrixCompletion(cell);
          const exception = result.unavailable
            ? "No disponible"
            : result.scheduled ? `${result.scheduled} ${result.scheduled === 1 ? "programado" : "programados"}` : "";
          return <div role="row" key={technician.id} className="grid min-h-14 grid-cols-[minmax(0,1fr)_124px] items-center gap-3 border-t px-3 py-2">
            <span role="cell" className="min-w-0"><button type="button" onClick={() => setSelected({ technician, bucket })} className="min-h-11 w-full break-words text-left text-[12px] font-medium leading-snug">{technician.nombre}</button></span>
            <span role="cell" className="min-w-0 text-right text-[10px] tabular-nums">
              <span className="block"><strong className="text-[14px]">{result.percent === null ? "-" : `${result.percent}%`}</strong></span>
              {exception && <span className="block leading-4 text-muted-foreground">{exception}</span>}
              {result.percent !== null && <span role="meter" aria-label={`Trabajos cumplidos de ${technician.nombre}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={result.percent} aria-valuetext={matrixCompletionText(result)} className="mt-1 ml-auto block h-1.5 w-full max-w-[106px] overflow-hidden rounded-full bg-amber-300/80"><span className="block h-full bg-emerald-600" style={{ width: `${result.percent}%` }} /></span>}
            </span>
          </div>;
        })}
      </div>)}
    </div>
    <ResponsiveDrawer open={Boolean(selected)} onOpenChange={open => !open && setSelected(null)}>
      <ResponsiveDrawerHeader><h3 className="pr-5 text-[14px] font-semibold">{selected?.technician.nombre} · {selected ? bucketLabels[selected.bucket] ?? selected.bucket : ""}</h3></ResponsiveDrawerHeader>
      <ResponsiveDrawerBody className="space-y-3 text-[12px]">
        {selectedCell && <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg border bg-muted/20 p-3">
          <div><dt className="text-muted-foreground">Cumplimiento</dt><dd className="font-medium">{selectedResult.percent === null ? "Sin resultados decididos" : `${selectedResult.percent}%`}</dd></div>
          <div><dt className="text-muted-foreground">Trabajos decididos</dt><dd className="font-medium">{selectedResult.completed} de {selectedResult.decided} cumplidos</dd></div>
          <div><dt className="text-muted-foreground">Programados</dt><dd className="font-medium">{selectedResult.scheduled}</dd></div>
          <div><dt className="text-muted-foreground">Horas registradas</dt><dd className="font-medium">{Number(selectedCell?.horas ?? 0).toLocaleString("es-PY", { maximumFractionDigits: 1 })} h</dd></div>
          <div><dt className="text-muted-foreground">Medida seleccionada</dt><dd className="font-medium">{metric === "horas" ? "Horas" : "Trabajos"}</dd></div>
        </dl>}
        {selectedCell?.refs.map((ref, position) => <div key={`${ref.id ?? ref.ref}-${position}`} className="border-b pb-2">
          <div className="font-medium">{ref.ref} · {ref.cliente}</div><div className="text-muted-foreground">{ref.fecha ? `${operationsDate(ref.fecha)} · ` : ""}{ref.estado}{ref.motivo ? ` · ${ref.motivo}` : ""}</div>{ref.trabajo && <div>{ref.trabajo}</div>}
        </div>)}
        {selectedCell?.noDisponibilidad.map((reason, position) => <div key={`${reason}-${position}`} className="text-violet-700">No disponible · {reason}</div>)}
        {selected && !selectedCell && <p className="text-muted-foreground">Sin actividad en este período.</p>}
      </ResponsiveDrawerBody>
    </ResponsiveDrawer>
  </>;
}
