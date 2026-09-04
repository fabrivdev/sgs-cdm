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
  mapCanonicalMachineStockToRow,
  mapCanonicalProductToRow,
  mapCanonicalSolicitudCompraToRow,
  mapCanonicalStockToRow,
  mapClienteSheet,
  mapPedidoCompraSheet,
  mapMachineStockSheet,
  mapProductosSheet,
  mapSolicitudCompraSheet,
  mapStockSheet,
  parseSpreadsheetXml,
  prepareNewSystemImportBundle,
  reconcileCanonicalClientes,
  persistNewSystemBundle,
  actualizarVentasRepuestosPeriodo,
  type CanonicalClienteRow,
  type CanonicalPedidoCompraRow,
  type CanonicalMachineStockRow,
  type CanonicalProductRow,
  type CanonicalSolicitudCompraRow,
  type CanonicalStockRow,
  type ClienteInsert,
  type ClienteActualizacionImport,
  type ClienteExistenteImport,
} from "@/lib/imports";
import { cn } from "@/lib/utils";

type FileKind = "os" | "facturacion" | "productos" | "stock" | "stock_maquinas" | "pedidos" | "solicitudes" | "clientes";

const KIND_LABELS: Record<FileKind, string> = {
  os: "Órdenes de servicio",
  facturacion: "Facturación de ventas",
  productos: "Maestro de productos",
  stock: "Reporte de stock",
  stock_maquinas: "Stock de maquinarias",
  pedidos: "Pedidos de compra",
  solicitudes: "Solicitudes de compra",
  clientes: "Maestro de clientes",
};

interface DetectedFile {
  file: File;
  kind: FileKind | "ignorar";
}

function normalizeFileName(name: string) {
  return name
    .normalize("NFD")
    .replace(new RegExp("[\\u0300-\\u036f]", "g"), "")
    .toLowerCase();
}

function detectFileKind(fileName: string): FileKind | "ignorar" {
  const n = normalizeFileName(fileName);
  if (n.includes("ordenes_de_servicio") || n.includes("ordenes de servicio")) return "os";
  if (n.includes("ndc") || n.includes("ncc") || n.includes("ventas")) return "facturacion";
  if (n.includes("maestro_de_productos") || n.includes("maestro de productos")) return "productos";
  if (n.includes("stock_de_maquinarias") || n.includes("stock de maquinarias")) return "stock_maquinas";
  if (n.includes("reporte_de_stock") || n.includes("reporte de stock")) return "stock";
  if (n.includes("pedidos_de_compra") || n.includes("pedidos de compra")) return "pedidos";
  if (n.includes("solicitudes_de_compra") || n.includes("solicitudes de compra")) return "solicitudes";
  if (n.includes("maestro_de_clientes") || n.includes("maestro de clientes")) return "clientes";
  return "ignorar";
}

interface Preview {
  productos: CanonicalProductRow[];
  stock: CanonicalStockRow[];
  stockMaquinas: CanonicalMachineStockRow[];
  pedidos: CanonicalPedidoCompraRow[];
  solicitudes: CanonicalSolicitudCompraRow[];
  clientesTodos: CanonicalClienteRow[];
  clientesNuevos: ClienteInsert[];
  clientesActualizados: ClienteActualizacionImport[];
  bundleFiles: { facturacion: { fileName: string; xmlText: string }; ordenesServicio: { fileName: string; xmlText: string }; productos: { fileName: string; xmlText: string } } | null;
  faltaParaTrio: string[];
}

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
        .map((file) => ({ file, kind: detectFileKind(file.name) }));
      return [...prev, ...nuevos];
    });
    setPreview(null);
  };

  const removeFile = (name: string) => {
    setDetected((prev) => prev.filter((d) => d.file.name !== name));
    setPreview(null);
  };

  const setKind = (name: string, kind: DetectedFile["kind"]) => {
    setDetected((prev) => prev.map((d) => (d.file.name === name ? { ...d, kind } : d)));
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

    setBusy(true);
    try {
      const productos: CanonicalProductRow[] = [];
      const stock: CanonicalStockRow[] = [];
      const stockMaquinas: CanonicalMachineStockRow[] = [];
      const pedidos: CanonicalPedidoCompraRow[] = [];
      const solicitudes: CanonicalSolicitudCompraRow[] = [];
      let clientesTodos: CanonicalClienteRow[] = [];
      let osTexto: { fileName: string; xmlText: string } | null = null;
      let facturacionTexto: { fileName: string; xmlText: string } | null = null;
      let productosTexto: { fileName: string; xmlText: string } | null = null;

      for (const { file, kind } of usableFiles) {
        const xmlText = await file.text();

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
        if (!sheet) continue;

        if (kind === "productos") {
          productosTexto = { fileName: file.name, xmlText };
          productos.push(...mapProductosSheet(file.name, sheet).rows);
        } else if (kind === "stock") {
          stock.push(...mapStockSheet(file.name, sheet).rows);
        } else if (kind === "stock_maquinas") {
          stockMaquinas.push(...mapMachineStockSheet(file.name, sheet).rows);
        } else if (kind === "pedidos") {
          pedidos.push(...mapPedidoCompraSheet(file.name, sheet).rows);
        } else if (kind === "solicitudes") {
          solicitudes.push(...mapSolicitudCompraSheet(file.name, sheet).rows);
        } else if (kind === "clientes") {
          clientesTodos = mapClienteSheet(file.name, sheet).rows;
        }
      }

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
        productos,
        stock,
        stockMaquinas,
        pedidos,
        solicitudes,
        clientesTodos,
        clientesNuevos,
        clientesActualizados,
        bundleFiles,
        faltaParaTrio,
      });

      const partes = [
        bundleFiles ? "OS + Facturación" : null,
        productos.length ? `${productos.length} productos` : null,
        stock.length ? `${stock.length} filas de stock` : null,
        stockMaquinas.length ? `${stockMaquinas.length} máquinas en stock` : null,
        pedidos.length ? `${pedidos.length} líneas de pedido` : null,
        solicitudes.length ? `${solicitudes.length} líneas de solicitud` : null,
        clientesTodos.length ? `${clientesNuevos.length} clientes nuevos y ${clientesActualizados.length} actualizados` : null,
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
      let ordenesServicio = 0;
      let facturacionDesde: string | null = null;
      let facturacionHasta: string | null = null;
      let historialRepuestosError: string | null = null;

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

      if (preview.bundleFiles) {
        const bundle = prepareNewSystemImportBundle({
          facturacion: preview.bundleFiles.facturacion,
          ordenesServicio: preview.bundleFiles.ordenesServicio,
          productos: preview.bundleFiles.productos,
          usuarioId: user.id,
        });
        const resultado = await persistNewSystemBundle({
          bundle,
          userId: user.id,
          fileNames: {
            facturacion: preview.bundleFiles.facturacion.fileName,
            ordenesServicio: preview.bundleFiles.ordenesServicio.fileName,
            productos: preview.bundleFiles.productos.fileName,
          },
        });
        facturacionLineas = resultado.facturacionLineas;
        ordenesServicio = resultado.ordenesServicio;
        facturacionDesde = resultado.facturacionDesde;
        facturacionHasta = resultado.facturacionHasta;
        historialRepuestosError = resultado.historialRepuestosError;
      }

      const productoRows = preview.productos.map(mapCanonicalProductToRow).filter((r): r is NonNullable<typeof r> => r !== null);
      const stockRows = preview.stock.map(mapCanonicalStockToRow).filter((r): r is NonNullable<typeof r> => r !== null);
      const machineStockRows = preview.stockMaquinas.map(mapCanonicalMachineStockToRow);
      const pedidoRows = preview.pedidos.map(mapCanonicalPedidoCompraToRow).filter((r): r is NonNullable<typeof r> => r !== null);
      const solicitudRows = preview.solicitudes.map(mapCanonicalSolicitudCompraToRow).filter((r): r is NonNullable<typeof r> => r !== null);

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
            .filter((d) => d.kind !== "os" && d.kind !== "facturacion" && d.kind !== "stock_maquinas")
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
          archivo_nombre: usableFiles.filter((d) => d.kind === "stock_maquinas").map((d) => d.file.name).join(", "),
          metadata: { fuente: "stock_maquinarias_totvs", reemplazo_total: true },
        } as any);
      }

      const partes = [
        preview.bundleFiles ? `${facturacionLineas} líneas de facturación y ${ordenesServicio} de OS` : null,
        productoRows.length ? `${productoRows.length} productos` : null,
        stockRows.length ? `${stockRows.length} filas de stock` : null,
        machineStockRows.length ? `${machineStockRows.length} máquinas en stock` : null,
        pedidoRows.length ? `${pedidoRows.length} líneas de pedido` : null,
        solicitudRows.length ? `${solicitudRows.length} líneas de solicitud` : null,
        preview.clientesNuevos.length ? `${preview.clientesNuevos.length} clientes nuevos` : null,
        preview.clientesActualizados.length ? `${preview.clientesActualizados.length} clientes actualizados` : null,
      ].filter(Boolean);
      toast.success(`Importado: ${partes.join(", ")}.`);
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
            reporte por el nombre del archivo: órdenes de servicio, facturación, productos, stock de repuestos y de máquinas, pedidos,
            solicitudes y clientes.
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
              {preview.bundleFiles && <Badge variant="secondary">OS + Facturación listas para cruzar</Badge>}
              {preview.productos.length > 0 && <Badge variant="secondary">{preview.productos.length} productos</Badge>}
              {preview.stock.length > 0 && <Badge variant="secondary">{preview.stock.length} filas de stock</Badge>}
              {preview.stockMaquinas.length > 0 && <Badge variant="secondary">{preview.stockMaquinas.length} máquinas en stock</Badge>}
              {preview.pedidos.length > 0 && <Badge variant="secondary">{preview.pedidos.length} líneas de pedido</Badge>}
              {preview.solicitudes.length > 0 && <Badge variant="secondary">{preview.solicitudes.length} líneas de solicitud</Badge>}
              {preview.clientesTodos.length > 0 && (
                <Badge variant="secondary">
                  {preview.clientesNuevos.length} nuevos · {preview.clientesActualizados.length} actualizados
                </Badge>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              El stock de repuestos y de máquinas reemplaza por completo lo importado antes (es una foto del momento). Productos, pedidos y
              solicitudes se actualizan sin duplicar. Clientes agrega los nuevos y corrige los existentes por código/RUC sin cambiar su ID.
            </p>
            <Button type="button" size="sm" onClick={confirmar} disabled={busy}>
              Confirmar importación
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
