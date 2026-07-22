import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  businessCatalog,
  buildIntentFallbackPlan,
  compileSemanticPlan,
  detectSemanticAmbiguity,
  enumeratePeriodBuckets,
  enforceSemanticIntent,
  getDataCatalog,
  getPlannerCatalog,
  isSemanticFollowUpQuestion,
  semanticIntentHint,
  shouldSortTemporalSeriesChronologically,
  validateGenericPlans,
  type BusinessDataset,
  type GenericQueryPlan,
} from "../_shared/assistant-semantic.ts";
import {
  renderDeterministicAnswer,
  type BusinessQueryResult,
  type ExecutedSemanticQuery,
} from "../_shared/assistant-answer.ts";
import { resolveNamedEntityFilters } from "../_shared/assistant-entities.ts";
import {
  inclusiveOverlapDays,
  referencesAllHistory,
  resolveQuestionDateRange,
  shouldApplyPageContext,
} from "../_shared/assistant-context.ts";
import {
  ASSISTANT_SERVICE_ORDER_SELECT,
  dedupeServiceOrderTechnicianSources,
  normalizeServiceOrderTechnician,
  resolveServiceOrderBranch,
  serviceOrderClientKey,
  serviceOrderTechnicianMatchScore,
  serviceOrderTechniciansMatch,
} from "../_shared/assistant-service-orders.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type JsonRecord = Record<string, unknown>;
type ToolSource = { tool: string; label: string; filters: JsonRecord };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function cleanText(value: unknown, max = 120) {
  return String(value ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max);
}

function cleanContent(value: unknown, max = 12000) {
  return String(value ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, " ").trim().slice(0, max);
}

function safeLimit(value: unknown, fallback = 20, max = 100) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(1, Math.min(max, Math.floor(parsed))) : fallback;
}

function dateFilter(query: any, column: string, args: JsonRecord) {
  let next = query;
  const from = cleanText(args.date_from, 10);
  const to = cleanText(args.date_to, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(from)) next = next.gte(column, from);
  if (/^\d{4}-\d{2}-\d{2}$/.test(to)) next = next.lte(column, to);
  return next;
}

function timestampDateFilter(query: any, column: string, args: JsonRecord) {
  let next = query;
  const from = cleanText(args.date_from, 10);
  const to = cleanText(args.date_to, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(from)) next = next.gte(column, `${from}T00:00:00`);
  if (/^\d{4}-\d{2}-\d{2}$/.test(to)) next = next.lte(column, `${to}T23:59:59.999`);
  return next;
}

function commonFilters(query: any, args: JsonRecord) {
  let next = query;
  const sucursal = cleanText(args.sucursal, 40);
  const marca = cleanText(args.marca, 30);
  if (sucursal && sucursal.toLowerCase() !== "todos") next = next.eq("sucursal", sucursal);
  if (marca && marca.toLowerCase() !== "todos") next = next.eq("marca", marca);
  return next;
}

function countBy(rows: JsonRecord[], key: string) {
  const result: Record<string, number> = {};
  for (const row of rows) {
    const value = cleanText(row[key], 80) || "Sin dato";
    result[value] = (result[value] ?? 0) + 1;
  }
  return result;
}

function sum(rows: JsonRecord[], key: string) {
  return rows.reduce((acc, row) => acc + (Number(row[key]) || 0), 0);
}

async function checked<T = JsonRecord[]>(promise: PromiseLike<{ data: T | null; error: { message: string } | null }>) {
  const { data, error } = await promise;
  if (error) throw new Error(error.message);
  return data ?? ([] as unknown as T);
}

async function fetchPaged(
  build: (from: number, to: number) => PromiseLike<{ data: JsonRecord[] | null; error: { message: string } | null }>,
  maxRows = 20000,
) {
  const pageSize = 1000;
  const rows: JsonRecord[] = [];
  for (let from = 0; from < maxRows; from += pageSize) {
    const page = await checked<JsonRecord[]>(build(from, Math.min(from + pageSize - 1, maxRows - 1)));
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows;
}

async function getOperationalSummary(client: SupabaseClient, args: JsonRecord) {
  let jobsQuery = client
    .from("trabajos")
    .select("id,codigo,os_numero,estado_general,sucursal,marca,cliente_id,creado_en,cerrado_en,descripcion_problema")
    .limit(1000);
  jobsQuery = commonFilters(jobsQuery, args);
  if (args.__include_rows) jobsQuery = dateFilter(jobsQuery, "creado_en", args);

  let jornadasQuery = client
    .from("servicio_jornadas")
    .select("id,servicio_id,fecha,estado,horas_trabajadas,tecnico_responsable_id,auxiliares,servicios(sucursal,marca,cliente_id,trabajo_descripcion)")
    .limit(1000);
  jornadasQuery = dateFilter(jornadasQuery, "fecha", args);

  const [jobs, jornadas] = await Promise.all([
    checked<JsonRecord[]>(jobsQuery),
    checked<JsonRecord[]>(jornadasQuery),
  ]);

  const now = new Date();
  const openJobs = jobs
    .filter((row) => !normalizedKey(row.estado_general).includes("COMPLET"))
    .map((row) => {
      const created = new Date(cleanText(row.creado_en, 40));
      const daysOpen = Number.isNaN(created.getTime()) ? 0 : Math.max(0, Math.floor((now.getTime() - created.getTime()) / 86400000));
      return {
        codigo: cleanText(row.os_numero ?? row.codigo, 80),
        descripcion: cleanText(row.descripcion_problema, 180),
        estado: cleanText(row.estado_general, 60),
        sucursal: cleanText(row.sucursal, 60),
        dias_abierto: daysOpen,
      };
    })
    .sort((a, b) => b.dias_abierto - a.dias_abierto)
    .slice(0, 10);

  return {
    trabajos: { total: jobs.length, por_estado: countBy(jobs, "estado_general"), por_sucursal: countBy(jobs, "sucursal") },
    jornadas: {
      total: jornadas.length,
      por_estado: countBy(jornadas, "estado"),
      horas: sum(jornadas, "horas_trabajadas"),
    },
    abiertos_mas_antiguos: openJobs,
    ...(args.__include_rows ? { _jobs: jobs, _jornadas: jornadas } : {}),
  };
}

async function getPlanningSummary(client: SupabaseClient, args: JsonRecord) {
  let query = client
    .from("servicio_jornadas")
    .select("id,servicio_id,fecha,estado,horas_trabajadas,tecnico_responsable_id,auxiliares,servicios(sucursal,marca,cliente_id,trabajo_descripcion)")
    .eq("estado", "Pendiente")
    .order("fecha")
    .limit(500);
  query = dateFilter(query, "fecha", args);
  const rows = await checked<JsonRecord[]>(query);
  const technicians = new Set<string>();
  for (const row of rows) {
    if (row.tecnico_responsable_id) technicians.add(String(row.tecnico_responsable_id));
    for (const id of (Array.isArray(row.auxiliares) ? row.auxiliares : [])) technicians.add(String(id));
  }
  return { jornadas_planificadas: rows.length, tecnicos_asignados: technicians.size, detalle: rows.slice(0, 30) };
}

async function getCalendarSummary(client: SupabaseClient, args: JsonRecord) {
  let jornadasQuery = client
    .from("servicio_jornadas")
    .select("id,fecha,estado,horas_trabajadas,tecnico_responsable_id,auxiliares,servicios(sucursal,marca,trabajo_descripcion)")
    .order("fecha")
    .limit(500);
  jornadasQuery = dateFilter(jornadasQuery, "fecha", args);
  let unavailableQuery = client
    .from("tecnico_disponibilidad")
    .select("id,tecnico_id,fecha_inicio,fecha_fin,tipo,observacion,bloquea_agenda")
    .order("fecha_inicio")
    .limit(300);
  const from = cleanText(args.date_from, 10);
  const to = cleanText(args.date_to, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(to)) unavailableQuery = unavailableQuery.lte("fecha_inicio", to);
  if (/^\d{4}-\d{2}-\d{2}$/.test(from)) unavailableQuery = unavailableQuery.gte("fecha_fin", from);
  const [jornadas, noDisponibles] = await Promise.all([
    checked<JsonRecord[]>(jornadasQuery),
    checked<JsonRecord[]>(unavailableQuery),
  ]);
  return { jornadas: jornadas.length, por_estado: countBy(jornadas, "estado"), no_disponibilidades: noDisponibles };
}

function canonicalBillingRubro(value: unknown) {
  const normalized = String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
  if (!normalized || normalized === "todos") return "";
  if (normalized.includes("servicio") || normalized.includes("mano de obra")) return "Servicio";
  if (normalized.includes("repuesto") || normalized.includes("pieza")) return "Repuestos";
  if (normalized.includes("kilometr") || normalized === "km") return "Kilometraje";
  if (normalized.includes("otro")) return "Otros";
  return cleanText(value, 60);
}

function normalizedKey(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

function canonicalBillingTimeType(value: unknown) {
  const normalized = normalizedKey(value);
  if (normalized.includes("GARANT")) return "Garantia";
  if (normalized.includes("INTERN") || normalized.includes("ABSOR")) return "Interno";
  if (normalized.includes("CLIENT") || normalized.includes("FACTUR")) return "Cliente";
  return "";
}

const legacyBillingRules: Record<string, { rubro: string; marca: string }> = {
  "SERVICE - CLAAS": { rubro: "Servicio", marca: "CLAAS" },
  "REPUESTOS - CLAAS": { rubro: "Repuestos", marca: "CLAAS" },
  "REPUESTOS CLAAS - PROMOCION": { rubro: "Repuestos", marca: "CLAAS" },
  "REPUESTOS - CABEZALES/PLATAFOR": { rubro: "Repuestos", marca: "CLAAS" },
  "REPUESTOS TRACTOR": { rubro: "Repuestos", marca: "CLAAS" },
  "REPUESTOS DIVERSOS --": { rubro: "Repuestos", marca: "CLAAS" },
  "SERVICE - HORSCH": { rubro: "Servicio", marca: "HORSCH" },
  "REPUESTOS PLANTADORA": { rubro: "Repuestos", marca: "HORSCH" },
  "REPUESTOS PULVERIZADORAS": { rubro: "Repuestos", marca: "HORSCH" },
  "SERVICIOS - OTROS": { rubro: "Servicio", marca: "OTROS" },
  "REPUESTOS - RIEGO": { rubro: "Repuestos", marca: "OTROS" },
  "OTROS PRODUCTOS": { rubro: "Otros", marca: "OTROS" },
  "REPUESTOS USADO": { rubro: "Repuestos", marca: "OTROS" },
  "ACCESORIOS DIVERSOS": { rubro: "Otros", marca: "OTROS" },
  "REPUESTOS - ENROLLADORES": { rubro: "Repuestos", marca: "OTROS" },
  "REPUESTOS - CESTARI": { rubro: "Repuestos", marca: "OTROS" },
};

function billingConcept(tipo: unknown, grupoFx: unknown, grupo: unknown) {
  const normalizedType = normalizedKey(tipo);
  const fx = normalizedKey(grupoFx);
  const combined = `${fx} ${normalizedKey(grupo)}`;
  if (normalizedType === "REPUESTO" || combined.includes("REPUESTO")) return "Repuestos";
  if (fx === "KILOMETRAJE" || combined.includes("KILOMET")) return "Kilometraje";
  if (fx === "SERVICIO" || combined.includes("MANO DE OBRA") || combined.includes("SERVICE") || combined.includes("SERVICIO")) return "Servicio";
  if (normalizedType === "SERVICIO" && !combined.includes("COUR")) return "Servicio";
  return "Otros";
}

function formatUsd(value: unknown) {
  return new Intl.NumberFormat("es-PY", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(Number(value) || 0);
}

function normalizedBillingClient(value: unknown) {
  return cleanText(value, 160)
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\bS\.?A\.?(C\.?I\.?)?\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function getBillingSummary(client: SupabaseClient, args: JsonRecord) {
  const sucursal = cleanText(args.sucursal, 40);
  const sucursales = Array.isArray(args.sucursales)
    ? args.sucursales.map((value) => cleanText(value, 40)).filter(Boolean)
    : [];
  const sucursalKeys = new Set(sucursales.map(normalizedKey));
  const marca = cleanText(args.marca, 30);
  const tipo = canonicalBillingTimeType(args.tipo_tiempo);
  const rubro = canonicalBillingRubro(args.rubro);
  const [importedRows, historicalRows, clientRows, serviceOrdersByOpenDate, serviceOrdersByInvoiceDate] = await Promise.all([
    fetchPaged((from, to) => {
      let query = client
        .from("facturacion_lineas_importadas")
        .select("factura,codigo_interno_factura,fecha_factura,entidad_nombre,sucursal,marca_normalizada,subgrupo_original,grupo_normalizado,tipo_facturacion,tipo_tiempo,total_venta,cantidad,cod_mercaderia,codigo_fabricante,mercaderia,observacion,origen_sistema,raw_data")
        .order("fecha_factura")
        .range(from, to);
      const dateFrom = cleanText(args.date_from, 10);
      const dateTo = cleanText(args.date_to, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateFrom)) query = query.gte("fecha_factura", `${dateFrom}T00:00:00`);
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) query = query.lte("fecha_factura", `${dateTo}T23:59:59.999`);
      return query;
    }, 100000),
    fetchPaged((from, to) => {
      let query = client
        .from("facturacion")
        .select("fecha,sucursal,tipo,cliente_id,entidad_nombre,total_venta,cantidad,grupo,grupo_fx,cod_factura")
        .order("fecha")
        .range(from, to);
      query = dateFilter(query, "fecha", args);
      return query;
    }, 100000),
    fetchPaged((from, to) => client
      .from("clientes")
      .select("id,nombre")
      .order("id")
      .range(from, to), 30000),
    fetchPaged((from, to) => {
      let query = client
        .from("ordenes_servicio_importadas")
        .select("os_numero,tipo_tiempo,servicios_cantidad,fecha_abierta_os,fecha_emision_factura")
        .order("fecha_abierta_os")
        .range(from, to);
      query = dateFilter(query, "fecha_abierta_os", args);
      return query;
    }, 30000),
    fetchPaged((from, to) => {
      let query = client
        .from("ordenes_servicio_importadas")
        .select("os_numero,tipo_tiempo,servicios_cantidad,fecha_abierta_os,fecha_emision_factura")
        .order("fecha_emision_factura")
        .range(from, to);
      query = dateFilter(query, "fecha_emision_factura", args);
      return query;
    }, 30000),
  ]);

  const clientNameById = new Map(
    clientRows
      .map((row) => [cleanText(row.id, 80), cleanText(row.nombre, 160)] as const)
      .filter(([id, name]) => id && name),
  );

  const detailedKeys = new Set<string>();
  const gridCamposYears = new Set<string>();
  for (const row of importedRows) {
    const invoice = cleanText(row.codigo_interno_factura ?? row.factura, 80);
    const date = cleanText(row.fecha_factura, 10);
    if (invoice && date) detailedKeys.add(`${date}||${invoice}`);
    if (row.origen_sistema === "grid_campos" && date) gridCamposYears.add(date.slice(0, 4));
  }

  const imported = importedRows.map((row) => ({
    factura: cleanText(row.codigo_interno_factura ?? row.factura, 80),
    fecha: cleanText(row.fecha_factura, 10),
    entidad_nombre: cleanText(row.entidad_nombre, 160) || "Sin cliente",
    sucursal: cleanText(row.sucursal, 60) || "Sin sucursal",
    marca: normalizedKey(row.marca_normalizada) || "OTROS",
    rubro: billingConcept(row.tipo_facturacion, row.grupo_normalizado, row.subgrupo_original),
    tipo_tiempo: canonicalBillingTimeType(row.tipo_tiempo) || "Cliente",
    codigo_producto: cleanText(row.codigo_fabricante, 120) || cleanText(row.cod_mercaderia, 120) || "Sin codigo",
    concepto: cleanText(row.mercaderia, 240) || cleanText(row.grupo_normalizado, 160) || cleanText(row.subgrupo_original, 160) || "Sin concepto",
    observacion: cleanText(row.observacion, 300) || "Sin observacion",
    total_venta: Number(row.total_venta) || 0,
    cantidad: Number(row.cantidad) || 0,
    raw_data: row.raw_data && typeof row.raw_data === "object" ? row.raw_data as JsonRecord : {},
    origen: "importada",
  }));
  const historical = historicalRows
    .filter((row) => {
      const date = cleanText(row.fecha, 10);
      const invoice = cleanText(row.cod_factura, 80);
      if (date && invoice && detailedKeys.has(`${date}||${invoice}`)) return false;
      const isCampos = normalizedKey(row.entidad_nombre).includes("CAMPOS DEL MANANA");
      return !isCampos || !gridCamposYears.has(date.slice(0, 4));
    })
    .map((row) => {
      const rule = legacyBillingRules[normalizedKey(row.grupo)];
      return {
        factura: cleanText(row.cod_factura, 80),
        fecha: cleanText(row.fecha, 10),
        entidad_nombre: clientNameById.get(cleanText(row.cliente_id, 80)) || cleanText(row.entidad_nombre, 160) || "Sin cliente",
        sucursal: cleanText(row.sucursal, 60) || "Sin sucursal",
        marca: rule?.marca ?? "OTROS",
        rubro: billingConcept(row.tipo, row.grupo_fx, row.grupo),
        tipo_tiempo: "Cliente",
        codigo_producto: "Sin codigo",
        concepto: cleanText(row.grupo_fx, 160) || cleanText(row.grupo, 160) || "Sin concepto",
        observacion: "Sin observacion",
        total_venta: Number(row.total_venta) || 0,
        cantidad: Number(row.cantidad) || 0,
        raw_data: {},
        origen: "historica",
      };
    });
  const rows = [...historical, ...imported].filter((row) => {
    if (sucursalKeys.size > 0 && !sucursalKeys.has(normalizedKey(row.sucursal))) return false;
    if (sucursal && sucursal.toLowerCase() !== "todos" && normalizedKey(row.sucursal) !== normalizedKey(sucursal)) return false;
    if (marca && marca.toLowerCase() !== "todos" && normalizedKey(row.marca) !== normalizedKey(marca)) return false;
    if (tipo && row.tipo_tiempo !== tipo) return false;
    if (rubro && row.rubro !== rubro) return false;
    return true;
  });
  const invoiceKey = (row: JsonRecord) => {
    const invoice = cleanText(row.factura, 80);
    if (!invoice) return "";
    return [row.origen, row.sucursal, row.fecha, invoice].map(normalizedKey).join("|");
  };
  const invoices = new Set(rows.map(invoiceKey).filter(Boolean));
  const clients = new Set(rows.map((row) => normalizedBillingClient(row.entidad_nombre)).filter(Boolean));
  const serviceOrderRows = [...serviceOrdersByOpenDate, ...serviceOrdersByInvoiceDate];
  const serviceOrderHours = new Map<string, number>();
  for (const row of serviceOrderRows) {
    const order = cleanText(row.os_numero, 80);
    if (!order) continue;
    const timeType = canonicalBillingTimeType(row.tipo_tiempo) || "Cliente";
    const hours = Number(row.servicios_cantidad) || 0;
    serviceOrderHours.set(`${normalizedKey(order)}|${normalizedKey(timeType)}`, hours);
    if (!serviceOrderHours.has(normalizedKey(order))) serviceOrderHours.set(normalizedKey(order), hours);
  }
  const serviceHoursByTimeType: Record<string, number> = {};
  const countedServiceOrders = new Set<string>();
  for (const row of rows) {
    if (row.rubro !== "Servicio") continue;
    const timeType = canonicalBillingTimeType(row.tipo_tiempo) || "Cliente";
    const raw = row.raw_data && typeof row.raw_data === "object" ? row.raw_data as JsonRecord : {};
    const linkedOrder = cleanText(raw.linked_service_order, 80);
    const linkedKey = linkedOrder ? `${normalizedKey(linkedOrder)}|${normalizedKey(timeType)}` : "";
    const orderHours = linkedKey
      ? serviceOrderHours.get(linkedKey) ?? serviceOrderHours.get(normalizedKey(linkedOrder)) ?? 0
      : 0;
    if (linkedKey && orderHours > 0) {
      if (countedServiceOrders.has(linkedKey)) continue;
      countedServiceOrders.add(linkedKey);
      serviceHoursByTimeType[timeType] = (serviceHoursByTimeType[timeType] ?? 0) + orderHours;
    } else {
      serviceHoursByTimeType[timeType] = (serviceHoursByTimeType[timeType] ?? 0) + (Number(row.cantidad) || 0);
    }
  }
  const byRubro: Record<string, number> = {};
  const bySucursal = new Map<string, { totalUsd: number; facturas: Set<string> }>();
  const byCliente = new Map<string, { cliente: string; totalUsd: number; facturas: Set<string> }>();
  for (const row of rows) {
    const value = Number(row.total_venta) || 0;
    const group = cleanText(row.rubro, 80) || "Otros";
    const branch = cleanText(row.sucursal, 60) || "Sin sucursal";
    const clientName = cleanText(row.entidad_nombre, 160) || "Sin cliente";
    const clientKey = normalizedBillingClient(clientName);
    byRubro[group] = (byRubro[group] ?? 0) + value;
    const branchEntry = bySucursal.get(branch) ?? { totalUsd: 0, facturas: new Set<string>() };
    branchEntry.totalUsd += value;
    const stableInvoice = invoiceKey(row);
    if (stableInvoice) branchEntry.facturas.add(stableInvoice);
    bySucursal.set(branch, branchEntry);
    const clientEntry = byCliente.get(clientKey) ?? { cliente: clientName, totalUsd: 0, facturas: new Set<string>() };
    clientEntry.totalUsd += value;
    if (stableInvoice) clientEntry.facturas.add(stableInvoice);
    byCliente.set(clientKey, clientEntry);
  }
  const rankingSucursales = [...bySucursal.entries()]
    .map(([sucursalNombre, item]) => ({ sucursal: sucursalNombre, total_usd: item.totalUsd, facturas: item.facturas.size }))
    .sort((a, b) => b.total_usd - a.total_usd);
  const rankingRubros = Object.entries(byRubro)
    .map(([rubroNombre, total]) => ({ rubro: rubroNombre, total_usd: total }))
    .sort((a, b) => b.total_usd - a.total_usd);
  const rankingClientes = [...byCliente.values()]
    .map((item) => ({ cliente: item.cliente, total_usd: item.totalUsd, facturas: item.facturas.size }))
    .sort((a, b) => b.total_usd - a.total_usd)
    .slice(0, 25);
  return {
    total_usd: sum(rows, "total_venta"),
    facturas: invoices.size,
    clientes: clients.size,
    lineas: rows.length,
    rubro_aplicado: rubro || "Todos",
    tipo_tiempo_aplicado: tipo || "Todos",
    fuentes: {
      historica: rows.filter((row) => row.origen === "historica").length,
      importada: rows.filter((row) => row.origen === "importada").length,
    },
    ranking_sucursales: rankingSucursales,
    ranking_rubros: rankingRubros,
    ranking_clientes: rankingClientes,
    horas_servicio: Object.values(serviceHoursByTimeType).reduce((total, hours) => total + Number(hours || 0), 0),
    horas_servicio_por_tipo_tiempo: serviceHoursByTimeType,
    ...(args.__include_rows ? { _rows: rows } : {}),
  };
}

async function getServiceOrdersSummary(client: SupabaseClient, args: JsonRecord) {
  const marca = cleanText(args.marca, 30);
  const tipo = cleanText(args.tipo_tiempo, 40);
  const rawRows = await fetchPaged((from, to) => {
    let query = client
      .from("ordenes_servicio_importadas")
      .select(ASSISTANT_SERVICE_ORDER_SELECT)
      .order("fecha_abierta_os")
      .range(from, to);
    query = dateFilter(query, "fecha_abierta_os", args);
    if (marca && marca.toLowerCase() !== "todos") query = query.ilike("marca", `%${marca}%`);
    if (tipo && tipo.toLowerCase() !== "todos") query = query.ilike("tipo_tiempo", `%${tipo}%`);
    return query;
  }, 30000);
  const [jobs, clients] = await Promise.all([
    fetchPaged((from, to) => client
      .from("trabajos")
      .select("id,sucursal,cliente_id")
      .range(from, to), 10000),
    fetchPaged((from, to) => client
      .from("clientes")
      .select("id,nombre,sucursal")
      .range(from, to), 10000),
  ]);
  const jobsById = new Map(jobs.map((row) => [cleanText(row.id, 80), row]));
  const clientsById = new Map(clients.map((row) => [cleanText(row.id, 80), row]));
  const clientsByName = new Map(clients
    .map((row) => [serviceOrderClientKey(row.nombre), row] as const)
    .filter(([key]) => Boolean(key)));
  const branchContext = { jobsById, clientsById, clientsByName };
  const rows = rawRows.map((row) => ({
    ...row,
    sucursal: resolveServiceOrderBranch(row, branchContext),
  }));
  const orderKey = (row: JsonRecord) => {
    const order = cleanText(row.os_numero, 80);
    const branch = cleanText(row.sucursal, 60) || "Sin sucursal";
    return order ? `${normalizedKey(branch)}|${order}` : "";
  };
  const orders = new Set(rows.map(orderKey).filter(Boolean));
  const technicians = new Map<string, {
    tecnico: string;
    ordenes: Set<string>;
    abiertas: Set<string>;
    cerradas: Set<string>;
    otras: Set<string>;
    horas: number;
    km: number;
    valor_os: number;
  }>();
  const normalizeTechnician = normalizeServiceOrderTechnician;
  const profiles = await checked<JsonRecord[]>(
    client.from("profiles").select("nombre,activo").limit(1000),
  );
  const profileRows = profiles
    .map((profile) => ({
      nombre: cleanText(profile.nombre, 160),
      normalized: normalizeTechnician(profile.nombre),
      activo: profile.activo !== false,
    }))
    .filter((profile) => Boolean(profile.normalized));
  const matchProfile = (source: string) => {
    const ranked = profileRows
      .map((profile) => ({ profile, score: serviceOrderTechnicianMatchScore(source, profile.normalized) }))
      .filter((row) => row.score > 0)
      .sort((a, b) => b.score - a.score || a.profile.nombre.localeCompare(b.profile.nombre));
    const best = ranked[0];
    const second = ranked[1];
    return best && best.score >= 0.72 && (!second || best.score - second.score >= 0.08)
      ? best.profile
      : null;
  };
  const participantEntriesFor = (row: JsonRecord) => {
    const values: unknown[] = [row.responsable];
    const raw = row.raw_data && typeof row.raw_data === "object" ? row.raw_data as JsonRecord : {};
    const explicit = raw.tecnicos_participantes;
    if (Array.isArray(explicit)) values.push(...explicit);
    for (const [key, value] of Object.entries(raw)) {
      const normalizedKey = key.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      if (normalizedKey === "responsable" || /^mec aux [1-6]$/.test(normalizedKey)) values.push(value);
    }
    const entries = new Map<string, { tecnico: string; activo: boolean | null; sources: string[] }>();
    for (const value of dedupeServiceOrderTechnicianSources(values)) {
      const source = cleanText(value, 160);
      const normalized = normalizeTechnician(source);
      if (!normalized) continue;
      const matched = matchProfile(normalized);
      const technician = matched?.normalized ?? normalized;
      const current = entries.get(technician) ?? {
        tecnico: matched?.nombre ?? normalized,
        activo: matched?.activo ?? null,
        sources: [],
      };
      current.sources.push(source);
      entries.set(technician, current);
    }
    return [...entries.values()];
  };
  for (const row of rows) {
    const order = orderKey(row);
    if (!order) continue;
    const status = normalizeTechnician(row.situacion_os);
    const state: "cerradas" | "abiertas" | "otras" = status.includes("CERRAD")
      ? "cerradas"
      : status.includes("ANUL") || status.includes("CANCEL")
        ? "otras"
        : "abiertas";
    const raw = row.raw_data && typeof row.raw_data === "object" ? row.raw_data as JsonRecord : {};
    const totalsByTechnician = raw.totales_por_tecnico && typeof raw.totales_por_tecnico === "object"
      ? raw.totales_por_tecnico as Record<string, JsonRecord>
      : {};
    const hasParticipantTotals = Object.keys(totalsByTechnician).length > 0;
    for (const participant of participantEntriesFor(row)) {
      const entryKey = normalizeTechnician(participant.tecnico);
      const participantTotals = participant.sources.reduce((totals, sourceName) => {
        const sourceTotals = totalsByTechnician[sourceName] ?? {};
        totals.horas += Number(sourceTotals.horas || 0);
        totals.km += Number(sourceTotals.kilometros || 0);
        totals.valor += Number(sourceTotals.valor_servicio || 0) + Number(sourceTotals.valor_repuestos || 0) +
          Number(sourceTotals.valor_kilometraje || 0) + Number(sourceTotals.valor_terceros || 0);
        return totals;
      }, { horas: 0, km: 0, valor: 0 });
      const entry = technicians.get(entryKey) ?? {
        tecnico: participant.tecnico,
        ordenes: new Set<string>(),
        abiertas: new Set<string>(),
        cerradas: new Set<string>(),
        otras: new Set<string>(),
        horas: 0,
        km: 0,
        valor_os: 0,
      };
      entry.ordenes.add(order);
      entry[state].add(order);
      entry.horas += hasParticipantTotals ? participantTotals.horas : Number(row.servicios_cantidad || 0);
      entry.km += hasParticipantTotals ? participantTotals.km : Number(row.km_cantidad || 0);
      entry.valor_os += hasParticipantTotals
        ? participantTotals.valor
        : Number(row.servicios_valor || 0) + Number(row.repuesto_valor || 0) +
          Number(row.kilometro_valor || 0) + Number(row.terceros_valor || 0);
      technicians.set(entryKey, entry);
    }
  }
  const requestedActivity = normalizedKey(args.activo);
  const orderTechniciansBy = normalizedKey(args.order_by);
  const rankingTechnicians = [...technicians.values()]
    .map((row) => ({
      tecnico: row.tecnico,
      ordenes: row.ordenes.size,
      abiertas: row.abiertas.size,
      cerradas: row.cerradas.size,
      otras: row.otras.size,
      horas: row.horas,
      km: row.km,
      valor_os: row.valor_os,
      activo: matchProfile(normalizeTechnician(row.tecnico))?.activo ?? null,
    }))
    .filter((row) => requestedActivity === "INACTIVO"
      ? row.activo === false
      : requestedActivity === "ACTIVO"
        ? row.activo === true
        : true)
    .sort((a, b) => orderTechniciansBy === "HORAS"
      ? b.horas - a.horas || b.ordenes - a.ordenes || a.tecnico.localeCompare(b.tecnico)
      : orderTechniciansBy === "ORDENES"
        ? b.ordenes - a.ordenes || b.cerradas - a.cerradas || a.tecnico.localeCompare(b.tecnico)
        : b.abiertas - a.abiertas || b.ordenes - a.ordenes || a.tecnico.localeCompare(b.tecnico))
    .slice(0, 50);
  const closedByTimeType = new Map<string, Set<string>>();
  for (const row of rows) {
    const order = orderKey(row);
    if (!order || !normalizeTechnician(row.situacion_os).includes("CERRAD")) continue;
    const timeType = canonicalBillingTimeType(row.tipo_tiempo) || "Sin tipo";
    const keys = closedByTimeType.get(timeType) ?? new Set<string>();
    keys.add(`${order}|${normalizedKey(timeType)}`);
    closedByTimeType.set(timeType, keys);
  }
  const participantRows = rows.flatMap((row) => {
    const participants = participantEntriesFor(row);
    if (!participants.length) {
      return [{
        ...row,
        participante: "Sin tecnico",
        participante_activo: null,
        participante_horas: Number(row.servicios_cantidad || 0),
        participante_km: Number(row.km_cantidad || 0),
        participante_valor_os: Number(row.servicios_valor || 0) + Number(row.repuesto_valor || 0) +
          Number(row.kilometro_valor || 0) + Number(row.terceros_valor || 0),
      }];
    }
    const raw = row.raw_data && typeof row.raw_data === "object" ? row.raw_data as JsonRecord : {};
    const totalsByTechnician = raw.totales_por_tecnico && typeof raw.totales_por_tecnico === "object"
      ? raw.totales_por_tecnico as Record<string, JsonRecord>
      : {};
    const hasParticipantTotals = Object.keys(totalsByTechnician).length > 0;
    return participants.map((participant) => {
      const totals = participant.sources.reduce((result, sourceName) => {
        const sourceTotals = totalsByTechnician[sourceName] ?? {};
        result.horas += Number(sourceTotals.horas || 0);
        result.km += Number(sourceTotals.kilometros || 0);
        result.valor += Number(sourceTotals.valor_servicio || 0) + Number(sourceTotals.valor_repuestos || 0) +
          Number(sourceTotals.valor_kilometraje || 0) + Number(sourceTotals.valor_terceros || 0);
        return result;
      }, { horas: 0, km: 0, valor: 0 });
      return {
        ...row,
        participante: participant.tecnico,
        participante_activo: participant.activo,
        participante_horas: hasParticipantTotals ? totals.horas : Number(row.servicios_cantidad || 0),
        participante_km: hasParticipantTotals ? totals.km : Number(row.km_cantidad || 0),
        participante_valor_os: hasParticipantTotals
          ? totals.valor
          : Number(row.servicios_valor || 0) + Number(row.repuesto_valor || 0) +
            Number(row.kilometro_valor || 0) + Number(row.terceros_valor || 0),
      };
    });
  });
  return {
    ordenes: orders.size,
    filas: rows.length,
    por_estado: countBy(rows, "situacion_os"),
    por_tipo_tiempo: countBy(rows, "tipo_tiempo"),
    cerradas_por_tipo_tiempo: Object.fromEntries(
      [...closedByTimeType.entries()].map(([timeType, keys]) => [timeType, keys.size]),
    ),
    ranking_tecnicos: rankingTechnicians,
    tecnico_mas_os_abiertas: rankingTechnicians[0] ?? null,
    horas: sum(rows, "servicios_cantidad"),
    km: sum(rows, "km_cantidad"),
    valores_usd: {
      servicio: sum(rows, "servicios_valor"),
      kilometraje: sum(rows, "kilometro_valor"),
      repuestos: sum(rows, "repuesto_valor"),
      terceros: sum(rows, "terceros_valor"),
    },
    ...(args.__include_rows ? { _rows: rows, _participant_rows: participantRows } : {}),
  };
}

async function getParkSummary(client: SupabaseClient, args: JsonRecord) {
  let query = client
    .from("parque_maquinas")
    .select("id,cliente_id,marca,subgrupo,sucursal,modelo_tipo,serie,anio,activo,clientes(nombre)")
    .eq("activo", true)
    .limit(1000);
  query = commonFilters(query, args);
  const rows = await checked<JsonRecord[]>(query);
  const clients = new Set(rows.map((row) => cleanText(row.cliente_id, 80)).filter(Boolean));
  return { maquinas_activas: rows.length, clientes: clients.size, por_marca: countBy(rows, "marca"), por_sucursal: countBy(rows, "sucursal"), por_subgrupo: countBy(rows, "subgrupo"), ...(args.__include_rows ? { _rows: rows } : {}) };
}

async function getCommercialFollowup(client: SupabaseClient, args: JsonRecord) {
  let query = client
    .from("seguimiento_comercial")
    .select("id,cliente_id,fecha,resultado,observaciones,clientes(nombre,sucursal)")
    .order("fecha", { ascending: false })
    .limit(500);
  query = dateFilter(query, "fecha", args);
  const rows = await checked<JsonRecord[]>(query);
  const clients = new Set(rows.map((row) => cleanText(row.cliente_id, 80)).filter(Boolean));
  return { gestiones: rows.length, clientes_unicos: clients.size, por_resultado: countBy(rows, "resultado"), recientes: rows.slice(0, 30), ...(args.__include_rows ? { _rows: rows } : {}) };
}

async function getTechnicianSummary(client: SupabaseClient, args: JsonRecord) {
  let profilesQuery = client.from("profiles").select("id,nombre,sucursal,activo").order("nombre").limit(500);
  const sucursal = cleanText(args.sucursal, 40);
  if (sucursal && sucursal.toLowerCase() !== "todos") profilesQuery = profilesQuery.eq("sucursal", sucursal);
  const [profiles, roles, services] = await Promise.all([
    checked<JsonRecord[]>(profilesQuery),
    checked<JsonRecord[]>(client.from("user_roles").select("user_id,role").limit(1000)),
    fetchPaged((from, to) => client.from("servicios").select("id,tecnico_responsable_id,auxiliares").range(from, to), 10000),
  ]);
  const technicianRoleIds = new Set(roles.filter((row) => row.role === "tecnico").map((row) => String(row.user_id)));
  const administrativeIds = new Set(roles.filter((row) => row.role === "admin" || row.role === "cabecilla").map((row) => String(row.user_id)));
  const referencedIds = new Set<string>();
  const serviceById = new Map<string, JsonRecord>();
  for (const service of services) {
    serviceById.set(String(service.id), service);
    if (service.tecnico_responsable_id) referencedIds.add(String(service.tecnico_responsable_id));
    for (const id of (Array.isArray(service.auxiliares) ? service.auxiliares : [])) referencedIds.add(String(id));
  }
  const jornadas = await fetchPaged((from, to) => {
    let query = client.from("servicio_jornadas")
      .select("servicio_id,fecha,estado,horas_trabajadas,tecnico_responsable_id,auxiliares")
      .order("fecha").range(from, to);
    query = dateFilter(query, "fecha", args);
    return query;
  }, 30000);
  for (const row of jornadas) {
    if (row.tecnico_responsable_id) referencedIds.add(String(row.tecnico_responsable_id));
    for (const id of (Array.isArray(row.auxiliares) ? row.auxiliares : [])) referencedIds.add(String(id));
  }
  const activeFilter = normalizedKey(args.activo);
  const includeInactive = activeFilter === "INACTIVO" || activeFilter === "INACTIVOS" || activeFilter === "FALSE";
  const includeAll = activeFilter === "TODOS" || activeFilter === "ALL";
  const technicians = profiles.filter((row) => {
    const id = String(row.id);
    const name = normalizedKey(row.nombre);
    const administrativeOnly = administrativeIds.has(id) && !technicianRoleIds.has(id) && !referencedIds.has(id);
    const matchesActivityStatus = includeAll ? true : includeInactive ? row.activo === false : row.activo !== false;
    return matchesActivityStatus && !name.includes("PASANTE") && !administrativeOnly;
  });
  const validIds = new Set(technicians.map((row) => String(row.id)));
  const activity: Record<string, { jornadas: number; horas: number; pendientes: number; realizadas: number; no_realizadas: number }> = {};
  for (const row of jornadas) {
    const service = serviceById.get(String(row.servicio_id)) ?? {};
    const principal = row.tecnico_responsable_id ?? service.tecnico_responsable_id;
    const ownAuxiliaries = Array.isArray(row.auxiliares) ? row.auxiliares : [];
    const inheritedAuxiliaries = Array.isArray(service.auxiliares) ? service.auxiliares : [];
    const crew = [principal, ...(ownAuxiliaries.length ? ownAuxiliaries : inheritedAuxiliaries)].filter(Boolean).map(String);
    for (const id of new Set(crew)) {
      if (!validIds.has(id)) continue;
      activity[id] ??= { jornadas: 0, horas: 0, pendientes: 0, realizadas: 0, no_realizadas: 0 };
      activity[id].jornadas += 1;
      activity[id].horas += Number(row.horas_trabajadas) || 0;
      const status = normalizedKey(row.estado);
      if (status === "COMPLETADO") activity[id].realizadas += 1;
      else if (status === "CANCELADA") activity[id].no_realizadas += 1;
      else activity[id].pendientes += 1;
    }
  }
  const requestedMetrics = Array.isArray(args.metrics) ? args.metrics.map((metric) => normalizedKey(metric)) : [];
  const sortByHours = requestedMetrics.includes("HORAS") || normalizedKey(args.order_by) === "HORAS";
  const detail = technicians
    .map((row) => ({ ...row, ...(activity[String(row.id)] ?? { jornadas: 0, horas: 0, pendientes: 0, realizadas: 0, no_realizadas: 0 }) }))
    .sort((a, b) => Number(sortByHours ? b.horas : b.jornadas) - Number(sortByHours ? a.horas : a.jornadas)
      || Number(b.jornadas) - Number(a.jornadas)
      || cleanText(a.nombre, 160).localeCompare(cleanText(b.nombre, 160)));
  return {
    tecnicos_total: technicians.length,
    tecnicos_activos: technicians.filter((row) => row.activo !== false).length,
    tecnicos_inactivos: technicians.filter((row) => row.activo === false).length,
    con_actividad: detail.filter((row) => Number(row.jornadas) > 0).length,
    sin_actividad: detail.filter((row) => Number(row.jornadas) === 0).length,
    con_carga_detalle: detail.filter((row) => Number(row.jornadas) > 0).slice(0, 100),
    sin_carga_detalle: detail.filter((row) => Number(row.jornadas) === 0).slice(0, 100),
    detalle: detail.slice(0, 100),
  };
}

async function getMachinesByChassisPrefix(client: SupabaseClient, prefix: string) {
  const safePrefix = cleanText(prefix, 40).replace(/[^a-zA-Z0-9-]/g, "");
  if (safePrefix.length < 2) return [];

  return await checked<JsonRecord[]>(
    client
      .from("parque_maquinas")
      .select("id,serie,marca,modelo_tipo,anio,sucursal,activo,cliente_id,clientes(nombre)")
      .ilike("serie", `${safePrefix}%`)
      .order("serie")
      .limit(100),
  );
}

async function searchEntities(client: SupabaseClient, args: JsonRecord) {
  const term = cleanText(args.query, 80).replace(/[%_,()]/g, " ");
  if (term.length < 2) return { error: "La busqueda requiere al menos 2 caracteres" };
  const limit = safeLimit(args.limit, 5, 10);
  const pattern = `%${term}%`;
  const [clients, jobs, technicians, machines, orders] = await Promise.all([
    checked<JsonRecord[]>(client.from("clientes").select("id,nombre,sucursal,cod_entidad").ilike("nombre", pattern).limit(limit)),
    checked<JsonRecord[]>(client.from("trabajos").select("id,codigo,os_numero,descripcion_problema,estado_general,sucursal").or(`codigo.ilike.${pattern},os_numero.ilike.${pattern},descripcion_problema.ilike.${pattern}`).limit(limit)),
    checked<JsonRecord[]>(client.from("profiles").select("id,nombre,sucursal,activo").ilike("nombre", pattern).limit(limit)),
    checked<JsonRecord[]>(client.from("parque_maquinas").select("id,serie,marca,modelo_tipo,sucursal,cliente_id").or(`serie.ilike.${pattern},modelo_tipo.ilike.${pattern}`).limit(limit)),
    checked<JsonRecord[]>(client.from("ordenes_servicio_importadas").select("os_numero,cliente_nombre,situacion_os,tipo_tiempo").or(`os_numero.ilike.${pattern},cliente_nombre.ilike.${pattern}`).limit(limit)),
  ]);
  return { clientes: clients, trabajos: jobs, tecnicos: technicians, maquinas: machines, ordenes_servicio: orders };
}

async function getEntityDetail(client: SupabaseClient, args: JsonRecord) {
  const type = cleanText(args.entity_type, 30).toLowerCase();
  const id = cleanText(args.id, 100);
  if (!id) return { error: "Falta el identificador" };
  if (type === "cliente") {
    const clientRow = await checked<JsonRecord | null>(client.from("clientes").select("id,nombre,sucursal,cod_entidad,localidad,region,activo").eq("id", id).maybeSingle());
    const [jobs, machines, followups] = await Promise.all([
      checked<JsonRecord[]>(client.from("trabajos").select("id,codigo,os_numero,estado_general,descripcion_problema,sucursal,creado_en,cerrado_en").eq("cliente_id", id).order("creado_en", { ascending: false }).limit(30)),
      checked<JsonRecord[]>(client.from("parque_maquinas").select("id,serie,marca,modelo_tipo,anio,sucursal,activo").eq("cliente_id", id).limit(50)),
      checked<JsonRecord[]>(client.from("seguimiento_comercial").select("fecha,resultado,observaciones").eq("cliente_id", id).order("fecha", { ascending: false }).limit(20)),
    ]);
    return { cliente: clientRow, trabajos: jobs, maquinas: machines, seguimientos: followups };
  }
  if (type === "trabajo") return await checked(client.from("trabajos").select("*").eq("id", id).maybeSingle());
  if (type === "tecnico") return await checked(client.from("profiles").select("id,nombre,sucursal,activo").eq("id", id).maybeSingle());
  if (type === "maquina") return await checked(client.from("parque_maquinas").select("*").eq("id", id).maybeSingle());
  if (type === "os") return await checked(client.from("ordenes_servicio_importadas").select("os_numero,cliente_nombre,fecha_abierta_os,fecha_emision_factura,factura,responsable,marca,problema,tipo_tiempo,servicios_cantidad,servicios_valor,km_cantidad,kilometro_valor,repuesto_valor,terceros_valor,situacion_os,situacion_facturacion,trabajo_id").eq("os_numero", id).limit(100));
  return { error: "Tipo de entidad no permitido" };
}

function semanticDate(row: JsonRecord, dataset: BusinessDataset) {
  const value = dataset === "facturacion" ? row.fecha
    : dataset === "ordenes_servicio" ? row.fecha_abierta_os
      : dataset === "trabajos" ? row.creado_en
        : dataset === "jornadas" ? row.fecha
          : dataset === "disponibilidades" ? row.fecha_inicio
            : dataset === "agenda" ? row.fecha
              : dataset === "contactos" ? row.creado_en
                : dataset === "historial_trabajos" ? row.creado_en
                  : dataset === "importaciones" ? row.creado_en
                    : dataset === "dias_no_laborales" ? row.fecha
                      : "";
  return cleanText(value, 10);
}

function periodBucket(value: string, granularity: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "Sin fecha";
  if (granularity === "day") return value;
  if (granularity === "year") return value.slice(0, 4);
  if (granularity === "week") {
    const date = new Date(`${value}T12:00:00Z`);
    const monday = new Date(date);
    monday.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
    return monday.toISOString().slice(0, 10);
  }
  return value.slice(0, 7);
}

function semanticDimension(row: JsonRecord, dataset: BusinessDataset, dimension: string, granularity: string) {
  const clientRelation = row.clientes && typeof row.clientes === "object" && !Array.isArray(row.clientes) ? row.clientes as JsonRecord : {};
  const serviceRelation = row.servicios && typeof row.servicios === "object" && !Array.isArray(row.servicios) ? row.servicios as JsonRecord : {};
  const mappings: Record<BusinessDataset, Record<string, unknown>> = {
    facturacion: {
      fecha: row.fecha, sucursal: row.sucursal, cliente: row.entidad_nombre, marca: row.marca,
      rubro: row.rubro, tipo_tiempo: row.tipo_tiempo, factura: row.factura,
      codigo_producto: row.codigo_producto, concepto: row.concepto, observacion: row.observacion, origen: row.origen,
    },
    ordenes_servicio: {
      fecha: row.fecha_abierta_os, sucursal: row.sucursal, cliente: row.cliente_nombre, marca: row.marca,
      tipo_tiempo: canonicalBillingTimeType(row.tipo_tiempo) || "Sin tipo", estado: row.situacion_os,
      factura: row.factura, os: row.os_numero, problema: row.problema, tecnico: row.participante ?? row.responsable,
      activo: row.participante_activo === false ? "Inactivo" : row.participante_activo === true ? "Activo" : "Sin asociar",
    },
    trabajos: {
      fecha: cleanText(row.creado_en, 10), sucursal: row.sucursal, marca: row.marca, estado: row.estado_general,
      trabajo: row.os_numero ?? row.codigo, cliente: row.cliente_nombre ?? row.cliente_id,
    },
    jornadas: { fecha: row.fecha, estado: row.estado, tecnico: row.tecnico_responsable_id, trabajo: row.servicio_id, sucursal: serviceRelation.sucursal, cliente: row.cliente_nombre ?? serviceRelation.cliente_id, marca: serviceRelation.marca },
    tecnicos: { sucursal: row.sucursal, tecnico: row.nombre, carga: Number(row.jornadas) > 0 ? "Con carga" : "Sin carga", activo: row.activo === false ? "Inactivo" : "Activo" },
    disponibilidades: {
      fecha: row.fecha_inicio,
      tecnico: row.tecnico_nombre ?? row.tecnico_id,
      sucursal: row.tecnico_sucursal,
      tipo: row.tipo,
      motivo: row.observacion,
      bloquea_agenda: row.bloquea_agenda === false ? "No" : "Si",
    },
    parque: { sucursal: row.sucursal, cliente: clientRelation.nombre ?? row.cliente_id, marca: row.marca, subgrupo: row.subgrupo, modelo: row.modelo_tipo, serie: row.serie, anio: row.anio },
    agenda: { fecha: row.fecha, sucursal: clientRelation.sucursal, cliente: clientRelation.nombre ?? row.cliente_id, resultado: row.resultado },
    contactos: {
      fecha: row.creado_en,
      sucursal: row.cliente_sucursal,
      cliente: row.cliente_nombre ?? row.cliente_id,
      contacto: row.nombre,
      cargo: row.cargo,
      telefono: row.telefono,
      correo: row.correo,
      canal: [
        row.es_whatsapp === true ? "WhatsApp" : "",
        cleanText(row.telefono, 80) ? "Telefono" : "",
        cleanText(row.correo, 160) ? "Correo" : "",
      ].filter(Boolean).join(" + ") || "Sin canal",
      principal: row.es_principal === true ? "Si" : "No",
      activo: row.activo === false ? "Inactivo" : "Activo",
    },
    historial_trabajos: {
      fecha: row.creado_en,
      evento: row.tipo_evento,
      trabajo: row.trabajo_referencia ?? row.trabajo_id,
      cliente: row.cliente_nombre,
      sucursal: row.trabajo_sucursal,
      usuario: row.usuario_nombre ?? row.usuario_id,
    },
    importaciones: {
      fecha: row.creado_en,
      tipo: row.tipo,
      archivo: row.archivo_nombre,
      origen: row.origen_sistema,
      usuario: row.usuario_nombre ?? row.usuario_id,
    },
    dias_no_laborales: { fecha: row.fecha, motivo: row.motivo },
  };
  if (dimension === "periodo") return periodBucket(semanticDate(row, dataset), granularity);
  return cleanText(mappings[dataset][dimension], 180) || "Sin dato";
}

function distinctCount(rows: JsonRecord[], key: (row: JsonRecord) => string) {
  return new Set(rows.map(key).filter(Boolean)).size;
}

function semanticMetric(rows: JsonRecord[], dataset: BusinessDataset, metric: string) {
  if (metric === "tecnicos" && dataset === "disponibilidades") {
    return distinctCount(rows, (row) => cleanText(row.tecnico_id, 100));
  }
  if (["lineas", "gestiones", "maquinas", "jornadas", "tecnicos", "registros", "contactos", "eventos", "importaciones"].includes(metric)) return rows.length;
  if (metric === "dias") return dataset === "disponibilidades" ? sum(rows, "dias_periodo") : rows.length;
  if (metric === "clientes") return distinctCount(rows, (row) => normalizedBillingClient(
    dataset === "facturacion" ? row.entidad_nombre
      : dataset === "ordenes_servicio" ? row.cliente_nombre
        : dataset === "contactos" ? row.cliente_id
          : row.cliente_id,
  ));
  if (metric === "facturas") return distinctCount(rows, (row) => {
    const invoice = cleanText(row.factura, 100);
    if (!invoice) return "";
    return dataset === "facturacion"
      ? [row.origen, row.sucursal, row.fecha, invoice].map(normalizedKey).join("|")
      : invoice;
  });
  if (metric === "ordenes") return distinctCount(rows, (row) => {
    const order = cleanText(row.os_numero, 80);
    return order ? `${normalizedKey(row.sucursal)}|${order}|${canonicalBillingTimeType(row.tipo_tiempo) || "SIN TIPO"}` : "";
  });
  if (metric === "trabajos") return distinctCount(rows, (row) => cleanText(
    dataset === "historial_trabajos" ? row.trabajo_id : row.id,
    100,
  ));
  if (metric === "usuarios") return distinctCount(rows, (row) => cleanText(row.usuario_id, 100));
  if (metric === "filas") return sum(rows, "total_filas");
  if (metric === "insertados") return sum(rows, "insertados");
  if (metric === "duplicados") return sum(rows, "duplicados");
  if (metric === "horas") return sum(rows, dataset === "ordenes_servicio"
    ? (rows.some((row) => row.participante_horas !== undefined) ? "participante_horas" : "servicios_cantidad")
    : dataset === "facturacion" ? "cantidad" : dataset === "tecnicos" ? "horas" : "horas_trabajadas");
  if (metric === "km") return sum(rows, dataset === "ordenes_servicio" && rows.some((row) => row.participante_km !== undefined)
    ? "participante_km"
    : dataset === "facturacion" ? "cantidad" : "km_cantidad");
  if (metric === "cantidad") return sum(rows, "cantidad");
  if (metric === "servicio_usd") return sum(rows, "servicios_valor");
  if (metric === "kilometraje_usd") return sum(rows, "kilometro_valor");
  if (metric === "repuestos_usd") return sum(rows, "repuesto_valor");
  if (metric === "terceros_usd") return sum(rows, "terceros_valor");
  if (metric === "total_usd") {
    return dataset === "facturacion" ? sum(rows, "total_venta")
      : dataset === "ordenes_servicio" && rows.some((row) => row.participante_valor_os !== undefined)
        ? sum(rows, "participante_valor_os")
      : rows.reduce((total, row) => total + (Number(row.servicios_valor) || 0) + (Number(row.kilometro_valor) || 0) + (Number(row.repuesto_valor) || 0) + (Number(row.terceros_valor) || 0), 0);
  }
  if (metric === "ticket_promedio") {
    const invoices = distinctCount(rows, (row) => {
      const invoice = cleanText(row.factura, 100);
      return invoice
        ? [row.origen, row.sucursal, row.fecha, invoice].map(normalizedKey).join("|")
        : "";
    });
    return invoices ? sum(rows, "total_venta") / invoices : 0;
  }
  return 0;
}

async function loadBusinessRows(client: SupabaseClient, dataset: BusinessDataset, filters: JsonRecord, dimensions: string[]) {
  const args = { ...filters, __include_rows: true };
  if (dataset === "facturacion") return ((await getBillingSummary(client, args) as JsonRecord)._rows ?? []) as JsonRecord[];
  if (dataset === "ordenes_servicio") {
    const result = await getServiceOrdersSummary(client, args) as JsonRecord;
    return ((dimensions.includes("tecnico") || dimensions.includes("activo") || filters.tecnico || filters.activo
      ? result._participant_rows
      : result._rows) ?? []) as JsonRecord[];
  }
  if (dataset === "trabajos") {
    const [rows, clients] = await Promise.all([
      fetchPaged((from, to) => {
        let query = client.from("trabajos")
          .select("id,codigo,os_numero,estado_general,sucursal,marca,cliente_id,creado_en,cerrado_en,descripcion_problema")
          .order("creado_en").range(from, to);
        query = commonFilters(query, filters);
        query = dateFilter(query, "creado_en", filters);
        return query;
      }, 20000),
      fetchPaged((from, to) => client.from("clientes").select("id,nombre").order("id").range(from, to), 30000),
    ]);
    const names = new Map(clients.map((row) => [cleanText(row.id, 80), cleanText(row.nombre, 160)]));
    return rows.map((row) => ({ ...row, cliente_nombre: names.get(cleanText(row.cliente_id, 80)) || "Sin cliente" }));
  }
  if (dataset === "jornadas") {
    const [rows, clients] = await Promise.all([
      fetchPaged((from, to) => {
        let query = client.from("servicio_jornadas")
          .select("id,servicio_id,fecha,estado,horas_trabajadas,tecnico_responsable_id,auxiliares,servicios(sucursal,marca,cliente_id,trabajo_descripcion)")
          .order("fecha").range(from, to);
        query = dateFilter(query, "fecha", filters);
        return query;
      }, 30000),
      fetchPaged((from, to) => client.from("clientes").select("id,nombre").order("id").range(from, to), 30000),
    ]);
    const names = new Map(clients.map((row) => [cleanText(row.id, 80), cleanText(row.nombre, 160)]));
    return rows.map((row) => {
      const service = row.servicios && typeof row.servicios === "object" && !Array.isArray(row.servicios)
        ? row.servicios as JsonRecord
        : {};
      return { ...row, cliente_nombre: names.get(cleanText(service.cliente_id, 80)) || "Sin cliente" };
    });
  }
  if (dataset === "tecnicos") return ((await getTechnicianSummary(client, args) as JsonRecord).detalle ?? []) as JsonRecord[];
  if (dataset === "disponibilidades") {
    const from = cleanText(filters.date_from, 10);
    const to = cleanText(filters.date_to, 10);
    const [rows, profiles] = await Promise.all([
      fetchPaged((rangeFrom, rangeTo) => {
        let query = client.from("tecnico_disponibilidad")
          .select("id,tecnico_id,fecha_inicio,fecha_fin,tipo,observacion,bloquea_agenda")
          .order("fecha_inicio").range(rangeFrom, rangeTo);
        if (/^\d{4}-\d{2}-\d{2}$/.test(to)) query = query.lte("fecha_inicio", to);
        if (/^\d{4}-\d{2}-\d{2}$/.test(from)) query = query.gte("fecha_fin", from);
        return query;
      }, 10000),
      fetchPaged((rangeFrom, rangeTo) => client.from("profiles")
        .select("id,nombre,sucursal,activo").order("id").range(rangeFrom, rangeTo), 5000),
    ]);
    const profileById = new Map(profiles.map((profile) => [cleanText(profile.id, 100), profile]));
    return rows.map((row) => {
      const profile = profileById.get(cleanText(row.tecnico_id, 100)) ?? {};
      return {
        ...row,
        tecnico_nombre: profile.nombre,
        tecnico_sucursal: profile.sucursal,
        tecnico_activo: profile.activo,
        dias_periodo: inclusiveOverlapDays(row.fecha_inicio, row.fecha_fin, from, to),
      };
    });
  }
  if (dataset === "parque") return ((await getParkSummary(client, args) as JsonRecord)._rows ?? []) as JsonRecord[];
  if (dataset === "agenda") return ((await getCommercialFollowup(client, args) as JsonRecord)._rows ?? []) as JsonRecord[];
  if (dataset === "contactos") {
    const [rows, clients] = await Promise.all([
      fetchPaged((from, to) => {
        let query = client.from("contactos_cliente")
          .select("id,cliente_id,nombre,cargo,telefono,correo,es_principal,es_whatsapp,notas,activo,creado_en,actualizado_en")
          .order("creado_en").range(from, to);
        query = timestampDateFilter(query, "creado_en", filters);
        return query;
      }, 30000),
      fetchPaged((from, to) => client.from("clientes")
        .select("id,nombre,sucursal,cod_entidad").order("id").range(from, to), 30000),
    ]);
    const clientById = new Map(clients.map((row) => [cleanText(row.id, 100), row]));
    return rows.map((row) => {
      const customer = clientById.get(cleanText(row.cliente_id, 100)) ?? {};
      return {
        ...row,
        cliente_nombre: customer.nombre,
        cliente_sucursal: customer.sucursal,
        cliente_codigo: customer.cod_entidad,
      };
    });
  }
  if (dataset === "historial_trabajos") {
    const [rows, jobs, clients, profiles] = await Promise.all([
      fetchPaged((from, to) => {
        let query = client.from("trabajo_historial")
          .select("id,trabajo_id,usuario_id,tipo_evento,payload,creado_en")
          .order("creado_en").range(from, to);
        query = timestampDateFilter(query, "creado_en", filters);
        return query;
      }, 30000),
      fetchPaged((from, to) => client.from("trabajos")
        .select("id,codigo,os_numero,cliente_id,sucursal").order("id").range(from, to), 30000),
      fetchPaged((from, to) => client.from("clientes")
        .select("id,nombre").order("id").range(from, to), 30000),
      fetchPaged((from, to) => client.from("profiles")
        .select("id,nombre").order("id").range(from, to), 5000),
    ]);
    const jobById = new Map(jobs.map((row) => [cleanText(row.id, 100), row]));
    const clientById = new Map(clients.map((row) => [cleanText(row.id, 100), row]));
    const profileById = new Map(profiles.map((row) => [cleanText(row.id, 100), row]));
    return rows.map((row) => {
      const job = jobById.get(cleanText(row.trabajo_id, 100)) ?? {};
      const customer = clientById.get(cleanText(job.cliente_id, 100)) ?? {};
      const user = profileById.get(cleanText(row.usuario_id, 100)) ?? {};
      return {
        ...row,
        trabajo_referencia: job.os_numero || job.codigo,
        trabajo_sucursal: job.sucursal,
        cliente_nombre: customer.nombre,
        usuario_nombre: user.nombre,
      };
    });
  }
  if (dataset === "importaciones") {
    const [rows, profiles] = await Promise.all([
      fetchPaged((from, to) => {
        let query = client.from("importaciones")
          .select("id,tipo,archivo_nombre,total_filas,insertados,duplicados,usuario_id,metadata,origen_sistema,creado_en")
          .order("creado_en").range(from, to);
        query = timestampDateFilter(query, "creado_en", filters);
        return query;
      }, 10000),
      fetchPaged((from, to) => client.from("profiles")
        .select("id,nombre").order("id").range(from, to), 5000),
    ]);
    const profileById = new Map(profiles.map((row) => [cleanText(row.id, 100), row]));
    return rows.map((row) => ({
      ...row,
      usuario_nombre: profileById.get(cleanText(row.usuario_id, 100))?.nombre,
    }));
  }
  if (dataset === "dias_no_laborales") {
    return fetchPaged((from, to) => {
      let query = client.from("dias_no_laborales")
        .select("id,fecha,motivo,creado_por,creado_en")
        .order("fecha").range(from, to);
      query = dateFilter(query, "fecha", filters);
      return query;
    }, 5000);
  }
  throw new Error(`Dataset no implementado: ${dataset}`);
}

function applyBusinessFilters(rows: JsonRecord[], dataset: BusinessDataset, filters: JsonRecord, granularity: string) {
  const allowed = new Set(businessCatalog[dataset].dimensions);
  return rows.filter((row) => Object.entries(filters).every(([key, raw]) => {
    if (["date_from", "date_to"].includes(key)) return true;
    if (key === "sucursales") {
      const branches = Array.isArray(raw) ? raw : [];
      const actualBranch = normalizedKey(semanticDimension(row, dataset, "sucursal", granularity));
      return !branches.length || branches.some((branch) => actualBranch === normalizedKey(branch));
    }
    if (!allowed.has(key as never)) return true;
    const expected = Array.isArray(raw) ? raw : [raw];
    if (!expected.length || expected.some((value) => normalizedKey(value) === "TODOS")) return true;
    const actualValue = semanticDimension(row, dataset, key, granularity);
    const actual = normalizedKey(actualValue);
    if (dataset === "trabajos" && key === "estado" && expected.some((value) => normalizedKey(value) === "ABIERTO")) {
      return ["PENDIENTE", "PROGRAMADO", "INICIADO"].includes(actual);
    }
    if (dataset === "ordenes_servicio" && key === "tecnico") {
      return expected.some((value) => serviceOrderTechniciansMatch(actualValue, value));
    }
    return expected.some((value) => actual.includes(normalizedKey(value)));
  }));
}

async function queryBusinessData(client: SupabaseClient, args: JsonRecord) {
  const dataset = cleanText(args.dataset, 40) as BusinessDataset;
  if (!(dataset in businessCatalog)) throw new Error("Dataset no permitido");
  const catalog = businessCatalog[dataset];
  const metrics = (Array.isArray(args.metrics) ? args.metrics : []).map((value) => cleanText(value, 40)).filter((value) => catalog.metrics.includes(value as never));
  const dimensions = (Array.isArray(args.dimensions) ? args.dimensions : []).map((value) => cleanText(value, 40)).filter((value) => catalog.dimensions.includes(value as never)).slice(0, 3);
  if (!metrics.length) throw new Error(`Indica al menos una metrica valida para ${dataset}`);
  const filters = args.filters && typeof args.filters === "object" ? { ...(args.filters as JsonRecord) } : {};
  if (filters.rubro) filters.rubro = canonicalBillingRubro(filters.rubro) || filters.rubro;
  if (filters.tipo_tiempo) filters.tipo_tiempo = canonicalBillingTimeType(filters.tipo_tiempo) || filters.tipo_tiempo;
  const granularity = ["day", "week", "month", "year"].includes(cleanText(args.granularity, 10)) ? cleanText(args.granularity, 10) : "month";
  const question = cleanText(args.__question, 4000);
  let serviceOrderParticipantRows: JsonRecord[] | null = null;
  let sourceRows: JsonRecord[];
  if (dataset === "ordenes_servicio") {
    const serviceOrderResult = await getServiceOrdersSummary(client, { ...filters, __include_rows: true }) as JsonRecord;
    const baseRows = (serviceOrderResult._rows ?? []) as JsonRecord[];
    serviceOrderParticipantRows = (serviceOrderResult._participant_rows ?? []) as JsonRecord[];
    sourceRows = dimensions.includes("tecnico") || dimensions.includes("activo") || filters.tecnico || filters.activo
      ? serviceOrderParticipantRows
      : baseRows;
  } else {
    sourceRows = await loadBusinessRows(client, dataset, filters, dimensions);
  }
  if (question) {
    const entityCandidates: { cliente?: string[]; tecnico?: string[] } = {};
    for (const field of ["cliente", "tecnico"] as const) {
      if (!catalog.dimensions.includes(field as never) || filters[field]) continue;
      const candidateRows = dataset === "ordenes_servicio" && field === "tecnico" && serviceOrderParticipantRows
        ? serviceOrderParticipantRows
        : sourceRows;
      entityCandidates[field] = [...new Set(candidateRows
        .map((row) => semanticDimension(row, dataset, field, granularity))
        .filter((value) => value && value !== "Sin dato"))];
    }
    const branchValues = catalog.dimensions.includes("sucursal" as never)
      ? [...new Set(sourceRows.map((row) => semanticDimension(row, dataset, "sucursal", granularity)).filter(Boolean))]
      : [];
    Object.assign(filters, resolveNamedEntityFilters(question, entityCandidates, branchValues));
  }
  if (dataset === "ordenes_servicio" && serviceOrderParticipantRows && (dimensions.includes("tecnico") || dimensions.includes("activo") || filters.tecnico || filters.activo)) {
    sourceRows = serviceOrderParticipantRows;
  }
  const rows = applyBusinessFilters(sourceRows, dataset, filters, granularity);
  const chronologicalPeriods = shouldSortTemporalSeriesChronologically(question, dimensions);
  const groups = new Map<string, { dimensions: JsonRecord; rows: JsonRecord[] }>();
  for (const row of rows) {
    const values = Object.fromEntries(dimensions.map((dimension) => [dimension, semanticDimension(row, dataset, dimension, granularity)]));
    const key = dimensions.length ? JSON.stringify(values) : "__total__";
    const entry = groups.get(key) ?? { dimensions: values, rows: [] };
    entry.rows.push(row);
    groups.set(key, entry);
  }
  if (chronologicalPeriods && dimensions.length === 1 && dimensions[0] === "periodo") {
    const periodBuckets = enumeratePeriodBuckets(
      filters.date_from,
      filters.date_to,
      granularity as "day" | "week" | "month" | "year",
    );
    for (const periodo of periodBuckets) {
      const dimensionsForPeriod = { periodo };
      const key = JSON.stringify(dimensionsForPeriod);
      if (!groups.has(key)) groups.set(key, { dimensions: dimensionsForPeriod, rows: [] });
    }
  }
  if (!groups.size && !dimensions.length) groups.set("__total__", { dimensions: {}, rows: [] });
  const result = [...groups.values()].map((group) => ({
    ...group.dimensions,
    ...Object.fromEntries(metrics.map((metric) => [metric, semanticMetric(group.rows, dataset, metric)])),
  }));
  const requestedOrder = cleanText(args.order_by, 40);
  const orderBy = chronologicalPeriods
    ? "periodo"
    : metrics.includes(requestedOrder) || dimensions.includes(requestedOrder)
      ? requestedOrder
      : metrics[0];
  const ascending = chronologicalPeriods || cleanText(args.order_direction, 8).toLowerCase() === "asc";
  const orderIsMetric = metrics.includes(orderBy);
  result.sort((a, b) => {
    const comparison = orderIsMetric
      ? (Number(a[orderBy]) || 0) - (Number(b[orderBy]) || 0)
      : cleanText(a[orderBy], 180).localeCompare(cleanText(b[orderBy], 180), "es", { numeric: true });
    return ascending ? comparison : -comparison;
  });
  const requestedLimit = safeLimit(args.limit, 20, 100);
  const limit = chronologicalPeriods && dimensions.length === 1 && dimensions[0] === "periodo"
    ? Math.max(requestedLimit, Math.min(result.length, 100))
    : requestedLimit;
  return {
    dataset,
    definition: catalog.description,
    metrics,
    dimensions,
    filters,
    granularity,
    source_rows: rows.length,
    result_rows: Math.min(result.length, limit),
    rows: result.slice(0, limit),
  };
}

const toolSpecs = [
  ["get_operational_summary", "Resume trabajos y jornadas del periodo e incluye los trabajos abiertos mas antiguos."],
  ["get_planning_summary", "Resume jornadas pendientes y tecnicos planificados."],
  ["get_calendar_summary", "Resume calendario y no disponibilidades."],
  ["get_billing_summary", "Resume facturacion importada en USD y devuelve rankings por sucursal, rubro y cliente unico. Usala tambien para responder repreguntas sobre el cliente que mas facturo. Los rubros validos son Servicio, Repuestos, Kilometraje y Otros."],
  ["get_service_orders_summary", "Resume ordenes de servicio, horas, km y valores. Incluye ranking de tecnicos participantes y OS cerradas por tipo de tiempo canonico."],
  ["get_park_summary", "Resume parque activo de maquinas y clientes."],
  ["get_commercial_followup", "Resume gestiones de agenda comercial."],
  ["get_technician_summary", "Resume tecnicos activos o inactivos y devuelve listas nominales con carga, horas y jornadas. Usa activo=Inactivo para consultar ex tecnicos."],
] as const;

const filterProperties = {
  date_from: { type: "string", description: "Fecha inicial YYYY-MM-DD" },
  date_to: { type: "string", description: "Fecha final YYYY-MM-DD" },
  sucursal: { type: "string" },
  sucursales: { type: "array", items: { type: "string" }, maxItems: 6, description: "Varias sucursales para comparar o combinar en una sola consulta" },
  marca: { type: "string" },
  tipo_tiempo: { type: "string", description: "Tipo comercial: Cliente, Garantia, Interno o Todos. No usar para dia, semana, mes o anio." },
  rubro: { type: "string", description: "Rubro canonico: Servicio, Repuestos, Kilometraje, Otros o Todos" },
  activo: { type: "string", enum: ["Activo", "Inactivo", "Todos"], description: "Situacion del tecnico" },
  metrics: { type: "array", items: { type: "string" }, maxItems: 6, description: "Metricas solicitadas; las herramientas resumen ignoran las que no correspondan" },
  dimensions: { type: "array", items: { type: "string" }, maxItems: 3, description: "Dimensiones solicitadas; las herramientas resumen ignoran las que no correspondan" },
  granularity: { type: "string", enum: ["day", "week", "month", "year"], description: "Agrupacion temporal solicitada" },
  order_by: { type: "string", description: "Metrica usada para ordenar" },
  limit: { type: "integer", minimum: 1, maximum: 100 },
  dataset: { type: "string", description: "Alias tolerado; la herramienta ya determina su propia fuente" },
  filters: { type: "object", description: "Alias tolerado para filtros anidados", additionalProperties: true },
};

const tools = [
  {
    type: "function",
    function: {
      name: "get_data_catalog",
      description: "Devuelve los datasets, metricas, dimensiones y reglas disponibles. Usala cuando no estes seguro de que campos existen.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "query_business_data",
      description: "Motor analitico principal. Consulta cualquier combinacion permitida de metricas, dimensiones y filtros sin generar SQL.",
      parameters: {
        type: "object",
        properties: {
          dataset: { type: "string", enum: Object.keys(businessCatalog) },
          metrics: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 6 },
          dimensions: { type: "array", items: { type: "string" }, maxItems: 3 },
          filters: {
            type: "object",
            properties: {
              date_from: { type: "string" }, date_to: { type: "string" }, sucursal: { type: "string" },
              sucursales: { type: "array", items: { type: "string" } }, cliente: { type: "string" }, tecnico: { type: "string" },
              marca: { type: "string" }, rubro: { type: "string" }, tipo_tiempo: { type: "string" }, estado: { type: "string" },
              factura: { type: "string" }, os: { type: "string" }, trabajo: { type: "string" }, resultado: { type: "string" },
              codigo_producto: { type: "string" }, concepto: { type: "string" }, observacion: { type: "string" },
              problema: { type: "string" }, serie: { type: "string" }, modelo: { type: "string" }, subgrupo: { type: "string" },
              origen: { type: "string" }, activo: { type: "string" }, carga: { type: "string" }, fecha: { type: "string" },
              tipo: { type: "string" }, motivo: { type: "string" }, bloquea_agenda: { type: "string" },
              contacto: { type: "string" }, cargo: { type: "string" }, telefono: { type: "string" }, correo: { type: "string" },
              canal: { type: "string" }, principal: { type: "string" }, evento: { type: "string" }, usuario: { type: "string" },
              archivo: { type: "string" },
            },
            additionalProperties: false,
          },
          granularity: { type: "string", enum: ["day", "week", "month", "year"] },
          order_by: { type: "string" },
          order_direction: { type: "string", enum: ["asc", "desc"] },
          limit: { type: "integer", minimum: 1, maximum: 100 },
        },
        required: ["dataset", "metrics"],
        additionalProperties: false,
      },
    },
  },
  ...toolSpecs.map(([name, description]) => ({
    type: "function",
    function: { name, description, parameters: { type: "object", properties: filterProperties, additionalProperties: true } },
  })),
  {
    type: "function",
    function: {
      name: "search_entities",
      description: "Busca clientes, trabajos, OS, tecnicos o maquinas antes de pedir detalle.",
      parameters: { type: "object", properties: { query: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: 10 } }, required: ["query"], additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "get_entity_detail",
      description: "Obtiene detalle limitado de una entidad encontrada.",
      parameters: { type: "object", properties: { entity_type: { type: "string", enum: ["cliente", "trabajo", "tecnico", "maquina", "os"] }, id: { type: "string" } }, required: ["entity_type", "id"], additionalProperties: false },
    },
  },
];

const modelToolNames = new Set(["get_data_catalog", "query_business_data", "search_entities", "get_entity_detail"]);
const modelTools = tools.filter((tool) => modelToolNames.has(tool.function.name));

async function executeTool(client: SupabaseClient, name: string, args: JsonRecord) {
  switch (name) {
    case "get_data_catalog": return getDataCatalog();
    case "query_business_data": return queryBusinessData(client, args);
    case "get_operational_summary": return getOperationalSummary(client, args);
    case "get_planning_summary": return getPlanningSummary(client, args);
    case "get_calendar_summary": return getCalendarSummary(client, args);
    case "get_billing_summary": return getBillingSummary(client, args);
    case "get_service_orders_summary": return getServiceOrdersSummary(client, args);
    case "get_park_summary": return getParkSummary(client, args);
    case "get_commercial_followup": return getCommercialFollowup(client, args);
    case "get_technician_summary": return getTechnicianSummary(client, args);
    case "search_entities": return searchEntities(client, args);
    case "get_entity_detail": return getEntityDetail(client, args);
    default: throw new Error("Herramienta no permitida");
  }
}

function sourceLabel(name: string) {
  return ({
    scope_guard: "Control de alcance",
    get_data_catalog: "Catalogo de datos",
    query_business_data: "Analisis de datos",
    get_operational_summary: "Trabajos y jornadas",
    get_planning_summary: "Planificador",
    get_calendar_summary: "Calendario y disponibilidad",
    get_billing_summary: "Facturacion importada",
    get_service_orders_summary: "Ordenes de servicio",
    get_park_summary: "Parque de maquinas",
    get_commercial_followup: "Agenda comercial",
    get_technician_summary: "Tecnicos",
    search_entities: "Buscador de entidades",
    get_entity_detail: "Detalle de entidad",
  } as Record<string, string>)[name] ?? name;
}

function firstFilterValue(value: unknown) {
  if (Array.isArray(value)) return value.length === 1 ? cleanText(value[0], 80) : "";
  return cleanText(value, 80);
}

function semanticToolArgs(
  question: string,
  pageContext: JsonRecord,
  currentDate: string,
  inherited: JsonRecord = {},
  usePageContext = true,
) {
  const filters = usePageContext && pageContext.filters && typeof pageContext.filters === "object"
    ? pageContext.filters as JsonRecord
    : {};
  const args: JsonRecord = {};
  const from = cleanText(filters.fecha_desde ?? filters.date_from, 10);
  const to = cleanText(filters.fecha_hasta ?? filters.date_to, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(from)) args.date_from = from;
  if (/^\d{4}-\d{2}-\d{2}$/.test(to)) args.date_to = to;

  const sucursal = firstFilterValue(filters.sucursales ?? filters.sucursal);
  const marca = firstFilterValue(filters.marcas ?? filters.marca);
  const rubroFiltro = firstFilterValue(filters.rubros ?? filters.rubro);
  const tipoTiempo = canonicalBillingTimeType(firstFilterValue(filters.tipo_tiempo));
  if (sucursal && normalizedKey(sucursal) !== "TODOS") args.sucursal = sucursal;
  if (marca && normalizedKey(marca) !== "TODOS") args.marca = marca;
  if (rubroFiltro) args.rubro = canonicalBillingRubro(rubroFiltro);
  if (tipoTiempo) args.tipo_tiempo = tipoTiempo;
  Object.assign(args, inherited);

  const normalized = normalizedKey(question);
  if (referencesAllHistory(question)) {
    delete args.date_from;
    delete args.date_to;
  } else {
    Object.assign(args, resolveQuestionDateRange(question, currentDate));
  }
  const knownBranches = ["Santa Rita", "Katuete", "Loma Plata", "Misiones", "Santa Rosa", "Campo 9"];
  const explicitBranches = knownBranches.filter((branch) => normalized.includes(normalizedKey(branch)));
  if (explicitBranches.length > 1) {
    args.sucursales = explicitBranches;
    delete args.sucursal;
  } else if (explicitBranches.length === 1) {
    args.sucursal = explicitBranches[0];
    delete args.sucursales;
  }
  if (normalized.includes("REPUEST")) args.rubro = "Repuestos";
  else if (normalized.includes("KILOMET") || /\bKM\b/.test(normalized)) args.rubro = "Kilometraje";
  else if (normalized.includes("SERVICIO") || normalized.includes("MANO DE OBRA")) args.rubro = "Servicio";
  else if (normalized.includes("OTROS")) args.rubro = "Otros";
  // "facturo/facturacion" describe la metrica, no implica tipo de tiempo Cliente.
  // Solo aplicar este filtro cuando el usuario nombre explicitamente la categoria.
  if (normalized.includes("GARANT")) args.tipo_tiempo = "Garantia";
  else if (normalized.includes("INTERNO") || normalized.includes("ABSORVE") || normalized.includes("ABSORBE")) args.tipo_tiempo = "Interno";
  else if (normalized.includes("FACTURAR A CLIENTE") || normalized.includes("TIPO CLIENTE") || normalized.includes("A CLIENTE")) args.tipo_tiempo = "Cliente";
  if (normalized.includes("INACTIV")) args.activo = "Inactivo";
  else if (normalized.includes("TECNIC") && normalized.includes("ACTIV")) args.activo = "Activo";

  return args;
}

type SemanticResponse = { tool: string; args: JsonRecord; content: string; resultCount: number };

function scopeRejection(question: string) {
  const normalized = normalizedKey(question);
  const securityTerms = ["CONTRASENA", "PASSWORD", "TOKEN", "API KEY", "SECRET", "CREDENCIAL", "POLITICA RLS", "PERMISO DE USUARIO", "AUTENTICACION"];
  if (securityTerms.some((term) => normalized.includes(term))) {
    return "No puedo consultar ni revelar credenciales, secretos, autenticacion o configuracion de seguridad. Si puedo analizar los datos operativos y comerciales de la aplicacion.";
  }
  const outsideTerms = ["CLIMA", "PRONOSTICO", "TEMPERATURA HOY", "PARTIDO DE", "RESULTADO DEPORTIVO", "RECETA DE", "NOTICIAS DE", "HOROSCOPO"];
  if (outsideTerms.some((term) => normalized.includes(term))) {
    return "Solo puedo responder preguntas relacionadas con los datos cargados en Servicios Tecnicos CDM.";
  }
  return "";
}

const summaryToolNames = new Set(toolSpecs.map(([name]) => name));
const summaryArgNames = new Set([
  "date_from", "date_to", "sucursal", "sucursales", "marca", "tipo_tiempo", "rubro",
  "activo", "metrics", "dimensions", "granularity", "order_by", "limit", "__include_rows",
]);

function normalizeToolArgs(name: string, rawArgs: JsonRecord): JsonRecord {
  if (!summaryToolNames.has(name as typeof toolSpecs[number][0])) return rawArgs;
  const nestedFilters = rawArgs.filters && typeof rawArgs.filters === "object" && !Array.isArray(rawArgs.filters)
    ? rawArgs.filters as JsonRecord
    : {};
  const merged = { ...nestedFilters, ...rawArgs };
  return Object.fromEntries(Object.entries(merged).filter(([key]) => summaryArgNames.has(key)));
}

function providerSafeMessages(messages: any[]) {
  return messages.map((message) => ({
    role: message.role,
    ...(message.content !== undefined ? { content: message.content } : {}),
    ...(message.name ? { name: message.name } : {}),
    ...(message.tool_call_id ? { tool_call_id: message.tool_call_id } : {}),
    ...(Array.isArray(message.tool_calls) ? {
      tool_calls: message.tool_calls.map((call: any) => ({
        id: call.id,
        type: call.type || "function",
        function: {
          name: call.function?.name,
          arguments: call.function?.arguments || "{}",
        },
      })),
    } : {}),
  }));
}

async function resolveSemanticQuestion(
  client: SupabaseClient,
  question: string,
  pageContext: JsonRecord,
  currentDate: string,
  history: JsonRecord[] = [],
): Promise<SemanticResponse | null> {
  const rejected = scopeRejection(question);
  if (rejected) return { tool: "scope_guard", args: {}, content: rejected, resultCount: 0 };
  const normalized = normalizedKey(question);
  if (normalized === "QUE DIA ES HOY" || normalized === "CUAL ES LA FECHA DE HOY" || normalized === "FECHA DE HOY") {
    const today = new Date(`${currentDate}T12:00:00Z`);
    const label = new Intl.DateTimeFormat("es-PY", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(today);
    return {
      tool: "current_date",
      args: { current_date: currentDate },
      content: `Hoy es ${label}.`,
      resultCount: 1,
    };
  }
  const moduleName = normalizedKey(pageContext.module);
  const previousUserQuestion = history.find((row) => row.role === "user" && normalizedKey(row.content) !== normalized)?.content;
  const conversationalIntent = normalizedKey(`${cleanText(previousUserQuestion, 4000)} ${question}`);
  const previousBillingSource = history
    .filter((row) => row.role === "assistant" && Array.isArray(row.sources))
    .flatMap((row) => row.sources as JsonRecord[])
    .find((source) => source.tool === "get_billing_summary");
  const inheritedBillingFilters = previousBillingSource?.filters && typeof previousBillingSource.filters === "object"
    ? previousBillingSource.filters as JsonRecord
    : {};
  const isFollowUp = normalized.length <= 80 && (
    normalized.startsWith("Y ") ||
    normalized.startsWith("PERO ") ||
    normalized.includes("EN ESE PERIODO") ||
    normalized.includes("MES EN CURSO") ||
    normalized.includes("MES ACTUAL") ||
    normalized.includes("ESTE MES") ||
    normalized.includes("QUIEN LE SIGUE") ||
    normalized.includes("CUAL LE SIGUE")
  );
  const usePageContext = shouldApplyPageContext(question, pageContext);
  const args = semanticToolArgs(
    question,
    pageContext,
    currentDate,
    isFollowUp ? inheritedBillingFilters : {},
    usePageContext,
  );
  const asksCount = normalized.includes("CUANT") || normalized.includes("TOTAL");
  const asksTop = normalized.includes(" MAS ") || normalized.startsWith("QUE ") || normalized.includes("MAYOR");
  const asksBilling = normalized.includes("FACTUR") || normalized.includes("VENTA") ||
    (isFollowUp && conversationalIntent.includes("FACTUR"));
  const asksOrders = /(^|\s)OS($|\s)/.test(normalized) || normalized.includes("ORDEN DE SERVICIO") || normalized.includes("ORDENES DE SERVICIO");
  const asksTechnician = normalized.includes("TECNIC") || (asksOrders && conversationalIntent.includes("TECNIC"));
  const asksClients = normalized.includes("CLIENT");
  const asksBranch = normalized.includes("SUCURSAL");
  const topMatch = normalized.match(/\bTOP\s*(\d{1,2})\b/);
  const topN = Math.min(25, Math.max(1, Number(topMatch?.[1]) || 1));
  const asksClientRanking = asksClients && (Boolean(topMatch) || asksTop);
  const asksNext = normalized.includes("QUIEN LE SIGUE") || normalized.includes("CUAL LE SIGUE") || normalized.includes("SIGUIENTE");

  const asksChassis = normalized.includes("CHASIS") || normalized.includes("SERIE");
  const chassisPrefixMatch = normalized.match(/(?:EMPIE(?:ZA|CEN)|COMIEN(?:ZA|CEN)|PREFIJO)\s+(?:POR|CON|DE)?\s*([A-Z0-9-]{2,40})\b/);
  if (asksChassis && chassisPrefixMatch?.[1]) {
    const prefix = chassisPrefixMatch[1];
    const machines = await getMachinesByChassisPrefix(client, prefix);
    const lines = machines.map((machine, index) => {
      const clientRelation = machine.clientes;
      const owner = Array.isArray(clientRelation)
        ? cleanText((clientRelation[0] as JsonRecord | undefined)?.nombre, 160)
        : cleanText((clientRelation as JsonRecord | null)?.nombre, 160);
      const status = machine.activo === false ? " · inactiva" : "";
      return `${index + 1}. ${cleanText(machine.serie, 80)} · ${cleanText(machine.modelo_tipo, 120) || "Sin modelo"} · ${owner || "Sin dueño asociado"}${status}`;
    });
    return {
      tool: "search_entities",
      args: { entity_type: "maquina", chassis_prefix: prefix },
      content: machines.length
        ? `Chasis que comienzan por ${prefix} (${machines.length}):\n${lines.join("\n")}`
        : `No se encontraron chasis que comiencen por ${prefix}.`,
      resultCount: machines.length,
    };
  }

  const asksInactiveTechnician = normalized.includes("INACTIV") || (asksOrders && conversationalIntent.includes("INACTIV"));
  const asksProductivity = normalized.includes("PRODUCTIV") || (asksOrders && conversationalIntent.includes("PRODUCTIV"));
  const asksJornadas = normalized.includes("JORNAD") || normalized.includes("PLANIFICADOR") || normalized.includes("CALENDARIO");
  const asksHours = normalized.includes("HORA") || /(^|\s)HS($|\s)/.test(normalized) ||
    (isFollowUp && (conversationalIntent.includes("HORA") || /(^|\s)HS($|\s)/.test(conversationalIntent)));
  const asksTimeTypeBreakdown = normalized.includes("TIPO DE TIEMPO") ||
    (isFollowUp && conversationalIntent.includes("TIPO DE TIEMPO")) ||
    (conversationalIntent.includes("TIPO DE TIEMPO") && (normalized.includes("DESGLOS") || normalized.includes("HABLO DE")));

  if (asksBilling && asksHours) {
    const billingArgs = { ...args, rubro: "Servicio" };
    delete billingArgs.tipo_tiempo;
    const result = await getBillingSummary(client, billingArgs) as JsonRecord;
    const byTimeType = result.horas_servicio_por_tipo_tiempo && typeof result.horas_servicio_por_tipo_tiempo === "object"
      ? result.horas_servicio_por_tipo_tiempo as Record<string, number>
      : {};
    const formatHours = (value: unknown) => Number(value || 0).toLocaleString("es-PY", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
    const lines = Object.entries(byTimeType)
      .sort((a, b) => Number(b[1]) - Number(a[1]))
      .map(([timeType, hours]) => `- ${timeType}: ${formatHours(hours)} hs`);
    const period = `${cleanText(billingArgs.date_from, 10) || "inicio disponible"} al ${cleanText(billingArgs.date_to, 10) || "fin disponible"}`;
    return {
      tool: "get_billing_summary",
      args: billingArgs,
      content: asksTimeTypeBreakdown
        ? `Horas facturadas en concepto de Servicio por tipo de tiempo:\n${lines.length ? lines.join("\n") : "- Sin horas facturadas."}\nTotal: ${formatHours(result.horas_servicio)} hs. Periodo consultado: ${period}.`
        : `Se facturaron ${formatHours(result.horas_servicio)} horas en concepto de Servicio. Periodo consultado: ${period}.`,
      resultCount: Number(result.lineas) || 0,
    };
  }

  // En esta app, productividad tecnica es una metrica de Ordenes de Servicio.
  // Las jornadas se usan solo cuando el usuario las pide de forma explicita.
  if ((asksTechnician || asksProductivity) && asksProductivity && !asksJornadas) {
    const orderArgs = {
      ...args,
      ...(asksInactiveTechnician ? { activo: "Inactivo" } : {}),
      order_by: "horas",
    };
    const result = await getServiceOrdersSummary(client, orderArgs) as JsonRecord;
    const ranking = Array.isArray(result.ranking_tecnicos)
      ? result.ranking_tecnicos as Array<{
        tecnico?: string;
        ordenes?: number;
        abiertas?: number;
        cerradas?: number;
        horas?: number;
        km?: number;
        activo?: boolean | null;
      }>
      : [];
    const leader = ranking.find((row) => Number(row.horas) > 0 || Number(row.ordenes) > 0);
    const period = `${cleanText(orderArgs.date_from, 10) || "inicio disponible"} al ${cleanText(orderArgs.date_to, 10) || "fin disponible"}`;
    const activityLabel = asksInactiveTechnician ? " inactivo" : "";
    return {
      tool: "get_service_orders_summary",
      args: orderArgs,
      content: leader?.tecnico
        ? `${leader.tecnico} fue el tecnico${activityLabel} con mayor productividad segun Ordenes de Servicio: ${Number(leader.horas) || 0} horas en ${Number(leader.ordenes) || 0} OS (${Number(leader.cerradas) || 0} cerradas y ${Number(leader.abiertas) || 0} abiertas). Periodo consultado: ${period}.`
        : `No hay horas ni Ordenes de Servicio asociadas a tecnicos${activityLabel}s en el periodo ${period}.`,
      resultCount: ranking.length,
    };
  }

  if (asksOrders && asksTechnician && asksInactiveTechnician && (asksProductivity || asksTop || normalized.includes("POR OS"))) {
    const orderArgs = { ...args, activo: "Inactivo", order_by: "ordenes" };
    const result = await getServiceOrdersSummary(client, orderArgs) as JsonRecord;
    const ranking = Array.isArray(result.ranking_tecnicos)
      ? result.ranking_tecnicos as Array<{ tecnico?: string; ordenes?: number; abiertas?: number; cerradas?: number }>
      : [];
    const leader = ranking[0];
    const period = `${cleanText(orderArgs.date_from, 10) || "inicio disponible"} al ${cleanText(orderArgs.date_to, 10) || "fin disponible"}`;
    return {
      tool: "get_service_orders_summary",
      args: orderArgs,
      content: leader?.tecnico
        ? `${leader.tecnico} fue el tecnico inactivo con mas ordenes de servicio: ${Number(leader.ordenes) || 0} OS (${Number(leader.cerradas) || 0} cerradas y ${Number(leader.abiertas) || 0} abiertas). Periodo consultado: ${period}.`
        : `No hay ordenes de servicio asociadas a tecnicos inactivos en el periodo ${period}.`,
      resultCount: ranking.length,
    };
  }

  if ((asksTechnician || asksProductivity) && asksInactiveTechnician && asksJornadas && (asksProductivity || asksTop)) {
    const technicianArgs = { ...args, activo: "Inactivo", metrics: ["horas"], order_by: "horas" };
    const result = await getTechnicianSummary(client, technicianArgs) as JsonRecord;
    const detail = Array.isArray(result.detalle) ? result.detalle as JsonRecord[] : [];
    const leader = detail.find((row) => Number(row.horas) > 0 || Number(row.jornadas) > 0);
    const period = `${cleanText(technicianArgs.date_from, 10) || "inicio disponible"} al ${cleanText(technicianArgs.date_to, 10) || "fin disponible"}`;
    return {
      tool: "get_technician_summary",
      args: technicianArgs,
      content: leader
        ? `${cleanText(leader.nombre, 160)} fue el tecnico inactivo con mayor productividad por horas registradas: ${Number(leader.horas) || 0} horas en ${Number(leader.jornadas) || 0} jornadas. Periodo consultado: ${period}.`
        : `No hay actividad registrada para tecnicos inactivos en el periodo ${period}.`,
      resultCount: detail.length,
    };
  }

  if ((asksTechnician || asksProductivity) && asksJornadas && (asksProductivity || asksTop) && !asksOrders) {
    const technicianArgs = { ...args, metrics: ["horas"], order_by: "horas" };
    const result = await getTechnicianSummary(client, technicianArgs) as JsonRecord;
    const detail = Array.isArray(result.detalle) ? result.detalle as JsonRecord[] : [];
    const leader = detail.find((row) => Number(row.horas) > 0 || Number(row.jornadas) > 0);
    const period = `${cleanText(technicianArgs.date_from, 10) || "inicio disponible"} al ${cleanText(technicianArgs.date_to, 10) || "fin disponible"}`;
    return {
      tool: "get_technician_summary",
      args: technicianArgs,
      content: leader
        ? `${cleanText(leader.nombre, 160)} fue el tecnico con mayor productividad por horas registradas: ${Number(leader.horas) || 0} horas en ${Number(leader.jornadas) || 0} jornadas. Periodo consultado: ${period}.`
        : `No hay actividad tecnica registrada en el periodo ${period}.`,
      resultCount: detail.length,
    };
  }

  if (asksTechnician && (normalized.includes("CARGA") || normalized.includes("ASIGN"))) {
    const result = await getTechnicianSummary(client, args) as JsonRecord;
    const withLoad = Array.isArray(result.con_carga_detalle) ? result.con_carga_detalle as JsonRecord[] : [];
    const withoutLoad = Array.isArray(result.sin_carga_detalle) ? result.sin_carga_detalle as JsonRecord[] : [];
    const loadedLines = withLoad.map((row) => {
      const states = [
        Number(row.realizadas) ? `${Number(row.realizadas)} realizadas` : "",
        Number(row.pendientes) ? `${Number(row.pendientes)} pendientes` : "",
        Number(row.no_realizadas) ? `${Number(row.no_realizadas)} no realizadas` : "",
      ].filter(Boolean).join(", ");
      return `- ${cleanText(row.nombre, 160)}: ${Number(row.jornadas) || 0} jornadas${states ? ` (${states})` : ""}`;
    });
    const noLoadNames = withoutLoad.map((row) => cleanText(row.nombre, 160)).filter(Boolean);
    const period = `${cleanText(args.date_from, 10) || "inicio disponible"} al ${cleanText(args.date_to, 10) || "fin disponible"}`;
    return {
      tool: "get_technician_summary",
      args,
      content: [
        `Con carga (${withLoad.length}):`,
        loadedLines.length ? loadedLines.join("\n") : "- Ninguno",
        `\nSin carga (${withoutLoad.length}):`,
        noLoadNames.length ? noLoadNames.join(", ") : "Ninguno",
        `\nPeriodo consultado: ${period}.`,
      ].join("\n"),
      resultCount: Number(result.tecnicos_activos) || 0,
    };
  }

  if ((normalized.includes("TRABAJO") || normalized.includes("JORNADA"))
    && (normalized.includes("PENDIENT") || normalized.includes("ABIERTO"))
    && (normalized.includes("TIEMPO") || normalized.includes("ANTIGU"))) {
    const result = await getOperationalSummary(client, args) as JsonRecord;
    const jobs = result.trabajos && typeof result.trabajos === "object" ? result.trabajos as JsonRecord : {};
    const states = jobs.por_estado && typeof jobs.por_estado === "object" ? jobs.por_estado as Record<string, number> : {};
    const openCount = Object.entries(states)
      .filter(([state]) => !normalizedKey(state).includes("COMPLET"))
      .reduce((total, [, amount]) => total + Number(amount || 0), 0);
    const pendingCount = Object.entries(states)
      .filter(([state]) => normalizedKey(state).includes("PENDIENT"))
      .reduce((total, [, amount]) => total + Number(amount || 0), 0);
    const oldest = Array.isArray(result.abiertos_mas_antiguos) ? result.abiertos_mas_antiguos as JsonRecord[] : [];
    const lines = oldest.slice(0, 10).map((row, index) => `${index + 1}. ${cleanText(row.codigo, 80)} · ${cleanText(row.descripcion, 100)} · ${Number(row.dias_abierto) || 0} dias`);
    return {
      tool: "get_operational_summary",
      args,
      content: `Hay ${pendingCount} trabajos en estado Pendiente y ${openCount} trabajos abiertos en total para los filtros actuales.\n\nLos abiertos mas antiguos:\n${lines.length ? lines.join("\n") : "Sin trabajos abiertos."}`,
      resultCount: Number(jobs.total) || 0,
    };
  }

  if (asksOrders && normalized.includes("CERRAD") && normalized.includes("TIPO") && normalized.includes("TIEMPO")) {
    const result = await getServiceOrdersSummary(client, args) as JsonRecord;
    const byType = result.cerradas_por_tipo_tiempo && typeof result.cerradas_por_tipo_tiempo === "object"
      ? result.cerradas_por_tipo_tiempo as Record<string, number>
      : {};
    const lines = Object.entries(byType).sort((a, b) => b[1] - a[1]).map(([type, amount]) => `- ${type}: ${amount}`);
    const total = Object.values(byType).reduce((acc, amount) => acc + Number(amount || 0), 0);
    return {
      tool: "get_service_orders_summary",
      args,
      content: `Hubo ${total} OS cerradas por tipo de tiempo:\n${lines.length ? lines.join("\n") : "- Sin OS cerradas en el periodo."}`,
      resultCount: Number(result.filas) || 0,
    };
  }

  if (asksOrders && asksTechnician && asksTop) {
    const result = await getServiceOrdersSummary(client, args) as JsonRecord;
    const ranking = Array.isArray(result.ranking_tecnicos)
      ? result.ranking_tecnicos as Array<{ tecnico?: string; ordenes?: number; abiertas?: number; cerradas?: number }>
      : [];
    const onlyOpen = normalized.includes("ABIERT");
    const leader = ranking.reduce<typeof ranking[number] | null>((best, row) => {
      if (!best) return row;
      const value = Number(onlyOpen ? row.abiertas : row.ordenes) || 0;
      const bestValue = Number(onlyOpen ? best.abiertas : best.ordenes) || 0;
      return value > bestValue ? row : best;
    }, null);
    if (!leader?.tecnico) return null;
    const amount = Number(onlyOpen ? leader.abiertas : leader.ordenes) || 0;
    const period = `${cleanText(args.date_from, 10) || "inicio disponible"} al ${cleanText(args.date_to, 10) || "fin disponible"}`;
    return {
      tool: "get_service_orders_summary",
      args,
      content: `${leader.tecnico} es el tecnico con mas ${onlyOpen ? "OS abiertas" : "OS"}: ${amount}. Periodo consultado: ${period}.`,
      resultCount: Number(result.filas) || 0,
    };
  }

  const dashboardBillingContext = moduleName === "DASHBOARD" && !normalized.includes("PARQUE") && !normalized.includes("MAQUINA");
  if (asksBilling || (asksClients && (asksCount || asksClientRanking) && dashboardBillingContext) || (asksNext && Object.keys(inheritedBillingFilters).length > 0)) {
    const result = await getBillingSummary(client, args) as JsonRecord;
    const period = `${cleanText(args.date_from, 10) || "inicio disponible"} al ${cleanText(args.date_to, 10) || "fin disponible"}`;
    if (asksNext) {
      const ranking = result.ranking_sucursales as Array<{ sucursal?: string; total_usd?: number }> | undefined;
      const next = ranking?.[1];
      if (!next?.sucursal) return null;
      return {
        tool: "get_billing_summary",
        args,
        content: `${next.sucursal} ocupa el segundo lugar, con ${formatUsd(next.total_usd)}. Periodo consultado: ${period}.`,
        resultCount: Number(result.lineas) || 0,
      };
    }
    if (asksBranch && asksTop) {
      const ranking = result.ranking_sucursales as Array<{ sucursal?: string; total_usd?: number }> | undefined;
      const leader = ranking?.[0];
      if (!leader?.sucursal) return null;
      return {
        tool: "get_billing_summary",
        args,
        content: `${leader.sucursal} fue la sucursal con mayor facturacion, con ${formatUsd(leader.total_usd)}. Periodo consultado: ${period}.`,
        resultCount: Number(result.lineas) || 0,
      };
    }
    if (asksBranch && (normalized.includes("COMPAR") || normalized.includes("POR SUCURSAL"))) {
      const ranking = Array.isArray(result.ranking_sucursales)
        ? result.ranking_sucursales as Array<{ sucursal?: string; total_usd?: number; facturas?: number }>
        : [];
      const lines = ranking.map((row, index) => `${index + 1}. ${cleanText(row.sucursal, 80)}: ${formatUsd(row.total_usd)} (${Number(row.facturas) || 0} facturas)`);
      return {
        tool: "get_billing_summary",
        args,
        content: `Facturacion por sucursal:\n${lines.length ? lines.join("\n") : "Sin facturacion en el periodo."}\nPeriodo consultado: ${period}.`,
        resultCount: Number(result.lineas) || 0,
      };
    }
    if (asksClients && asksCount) {
      return {
        tool: "get_billing_summary",
        args,
        content: `Hay ${Number(result.clientes) || 0} clientes facturados unicos en el periodo ${period}.`,
        resultCount: Number(result.lineas) || 0,
      };
    }
    if (asksClientRanking) {
      const ranking = Array.isArray(result.ranking_clientes)
        ? result.ranking_clientes as Array<{ cliente?: string; total_usd?: number; facturas?: number }>
        : [];
      const selected = ranking.slice(0, topN);
      if (!selected.length) return null;
      const branchLabel = Array.isArray(args.sucursales) && args.sucursales.length
        ? ` entre ${(args.sucursales as string[]).join(" y ")}`
        : cleanText(args.sucursal, 40) ? ` en ${cleanText(args.sucursal, 40)}` : "";
      const lines = selected.map((row, index) => `${index + 1}. ${cleanText(row.cliente, 160)}: ${formatUsd(row.total_usd)} (${Number(row.facturas) || 0} facturas)`);
      return {
        tool: "get_billing_summary",
        args,
        content: `Top ${selected.length} clientes${branchLabel}:\n${lines.join("\n")}\nPeriodo consultado: ${period}.`,
        resultCount: Number(result.lineas) || 0,
      };
    }
    if (normalized.includes("FACTURA") && asksCount && !normalized.includes("FACTURACION")) {
      return {
        tool: "get_billing_summary",
        args,
        content: `Hay ${Number(result.facturas) || 0} facturas unicas en el periodo ${period}.`,
        resultCount: Number(result.lineas) || 0,
      };
    }
    if (asksCount || normalized.includes("CUANTO") || normalized.includes("MONTO")) {
      return {
        tool: "get_billing_summary",
        args,
        content: `La facturacion del periodo es ${formatUsd(result.total_usd)}. Periodo consultado: ${period}.`,
        resultCount: Number(result.lineas) || 0,
      };
    }
  }

  if (asksClients && asksCount && (moduleName.includes("PARQUE") || normalized.includes("PARQUE") || normalized.includes("MAQUINA"))) {
    const result = await getParkSummary(client, args) as JsonRecord;
    return {
      tool: "get_park_summary",
      args,
      content: `El parque activo tiene ${Number(result.clientes) || 0} clientes unicos y ${Number(result.maquinas_activas) || 0} maquinas activas.`,
      resultCount: Number(result.maquinas_activas) || 0,
    };
  }
  return null;
}

type GenericResolution = {
  content: string;
  sources: ToolSource[];
  results: Array<{ args: JsonRecord; data: JsonRecord }>;
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  model: string;
};

function parseJsonObject(value: unknown): JsonRecord {
  const text = cleanContent(value, 30000).replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as JsonRecord : {};
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end <= start) return {};
    try { return JSON.parse(text.slice(start, end + 1)) as JsonRecord; } catch { return {}; }
  }
}

function addUsage(
  total: { prompt_tokens: number; completion_tokens: number; total_tokens: number },
  next: JsonRecord,
) {
  return {
    prompt_tokens: total.prompt_tokens + (Number(next.prompt_tokens) || 0),
    completion_tokens: total.completion_tokens + (Number(next.completion_tokens) || 0),
    total_tokens: total.total_tokens + (Number(next.total_tokens) || 0),
  };
}

async function requestGroq(
  groqKey: string,
  primaryModel: string,
  fallbackModel: string,
  bodyForModel: (model: string) => JsonRecord,
  signal: AbortSignal,
) {
  const invoke = async (model: string) => {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${groqKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(bodyForModel(model)),
      signal,
    });
    const payload = await response.json().catch(() => ({}));
    return { response, payload, model };
  };
  let result = await invoke(primaryModel);
  if (result.response.status === 429 && primaryModel !== fallbackModel) result = await invoke(fallbackModel);
  if (!result.response.ok) {
    const message = result.payload?.error?.message ?? result.payload?.message ?? `Groq respondio ${result.response.status}`;
    throw new Error(result.response.status === 429
      ? "Se alcanzo el limite gratuito de los modelos principal y de respaldo de Groq. Intenta nuevamente mas tarde."
      : message);
  }
  return result;
}

function explicitGenericFilters(question: string, pageContext: JsonRecord, currentDate: string) {
  return semanticToolArgs(
    question,
    pageContext,
    currentDate,
    {},
    shouldApplyPageContext(question, pageContext),
  );
}

function validateGenericPlan(raw: JsonRecord, question: string, pageContext: JsonRecord, currentDate: string) {
  const explicitFilters = explicitGenericFilters(question, pageContext, currentDate);
  return validateGenericPlans(raw, explicitFilters, 3);
}

function previousGenericPlans(history: JsonRecord[]) {
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const row = history[index];
    if (row.role !== "assistant" || !Array.isArray(row.sources)) continue;
    const plans = (row.sources as JsonRecord[])
      .filter((source) => source.tool === "query_business_data" && source.filters && typeof source.filters === "object")
      .map((source) => source.filters as JsonRecord);
    if (plans.length) return plans.slice(0, 3);
  }
  return [];
}

function requiresCompositePlanning(question: string) {
  const normalized = normalizedKey(question);
  return [
    " COMPARA ", " COMPARAR ", " VERSUS ", " VS ", " DIFERENCIA ENTRE ",
    " RELACION ENTRE ", " Y ADEMAS ", " AL MISMO TIEMPO ",
  ].some((term) => ` ${normalized} `.includes(term));
}

async function resolveGenericQuestion(
  client: SupabaseClient,
  question: string,
  pageContext: JsonRecord,
  currentDate: string,
  history: JsonRecord[],
  answerMode: "brief" | "analytic",
  groqKey: string,
  primaryModel: string,
  fallbackModel: string,
  maxTokens: number,
  timeoutMs: number,
): Promise<GenericResolution | null> {
  const rejected = scopeRejection(question);
  if (rejected) return {
    content: rejected,
    sources: [{ tool: "scope_guard", label: sourceLabel("scope_guard"), filters: {} }],
    results: [],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    model: "scope-guard",
  };
  const normalized = normalizedKey(question);
  if (["QUE DIA ES HOY", "CUAL ES LA FECHA DE HOY", "FECHA DE HOY"].includes(normalized)) {
    const label = new Intl.DateTimeFormat("es-PY", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
      .format(new Date(`${currentDate}T12:00:00Z`));
    return {
      content: `Hoy es ${label}.`,
      sources: [{ tool: "current_date", label: "Fecha del sistema", filters: { current_date: currentDate } }],
      results: [],
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      model: "system-date",
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
  try {
    const priorPlans = previousGenericPlans(history);
    const isContextualFollowUp = isSemanticFollowUpQuestion(question);
    const explicitFilters = explicitGenericFilters(question, pageContext, currentDate);
    const intentHint = semanticIntentHint(question);
    const validatedPriorPlans = validateGenericPlans({ queries: priorPlans }, {}, 3).plans;
    const contextualPriorPlans = isContextualFollowUp ? validatedPriorPlans : [];
    const clarification = detectSemanticAmbiguity(question, contextualPriorPlans[0]);
    if (clarification) {
      return {
        content: [
          clarification.message,
          ...clarification.options.map((option, index) => `${index + 1}. ${option}`),
        ].join("\n"),
        sources: [{
          tool: "semantic_clarification",
          label: "Definicion de consulta",
          filters: { clarification_id: clarification.id },
        }],
        results: [],
        usage,
        model: "semantic-clarifier-v2",
      };
    }
    const compiled = compileSemanticPlan(question, explicitFilters, contextualPriorPlans[0]);
    const compactHistory = (isContextualFollowUp ? history.slice(-6) : []).map((row) => ({
      role: row.role,
      content: cleanContent(row.content, 1000),
      plans: row.role === "assistant" && Array.isArray(row.sources)
        ? (row.sources as JsonRecord[])
          .filter((source) => source.tool === "query_business_data")
          .map((source) => source.filters)
          .filter(Boolean)
          .slice(0, 3)
        : [],
    }));
    const plannerPrompt = `Actua como planificador semantico de consultas para Servicios Tecnicos CDM. Fecha actual: ${currentDate}.
Devuelve SOLO JSON con {"queries":[...]}. Cada query admite dataset, metrics, dimensions, filters, granularity, order_by, order_direction y limit.
Catalogo permitido: ${JSON.stringify(getPlannerCatalog())}
Reglas de planificacion: usa maximo 3 consultas y prefiere una. Para rankings agrega la dimension solicitada, orden descendente y limite. Para evoluciones agrega dimension periodo. Nunca inventes datasets, metricas, dimensiones o filtros. Respeta grano, unidad, clave estable y filtros obligatorios del catalogo. Una repregunta breve debe transformar el plan anterior, no cambiar de fuente sin motivo. Los filtros de pantalla solo aplican si el usuario habla del periodo visible, filtros actuales o seleccion actual.
Interpretacion semantica detectada: ${JSON.stringify(intentHint)}
Filtros explicitos detectados en la pregunta: ${JSON.stringify(explicitFilters)}
Planes validos de la respuesta anterior: ${JSON.stringify(contextualPriorPlans)}
Contexto de pantalla disponible: ${JSON.stringify(pageContext).slice(0, 2500)}
Conversacion reciente: ${JSON.stringify(compactHistory)}
Pregunta: ${question}`;
    const requestPlan = (prompt: string) => requestGroq(groqKey, primaryModel, fallbackModel, (model) => ({
      model,
      messages: [{ role: "system", content: prompt }],
      response_format: { type: "json_object" },
      max_tokens: 700,
      temperature: 0,
      ...(model.startsWith("openai/gpt-oss") ? { reasoning_effort: "low" } : {}),
    }), controller.signal);
    const canUseCompiledPlan = Boolean(compiled && compiled.confidence >= 0.84 && !requiresCompositePlanning(question));
    let plans: GenericQueryPlan[] = canUseCompiledPlan && compiled ? [compiled.plan] : [];

    if (!plans.length) {
      try {
        const planned = await requestPlan(plannerPrompt);
        usage = addUsage(usage, planned.payload.usage ?? {});
        const planObject = parseJsonObject(planned.payload.choices?.[0]?.message?.content);
        let validation = validateGenericPlan(planObject, question, pageContext, currentDate);
        plans = validation.plans;

        if (!plans.length && !intentHint) {
          const repairPrompt = `${plannerPrompt}
El primer plan fue rechazado por estas validaciones: ${JSON.stringify(validation.issues)}.
Corrige el plan y devuelve nuevamente SOLO {"queries":[...]}.`;
          const repaired = await requestPlan(repairPrompt);
          usage = addUsage(usage, repaired.payload.usage ?? {});
          validation = validateGenericPlan(
            parseJsonObject(repaired.payload.choices?.[0]?.message?.content),
            question,
            pageContext,
            currentDate,
          );
          plans = validation.plans;
        }
      } catch {
        // El proveedor solo ayuda a planificar. Si falla, el compilador local
        // sigue respondiendo las consultas que pudo reconocer con seguridad.
        if (compiled) plans = [compiled.plan];
      }
    }

    plans = enforceSemanticIntent(question, plans, explicitFilters);
    if (!plans.length && contextualPriorPlans.length) {
      const inherited = validateGenericPlans({ queries: contextualPriorPlans }, explicitFilters, 3);
      plans = inherited.plans;
    }
    if (!plans.length) {
      const fallback = compiled?.plan ?? buildIntentFallbackPlan(question, explicitFilters);
      if (fallback) plans = [fallback];
    }
    if (!plans.length) {
      return {
        content: "No pude determinar que fuente queres consultar. Indica si se trata de facturacion, ordenes de servicio, trabajos, jornadas, tecnicos, parque o agenda comercial.",
        sources: [{ tool: "semantic_clarification", label: "Definicion de consulta", filters: {} }],
        results: [],
        usage,
        model: "semantic-clarifier-v2",
      };
    }

    const results: ExecutedSemanticQuery[] = await Promise.all(plans.map(async (plan) => {
      const args: JsonRecord = { ...plan, filters: plan.filters, __question: question };
      const data = await queryBusinessData(client, args) as BusinessQueryResult;
      return { args: { ...plan, filters: data.filters ?? plan.filters }, data };
    }));
    const sources = results.map(({ args }) => ({ tool: "query_business_data", label: sourceLabel("query_business_data"), filters: args }));
    const deterministicContent = renderDeterministicAnswer({ question, results, mode: answerMode });
    if (deterministicContent) {
      return {
        content: deterministicContent,
        sources,
        results: results as unknown as Array<{ args: JsonRecord; data: JsonRecord }>,
        usage,
        model: "semantic-renderer-v2",
      };
    }
    const resultPayload = JSON.stringify(results).slice(0, 14000);
    const plannerCatalog = getPlannerCatalog() as JsonRecord;
    const datasetCatalog = plannerCatalog.datasets && typeof plannerCatalog.datasets === "object"
      ? plannerCatalog.datasets as JsonRecord
      : {};
    const appliedDefinitions = plans.map((plan) => ({
      dataset: plan.dataset,
      grain: (datasetCatalog[plan.dataset] as JsonRecord | undefined)?.grain,
      metrics: plan.metrics,
      dimensions: plan.dimensions,
    }));
    const answerPrompt = `Responde como analista de Servicios Tecnicos CDM usando EXCLUSIVAMENTE los resultados calculados. No menciones herramientas, planes ni JSON. No cambies la metrica ni la fuente pedida. Diferencia claramente facturacion, OS, trabajos y jornadas. Si es ranking, presenta los resultados en orden. Si el resultado es cero, dilo sin inventar. Incluye el periodo y los filtros efectivamente aplicados. Formato ${answerMode === "analytic" ? "analitico, con resumen, cifras, desglose compacto y una conclusion prudente" : "breve, directo y verificable"}. Importes en USD; cantidades, horas y kilometros no son importes.
Pregunta: ${question}
Definiciones aplicadas: ${JSON.stringify(appliedDefinitions)}
Resultados validados: ${resultPayload}`;
    const answered = await requestGroq(groqKey, fallbackModel, primaryModel, (model) => ({
      model,
      messages: [{ role: "system", content: answerPrompt }],
      max_tokens: Math.min(maxTokens, answerMode === "analytic" ? 1200 : 700),
      temperature: 0.1,
      ...(model.startsWith("openai/gpt-oss") ? { reasoning_effort: "low" } : {}),
    }), controller.signal);
    usage = addUsage(usage, answered.payload.usage ?? {});
    const content = cleanContent(answered.payload.choices?.[0]?.message?.content, 12000);
    return { content: content || "No se pudo redactar la respuesta con los resultados calculados.", sources, results, usage, model: answered.model };
  } finally {
    clearTimeout(timeout);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Metodo no permitido" }, 405);

  const startedAt = Date.now();
  let userId = "";
  let conversationId = "";
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const groqKey = Deno.env.get("GROQ_API_KEY");
    const configuredGroqModel = Deno.env.get("GROQ_PLANNER_MODEL") || Deno.env.get("GROQ_MODEL") || "llama-3.3-70b-versatile";
    const fallbackGroqModel = Deno.env.get("GROQ_WRITER_MODEL") || Deno.env.get("GROQ_FALLBACK_MODEL") || "llama-3.1-8b-instant";
    let activeGroqModel = configuredGroqModel;
    if (!supabaseUrl || !anonKey || !serviceKey) return json({ error: "Configuracion de Supabase incompleta" }, 500);
    if (!groqKey) return json({ error: "GROQ_API_KEY no esta configurada" }, 503);

    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const admin = createClient(supabaseUrl, serviceKey);
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) return json({ error: "No autenticado" }, 401);
    userId = user.id;

    const { data: profile } = await admin.from("profiles").select("id").or(`id.eq.${user.id},auth_user_id.eq.${user.id}`).maybeSingle();
    const roleIds = [user.id, profile?.id].filter(Boolean);
    const { data: roleRows } = await admin.from("user_roles").select("role").in("user_id", roleIds);
    if (!(roleRows ?? []).some((row: { role: string }) => row.role === "admin")) return json({ error: "Solo administradores" }, 403);

    const body = await req.json() as JsonRecord;
    const question = cleanText(body.message, 4000);
    const answerMode = body.mode === "analytic" ? "analytic" : "brief";
    const pageContext = typeof body.context === "object" && body.context ? body.context as JsonRecord : {};
    if (!question) return json({ error: "Escribe una pregunta" }, 400);

    const { data: settings } = await admin.from("app_configuracion").select("clave,valor_numero").in("clave", ["ai_daily_questions_limit", "ai_max_tool_calls", "ai_max_output_tokens", "ai_timeout_seconds"]);
    const config = Object.fromEntries((settings ?? []).map((row: any) => [row.clave, Number(row.valor_numero)]));
    const dailyLimit = config.ai_daily_questions_limit || 50;
    const maxToolCalls = Math.min(4, config.ai_max_tool_calls || 4);
    const maxTokens = Math.min(3000, config.ai_max_output_tokens || 1500);
    const timeoutMs = Math.min(120000, (config.ai_timeout_seconds || 60) * 1000);
    const dayStart = new Date();
    dayStart.setUTCHours(0, 0, 0, 0);
    const { count } = await admin.from("ai_usage").select("id", { count: "exact", head: true }).eq("user_id", userId).gte("created_at", dayStart.toISOString());
    if ((count ?? 0) >= dailyLimit) return json({ error: `Limite diario alcanzado (${dailyLimit})` }, 429);

    conversationId = cleanText(body.conversation_id, 80);
    if (conversationId) {
      const { data: owned } = await userClient.from("ai_conversations").select("id").eq("id", conversationId).maybeSingle();
      if (!owned) return json({ error: "Conversacion no encontrada" }, 404);
    } else {
      const title = question.length > 54 ? `${question.slice(0, 51)}...` : question;
      const { data: created, error } = await userClient.from("ai_conversations").insert({ user_id: userId, title }).select("id").single();
      if (error) throw error;
      conversationId = created.id;
    }

    const { error: messageError } = await userClient.from("ai_messages").insert({ conversation_id: conversationId, user_id: userId, role: "user", content: question, answer_mode: answerMode, page_context: pageContext });
    if (messageError) throw messageError;

    const { data: history } = await userClient.from("ai_messages").select("role,content,sources").eq("conversation_id", conversationId).order("created_at", { ascending: false }).limit(4);
    const contextText = Object.keys(pageContext).length ? JSON.stringify(pageContext) : "Sin contexto de pantalla";
    const currentDate = new Date().toISOString().slice(0, 10);
    const genericStartedAt = Date.now();
    const generic = await resolveGenericQuestion(
      admin,
      question,
      pageContext,
      currentDate,
      (history ?? []).reverse() as JsonRecord[],
      answerMode,
      groqKey,
      activeGroqModel,
      fallbackGroqModel,
      maxTokens,
      timeoutMs,
    );
    if (generic) {
      for (const item of generic.results) {
        await admin.from("ai_tool_runs").insert({
          conversation_id: conversationId,
          user_id: userId,
          tool_name: "query_business_data",
          filters: item.args,
          result_count: Number(item.data.result_rows) || 0,
          duration_ms: Date.now() - genericStartedAt,
          error: null,
        });
      }
      const { data: assistantMessage, error: assistantError } = await userClient
        .from("ai_messages")
        .insert({ conversation_id: conversationId, user_id: userId, role: "assistant", content: generic.content, answer_mode: answerMode, page_context: pageContext, sources: generic.sources })
        .select("id,created_at")
        .single();
      if (assistantError) throw assistantError;
      await userClient.from("ai_conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId);
      await admin.from("ai_usage").insert({
        conversation_id: conversationId,
        user_id: userId,
        model: generic.model,
        ...generic.usage,
        latency_ms: Date.now() - startedAt,
        status: "completed",
      });
      return json({ conversation_id: conversationId, message: { ...assistantMessage, role: "assistant", content: generic.content, sources: generic.sources }, usage: generic.usage });
    }
    if (Deno.env.get("AI_LEGACY_ASSISTANT_FALLBACK") !== "true") {
      return json({ error: "No se pudo interpretar la consulta con el motor semantico actual." }, 422);
    }
    const semanticStartedAt = Date.now();
    const semantic = await resolveSemanticQuestion(admin, question, pageContext, currentDate, (history ?? []) as JsonRecord[]);
    if (semantic) {
      const sources: ToolSource[] = [{ tool: semantic.tool, label: sourceLabel(semantic.tool), filters: semantic.args }];
      await admin.from("ai_tool_runs").insert({
        conversation_id: conversationId,
        user_id: userId,
        tool_name: semantic.tool,
        filters: semantic.args,
        result_count: semantic.resultCount,
        duration_ms: Date.now() - semanticStartedAt,
        error: null,
      });
      const { data: assistantMessage, error: assistantError } = await userClient
        .from("ai_messages")
        .insert({ conversation_id: conversationId, user_id: userId, role: "assistant", content: semantic.content, answer_mode: answerMode, page_context: pageContext, sources })
        .select("id,created_at")
        .single();
      if (assistantError) throw assistantError;
      await userClient.from("ai_conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId);
      await admin.from("ai_usage").insert({
        conversation_id: conversationId,
        user_id: userId,
        model: "semantic-router",
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
        latency_ms: Date.now() - startedAt,
        status: "completed",
      });
      return json({ conversation_id: conversationId, message: { ...assistantMessage, role: "assistant", content: semantic.content, sources }, usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 } });
    }
    const systemPrompt = `Eres el analista de datos de Servicios Tecnicos CDM. La fecha actual es ${currentDate}; interpreta periodos relativos desde esa fecha. Responde en espanol y limita tu alcance a los datos operativos y comerciales de la aplicacion. Nunca reveles seguridad, credenciales, secretos, autenticacion o permisos, y rechaza preguntas externas como clima o noticias. Solo puedes afirmar cifras obtenidas mediante herramientas; no inventes datos ni generes SQL. Tu herramienta principal es query_business_data: permite combinar datasets, metricas, dimensiones, filtros, rankings, comparaciones, evoluciones y detalles. Si dudas sobre campos disponibles, consulta get_data_catalog antes de responder. No digas "datos insuficientes" sin haber consultado primero el catalogo y el dataset apropiado. Aplica el contexto si es pertinente: ${contextText}. Modo: ${answerMode === "analytic" ? "analitico: resumen, cifras, desglose e interpretacion" : "breve: dato principal y conclusion corta"}. Indica siempre periodo, filtros y definicion usada. Los importes son USD. tipo_tiempo admite Cliente, Garantia o Interno. Reutiliza filtros y resultados de la conversacion para repreguntas y no repitas una consulta identica.`;
    const messages: any[] = [
      { role: "system", content: systemPrompt },
      ...(history ?? []).reverse().map((row: any) => ({
        role: row.role,
        content: row.role === "assistant" && Array.isArray(row.sources) && row.sources.length
          ? `${row.content}\n\nContexto de fuentes previo: ${JSON.stringify(row.sources)}`
          : row.content,
      })),
    ];

    const sources: ToolSource[] = [];
    const toolCache = new Map<string, unknown>();
    const sourceKeys = new Set<string>();
    let totalUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
    let finalContent = "";
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      for (let iteration = 0; iteration <= maxToolCalls; iteration++) {
        const forceFinalAnswer = iteration >= maxToolCalls;
        const requestBody = (model: string) => ({
          model,
          messages: providerSafeMessages(messages),
          ...(forceFinalAnswer ? {
            tool_choice: "none",
          } : {
            tools: modelTools,
            tool_choice: "auto",
            parallel_tool_calls: false,
          }),
          max_tokens: model === fallbackGroqModel ? Math.min(maxTokens, 500) : Math.min(maxTokens, 900),
          temperature: 0.2,
          ...(model.startsWith("openai/gpt-oss") ? { reasoning_effort: "low" } : {}),
        });
        let response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${groqKey}`, "Content-Type": "application/json" },
          body: JSON.stringify(requestBody(activeGroqModel)),
          signal: controller.signal,
        });
        let payload = await response.json().catch(() => ({}));
        if (response.status === 429 && activeGroqModel !== fallbackGroqModel) {
          activeGroqModel = fallbackGroqModel;
          response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: { Authorization: `Bearer ${groqKey}`, "Content-Type": "application/json" },
            body: JSON.stringify(requestBody(activeGroqModel)),
            signal: controller.signal,
          });
          payload = await response.json().catch(() => ({}));
        }
        if (!response.ok) {
          const message = payload?.error?.message ?? payload?.message ?? `Groq respondio ${response.status}`;
          throw new Error(response.status === 429 ? "Se alcanzo el limite gratuito de los modelos principal y de respaldo de Groq. Intenta nuevamente mas tarde." : message);
        }
        const usage = payload.usage ?? {};
        totalUsage = {
          prompt_tokens: totalUsage.prompt_tokens + (usage.prompt_tokens ?? 0),
          completion_tokens: totalUsage.completion_tokens + (usage.completion_tokens ?? 0),
          total_tokens: totalUsage.total_tokens + (usage.total_tokens ?? 0),
        };
        const message = payload.choices?.[0]?.message;
        if (!message) throw new Error("Groq no devolvio una respuesta valida");
        messages.push(message);
        const calls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
        if (!calls.length) {
          finalContent = cleanContent(message.content, 12000) || "No se pudo elaborar una respuesta con los datos disponibles.";
          break;
        }
        if (forceFinalAnswer) {
          finalContent = "No se pudo completar la respuesta con las fuentes consultadas.";
          break;
        }
        for (const call of calls.slice(0, maxToolCalls - sources.length)) {
          const toolStarted = Date.now();
          const name = cleanText(call.function?.name, 80);
          let args: JsonRecord = {};
          try { args = JSON.parse(call.function?.arguments || "{}"); } catch { args = {}; }
          args = normalizeToolArgs(name, args);
          if (name === "query_business_data") {
            const contextualFilters = semanticToolArgs(
              question,
              pageContext,
              currentDate,
              {},
              shouldApplyPageContext(question, pageContext),
            );
            const requestedFilters = args.filters && typeof args.filters === "object" ? args.filters as JsonRecord : {};
            args.filters = { ...contextualFilters, ...requestedFilters };
          }
          const cacheKey = `${name}:${JSON.stringify(args)}`;
          let toolResult: unknown;
          let toolError: string | null = null;
          if (toolCache.has(cacheKey)) {
            toolResult = toolCache.get(cacheKey);
          } else {
            try {
              const dataClient = name === "get_billing_summary" || name === "query_business_data" ? admin : userClient;
              toolResult = await executeTool(dataClient, name, args);
            } catch (error) {
              toolError = error instanceof Error ? error.message : String(error);
              toolResult = { error: toolError };
            }
            toolCache.set(cacheKey, toolResult);
            const resultCount = Array.isArray(toolResult) ? toolResult.length : 1;
            await admin.from("ai_tool_runs").insert({ conversation_id: conversationId, user_id: userId, tool_name: name, filters: args, result_count: resultCount, duration_ms: Date.now() - toolStarted, error: toolError });
          }
          if (!sourceKeys.has(cacheKey)) {
            sourceKeys.add(cacheKey);
            sources.push({ tool: name, label: sourceLabel(name), filters: args });
          }
          messages.push({ role: "tool", tool_call_id: call.id, name, content: JSON.stringify(toolResult).slice(0, 4000) });
        }
      }
    } finally {
      clearTimeout(timeout);
    }

    const normalizedQuestion = normalizedKey(question);
    const asksTopBillingBranch = normalizedQuestion.includes("SUCURSAL")
      && normalizedQuestion.includes("FACTUR")
      && (normalizedQuestion.includes(" MAS ") || normalizedQuestion.startsWith("QUE SUCURSAL"));
    if (asksTopBillingBranch) {
      const billingResult = [...toolCache.entries()]
        .filter(([key]) => key.startsWith("get_billing_summary:"))
        .map(([, value]) => value as JsonRecord)
        .find((value) => Array.isArray(value?.ranking_sucursales) && (value.ranking_sucursales as unknown[]).length > 0);
      const ranking = billingResult?.ranking_sucursales as Array<{ sucursal?: string; total_usd?: number }> | undefined;
      const leader = ranking?.[0];
      if (leader?.sucursal) {
        const source = sources.find((item) => item.tool === "get_billing_summary");
        const from = cleanText(source?.filters?.date_from, 10);
        const to = cleanText(source?.filters?.date_to, 10);
        const appliedRubro = cleanText(billingResult?.rubro_aplicado, 40) || "Todos";
        finalContent = `${leader.sucursal} fue la sucursal con mayor facturacion en ${appliedRubro}, con ${formatUsd(leader.total_usd)}. Periodo consultado: ${from || "sin fecha inicial"} al ${to || "sin fecha final"}.`;
      }
    }

    if (!finalContent) finalContent = "No se pudo obtener una respuesta final. Intenta acotar la consulta.";
    const { data: assistantMessage, error: assistantError } = await userClient.from("ai_messages").insert({ conversation_id: conversationId, user_id: userId, role: "assistant", content: finalContent, answer_mode: answerMode, page_context: pageContext, sources }).select("id,created_at").single();
    if (assistantError) throw assistantError;
    await userClient.from("ai_conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId);
    await admin.from("ai_usage").insert({ conversation_id: conversationId, user_id: userId, model: activeGroqModel, ...totalUsage, latency_ms: Date.now() - startedAt, status: "completed" });

    return json({ conversation_id: conversationId, message: { ...assistantMessage, role: "assistant", content: finalContent, sources }, usage: totalUsage });
  } catch (error) {
    const message = error instanceof DOMException && error.name === "AbortError" ? "La consulta supero el tiempo limite" : error instanceof Error ? error.message : String(error);
    if (userId) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const admin = createClient(supabaseUrl, serviceKey);
      await admin.from("ai_usage").insert({ conversation_id: conversationId || null, user_id: userId, model: Deno.env.get("GROQ_MODEL") || "openai/gpt-oss-20b", latency_ms: Date.now() - startedAt, status: "error" });
    }
    return json({ error: message }, /limite gratuito/i.test(message) ? 429 : /tiempo limite/i.test(message) ? 408 : 500);
  }
});
