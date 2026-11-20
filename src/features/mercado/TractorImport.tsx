import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { months, number, parseMovements, totals } from "./model";
import { readHarvesterUpload } from "./harvesterImport";
import { readTractorUpload } from "./tractorPentaImport";
import type { MarketUpload } from "./penta";

function formatMonth(index: number) {
  return months[index % 12] + " " + Math.floor(index / 12);
}

export function TractorImport({ harvester = false }: { harvester?: boolean }) {
  const cache = useQueryClient();
  const equipment = harvester ? "cosechadoras" : "tractores";
  const table = harvester ? "mercado_cosechadoras" : "mercado_tractores";
  const [pending, setPending] = useState<MarketUpload>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function load(files: File[]) {
    setBusy(true);
    setMessage("");
    setPending(undefined);
    try {
      const { data, error } = await supabase
        .from(table)
        .select("datos")
        .eq("id", 1)
        .maybeSingle();
      if (error) throw new Error("No se pudo consultar la base guardada.");
      const existing = data ? parseMovements(data.datos) : [];
      setPending(
        await (harvester
          ? readHarvesterUpload(files, existing)
          : readTractorUpload(files[0], existing)),
      );
    } catch (err) {
      setMessage(
        err instanceof Error && err.name !== "ZodError"
          ? err.message
          : "La base contiene campos incompletos o valores inválidos.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    if (!pending) return;
    setBusy(true);
    setMessage("");
    try {
      const { error } = pending.period
        ? await supabase.rpc("actualizar_mercado_por_periodo", {
            p_familia: equipment,
            p_desde: pending.period.start,
            p_hasta: pending.period.end,
            p_datos: pending.rows,
          })
        : await supabase.from(table).upsert({ id: 1, datos: pending.rows });
      if (error) {
        if (error.code === "PGRST202" || error.code === "42883")
          throw new Error(
            "Falta aplicar la migración de actualización por período en Supabase.",
          );
        if (error.code === "22023" || error.code === "42501")
          throw new Error(error.message);
        throw error;
      }
      setPending(undefined);
      await cache.invalidateQueries({ queryKey: ["mercado-" + equipment] });
      setMessage(
        pending.period
          ? "Período de " + equipment + " actualizado."
          : "Base de " + equipment + " guardada.",
      );
    } catch (err) {
      setMessage(
        err instanceof Error
          ? err.message
          : "No se pudo guardar el informe. Podés volver a intentar.",
      );
    } finally {
      setBusy(false);
    }
  }
  const period = pending?.period;
  const periodLabel =
    period &&
    (period.start === period.end
      ? formatMonth(period.start)
      : formatMonth(period.start) + " a " + formatMonth(period.end));
  return (
    <details className="rounded-lg border p-4">
      <summary className="cursor-pointer font-medium">
        Mercado · {harvester ? "Cosechadoras" : "Tractores"}
      </summary>
      <div className="mt-4 space-y-3">
        <label className="block text-sm">
          Seleccioná el Excel original de Penta/PYimport con los meses completos
          que querés actualizar.
          <input
            className="block mt-2"
            type="file"
            accept=".xlsx"
            multiple={harvester}
            disabled={busy}
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              e.target.value = "";
              if (files.length) void load(files);
            }}
          />
        </label>
        {busy && <p role="status">Procesando informe…</p>}
        {message && <p role="alert">{message}</p>}
        {pending && (
          <div>
            <p>
              {periodLabel && <strong>{periodLabel} · </strong>}
              {number(pending.rows.length)} movimientos y{" "}
              {number(totals(pending.rows).units)} unidades.
              {period
                ? " Se reemplazarán los datos de esos meses y se conservará el resto del histórico."
                : " Esta carga reemplazará la base completa."}
            </p>
            <div className="mt-3 flex gap-2">
              <Button disabled={busy} onClick={save}>
                {period ? "Actualizar período" : "Guardar base"}
              </Button>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => setPending(undefined)}
              >
                Cancelar
              </Button>
            </div>
          </div>
        )}
      </div>
    </details>
  );
}
