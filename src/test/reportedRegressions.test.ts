import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("reported production regressions", () => {
  it("lets admins change sections through a guarded RPC and backfills sales pages", () => {
    const sql = read("supabase/migrations/20260914120000_restore_admin_section_access.sql");
    const ui = read("src/pages/Admin.tsx");
    expect(sql).toContain("has_role(auth.uid(), 'admin'::public.app_role)");
    expect(sql).toContain("has_role(p_user_id, 'superadmin'::public.app_role)");
    expect(sql).toContain("'servicios.ventas', 'parque.ventas', 'repuestos.ventas'");
    expect(ui).toContain('rpc("admin_actualizar_acceso_seccion"');
  });

  it("preserves progressed machine-order states when editing", () => {
    const sql = read("supabase/migrations/20260914121000_preserve_machine_order_progress_on_edit.sql");
    const ui = read("src/pages/MaquinariaOperaciones.tsx");
    expect(sql).toContain("v_estado_anterior NOT IN ('ABASTECIMIENTO', 'EN_IMPORTACION')");
    expect(sql).toContain("SET estado = v_estado_anterior");
    expect(ui).toContain('rpc("maquinaria_actualizar_operacion_preservando_estado"');
  });

  it("keeps import order editing compact and moves explanations on demand", () => {
    const ui = read("src/pages/MaquinariaOperaciones.tsx");
    expect(ui).toContain('Field label="Valor OC"');
    expect(ui).toContain('Field label="Moneda"');
    expect(ui).toContain('Field label="Alcance"');
    expect(ui).toContain('label="Ayuda sobre el pedido de importación"');
    expect(ui).not.toContain('Valor acordado OC');
    expect(ui).not.toContain('El valor OC corresponde a');
    expect(ui).not.toContain('Estos datos son generales del pedido.');
    expect(ui).not.toContain('Los documentos adjuntos son compartidos por el pedido/lote.');
  });

  it("extracts supplier invoice fields on upload and does not offer arrival twice", () => {
    const ui = read("src/pages/MaquinariaOperaciones.tsx");
    expect(ui).toContain("extractSupplierInvoice(file)");
    expect(ui).toContain("machineSupplierInvoicePatch(extraction)");
    expect(ui).toContain('rpc("maquinaria_actualizar_unidad_importacion"');
    expect(ui).toContain('arrival === "PLANIFICADO" || arrival === "EN_TRANSITO"');
    expect(ui).toContain("canEdit && canRegisterArrival");
    expect(ui).toContain("const refreshed = await operationsQuery.refetch()");
  });

  it("lets an open or partially billed order correct the pending agreed value", () => {
    const ui = read("src/pages/MaquinariaOperaciones.tsx");
    expect(ui).toContain("Valor pendiente por unidad");
    expect(ui).toContain("valor_acordado_unitario: line.valor_acordado_unitario");
    expect(ui).toContain("unit.linea_id === line.id && unit.valor_facturado != null");
    expect(ui).toContain("disabled={fullyBilled}");
  });

  it("moves the stock export to one RPC and tunes report plans", () => {
    const sql = read("supabase/migrations/20260914123000_optimize_sales_and_parts_reports.sql");
    const hook = read("src/hooks/useRepuestos.ts");
    expect(sql).toContain("repuestos_catalogo_stock_exportar");
    expect(sql).toContain("force_custom_plan");
    expect(sql).toContain("statement_timeout TO '120s'");
    expect(hook).toContain('rpc as any)("repuestos_catalogo_stock_exportar"');
  });

  it("accepts OTROS and preserves imported custom machine brands", () => {
    const sql = read("supabase/migrations/20260914122000_allow_otros_in_customer_machine_park.sql");
    const importer = read("src/components/parque/ImportarTab.tsx");
    expect(sql).toContain("IF v_solicitada = 'OTROS'");
    expect(sql).toContain("NEW.marca_nombre := 'OTROS'");
    expect(importer).toContain("marca_nombre: marcaNombre");
    expect(importer).not.toContain("const marcasAdmitidas = nuevos.filter");
  });
});
