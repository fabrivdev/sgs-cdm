import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { TractorDashboard } from "./TractorDashboard";
import { parseMovements } from "./model";

export default function Tractores() {
  const { user } = useAuth();
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
    </>
  );
}
