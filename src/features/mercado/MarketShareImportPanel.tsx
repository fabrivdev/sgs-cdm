import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { number } from "./model";
import { readMarketShareUpload } from "./marketShareImport";
import type { SalesPeriod } from "./marketShareModel";

export function MarketShareImportPanel() {
  const cache = useQueryClient();
  const [pending, setPending] = useState<SalesPeriod[]>([]);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  async function read(file: File) {
    setPending([]);
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
    if (!pending.length) return;
    setBusy(true);
    setFeedback("");
    try {
      const { error } = await supabase.rpc("guardar_mercado_market_share", { p_periodos: pending });
      if (error) {
        setFeedback(error.code === "PGRST202"
          ? "Falta aplicar la migración de Market Share en Supabase."
          : "No se pudo guardar el informe de Market Share.");
        return;
      }
      setPending([]);
      setFeedback("Informe de Market Share actualizado.");
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
        {pending.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm">{number(pending.length)} meses por equipo listos para guardar.</p>
            <Button size="sm" disabled={busy} onClick={() => void save()}>Guardar informe</Button>
          </div>
        )}
        {feedback && <p className="text-sm" role="status">{feedback}</p>}
      </div>
    </details>
  );
}
