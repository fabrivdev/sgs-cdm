import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { number, readReport, totals, type Movement } from "./model";

export function TractorImport() {
  const cache = useQueryClient();
  const [pending, setPending] = useState<Movement[]>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function load(file: File) {
    setBusy(true);
    setMessage("");
    setPending(undefined);
    try {
      setPending(await readReport(file));
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
      const { error } = await supabase
        .from("mercado_tractores")
        .upsert({ id: 1, datos: pending });
      if (error) throw error;
      setPending(undefined);
      await cache.invalidateQueries({ queryKey: ["mercado-tractores"] });
      setMessage("Base de tractores guardada.");
    } catch {
      setMessage("No se pudo guardar el informe. Podés volver a intentar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="rounded-lg border p-4">
      <summary className="cursor-pointer font-medium">
        Mercado · Tractores
      </summary>
      <div className="mt-4 space-y-3">
        <label className="block text-sm">
          Importar el Excel con la hoja Base analítica
          <input
            className="block mt-2"
            type="file"
            accept=".xlsx"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void load(file);
            }}
          />
        </label>
        {busy && <p role="status">Procesando informe…</p>}
        {message && <p role="alert">{message}</p>}
        {pending && (
          <div>
            <p>
              La nueva base contiene {number(pending.length)} movimientos y{" "}
              {number(totals(pending).units)} unidades. Al confirmar,
              reemplazará el informe compartido.
            </p>
            <div className="mt-3 flex gap-2">
              <Button disabled={busy} onClick={save}>
                Guardar base
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
