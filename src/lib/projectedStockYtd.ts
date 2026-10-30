import { supabase } from "@/integrations/supabase/client";
import { loadMachineCatalog } from "@/hooks/useMachineCatalog";
import { reviewCatalogLine, type MachineCatalog } from "./machineOrderValidation";
import { normalizeMachineModelKey, canonicalMachineSubgroup } from "./machineModels";
import type { ProjectedMachineStockRow } from "./projectedMachineStock";

type SalesModel = { marca: string; tipo_maquina: string; modelo: string; condicion?: string | null; netas: number };
export function attachProjectedStockYtd(rows: ProjectedMachineStockRow[], sales: SalesModel[], catalog: MachineCatalog) {
  // User-confirmed equivalence already present in the catalog; scoped to this view.
  const target = catalog.models.find(m => m.id === "cf22fb73-a282-4673-8fa2-f929473fe40f"
    && m.activo && m.marca_nombre === "HORSCH" && m.nombre === "MAESTRO EVOLUTION 24");
  const confirmedCatalog: MachineCatalog = { ...catalog, aliases: catalog.aliases?.map(a =>
    target && a.marca === "HORSCH" && normalizeMachineModelKey(a.alias) === "EVOLUTION2445"
      && a.modelo_catalogo_id === target.id ? { ...a, revisado_manual: true } : a) };
  const identity = (marca: string, tipo: string, modelo: string) => {
    const brands = marca === "OTROS" ? [...new Set(catalog.models.map(m => m.marca_nombre))] : [marca];
    const matches = brands.flatMap(brand => {
      const result = reviewCatalogLine({ marca: brand, modelo, subgrupo: tipo }, confirmedCatalog);
      return result.match && !result.archived ? [result.match] : [];
    });
    const distinct = [...new Map(matches.map(m => [m.id, m])).values()];
    const match = distinct.length === 1 ? distinct[0] : undefined;
    return { match, key: match?.id ?? JSON.stringify([marca, canonicalMachineSubgroup(tipo), normalizeMachineModelKey(modelo)]) };
  };
  const quantities = new Map<string, { units: number; row: SalesModel; match: ReturnType<typeof identity>["match"] }>();
  for (const sale of sales) {
    // Use the dashboard signed unit balance, including returned units; never infer units from amounts.
    if (sale.condicion === "USADA") continue;
    const units = Number(sale.netas);
    if (sale.netas == null || !Number.isFinite(units)) throw new Error("Ventas de máquinas devolvió una cantidad YTD inválida.");
    const { key, match } = identity(sale.marca, sale.tipo_maquina, sale.modelo);
    const previous = quantities.get(key);
    quantities.set(key, { units: (previous?.units ?? 0) + units, row: sale, match });
  }
  const consumed = new Set<string>();
  const result: ProjectedMachineStockRow[] = rows.map(row => {
    const { key, match } = identity(row.marca, row.tipo, row.modelo);
    // Never assign the same sales twice to legacy split projection rows.
    const amount = consumed.has(key) ? null : quantities.get(key)?.units ?? 0;
    consumed.add(key);
    return { ...row,
      clave_fila: row.clave_fila ?? JSON.stringify([row.programa, row.marca, row.tipo, row.modelo]),
      ...(match ? { marca: match.marca_nombre, tipo: match.subgrupo, modelo: match.nombre } : {}),
      vendidas_ytd: amount };

  });
  // A sold model belongs here only when the active catalog resolves it uniquely.
  // Unmatched sales never create stock rows or raw filter labels.
  for (const [key, value] of quantities) {
    const model = value.match;
    if (consumed.has(key) || !model || value.units === 0) continue;
    result.push({
      clave_fila: model.id, modelo_catalogo_id: model.id, identidad_estado: "catalogo",
      programa: model.marca_nombre, marca: model.marca_nombre,
      tipo: model.subgrupo, modelo: model.nombre, vendidas_ytd: value.units,
      stock: 0, pedidos_compra: 0, disponibilidad: 0, ventas_pendientes: 0,
      stock_proyectado: 0, arribos_periodo: 0, ventas_netas_periodo: 0,
    });
    consumed.add(key);
  }
  return result;
}

export async function loadProjectedStockYtd(rows: ProjectedMachineStockRow[], cutoff: string) {
  const [catalog, response] = await Promise.all([
    loadMachineCatalog(),
    (supabase as any).rpc("ventas_maquinas_dashboard_filtros_v2", {
      p_desde: `${cutoff.slice(0, 4)}-01-01`, p_hasta: cutoff,
      p_sucursal: null, p_buscar: null, p_marca: null,
      p_tipo_maquina: null, p_vendedor: null, p_agrupacion: "mes",
    }),
  ]);
  if (response.error) throw new Error(response.error.message || "No se pudieron consultar las ventas YTD.");
  if (!Array.isArray(response.data?.por_modelo)) throw new Error("Ventas de máquinas no devolvió el desglose por modelo.");
  return attachProjectedStockYtd(rows, response.data.por_modelo, catalog);
}
