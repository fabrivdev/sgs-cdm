import { useEffect, useRef, useState } from "react";
import { CheckCircle2, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { money } from "@/components/dashboard/utils";
import { supabase } from "@/integrations/supabase/client";
import { parseMachineSalesLegacyWorkbook, type MachineSalesLegacyPreview } from "@/lib/imports/machineSalesLegacy";
import { toast } from "sonner";

type ImportState = {
  cargado: boolean;
  en_proceso: boolean;
  archivo_nombre?: string;
  filas_archivo?: number;
  fecha_desde?: string;
  fecha_hasta?: string;
  facturacion_neta?: number;
  completado_en?: string;
};

const shortDate = (value?: string) => value ? value.slice(0, 10).split("-").reverse().join("/") : "—";
type RpcResult = { data: unknown; error: { message?: string } | null };
const rpc = (name: string, params?: Record<string, unknown>) =>
  supabase.rpc(name as never, (params ?? {}) as never) as unknown as Promise<RpcResult>;

export function MachineSalesLegacyImport({ onChanged }: { onChanged: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<ImportState | null>(null);
  const [stateError, setStateError] = useState("");
  const [preview, setPreview] = useState<MachineSalesLegacyPreview | null>(null);
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);

  const loadState = async () => {
    const { data, error } = await rpc("ventas_maquinas_estado_historico_v1");
    if (error) {
      setStateError(error.message ?? "No se pudo consultar el estado de la carga.");
      setState(null);
      return;
    }
    setStateError("");
    setState((data ?? { cargado: false, en_proceso: false }) as ImportState);
  };

  useEffect(() => { void loadState(); }, []);

  const readFile = async (file: File) => {
    try {
      setPreview(parseMachineSalesLegacyWorkbook(await file.arrayBuffer()));
      setFileName(file.name);
    } catch (error) {
      setPreview(null);
      setFileName("");
      toast.error((error as Error).message);
    }
  };

  const confirm = async () => {
    if (!preview || !fileName) return;
    setBusy(true);
    let loadId: string | null = null;
    try {
      const started = await rpc("ventas_maquinas_iniciar_historico_v1", {
        p_archivo_nombre: fileName,
        p_filas_archivo: preview.rows.length,
      });
      if (started.error) throw started.error;
      loadId = started.data as string;
      for (let index = 0; index < preview.rows.length; index += 200) {
        const batch = await rpc("ventas_maquinas_importar_historico_lote_v1", {
          p_carga_id: loadId,
          p_lineas: preview.rows.slice(index, index + 200),
        });
        if (batch.error) throw batch.error;
      }
      const finished = await rpc("ventas_maquinas_finalizar_historico_v1", { p_carga_id: loadId });
      if (finished.error) throw finished.error;
      toast.success(`Histórico cargado: ${preview.rows.length} líneas, ${money(preview.facturacionNeta)} netos.`);
      setPreview(null);
      setFileName("");
      await loadState();
      onChanged();
    } catch (error) {
      if (loadId) await rpc("ventas_maquinas_cancelar_historico_v1", { p_carga_id: loadId });
      toast.error(`No se pudo cargar el histórico: ${(error as { message?: string }).message ?? "error desconocido"}`);
    } finally {
      setBusy(false);
    }
  };

  if (state?.cargado) return <Card className="border-emerald-500/30 bg-emerald-500/5">
    <CardContent className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
      <div className="flex min-w-0 items-start gap-3">
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
        <div className="min-w-0">
          <div className="text-[13px] font-semibold">Histórico de ventas de máquinas cargado</div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            {state.filas_archivo ?? 0} líneas · {shortDate(state.fecha_desde)} al {shortDate(state.fecha_hasta)} · {money(Number(state.facturacion_neta ?? 0))} netos
          </div>
          <div className="truncate text-[10px] text-muted-foreground">{state.archivo_nombre}</div>
        </div>
      </div>
      <Badge variant="outline" className="w-fit border-emerald-300 text-[10px] text-emerald-700">Carga única cerrada</Badge>
    </CardContent>
  </Card>;

  return <Card className="border-primary/20">
    <CardContent className="space-y-3 p-3 sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-[13px] font-semibold">Histórico de ventas de máquinas</div>
          <div className="mt-1 max-w-3xl text-[11px] text-muted-foreground">Carga única del análisis detallado del sistema anterior. Conserva cada máquina, venta o nota de crédito y completa el período previo al 01/07/2026.</div>
        </div>
        <Badge variant="secondary" className="text-[10px]">Una sola vez</Badge>
      </div>

      {stateError ? <div role="alert" className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">Primero aplicá la migración del histórico. {stateError}</div> : !preview ? <>
        <input ref={inputRef} type="file" accept=".xls,.xlsx" className="hidden" onChange={event => { const file = event.target.files?.[0]; if (file) void readFile(file); event.currentTarget.value = ""; }} />
        <button type="button" onClick={() => inputRef.current?.click()} className="flex w-full items-center gap-3 rounded-lg border border-dashed px-4 py-5 text-left hover:border-primary/50 hover:bg-accent/30">
          <span className="rounded-md bg-primary/10 p-2 text-primary"><Upload className="h-5 w-5" /></span>
          <span><span className="block text-[12px] font-medium">Seleccionar archivo .xls o .xlsx</span><span className="mt-0.5 block text-[10px] text-muted-foreground">Se valida completo antes de habilitar la confirmación.</span></span>
        </button>
      </> : <div className="space-y-3 rounded-lg border bg-background p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2"><FileSpreadsheet className="h-4 w-4 shrink-0 text-primary" /><div className="min-w-0"><div className="truncate text-[12px] font-medium">{fileName}</div><div className="text-[10px] text-muted-foreground">Hoja: {preview.sheetName}</div></div></div>
          <Badge variant="outline" className="text-[10px]">{preview.rows.length} líneas válidas</Badge>
        </div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
          {[
            ["Período", `${shortDate(preview.desde)}–${shortDate(preview.hasta)}`],
            ["Venta bruta", money(preview.ventaBruta)],
            ["Notas de crédito", `-${money(preview.notasCredito)}`],
            ["Facturación neta", money(preview.facturacionNeta)],
            ["Unidades", `${preview.vendidas} vendidas · ${preview.acreditadas} NC`],
          ].map(([label, value]) => <div key={label} className="rounded-md bg-muted/50 px-3 py-2"><div className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div><div className="mt-1 text-[11px] font-semibold tabular-nums">{value}</div></div>)}
        </div>
        <div className="overflow-x-auto rounded-md border"><table className="w-full min-w-[900px] text-[10px]"><thead className="bg-muted/60 text-left text-muted-foreground"><tr>{["Fecha", "Factura", "Máquina", "Grupo", "Cliente", "Unid.", "Neto"].map(label => <th key={label} className="px-2 py-2 font-medium last:text-right">{label}</th>)}</tr></thead><tbody>{preview.rows.slice(0, 8).map(row => <tr key={row.linea_clave} className="border-t"><td className="whitespace-nowrap px-2 py-1.5">{shortDate(row.fecha_factura)}</td><td className="px-2 py-1.5 font-mono">{row.factura}</td><td className="max-w-[260px] truncate px-2 py-1.5" title={row.nombre_mercaderia}>{row.modelo_estimado}</td><td className="px-2 py-1.5">{row.grupo}</td><td className="max-w-[220px] truncate px-2 py-1.5">{row.entidad_nombre}</td><td className="px-2 py-1.5 text-right tabular-nums">{row.cantidad}</td><td className="px-2 py-1.5 text-right font-medium tabular-nums">{money(row.total_venta)}</td></tr>)}</tbody></table></div>
        <div className="flex justify-end gap-2"><Button variant="outline" size="sm" disabled={busy} onClick={() => { setPreview(null); setFileName(""); }}>Cancelar</Button><Button size="sm" disabled={busy} onClick={() => void confirm()}>{busy && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}Confirmar carga única</Button></div>
      </div>}
    </CardContent>
  </Card>;
}
