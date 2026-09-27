import { DetailSection, KeyValueGrid, KeyValueItem } from "@/components/maquinaria/MachineDetailPrimitives";
import { inspectWorkInterval } from "./workLog";
import { operationsDate } from "./format";
import type { WorkIssue } from "./workedProductivity";

const number = new Intl.NumberFormat("es-PY", { maximumFractionDigits: 2 });
const sourceClock = (date: string | null, time: string | null) =>
  `${date ? operationsDate(date) : "Sin fecha"} · ${time || "Sin hora"}`;

/** Evidence for review, not an editable work queue or invented zero-hour records. */
export function WorkIssuesList({ issues }: { issues: WorkIssue[] }) {
  return <div aria-label="Incidencias de jornadas" className="divide-y">
    {issues.map(issue => <section key={issue.key} className="py-4 first:pt-0" aria-label={issue.reason}>
      <DetailSection title={issue.reason}>
        {issue.sources.length ? <div className="space-y-4">{issue.sources.map(({ os, entry }, index) => {
          const { hours } = inspectWorkInterval(entry);
          return <KeyValueGrid key={`${os}:${entry.id}:${index}`} className="sm:grid-cols-2">
            <KeyValueItem label="OS" value={os} mono />
            <KeyValueItem label="Técnico" value={entry.tecnico_nombre || issue.technician} />
            <KeyValueItem label="Inicio registrado" value={sourceClock(entry.fecha_inicio, entry.hora_inicio)} />
            <KeyValueItem label="Fin registrado" value={sourceClock(entry.fecha_fin, entry.hora_fin)} />
            <KeyValueItem label="Tipo de tiempo" value={entry.tipo_tiempo} />
            <KeyValueItem label="Duración registrada" value={hours === null ? "No calculable" : `${number.format(hours)} h`} />
          </KeyValueGrid>;
        })}</div> : <KeyValueGrid><KeyValueItem label="OS" value={issue.os} mono /><KeyValueItem label="Técnico" value={issue.technician} /></KeyValueGrid>}
      </DetailSection>
    </section>)}
  </div>;
}
