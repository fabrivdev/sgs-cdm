import { useState } from "react";
import { AgendaTab } from "@/components/parque/AgendaTab";
import { ClientePanel } from "@/components/parque/ClientePanel";
import { pageShell, pageTitle } from "@/lib/ui-classes";

export default function Agenda() {
  const [clienteAbierto, setClienteAbierto] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);

  const handleOpenCliente = (id: string) => {
    setClienteAbierto(id);
    setPanelOpen(true);
  };

  return (
    <div className={pageShell}>
      <div className="mb-4">
        <h1 className={pageTitle}>Agenda comercial</h1>
      </div>

      <AgendaTab
        onOpenCliente={handleOpenCliente}
        onChanged={() => {}}
      />

      <ClientePanel
        clienteId={clienteAbierto}
        open={panelOpen}
        onOpenChange={setPanelOpen}
        onChanged={() => {}}
      />
    </div>
  );
}
