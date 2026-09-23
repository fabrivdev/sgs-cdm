export type TotvsFileKind = "os" | "facturacion" | "productos" | "stock" | "stock_maquinas" | "maquinarias" | "pedidos" | "solicitudes" | "clientes";

export const TOTVS_FILE_KIND_LABELS: Record<TotvsFileKind, string> = {
  os: "Órdenes de servicio",
  facturacion: "Facturación de ventas",
  productos: "Maestro de productos",
  stock: "Reporte de stock",
  stock_maquinas: "Stock de maquinarias",
  maquinarias: "Maquinarias (respaldo de chasis)",
  pedidos: "Pedidos de compra",
  solicitudes: "Solicitudes de compra",
  clientes: "Maestro de clientes",
};

function normalizeFileName(name: string) {
  return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function detectTotvsFileKind(fileName: string): TotvsFileKind | "ignorar" {
  const name = normalizeFileName(fileName);
  if (name.includes("ordenes_de_servicio") || name.includes("ordenes de servicio")) return "os";
  if (name.includes("ndc") || name.includes("ncc") || name.includes("ventas")) return "facturacion";
  if (name.includes("maestro_de_productos") || name.includes("maestro de productos")) return "productos";
  if (name.includes("stock_de_maquinarias") || name.includes("stock de maquinarias")) return "stock_maquinas";
  if (name.includes("maquinarias")) return "maquinarias";
  if (name.includes("reporte_de_stock") || name.includes("reporte de stock")) return "stock";
  if (name.includes("pedidos_de_compra") || name.includes("pedidos de compra")) return "pedidos";
  if (name.includes("solicitudes_de_compra") || name.includes("solicitudes de compra")) return "solicitudes";
  if (name.includes("maestro_de_clientes") || name.includes("maestro de clientes")) return "clientes";
  return "ignorar";
}
