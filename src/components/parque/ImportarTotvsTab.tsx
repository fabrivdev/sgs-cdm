import { useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { cargarTodo } from "@/hooks/useCatalogos";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FolderOpen, FileUp, Import, X } from "lucide-react";
import { toast } from "sonner";
import {
  mapCanonicalPedidoCompraToRow,
  mapCanonicalImportDispatchToRow,
  mapCanonicalKardexToRow,
  mapCanonicalMachineStockToRow,
  mapCanonicalProductToRow,
  mapCanonicalSolicitudCompraToRow,
  mapCanonicalSalesOrderToRow,
  mapCanonicalSyntheticKardexToRow,
  mapCanonicalPurchaseInvoiceToRow,
  mapCanonicalSupplierToRow,
  mapCanonicalBranchTransferToRow,
  mapCanonicalStockToRow,
  mapClienteSheet,
  mapImportDispatchSheet,
  mapKardexSheet,
  mapMachineRegistrySheet,
  mapPedidoCompraSheet,
  mapMachineStockSheet,
  mapProductosSheet,
  mapSolicitudCompraSheet,
  mapSalesOrderSheet,
  mapSyntheticKardexSheet,
  mapPurchaseInvoiceSheet,
  mapSupplierSheet,
  mapBranchTransferSheet,
  mapStockSheet,
  parseSpreadsheetXml,
  persistMayorFile,
  persistReceivablesFile,
  readMayorPreflightFile,
  readReceivablesPreflightFile,
  readXmlFileText,
  prepareNewSystemImportBundle,
  reconcileCanonicalClientes,
  mergeKardexRows,
  mergeImportDispatchRows,
  mergeSalesOrderRows,
  mergeSyntheticKardexRows,
  mergePurchaseInvoiceRows,
  mergeSupplierRows,
  mergeBranchTransferRows,
  reconcileMachineStockChassis,
  persistNewSystemBundle,
  actualizarVentasRepuestosPeriodo,
  type CanonicalClienteRow,
  type CanonicalImportDispatchRow,
  type CanonicalKardexRow,
  type CanonicalPedidoCompraRow,
  type CanonicalSalesOrderRow,
  type CanonicalSyntheticKardexRow,
  type CanonicalPurchaseInvoiceRow,
  type CanonicalSupplierRow,
  type CanonicalBranchTransferRow,
  type CanonicalMachineStockRow,
  type CanonicalMachineRegistryRow,
  type MachineStockChassisReconciliation,
  type CanonicalProductRow,
  type CanonicalSolicitudCompraRow,
  type CanonicalStockRow,
  type ClienteInsert,
  type ClienteActualizacionImport,
  type ClienteExistenteImport,
  type KardexDiagnostics,
  type ImportDispatchDiagnostics,
  type SalesOrderDiagnostics,
  type SyntheticKardexDiagnostics,
  type PurchaseInvoiceDiagnostics,
  type MayorPreflight,
  type MayorPersistResult,
  type MayorRpcClient,
  type ReceivablesPreflight,
  type ReceivablesPersistResult,
  type ReceivablesRpcClient,
  syntheticValueDiffersFromBalance,
  TOTVS_FILE_KIND_LABELS,
  detectTotvsFileKind,
  type TotvsFileKind,
} from "@/lib/imports";
import { cn } from "@/lib/utils";

type FileKind = TotvsFileKind;
const KIND_LABELS = TOTVS_FILE_KIND_LABELS;

interface DetectedFile {
  file: File;
  kind: FileKind | "ignorar";
  cutoffDate?: string;
}

interface Preview {
  mayor: MayorPreflight[];
  receivables: ReceivablesPreflight[];
  productos: CanonicalProductRow[];
  stock: CanonicalStockRow[];
  stockMaquinas: CanonicalMachineStockRow[];
  machineRegistryRows: CanonicalMachineRegistryRow[];
  machineStockChassis: MachineStockChassisReconciliation;
  pedidos: CanonicalPedidoCompraRow[];
  solicitudes: CanonicalSolicitudCompraRow[];
  clientesTodos: CanonicalClienteRow[];
  clientesNuevos: ClienteInsert[];
  clientesActualizados: ClienteActualizacionImport[];
  kardex: CanonicalKardexRow[];
  kardexDiagnostics: KardexDiagnostics | null;
  kardexDuplicatesSkipped: number;
  dispatchRows: CanonicalImportDispatchRow[];
  dispatchDiagnostics: ImportDispatchDiagnostics | null;
  dispatchDuplicatesSkipped: number;
  salesOrders: CanonicalSalesOrderRow[];
  salesOrderDiagnostics: SalesOrderDiagnostics | null;
  salesOrderDuplicatesSkipped: number;
  syntheticKardex: CanonicalSyntheticKardexRow[];
  syntheticKardexDiagnostics: SyntheticKardexDiagnostics | null;
  syntheticKardexDuplicatesSkipped: number;
  purchaseInvoices: CanonicalPurchaseInvoiceRow[];
  purchaseInvoiceDiagnostics: PurchaseInvoiceDiagnostics | null;
  purchaseInvoiceDuplicatesSkipped: number;
  suppliers: CanonicalSupplierRow[];
  supplierDuplicatesSkipped: number;
  branchTransfers: CanonicalBranchTransferRow[];
  branchTransferDuplicatesSkipped: number;
  bundleFiles: { facturacion: { fileName: string; xmlText: string }; ordenesServicio: { fileName: string; xmlText: string }; productos: { fileName: string; xmlText: string } } | null;
  faltaParaTrio: string[];
}

function hasPersistablePreview(preview: Preview) {
  return Boolean(
    preview.mayor.length
    || preview.receivables.length
    || preview.bundleFiles
    || preview.productos.length
    || preview.stock.length
    || preview.stockMaquinas.length
    || preview.machineRegistryRows.length
    || preview.pedidos.length
    || preview.solicitudes.length
    || preview.clientesNuevos.length
    || preview.clientesActualizados.length
    || preview.kardex.length
    || preview.dispatchRows.length
    || preview.salesOrders.length
    || preview.syntheticKardex.length
    || preview.purchaseInvoices.length
    || preview.suppliers.length
    || preview.branchTransfers.length
  );
}

type KardexRpcResult = {
  insertadas?: number;
  actualizadas?: number;
  sin_cambios?: number;
};

type KardexRpcClient = {
  rpc: (
    name: "totvs_importar_kardex_lote_v1",
    params: { p_carga_id: string; p_filas: ReturnType<typeof mapCanonicalKardexToRow>[] },
  ) => Promise<{ data: KardexRpcResult | null; error: { code?: string; message?: string } | null }>;
};

type OperationalRpcResult = {
  insertadas?: number;
  actualizadas?: number;
  sin_cambios?: number;
};

type ImportDispatchRpcClient = {
  rpc: (
    name: "totvs_importar_despacho_lote_v1",
    params: { p_carga_id: string; p_filas: ReturnType<typeof mapCanonicalImportDispatchToRow>[] },
  ) => Promise<{ data: OperationalRpcResult | null; error: { code?: string; message?: string } | null }>;
};

type SalesOrderRpcClient = {
  rpc: (
    name: "totvs_importar_pedidos_venta_lote_v1",
    params: { p_carga_id: string; p_filas: ReturnType<typeof mapCanonicalSalesOrderToRow>[] },
  ) => Promise<{ data: OperationalRpcResult | null; error: { code?: string; message?: string } | null }>;
};

type SyntheticKardexRpcClient = {
  rpc: (
    name: "totvs_importar_kardex_sintetico_lote_v1",
    params: { p_carga_id: string; p_filas: ReturnType<typeof mapCanonicalSyntheticKardexToRow>[] },
  ) => Promise<{ data: OperationalRpcResult | null; error: { code?: string; message?: string } | null }>;
};

type PurchaseInvoiceRpcClient = {
  rpc: (
    name: "totvs_importar_facturas_compra_lote_v1",
    params: { p_carga_id: string; p_filas: ReturnType<typeof mapCanonicalPurchaseInvoiceToRow>[] },
  ) => Promise<{ data: OperationalRpcResult | null; error: { code?: string; message?: string } | null }>;
};

type SupplierRpcClient = {
  rpc: (
    name: "totvs_importar_proveedores_lote_v1",
    params: { p_carga_id: string; p_filas: ReturnType<typeof mapCanonicalSupplierToRow>[] },
  ) => Promise<{ data: OperationalRpcResult | null; error: { code?: string; message?: string } | null }>;
};

type BranchTransferRpcClient = {
  rpc: (
    name: "totvs_importar_transferencias_transito_lote_v1",
    params: { p_carga_id: string; p_filas: ReturnType<typeof mapCanonicalBranchTransferToRow>[] },
  ) => Promise<{ data: OperationalRpcResult | null; error: { code?: string; message?: string } | null }>;
};

export function ImportarTotvsTab({ onChanged }: { onChanged: () => void }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [detected, setDetected] = useState<DetectedFile[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const filesInputRef = useRef<HTMLInputElement>(null);

  const openFolderPicker = () => {
    const el = folderInputRef.current;
    if (!el) return;
    el.setAttribute("webkitdirectory", "");
    el.setAttribute("directory", "");
    el.click();
  };

  const addFiles = (fileList: FileList | File[]) => {
    const xmlFiles = Array.from(fileList).filter((file) => file.name.toLowerCase().endsWith(".xml"));
    if (xmlFiles.length === 0) {
      toast.error("No encontré archivos .xml entre lo seleccionado.");
      return;
    }

    setDetected((prev) => {
      const existingNames = new Set(prev.map((d) => d.file.name));
      const nuevos = xmlFiles
        .filter((file) => !existingNames.has(file.name))
        .map((file) => {
          const kind = detectTotvsFileKind(file.name);
          return { file, kind, cutoffDate: kind === "cuentas_cobrar" ? "" : undefined };
        });
      return [...prev, ...nuevos];
    });
    setPreview(null);
  };

  const removeFile = (name: string) => {
    setDetected((prev) => prev.filter((d) => d.file.name !== name));
    setPreview(null);
  };

  const setKind = (name: string, kind: DetectedFile["kind"]) => {
    setDetected((prev) => prev.map((d) => (d.file.name === name
      ? { ...d, kind, cutoffDate: kind === "cuentas_cobrar" ? d.cutoffDate ?? "" : undefined }
      : d)));
    setPreview(null);
  };

  const setCutoffDate = (name: string, cutoffDate: string) => {
    setDetected((prev) => prev.map((d) => (d.file.name === name ? { ...d, cutoffDate } : d)));
    setPreview(null);
  };

  const usableFiles = useMemo(() => detected.filter((d) => d.kind !== "ignorar"), [detected]);
  const duplicateKinds = useMemo(() => {
    const counts = new Map<FileKind, number>();
    for (const d of usableFiles) {
      if (d.kind === "ignorar") continue;
      counts.set(d.kind, (counts.get(d.kind) ?? 0) + 1);
    }
    return counts;
  }, [usableFiles]);

  const leerArchivos = async () => {
    if (usableFiles.length === 0) {
      toast.error("Asigná al menos un archivo a alguno de los tipos disponibles.");
      return;
    }
    const missingCutoff = usableFiles.find((item) => item.kind === "cuentas_cobrar" && !item.cutoffDate);
    if (missingCutoff) {
      toast.error(`Confirmá la fecha de corte de ${missingCutoff.file.name}. No se infiere desde la fecha del archivo.`);
      return;
    }

    setBusy(true);
    try {
      const mayor: MayorPreflight[] = [];
      const receivables: ReceivablesPreflight[] = [];
      const productos: CanonicalProductRow[] = [];
      const stock: CanonicalStockRow[] = [];
      let stockMaquinas: CanonicalMachineStockRow[] = [];
      const machineRegistryRows: CanonicalMachineRegistryRow[] = [];
      const pedidos: CanonicalPedidoCompraRow[] = [];
      const solicitudes: CanonicalSolicitudCompraRow[] = [];
      const kardexUnmerged: CanonicalKardexRow[] = [];
      const dispatchUnmerged: CanonicalImportDispatchRow[] = [];
      const salesOrdersUnmerged: CanonicalSalesOrderRow[] = [];
      const syntheticKardexUnmerged: CanonicalSyntheticKardexRow[] = [];
      const purchaseInvoicesUnmerged: CanonicalPurchaseInvoiceRow[] = [];
      const suppliersUnmerged: CanonicalSupplierRow[] = [];
      const branchTransfersUnmerged: CanonicalBranchTransferRow[] = [];
      let clientesTodos: CanonicalClienteRow[] = [];
      let osTexto: { fileName: string; xmlText: string } | null = null;
      let facturacionTexto: { fileName: string; xmlText: string } | null = null;
      let productosTexto: { fileName: string; xmlText: string } | null = null;

      for (const { file, kind, cutoffDate } of usableFiles) {
        try {
          if (kind === "mayor") {
            mayor.push(await readMayorPreflightFile(file, file.name));
            continue;
          }
          if (kind === "cuentas_cobrar") {
            receivables.push(await readReceivablesPreflightFile(file, file.name, {
              cutoffDate: cutoffDate ?? "",
              sourceLastModified: file.lastModified,
            }));
            continue;
          }
          const xmlText = await readXmlFileText(file);

          if (kind === "os") {
            osTexto = { fileName: file.name, xmlText };
            continue;
          }
          if (kind === "facturacion") {
            facturacionTexto = { fileName: file.name, xmlText };
            continue;
          }

          const workbook = parseSpreadsheetXml(xmlText);
          const sheet = workbook.sheets[0];
          if (!sheet) throw new Error("no contiene una hoja legible");

          if (kind === "productos") {
            productosTexto = { fileName: file.name, xmlText };
            productos.push(...mapProductosSheet(file.name, sheet).rows);
          } else if (kind === "stock") {
            stock.push(...mapStockSheet(file.name, sheet).rows);
          } else if (kind === "stock_maquinas") {
            stockMaquinas.push(...mapMachineStockSheet(file.name, sheet).rows);
          } else if (kind === "maquinarias") {
            machineRegistryRows.push(...mapMachineRegistrySheet(file.name, sheet).rows);
          } else if (kind === "pedidos") {
            pedidos.push(...mapPedidoCompraSheet(file.name, sheet).rows);
          } else if (kind === "solicitudes") {
            solicitudes.push(...mapSolicitudCompraSheet(file.name, sheet).rows);
          } else if (kind === "clientes") {
            clientesTodos = mapClienteSheet(file.name, sheet).rows;
          } else if (kind === "kardex") {
            kardexUnmerged.push(...mapKardexSheet(file.name, sheet).rows);
          } else if (kind === "despacho") {
            dispatchUnmerged.push(...mapImportDispatchSheet(file.name, sheet).rows);
          } else if (kind === "pedidos_venta") {
            salesOrdersUnmerged.push(...mapSalesOrderSheet(file.name, sheet).rows);
          } else if (kind === "kardex_sintetico") {
            syntheticKardexUnmerged.push(...mapSyntheticKardexSheet(file.name, sheet).rows);
          } else if (kind === "facturas_compra") {
            purchaseInvoicesUnmerged.push(...mapPurchaseInvoiceSheet(file.name, sheet).rows);
          } else if (kind === "proveedores") {
            suppliersUnmerged.push(...mapSupplierSheet(file.name, sheet).rows);
          } else if (kind === "transferencias_transito") {
            branchTransfersUnmerged.push(...mapBranchTransferSheet(file.name, sheet).rows);
          }
        } catch (error) {
          throw new Error(`${file.name}: ${(error as Error).message}`);
        }
      }

      const kardexMerged = mergeKardexRows(kardexUnmerged);
      const kardexDates = kardexMerged.rows.map((row) => row.movementDate).sort();
      const kardexDiagnostics: KardexDiagnostics | null = kardexMerged.rows.length ? {
        rows: kardexMerged.rows.length,
        from: kardexDates[0] ?? null,
        to: kardexDates[kardexDates.length - 1] ?? null,
        branches: new Set(kardexMerged.rows.map((row) => row.branch)).size,
        warehouses: new Set(kardexMerged.rows.map((row) => row.warehouse)).size,
        currencyCodes: [...new Set(kardexMerged.rows.map((row) => row.currencyCode))].sort(),
        duplicateKeys: 0,
      } : null;
      const dispatchMerged = mergeImportDispatchRows(dispatchUnmerged);
      const dispatchDates = dispatchMerged.rows.map((row) => row.processDate).sort();
      const dispatchDiagnostics: ImportDispatchDiagnostics | null = dispatchMerged.rows.length ? {
        rows: dispatchMerged.rows.length,
        from: dispatchDates[0] ?? null,
        to: dispatchDates[dispatchDates.length - 1] ?? null,
        branches: new Set(dispatchMerged.rows.map((row) => row.branch)).size,
        processes: new Set(dispatchMerged.rows.map((row) => `${row.branch}|${row.processNumber}`)).size,
        quantity: dispatchMerged.rows.reduce((sum, row) => sum + row.quantity, 0),
        duplicateKeys: 0,
      } : null;
      const salesOrdersMerged = mergeSalesOrderRows(salesOrdersUnmerged);
      const salesOrderDates = salesOrdersMerged.rows.map((row) => row.emissionDate).sort();
      const pendingSalesOrderRows = salesOrdersMerged.rows.filter((row) => row.pendingQuantity !== 0);
      const salesOrderDiagnostics: SalesOrderDiagnostics | null = salesOrdersMerged.rows.length ? {
        rows: salesOrdersMerged.rows.length,
        from: salesOrderDates[0] ?? null,
        to: salesOrderDates[salesOrderDates.length - 1] ?? null,
        branches: new Set(salesOrdersMerged.rows.map((row) => row.branch)).size,
        ordersByBranch: new Set(salesOrdersMerged.rows.map((row) => `${row.branch}|${row.orderNumber}`)).size,
        pendingRows: pendingSalesOrderRows.length,
        pendingQuantity: Number(pendingSalesOrderRows.reduce((sum, row) => sum + row.pendingQuantity, 0).toFixed(6)),
        duplicateKeys: 0,
      } : null;
      const syntheticKardexMerged = mergeSyntheticKardexRows(syntheticKardexUnmerged);
      const syntheticKardexDiagnostics: SyntheticKardexDiagnostics | null = syntheticKardexMerged.rows.length ? {
        rows: syntheticKardexMerged.rows.length,
        branches: new Set(syntheticKardexMerged.rows.map((row) => row.branch)).size,
        warehouses: new Set(syntheticKardexMerged.rows.map((row) => row.warehouse)).size,
        products: new Set(syntheticKardexMerged.rows.map((row) => row.productCode)).size,
        chassisRows: syntheticKardexMerged.rows.filter((row) => row.chassis).length,
        positiveBalances: syntheticKardexMerged.rows.filter((row) => row.balance > 0).length,
        negativeBalances: syntheticKardexMerged.rows.filter((row) => row.balance < 0).length,
        zeroBalances: syntheticKardexMerged.rows.filter((row) => row.balance === 0).length,
        valueFormulaMismatches: syntheticKardexMerged.rows.filter(syntheticValueDiffersFromBalance).length,
        valuationDate: null,
      } : null;
      const purchaseInvoicesMerged = mergePurchaseInvoiceRows(purchaseInvoicesUnmerged);
      const purchaseDates = purchaseInvoicesMerged.rows.map((row) => row.emissionDate).sort();
      const purchaseInvoiceDiagnostics: PurchaseInvoiceDiagnostics | null = purchaseInvoicesMerged.rows.length ? {
        rows: purchaseInvoicesMerged.rows.length,
        from: purchaseDates[0] ?? null,
        to: purchaseDates[purchaseDates.length - 1] ?? null,
        suppliers: new Set(purchaseInvoicesMerged.rows.map((row) => `${row.supplierCode}|${row.supplierStore}`)).size,
        documents: new Set(purchaseInvoicesMerged.rows.map((row) => `${row.branch}|${row.series}|${row.documentNumber}`)).size,
        sourceCurrencies: [...new Set(purchaseInvoicesMerged.rows.map((row) => row.sourceCurrency))].sort(),
        documentKinds: [...new Set(purchaseInvoicesMerged.rows.map((row) => row.documentKind))].sort(),
      } : null;
      const suppliersMerged = mergeSupplierRows(suppliersUnmerged);
      const branchTransfersMerged = mergeBranchTransferRows(branchTransfersUnmerged);

      // El trio OS+Facturacion+Productos va junto (se cruzan entre si) o no
      // va: si falta alguno, se avisa y no se arma el bundle todavia.
      const faltaParaTrio: string[] = [];
      if (osTexto || facturacionTexto) {
        if (!osTexto) faltaParaTrio.push(KIND_LABELS.os);
        if (!facturacionTexto) faltaParaTrio.push(KIND_LABELS.facturacion);
        if (!productosTexto) faltaParaTrio.push(KIND_LABELS.productos);
      }

      const bundleFiles =
        osTexto && facturacionTexto && productosTexto
          ? { facturacion: facturacionTexto, ordenesServicio: osTexto, productos: productosTexto }
          : null;

      const machineStockChassis = machineRegistryRows.length
        ? reconcileMachineStockChassis(stockMaquinas, machineRegistryRows)
        : {
            rows: stockMaquinas,
            matched: 0,
            filledFromRegistry: 0,
            unresolvedPlaceholders: 0,
            ambiguousProductCodes: 0,
            validConflicts: 0,
          };
      stockMaquinas = machineStockChassis.rows;

      let clientesNuevos: ClienteInsert[] = [];
      let clientesActualizados: ClienteActualizacionImport[] = [];
      if (clientesTodos.length > 0) {
        // El codigo de TOTVS (Codigo/cod_entidad) es el RUC. Los clientes
        // cargados por el sistema viejo suelen tener un cod_entidad interno
        // distinto (numero corto de secuencia) pero SI tienen el RUC
        // correcto guardado en su propio campo -- comparar solo contra
        // cod_entidad duplicaba a casi toda la base. Se compara contra
        // cod_entidad Y ruc de lo ya existente.
        const existentes = await cargarTodo<ClienteExistenteImport>(
          supabase.from("clientes").select("id,cod_entidad,nombre,ruc,direccion,localidad,correo_principal,telefono,region,sucursal,activo"),
        );
        const reconciliacion = reconcileCanonicalClientes(clientesTodos, existentes);
        clientesNuevos = reconciliacion.nuevos;
        clientesActualizados = reconciliacion.actualizaciones;
      }

      setPreview({
        mayor,
        receivables,
        productos,
        stock,
        stockMaquinas,
        machineRegistryRows,
        machineStockChassis,
        pedidos,
        solicitudes,
        clientesTodos,
        clientesNuevos,
        clientesActualizados,
        kardex: kardexMerged.rows,
        kardexDiagnostics,
        kardexDuplicatesSkipped: kardexMerged.duplicatesSkipped,
        dispatchRows: dispatchMerged.rows,
        dispatchDiagnostics,
        dispatchDuplicatesSkipped: dispatchMerged.duplicatesSkipped,
        salesOrders: salesOrdersMerged.rows,
        salesOrderDiagnostics,
        salesOrderDuplicatesSkipped: salesOrdersMerged.duplicatesSkipped,
        syntheticKardex: syntheticKardexMerged.rows,
        syntheticKardexDiagnostics,
        syntheticKardexDuplicatesSkipped: syntheticKardexMerged.duplicatesSkipped,
        purchaseInvoices: purchaseInvoicesMerged.rows,
        purchaseInvoiceDiagnostics,
        purchaseInvoiceDuplicatesSkipped: purchaseInvoicesMerged.duplicatesSkipped,
        suppliers: suppliersMerged.rows,
        supplierDuplicatesSkipped: suppliersMerged.duplicatesSkipped,
        branchTransfers: branchTransfersMerged.rows,
        branchTransferDuplicatesSkipped: branchTransfersMerged.duplicatesSkipped,
        bundleFiles,
        faltaParaTrio,
      });

      const partes = [
        mayor.length ? `${mayor.reduce((sum, item) => sum + item.movementRows, 0)} movimientos de Mayor (preflight)` : null,
        receivables.length ? `${receivables.reduce((sum, item) => sum + item.documentRows, 0)} cuotas de cuentas por cobrar (preflight)` : null,
        bundleFiles ? "OS + Facturación" : null,
        productos.length ? `${productos.length} productos` : null,
        stock.length ? `${stock.length} filas de stock` : null,
        stockMaquinas.length ? `${stockMaquinas.length} máquinas en stock` : null,
        machineRegistryRows.length ? `${machineRegistryRows.length} referencias de chasis` : null,
        machineStockChassis.filledFromRegistry ? `${machineStockChassis.filledFromRegistry} chasis completados` : null,
        pedidos.length ? `${pedidos.length} líneas de pedido` : null,
        solicitudes.length ? `${solicitudes.length} líneas de solicitud` : null,
        clientesTodos.length ? `${clientesNuevos.length} clientes nuevos y ${clientesActualizados.length} actualizados` : null,
        kardexMerged.rows.length ? `${kardexMerged.rows.length} movimientos de Kardex` : null,
        dispatchMerged.rows.length ? `${dispatchMerged.rows.length} l\u00edneas de despacho` : null,
        salesOrdersMerged.rows.length ? `${salesOrdersMerged.rows.length} l\u00edneas de pedidos de venta` : null,
        syntheticKardexMerged.rows.length ? `${syntheticKardexMerged.rows.length} posiciones valorizadas de Kardex` : null,
        purchaseInvoicesMerged.rows.length ? `${purchaseInvoicesMerged.rows.length} líneas de facturas de compra` : null,
        suppliersMerged.rows.length ? `${suppliersMerged.rows.length} proveedores` : null,
        branchTransfersMerged.rows.length ? `${branchTransfersMerged.rows.length} transferencias en tránsito` : null,
      ].filter(Boolean);
      toast.success(partes.length > 0 ? `Leído: ${partes.join(", ")}.` : "Nada para importar todavía.");
    } catch (e) {
      toast.error("Error leyendo XML: " + (e as Error).message);
      setPreview(null);
    } finally {
      setBusy(false);
    }
  };

  const confirmar = async () => {
    if (!preview || !user) return;

    setBusy(true);
    try {
      let facturacionLineas = 0;
      let facturacionExcluidas = 0;
      let ordenesServicioOmitidas = 0;
      let ordenesServicio = 0;
      let ordenesServicioArchivadas = 0;
      let ordenesServicioBloqueadas = 0;
      let facturacionDesde: string | null = null;
      let facturacionHasta: string | null = null;
      let historialRepuestosError: string | null = null;
      let kardexInsertadas = 0;
      let kardexActualizadas = 0;
      let kardexSinCambios = 0;
      let dispatchInsertadas = 0;
      let dispatchActualizadas = 0;
      let dispatchSinCambios = 0;
      let salesOrdersInsertadas = 0;
      let salesOrdersActualizadas = 0;
      let salesOrdersSinCambios = 0;
      let syntheticKardexInsertadas = 0;
      let syntheticKardexActualizadas = 0;
      let syntheticKardexSinCambios = 0;
      let purchaseInvoicesInsertadas = 0;
      let purchaseInvoicesActualizadas = 0;
      let purchaseInvoicesSinCambios = 0;
      let suppliersInsertados = 0;
      let suppliersActualizados = 0;
      let suppliersSinCambios = 0;
      let branchTransfersInsertadas = 0;
      let branchTransfersActualizadas = 0;
      let branchTransfersSinCambios = 0;
      const mayorResultados: MayorPersistResult[] = [];
      const receivablesResultados: ReceivablesPersistResult[] = [];

      const mayorFiles = usableFiles.filter((item) => item.kind === "mayor").map((item) => item.file);
      if (mayorFiles.length !== preview.mayor.length) {
        throw new Error("Los archivos del Mayor cambiaron después del preflight; volvé a leerlos antes de confirmar.");
      }
      for (const file of mayorFiles) {
        mayorResultados.push(await persistMayorFile({
          file,
          client: supabase as unknown as MayorRpcClient,
        }));
      }

      const receivablesFiles = usableFiles.filter((item) => item.kind === "cuentas_cobrar");
      if (receivablesFiles.length !== preview.receivables.length) {
        throw new Error("Los archivos de cuentas por cobrar cambiaron después del preflight; volvé a leerlos antes de confirmar.");
      }
      for (const item of receivablesFiles) {
        receivablesResultados.push(await persistReceivablesFile({
          file: item.file,
          client: supabase as unknown as ReceivablesRpcClient,
          cutoffDate: item.cutoffDate ?? "",
        }));
      }

      const newSystemBundle = preview.bundleFiles
        ? prepareNewSystemImportBundle({
          facturacion: preview.bundleFiles.facturacion,
          ordenesServicio: preview.bundleFiles.ordenesServicio,
          productos: preview.bundleFiles.productos,
          usuarioId: user.id,
        })
        : null;

      // El mismo RPC que persiste el lote se ejecuta en una subtransaccion
      // descartada antes de tocar clientes. Esto evita escrituras del maestro
      // ante errores deterministas del paquete, sin prometer atomicidad global
      // entre las llamadas HTTP posteriores.
      if (newSystemBundle && preview.bundleFiles) {
        await persistNewSystemBundle({
          bundle: newSystemBundle,
          userId: user.id,
          mode: "validate",
          fileNames: {
            facturacion: preview.bundleFiles.facturacion.fileName,
            ordenesServicio: preview.bundleFiles.ordenesServicio.fileName,
            productos: preview.bundleFiles.productos.fileName,
          },
        });
      }

      // El maestro se aplica antes que facturacion/OS: asi las lineas del
      // mismo lote ya resuelven contra el nombre y RUC corregidos.
      for (let i = 0; i < preview.clientesNuevos.length; i += 500) {
        const chunk = preview.clientesNuevos.slice(i, i + 500);
        const { data, error } = await (supabase.from("clientes").insert(chunk as any).select("id, nombre, telefono, correo_principal") as any);
        if (error) throw error;

        const contactosNuevos = ((data ?? []) as any[])
          .filter((c) => c.telefono || c.correo_principal)
          .map((c) => ({
            cliente_id: c.id,
            nombre: c.nombre,
            telefono: c.telefono,
            correo: c.correo_principal,
            es_principal: true,
          }));
        if (contactosNuevos.length > 0) {
          const { error: contactoError } = await supabase.from("contactos_cliente").insert(contactosNuevos as any);
          if (contactoError) throw contactoError;
        }
      }

      for (let i = 0; i < preview.clientesActualizados.length; i += 500) {
        const chunk = preview.clientesActualizados.slice(i, i + 500);
        const { error } = await supabase.from("clientes").upsert(chunk as any, { onConflict: "id" });
        if (error) throw error;
      }

      if (preview.bundleFiles && newSystemBundle) {
        const resultado = await persistNewSystemBundle({
          bundle: newSystemBundle,
          userId: user.id,
          fileNames: {
            facturacion: preview.bundleFiles.facturacion.fileName,
            ordenesServicio: preview.bundleFiles.ordenesServicio.fileName,
            productos: preview.bundleFiles.productos.fileName,
          },
        });
        facturacionLineas = resultado.facturacionLineas;
        facturacionExcluidas = resultado.facturacionExcluidas;
        ordenesServicioOmitidas = resultado.ordenesServicioOmitidas;
        ordenesServicio = resultado.ordenesServicio;
        ordenesServicioArchivadas = resultado.ordenesServicioArchivadas;
        ordenesServicioBloqueadas = resultado.ordenesServicioBloqueadas;
        facturacionDesde = resultado.facturacionDesde;
        facturacionHasta = resultado.facturacionHasta;
        historialRepuestosError = resultado.historialRepuestosError;
      }

      const productoRows = preview.productos.map(mapCanonicalProductToRow).filter((r): r is NonNullable<typeof r> => r !== null);
      const stockRows = preview.stock.map(mapCanonicalStockToRow).filter((r): r is NonNullable<typeof r> => r !== null);
      const machineStockRows = preview.stockMaquinas.map(mapCanonicalMachineStockToRow);
      const pedidoRows = preview.pedidos.map(mapCanonicalPedidoCompraToRow).filter((r): r is NonNullable<typeof r> => r !== null);
      const solicitudRows = preview.solicitudes.map(mapCanonicalSolicitudCompraToRow).filter((r): r is NonNullable<typeof r> => r !== null);
      const kardexRows = preview.kardex.map(mapCanonicalKardexToRow);
      const dispatchRows = preview.dispatchRows.map(mapCanonicalImportDispatchToRow);
      const salesOrderRows = preview.salesOrders.map(mapCanonicalSalesOrderToRow);
      const syntheticKardexRows = preview.syntheticKardex.map(mapCanonicalSyntheticKardexToRow);
      const purchaseInvoiceRows = preview.purchaseInvoices.map(mapCanonicalPurchaseInvoiceToRow);
      const supplierRows = preview.suppliers.map(mapCanonicalSupplierToRow);
      const branchTransferRows = preview.branchTransfers.map(mapCanonicalBranchTransferToRow);

      for (let i = 0; i < productoRows.length; i += 500) {
        const chunk = productoRows.slice(i, i + 500);
        const { error } = await (supabase.from("productos" as any).upsert(chunk, { onConflict: "codigo_interno" }) as any);
        if (error) throw error;
      }

      if (stockRows.length > 0) {
        const { error: deleteError } = await (supabase.from("repuestos_stock" as any).delete().not("producto_codigo", "is", null) as any);
        if (deleteError) throw deleteError;

        for (let i = 0; i < stockRows.length; i += 500) {
          const { error } = await (supabase.from("repuestos_stock" as any).insert(stockRows.slice(i, i + 500)) as any);
          if (error) throw error;
        }
      }

      if (machineStockRows.length > 0) {
        const cargaId = crypto.randomUUID();
        // La RPC reemplaza la foto completa en una sola transacción y conserva
        // cada fila física/chasis aunque varias compartan producto_codigo.
        const { error } = await (supabase as any).rpc("parque_reemplazar_stock_maquinas", {
          p_carga_id: cargaId,
          p_filas: machineStockRows,
        });
        if (error) throw error;
      }

      // Se repite después del maestro porque el lote puede incorporar SKU
      // nuevos que todavía no existían cuando se guardó la facturación.
      if (facturacionDesde && facturacionHasta) {
        const historial = await actualizarVentasRepuestosPeriodo(facturacionDesde, facturacionHasta);
        historialRepuestosError = historial.error;
      }

      for (let i = 0; i < pedidoRows.length; i += 500) {
        const { error } = await (supabase.from("compras_pedidos" as any).upsert(pedidoRows.slice(i, i + 500), {
          onConflict: "sucursal,nro_pedido,item",
        }) as any);
        if (error) throw error;
      }

      for (let i = 0; i < solicitudRows.length; i += 500) {
        const { error } = await (supabase.from("compras_solicitudes" as any).upsert(solicitudRows.slice(i, i + 500), {
          onConflict: "sucursal,nro_solicitud,item",
        }) as any);
        if (error) throw error;
      }

      if (kardexRows.length > 0) {
        const cargaId = crypto.randomUUID();
        for (let i = 0; i < kardexRows.length; i += 500) {
          const { data, error } = await (supabase as unknown as KardexRpcClient).rpc("totvs_importar_kardex_lote_v1", {
            p_carga_id: cargaId,
            p_filas: kardexRows.slice(i, i + 500),
          });
          if (error) {
            if (error.code === "PGRST202" || error.code === "42883") {
              throw new Error("Falta aplicar la migraci\u00f3n local de Kardex antes de confirmar esta fuente.");
            }
            if (error.code === "23505") {
              throw new Error("El Kardex contiene claves TABLA + RECNO ya cargadas con otra versi\u00f3n. No se sobrescribi\u00f3 ning\u00fan movimiento; revis\u00e1 la fuente y su trazabilidad.");
            }
            throw error;
          }
          kardexInsertadas += Number(data?.insertadas ?? 0);
          kardexActualizadas += Number(data?.actualizadas ?? 0);
          kardexSinCambios += Number(data?.sin_cambios ?? 0);
        }

        await supabase.from("importaciones").insert({
          usuario_id: user.id,
          tipo: "parque",
          total_filas: kardexRows.length,
          insertados: kardexInsertadas + kardexActualizadas,
          duplicados: kardexSinCambios + preview.kardexDuplicatesSkipped,
          archivo_nombre: usableFiles.filter((d) => d.kind === "kardex").map((d) => d.file.name).join(", "),
          metadata: {
            fuente: "totvs_kardex_analitico",
            filas_insertadas: kardexInsertadas,
            filas_actualizadas: kardexActualizadas,
            filas_sin_cambios: kardexSinCambios,
            duplicados_entre_archivos: preview.kardexDuplicatesSkipped,
            fecha_desde: preview.kardexDiagnostics?.from,
            fecha_hasta: preview.kardexDiagnostics?.to,
            codigos_moneda: preview.kardexDiagnostics?.currencyCodes,
            clave: "TABLA+RECNO",
          },
        } as never);
      }

      if (dispatchRows.length > 0) {
        const cargaId = crypto.randomUUID();
        for (let i = 0; i < dispatchRows.length; i += 500) {
          const { data, error } = await (supabase as unknown as ImportDispatchRpcClient).rpc("totvs_importar_despacho_lote_v1", {
            p_carga_id: cargaId,
            p_filas: dispatchRows.slice(i, i + 500),
          });
          if (error) {
            if (error.code === "PGRST202" || error.code === "42883") {
              throw new Error("Falta aplicar la migraci\u00f3n local de Importaciones - Despacho antes de confirmar esta fuente.");
            }
            throw error;
          }
          dispatchInsertadas += Number(data?.insertadas ?? 0);
          dispatchActualizadas += Number(data?.actualizadas ?? 0);
          dispatchSinCambios += Number(data?.sin_cambios ?? 0);
        }
        await supabase.from("importaciones").insert({
          usuario_id: user.id,
          tipo: "repuestos",
          total_filas: dispatchRows.length,
          insertados: dispatchInsertadas + dispatchActualizadas,
          duplicados: dispatchSinCambios + preview.dispatchDuplicatesSkipped,
          archivo_nombre: usableFiles.filter((d) => d.kind === "despacho").map((d) => d.file.name).join(", "),
          metadata: {
            fuente: "totvs_importaciones_despacho",
            filas_insertadas: dispatchInsertadas,
            filas_actualizadas: dispatchActualizadas,
            filas_sin_cambios: dispatchSinCambios,
            duplicados_entre_archivos: preview.dispatchDuplicatesSkipped,
            fecha_desde: preview.dispatchDiagnostics?.from,
            fecha_hasta: preview.dispatchDiagnostics?.to,
            procesos: preview.dispatchDiagnostics?.processes,
            cobertura_parcial: true,
            clave: "Sucursal+Proceso+ItemProceso+Documento+ItemDocumento+Producto",
          },
        } as never);
      }

      if (salesOrderRows.length > 0) {
        const cargaId = crypto.randomUUID();
        for (let i = 0; i < salesOrderRows.length; i += 500) {
          const { data, error } = await (supabase as unknown as SalesOrderRpcClient).rpc("totvs_importar_pedidos_venta_lote_v1", {
            p_carga_id: cargaId,
            p_filas: salesOrderRows.slice(i, i + 500),
          });
          if (error) {
            if (error.code === "PGRST202" || error.code === "42883") {
              throw new Error("Falta aplicar la migraci\u00f3n local de Pedidos de Venta antes de confirmar esta fuente.");
            }
            throw error;
          }
          salesOrdersInsertadas += Number(data?.insertadas ?? 0);
          salesOrdersActualizadas += Number(data?.actualizadas ?? 0);
          salesOrdersSinCambios += Number(data?.sin_cambios ?? 0);
        }
        await supabase.from("importaciones").insert({
          usuario_id: user.id,
          tipo: "repuestos",
          total_filas: salesOrderRows.length,
          insertados: salesOrdersInsertadas + salesOrdersActualizadas,
          duplicados: salesOrdersSinCambios + preview.salesOrderDuplicatesSkipped,
          archivo_nombre: usableFiles.filter((d) => d.kind === "pedidos_venta").map((d) => d.file.name).join(", "),
          metadata: {
            fuente: "totvs_pedidos_venta",
            filas_insertadas: salesOrdersInsertadas,
            filas_actualizadas: salesOrdersActualizadas,
            filas_sin_cambios: salesOrdersSinCambios,
            duplicados_entre_archivos: preview.salesOrderDuplicatesSkipped,
            fecha_desde: preview.salesOrderDiagnostics?.from,
            fecha_hasta: preview.salesOrderDiagnostics?.to,
            lineas_pendientes: preview.salesOrderDiagnostics?.pendingRows,
            cantidad_pendiente: preview.salesOrderDiagnostics?.pendingQuantity,
            cobertura_parcial: true,
            clave: "FILIAL+NroPedido+Item",
          },
        } as never);
      }

      if (syntheticKardexRows.length > 0) {
        const cargaId = crypto.randomUUID();
        for (let i = 0; i < syntheticKardexRows.length; i += 500) {
          const { data, error } = await (supabase as unknown as SyntheticKardexRpcClient).rpc("totvs_importar_kardex_sintetico_lote_v1", {
            p_carga_id: cargaId,
            p_filas: syntheticKardexRows.slice(i, i + 500),
          });
          if (error) {
            if (error.code === "PGRST202" || error.code === "42883") {
              throw new Error("Falta aplicar la migraci\u00f3n local de Kardex sint\u00e9tico antes de confirmar esta fuente.");
            }
            throw error;
          }
          syntheticKardexInsertadas += Number(data?.insertadas ?? 0);
          syntheticKardexActualizadas += Number(data?.actualizadas ?? 0);
          syntheticKardexSinCambios += Number(data?.sin_cambios ?? 0);
        }
        await supabase.from("importaciones").insert({
          usuario_id: user.id,
          tipo: "repuestos",
          total_filas: syntheticKardexRows.length,
          insertados: syntheticKardexInsertadas + syntheticKardexActualizadas,
          duplicados: syntheticKardexSinCambios + preview.syntheticKardexDuplicatesSkipped,
          archivo_nombre: usableFiles.filter((d) => d.kind === "kardex_sintetico").map((d) => d.file.name).join(", "),
          metadata: {
            fuente: "totvs_kardex_sintetico",
            filas_insertadas: syntheticKardexInsertadas,
            filas_actualizadas: syntheticKardexActualizadas,
            filas_sin_cambios: syntheticKardexSinCambios,
            duplicados_entre_archivos: preview.syntheticKardexDuplicatesSkipped,
            fecha_valorizacion_fuente: null,
            ejes_costo: ["PPP1/VALOR_1", "PPP2/VALOR_2", "PPP3/VALOR_3"],
            moneda_ejes_confirmada: false,
            clave: "SUCURSAL+CODIGO+DEPOSITO+Chasis",
          },
        } as never);
      }

      if (purchaseInvoiceRows.length > 0) {
        const cargaId = crypto.randomUUID();
        for (let i = 0; i < purchaseInvoiceRows.length; i += 500) {
          const { data, error } = await (supabase as unknown as PurchaseInvoiceRpcClient).rpc("totvs_importar_facturas_compra_lote_v1", {
            p_carga_id: cargaId,
            p_filas: purchaseInvoiceRows.slice(i, i + 500),
          });
          if (error) {
            if (error.code === "PGRST202" || error.code === "42883") throw new Error("Falta aplicar la migración local de Facturas de Compra antes de confirmar esta fuente.");
            throw error;
          }
          purchaseInvoicesInsertadas += Number(data?.insertadas ?? 0);
          purchaseInvoicesActualizadas += Number(data?.actualizadas ?? 0);
          purchaseInvoicesSinCambios += Number(data?.sin_cambios ?? 0);
        }
        await supabase.from("importaciones").insert({
          usuario_id: user.id, tipo: "repuestos", total_filas: purchaseInvoiceRows.length,
          insertados: purchaseInvoicesInsertadas + purchaseInvoicesActualizadas,
          duplicados: purchaseInvoicesSinCambios + preview.purchaseInvoiceDuplicatesSkipped,
          archivo_nombre: usableFiles.filter((d) => d.kind === "facturas_compra").map((d) => d.file.name).join(", "),
          metadata: {
            fuente: "totvs_facturas_compra", filas_insertadas: purchaseInvoicesInsertadas,
            filas_actualizadas: purchaseInvoicesActualizadas, filas_sin_cambios: purchaseInvoicesSinCambios,
            fecha_desde: preview.purchaseInvoiceDiagnostics?.from, fecha_hasta: preview.purchaseInvoiceDiagnostics?.to,
            monedas_fuente: preview.purchaseInvoiceDiagnostics?.sourceCurrencies,
            especies: preview.purchaseInvoiceDiagnostics?.documentKinds,
            clave: "FILIAL+PROVEEDOR+LOJA+SERIE+DOCUMENTO+ITEM",
            sin_conversion_monetaria: true,
          },
        } as never);
      }

      if (supplierRows.length > 0) {
        const cargaId = crypto.randomUUID();
        for (let i = 0; i < supplierRows.length; i += 500) {
          const { data, error } = await (supabase as unknown as SupplierRpcClient).rpc("totvs_importar_proveedores_lote_v1", {
            p_carga_id: cargaId,
            p_filas: supplierRows.slice(i, i + 500),
          });
          if (error) {
            if (error.code === "PGRST202" || error.code === "42883") throw new Error("Falta aplicar la migración local del Maestro de Proveedores antes de confirmar esta fuente.");
            throw error;
          }
          suppliersInsertados += Number(data?.insertadas ?? 0);
          suppliersActualizados += Number(data?.actualizadas ?? 0);
          suppliersSinCambios += Number(data?.sin_cambios ?? 0);
        }
        await supabase.from("importaciones").insert({
          usuario_id: user.id, tipo: "repuestos", total_filas: supplierRows.length,
          insertados: suppliersInsertados + suppliersActualizados,
          duplicados: suppliersSinCambios + preview.supplierDuplicatesSkipped,
          archivo_nombre: usableFiles.filter((d) => d.kind === "proveedores").map((d) => d.file.name).join(", "),
          metadata: {
            fuente: "totvs_maestro_proveedores", filas_insertadas: suppliersInsertados,
            filas_actualizadas: suppliersActualizados, filas_sin_cambios: suppliersSinCambios,
            clave: "Codigo+Tienda",
            banderas_retencion_sin_reinterpretar: true,
          },
        } as never);
      }

      if (branchTransferRows.length > 0) {
        const cargaId = crypto.randomUUID();
        for (let i = 0; i < branchTransferRows.length; i += 500) {
          const { data, error } = await (supabase as unknown as BranchTransferRpcClient).rpc("totvs_importar_transferencias_transito_lote_v1", {
            p_carga_id: cargaId,
            p_filas: branchTransferRows.slice(i, i + 500),
          });
          if (error) {
            if (error.code === "PGRST202" || error.code === "42883") throw new Error("Falta aplicar la migración local de Transferencias en Tránsito antes de confirmar esta fuente.");
            throw error;
          }
          branchTransfersInsertadas += Number(data?.insertadas ?? 0);
          branchTransfersActualizadas += Number(data?.actualizadas ?? 0);
          branchTransfersSinCambios += Number(data?.sin_cambios ?? 0);
        }
        const { error: finalizeError } = await (supabase as unknown as { rpc: (name: "totvs_finalizar_transferencias_transito_v1", params: { p_carga_id: string }) => Promise<{ error: { code?: string; message?: string } | null }> }).rpc("totvs_finalizar_transferencias_transito_v1", { p_carga_id: cargaId });
        if (finalizeError) throw finalizeError;
        await supabase.from("importaciones").insert({
          usuario_id: user.id, tipo: "repuestos", total_filas: branchTransferRows.length,
          insertados: branchTransfersInsertadas + branchTransfersActualizadas,
          duplicados: branchTransfersSinCambios + preview.branchTransferDuplicatesSkipped,
          archivo_nombre: usableFiles.filter((d) => d.kind === "transferencias_transito").map((d) => d.file.name).join(", "),
          metadata: {
            fuente: "totvs_transferencias_transito", filas_insertadas: branchTransfersInsertadas,
            filas_actualizadas: branchTransfersActualizadas, filas_sin_cambios: branchTransfersSinCambios,
            clave: "ORIGEN+DESTINO+SerieDocto+NumDoc+Item", foto_vigente: true,
          },
        } as never);
      }

      const totalOtros = productoRows.length + stockRows.length + pedidoRows.length + solicitudRows.length
        + preview.clientesNuevos.length + preview.clientesActualizados.length;
      if (totalOtros > 0) {
        await supabase.from("importaciones").insert({
          usuario_id: user.id,
          tipo: "repuestos" as any,
          total_filas: totalOtros,
          insertados: totalOtros,
          duplicados: 0,
          archivo_nombre: usableFiles
            .filter((d) => !["os", "facturacion", "stock_maquinas", "kardex", "kardex_sintetico", "despacho", "pedidos_venta", "facturas_compra", "proveedores", "transferencias_transito"].includes(d.kind))
            .map((d) => d.file.name)
            .join(", "),
        } as any);
      }

      if (machineStockRows.length > 0) {
        await supabase.from("importaciones").insert({
          usuario_id: user.id,
          tipo: "parque",
          total_filas: machineStockRows.length,
          insertados: machineStockRows.length,
          duplicados: Math.max(preview.stockMaquinas.length - machineStockRows.length, 0),
          archivo_nombre: usableFiles.filter((d) => d.kind === "stock_maquinas" || d.kind === "maquinarias").map((d) => d.file.name).join(", "),
          metadata: {
            fuente: "stock_maquinarias_totvs",
            respaldo_chasis: preview.machineRegistryRows.length ? "maquinarias_por_codpro" : null,
            chasis_completados: preview.machineStockChassis.filledFromRegistry,
            chasis_placeholder_sin_resolver: preview.machineStockChassis.unresolvedPlaceholders,
            conflictos_chasis_validos: preview.machineStockChassis.validConflicts,
            reemplazo_total: true,
          },
        } as any);
      }

      const partes = [
        mayorResultados.length
          ? `${mayorResultados.reduce((sum, item) => sum + item.preflight.movementRows, 0)} movimientos de Mayor (${mayorResultados.reduce((sum, item) => sum + item.insertadas, 0)} nuevos, ${mayorResultados.reduce((sum, item) => sum + item.sinCambios, 0)} sin cambios, ${mayorResultados.reduce((sum, item) => sum + item.cuarentena, 0)} en cuarentena)`
          : null,
        receivablesResultados.length
          ? `${receivablesResultados.reduce((sum, item) => sum + item.preflight.documentRows, 0)} cuotas de cuentas por cobrar (${receivablesResultados.reduce((sum, item) => sum + item.insertadas, 0)} nuevas, ${receivablesResultados.reduce((sum, item) => sum + item.sinCambios, 0)} sin cambios)`
          : null,
        preview.bundleFiles
          ? `${facturacionLineas} líneas de facturación y ${ordenesServicio} OS vigentes${
              ordenesServicioArchivadas ? `; ${ordenesServicioArchivadas} OS ausentes archivadas` : ""
            }`
          : null,
        productoRows.length ? `${productoRows.length} productos` : null,
        stockRows.length ? `${stockRows.length} filas de stock` : null,
        machineStockRows.length ? `${machineStockRows.length} máquinas en stock` : null,
        pedidoRows.length ? `${pedidoRows.length} líneas de pedido` : null,
        solicitudRows.length ? `${solicitudRows.length} líneas de solicitud` : null,
        preview.clientesNuevos.length ? `${preview.clientesNuevos.length} clientes nuevos` : null,
        preview.clientesActualizados.length ? `${preview.clientesActualizados.length} clientes actualizados` : null,
        kardexRows.length ? `${kardexRows.length} movimientos de Kardex (${kardexInsertadas} nuevos, ${kardexActualizadas} actualizados, ${kardexSinCambios} sin cambios)` : null,
        dispatchRows.length ? `${dispatchRows.length} l\u00edneas de despacho (${dispatchInsertadas} nuevas, ${dispatchActualizadas} actualizadas, ${dispatchSinCambios} sin cambios)` : null,
        salesOrderRows.length ? `${salesOrderRows.length} l\u00edneas de pedidos de venta (${salesOrdersInsertadas} nuevas, ${salesOrdersActualizadas} actualizadas, ${salesOrdersSinCambios} sin cambios)` : null,
        syntheticKardexRows.length ? `${syntheticKardexRows.length} posiciones valorizadas (${syntheticKardexInsertadas} nuevas, ${syntheticKardexActualizadas} actualizadas, ${syntheticKardexSinCambios} sin cambios)` : null,
        purchaseInvoiceRows.length ? `${purchaseInvoiceRows.length} líneas de compra (${purchaseInvoicesInsertadas} nuevas, ${purchaseInvoicesActualizadas} actualizadas, ${purchaseInvoicesSinCambios} sin cambios)` : null,
        supplierRows.length ? `${supplierRows.length} proveedores (${suppliersInsertados} nuevos, ${suppliersActualizados} actualizados, ${suppliersSinCambios} sin cambios)` : null,
        branchTransferRows.length ? `${branchTransferRows.length} transferencias en tránsito (${branchTransfersInsertadas} nuevas, ${branchTransfersActualizadas} actualizadas, ${branchTransfersSinCambios} sin cambios)` : null,
      ].filter(Boolean);
      toast.success(`Importado: ${partes.join(", ")}.`);
      if (facturacionExcluidas || ordenesServicioOmitidas) {
        toast.info(`${facturacionExcluidas} líneas excluidas por anulación confirmada; ${ordenesServicioOmitidas} OS omitidas por las reglas vigentes.`);
      }
      if (ordenesServicioBloqueadas) {
        toast.warning(
          `${ordenesServicioBloqueadas} OS ausentes conservaron su estado porque tienen factura, trabajo o comisión liquidada.`,
        );
      }
      if (historialRepuestosError) toast.warning(historialRepuestosError);

      setDetected([]);
      setPreview(null);
      await queryClient.invalidateQueries({ queryKey: ["repuestos", "ventas_unificadas"] });
      await queryClient.invalidateQueries({ queryKey: ["repuestos", "sugerencia-viva"] });
      onChanged();
    } catch (e) {
      toast.error("Error importando: " + (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div>
          <div className="text-[13px] font-semibold">Importar datos de TOTVS</div>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            Elegí la carpeta completa de exports (o los archivos sueltos) — se detecta automáticamente cada tipo de
            reporte por el nombre del archivo: órdenes de servicio, facturación, productos, stock de repuestos y de máquinas, el reporte
            general de maquinarias como respaldo de chasis, pedidos y solicitudes de compra, pedidos de venta,
            importaciones-despacho, clientes, proveedores, facturas de compra, transferencias entre sucursales en tránsito,
            Kardex analítico, Kardex sintético valorizado, Libro Mayor y cuentas por cobrar a la fecha. Los archivos de respaldo con sufijo _original se ignoran.
          </p>
        </div>

        <div
          className={cn(
            "flex flex-col items-center gap-3 rounded-lg border-2 border-dashed p-6 text-center transition-colors",
            dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/25",
          )}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
          }}
        >
          <Import className="h-8 w-8 text-muted-foreground" />
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={openFolderPicker} disabled={busy}>
              <FolderOpen className="mr-1.5 h-4 w-4" />
              Elegir carpeta
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => filesInputRef.current?.click()} disabled={busy}>
              <FileUp className="mr-1.5 h-4 w-4" />
              Elegir archivos sueltos
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">o arrastrá los archivos XML acá</p>
          <input
            ref={folderInputRef}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              if (e.target.files?.length) addFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <input
            ref={filesInputRef}
            type="file"
            multiple
            accept=".xml"
            hidden
            onChange={(e) => {
              if (e.target.files?.length) addFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>

        {detected.length > 0 && (
          <div className="space-y-2">
            {detected.map((d) => (
              <div key={d.file.name} className="flex flex-wrap items-center gap-2 rounded-md border p-2 text-[12px]">
                <span className="min-w-0 flex-1 truncate font-medium">{d.file.name}</span>
                <Select value={d.kind} onValueChange={(value) => setKind(d.file.name, value as DetectedFile["kind"])}>
                  <SelectTrigger className="h-7 w-52 text-[12px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(KIND_LABELS) as FileKind[]).map((kind) => (
                      <SelectItem key={kind} value={kind}>
                        {KIND_LABELS[kind]}
                      </SelectItem>
                    ))}
                    <SelectItem value="ignorar">Ignorar</SelectItem>
                  </SelectContent>
                </Select>
                {d.kind === "cuentas_cobrar" && (
                  <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    Corte confirmado
                    <input
                      type="date"
                      value={d.cutoffDate ?? ""}
                      onChange={(event) => setCutoffDate(d.file.name, event.target.value)}
                      className="h-7 rounded-md border bg-background px-2 text-[12px] text-foreground"
                    />
                  </label>
                )}
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeFile(d.file.name)}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}

            {[...duplicateKinds.entries()]
              .filter(([, count]) => count > 1)
              .map(([kind]) => (
                <p key={kind} className="text-[11px] text-amber-700">
                  Hay más de un archivo asignado a "{KIND_LABELS[kind]}" — se van a combinar.
                </p>
              ))}

            <div className="flex flex-wrap gap-2 pt-1">
              <Button type="button" size="sm" onClick={leerArchivos} disabled={busy || usableFiles.length === 0}>
                Leer archivos
              </Button>
            </div>
          </div>
        )}

        {preview && preview.faltaParaTrio.length > 0 && (
          <p className="text-[11px] text-amber-700">
            Para procesar OS + Facturación juntas todavía falta: {preview.faltaParaTrio.join(", ")}. El resto de lo
            leído se puede confirmar igual.
          </p>
        )}

        {preview && (
          <div className="space-y-3 rounded-md border p-3">
            <div className="flex flex-wrap gap-2 text-[12px]">
              {preview.mayor.map((item) => (
                <Badge key={item.sourceFileName} variant="secondary">{item.movementRows.toLocaleString("es-PY")} movimientos de Mayor</Badge>
              ))}
              {preview.receivables.map((item) => (
                <Badge key={item.sourceFileName} variant="secondary">{item.documentRows.toLocaleString("es-PY")} cuotas por cobrar</Badge>
              ))}
              {preview.bundleFiles && <Badge variant="secondary">OS + Facturación listas para cruzar</Badge>}
              {preview.productos.length > 0 && <Badge variant="secondary">{preview.productos.length} productos</Badge>}
              {preview.stock.length > 0 && <Badge variant="secondary">{preview.stock.length} filas de stock</Badge>}
              {preview.stockMaquinas.length > 0 && <Badge variant="secondary">{preview.stockMaquinas.length} máquinas en stock</Badge>}
              {preview.machineRegistryRows.length > 0 && <Badge variant="secondary">{preview.machineRegistryRows.length} referencias de maquinarias</Badge>}
              {preview.machineStockChassis.filledFromRegistry > 0 && <Badge variant="secondary">{preview.machineStockChassis.filledFromRegistry} chasis completados</Badge>}
              {preview.pedidos.length > 0 && <Badge variant="secondary">{preview.pedidos.length} líneas de pedido</Badge>}
              {preview.solicitudes.length > 0 && <Badge variant="secondary">{preview.solicitudes.length} líneas de solicitud</Badge>}
              {preview.clientesTodos.length > 0 && (
                <Badge variant="secondary">
                  {preview.clientesNuevos.length} nuevos · {preview.clientesActualizados.length} actualizados
                </Badge>
              )}
              {preview.kardexDiagnostics && (
                <Badge variant="secondary">
                  {preview.kardexDiagnostics.rows} movimientos de Kardex
                </Badge>
              )}
              {preview.dispatchDiagnostics && (
                <Badge variant="secondary">{preview.dispatchDiagnostics.rows} líneas de despacho</Badge>
              )}
              {preview.salesOrderDiagnostics && (
                <Badge variant="secondary">{preview.salesOrderDiagnostics.rows} líneas de pedidos de venta</Badge>
              )}
              {preview.syntheticKardexDiagnostics && (
                <Badge variant="secondary">{preview.syntheticKardexDiagnostics.rows} posiciones valorizadas</Badge>
              )}
              {preview.purchaseInvoiceDiagnostics && (
                <Badge variant="secondary">{preview.purchaseInvoiceDiagnostics.rows} líneas de facturas de compra</Badge>
              )}
              {preview.suppliers.length > 0 && <Badge variant="secondary">{preview.suppliers.length} proveedores</Badge>}
              {preview.branchTransfers.length > 0 && <Badge variant="secondary">{preview.branchTransfers.length} transferencias en tránsito</Badge>}
            </div>
            {preview.mayor.map((item) => (
              <div key={item.sourceFileName} className="space-y-1 rounded border border-amber-200 bg-amber-50/50 p-2 text-[11px]">
                <p className="font-medium text-foreground">{item.sourceFileName}</p>
                <p className="text-muted-foreground">
                  Preflight: {item.movementRows.toLocaleString("es-PY")} movimientos de {item.sourceRows.toLocaleString("es-PY")} filas; {item.footerRows} totalizadores excluidos. Cobertura {item.from ?? "sin fecha"} a {item.to ?? "sin fecha"}; {item.branches} sucursales, {item.accounts} cuentas, {item.costCenters} centros de costo y {item.openings} aperturas.
                </p>
                <p className="text-muted-foreground">
                  SALDO01 = PYG y SALDO02 = USD. {Object.entries(item.tpsldo).map(([code, totals]) => `TPSLDO=${code}: ${totals.rows.toLocaleString("es-PY")} filas, ${totals.amountPyg.toLocaleString("es-PY")} PYG, ${totals.amountUsd.toLocaleString("es-PY")} USD`).join(" · ")}.
                </p>
                <p className="text-muted-foreground">
                  Faltantes: {item.missing.account} cuenta, {item.missing.accountDescription} descripción, {item.missing.costCenter.toLocaleString("es-PY")} centro de costo, {item.missing.origin.toLocaleString("es-PY")} origen. Duplicados de clave candidata: {item.duplicateCandidateKeys}. Inconsistencias de signo: {item.signViolations.type1Negative + item.signViolations.type2Positive}.
                </p>
                {item.warnings.map((warning) => <p key={warning} className="text-amber-700">{warning}</p>)}
                <p className="font-medium text-amber-800">Preflight completado. Al confirmar se cargará por lotes al staging del Mayor; las cuentas sin código quedarán en cuarentena y TPSLDO=9 seguirá separado.</p>
              </div>
            ))}
            {preview.receivables.map((item) => (
              <div key={item.sourceFileName} className="space-y-1 rounded border border-amber-200 bg-amber-50/50 p-2 text-[11px]">
                <p className="font-medium text-foreground">{item.sourceFileName}</p>
                <p className="text-muted-foreground">
                  Corte confirmado {item.cutoffDate}: {item.documentRows.toLocaleString("es-PY")} cuotas, {item.documents.toLocaleString("es-PY")} documentos, {item.clients.toLocaleString("es-PY")} clientes y moneda {item.currencies.join(", ")}.
                </p>
                <p className="text-muted-foreground">
                  Facturas NF USD con saldo positivo: {item.eligiblePendingUsd.toLocaleString("es-PY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD. Vencido antes del corte: {item.overdueUsd.toLocaleString("es-PY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD; vence hoy: {item.dueTodayUsd.toLocaleString("es-PY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD; futuro: {item.futureUsd.toLocaleString("es-PY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD.
                </p>
                <p className="text-muted-foreground">
                  El KPI usa el SALDO actual de cada NF, que ya refleja lo aplicado en el reporte fuente; no vuelve a descontar RA ni NCC. {item.zeroBalanceRows} filas con saldo cero y {item.negativeBalanceRows} negativas se conservan fuera de mora.
                </p>
                <p className="text-muted-foreground">
                  RA significa cobro anticipado de cliente: {item.customerAdvanceRows} filas suman {item.customerAdvanceBalance.toLocaleString("es-PY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD y se informan por separado. Cobertura de aplicacion RA: {item.customerAdvanceApplicationCoverage}.
                </p>
                {item.warnings.map((warning) => <p key={warning} className="text-amber-700">{warning}</p>)}
                <p className="font-medium text-amber-800">Preflight solamente. Confirmar requiere la migración preparada; no aplica SQL desde esta pantalla.</p>
              </div>
            ))}
            {preview.machineStockChassis.unresolvedPlaceholders > 0 && (
              <p className="text-[11px] text-amber-700">
                {preview.machineStockChassis.unresolvedPlaceholders} máquinas mantienen un chasis incompleto porque el reporte general no trae uno utilizable.
              </p>
            )}
            {(preview.machineStockChassis.validConflicts > 0 || preview.machineStockChassis.ambiguousProductCodes > 0) && (
              <p className="text-[11px] text-amber-700">
                No se reemplazaron {preview.machineStockChassis.validConflicts} chasis válidos en conflicto ni {preview.machineStockChassis.ambiguousProductCodes} códigos ambiguos; revisalos antes de confirmar.
              </p>
            )}
            {preview.kardexDiagnostics && (
              <p className="text-[11px] text-muted-foreground">
                Kardex: {preview.kardexDiagnostics.from} a {preview.kardexDiagnostics.to}, {preview.kardexDiagnostics.branches} filiales, {preview.kardexDiagnostics.warehouses} depósitos. Códigos de moneda conservados sin reinterpretar: {preview.kardexDiagnostics.currencyCodes.join(", ") || "ninguno"}.
                {preview.kardexDuplicatesSkipped ? ` ${preview.kardexDuplicatesSkipped} filas id\u00e9nticas solapadas entre archivos se omitir\u00e1n.` : ""}
              </p>
            )}
            {preview.dispatchDiagnostics && (
              <p className="text-[11px] text-muted-foreground">
                Importaciones - Despacho: cobertura observada {preview.dispatchDiagnostics.from} a {preview.dispatchDiagnostics.to}, {preview.dispatchDiagnostics.processes} procesos y {preview.dispatchDiagnostics.quantity.toLocaleString("es-PY")} unidades agregadas. Es un reporte agregado de productos/repuestos; no se interpreta como importación de máquinas ni se infieren chasis.
                {preview.dispatchDuplicatesSkipped ? ` ${preview.dispatchDuplicatesSkipped} filas id\u00e9nticas solapadas se omitir\u00e1n.` : ""}
              </p>
            )}
            {preview.salesOrderDiagnostics && (
              <p className="text-[11px] text-muted-foreground">
                Pedidos de venta: cobertura observada {preview.salesOrderDiagnostics.from} a {preview.salesOrderDiagnostics.to}, {preview.salesOrderDiagnostics.branches} filiales, {preview.salesOrderDiagnostics.ordersByBranch} pedidos por filial y {preview.salesOrderDiagnostics.pendingRows} líneas pendientes ({preview.salesOrderDiagnostics.pendingQuantity.toLocaleString("es-PY")} unidades). Moneda y tratamiento impositivo se conservan como texto fuente, sin reinterpretarlos.
                {preview.salesOrderDuplicatesSkipped ? ` ${preview.salesOrderDuplicatesSkipped} filas id\u00e9nticas solapadas se omitir\u00e1n.` : ""}
              </p>
            )}
            {preview.syntheticKardexDiagnostics && (
              <p className="text-[11px] text-muted-foreground">
                Kardex sintético: {preview.syntheticKardexDiagnostics.products} productos, {preview.syntheticKardexDiagnostics.warehouses} depósitos y {preview.syntheticKardexDiagnostics.chassisRows} filas con chasis. Se conservan SALDO, PPP1/2/3 y VALOR_1/2/3 exactamente como llegan. El archivo no declara fecha de valorización ni moneda de cada eje; {preview.syntheticKardexDiagnostics.valueFormulaMismatches} filas no cumplen VALOR_1 = SALDO × PPP1 y no se recalculan.
                {preview.syntheticKardexDuplicatesSkipped ? ` ${preview.syntheticKardexDuplicatesSkipped} filas id\u00e9nticas solapadas se omitir\u00e1n.` : ""}
              </p>
            )}
            {preview.purchaseInvoiceDiagnostics && (
              <p className="text-[11px] text-muted-foreground">
                Compras: cobertura observada {preview.purchaseInvoiceDiagnostics.from} a {preview.purchaseInvoiceDiagnostics.to}, {preview.purchaseInvoiceDiagnostics.documents} documentos y {preview.purchaseInvoiceDiagnostics.suppliers} proveedores. Se conservan MONORI, Gs, USD y TIPCAM de la fuente sin convertir ni escoger una moneda contable.
              </p>
            )}
            {preview.suppliers.length > 0 && (
              <p className="text-[11px] text-muted-foreground">
                Proveedores: actualización incremental por Codigo + Tienda. Las dos columnas homónimas Ag. Ret.IVA? se preservan como banderas 1 y 2 sin atribuirles un significado no documentado.
              </p>
            )}
            {preview.branchTransfers.length > 0 && (
              <p className="text-[11px] text-muted-foreground">
                Transferencias en tránsito: la selección se trata como foto vigente; filas de fotos anteriores quedan en historial pero dejan de marcarse vigentes al finalizar una carga completa.
              </p>
            )}
            {(preview.dispatchDiagnostics || preview.salesOrderDiagnostics || preview.kardexDiagnostics || preview.syntheticKardexDiagnostics || preview.purchaseInvoiceDiagnostics || preview.branchTransfers.length > 0) && (
              <p className="text-[11px] text-amber-700">
                La cobertura corresponde solamente a las fechas presentes en los archivos seleccionados; no representa un acumulado anual ni reemplaza historia anterior fuera de ese rango.
              </p>
            )}
            <p className="text-[11px] text-muted-foreground">
              El stock de repuestos y de máquinas reemplaza por completo lo importado antes (es una foto del momento). El reporte general solo
              completa chasis faltantes o sustituidos por el modelo mediante CODPRO exacto; no agrega al stock máquinas que no estén en la foto.
              Productos, pedidos y solicitudes se actualizan sin duplicar. Clientes agrega los nuevos y corrige los existentes por código/RUC sin cambiar su ID.
            </p>
            {hasPersistablePreview(preview) && (
              <Button type="button" size="sm" onClick={confirmar} disabled={busy}>
                Confirmar importación
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
