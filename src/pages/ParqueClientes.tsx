import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ParqueTab } from "@/components/parque/ParqueTab";
import { AgendaTab } from "@/components/parque/AgendaTab";
import { ImportarTab } from "@/components/parque/ImportarTab";
import { ClientePanel } from "@/components/parque/ClientePanel";
import { Tractor, CheckCircle2, PhoneCall, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface Metricas {
  totalMaquinas: number;
  pctConServicioUltimoAnio: number;
  pctContactadosEsteMes: number;
  sinContacto60d: number;
}

export default function ParqueClientes() {
  const [metricas, setMetricas] = useState<Metricas>({
    totalMaquinas: 0,
    pctConServicioUltimoAnio: 0,
    pctContactadosEsteMes: 0,
    sinContacto60d: 0,
  });
  const [refreshKey, setRefreshKey] = useState(0);
  const [clienteAbierto, setClienteAbierto] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);

  const cargarMetricas = async () => {
    const hoy = new Date();
    const haceUnAnio = new Date(hoy);
    haceUnAnio.setFullYear(hoy.getFullYear() - 1);
    const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    const hace60d = new Date(hoy);
    hace60d.setDate(hoy.getDate() - 60);

    const [maquinasRes, facturacionRes, facturacion60Res, seguimientosRes] = await Promise.all([
      supabase.from("parque_maquinas").select("id, cliente_id", { count: "exact" }).eq("activo", true),
      supabase
        .from("facturacion")
        .select("cliente_id, fecha, tipo")
        .eq("tipo", "Servicio")
        .gte("fecha", haceUnAnio.toISOString().slice(0, 10)),
      supabase
        .from("facturacion")
        .select("cliente_id")
        .eq("tipo", "Servicio")
        .gte("fecha", hace60d.toISOString().slice(0, 10)),
      supabase.from("seguimiento_comercial").select("cliente_id, fecha"),
    ]);

    const totalMaquinas = maquinasRes.count ?? 0;

    // Clientes CON máquinas (universo para métricas comerciales)
    const clientesConMaquinas = new Set<string>();
    for (const m of maquinasRes.data ?? []) {
      if (m.cliente_id) clientesConMaquinas.add(m.cliente_id);
    }

    const clientesConServicio = new Set(
      (facturacionRes.data ?? []).map((f) => f.cliente_id).filter(Boolean) as string[],
    );
    const totalClientes = clientesConMaquinas.size;
    const conServicio = [...clientesConServicio].filter((c) => clientesConMaquinas.has(c)).length;
    const pctConServicioUltimoAnio =
      totalClientes > 0 ? Math.round((conServicio / totalClientes) * 100) : 0;

    // Clientes con servicio en últimos 60 días
    const clientesConServicio60d = new Set(
      (facturacion60Res.data ?? []).map((f) => f.cliente_id).filter(Boolean) as string[],
    );

    const ultimoSegPorCliente = new Map<string, Date>();
    for (const s of seguimientosRes.data ?? []) {
      const f = new Date(s.fecha);
      const prev = ultimoSegPorCliente.get(s.cliente_id);
      if (!prev || f > prev) ultimoSegPorCliente.set(s.cliente_id, f);
    }

    let contactadosEsteMes = 0;
    let sinContacto60d = 0;
    for (const cid of clientesConMaquinas) {
      const ult = ultimoSegPorCliente.get(cid);
      if (ult && ult >= inicioMes) contactadosEsteMes++;
      // Sin contacto +60d: no consume servicio hace 60d Y no fue contactado hace 60d
      const sinServicio60d = !clientesConServicio60d.has(cid);
      const sinSeguimiento60d = !ult || ult < hace60d;
      if (sinServicio60d && sinSeguimiento60d) sinContacto60d++;
    }

    const pctContactadosEsteMes =
      totalClientes > 0 ? Math.round((contactadosEsteMes / totalClientes) * 100) : 0;

    setMetricas({ totalMaquinas, pctConServicioUltimoAnio, pctContactadosEsteMes, sinContacto60d });
  };

  useEffect(() => {
    cargarMetricas();
  }, [refreshKey]);

  const handleChanged = () => setRefreshKey((k) => k + 1);

  const handleOpenCliente = (id: string) => {
    setClienteAbierto(id);
    setPanelOpen(true);
  };

  const cards = useMemo(
    () => [
      {
        label: "Máquinas activas",
        value: metricas.totalMaquinas.toLocaleString(),
        icon: Tractor,
        accent: "text-primary",
      },
      {
        label: "% con servicio último año",
        value: `${metricas.pctConServicioUltimoAnio}%`,
        icon: CheckCircle2,
        accent: "text-emerald-600",
      },
      {
        label: "% contactados este mes",
        value: `${metricas.pctContactadosEsteMes}%`,
        icon: PhoneCall,
        accent: "text-blue-600",
      },
      {
        label: "Sin contacto +60 días",
        value: metricas.sinContacto60d.toLocaleString(),
        icon: AlertTriangle,
        accent: metricas.sinContacto60d > 0 ? "text-destructive" : "text-muted-foreground",
        critical: metricas.sinContacto60d > 0,
      },
    ],
    [metricas],
  );

  return (
    <div className="container mx-auto px-3 py-4 sm:px-4 sm:py-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold sm:text-2xl">Parque &amp; Clientes</h1>
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4 mb-4">
        {cards.map((c) => (
          <Card
            key={c.label}
            className={cn(
              "border",
              c.critical && "border-destructive/40 bg-destructive/5",
            )}
          >
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground sm:text-xs">
                    {c.label}
                  </div>
                  <div className={cn("mt-1 text-xl font-bold sm:text-2xl", c.accent)}>
                    {c.value}
                  </div>
                </div>
                <c.icon className={cn("h-4 w-4 shrink-0 sm:h-5 sm:w-5", c.accent)} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="parque">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="parque">Parque de máquinas</TabsTrigger>
          <TabsTrigger value="agenda">Agenda comercial</TabsTrigger>
          <TabsTrigger value="importar">Importar datos</TabsTrigger>
        </TabsList>

        <TabsContent value="parque" className="mt-4">
          <ParqueTab key={`p-${refreshKey}`} onChanged={handleChanged} onOpenCliente={handleOpenCliente} />
        </TabsContent>
        <TabsContent value="agenda" className="mt-4">
          <AgendaTab key={`a-${refreshKey}`} onOpenCliente={handleOpenCliente} onChanged={handleChanged} />
        </TabsContent>
        <TabsContent value="importar" className="mt-4">
          <ImportarTab onChanged={handleChanged} />
        </TabsContent>
      </Tabs>

      <ClientePanel
        clienteId={clienteAbierto}
        open={panelOpen}
        onOpenChange={setPanelOpen}
        onChanged={handleChanged}
      />
    </div>
  );
}
