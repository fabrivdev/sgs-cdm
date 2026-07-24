export type CanonicalCurrency = "USD" | "GS" | "PYG" | "UNKNOWN";
export type CanonicalIvaRate = 0 | 0.05 | 0.1;
export type CanonicalTimeType = "Cliente" | "Garantia" | "Interno" | "Desconocido";
export type CanonicalBillingType = "Repuestos" | "Servicio" | "Kilometraje" | "Otros";

export interface CanonicalImportEnvelope<T> {
  sourceSystem: string;
  sourceFileName: string;
  worksheetName: string;
  importedAt: string;
  rows: T[];
}

export interface CanonicalBillingRow {
  rowId: string;
  emissionDate: string | null;
  dueDate: string | null;
  branch: string | null;
  clientCode: string | null;
  clientName: string;
  invoiceLongNumber: string | null;
  invoiceShortNumber: string | null;
  documentNumber: string | null;
  itemNumber: string | null;
  productCode: string | null;
  manufacturerCode: string | null;
  productName: string | null;
  quantity: number;
  unitValueBase: number;
  totalValueBase: number;
  ivaRate: CanonicalIvaRate;
  unitValueWithIva: number;
  totalValueWithIva: number;
  currency: CanonicalCurrency;
  exchangeRate: number | null;
  paymentCondition: string | null;
  lineType: CanonicalBillingType;
  timeType: CanonicalTimeType;
  productGroup: string | null;
  productFamily: string | null;
  productBrand: string | null;
  linkedServiceOrder: string | null;
  linkedTrabajo: string | null;
  isDirectSale: boolean;
  raw: Record<string, unknown>;
}

export interface CanonicalServiceOrderRow {
  rowId: string;
  sourceServiceOrderNumber: string;
  branchCode: string | null;
  serviceOrderNumber: string;
  branch: string | null;
  status: string | null;
  billingStatus: string | null;
  openDate: string | null;
  closeDate: string | null;
  invoiceDate: string | null;
  ownerCode: string | null;
  ownerName: string | null;
  billedClientCode: string | null;
  billedClientName: string | null;
  chassis: string | null;
  brand: string | null;
  group: string | null;
  model: string | null;
  technician: string | null;
  auxiliaryTechnicians: string[];
  timeType: CanonicalTimeType;
  documentNumber: string | null;
  invoiceNumber: string | null;
  manufacturerCode: string | null;
  productCode: string | null;
  productName: string | null;
  quantity: number;
  lineTotal: number;
  currency: CanonicalCurrency;
  serviceHours: number;
  kilometreQuantity: number;
  thirdPartyValue: number;
  kilometreValue: number;
  serviceValue: number;
  sparePartsValue: number;
  raw: Record<string, unknown>;
}

export interface CanonicalProductRow {
  rowId: string;
  internalCode: string | null;
  manufacturerCode: string | null;
  description: string;
  brand: string | null;
  group: string | null;
  family: string | null;
  unit: string | null;
  isActive: boolean;
  raw: Record<string, unknown>;
}

export interface CanonicalBillingCrosswalk {
  billingRowId: string;
  matchedBy: "document" | "invoice" | "product_code" | "manufacturer_code" | "none";
  serviceOrderNumber: string | null;
  trabajoId: string | null;
  inferredTimeType: CanonicalTimeType;
  inferredLineType: CanonicalBillingType;
  productBrand: string | null;
  productGroup: string | null;
  productFamily: string | null;
}
