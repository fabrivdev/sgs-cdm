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

async function getBillingSummary(client: SupabaseClient, args: JsonRecord) {
  const sucursal = cleanText(args.sucursal, 40);
  const marca = cleanText(args.marca, 30);
  const tipo = cleanText(args.tipo_tiempo, 40);
  const rubro = cleanText(args.rubro, 60);
  const rows = await fetchPaged((from, to) => {
    let query = client
      .from("facturacion_lineas_importadas")
      .select("factura,fecha_factura,entidad_nombre,sucursal,marca_normalizada,grupo_normalizado,tipo_tiempo,total_venta,cantidad,mercaderia")
      .order("fecha_factura")
      .range(from, to);
    query = dateFilter(query, "fecha_factura", args);
    if (sucursal && sucursal.toLowerCase() !== "todos") query = query.eq("sucursal", sucursal);
    if (marca && marca.toLowerCase() !== "todos") query = query.eq("marca_normalizada", marca);
    if (tipo && tipo.toLowerCase() !== "todos") query = query.ilike("tipo_tiempo", `%${tipo}%`);
    if (rubro && rubro.toLowerCase() !== "todos") query = query.ilike("grupo_normalizado", `%${rubro}%`);
    return query;
  }, 50000);
  const invoices = new Set(rows.map((row) => cleanText(row.factura, 80)).filter(Boolean));
  const clients = new Set(rows.map((row) => cleanText(row.entidad_nombre, 160).toUpperCase()).filter(Boolean));
  const byRubro: Record<string, number> = {};
  const bySucursal: Record<string, number> = {};
  for (const row of rows) {
    const value = Number(row.total_venta) || 0;
    const group = cleanText(row.grupo_normalizado, 80) || "Otros";
    const branch = cleanText(row.sucursal, 60) || "Sin sucursal";
    byRubro[group] = (byRubro[group] ?? 0) + value;
    bySucursal[branch] = (bySucursal[branch] ?? 0) + value;
  }
  return { total_usd: sum(rows, "total_venta"), facturas: invoices.size, clientes: clients.size, por_rubro: byRubro, por_sucursal: bySucursal };
}

async function getServiceOrdersSummary(client: SupabaseClient, args: JsonRecord) {
  const marca = cleanText(args.marca, 30);
  const tipo = cleanText(args.tipo_tiempo, 40);
  const rows = await fetchPaged((from, to) => {
    let query = client
      .from("ordenes_servicio_importadas")
      .select("os_numero,cliente_nombre,fecha_abierta_os,fecha_emision_factura,factura,responsable,marca,tipo_tiempo,servicios_cantidad,servicios_valor,km_cantidad,kilometro_valor,repuesto_valor,terceros_valor,situacion_os,situacion_facturacion,trabajo_id")
      .order("fecha_abierta_os")
      .range(from, to);
    query = dateFilter(query, "fecha_abierta_os", args);
    if (marca && marca.toLowerCase() !== "todos") query = query.ilike("marca", `%${marca}%`);
    if (tipo && tipo.toLowerCase() !== "todos") query = query.ilike("tipo_tiempo", `%${tipo}%`);
    return query;
  }, 30000);
  const orders = new Set(rows.map((row) => cleanText(row.os_numero, 80)).filter(Boolean));
  return {
    ordenes: orders.size,
    filas: rows.length,
    por_estado: countBy(rows, "situacion_os"),
    por_tipo_tiempo: countBy(rows, "tipo_tiempo"),
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
  ["get_billing_summary", "Resume facturacion importada en USD."],
  ["get_service_orders_summary", "Resume ordenes de servicio, horas, km y valores."],
  ["get_park_summary", "Resume parque activo de maquinas y clientes."],
  ["get_commercial_followup", "Resume gestiones de agenda comercial."],
  ["get_technician_summary", "Resume tecnicos activos y su actividad."],
] as const;

const filterProperties = {
  date_from: { type: "string", description: "Fecha inicial YYYY-MM-DD" },
  date_to: { type: "string", description: "Fecha final YYYY-MM-DD" },
  sucursal: { type: "string" },
  marca: { type: "string" },
  tipo_tiempo: { type: "string" },
  rubro: { type: "string" },
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

    const { data: history } = await userClient.from("ai_messages").select("role,content").eq("conversation_id", conversationId).order("created_at", { ascending: false }).limit(12);
    const contextText = Object.keys(pageContext).length ? JSON.stringify(pageContext) : "Sin contexto de pantalla";
    const systemPrompt = `Eres el asistente de datos de Servicios Tecnicos CDM. Responde en espanol. Solo puedes afirmar cifras obtenidas mediante herramientas. No inventes datos, no generes SQL y nunca solicites secretos. Aplica el contexto si es pertinente: ${contextText}. Modo de respuesta: ${answerMode === "analytic" ? "analitico: resumen, cifras, desglose e interpretacion" : "breve: dato principal y conclusion corta"}. Indica periodo y filtros usados. Si faltan datos, dilo claramente. Los importes son USD.`;
    const messages: any[] = [
      { role: "system", content: systemPrompt },
      ...(history ?? []).reverse().map((row: any) => ({ role: row.role, content: row.content })),
    ];

    const sources: ToolSource[] = [];
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
          let toolResult: unknown;
          let toolError: string | null = null;
          try {
            toolResult = await executeTool(userClient, name, args);
          } catch (error) {
            toolError = error instanceof Error ? error.message : String(error);
            toolResult = { error: toolError };
          }
          const resultCount = Array.isArray(toolResult) ? toolResult.length : 1;
          await admin.from("ai_tool_runs").insert({ conversation_id: conversationId, user_id: userId, tool_name: name, filters: args, result_count: resultCount, duration_ms: Date.now() - toolStarted, error: toolError });
          sources.push({ tool: name, label: sourceLabel(name), filters: args });
          messages.push({ role: "tool", tool_call_id: call.id, name, content: JSON.stringify(toolResult).slice(0, 50000) });
        }
      }
    } finally {
      clearTimeout(timeout);
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
