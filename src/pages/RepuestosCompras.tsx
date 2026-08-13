import { ComprasPedidosTab } from "@/components/repuestos/ComprasPedidosTab";
import { SolicitudesCompraTab } from "@/components/repuestos/SolicitudesCompraTab";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { pageShell } from "@/lib/ui-classes";
import { PageHeader } from "@/components/layout/AppPrimitives";

export default function RepuestosCompras() {
  return (
    <div className={pageShell}>
      <PageHeader title="Compras" />

      <Tabs defaultValue="pedidos">
        <TabsList>
          <TabsTrigger value="pedidos">Pedidos</TabsTrigger>
          <TabsTrigger value="solicitudes">Solicitudes</TabsTrigger>
        </TabsList>

        <TabsContent value="pedidos" className="space-y-3">
          <ComprasPedidosTab />
        </TabsContent>

        <TabsContent value="solicitudes" className="space-y-3">
          <SolicitudesCompraTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
