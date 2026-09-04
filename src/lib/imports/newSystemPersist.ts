// Logica de persistencia del trio OS + Facturacion + Productos del sistema
// nuevo, extraida de ImportarTab.tsx (confirmarNuevoSistemaXml) para que el
// importador unificado (y cualquier otro que aparezca despues) la pueda
// llamar sin duplicarla. El comportamiento es identico al original -- solo
// se parametrizaron los closures sobre estado de React (usuario, nombres
// de archivo) para que sea una funcion pura de I/O, sin UI.

import { supabase } from "@/integrations/supabase/client";
import { cargarTodo } from "@/hooks/useCatalogos";
import {
  NEW_SYSTEM_START,
  aggregateNewSystemServiceOrders,
  isMissingBillingLinesTableError,
  isMissingOsImportTableError,
  matchSucursal,
  matchSucursalFromRegion,
  normCode,
  normText,
  persistCommissionTimeEntries,
  type NewSystemImportBundle,
} from "@/lib/imports";

export interface PersistNewSystemBundleArgs {
  bundle: NewSystemImportBundle;
  userId: string;
  fileNames: {
    facturacion: string | null;
    ordenesServicio: string | null;
    productos: string | null;
  };
}

export interface PersistNewSystemBundleResult {
  facturacionLineas: number;
  ordenesServicio: number;
  facturacionDesde: string | null;
  facturacionHasta: string | null;
  historialRepuestosActualizado: boolean;
  historialRepuestosError: string | null;
}

const missingPartsHistoryRefresh = (error: any) =>
  error?.code === "PGRST202"
  || error?.code === "42883"
  || String(error?.message ?? "").includes("repuestos_actualizar_ventas_periodo");

export async function actualizarVentasRepuestosPeriodo(desde: string | null, hasta: string | null) {
  if (!desde || !hasta) return { actualizado: false, error: null as string | null };

  const { error } = await (supabase.rpc as any)("repuestos_actualizar_ventas_periodo", {
    p_desde: desde,
    p_hasta: hasta,
  });
  if (!error) return { actualizado: true, error: null as string | null };

  const message = missingPartsHistoryRefresh(error)
    ? "Falta aplicar la migración que actualiza las ventas de repuestos después de importar."
    : [error.message, error.details, error.hint].filter(Boolean).join(" | ") || "No se pudo actualizar el historial de repuestos.";
  return { actualizado: false, error: message };
}

export async function persistNewSystemBundle({
  bundle,
  userId,
  fileNames,
}: PersistNewSystemBundleArgs): Promise<PersistNewSystemBundleResult> {
  const cliExistentes = await cargarTodo<any>(supabase.from("clientes").select("*"));

  const cliByCod = new Map<string, string>();
  const cliByNombre = new Map<string, string>();
  const clientCodeKeys = (value: unknown) => {
    const normalized = normCode(value);
    const compact = normalized.replace(/[^a-z0-9]/g, "");
    return normalized === compact ? [normalized] : [normalized, compact];
  };
  const indexClientCode = (value: unknown, id: string) => {
    for (const key of clientCodeKeys(value)) if (key) cliByCod.set(key, id);
  };
  const resolveClientCode = (value: unknown) => {
    for (const key of clientCodeKeys(value)) {
      const id = cliByCod.get(key);
      if (id) return id;
    }
    return undefined;
  };
  for (const c of cliExistentes as any[]) {
    if (c.cod_entidad) indexClientCode(c.cod_entidad, c.id);
    // En el maestro nuevo CLIENTE suele ser el RUC, mientras clientes
    // migrados conservan un cod_entidad legado distinto. Ambos identifican
    // al mismo registro y deben resolver al mismo id.
    if (c.ruc) indexClientCode(c.ruc, c.id);
    if (c.nombre) cliByNombre.set(normText(c.nombre), c.id);
  }

  const factCrosswalkByRowId = new Map(bundle.billingCrosswalk.map((row) => [row.billingRowId, row]));

  const facturacionResumenRows = bundle.facturacion.rows
    .map((row) => {
      const crosswalk = factCrosswalkByRowId.get(row.rowId);
      const fecha = row.emissionDate ?? row.dueDate;
      if (!fecha) return null;

      return {
        fecha,
        sucursal: matchSucursalFromRegion(row.branch) ?? matchSucursal(row.branch),
        tipo: crosswalk?.inferredLineType === "Repuestos" ? "Repuesto" : "Servicio",
        cliente_id:
          (row.clientCode && resolveClientCode(row.clientCode)) ?? cliByNombre.get(normText(row.clientName)) ?? null,
        entidad_nombre: row.clientName,
        cod_entidad: row.clientCode,
        total_venta: Number((row.totalValueWithIva || row.totalValueBase || 0).toFixed(2)),
        cantidad: Number((row.quantity || 0).toFixed(4)),
        grupo: crosswalk?.productGroup ?? row.productGroup,
        grupo_fx: crosswalk?.inferredLineType ?? row.lineType,
        cod_factura: row.invoiceShortNumber ?? row.invoiceLongNumber ?? row.documentNumber ?? `XML-${row.rowId.slice(0, 12)}`,
        moneda: row.currency,
      };
    })
    .filter(Boolean) as any[];

  // La moneda entra en la clave de agrupacion para que una fila de
  // "facturacion" nunca sume lineas en USD y en GS bajo un mismo total --
  // sin esto, agrupar solo por factura/tipo/fecha/etc podria mezclar dos
  // monedas distintas en un mismo total_venta.
  const facturacionResumenByKey = new Map<string, any>();
  for (const row of facturacionResumenRows) {
    const key = [
      row.cod_factura,
      row.tipo,
      row.fecha,
      row.cod_entidad ?? "",
      row.entidad_nombre ?? "",
      row.sucursal ?? "",
      row.grupo ?? "",
      row.grupo_fx ?? "",
      row.moneda ?? "",
    ].join("||");
    const current = facturacionResumenByKey.get(key);
    if (!current) {
      facturacionResumenByKey.set(key, { ...row });
      continue;
    }
    current.total_venta = Number((Number(current.total_venta || 0) + Number(row.total_venta || 0)).toFixed(2));
    current.cantidad = Number((Number(current.cantidad || 0) + Number(row.cantidad || 0)).toFixed(4));
  }
  const facturacionResumen = Array.from(facturacionResumenByKey.values());

  const facturacionLineas = bundle.facturacion.rows.map((row) => {
    const crosswalk = factCrosswalkByRowId.get(row.rowId);
    return {
      origen_sistema: crosswalk?.matchedBy === "none" ? "new_xml_facturacion_directa" : "new_xml_facturacion_os",
      codigo_interno_factura: row.documentNumber ?? row.invoiceLongNumber,
      factura: row.invoiceShortNumber ?? row.invoiceLongNumber,
      entidad_nombre: row.clientName,
      fecha_factura: row.emissionDate,
      sucursal: matchSucursalFromRegion(row.branch) ?? matchSucursal(row.branch),
      subgrupo_original: crosswalk?.productGroup ?? row.productGroup,
      grupo_normalizado: crosswalk?.inferredLineType ?? row.lineType,
      marca_normalizada: (crosswalk?.productBrand as any) ?? "OTROS",
      tipo_facturacion: crosswalk?.inferredLineType === "Repuestos" ? "Repuesto" : "Servicio",
      tipo_tiempo: crosswalk?.inferredTimeType ?? row.timeType,
      observacion: row.productName,
      cod_mercaderia: row.productCode,
      codigo_fabricante: row.manufacturerCode,
      mercaderia: row.productName,
      cantidad: Number((row.quantity || 0).toFixed(4)),
      valor_unitario: Number((row.unitValueWithIva || row.unitValueBase || 0).toFixed(2)),
      total_venta: Number((row.totalValueWithIva || row.totalValueBase || 0).toFixed(2)),
      moneda: row.currency,
      raw_data: {
        ...row.raw,
        linked_service_order: crosswalk?.serviceOrderNumber ?? null,
        canonical_line_type: crosswalk?.inferredLineType ?? row.lineType,
        canonical_time_type: crosswalk?.inferredTimeType ?? row.timeType,
        product_brand: crosswalk?.productBrand ?? null,
        product_group: crosswalk?.productGroup ?? null,
        product_family: crosswalk?.productFamily ?? null,
        import_cutoff_mode: `legacy<=2026-06-30 / new>=${NEW_SYSTEM_START}`,
      },
    };
  });

  const osInvoiceDateByNumber = new Map<string, string>();
  for (const crosswalk of bundle.billingCrosswalk) {
    if (!crosswalk.serviceOrderNumber) continue;
    const billingRow = bundle.facturacion.rows.find((row) => row.rowId === crosswalk.billingRowId);
    const billingDate = billingRow?.emissionDate ?? billingRow?.dueDate ?? null;
    if (!billingDate) continue;
    const current = osInvoiceDateByNumber.get(crosswalk.serviceOrderNumber);
    if (!current || billingDate > current) {
      osInvoiceDateByNumber.set(crosswalk.serviceOrderNumber, billingDate);
    }
  }

  const ordenesServicioPayload = aggregateNewSystemServiceOrders(bundle.ordenesServicioPayload).map((row) => ({
    ...row,
    fecha_emision_factura: row.fecha_emision_factura ?? osInvoiceDateByNumber.get(row.os_numero) ?? null,
  }));

  const { data: factImp, error: factImpError } = await supabase
    .from("importaciones")
    .insert({
      ...bundle.importaciones.facturacion,
      insertados: 0,
      duplicados: 0,
      usuario_id: userId,
      metadata: {
        ...(bundle.importaciones.facturacion.metadata as Record<string, unknown>),
        archivos_relacionados: fileNames,
      } as any,
    } as any)
    .select("id")
    .single();
  if (factImpError) throw factImpError;

  const { data: osImp, error: osImpError } = await supabase
    .from("importaciones")
    .insert({
      ...bundle.importaciones.ordenesServicio,
      insertados: 0,
      duplicados: 0,
      usuario_id: userId,
      metadata: {
        ...(bundle.importaciones.ordenesServicio.metadata as Record<string, unknown>),
        archivos_relacionados: fileNames,
      } as any,
    } as any)
    .select("id")
    .single();
  if (osImpError) throw osImpError;

  const billingWindow = bundle.diagnostics.replacement.facturacion;
  const billingDates = facturacionLineas.map((row) => row.fecha_factura).filter((value): value is string => Boolean(value));
  const facturacionDesde = billingWindow.from ?? (billingDates.length ? [...billingDates].sort()[0] : null);
  const facturacionHasta = billingWindow.to ?? (billingDates.length ? [...billingDates].sort().at(-1)! : null);
  if (billingWindow.shouldReplace && billingWindow.from && billingWindow.to) {
    const { error: deleteFactSummaryError } = await supabase
      .from("facturacion")
      .delete()
      .gte("fecha", billingWindow.from)
      .lte("fecha", billingWindow.to);
    if (deleteFactSummaryError) throw deleteFactSummaryError;

    const { error: deleteFactLinesError } = await (supabase
      .from("facturacion_lineas_importadas" as any)
      .delete()
      .gte("fecha_factura", billingWindow.from)
      .lte("fecha_factura", billingWindow.to) as any);
    if (deleteFactLinesError) throw deleteFactLinesError;
  }

  const osNumeros = Array.from(
    new Set(
      [
        ...ordenesServicioPayload.map((row) => row.os_numero),
        ...bundle.ordenesServicio.rows.map((row) => row.sourceServiceOrderNumber),
      ].filter(Boolean),
    ),
  );
  for (let i = 0; i < osNumeros.length; i += 500) {
    const chunk = osNumeros.slice(i, i + 500);
    const { error: deleteOsByNumberError } = await (supabase
      .from("ordenes_servicio_importadas" as any)
      .delete()
      .in("os_numero", chunk) as any);
    if (deleteOsByNumberError) throw deleteOsByNumberError;
  }

  for (let i = 0; i < facturacionResumen.length; i += 500) {
    const chunk = facturacionResumen.slice(i, i + 500);
    const { error } = await supabase.from("facturacion").upsert(chunk as any, {
      onConflict: "cod_factura,tipo,fecha,cod_entidad,entidad_nombre,sucursal,grupo,grupo_fx,moneda",
    });
    if (error) throw error;
  }

  for (let i = 0; i < facturacionLineas.length; i += 500) {
    const chunk = facturacionLineas.slice(i, i + 500).map((row) => ({
      ...row,
      importacion_id: factImp.id,
    }));
    const { error } = await (supabase.from("facturacion_lineas_importadas" as any).upsert(chunk as any, {
      onConflict: "origen_sistema,linea_hash",
      ignoreDuplicates: true,
    }) as any);
    if (error) {
      if (isMissingBillingLinesTableError(error)) {
        throw new Error("Falta aplicar la migración de facturación detallada antes de importar XML del nuevo sistema.");
      }
      throw error;
    }
  }

  for (let i = 0; i < ordenesServicioPayload.length; i += 500) {
    const chunk = ordenesServicioPayload.slice(i, i + 500);
    const { error } = await (supabase.from("ordenes_servicio_importadas" as any).upsert(chunk as any, {
      onConflict: "os_numero",
    }) as any);
    if (error) {
      if (isMissingOsImportTableError(error)) {
        throw new Error("Falta aplicar la migración de órdenes de servicio antes de importar XML del nuevo sistema.");
      }
      throw error;
    }
  }

  // El mismo XML alimenta el detalle de comisiones sin volver a importar
  // clientes, productos, facturacion ni el resumen de la OS. Hasta que la
  // migracion se aplique, esta extension es opcional y no bloquea el flujo
  // historico del importador.
  await persistCommissionTimeEntries({
    rows: bundle.ordenesServicio.rows,
    importId: osImp.id,
    strict: false,
  });

  const { error: updateFactImpError } = await supabase
    .from("importaciones")
    .update({
      insertados: facturacionLineas.length,
      duplicados: 0,
    } as any)
    .eq("id", factImp.id);
  if (updateFactImpError) throw updateFactImpError;

  const { error: updateOsImpError } = await supabase
    .from("importaciones")
    .update({
      insertados: ordenesServicioPayload.length,
      duplicados: 0,
    } as any)
    .eq("id", osImp.id);
  if (updateOsImpError) throw updateOsImpError;

  const { error: refreshParkError } = await (supabase.rpc as any)("refrescar_parque_ultima_actividad");
  if (refreshParkError) {
    console.error("No se pudo reconciliar la ultima actividad del Parque", refreshParkError);
  }

  const historialRepuestos = await actualizarVentasRepuestosPeriodo(facturacionDesde, facturacionHasta);

  return {
    facturacionLineas: facturacionLineas.length,
    ordenesServicio: ordenesServicioPayload.length,
    facturacionDesde,
    facturacionHasta,
    historialRepuestosActualizado: historialRepuestos.actualizado,
    historialRepuestosError: historialRepuestos.error,
  };
}
