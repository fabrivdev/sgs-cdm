export function importInvoiceDifference(
  orderValue: number | null | undefined,
  orderCurrency: string | null | undefined,
  invoiceValue: number | null | undefined,
  invoiceCurrency: string | null | undefined,
): number | null {
  if (orderValue == null || invoiceValue == null || !orderCurrency || orderCurrency !== invoiceCurrency) return null;
  if (!Number.isFinite(Number(orderValue)) || !Number.isFinite(Number(invoiceValue))) return null;
  return Math.round((Number(invoiceValue) - Number(orderValue)) * 100) / 100;
}

export function validImportAmount(value: string): boolean {
  return value.trim() === "" || (Number.isFinite(Number(value)) && Number(value) >= 0);
}

export function formatImportMoney(value: number, currency = "USD"): string {
  return new Intl.NumberFormat("es-PY", {
    style: "currency", currency, currencyDisplay: "narrowSymbol",
    minimumFractionDigits: currency === "PYG" ? 0 : 2,
    maximumFractionDigits: currency === "PYG" ? 0 : 2,
  }).format(value);
}

export type ImportUnitSection = "unit" | "purchase" | "invoice" | "stock";
export type ImportUnitForm = {
  llave_interna: string; chasis: string; eta: string; valor_oc: string; moneda_oc: string;
  invoice_supplier: string; factura_proveedor_fecha: string; factura_proveedor_moneda: string;
  valor_factura_proveedor: string; costo_final: string; costo_stock_moneda: string;
};

export function importUnitForm(row: {
  llave_interna?: string | null; chasis?: string | null; eta?: string | null; precio_oc?: number | null; moneda_oc?: string;
  invoice_supplier?: string | null; factura_proveedor_fecha?: string | null; factura_proveedor_moneda?: string | null;
  valor_factura_proveedor?: number | null; costo_final?: number | null; costo_stock_moneda?: string;
}): ImportUnitForm {
  return {
    llave_interna: row.llave_interna ?? "", chasis: row.chasis ?? "", eta: row.eta ?? "",
    valor_oc: row.precio_oc == null ? "" : String(row.precio_oc), moneda_oc: row.moneda_oc ?? "USD",
    invoice_supplier: row.invoice_supplier ?? "", factura_proveedor_fecha: row.factura_proveedor_fecha ?? "",
    factura_proveedor_moneda: row.factura_proveedor_moneda ?? "USD",
    valor_factura_proveedor: row.valor_factura_proveedor == null ? "" : String(row.valor_factura_proveedor),
    costo_final: row.costo_final == null ? "" : String(row.costo_final), costo_stock_moneda: row.costo_stock_moneda ?? "USD",
  };
}

const sectionFields: Record<ImportUnitSection, (keyof ImportUnitForm)[]> = {
  unit: ["llave_interna", "chasis"], purchase: ["eta", "valor_oc", "moneda_oc"],
  invoice: ["invoice_supplier", "factura_proveedor_fecha", "factura_proveedor_moneda", "valor_factura_proveedor"],
  stock: ["costo_final", "costo_stock_moneda"],
};

export function importUnitPatch(section: ImportUnitSection, form: ImportUnitForm, original: ImportUnitForm): Record<string, string> {
  return Object.fromEntries(sectionFields[section].filter(field => form[field] !== original[field]).map(field => [field, form[field]]));
}
