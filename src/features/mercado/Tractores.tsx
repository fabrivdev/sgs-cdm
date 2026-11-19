import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { TractorDashboard } from "./TractorDashboard";
import {
  parseMovements,
  number,
  readReport,
  totals,
  type Movement,
} from "./model";

export default function Tractores() {
  const { user, isAdmin } = useAuth();
  const [pending, setPending] = useState<Movement[]>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const query = useQuery({
    queryKey: ["mercado-tractores", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mercado_tractores")
        .select("datos")
        .eq("id", 1)
        .maybeSingle();
      if (error) throw error;
      return data ? parseMovements(data.datos) : [];
    },
  });
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
      await query.refetch();
    } catch {
      setMessage("No se pudo guardar el informe. Podés volver a intentar.");
    } finally {
      setBusy(false);
    }
  }
  if (query.isLoading)
    return (
      <p className="p-6" role="status">
        Cargando mercado de tractores…
      </p>
    );
  if (query.isError)
    return (
      <div className="p-6 space-y-4">
        <p>No se pudo consultar el mercado de tractores.</p>
        <Button onClick={() => query.refetch()}>Reintentar</Button>
      </div>
    );
  return (
    <>
      {query.data?.length ? (
        <TractorDashboard rows={query.data} />
      ) : (
        <div className="p-6">
          <h1 className="text-2xl font-semibold">Mercado de tractores</h1>
          <p className="mt-2">Todavía no hay un informe cargado.</p>
        </div>
      )}
      {isAdmin && (
        <details className="m-4 rounded-lg border p-4">
          <summary className="cursor-pointer font-medium">
            Administrar base de tractores
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
      )}
    </>
  );
}
