import type { Invoice, WorkItem } from "./managementModel";
import { readableWork, workObservation } from "./maintenancePresentation";
export const maintenanceGroups = [
  "Aceites",
  "Filtros",
  "Cubiertas",
  "Repuestos",
  "Otros",
] as const;
export type MaintenanceGroup = (typeof maintenanceGroups)[number];
export type GroupWork = { name: string; observation: string | null };
export type GroupedWorks = Record<MaintenanceGroup, GroupWork[]>;
const emptyGroups = (): GroupedWorks => ({
  Aceites: [],
  Filtros: [],
  Cubiertas: [],
  Repuestos: [],
  Otros: [],
});
export function workGroup(name: string): MaintenanceGroup {
  const text = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (/filtro/.test(text)) return "Filtros";
  if (/aceite|fluido|lubricante/.test(text)) return "Aceites";
  if (/cubierta|neumatico/.test(text)) return "Cubiertas";
  if (
    /repuesto|correa|bateria/.test(text) &&
    text !== "otros trabajos y repuestos"
  )
    return "Repuestos";
  return "Otros";
}
export function groupHistoryWorks(works: readonly WorkItem[]): GroupedWorks {
  const result = emptyGroups();
  for (const work of works)
    result[workGroup(work.work)].push({
      name: readableWork(work.work),
      observation: workObservation(work),
    });
  return result;
}
/** Invoice categories do not identify individual parts. Preserve the shared description as such. */
export function groupInvoiceWorks(
  invoice: Pick<Invoice, "categories" | "description">,
): GroupedWorks {
  const result = emptyGroups();
  for (const category of [...new Set(invoice.categories ?? [])])
    result[workGroup(category)].push({ name: category, observation: null });
  if (!invoice.categories?.length && invoice.description)
    result.Otros.push({ name: "Trabajo registrado", observation: null });
  return result;
}
export function exportWorkGroups(groups: GroupedWorks) {
  return Object.fromEntries(
    maintenanceGroups.map((group) => [
      "group" + group,
      groups[group]
        .map((w) => [w.name, w.observation].filter(Boolean).join(": "))
        .join("; "),
    ]),
  );
}
