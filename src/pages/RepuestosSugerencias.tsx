import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Calculator,
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  PackageCheck,
  Play,
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
import { useAuth } from "@/hooks/useAuth";
import {
  asignarCriticidad,
  cargarTodosLosResultados,
  crearVersionModelo,
  ejecutarSugerencia,
  importarCriticidades,
  type CorridaSugerencia,
  type FiltrosResultados,
  type MarcaSugerencia,
  type ModeloSugerencia,
  type ResultadoSugerencia,
  type SegmentoSugerencia,
  useCorridasSugerencia,
  useModeloActivo,
  useResultadosSugerencia,
  useSegmentosModelo,
} from "@/hooks/useSugerenciasCompra";
import { leerCriticidadesDesdeExcel } from "@/lib/imports/partsCriticality";
import { cardLabel, metaText, pageDescription, pageShellWide, pageTitle } from "@/lib/ui-classes";
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

function criticidadFuenteLabel(value: ResultadoSugerencia["criticidad_fuente"]) {
  if (value === "IMPORTADA") return "Importada";
  if (value === "AUTOMATICA_FAMILIA") return "Sugerida por familia";
  if (value === "AUTOMATICA_HEURISTICA") return "Sugerida por motor";
  return "Manual";
}

function coberturaActualMeses(row: ResultadoSugerencia) {
  if (row.demanda_ponderada_mensual <= 0) return null;
  return Math.max(0, row.stock_global / row.demanda_ponderada_mensual);
}

function MetricCard({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "green" | "amber" }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className={cardLabel}>{label}</p>
        <p className={cn("mt-1 text-2xl font-bold", tone === "green" && "text-emerald-600", tone === "amber" && "text-amber-600")}>{value}</p>
      </CardContent>
    </Card>
  );
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
      toast.success("Nueva versión del modelo activada. Ejecutá una corrida para aplicar los cambios.");
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
            Cada guardado crea una versión nueva. Las corridas anteriores conservan sus parámetros originales.
          </SheetDescription>
        </SheetHeader>
        {!model ? (
          <p className="mt-6 text-sm text-muted-foreground">Primero aplicá la migración SQL para crear el modelo inicial.</p>
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
              <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
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
              <h3 className="text-sm font-semibold">Políticas por segmento</h3>
              <p className={metaText}>Nivel de servicio, revisión y factor Z permanecen editables por marca.</p>
              <div className="mt-3 space-y-2">
                {draftSegments.map((segment, index) => (
                  <div key={segment.segmento} className="grid grid-cols-[1fr_88px_88px_88px] items-end gap-2 rounded-lg border p-3">
                    <div>
                      <p className="text-xs font-semibold">{segment.segmento}</p>
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
              <p className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">Tu rol puede consultar los parámetros, pero solo Admin y Jefatura pueden modificarlos.</p>
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
  const [criticity, setCriticity] = useState<string>("");
  const [origin, setOrigin] = useState("ALEMANIA");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    setCriticity(row?.criticidad ?? "SIN_ASIGNAR");
    setOrigin(row?.origen ?? "ALEMANIA");
    setNotes("");
  }, [row]);

  const save = useMutation({
    mutationFn: () => asignarCriticidad({
      productoCodigo: row!.producto_codigo,
      criticidad: criticity === "SIN_ASIGNAR" ? null : criticity,
      origen: origin,
      observaciones: notes,
    }),
    onSuccess: () => {
      toast.success("Datos de planificación guardados. La corrida actual no cambia; recalculá para aplicarlos.");
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
                  ["Clasificación", `${row.abc}${row.fsn}${row.xyz}${row.ved ?? "?"}`],
                  ["Segmento", row.segmento],
                  ["Stock global", decimal.format(row.stock_global)],
                  ["Venta 12m", decimal.format(row.unidades_12m)],
                  ["Objetivo", decimal.format(row.stock_objetivo)],
                  ["Sugerencia", integer.format(row.sugerencia_unidades)],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg border bg-muted/20 p-3">
                    <p className={cardLabel}>{label}</p>
                    <p className="mt-1 text-sm font-semibold">{value}</p>
                  </div>
                ))}
              </div>

              <div className={cn("rounded-xl border p-4", row.criticidad_revisar && "border-amber-300 bg-amber-50/60")}>
                <p className={cardLabel}>Origen de la criticidad</p>
                <div className="mt-1 flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold">{criticidadFuenteLabel(row.criticidad_fuente)}</p>
                  <Badge variant={row.criticidad_revisar ? "outline" : "secondary"}>{Math.round(row.criticidad_confianza * 100)}% confianza</Badge>
                </div>
                {row.criticidad_revisar && <p className="mt-2 text-xs text-muted-foreground">La clasificación permitió calcular la sugerencia, pero conviene validarla. Al guardar abajo pasará a ser manual.</p>}
              </div>

              <div className="rounded-xl border p-4">
                <h3 className="flex items-center gap-2 text-sm font-semibold"><Calculator className="h-4 w-4 text-primary" /> Cómo se obtuvo</h3>
                <p className="mt-2 text-sm">{String(explanation.motivo ?? "Sin explicación disponible")}</p>
                <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs text-muted-foreground">
                  <span>Demanda mensual <strong className="float-right text-foreground">{decimal.format(row.demanda_ponderada_mensual)}</strong></span>
                  <span>Horizonte <strong className="float-right text-foreground">{row.horizonte_meses} meses</strong></span>
                  <span>Demanda horizonte <strong className="float-right text-foreground">{decimal.format(row.demanda_horizonte)}</strong></span>
                  <span>Stock seguridad <strong className="float-right text-foreground">{decimal.format(row.stock_seguridad)}</strong></span>
                  <span>Tránsito <strong className="float-right text-foreground">0 (pendiente fuente)</strong></span>
                  <span>Necesidad neta <strong className="float-right text-foreground">{decimal.format(row.necesidad_neta)}</strong></span>
                </div>
              </div>

              <div className="space-y-3 rounded-xl border p-4">
                <div>
                  <h3 className="text-sm font-semibold">Datos maestros de planificación</h3>
                  <p className={metaText}>El motor propone una criticidad cuando falta; cualquier valor guardado aquí pasa a ser el criterio manual prioritario.</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Criticidad</Label>
                    <Select value={criticity} onValueChange={setCriticity} disabled={!canManage}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="SIN_ASIGNAR">Sin asignar</SelectItem>
                        <SelectItem value="V">V · Vital</SelectItem>
                        <SelectItem value="E">E · Esencial</SelectItem>
                        <SelectItem value="D">D · Deseable</SelectItem>
                      </SelectContent>
                    </Select>
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
  const [brand, setBrand] = useState<MarcaSugerencia>("CLAAS");
  const [analysisDate, setAnalysisDate] = useState(analysisDateDefault);
  const [runId, setRunId] = useState<string>();
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<FiltrosResultados>({ segmento: "TODOS", estado: "TODOS", soloSugeridos: false, soloCriticidadAutomatica: false });
  const [selected, setSelected] = useState<ResultadoSugerencia | null>(null);
  const [configOpen, setConfigOpen] = useState(false);

  const modelQuery = useModeloActivo(brand);
  const segmentsQuery = useSegmentosModelo(modelQuery.data?.id);
  const runsQuery = useCorridasSugerencia(brand);

  useEffect(() => {
    setRunId(runsQuery.data?.[0]?.id);
    setPage(1);
  }, [brand, runsQuery.data]);

  const activeRun = useMemo(
    () => runsQuery.data?.find((run) => run.id === runId) ?? null,
    [runId, runsQuery.data],
  );
  const resultsQuery = useResultadosSugerencia(runId, filters, page);
  const rows = resultsQuery.data?.rows ?? [];
  const totalPages = Math.max(1, Math.ceil((resultsQuery.data?.count ?? 0) / (resultsQuery.data?.pageSize ?? 50)));
  const segmentOptions = useMemo(() => [
    ...(segmentsQuery.data?.map((segment) => segment.segmento) ?? []),
    "PENDIENTE CRITICIDAD",
    "SIN REGLA",
  ], [segmentsQuery.data]);

  const run = useMutation({
    mutationFn: () => ejecutarSugerencia(brand, analysisDate),
    onSuccess: async (newId) => {
      await queryClient.invalidateQueries({ queryKey: ["repuestos", "sugerencias", "corridas", brand] });
      setRunId(newId);
      setPage(1);
      toast.success("Sugerencia global calculada");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "No se pudo ejecutar el modelo"),
  });

  const criticalityImport = useMutation({
    mutationFn: async (file: File) => {
      const parsed = await leerCriticidadesDesdeExcel(file);
      if (parsed.marcas.length > 0 && !parsed.marcas.includes(brand)) {
        throw new Error(`El archivo corresponde a ${parsed.marcas.join(", ")} y la marca seleccionada es ${brand}`);
      }
      if (parsed.items.length === 0) throw new Error("El archivo no contiene criticidades válidas");
      const result = await importarCriticidades(brand, parsed.items);
      return { parsed, result };
    },
    onSuccess: ({ result }) => {
      toast.success(
        `${integer.format(result.aplicados)} criticidades aplicadas · ${integer.format(result.sin_coincidencia)} sin coincidencia · ${integer.format(result.ambiguos)} ambiguas. Recalculá la sugerencia.`,
        { duration: 9000 },
      );
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "No se pudo importar la criticidad"),
  });

  const exportMutation = useMutation({
    mutationFn: async () => {
      if (!runId) throw new Error("No hay una corrida para exportar");
      const all = await cargarTodosLosResultados(runId, filters);
      const XLSX = await import("xlsx");
      const exportRows = all.map((row) => ({
        "Código interno": row.producto_codigo,
        "Código fabricante": row.codigo_fabricante,
        Descripción: row.descripcion,
        Familia: row.familia,
        Marca: row.marca,
        ABC: row.abc,
        FSN: row.fsn,
        XYZ: row.xyz,
        VED: row.ved,
        "Origen criticidad": criticidadFuenteLabel(row.criticidad_fuente),
        "Confianza criticidad": row.criticidad_confianza,
        "Revisar criticidad": row.criticidad_revisar ? "SÍ" : "NO",
        Segmento: row.segmento,
        Estado: row.estado_datos,
        Origen: row.origen,
        "Stock global": row.stock_global,
        "Unidades 12m": row.unidades_12m,
        "Unidades 24m": row.unidades_24m,
        "Importe vendido 12m": row.total_vendido_12m,
        "Pedidos 12m": row.pedidos_12m,
        "Cobertura actual meses": coberturaActualMeses(row),
        "Horizonte meses": row.horizonte_meses,
        "Demanda horizonte": row.demanda_horizonte,
        "Stock seguridad": row.stock_seguridad,
        "Stock objetivo": row.stock_objetivo,
        "Sugerencia unidades": row.sugerencia_unidades,
      }));
      const sheet = XLSX.utils.json_to_sheet(exportRows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, sheet, "Sugerencia");
      XLSX.writeFile(workbook, `sugerencia-compra-${brand.toLowerCase()}-${activeRun?.fecha_analisis ?? analysisDate}.xlsx`);
    },
    onSuccess: () => toast.success("Excel exportado"),
    onError: (error) => toast.error(error instanceof Error ? error.message : "No se pudo exportar"),
  });

  const sourceDate = activeRun?.fuentes_snapshot?.ventas_hasta as string | undefined;
  const staleSales = sourceDate && new Date(sourceDate) < new Date(new Date(activeRun!.fecha_analisis).setMonth(new Date(activeRun!.fecha_analisis).getMonth() - 2));

  return (
    <div className={pageShellWide}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className={pageTitle}>Sugerencia de compra</h1>
          <p className={pageDescription}>Plan global de empresa basado en histórico, clasificación ABC-FSN-XYZ-VED, stock disponible y parámetros versionados.</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <Label className={cardLabel}>Marca</Label>
            <Select value={brand} onValueChange={(value) => setBrand(value as MarcaSugerencia)}>
              <SelectTrigger className="mt-1 w-32"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="CLAAS">CLAAS</SelectItem><SelectItem value="HORSCH">HORSCH</SelectItem></SelectContent>
            </Select>
          </div>
          <div>
            <Label className={cardLabel}>Corte del análisis</Label>
            <Input className="mt-1 w-40" type="date" value={analysisDate} onChange={(event) => setAnalysisDate(event.target.value)} />
          </div>
          <Button variant="outline" onClick={() => setConfigOpen(true)}><Settings2 className="mr-2 h-4 w-4" />Parámetros</Button>
          {canManage && (
            <Button asChild variant="outline" className={cn(criticalityImport.isPending && "pointer-events-none opacity-60")}>
              <label>
                {criticalityImport.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                {criticalityImport.isPending ? "Importando..." : "Importar criticidad"}
                <input
                  className="sr-only"
                  type="file"
                  accept=".xlsx,.xls"
                  disabled={criticalityImport.isPending}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) criticalityImport.mutate(file);
                    event.target.value = "";
                  }}
                />
              </label>
            </Button>
          )}
          <Button onClick={() => run.mutate()} disabled={!canManage || run.isPending || !modelQuery.data}>
            {run.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
            Calcular sugerencia
          </Button>
        </div>
      </div>

      {!canManage && <Alert><AlertTriangle className="h-4 w-4" /><AlertTitle>Modo consulta</AlertTitle><AlertDescription>Solo Admin y Jefatura pueden cambiar parámetros, criticidad o ejecutar una nueva corrida.</AlertDescription></Alert>}
      {modelQuery.error && <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertTitle>Motor aún no disponible</AlertTitle><AlertDescription>Aplicá el SQL de la migración para habilitar modelos y corridas.</AlertDescription></Alert>}
      {activeRun && activeRun.pendientes_criticidad > 0 && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Criticidades pendientes de revisión</AlertTitle>
          <AlertDescription>
            Esta corrida contiene {integer.format(activeRun.pendientes_criticidad)} piezas pendientes o sugeridas por el motor. En las corridas nuevas ya no bloquean el cálculo; podés filtrarlas y confirmar o cambiar su V/E/D manualmente.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Piezas analizadas" value={integer.format(activeRun?.total_piezas ?? 0)} />
        <MetricCard label="Piezas sugeridas" value={integer.format(activeRun?.piezas_sugeridas ?? 0)} tone="green" />
        <MetricCard label="Unidades sugeridas" value={integer.format(activeRun?.unidades_sugeridas ?? 0)} tone="green" />
        <MetricCard label="Criticidad pendiente / revisar" value={integer.format(activeRun?.pendientes_criticidad ?? 0)} tone="amber" />
        <MetricCard label="Sin ventas 24m" value={integer.format(activeRun?.piezas_sin_ventas ?? 0)} />
      </div>

      {activeRun && (
        <Card>
          <CardContent className="flex flex-col gap-3 p-3 lg:flex-row lg:items-end">
            <div className="min-w-0 flex-1">
              <Label className={cardLabel}>Corrida consultada</Label>
              <Select value={runId} onValueChange={(value) => { setRunId(value); setPage(1); }}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{runsQuery.data?.map((item) => <SelectItem key={item.id} value={item.id}>{item.nombre} · modelo v{String((item.parametros_snapshot as { version?: number }).version ?? "?")}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              Ventas hasta <strong className="text-foreground">{displayDate(sourceDate)}</strong> · stock importado <strong className="text-foreground">{displayDate(activeRun.fuentes_snapshot?.stock_importado_en as string | undefined)}</strong>
            </div>
            <Button variant="outline" onClick={() => exportMutation.mutate()} disabled={exportMutation.isPending}><Download className="mr-2 h-4 w-4" />Exportar</Button>
          </CardContent>
        </Card>
      )}

      {staleSales && <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertTitle>Histórico desactualizado</AlertTitle><AlertDescription>La última factura detectada es anterior al período esperado. Actualizá la importación antes de tomar una decisión.</AlertDescription></Alert>}

      <Card>
        <CardContent className="p-3">
          <div className="grid gap-2 lg:grid-cols-[minmax(220px,1fr)_190px_190px_auto_auto]">
            <Input placeholder="Código, fabricante o descripción..." value={filters.buscar ?? ""} onChange={(event) => { setFilters((current) => ({ ...current, buscar: event.target.value })); setPage(1); }} />
            <Select value={filters.segmento} onValueChange={(value) => { setFilters((current) => ({ ...current, segmento: value })); setPage(1); }}>
              <SelectTrigger><SelectValue placeholder="Segmento" /></SelectTrigger>
              <SelectContent><SelectItem value="TODOS">Todos los segmentos</SelectItem>{segmentOptions.map((segment) => <SelectItem key={segment} value={segment}>{segment}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={filters.estado} onValueChange={(value) => { setFilters((current) => ({ ...current, estado: value })); setPage(1); }}>
              <SelectTrigger><SelectValue placeholder="Estado de datos" /></SelectTrigger>
              <SelectContent><SelectItem value="TODOS">Todos los estados</SelectItem><SelectItem value="LISTO">Listos</SelectItem><SelectItem value="PENDIENTE_CRITICIDAD">Pendiente (corridas anteriores)</SelectItem><SelectItem value="SIN_REGLA_SEGMENTO">Sin regla (corridas anteriores)</SelectItem><SelectItem value="SIN_VENTAS_24M">Sin ventas 24m</SelectItem></SelectContent>
            </Select>
            <label className="flex h-10 items-center gap-2 rounded-md border px-3 text-xs font-medium"><Checkbox checked={filters.soloSugeridos} onCheckedChange={(checked) => { setFilters((current) => ({ ...current, soloSugeridos: checked === true })); setPage(1); }} />Solo con sugerencia</label>
            <label className="flex h-10 items-center gap-2 rounded-md border px-3 text-xs font-medium"><Checkbox checked={filters.soloCriticidadAutomatica} onCheckedChange={(checked) => { setFilters((current) => ({ ...current, soloCriticidadAutomatica: checked === true })); setPage(1); }} />Criticidad automática</label>
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        {!runId ? (
          <div className="flex min-h-72 flex-col items-center justify-center p-8 text-center"><ShoppingCart className="mb-3 h-10 w-10 text-primary/50" /><h2 className="font-semibold">Todavía no hay corridas para {brand}</h2><p className="mt-1 max-w-md text-sm text-muted-foreground">Aplicá el SQL y ejecutá la primera sugerencia. El cálculo no crea pedidos: solo construye una propuesta revisable.</p></div>
        ) : resultsQuery.isLoading ? (
          <div className="flex min-h-72 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>
        ) : resultsQuery.error ? (
          <div className="p-6 text-sm text-destructive">{resultsQuery.error instanceof Error ? resultsQuery.error.message : "No se pudieron cargar los resultados"}</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[280px]">Pieza</TableHead>
                    <TableHead className="min-w-[190px]">Clasificación</TableHead>
                    <TableHead className="text-right">Stock</TableHead>
                    <TableHead className="text-right">Vendido 12m</TableHead>
                    <TableHead className="text-right">Vendido 24m</TableHead>
                    <TableHead className="min-w-[140px] text-right">Cobertura / horizonte</TableHead>
                    <TableHead className="text-right">Objetivo</TableHead>
                    <TableHead className="text-right">Sugerencia</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => {
                    const cobertura = coberturaActualMeses(row);
                    return (
                      <TableRow key={row.producto_codigo} className="cursor-pointer" onClick={() => setSelected(row)}>
                        <TableCell><p className="font-medium">{row.descripcion}</p><p className="text-[11px] text-muted-foreground">{row.producto_codigo} · {row.codigo_fabricante || "s/cód. fabricante"} · {row.familia || "sin familia"}</p></TableCell>
                        <TableCell><div className="flex flex-wrap gap-1"><Badge variant="outline">{row.abc}{row.fsn}{row.xyz}{row.ved ?? "?"}</Badge><Badge variant={row.estado_datos === "LISTO" ? "secondary" : "destructive"}>{row.segmento}</Badge>{row.criticidad_revisar && <Badge className="border-amber-300 bg-amber-50 text-amber-800" variant="outline">AUTO {Math.round(row.criticidad_confianza * 100)}%</Badge>}</div></TableCell>
                        <TableCell className="text-right font-medium">{decimal.format(row.stock_global)}</TableCell>
                        <TableCell className="text-right"><span className="font-medium">{decimal.format(row.unidades_12m)}</span><span className="ml-1 text-[10px] text-muted-foreground">un.</span></TableCell>
                        <TableCell className="text-right"><span className="font-medium">{decimal.format(row.unidades_24m)}</span><span className="ml-1 text-[10px] text-muted-foreground">un.</span></TableCell>
                        <TableCell className="text-right">
                          <p className="font-medium">{cobertura === null ? "—" : `${decimal.format(cobertura)} meses`}</p>
                          <p className="text-[10px] text-muted-foreground">Horizonte {row.horizonte_meses} meses</p>
                        </TableCell>
                        <TableCell className="text-right font-medium">{decimal.format(row.stock_objetivo)}</TableCell>
                        <TableCell className="text-right"><span className={cn("inline-flex min-w-12 justify-center rounded-full px-2.5 py-1 font-bold", row.sugerencia_unidades > 0 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>{integer.format(row.sugerencia_unidades)}</span></TableCell>
                      </TableRow>
                    );
                  })}
                  {rows.length === 0 && <TableRow><TableCell colSpan={8} className="h-32 text-center text-muted-foreground">No hay piezas que coincidan con los filtros.</TableCell></TableRow>}
                </TableBody>
              </Table>
            </div>
            <div className="flex items-center justify-between border-t px-4 py-3"><p className={metaText}>{integer.format(resultsQuery.data?.count ?? 0)} piezas · página {page} de {totalPages}</p><div className="flex gap-1"><Button size="icon" variant="outline" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}><ChevronLeft className="h-4 w-4" /></Button><Button size="icon" variant="outline" disabled={page >= totalPages} onClick={() => setPage((current) => current + 1)}><ChevronRight className="h-4 w-4" /></Button></div></div>
          </>
        )}
      </Card>

      <div className="flex items-center gap-2 rounded-lg border border-dashed p-3 text-xs text-muted-foreground"><PackageCheck className="h-4 w-4 text-primary" />Primera etapa: stock actual y ventas históricas. Tránsito, precios, devoluciones, garantías y MOQ quedan visibles como extensiones pendientes, sin inventar datos.</div>

      <ModelConfigSheet open={configOpen} onOpenChange={setConfigOpen} model={modelQuery.data ?? null} segmentos={segmentsQuery.data ?? []} canManage={canManage} />
      <ResultDetailSheet row={selected} onClose={() => setSelected(null)} canManage={canManage} onSaved={() => setSelected(null)} />
    </div>
  );
}
