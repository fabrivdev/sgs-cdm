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

  it("inherits the chassis from a linked import instead of requesting it twice", () => {
    const ui = read("src/pages/MaquinariaOperaciones.tsx");
    const sql = read("supabase/migrations/20260922140000_sync_linked_import_chassis.sql");
    expect(ui).toContain("const importChassis = String(linkedImport?.chasis");
    expect(ui).toContain("canEdit && !chassisComesFromImport");
    expect(ui).toContain("linkedImport={detail.imports.find");
    expect(sql).toContain("maquinaria_sincronizar_chasis_importacion_vinculada");
    expect(sql).toContain("importacion.unidad_id = unidad.id");
  });

  it("uses the import-style header menu and deletes a whole machine order atomically", () => {
    const ui = read("src/pages/MaquinariaOperaciones.tsx");
    const sql = read("supabase/migrations/20260922160000_allow_deleting_unbilled_machine_orders.sql");
    expect(ui).toContain('aria-label="Acciones del pedido"');
    expect(ui).toContain("Eliminar pedido");
    expect(ui).toContain('rpc("maquinaria_eliminar_pedido"');
    expect(ui).not.toContain('ResponsiveDrawerFooter><Button variant="outline" size="sm" onClick={() => onEdit(operationId)}');
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.maquinaria_eliminar_pedido");
    expect(sql).toContain("FOR UPDATE");
    expect(sql).toContain("factura de venta o una maquina entregada al parque");
    expect(sql).not.toContain("u.valor_facturado IS NOT NULL");
    expect(sql).not.toContain("s.id IS NOT NULL");
    expect(sql).toContain("u.estado IN ('FACTURADA', 'EN_PARQUE', 'TRANSFERIDA')");
    expect(sql).toContain("DELETE FROM public.maquinaria_operaciones");
  });

  it("accepts and reads a machine order supplied as PDF", () => {
    const ui = read("src/pages/MaquinariaOperaciones.tsx");
    const extractor = read("supabase/functions/machine-document-extractor/index.ts");
    expect(ui).toContain('accept=".pdf,application/pdf,image/jpeg,image/png,image/webp"');
    expect(ui).toContain('mimeType: "application/pdf"');
    expect(ui).toContain("Subir NP en PDF o imagen");
    expect(extractor).toContain("application\\/pdf|image\\/(jpeg|png|webp)");
    expect(extractor).toContain("El documento supera el limite de 12 MB");
  });

  it("keeps one canonical configured model and bills multi-unit orders by unit", () => {
    const catalogSql = read("supabase/migrations/20260922170000_unify_configured_machine_models.sql");
    const billingSql = read("supabase/migrations/20260922180000_bill_machine_orders_by_unit.sql");
    const validation = read("src/lib/machineOrderValidation.ts");
    const ui = read("src/pages/MaquinariaOperaciones.tsx");
    expect(catalogSql).toContain("CONVIO FLEX 1080 35 PIES");
    expect(catalogSql).toContain("CONVIO FLEX 1080");
    expect(catalogSql).toContain("revisado_manual = true");
    expect(validation).toContain("configuredHeaderBase");
    expect(billingSql).toContain("DROP INDEX IF EXISTS public.maquinaria_documentos_comerciales_unico_idx");
    expect(billingSql).toContain("maquinaria_facturas_venta_unidades");
    expect(billingSql).toContain("maquinaria_vincular_factura_venta");
    expect(ui).toContain("Factura sin máquina asignada");
    expect(ui).toContain("Adjuntar factura");
    expect(ui).toContain('rpc("maquinaria_vincular_factura_venta"');
  });

  it("uses the compact import-style actions for machine-order documents", () => {
    const ui = read("src/pages/MaquinariaOperaciones.tsx");
    expect(ui).toContain('<DocumentRow compactActions label="Nota de pedido"');
    expect(ui).toContain('<AttachOrderDocumentButton compact operationId={operationId}');
    expect(ui).toContain('<SaleInvoiceButton compact operationId={operationId}');
    expect(ui).toContain('<DeleteDocumentButton compact documentLabel="Nota de pedido"');
    expect(ui).toContain('aria-label={compact ? actionLabel : undefined}');
    expect(ui).toContain('className={compact ? "h-8 w-8" : undefined}');
  });

  it("requires authorization before moving a returned machine from Park to Stock", () => {
    const sql = read("supabase/migrations/20260922200000_authorize_stock_returns_from_park.sql");
    const panel = read("src/components/NotificationsPanel.tsx");
    const dialog = read("src/components/parque/MachineStockReturnNotificationDialog.tsx");
    const stock = read("src/components/parque/StockMaquinasTab.tsx");
    expect(sql).toContain("generar_notificaciones_stock_en_parque");
    expect(sql).toContain("'stock_chasis_en_parque'");
    expect(sql).toContain("confirmar_notificacion_ingreso_stock_parque");
    expect(sql).toContain("FOR UPDATE");
    expect(sql).toContain("SET activo = false");
    expect(sql).toContain("parque_origen_id = v_parque.id");
    expect(sql).toContain("'movimiento', 'PARTE_DE_PAGO'");
    expect(sql).toContain("v_avisos := public.generar_notificaciones_stock_en_parque(p_carga_id)");
    expect(sql).toContain("maquinaria_bloquear_stock_activo_en_parque");
    expect(sql).toContain("NEW.unidad_operacion_id := NULL");
    expect(sql).toContain("primero confirme su ingreso a Stock desde la notificación");
    expect(sql).not.toContain("PERFORM public.confirmar_notificacion_ingreso_stock_parque");
    expect(panel).toContain('item.tipo === "stock_chasis_en_parque"');
    expect(dialog).toContain("Hasta entonces no se realiza ningún movimiento");
    expect(dialog).toContain("Mantener pendiente");
    expect(stock).toContain("Ingreso desde Parque pendiente de autorizar");
    const operations = read("src/pages/MaquinariaOperaciones.tsx");
    expect(operations).toContain('row.estado_disponibilidad !== "EN_PARQUE"');
  });

  it("reviews a credit note followed by a new invoice without duplicating the chassis", () => {
    const sql = read("supabase/migrations/20260923120000_reconcile_machine_credit_notes_and_resales.sql");
    const panel = read("src/components/NotificationsPanel.tsx");
    const dialog = read("src/components/parque/MachineSaleNotificationDialog.tsx");
    expect(sql).toContain("'venta_maquina_reingreso'");
    expect(sql).toContain("'REFACTURACION_PROBABLE'");
    expect(sql).toContain("'original_invoice_number'");
    expect(sql).toContain("p_tipo_confirmacion text DEFAULT 'VENTA'");
    expect(sql).toContain("p_tipo_confirmacion NOT IN ('VENTA', 'REFACTURACION')");
    expect(sql).toContain("SET cliente_id = p_cliente_id");
    expect(sql).toContain("activo = true");
    expect(sql).toContain("'REINGRESO'");
    expect(sql).toContain("'REFACTURACION'");
    expect(sql).toContain("'movimiento_compensado', true");
    expect(sql).toContain("'salida_pendiente_por_factura', true");
    expect(sql).not.toContain("PERFORM public.confirmar_notificacion_alta_maquina");
    expect(panel).toContain('notification?.tipo === "venta_maquina_reingreso"');
    expect(dialog).toContain('confirm("REFACTURACION")');
    expect(dialog).toContain("machineSaleConfirmationClientId(data, form.cliente_id, confirmationType)");
    expect(dialog).toContain("p_cliente_id: confirmationClientId");
    expect(dialog).toContain("Confirmar venta");
  });

  it("carries the invoice seller into future machine-sale confirmations", () => {
    const sql = read("supabase/migrations/20260923160000_copy_machine_sale_seller_to_park.sql");
    const dialog = read("src/components/parque/MachineSaleNotificationDialog.tsx");
    expect(sql).toContain("completar_vendedor_notificacion_venta_maquina");
    expect(sql).toContain("nullif(btrim(f.vendedor), '')");
    expect(sql).toContain("jsonb_build_object('vendedor', v_vendedor)");
    expect(sql).not.toContain("UPDATE public.parque_maquinas");
    expect(dialog).toContain('vendedor: data.vendedor ?? ""');
    expect(dialog).toContain("p_vendedor: form.vendedor || null");
  });

  it("does not suggest a transfer for duplicate rows of the same customer", () => {
    const sql = read("supabase/migrations/20260923140000_suppress_same_customer_machine_transfer_alerts.sql");
    expect(sql).toContain("normalizar_cliente_notificacion");
    expect(sql).toContain("notificacion_venta_mismo_cliente");
    expect(sql).toContain("v_parque_cliente_id = v_facturado_cliente_id");
    expect(sql).toContain("v_parque_ruc_norm = v_facturado_ruc_norm");
    expect(sql).toContain("v_parque_nombre_norm = v_facturado_nombre_norm");
    expect(sql).toContain("suprimir_transferencia_mismo_cliente_trigger");
    expect(sql).toContain("NEW.estado <> 'pendiente'");
    expect(sql).toContain("'resolucion', 'mismo_cliente_canonico'");
    expect(sql).toContain("No confirma ventas");
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
