import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import { ImportDetailDrawer, ImportsTable } from "./MaquinariaOperaciones";
import { DetailSection } from "@/components/maquinaria/MachineDetailPrimitives";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), admin: true }));
vi.mock("pdfjs-dist", () => ({ getDocument: vi.fn(), GlobalWorkerOptions: {} }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ isAdmin: mocks.admin, roles: [] }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mocks.rpc } }));

type Row = NonNullable<ComponentProps<typeof ImportDetailDrawer>["row"]>;
const row: Row = {
  id: "fixture-unit", importacion_linea_id: "", numero_unidad: 1, cantidad_lote: 1,
  operacion_id: null, linea_id: null, unidad_id: null, np_numero: null, np_fecha: null,
  cliente_nombre: null, comercial: null, marca: "HORSCH", producto: "PULVERIZADORAS", modelo: "Modelo ficticio",
  cantidad: 1, estado_fuente: "Planificado", oc: "OC-TEST", po: null, fecha_pedido: "2026-01-21", eta: "2026-12-17", ata: null,
  llave_interna: "TEST-1", proveedor: "HORSCH", invoice_supplier: null, factura_proveedor_fecha: null, factura_proveedor_moneda: null,
  precio_oc: 500, costo_final_sin_iva: null, costo_final: 450, chasis: null,
  venta_facturada: null, valor_venta: null, situacion_vinculo: null, estado_disponibilidad: null,
  disponibilidad_detalle: null, stock_sucursal: null, stock_deposito: null, stock_saldo: null,
  vinculo_manual: false, detalle_manual: false, alcance_valor_oc: "UNITARIO", moneda_oc: "USD",
  costo_stock_habilitado: false, stock_fisico_confirmado: false,
};
function setup(patch: Partial<Row> = {}) {
  const saved = vi.fn();
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <ImportDetailDrawer row={{ ...row, ...patch }} onOpenChange={vi.fn()} onEditHeader={vi.fn()} onSaved={saved} />
  </QueryClientProvider>);
  return saved;
}
beforeEach(() => { mocks.admin = true; mocks.rpc.mockReset().mockResolvedValue({ data: {}, error: null }); });
afterEach(cleanup);

describe("Importaciones: detalle compacto", () => {
  it("la tabla usa solo las cinco situaciones sin esconder registros antiguos", () => {
    const sources = ["DISPONIBLE", "RESERVADO", "EN_PARQUE", "SIN_CHASIS", "SIN_CONCILIAR", "VENDIDO_PENDIENTE_ENTREGA", "CONFLICTO"];
    const rows = sources.map((source, n) => ({ ...row, id: `TEST-${n}`, llave_interna: `TEST-${n}`, chasis: source === "SIN_CHASIS" ? null : `CH-${n}`, estado_disponibilidad: source }));
    const selected = vi.fn();
    render(<ImportsTable rows={rows} heading={key => key} onSelect={selected} />);
    expect(screen.getAllByRole("row")).toHaveLength(8);
    expect(screen.getByText("Stock", { exact: true })).toBeInTheDocument();
    expect(screen.getAllByText("Reservado", { exact: true })).toHaveLength(2);
    expect(screen.getByText("En parque", { exact: true })).toBeInTheDocument();
    expect(screen.getAllByText("Sin conciliar", { exact: true })).toHaveLength(2);
    expect(screen.queryByText("Conflicto", { exact: true })).not.toBeInTheDocument();
    expect(screen.queryByText("Vendido · por entregar", { exact: true })).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("TEST-6", { exact: true }));
    expect(selected).toHaveBeenCalledWith(rows[6]);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("Sin conciliar conserva la incidencia original en el detalle", () => {
    setup({ chasis: "TEST-ISSUE", estado_disponibilidad: "CONFLICTO", stock_sucursal: "Sucursal ficticia", disponibilidad_detalle: "Referencia ficticia" });
    expect(screen.getByText("Sin conciliar", { exact: true })).toBeInTheDocument();
    expect(screen.getByText("Referencia ficticia", { exact: true })).toBeInTheDocument();
    expect(screen.getByText("Revisá la vinculación del chasis en Stock.")).toBeInTheDocument();
    expect(screen.queryByText("Conflicto", { exact: true })).not.toBeInTheDocument();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("usa títulos cortos, sin párrafos permanentes ni estado repetido, conservando datos", () => {
    setup();
    for (const title of ["Seguimiento", "Unidad", "Pedido y embarque", "OC vs factura", "Costo de stock"]) {
      expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    }
    expect(screen.getAllByText("Planificado", { exact: true })).toHaveLength(1);
    expect(screen.queryByText("Estado de importación")).not.toBeInTheDocument();
    expect(screen.queryByText(/Completar requiere fecha/)).not.toBeInTheDocument();
    expect(screen.getByText("Referencia histórica")).toBeInTheDocument();
    expect(screen.getByText("Pendiente de stock")).toBeInTheDocument();
    expect(screen.getByText("1/1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Iniciar tránsito" })).toBeEnabled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("abre ayuda bajo demanda y permite cerrar con Escape, sin ejecutar operaciones", async () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Ayuda: OC vs factura" }));
    expect(await screen.findByRole("dialog", { name: "Ayuda: OC vs factura" })).toHaveTextContent("misma moneda y base impositiva");
    fireEvent.keyDown(screen.getByRole("dialog", { name: "Ayuda: OC vs factura" }), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Ayuda: OC vs factura" })).not.toBeInTheDocument());
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("editar y guardar unidad conserva el payload limitado al campo modificado", async () => {
    const saved = setup();
    fireEvent.click(screen.getByRole("button", { name: "Editar unidad" }));
    fireEvent.change(screen.getByLabelText("Chasis"), { target: { value: "TEST-CHASIS" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith("maquinaria_actualizar_unidad_importacion", {
      p_unidad_id: row.id, p_datos: { chasis: "TEST-CHASIS" },
    }));
    await waitFor(() => expect(saved).toHaveBeenCalledOnce());
  });
  it("mantiene la transición y la solicitud de chasis antes de registrar arribo", async () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Iniciar tránsito" }));
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith("maquinaria_iniciar_transito_importacion", { p_importacion_unidad_id: row.id }));
    fireEvent.click(screen.getByRole("button", { name: "Registrar arribo" }));
    expect(await screen.findByText("Primero asigná el chasis.")).toBeInTheDocument();
  });
  it("no esconde inconsistencias de fecha ni de moneda", () => {
    setup({ estado_fuente: "Arribado", valor_factura_proveedor: 600, factura_proveedor_moneda: "EUR" });
    expect(screen.getByText(/El registro antiguo indica recepción pero no tiene fecha/)).toBeInTheDocument();
    expect(screen.getByText("Monedas diferentes: no comparable")).toBeInTheDocument();
  });
  it("solo habilita costo con stock confirmado y omite seguimiento vacío", () => {
    setup({ ata: "2026-05-23", chasis: "TEST-CHASIS", costo_stock_habilitado: true, stock_fisico_confirmado: true, estado_disponibilidad: "RESERVADO" });
    expect(screen.getAllByText("Completado", { exact: true })).toHaveLength(1);
    expect(screen.queryByRole("heading", { name: "Seguimiento" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Editar costo de stock" })).toBeEnabled();
    expect(screen.getByText("Costo con IVA")).toBeInTheDocument();
    expect(screen.queryByText("Referencia histórica")).not.toBeInTheDocument();
  });
  it("completa una máquina en parque sin inventar ATA ni habilitar su costo de stock", () => {
    setup({ estado_fuente: "ARRIBADA", chasis: "TEST-PARK", parque_confirmado: true, estado_disponibilidad: "EN_PARQUE" });
    expect(screen.getAllByText("Completado", { exact: true })).toHaveLength(1);
    expect(screen.queryByRole("heading", { name: "Seguimiento" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Editar costo de stock" })).not.toBeInTheDocument();
    expect(screen.getByText("Referencia histórica")).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Recepción" }), { button: 0 });
    expect(screen.getByText("En parque", { exact: true })).toBeInTheDocument();
    expect(screen.queryByText("Pendiente de confirmación")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Anular recepción" })).not.toBeInTheDocument();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("no llama completado a un chasis duplicado y conserva el aviso", () => {
    setup({ chasis: "DUP", ata: "2026-05-23", chasis_ambiguo: true, stock_fisico_confirmado: true });
    expect(screen.getAllByText("Arribado", { exact: true })).toHaveLength(1);
    expect(screen.getByText("Chasis duplicado: revisar Stock o Parque.")).toBeInTheDocument();
  });
  it("completa por stock sin ATA y mantiene pendiente el costo", () => {
    setup({ chasis: "TEST-STOCK", stock_fisico_confirmado: true, estado_disponibilidad: "RESERVADO" });
    expect(screen.getByText("Completado", { exact: true })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Iniciar tránsito" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Editar costo de stock" })).not.toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Recepción" }), { button: 0 });
    expect(screen.getByText("Stock confirmado", { exact: true })).toBeInTheDocument();
    expect(screen.queryByText("Pendiente de confirmación")).not.toBeInTheDocument();
  });
  it("reserva Arribado para fecha registrada sin coincidencia en sistema", () => {
    setup({ chasis: "TEST-PENDING", ata: "2026-05-23" });
    expect(screen.getByText("Arribado", { exact: true })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Registrar arribo" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Seguimiento" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Iniciar tránsito" })).not.toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Recepción" }), { button: 0 });
    expect(screen.getByText("Pendiente de confirmación", { exact: true })).toBeInTheDocument();
  });
  it("respeta permisos de solo lectura y conserva la ayuda", () => {
    mocks.admin = false; setup();
    expect(screen.queryByRole("button", { name: /Editar/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Iniciar tránsito" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ayuda: Costo de stock" })).toBeInTheDocument();
  });
  it("no añade ayuda ni modifica acciones en otras secciones sin help", () => {
    render(<DetailSection card title="Otro panel" action={<button>Acción existente</button>}><span>Dato existente</span></DetailSection>);
    expect(screen.queryByRole("button", { name: /Ayuda/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Acción existente" })).toBeInTheDocument();
    expect(screen.getByText("Dato existente")).toBeInTheDocument();
  });
});
