export type TotvsFileKind = "os" | "facturacion" | "facturas_compra" | "productos" | "stock" | "stock_maquinas" | "maquinarias" | "pedidos" | "pedidos_venta" | "solicitudes" | "clientes" | "proveedores" | "kardex" | "kardex_sintetico" | "despacho" | "transferencias_transito";

export const TOTVS_FILE_KIND_LABELS: Record<TotvsFileKind, string> = {
  os: "Órdenes de servicio",
  facturacion: "Facturación de ventas",
  facturas_compra: "Facturas y notas de crédito de compra",
  productos: "Maestro de productos",
  stock: "Reporte de stock",
  stock_maquinas: "Stock de maquinarias",
  maquinarias: "Maquinarias (respaldo de chasis)",
  pedidos: "Pedidos de compra",
  pedidos_venta: "Pedidos de venta",
  solicitudes: "Solicitudes de compra",
  clientes: "Maestro de clientes",
  proveedores: "Maestro de proveedores",
  kardex: "Kardex anal\u00edtico",
  kardex_sintetico: "Kardex sint\u00e9tico valorizado",
  despacho: "Importaciones - Despacho",
  transferencias_transito: "Transferencias entre sucursales en tránsito",
};

function normalizeFileName(name: string) {
  return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function detectTotvsFileKind(fileName: string): TotvsFileKind | "ignorar" {
  const name = normalizeFileName(fileName);
  if (/(?:^|[_\-\s])original(?:[_.\-\s]|$)/.test(name)) return "ignorar";
  if (name.includes("ordenes_de_servicio") || name.includes("ordenes de servicio")) return "os";
  if (name.includes("pedidos-de-venta") || name.includes("pedidos_de_venta") || name.includes("pedidos de venta")) return "pedidos_venta";
  if (name.includes("importaciones---despacho") || name.includes("importaciones_despacho") || name.includes("importaciones - despacho")) return "despacho";
  if (name.includes("facturas_-_ncp_-_ndp_-_compras") || name.includes("facturas ncp ndp compras")) return "facturas_compra";
  if (name.includes("ndc") || name.includes("ncc") || name.includes("ventas")) return "facturacion";
  if (name.includes("maestro_de_productos") || name.includes("maestro de productos")) return "productos";
  if (name.includes("stock_de_maquinarias") || name.includes("stock de maquinarias")) return "stock_maquinas";
  if (name.includes("maquinarias")) return "maquinarias";
  if (name.includes("reporte_de_stock") || name.includes("reporte de stock")) return "stock";
  if (name.includes("pedidos_de_compra") || name.includes("pedidos de compra")) return "pedidos";
  if (name.includes("solicitudes_de_compra") || name.includes("solicitudes de compra")) return "solicitudes";
  if (name.includes("maestro_de_clientes") || name.includes("maestro de clientes")) return "clientes";
  if (name.includes("maestro_de_proveedores") || name.includes("maestro de proveedores")) return "proveedores";
  if (name.includes("transferencia_entre_sucursales_en_transito") || name.includes("transferencia entre sucursales en transito")) return "transferencias_transito";
  if (name.includes("kardex_sintetico") || name.includes("kardex-sintetico") || name.includes("kardex sintetico")) return "kardex_sintetico";
  if (name.includes("kardex_analitico") || name.includes("kardex-analitico") || name.includes("kardex analitico")) return "kardex";
  return "ignorar";
}
