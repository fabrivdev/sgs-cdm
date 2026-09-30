export type CanonicalCurrency = "USD" | "GS" | "PYG" | "UNKNOWN";
export type CanonicalIvaRate = 0 | 0.05 | 0.1;
export type CanonicalTimeType = "Cliente" | "Garantia" | "Interno" | "Desconocido";
export type CanonicalBillingType = "Repuestos" | "Servicio" | "Kilometraje" | "Maquinarias" | "Otros";

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
  seller?: string | null;
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

export interface CanonicalStockRow {
  rowId: string;
  productCode: string | null;
  description: string | null;
  unit: string | null;
  manufacturerCode: string | null;
  branch: string | null;
  warehouse: string | null;
  balance: number;
  raw: Record<string, unknown>;
}

export interface CanonicalKardexRow {
  rowId: string;
  sourceFileName: string;
  sourceRow: number;
  movementDate: string;
  branch: string;
  warehouse: string;
  warehouseDescription: string | null;
  productCode: string;
  productDescription: string | null;
  quantity: number;
  unitCostGs: number;
  unitCostCurrency2: number;
  unitCostCurrency3: number;
  totalCostGs: number;
  totalCostCurrency2: number;
  totalCostCurrency3: number;
  movementDetail: string | null;
  documentKind: string;
  documentNumber: string;
  sequence: string;
  currencyCode: string;
  exchangeRate: number;
  sourceTable: string;
  direction: "E" | "S";
  sourceRecno: string;
  series: string | null;
  counterpartyCode: string | null;
  counterpartyStore: string | null;
  productGroup: string | null;
  accountingAccount: string | null;
  sourceFingerprint: string;
  raw: Record<string, unknown>;
}

export interface CanonicalImportDispatchRow {
  rowId: string;
  sourceFileName: string;
  sourceRow: number;
  branch: string;
  processNumber: string;
  processDate: string;
  customsBroker: string | null;
  completionDate: string | null;
  processItem: string;
  supplierCode: string | null;
  supplierName: string | null;
  series: string | null;
  documentDate: string | null;
  paymentCondition: string | null;
  currency: string | null;
  stampNumber: string | null;
  documentNumber: string;
  documentItem: string;
  productCode: string;
  productDescription: string | null;
  manufacturerCode: string | null;
  quantity: number;
  unitPrice: number;
  generated: string | null;
  entryType: string | null;
  purchaseOrderReference: string | null;
  sourceFingerprint: string;
  raw: Record<string, unknown>;
}

export interface CanonicalSalesOrderRow {
  rowId: string;
  sourceFileName: string;
  sourceRow: number;
  branch: string;
  emissionDate: string;
  customerCode: string | null;
  customerName: string | null;
  seller: string | null;
  paymentCondition: string | null;
  nature: string | null;
  generates: string | null;
  currency: string | null;
  orderNumber: string;
  item: string;
  productCode: string;
  manufacturerCode: string | null;
  description: string | null;
  unit: string | null;
  quantity: number;
  unitPrice: number;
  totalValue: number;
  deliveredQuantity: number;
  pendingQuantity: number;
  status: string | null;
  quoteNumber: string | null;
  quoteItem: string | null;
  invoiceSeries: string | null;
  invoiceNumber: string | null;
  entryType: string | null;
  sourceFingerprint: string;
  raw: Record<string, unknown>;
}

export interface CanonicalSyntheticKardexRow {
  rowId: string;
  sourceFileName: string;
  sourceRow: number;
  branch: string;
  productCode: string;
  productDescription: string | null;
  warehouse: string;
  chassis: string | null;
  balance: number;
  averageCost1: number;
  inventoryValue1: number;
  averageCost2: number;
  inventoryValue2: number;
  averageCost3: number;
  inventoryValue3: number;
  sourceFingerprint: string;
  raw: Record<string, unknown>;
}

export interface CanonicalPurchaseInvoiceRow {
  rowId: string;
  sourceFileName: string;
  sourceRow: number;
  branch: string;
  emissionDate: string;
  entryDate: string;
  supplierCode: string;
  supplierStore: string;
  supplierName: string | null;
  sourceCurrency: string;
  documentKind: string;
  modality: string | null;
  electronicDocument: string | null;
  stampNumber: string | null;
  series: string;
  documentNumber: string;
  item: string;
  productCode: string;
  productDescription: string | null;
  quantity: number;
  unitValueGs: number;
  totalValueGs: number;
  unitValueUsd: number;
  totalValueUsd: number;
  entryType: string | null;
  accountingAccount: string | null;
  costCenter: string | null;
  exchangeRate: number;
  purchaseOrderNumber: string | null;
  purchaseOrderItem: string | null;
  dueDate: string | null;
  observation: string | null;
  reimbursementNumber: string | null;
  reimbursement: string | null;
  createdBy: string | null;
  sourceFingerprint: string;
  raw: Record<string, unknown>;
}

export interface CanonicalSupplierRow {
  rowId: string;
  sourceFileName: string;
  sourceRow: number;
  supplierCode: string;
  store: string;
  legalName: string;
  taxId: string | null;
  tradeName: string | null;
  address: string | null;
  department: string | null;
  municipality: string | null;
  email: string | null;
  phone: string | null;
  country: string | null;
  withholdingFlag1: string | null;
  withholdingFlag2: string | null;
  status: string | null;
  sourceFingerprint: string;
  raw: Record<string, unknown>;
}

export interface CanonicalBranchTransferRow {
  rowId: string;
  sourceFileName: string;
  sourceRow: number;
  originBranch: string;
  destinationBranch: string;
  emissionDate: string;
  documentSeries: string;
  documentNumber: string;
  item: string;
  productCode: string;
  productDescription: string | null;
  quantity: number;
  observation: string | null;
  sourceFingerprint: string;
  raw: Record<string, unknown>;
}

export interface CanonicalMachineStockRow {
  rowId: string;
  sourceRow: number;
  productCode: string;
  branch: string | null;
  branchRaw: string | null;
  warehouse: string | null;
  machineType: string | null;
  brand: string | null;
  model: string | null;
  condition: "Nuevo" | "Usado" | null;
  chassis: string | null;
  balance: number;
  raw: Record<string, unknown>;
}

export interface CanonicalMachineRegistryRow {
  rowId: string;
  sourceRow: number;
  productCode: string;
  chassis: string | null;
  machineType: string | null;
  brand: string | null;
  model: string | null;
  raw: Record<string, unknown>;
}

export interface CanonicalPedidoCompraRow {
  rowId: string;
  nroPedido: string | null;
  item: string | null;
  emissionDate: string | null;
  branch: string | null;
  supplierCode: string | null;
  supplierName: string | null;
  currency: string | null;
  paymentCondition: string | null;
  naturaleza: string | null;
  productCode: string | null;
  description: string | null;
  unit: string | null;
  quantity: number;
  unitPrice: number;
  total: number;
  deliveredQuantity: number;
  pendingQuantity: number;
  deliveryType: string | null;
  raw: Record<string, unknown>;
}

export interface CanonicalSolicitudCompraRow {
  rowId: string;
  nroSolicitud: string | null;
  item: string | null;
  emissionDate: string | null;
  branch: string | null;
  requester: string | null;
  currency: string | null;
  productCode: string | null;
  manufacturerCode: string | null;
  requestedBrand: string | null;
  description: string | null;
  unit: string | null;
  quantity: number;
  unitPrice: number;
  total: number;
  observation: string | null;
  raw: Record<string, unknown>;
}

export interface CanonicalClienteRow {
  rowId: string;
  codEntidad: string;
  nombre: string;
  ruc: string | null;
  direccion: string | null;
  localidad: string | null;
  correoPrincipal: string | null;
  telefono: string | null;
  region: string | null;
  sucursal: string | null;
  activo: boolean;
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
