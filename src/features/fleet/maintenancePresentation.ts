import { maintenanceCategories, type WorkItem } from "./managementModel";

/** Presentation only: classify recorded work names, never infer from amounts or comments. */
export function workCategories(works: readonly WorkItem[]): string[] {
  const found = new Set(
    works.map(({ work }) => {
      const name = work
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
      if (/filtro/.test(name)) return "Filtros";
      if (/aceite|fluido|lubricante/.test(name)) return "Aceites y fluidos";
      if (/correa/.test(name)) return "Correas";
      if (/cubierta|neumatico/.test(name)) return "Cubiertas";
      if (/bateria/.test(name)) return "Batería";
      return "Otros trabajos y repuestos";
    }),
  );
  return maintenanceCategories.filter((c) => found.has(c));
}

export function compactCategories(categories: readonly string[]) {
  const unique = [...new Set(categories.filter(Boolean))];
  return unique.length
    ? unique.slice(0, 2).join(" · ") +
        (unique.length > 2 ? ` +${unique.length - 2}` : "")
    : "Sin clasificar";
}

const workNames: Record<string, string> = {
  "MOTOR / Filtro.Comb.": "Filtro de combustible",
  "MOTOR / Filtro Aceite": "Filtro de aceite",
  "MOTOR / Filtro Aire": "Filtro de aire",
  "MOTOR / ACEITE": "Aceite de motor",
  "CAJAS / ACEITE": "Aceite de caja",
  "DIFERENCIAL / ACEITE": "Aceite de diferencial",
  "MOTOR / Correa Dentada": "Correa dentada",
  CUBIERTAS: "Cubiertas",
  "GASTOS / VARIOS": "Gastos varios",
  "REPUESTOS / VARIOS": "Repuestos varios",
  "SERVICIOS / VARIOS": "Servicios varios",
};
export const readableWork = (name: string) => workNames[name] ?? name;
