import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Calculator,
  ChevronLeft,
  ChevronRight,
  Database,
  Download,
  Info,
  Loader2,
  RefreshCw,
  Settings2,
  ShoppingCart,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { KpiItem, KpiStrip, PageHeader } from "@/components/layout/AppPrimitives";
import { FiltersBar, FilterCustom, FilterDate, FilterSelect } from "@/components/filters/FiltersBar";
import { useAuth } from "@/hooks/useAuth";
import {
  cargarSugerenciaViva,
  crearVersionModelo,
  guardarPlanificacionArticulo,
  importarFacturacionHistorica,
  importarMaestroLegacy,
  refrescarHistorialUnificado,
  type FiltrosResultados,
  type MarcaSugerencia,
  type ModeloSugerencia,
  type ResultadoSugerencia,
  type SegmentoSugerencia,
  useCalidadHistorialRepuestos,
  useEstadoFacturacionHistorica,
  useEstadoMaestroLegacy,
  useModeloActivo,
  useSugerenciaViva,
  useSegmentosModelo,
} from "@/hooks/useSugerenciasCompra";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { cardLabel, metaText, pageShellWide } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

const integer = new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat("es-PY", { maximumFractionDigits: 1 });

const PARAM_FIELDS: Array<{ key: keyof ModeloSugerencia; label: string; step?: string }> = [
  { key: "peso_reciente", label: "Peso últimos 12 meses", step: "0.05" },
  { key: "peso_anterior", label: "Peso 12 meses anteriores", step: "0.05" },
  { key: "lead_time_meses", label: "Lead time (meses)" },
  { key: "ciclo_planificacion_meses", label: "Ciclo de planificación (meses)" },
  { key: "abc_limite_a", label: "Límite ABC · A", step: "0.01" },
  { key: "abc_limite_b", label: "Límite ABC · B", step: "0.01" },
  { key: "fsn_pedidos_f", label: "FSN · pedidos para F" },
  { key: "fsn_dias_f", label: "FSN · días máximos F" },
  { key: "fsn_dias_n", label: "FSN · días para N" },
  { key: "xyz_cv_x", label: "XYZ · CV máximo X", step: "0.05" },
  { key: "xyz_cv_y", label: "XYZ · CV máximo Y", step: "0.05" },
  { key: "xyz_meses_x", label: "XYZ · meses con venta X" },
  { key: "xyz_meses_y_min", label: "XYZ · meses mínimos Y" },
  { key: "xyz_meses_y_max", label: "XYZ · meses máximos Y" },
  { key: "adi_intermitente_umbral", label: "Intermitencia · umbral ADI", step: "0.01" },
  { key: "cv2_erratico_umbral", label: "Variabilidad · umbral CV²", step: "0.01" },
  { key: "tendencia_caida_umbral", label: "Caída · proporción de activación", step: "0.05" },
  { key: "tendencia_caida_tope", label: "Caída · tope sobre ritmo reciente", step: "0.05" },
  { key: "stock_seguridad_tope", label: "Seguridad · máximo sobre demanda", step: "0.05" },
  { key: "cobertura_margen_meses", label: "Cobertura · margen adicional (meses)", step: "0.25" },
  { key: "pedido_unico_cobertura_meses", label: "Pedido único · cobertura máxima", step: "0.5" },
];

function analysisDateDefault() {
  const date = new Date();
  date.setDate(0);
  return date.toISOString().slice(0, 10);
}

function displayDate(value?: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("es-PY").format(new Date(`${value.slice(0, 10)}T12:00:00`));
}

function coberturaActualMeses(row: ResultadoSugerencia) {
  const ritmoActualMensual = Math.max(0, row.unidades_12m) / 12;
  if (ritmoActualMensual <= 0) return null;
  return Math.max(0, row.stock_global / ritmoActualMensual);
}

function ModelConfigSheet({
  open,
  onOpenChange,
  model,
  segmentos,
  canManage,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  model: ModeloSugerencia | null;
  segmentos: SegmentoSugerencia[];
  canManage: boolean;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [params, setParams] = useState<Record<string, string>>({});
  const [draftSegments, setDraftSegments] = useState<SegmentoSugerencia[]>([]);

  useEffect(() => {
    if (!model) return;
    setName(`${model.nombre} · ajuste`);
    setParams(Object.fromEntries(PARAM_FIELDS.map(({ key }) => [key, String(model[key] ?? "")])));
    setParams((current) => ({ ...current, origen_predeterminado: model.origen_predeterminado }));
    setDraftSegments(segmentos.map((segment) => ({ ...segment })));
  }, [model, segmentos]);

  const save = useMutation({
    mutationFn: async () => {
      if (!model) throw new Error("No hay un modelo activo");
      const numericParams = Object.fromEntries(PARAM_FIELDS.map(({ key }) => [key, Number(params[key])])) as Record<string, number | string>;
      numericParams.origen_predeterminado = params.origen_predeterminado || "ALEMANIA";
      return crearVersionModelo({ marca: model.marca, nombre: name, parametros: numericParams, segmentos: draftSegments });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["repuestos", "sugerencias", "modelo"] });
      await queryClient.invalidateQueries({ queryKey: ["repuestos", "sugerencias", "segmentos"] });
      await queryClient.invalidateQueries({ queryKey: ["repuestos", "sugerencia-viva"] });
      toast.success("Nueva versión activada. La sugerencia en vivo ya usa estos parámetros.");
      onOpenChange(false);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "No se pudo guardar el modelo"),
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>Parámetros del modelo {model?.marca}</SheetTitle>
          <SheetDescription>
            Cada guardado crea una versión nueva y el cálculo en vivo se actualiza automáticamente.
          </SheetDescription>
        </SheetHeader>
        {!model ? (
          <p className="mt-6 text-[13px] text-muted-foreground">Primero aplicá la migración SQL para crear el modelo inicial.</p>
        ) : (
          <div className="mt-6 space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label>Nombre de la versión</Label>
                <Input className="mt-1" value={name} onChange={(event) => setName(event.target.value)} disabled={!canManage} />
              </div>
              <div>
                <Label>Origen predeterminado</Label>
                <Input className="mt-1" value={params.origen_predeterminado ?? ""} onChange={(event) => setParams((current) => ({ ...current, origen_predeterminado: event.target.value }))} disabled={!canManage} />
              </div>
              <div className="rounded-lg border bg-muted/30 p-3 text-[12px] text-muted-foreground">
                Versión activa <strong className="text-foreground">v{model.version}</strong><br />
                Creada {displayDate(model.creado_en)}
              </div>
              {PARAM_FIELDS.map((field) => (
                <div key={field.key}>
                  <Label>{field.label}</Label>
                  <Input
                    className="mt-1"
                    type="number"
                    step={field.step ?? "1"}
                    value={params[field.key] ?? ""}
                    onChange={(event) => setParams((current) => ({ ...current, [field.key]: event.target.value }))}
                    disabled={!canManage}
                  />
                </div>
              ))}
            </div>

            <div>
              <h3 className="text-[13px] font-semibold leading-5">Políticas por segmento</h3>
              <p className={metaText}>Nivel de servicio, revisión y factor Z permanecen editables por marca.</p>
              <div className="mt-3 space-y-2">
                {draftSegments.map((segment, index) => (
                  <div key={segment.segmento} className="grid grid-cols-[1fr_88px_88px_88px] items-end gap-2 rounded-lg border p-3">
                    <div>
                      <p className="text-[12px] font-semibold">{segment.segmento}</p>
                      <p className="text-[10px] text-muted-foreground">{segment.descripcion}</p>
                    </div>
                    <div>
                      <Label className="text-[10px]">Servicio</Label>
                      <Input type="number" step="0.01" value={segment.nivel_servicio ?? ""} disabled={!canManage} onChange={(event) => setDraftSegments((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, nivel_servicio: event.target.value === "" ? null : Number(event.target.value) } : item))} />
                    </div>
                    <div>
                      <Label className="text-[10px]">Revisión</Label>
                      <Input type="number" value={segment.revision_meses} disabled={!canManage} onChange={(event) => setDraftSegments((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, revision_meses: Number(event.target.value) } : item))} />
                    </div>
                    <div>
                      <Label className="text-[10px]">Z</Label>
                      <Input type="number" step="0.05" value={segment.valor_z} disabled={!canManage} onChange={(event) => setDraftSegments((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, valor_z: Number(event.target.value) } : item))} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {canManage ? (
              <Button className="w-full" onClick={() => save.mutate()} disabled={save.isPending}>
                {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Crear y activar nueva versión
              </Button>
            ) : (
              <p className="rounded-lg bg-muted p-3 text-[12px] text-muted-foreground">Tu rol puede consultar los parámetros, pero solo Admin y Jefatura pueden modificarlos.</p>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function ResultDetailSheet({
  row,
  onClose,
  canManage,
  onSaved,
}: {
  row: ResultadoSugerencia | null;
  onClose: () => void;
  canManage: boolean;
  onSaved: () => void;
}) {
  const [strategicMinimum, setStrategicMinimum] = useState("0");
  const [origin, setOrigin] = useState("ALEMANIA");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    setStrategicMinimum(String(row?.stock_minimo_estrategico ?? 0));
    setOrigin(row?.origen ?? "ALEMANIA");
    setNotes("");
  }, [row]);

  const save = useMutation({
    mutationFn: () => guardarPlanificacionArticulo({
      productoCodigo: row!.producto_codigo,
      stockMinimoEstrategico: Math.max(0, Number(strategicMinimum) || 0),
      origen: origin,
      observaciones: notes,
    }),
    onSuccess: () => {
      toast.success("Datos guardados. La sugerencia en vivo se está actualizando.");
      onSaved();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "No se pudo guardar"),
  });

  const explanation = row?.explicacion ?? {};
  return (
    <Sheet open={Boolean(row)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        {row && (
          <>
            <SheetHeader>
              <SheetTitle>{row.descripcion}</SheetTitle>
              <SheetDescription>{row.producto_codigo} · {row.codigo_fabricante || "Sin código de fabricante"}</SheetDescription>
            </SheetHeader>
            <div className="mt-6 space-y-5">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {[
                  ["Clasificación", `${row.abc}${row.fsn}${row.xyz}`],
                  ["Segmento", row.segmento],
                  ["Stock global", decimal.format(row.stock_global)],
                  ["Venta 12m", decimal.format(row.unidades_12m)],
                  ["Objetivo", decimal.format(row.stock_objetivo)],
                  ["Sugerencia", integer.format(row.sugerencia_unidades)],
                  ["Confianza", row.confianza_datos ?? "—"],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg border bg-muted/20 p-3">
                    <p className={cardLabel}>{label}</p>
                    <p className="mt-1 text-[13px] font-semibold">{value}</p>
                  </div>
                ))}
              </div>

              <div className="rounded-xl border p-4">
                <p className={cardLabel}>Estado del historial</p>
                <div className="mt-1 flex items-center justify-between gap-3">
                  <p className="text-[13px] font-semibold">
                    {row.estado_datos === "CODIGO_NUEVO_SIN_HISTORIAL"
                      ? "Código nuevo sin historial"
                      : row.estado_datos === "SIN_VENTAS_RECIENTES"
                        ? "Código anterior sin ventas recientes"
                        : "Con historial reciente"}
                  </p>
                  <Badge variant={row.estado_datos === "LISTO" ? "secondary" : "outline"}>{row.estado_datos}</Badge>
                </div>
                {row.incorporado_en && <p className="mt-2 text-[12px] text-muted-foreground">Incorporado al maestro: {displayDate(row.incorporado_en)}</p>}
              </div>

              <div className="rounded-xl border p-4">
                <h3 className="flex items-center gap-2 text-[13px] font-semibold"><Calculator className="h-4 w-4 text-primary" /> Cómo se obtuvo</h3>
                <p className="mt-2 text-[13px]">{String(explanation.motivo ?? "Sin explicación disponible")}</p>
                {explanation.tipo_demanda && (
                  <p className="mt-1 text-[12px] text-muted-foreground">
                    Patrón {String(explanation.tipo_demanda).toLowerCase()} · ADI {decimal.format(Number(explanation.adi ?? 0))} · CV² {decimal.format(Number(explanation.cv2 ?? 0))}
                  </p>
                )}
                <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-[12px] text-muted-foreground">
                  <span>Demanda mensual <strong className="float-right text-foreground">{decimal.format(row.demanda_ponderada_mensual)}</strong></span>
                  <span>Horizonte <strong className="float-right text-foreground">{row.horizonte_meses} meses</strong></span>
                  <span>Demanda horizonte <strong className="float-right text-foreground">{decimal.format(row.demanda_horizonte)}</strong></span>
                  <span>Stock seguridad <strong className="float-right text-foreground">{decimal.format(row.stock_seguridad)}{row.tipo_stock_seguridad === "ESTIMADA" ? " (estimada)" : ""}</strong></span>
                  <span>Cobertura aplicada <strong className="float-right text-foreground">{decimal.format(row.cobertura_aplicada_meses ?? row.horizonte_meses)} meses</strong></span>
                  <span>Mínimo estratégico <strong className="float-right text-foreground">{decimal.format(row.stock_minimo_estrategico)}</strong></span>
                  <span>Tránsito <strong className="float-right text-foreground">0 (pendiente fuente)</strong></span>
                  <span>Necesidad neta <strong className="float-right text-foreground">{decimal.format(row.necesidad_neta)}</strong></span>
                </div>
              </div>

              <div className="space-y-3 rounded-xl border p-4">
                <div>
                  <h3 className="text-[13px] font-semibold leading-5">Datos maestros de planificación</h3>
                  <p className={metaText}>El mínimo estratégico es opcional y funciona como piso del objetivo, incluso cuando la pieza todavía no tiene historial.</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Stock mínimo estratégico</Label>
                    <Input className="mt-1" type="number" min="0" step="1" value={strategicMinimum} onChange={(event) => setStrategicMinimum(event.target.value)} disabled={!canManage} />
                  </div>
                  <div>
                    <Label>Origen</Label>
                    <Input className="mt-1" value={origin} onChange={(event) => setOrigin(event.target.value)} disabled={!canManage} />
                  </div>
                </div>
                <div>
                  <Label>Observaciones</Label>
                  <Textarea className="mt-1" value={notes} onChange={(event) => setNotes(event.target.value)} disabled={!canManage} />
                </div>
                {canManage && <Button className="w-full" onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Guardar datos maestros</Button>}
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

export default function RepuestosSugerencias() {
  const queryClient = useQueryClient();
  const { isAdmin, isJefatura, isSuperAdmin } = useAuth();
  const canManage = isAdmin || isJefatura || isSuperAdmin;
  const canLoadLegacyMaster = isAdmin || isSuperAdmin;
  const [brand, setBrand] = useState<MarcaSugerencia>("CLAAS");
  const [analysisDate, setAnalysisDate] = useState(analysisDateDefault);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<FiltrosResultados>({ segmento: "TODOS", estado: "TODOS", soloSugeridos: false });
  const [selected, setSelected] = useState<ResultadoSugerencia | null>(null);
  const [configOpen, setConfigOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [legacyMasterProgress, setLegacyMasterProgress] = useState<{ loaded: number; total: number } | null>(null);
  const [legacyBillingProgress, setLegacyBillingProgress] = useState<{ loaded: number; total: number } | null>(null);
  const [historyPublishProgress, setHistoryPublishProgress] = useState<{ completed: number; total: number } | null>(null);
  const [historyRebuildRequired, setHistoryRebuildRequired] = useState(false);

  const modelQuery = useModeloActivo(brand);
  const segmentsQuery = useSegmentosModelo(modelQuery.data?.id);
  const legacyMasterQuery = useEstadoMaestroLegacy();
  const legacyBillingQuery = useEstadoFacturacionHistorica();
  const historySourceVersion = legacyBillingQuery.data?.publicado_en ?? legacyBillingQuery.data?.completado_en ?? null;
  const historyIsPersisted = legacyBillingQuery.data?.publicacion_estado === "COMPLETADO"
    || Boolean(legacyBillingQuery.data?.publicado_en);
  const historyQualityQuery = useCalidadHistorialRepuestos(brand, historySourceVersion, !historyIsPersisted);
  const historyIsPrepared = historyIsPersisted || Boolean(historyQualityQuery.data?.preparado);
  const debouncedSearch = useDebouncedValue(filters.buscar ?? "", 300);
  const liveFilters = useMemo(() => ({ ...filters, buscar: debouncedSearch }), [filters, debouncedSearch]);
  const liveQuery = useSugerenciaViva(
    brand,
    analysisDate,
    liveFilters,
    page,
    Boolean(
      historyIsPrepared
      && modelQuery.data
      && legacyMasterQuery.data?.cargado
      && !historyRebuildRequired
    ),
    historySourceVersion,
  );
  const rows = liveQuery.data?.rows ?? [];
  const liveSummary = liveQuery.data?.resumen;
  const totalPages = Math.max(1, Math.ceil((liveQuery.data?.total_filtrado ?? 0) / 50));
  const segmentOptions = useMemo(() => [
    ...(segmentsQuery.data?.map((segment) => segment.segmento) ?? []),
  ], [segmentsQuery.data]);

  const refreshHistory = useMutation({
    mutationFn: () => refrescarHistorialUnificado((completed, total) => {
      setHistoryPublishProgress({ completed, total });
    }),
    onSuccess: async (result) => {
      setHistoryPublishProgress(null);
      setHistoryRebuildRequired(false);
      await queryClient.invalidateQueries({ queryKey: ["repuestos", "facturacion-historica", "estado"] });
      await queryClient.invalidateQueries({ queryKey: ["repuestos", "historial-unificado"] });
      toast.success(
        `Historial preparado: ${integer.format(result.confirmadas)} líneas confirmadas, ${integer.format(result.ambiguas)} ambiguas y ${integer.format(result.sin_coincidencia)} sin coincidencia.`,
        { duration: 9000 },
      );
      // The history is already committed. A cold live calculation may take
      // longer and must not make the successful refresh look like a failure.
      void queryClient.invalidateQueries({ queryKey: ["repuestos", "sugerencia-viva"] });
    },
    onError: (error) => {
      setHistoryPublishProgress(null);
      setHistoryRebuildRequired(false);
      toast.error(error instanceof Error ? error.message : "No se pudo preparar el historial");
    },
  });

  const loadLegacyMaster = useMutation({
    onMutate: () => setHistoryRebuildRequired(true),
    mutationFn: (file: File) => importarMaestroLegacy(file, (loaded, total) => {
      setLegacyMasterProgress({ loaded, total });
    }),
    onSuccess: async (result) => {
      setLegacyMasterProgress(null);
      await queryClient.invalidateQueries({ queryKey: ["repuestos", "maestro-legacy", "estado"] });
      toast.success(
        `Maestro anterior cargado: ${integer.format(result.vinculadas)} de ${integer.format(result.filas)} códigos vinculados. Reconstruyendo ventas…`,
        { duration: 12000 },
      );
      refreshHistory.mutate();
    },
    onError: (error) => {
      setHistoryRebuildRequired(false);
      setLegacyMasterProgress(null);
      toast.error(error instanceof Error ? error.message : "No se pudo cargar el maestro anterior");
    },
  });

  const loadLegacyBilling = useMutation({
    onMutate: () => setHistoryRebuildRequired(true),
    mutationFn: (file: File) => importarFacturacionHistorica(file, (loaded, total) => {
      setLegacyBillingProgress({ loaded, total });
    }),
    onSuccess: async (result) => {
      setLegacyBillingProgress(null);
      setHistoryRebuildRequired(false);
      await queryClient.invalidateQueries({ queryKey: ["repuestos", "facturacion-historica", "estado"] });
      await queryClient.resetQueries({ queryKey: ["repuestos", "historial-unificado"] });
      await queryClient.resetQueries({ queryKey: ["repuestos", "sugerencia-viva"] });
      toast.success(
        `Facturación histórica cargada: ${integer.format(result.lineas_vinculadas)} líneas vinculadas a ${integer.format(result.productos_vinculados)} productos.`,
        { duration: 12000 },
      );
    },
    onError: (error) => {
      setHistoryRebuildRequired(false);
      setLegacyBillingProgress(null);
      toast.error(error instanceof Error ? error.message : "No se pudo cargar la facturación histórica");
    },
  });

  const exportMutation = useMutation({
    mutationFn: async () => {
      const toastId = toast.loading("Preparando exportación…");
      try {
        const exportFilters = { ...liveFilters, soloSugeridos: true };
        const response = await cargarSugerenciaViva(brand, analysisDate, exportFilters, (loaded, total) => {
          toast.loading(`Descargando ${integer.format(Math.min(loaded, total))} de ${integer.format(total)} piezas…`, { id: toastId });
        });
        const XLSX = await import("xlsx");
        const exportRows = response.rows.map((row) => ({
        "Código interno": row.producto_codigo,
        "Código fabricante": row.codigo_fabricante,
        Descripción: row.descripcion,
        Familia: row.familia,
        Marca: row.marca,
        ABC: row.abc,
        FSN: row.fsn,
        XYZ: row.xyz,
        Clasificación: `${row.abc}${row.fsn}${row.xyz}`,
        Segmento: row.segmento,
        Estado: row.estado_datos,
        "Incorporado al maestro": row.incorporado_en,
        Origen: row.origen,
        "Stock global": row.stock_global,
        "Stock mínimo estratégico": row.stock_minimo_estrategico,
        "Unidades 12m": row.unidades_12m,
        "Unidades 24m": row.unidades_24m,
        "Importe vendido 12m": row.total_vendido_12m,
        "Pedidos 12m": row.pedidos_12m,
        "Cobertura actual meses": coberturaActualMeses(row),
        "Horizonte meses": row.horizonte_meses,
        "Demanda horizonte": row.demanda_horizonte,
        "Stock seguridad": row.stock_seguridad,
        "Tipo stock seguridad": row.tipo_stock_seguridad ?? "ESTADISTICA",
        "Confianza de datos": row.confianza_datos ?? "NO INFORMADA",
        "Cobertura aplicada meses": row.cobertura_aplicada_meses ?? row.horizonte_meses,
        "Motivo": String(row.explicacion?.motivo ?? ""),
        "Stock objetivo": row.stock_objetivo,
        "Sugerencia unidades": row.sugerencia_unidades,
        }));
        const sheet = XLSX.utils.json_to_sheet(exportRows);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, sheet, "Sugerencia");
        XLSX.writeFile(workbook, `sugerencia-compra-${brand.toLowerCase()}-${analysisDate}.xlsx`);
      } finally {
        toast.dismiss(toastId);
      }
    },
    onSuccess: () => toast.success("Excel exportado"),
    onError: (error) => toast.error(error instanceof Error ? error.message : "No se pudo exportar"),
  });

  const historyQuality = historyQualityQuery.data;
  const confirmedHistoryRate = historyQuality?.lineas_totales
    ? (historyQuality.confirmadas / historyQuality.lineas_totales) * 100
    : 0;

  return (
    <div className={pageShellWide}>
      <PageHeader
        title="Sugerencia de compra"
        meta={(
          <span className="inline-flex items-center gap-1.5">
            <span className="relative flex h-1.5 w-1.5">
              {liveQuery.isFetching && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />}
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
            </span>
            Cálculo en vivo · {brand}
          </span>
        )}
        actions={(
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-8 text-[12px]" onClick={() => setConfigOpen(true)}>
              <Settings2 className="mr-1 h-3.5 w-3.5" />Parámetros
            </Button>
            <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => setHistoryOpen(true)} aria-label="Ver modelo e historial">
              <Info className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      />


      {!canManage && <Alert><AlertTriangle className="h-4 w-4" /><AlertTitle>Modo consulta</AlertTitle><AlertDescription>La sugerencia se actualiza automáticamente. Solo Admin y Jefatura pueden modificar parámetros o mínimos estratégicos.</AlertDescription></Alert>}
      {modelQuery.error && <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertTitle>Motor aún no disponible</AlertTitle><AlertDescription>Aplicá la migración SQL para habilitar el modelo de sugerencia.</AlertDescription></Alert>}

      <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle>Modelo e historial</SheetTitle>
            <SheetDescription>Calidad de vinculaciones, fuentes cargadas y mantenimiento del motor.</SheetDescription>
          </SheetHeader>
      <Card className="mt-5 border-0 shadow-none">
        <CardContent className="p-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Database className="h-4 w-4 text-primary" />
                <h2 className="text-[13px] font-semibold leading-5">Historial unificado y auditable</h2>
                <Badge variant="outline">Base del motor en vivo</Badge>
              </div>
              {historyQualityQuery.isError && !historyIsPersisted ? (
                <p className="mt-2 text-[12px] text-muted-foreground">Aplicá la migración de historial auditable para habilitar el diagnóstico de coincidencias.</p>
              ) : historyIsPrepared ? (
                <p className="mt-2 text-[12px] text-muted-foreground">
                  {historyQuality
                    ? `${decimal.format(confirmedHistoryRate)}% confirmado · actualizado ${displayDate(historyQuality.actualizado_en)} · datos ${displayDate(historyQuality.fecha_desde)} a ${displayDate(historyQuality.fecha_hasta)}`
                    : `Historial publicado y persistido · actualizado ${displayDate(legacyBillingQuery.data?.publicado_en)}`}
                </p>
              ) : (
                <p className="mt-2 text-[12px] text-muted-foreground">La estructura está disponible, pero todavía falta preparar el primer historial consolidado.</p>
              )}
              {legacyMasterQuery.data?.cargado && (
                <p className="mt-1 text-[12px] text-emerald-700">
                  Maestro anterior vinculado · {integer.format(legacyMasterQuery.data.vinculadas ?? 0)} de {integer.format(legacyMasterQuery.data.filas ?? 0)} códigos · carga única completada {displayDate(legacyMasterQuery.data.completado_en)}
                </p>
              )}
              {legacyBillingQuery.data?.cargado ? (
                <p className="mt-1 text-[12px] text-emerald-700">
                  Facturación histórica detallada · {integer.format(legacyBillingQuery.data.lineas_vinculadas ?? 0)} líneas vinculadas a {integer.format(legacyBillingQuery.data.productos_vinculados ?? 0)} productos · carga única completada {displayDate(legacyBillingQuery.data.completado_en)}
                </p>
              ) : legacyMasterQuery.data?.cargado ? (
                <p className="mt-1 text-[12px] text-amber-700">Falta cargar una vez “FACTURACIÓN HISTORICA.xlsx” para recuperar las ventas por código.</p>
              ) : null}
            </div>
            {canManage && (
              <div className="flex flex-wrap gap-2">
                {canLoadLegacyMaster && !legacyMasterQuery.isError && !legacyMasterQuery.data?.cargado && (
                  <>
                    <input
                      id="legacy-product-master"
                      className="sr-only"
                      type="file"
                      accept=".xls,.xlsx"
                      disabled={loadLegacyMaster.isPending}
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) loadLegacyMaster.mutate(file);
                        event.target.value = "";
                      }}
                    />
                    <Button asChild variant="outline" className={cn(loadLegacyMaster.isPending && "pointer-events-none opacity-60")}>
                      <label htmlFor="legacy-product-master">
                        {loadLegacyMaster.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                        {legacyMasterProgress
                          ? `${integer.format(legacyMasterProgress.loaded)} / ${integer.format(legacyMasterProgress.total)}`
                          : "Cargar maestro anterior"}
                      </label>
                    </Button>
                  </>
                )}
                {canLoadLegacyMaster && legacyMasterQuery.data?.cargado && !legacyBillingQuery.isError && !legacyBillingQuery.data?.cargado && (
                  <>
                    <input
                      id="legacy-detailed-billing"
                      className="sr-only"
                      type="file"
                      accept=".xlsx"
                      disabled={loadLegacyBilling.isPending}
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) loadLegacyBilling.mutate(file);
                        event.target.value = "";
                      }}
                    />
                    <Button asChild variant="outline" className={cn(loadLegacyBilling.isPending && "pointer-events-none opacity-60")}>
                      <label htmlFor="legacy-detailed-billing">
                        {loadLegacyBilling.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                        {legacyBillingProgress
                          ? `${integer.format(legacyBillingProgress.loaded)} / ${integer.format(legacyBillingProgress.total)}`
                          : "Cargar facturación histórica"}
                      </label>
                    </Button>
                  </>
                )}
                <Button variant="outline" onClick={() => refreshHistory.mutate()} disabled={refreshHistory.isPending || loadLegacyMaster.isPending || loadLegacyBilling.isPending}>
                  {refreshHistory.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                  {historyPublishProgress
                    ? `Publicando ${historyPublishProgress.completed}/${historyPublishProgress.total}`
                    : historyIsPrepared ? "Actualizar historial" : "Preparar historial"}
                </Button>
              </div>
            )}
          </div>
          {historyQuality?.preparado && (
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <div><p className={cardLabel}>Líneas evaluadas</p><p className="mt-1 text-[18px] font-semibold">{integer.format(historyQuality.lineas_totales)}</p></div>
              <div><p className={cardLabel}>Confirmadas</p><p className="mt-1 text-[18px] font-semibold text-emerald-600">{integer.format(historyQuality.confirmadas)}</p></div>
              <div><p className={cardLabel}>Ambiguas</p><p className="mt-1 text-[18px] font-semibold text-amber-600">{integer.format(historyQuality.ambiguas)}</p></div>
              <div><p className={cardLabel}>Sin coincidencia</p><p className="mt-1 text-[18px] font-semibold text-destructive">{integer.format(historyQuality.sin_coincidencia)}</p></div>
              <div><p className={cardLabel}>Productos confirmados</p><p className="mt-1 text-[18px] font-semibold">{integer.format(historyQuality.productos_confirmados)}</p></div>
            </div>
          )}
        </CardContent>
      </Card>

        </SheetContent>
      </Sheet>

      <KpiStrip>
        <KpiItem label="Piezas analizadas" value={integer.format(liveSummary?.total_piezas ?? 0)} detail={`${integer.format(liveSummary?.piezas_sin_ventas_recientes ?? 0)} sin ventas 24m`} />
        <KpiItem label="Piezas sugeridas" value={integer.format(liveSummary?.piezas_sugeridas ?? 0)} tone="positive" />
        <KpiItem label="Unidades sugeridas" value={integer.format(liveSummary?.unidades_sugeridas ?? 0)} tone="positive" />
        <KpiItem label="Confianza baja" value={integer.format(liveSummary?.piezas_confianza_baja ?? 0)} detail={`${integer.format(liveSummary?.piezas_nuevas_sin_historial ?? 0)} nuevas sin historial`} tone="warning" />
      </KpiStrip>

      {liveQuery.error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>No se pudo actualizar el cálculo en vivo</AlertTitle>
          <AlertDescription>{liveQuery.error instanceof Error ? liveQuery.error.message : "Aplicá la migración del motor en vivo."}</AlertDescription>
        </Alert>
      )}

      <FiltersBar
        search={{ value: filters.buscar ?? "", onChange: (buscar) => { setFilters((current) => ({ ...current, buscar })); setPage(1); }, placeholder: "Código, fabricante o descripción…", width: "w-[min(360px,26vw)]" }}
        activeCount={[filters.buscar, filters.segmento !== "TODOS", filters.estado !== "TODOS", filters.soloSugeridos].filter(Boolean).length}
        onClear={() => { setFilters({ buscar: "", segmento: "TODOS", estado: "TODOS", soloSugeridos: false }); setPage(1); }}
        actions={<Button variant="outline" size="sm" className="h-8 text-[12px]" onClick={() => exportMutation.mutate()} disabled={!liveQuery.data || exportMutation.isPending}><Download className="mr-1 h-3.5 w-3.5" />Exportar</Button>}
      >
        <FilterSelect
          label="Marca"
          value={brand}
          onChange={(value) => { setBrand(value as MarcaSugerencia); setPage(1); }}
          placeholder="Marca"
          options={[{ value: "CLAAS", label: "CLAAS" }, { value: "HORSCH", label: "HORSCH" }]}
          width="w-[120px]"
        />
        <FilterDate
          label="Corte del análisis"
          value={analysisDate}
          onChange={(value) => { setAnalysisDate(value); setPage(1); }}
          width="w-[150px]"
        />
        <FilterSelect
          label="Segmento"
          value={filters.segmento}
          onChange={(segmento) => { setFilters((current) => ({ ...current, segmento })); setPage(1); }}
          placeholder="Segmento"
          options={[{ value: "TODOS", label: "Todos los segmentos" }, ...segmentOptions.map((segmento) => ({ value: segmento, label: segmento }))]}
          width="w-[180px]"
        />

        <FilterSelect
          label="Estado de datos"
          value={filters.estado}
          onChange={(estado) => { setFilters((current) => ({ ...current, estado })); setPage(1); }}
          placeholder="Estado de datos"
          options={[
            { value: "TODOS", label: "Todos los estados" },
            { value: "LISTO", label: "Con historial reciente" },
            { value: "CODIGO_NUEVO_SIN_HISTORIAL", label: "Nuevos sin historial" },
            { value: "SIN_VENTAS_RECIENTES", label: "Anteriores sin ventas 24m" },
          ]}
          width="w-[220px]"
        />
        <FilterCustom label="Sugerencia" width="w-[170px]">
          <label className="flex h-8 items-center gap-2 rounded-md border px-3 text-[12px] font-medium">
            <Checkbox checked={filters.soloSugeridos} onCheckedChange={(checked) => { setFilters((current) => ({ ...current, soloSugeridos: checked === true })); setPage(1); }} />
            Solo con sugerencia
          </label>
        </FilterCustom>
      </FiltersBar>

      <Card className="overflow-hidden">
        {!legacyMasterQuery.isLoading && !legacyMasterQuery.data?.cargado ? (
          <div className="flex min-h-72 flex-col items-center justify-center p-8 text-center"><Upload className="mb-3 h-10 w-10 text-primary/50" /><h2 className="font-semibold">Cargá el maestro anterior</h2><p className="mt-1 max-w-md text-[13px] text-muted-foreground">El cálculo en vivo permanecerá detenido para no consumir conexiones mientras se vinculan los códigos históricos.</p></div>
        ) : legacyBillingQuery.isLoading ? (
          <div className="flex min-h-72 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>
        ) : historyRebuildRequired || refreshHistory.isPending ? (
          <div className="flex min-h-72 flex-col items-center justify-center p-8 text-center"><Loader2 className="mb-3 h-7 w-7 animate-spin text-primary" /><h2 className="font-semibold">Reconstruyendo el historial</h2><p className="mt-1 text-[13px] text-muted-foreground">La sugerencia se reactivará automáticamente al terminar.</p></div>
        ) : !historyIsPrepared ? (
          <div className="flex min-h-72 flex-col items-center justify-center p-8 text-center"><ShoppingCart className="mb-3 h-10 w-10 text-primary/50" /><h2 className="font-semibold">Prepará el historial de {brand}</h2><p className="mt-1 max-w-md text-[13px] text-muted-foreground">El motor en vivo necesita primero consolidar las vinculaciones confirmadas.</p></div>
        ) : liveQuery.isLoading ? (
          <div className="flex min-h-72 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>
        ) : liveQuery.error ? (
          <div className="p-6 text-[13px] text-destructive">{liveQuery.error instanceof Error ? liveQuery.error.message : "No se pudo calcular la sugerencia en vivo"}</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className={cn(tableHeadText, "h-8 min-w-[280px]")}>Pieza</TableHead>
                    <TableHead className={cn(tableHeadText, "h-8 min-w-[170px]")}>Clase</TableHead>
                    <TableHead className={cn(tableHeadText, "h-8 text-right")}>Stock</TableHead>
                    <TableHead className={cn(tableHeadText, "h-8 text-right")}>Demanda mensual</TableHead>
                    <TableHead className={cn(tableHeadText, "h-8 text-right")}>Cobertura</TableHead>
                    <TableHead className={cn(tableHeadText, "h-8 text-right")}>Última venta</TableHead>
                    <TableHead className={cn(tableHeadText, "h-8 text-right")}>Objetivo</TableHead>
                    <TableHead className={cn(tableHeadText, "h-8 text-right")}>Sugerencia</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => {
                    const cobertura = coberturaActualMeses(row);
                    const avisos = avisosFila(row);
                    const coberturaTono = cobertura === null
                      ? "text-muted-foreground"
                      : cobertura < leadTimeMeses
                        ? "text-destructive"
                        : cobertura < leadTimeMeses + 1
                          ? "text-amber-600"
                          : "text-foreground";
                    return (
                      <TableRow key={row.producto_codigo} className="cursor-pointer" onClick={() => setSelected(row)}>
                        <TableCell className={cn(cellText, "max-w-[360px]")}>
                          <p className="truncate font-medium" title={row.descripcion}>{row.descripcion}</p>
                          <p className="truncate text-[10px] text-muted-foreground">{row.producto_codigo} · {row.codigo_fabricante || "s/cód. fabricante"} · {row.familia || "sin familia"}</p>
                        </TableCell>
                        <TableCell className={cellText}>
                          <div className="flex flex-wrap items-center gap-1">
                            <Badge variant="outline" className="px-1.5 py-0 text-[10px] font-semibold">{row.abc}{row.fsn}{row.xyz}</Badge>
                            <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">{row.segmento}</Badge>
                            {avisos.length > 0 && (
                              <Badge
                                variant="outline"
                                className="border-amber-300 bg-amber-50 px-1.5 py-0 text-[10px] text-amber-800"
                                title={avisos.join(" · ")}
                              >
                                <AlertTriangle className="mr-1 h-3 w-3" />{avisos.length}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className={cn(cellText, "text-right font-medium tabular-nums")}>{decimal.format(row.stock_global)}</TableCell>
                        <TableCell className={cn(cellText, "text-right tabular-nums")}>{decimal.format(row.demanda_ponderada_mensual)}</TableCell>
                        <TableCell className={cn(cellText, "text-right font-medium tabular-nums", coberturaTono)}>
                          {cobertura === null ? "—" : `${decimal.format(cobertura)} m`}
                        </TableCell>
                        <TableCell className={cn(cellText, "text-right tabular-nums")}>
                          {row.ultima_venta ? (
                            <>
                              <span>{displayDate(row.ultima_venta)}</span>
                              {row.dias_ultima_venta != null && <span className="ml-1 text-[10px] text-muted-foreground">{integer.format(row.dias_ultima_venta)} d</span>}
                            </>
                          ) : <span className="text-muted-foreground">Sin ventas</span>}
                        </TableCell>
                        <TableCell className={cn(cellText, "text-right tabular-nums")}>{decimal.format(row.stock_objetivo)}</TableCell>
                        <TableCell className={cn(cellText, "text-right")}><span className={cn("inline-flex min-w-11 justify-center rounded-full px-2 py-0.5 text-[12px] font-semibold tabular-nums", row.sugerencia_unidades > 0 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>{integer.format(row.sugerencia_unidades)}</span></TableCell>
                      </TableRow>
                    );
                  })}
                  {rows.length === 0 && <TableRow><TableCell colSpan={8} className={cn(cellText, "h-32 text-center text-muted-foreground")}>No hay piezas que coincidan con los filtros.</TableCell></TableRow>}
                </TableBody>
              </Table>
            </div>
            <div className="flex items-center justify-between gap-2 border-t px-3 py-2">
              <p className={metaText}>{integer.format(liveQuery.data?.total_filtrado ?? 0)} piezas · página {page} de {totalPages}</p>
              <div className="flex gap-1">
                <Button size="sm" variant="outline" className="h-8 w-8 p-0" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}><ChevronLeft className="h-3.5 w-3.5" /></Button>
                <Button size="sm" variant="outline" className="h-8 w-8 p-0" disabled={page >= totalPages} onClick={() => setPage((current) => current + 1)}><ChevronRight className="h-3.5 w-3.5" /></Button>
              </div>
            </div>

          </>
        )}
      </Card>

      <ModelConfigSheet open={configOpen} onOpenChange={setConfigOpen} model={modelQuery.data ?? null} segmentos={segmentsQuery.data ?? []} canManage={canManage} />
      <ResultDetailSheet row={selected} onClose={() => setSelected(null)} canManage={canManage} onSaved={() => {
        void queryClient.invalidateQueries({ queryKey: ["repuestos", "sugerencia-viva"] });
        setSelected(null);
      }} />
    </div>
  );
}
