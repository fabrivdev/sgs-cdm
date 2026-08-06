import { ComprasPedidosTab } from "@/components/repuestos/ComprasPedidosTab";
import { SolicitudesCompraTab } from "@/components/repuestos/SolicitudesCompraTab";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { pageDescription, pageShell, pageTitle } from "@/lib/ui-classes";

export default function RepuestosCompras() {
  return (
    <div className={pageShell}>
      <div>
        <h1 className={pageTitle}>Compras</h1>
        <p className={pageDescription}>
          Pedidos y solicitudes de compra de repuestos, importados desde TOTVS, con seguimiento propio por pedido.
        </p>
      </div>

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
