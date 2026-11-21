import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { TractorDashboard } from "./TractorDashboard";
import { parseMovements } from "./model";
import { marketFamilies, type MarketFamily } from "./marketFamily";

export default function Tractores({
  family = "tractores",
}: {
  family?: MarketFamily;
}) {
  const { user, can } = useAuth();
  const equipment = marketFamilies[family];
  const query = useQuery({
    queryKey: ["mercado-" + family, user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from(equipment.table)
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
        Cargando mercado de {family}…
      </p>
    );
  if (query.isError)
    return (
      <div className="p-6 space-y-4">
        <p>No se pudo consultar el mercado de {family}.</p>
        <Button onClick={() => query.refetch()}>Reintentar</Button>
      </div>
    );
  return (
    <>
      {query.data?.length ? (
        <TractorDashboard rows={query.data} family={family} canExport={can("datos:exportar")} />
      ) : (
        <div className="p-6">
          <h1 className="text-2xl font-semibold">Mercado de {family}</h1>
          <p className="mt-2">Todavía no hay un informe cargado.</p>
        </div>
      )}
    </>
  );
}
