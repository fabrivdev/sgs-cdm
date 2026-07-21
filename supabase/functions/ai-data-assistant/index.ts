import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

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

  let jornadasQuery = client
    .from("servicio_jornadas")
    .select("id,servicio_id,fecha,estado,horas_trabajadas,tecnico_responsable_id,auxiliares")
    .limit(1000);
  jornadasQuery = dateFilter(jornadasQuery, "fecha", args);

  const [jobs, jornadas] = await Promise.all([
    checked<JsonRecord[]>(jobsQuery),
    checked<JsonRecord[]>(jornadasQuery),
  ]);

  return {
    trabajos: { total: jobs.length, por_estado: countBy(jobs, "estado_general"), por_sucursal: countBy(jobs, "sucursal") },
    jornadas: {
      total: jornadas.length,
      por_estado: countBy(jornadas, "estado"),
      horas: sum(jornadas, "horas_trabajadas"),
    },
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
  const [importedRows, historicalRows, clientRows] = await Promise.all([
    fetchPaged((from, to) => {
      let query = client
        .from("facturacion_lineas_importadas")
        .select("factura,codigo_interno_factura,fecha_factura,entidad_nombre,sucursal,marca_normalizada,subgrupo_original,grupo_normalizado,tipo_facturacion,tipo_tiempo,total_venta,origen_sistema")
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
        .select("fecha,sucursal,tipo,cliente_id,entidad_nombre,total_venta,grupo,grupo_fx,cod_factura")
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
    total_venta: Number(row.total_venta) || 0,
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
        total_venta: Number(row.total_venta) || 0,
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
  const invoices = new Set(rows.map((row) => cleanText(row.factura, 80)).filter(Boolean));
  const clients = new Set(rows.map((row) => normalizedBillingClient(row.entidad_nombre)).filter(Boolean));
  const byRubro: Record<string, number> = {};
  const bySucursal: Record<string, number> = {};
  const byCliente = new Map<string, { cliente: string; totalUsd: number; facturas: Set<string> }>();
  for (const row of rows) {
    const value = Number(row.total_venta) || 0;
    const group = cleanText(row.rubro, 80) || "Otros";
    const branch = cleanText(row.sucursal, 60) || "Sin sucursal";
    const clientName = cleanText(row.entidad_nombre, 160) || "Sin cliente";
    const clientKey = normalizedBillingClient(clientName);
    byRubro[group] = (byRubro[group] ?? 0) + value;
    bySucursal[branch] = (bySucursal[branch] ?? 0) + value;
    const clientEntry = byCliente.get(clientKey) ?? { cliente: clientName, totalUsd: 0, facturas: new Set<string>() };
    clientEntry.totalUsd += value;
    const invoice = cleanText(row.factura, 80);
    if (invoice) clientEntry.facturas.add(invoice);
    byCliente.set(clientKey, clientEntry);
  }
  const rankingSucursales = Object.entries(bySucursal)
    .map(([sucursalNombre, total]) => ({ sucursal: sucursalNombre, total_usd: total }))
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
  };
}

async function getServiceOrdersSummary(client: SupabaseClient, args: JsonRecord) {
  const marca = cleanText(args.marca, 30);
  const tipo = cleanText(args.tipo_tiempo, 40);
  const rows = await fetchPaged((from, to) => {
    let query = client
      .from("ordenes_servicio_importadas")
      .select("os_numero,sucursal,cliente_nombre,fecha_abierta_os,fecha_emision_factura,factura,responsable,marca,tipo_tiempo,servicios_cantidad,servicios_valor,km_cantidad,kilometro_valor,repuesto_valor,terceros_valor,situacion_os,situacion_facturacion,trabajo_id,raw_data")
      .order("fecha_abierta_os")
      .range(from, to);
    query = dateFilter(query, "fecha_abierta_os", args);
    if (marca && marca.toLowerCase() !== "todos") query = query.ilike("marca", `%${marca}%`);
    if (tipo && tipo.toLowerCase() !== "todos") query = query.ilike("tipo_tiempo", `%${tipo}%`);
    return query;
  }, 30000);
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
  }>();
  const technicianAlias: Record<string, string> = {
    "DENNIS BENITEZ": "DENIS DE LA CRUZ BENITEZ ARAUJO",
  };
  const normalizeTechnician = (value: unknown) => {
    const normalized = String(value ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase()
      .replace(/^(?:[A-Z]{1,6}[\s-]*)?\d{2,}\s*(?:[-:|/]\s*)?/, "")
      .replace(/[^A-Z0-9]+/g, " ")
      .trim()
      .replace(/\s+/g, " ");
    return technicianAlias[normalized] ?? normalized;
  };
  const participantsFor = (row: JsonRecord) => {
    const values: unknown[] = [row.responsable];
    const raw = row.raw_data && typeof row.raw_data === "object" ? row.raw_data as JsonRecord : {};
    const explicit = raw.tecnicos_participantes;
    if (Array.isArray(explicit)) values.push(...explicit);
    for (const [key, value] of Object.entries(raw)) {
      const normalizedKey = key.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      if (normalizedKey === "responsable" || /^mec aux [1-6]$/.test(normalizedKey)) values.push(value);
    }
    return [...new Set(values.map(normalizeTechnician).filter(Boolean))];
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
    for (const technician of participantsFor(row)) {
      const entry = technicians.get(technician) ?? {
        tecnico: technician,
        ordenes: new Set<string>(),
        abiertas: new Set<string>(),
        cerradas: new Set<string>(),
        otras: new Set<string>(),
      };
      entry.ordenes.add(order);
      entry[state].add(order);
      technicians.set(technician, entry);
    }
  }
  const rankingTechnicians = [...technicians.values()]
    .map((row) => ({
      tecnico: row.tecnico,
      ordenes: row.ordenes.size,
      abiertas: row.abiertas.size,
      cerradas: row.cerradas.size,
      otras: row.otras.size,
    }))
    .sort((a, b) => b.abiertas - a.abiertas || b.ordenes - a.ordenes || a.tecnico.localeCompare(b.tecnico))
    .slice(0, 50);
  return {
    ordenes: orders.size,
    filas: rows.length,
    por_estado: countBy(rows, "situacion_os"),
    por_tipo_tiempo: countBy(rows, "tipo_tiempo"),
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
  };
}

async function getParkSummary(client: SupabaseClient, args: JsonRecord) {
  let query = client
    .from("parque_maquinas")
    .select("id,cliente_id,marca,subgrupo,sucursal,modelo_tipo,anio,activo")
    .eq("activo", true)
    .limit(1000);
  query = commonFilters(query, args);
  const rows = await checked<JsonRecord[]>(query);
  const clients = new Set(rows.map((row) => cleanText(row.cliente_id, 80)).filter(Boolean));
  return { maquinas_activas: rows.length, clientes: clients.size, por_marca: countBy(rows, "marca"), por_sucursal: countBy(rows, "sucursal"), por_subgrupo: countBy(rows, "subgrupo") };
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
  return { gestiones: rows.length, clientes_unicos: clients.size, por_resultado: countBy(rows, "resultado"), recientes: rows.slice(0, 30) };
}

async function getTechnicianSummary(client: SupabaseClient, args: JsonRecord) {
  let profilesQuery = client.from("profiles").select("id,nombre,sucursal,activo").order("nombre").limit(500);
  const sucursal = cleanText(args.sucursal, 40);
  if (sucursal && sucursal.toLowerCase() !== "todos") profilesQuery = profilesQuery.eq("sucursal", sucursal);
  const [profiles, roles] = await Promise.all([
    checked<JsonRecord[]>(profilesQuery),
    checked<JsonRecord[]>(client.from("user_roles").select("user_id,role").eq("role", "tecnico").limit(500)),
  ]);
  const technicianIds = new Set(roles.map((row) => String(row.user_id)));
  const technicians = profiles.filter((row) => technicianIds.has(String(row.id)) && row.activo !== false);
  let jornadasQuery = client.from("servicio_jornadas").select("fecha,estado,horas_trabajadas,tecnico_responsable_id,auxiliares").limit(1000);
  jornadasQuery = dateFilter(jornadasQuery, "fecha", args);
  const jornadas = await checked<JsonRecord[]>(jornadasQuery);
  const activity: Record<string, { jornadas: number; horas: number }> = {};
  for (const row of jornadas) {
    const crew = [row.tecnico_responsable_id, ...(Array.isArray(row.auxiliares) ? row.auxiliares : [])].filter(Boolean).map(String);
    for (const id of new Set(crew)) {
      activity[id] ??= { jornadas: 0, horas: 0 };
      activity[id].jornadas += 1;
      activity[id].horas += Number(row.horas_trabajadas) || 0;
    }
  }
  return {
    tecnicos_activos: technicians.length,
    con_actividad: technicians.filter((row) => activity[String(row.id)]?.jornadas).length,
    detalle: technicians.map((row) => ({ ...row, ...(activity[String(row.id)] ?? { jornadas: 0, horas: 0 }) })).slice(0, 100),
  };
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

const toolSpecs = [
  ["get_operational_summary", "Resume trabajos y jornadas del periodo."],
  ["get_planning_summary", "Resume jornadas pendientes y tecnicos planificados."],
  ["get_calendar_summary", "Resume calendario y no disponibilidades."],
  ["get_billing_summary", "Resume facturacion importada en USD y devuelve rankings por sucursal, rubro y cliente unico. Usala tambien para responder repreguntas sobre el cliente que mas facturo. Los rubros validos son Servicio, Repuestos, Kilometraje y Otros."],
  ["get_service_orders_summary", "Resume ordenes de servicio, horas, km y valores. Incluye ranking de tecnicos participantes por OS unicas abiertas, cerradas y anuladas; usala para preguntas sobre quien tiene mas OS."],
  ["get_park_summary", "Resume parque activo de maquinas y clientes."],
  ["get_commercial_followup", "Resume gestiones de agenda comercial."],
  ["get_technician_summary", "Resume tecnicos activos y su actividad."],
] as const;

const filterProperties = {
  date_from: { type: "string", description: "Fecha inicial YYYY-MM-DD" },
  date_to: { type: "string", description: "Fecha final YYYY-MM-DD" },
  sucursal: { type: "string" },
  sucursales: { type: "array", items: { type: "string" }, maxItems: 6, description: "Varias sucursales para comparar o combinar en una sola consulta" },
  marca: { type: "string" },
  tipo_tiempo: { type: "string", description: "Tipo comercial: Cliente, Garantia, Interno o Todos. No usar para dia, semana, mes o anio." },
  rubro: { type: "string", description: "Rubro canonico: Servicio, Repuestos, Kilometraje, Otros o Todos" },
};

const tools = [
  ...toolSpecs.map(([name, description]) => ({
    type: "function",
    function: { name, description, parameters: { type: "object", properties: filterProperties, additionalProperties: false } },
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

async function executeTool(client: SupabaseClient, name: string, args: JsonRecord) {
  switch (name) {
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

function semanticToolArgs(question: string, pageContext: JsonRecord, currentDate: string, inherited: JsonRecord = {}) {
  const filters = pageContext.filters && typeof pageContext.filters === "object"
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

  const monthNames: Record<string, number> = {
    ENERO: 1, FEBRERO: 2, MARZO: 3, ABRIL: 4, MAYO: 5, JUNIO: 6,
    JULIO: 7, AGOSTO: 8, SEPTIEMBRE: 9, SETIEMBRE: 9, OCTUBRE: 10, NOVIEMBRE: 11, DICIEMBRE: 12,
  };
  const monthEntry = Object.entries(monthNames).find(([name]) => normalized.includes(name));
  if (monthEntry) {
    const explicitYear = normalized.match(/\b(20\d{2})\b/)?.[1];
    const year = Number(explicitYear ?? currentDate.slice(0, 4));
    const month = monthEntry[1];
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    args.date_from = `${year}-${String(month).padStart(2, "0")}-01`;
    args.date_to = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  }
  return args;
}

type SemanticResponse = { tool: string; args: JsonRecord; content: string; resultCount: number };

async function resolveSemanticQuestion(
  client: SupabaseClient,
  question: string,
  pageContext: JsonRecord,
  currentDate: string,
  history: JsonRecord[] = [],
): Promise<SemanticResponse | null> {
  const normalized = normalizedKey(question);
  const moduleName = normalizedKey(pageContext.module);
  const previousBillingSource = history
    .filter((row) => row.role === "assistant" && Array.isArray(row.sources))
    .flatMap((row) => row.sources as JsonRecord[])
    .find((source) => source.tool === "get_billing_summary");
  const inheritedBillingFilters = previousBillingSource?.filters && typeof previousBillingSource.filters === "object"
    ? previousBillingSource.filters as JsonRecord
    : {};
  const args = semanticToolArgs(question, pageContext, currentDate, inheritedBillingFilters);
  const asksCount = normalized.includes("CUANT") || normalized.includes("TOTAL");
  const asksTop = normalized.includes(" MAS ") || normalized.startsWith("QUE ") || normalized.includes("MAYOR");
  const asksBilling = normalized.includes("FACTUR") || normalized.includes("VENTA");
  const asksOrders = /(^|\s)OS($|\s)/.test(normalized) || normalized.includes("ORDEN DE SERVICIO") || normalized.includes("ORDENES DE SERVICIO");
  const asksTechnician = normalized.includes("TECNIC");
  const asksClients = normalized.includes("CLIENT");
  const asksBranch = normalized.includes("SUCURSAL");
  const topMatch = normalized.match(/\bTOP\s*(\d{1,2})\b/);
  const topN = Math.min(25, Math.max(1, Number(topMatch?.[1]) || 1));
  const asksClientRanking = asksClients && (Boolean(topMatch) || asksTop);
  const asksNext = normalized.includes("QUIEN LE SIGUE") || normalized.includes("CUAL LE SIGUE") || normalized.includes("SIGUIENTE");

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
    const groqModel = Deno.env.get("GROQ_MODEL") || "llama-3.3-70b-versatile";
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

    const { data: history } = await userClient.from("ai_messages").select("role,content,sources").eq("conversation_id", conversationId).order("created_at", { ascending: false }).limit(12);
    const contextText = Object.keys(pageContext).length ? JSON.stringify(pageContext) : "Sin contexto de pantalla";
    const currentDate = new Date().toISOString().slice(0, 10);
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
    const systemPrompt = `Eres el asistente de datos de Servicios Tecnicos CDM. La fecha actual del sistema es ${currentDate}; interpreta "corriente", "actual", "hoy" y otros periodos relativos a partir de esa fecha. Responde en espanol. Solo puedes afirmar cifras obtenidas mediante herramientas. No inventes datos, no generes SQL y nunca solicites secretos. Aplica el contexto si es pertinente: ${contextText}. Modo de respuesta: ${answerMode === "analytic" ? "analitico: resumen, cifras, desglose e interpretacion" : "breve: dato principal y conclusion corta"}. Indica periodo y filtros usados. Si faltan datos, dilo claramente. Los importes son USD. tipo_tiempo solo admite Cliente, Garantia o Interno; nunca coloques alli dia, semana, mes o anio. Reutiliza los resultados y rankings ya devueltos en la conversacion; no repitas una herramienta con los mismos filtros para responder una repregunta.`;
    const messages: any[] = [
      { role: "system", content: systemPrompt },
      ...(history ?? []).reverse().map((row: any) => ({ role: row.role, content: row.content })),
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
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${groqKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model: groqModel, messages, tools, tool_choice: "auto", max_tokens: maxTokens, temperature: 0.2 }),
          signal: controller.signal,
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          const message = payload?.error?.message ?? payload?.message ?? `Groq respondio ${response.status}`;
          throw new Error(response.status === 429 ? "Se alcanzo el limite gratuito de Groq. Intenta nuevamente mas tarde." : message);
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
        if (sources.length >= maxToolCalls) throw new Error("La consulta requiere demasiadas operaciones; acota la pregunta");
        if (iteration >= maxToolCalls) throw new Error("La consulta requiere demasiadas operaciones; acota la pregunta");
        for (const call of calls.slice(0, maxToolCalls - sources.length)) {
          const toolStarted = Date.now();
          const name = cleanText(call.function?.name, 80);
          let args: JsonRecord = {};
          try { args = JSON.parse(call.function?.arguments || "{}"); } catch { args = {}; }
          const cacheKey = `${name}:${JSON.stringify(args)}`;
          let toolResult: unknown;
          let toolError: string | null = null;
          if (toolCache.has(cacheKey)) {
            toolResult = toolCache.get(cacheKey);
          } else {
            try {
              const dataClient = name === "get_billing_summary" ? admin : userClient;
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
          messages.push({ role: "tool", tool_call_id: call.id, name, content: JSON.stringify(toolResult).slice(0, 50000) });
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
    await admin.from("ai_usage").insert({ conversation_id: conversationId, user_id: userId, model: groqModel, ...totalUsage, latency_ms: Date.now() - startedAt, status: "completed" });

    return json({ conversation_id: conversationId, message: { ...assistantMessage, role: "assistant", content: finalContent, sources }, usage: totalUsage });
  } catch (error) {
    const message = error instanceof DOMException && error.name === "AbortError" ? "La consulta supero el tiempo limite" : error instanceof Error ? error.message : String(error);
    if (userId) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const admin = createClient(supabaseUrl, serviceKey);
      await admin.from("ai_usage").insert({ conversation_id: conversationId || null, user_id: userId, model: Deno.env.get("GROQ_MODEL") || "llama-3.3-70b-versatile", latency_ms: Date.now() - startedAt, status: "error" });
    }
    return json({ error: message }, /limite gratuito/i.test(message) ? 429 : /tiempo limite/i.test(message) ? 408 : 500);
  }
});
