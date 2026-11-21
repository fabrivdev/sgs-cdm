import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { number } from "./model";
import { readMarketShareUpload } from "./marketShareImport";

export function MarketShareImportPanel() {
  const cache = useQueryClient();
  const [pending, setPending] = useState<Awaited<ReturnType<typeof readMarketShareUpload>> | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  async function read(file: File) {
    setPending(null);
    setFeedback("");
    setBusy(true);
    try {
      setPending(await readMarketShareUpload(file));
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "No se pudo leer el informe.");
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    if (!pending) return;
    setBusy(true);
    setFeedback("");
    try {
      const { error } = pending.source === "cadam"
        ? await supabase.from("mercado_market_share_cadam").upsert(pending.periods.map(({ familia, anio, mes, total, detalle }) =>
          ({ familia, anio, mes, total, detalle })))
        : await supabase.rpc("guardar_mercado_market_share", { p_periodos: pending.periods });
      if (error) {
        setFeedback(["PGRST202", "PGRST205", "42P01"].includes(error.code)
          ? pending.source === "cadam" ? "Falta aplicar la migración del histórico CADAM en Supabase." : "Falta aplicar la migración de Market Share en Supabase."
          : "No se pudo guardar el informe de Market Share.");
        return;
      }
      setPending(null);
      setFeedback(pending.source === "cadam" ? "Histórico CADAM actualizado." : "Informe de Market Share actualizado.");
      await cache.invalidateQueries({ queryKey: ["mercado-market-share"] });
    } catch {
      setFeedback("No se pudo guardar el informe de Market Share.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="rounded-lg border p-4">
      <summary className="cursor-pointer font-medium">Mercado · Market Share</summary>
      <div className="mt-4 space-y-3">
        <label className="block text-sm">
          Excel de ventas de maquinaria
          <input type="file" accept=".xlsx" className="mt-2 block w-full" disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void read(file);
            }} />
        </label>
        {pending && (
          <div className="space-y-2">
            <p className="text-sm">{number(pending.periods.length)} meses por equipo listos para guardar.</p>
            <Button size="sm" disabled={busy} onClick={() => void save()}>{pending.source === "cadam" ? "Guardar histórico CADAM" : "Guardar informe"}</Button>
          </div>
        )}
        {feedback && <p className="text-sm" role="status">{feedback}</p>}
      </div>
    </details>
  );
}
