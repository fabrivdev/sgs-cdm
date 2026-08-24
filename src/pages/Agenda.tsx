import { useState } from "react";
import { AgendaTab } from "@/components/parque/AgendaTab";
import { ClientePanel } from "@/components/parque/ClientePanel";
import { PageHeader, PageShell } from "@/components/layout/AppPrimitives";

export default function Agenda() {
  const [clienteAbierto, setClienteAbierto] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);

  const handleOpenCliente = (id: string) => {
    setClienteAbierto(id);
    setPanelOpen(true);
  };

  return (
    <PageShell>
      <PageHeader title="Agenda comercial" />

      <AgendaTab onOpenCliente={handleOpenCliente} onChanged={() => {}} />

      <ClientePanel
        clienteId={clienteAbierto}
        open={panelOpen}
        onOpenChange={setPanelOpen}
        onChanged={() => {}}
      />
    </PageShell>
  );
}

