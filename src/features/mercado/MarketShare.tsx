import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { PageHeader, PageShell } from "@/components/layout/AppPrimitives";
import { MarketShareDashboard } from "./MarketShareDashboard";
import { parseSalesPeriods } from "./marketShareModel";
import { combineMarketShareSources } from "./marketShareSources";

export default function MarketShare() {
  const { user } = useAuth();
  const query = useQuery({
    queryKey: ["mercado-market-share", user?.id],
    queryFn: async () => {
      const fields = "familia,anio,mes,total,detalle";
      const [report, cadam] = await Promise.all([
        supabase.from("mercado_market_share").select(fields),
        supabase.from("mercado_market_share_cadam").select(fields),
      ]);
      if (report.error) throw report.error;
      if (cadam.error && cadam.error.code !== "PGRST205" && cadam.error.code !== "42P01") throw cadam.error;
      return combineMarketShareSources(parseSalesPeriods(report.data), parseSalesPeriods(cadam.data ?? []));
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
