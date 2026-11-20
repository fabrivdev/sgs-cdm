import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { months, number, readReport, totals, type Movement } from "./model";
import { readHarvesterReport } from "./harvesterImport";

export function TractorImport({ harvester = false }: { harvester?: boolean }) {
  const cache = useQueryClient();
  const equipment = harvester ? "cosechadoras" : "tractores";
  const [pending, setPending] = useState<Movement[]>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function load(files: File[]) {
    setBusy(true);
    setMessage("");
    setPending(undefined);
    try {
      setPending(
        await (harvester ? readHarvesterReport(files) : readReport(files[0])),
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
      const { error } = await supabase
        .from(harvester ? "mercado_cosechadoras" : "mercado_tractores")
        .upsert({ id: 1, datos: pending });
      if (error) throw error;
      setPending(undefined);
      await cache.invalidateQueries({ queryKey: ["mercado-" + equipment] });
      setMessage("Base de " + equipment + " guardada.");
    } catch {
      setMessage("No se pudo guardar el informe. Podés volver a intentar.");
    } finally {
      setBusy(false);
    }
  }
  const latest =
    harvester && pending
      ? pending.reduce((last, row) =>
          row[1] > last[1] || (row[1] === last[1] && row[2] > last[2])
            ? row
            : last,
        )
      : undefined;
  return (
    <details className="rounded-lg border p-4">
      <summary className="cursor-pointer font-medium">
        Mercado · {harvester ? "Cosechadoras" : "Tractores"}
      </summary>
      <div className="mt-4 space-y-3">
        <label className="block text-sm">
          {harvester
            ? "Seleccioná juntos el histórico OCIT de cosechadoras y todos los extractos PYimport que querés incorporar."
            : "Importar el Excel con la hoja Base analítica"}
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
              La nueva base contiene {number(pending.length)} movimientos y{" "}
              {number(totals(pending).units)} unidades
              {latest
                ? " hasta " + months[latest[2] - 1] + " " + latest[1]
                : ""}
              . Al confirmar, reemplazará el informe compartido.
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
