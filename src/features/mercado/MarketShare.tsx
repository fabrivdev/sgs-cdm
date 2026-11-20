import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { PageHeader, PageShell } from "@/components/layout/AppPrimitives";
import { MarketShareDashboard } from "./MarketShareDashboard";
import { parseSalesPeriods } from "./marketShareModel";

export default function MarketShare() {
  const { user } = useAuth();
  const query = useQuery({
    queryKey: ["mercado-market-share", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("mercado_market_share").select("familia,anio,mes,total,detalle");
      if (error) throw error;
      return parseSalesPeriods(data);
    },
  });
  if (query.data?.length) return <MarketShareDashboard periods={query.data} />;
  return (
    <PageShell>
      <PageHeader title="Market Share" />
      {query.isLoading ? <p role="status">Cargando ventas…</p> : query.isError ? (
        <>
          <p>No se pudo consultar Market Share.</p>
          <Button onClick={() => query.refetch()}>Reintentar</Button>
        </>
      ) : <p>Todavía no hay un informe de ventas cargado.</p>}
    </PageShell>
  );
}
