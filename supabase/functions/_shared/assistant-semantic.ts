export type SemanticRecord = Record<string, unknown>;

export type SemanticUnit = "count" | "usd" | "hours" | "km" | "ratio";
export type SemanticAggregation = "count" | "count_distinct" | "sum" | "average";
export type QueryGranularity = "day" | "week" | "month" | "year";

export type MetricDefinition = {
  label: string;
  description: string;
  unit: SemanticUnit;
  aggregation: SemanticAggregation;
  distinctBy?: string;
  requiredFilters?: SemanticRecord;
};

export type DimensionDefinition = {
  label: string;
  description: string;
  source: string;
  aliases?: readonly string[];
};

export type DatasetDefinition = {
  label: string;
  description: string;
  source: string;
  grain: string;
  canonicalDate: string | null;
  stableKey: string;
  aliases: readonly string[];
  metrics: Record<string, MetricDefinition>;
  dimensions: Record<string, DimensionDefinition>;
};

export const semanticCatalog = {
  facturacion: {
    label: "Facturacion",
    description: "Facturacion historica y del sistema nuevo unificada, sin duplicar lineas ya reemplazadas por el detalle nuevo.",
    source: "facturacion + facturacion_lineas_importadas",
    grain: "Una linea facturada por concepto.",
    canonicalDate: "fecha de factura",
    stableKey: "origen + sucursal + fecha + numero de factura",
    aliases: ["facturacion", "facturas", "ventas", "importe facturado"],
    metrics: {
      total_usd: { label: "Facturacion USD", description: "Suma del valor vendido con IVA ya normalizado por la importacion.", unit: "usd", aggregation: "sum" },
      facturas: { label: "Facturas", description: "Documentos de factura unicos, no lineas.", unit: "count", aggregation: "count_distinct", distinctBy: "origen + sucursal + fecha + factura" },
      clientes: { label: "Clientes facturados", description: "Clientes unicos por nombre normalizado entre las fuentes historica y nueva.", unit: "count", aggregation: "count_distinct", distinctBy: "cliente normalizado" },
      lineas: { label: "Lineas", description: "Cantidad de lineas o conceptos facturados.", unit: "count", aggregation: "count" },
      ticket_promedio: { label: "Ticket promedio", description: "Facturacion total dividida por facturas unicas.", unit: "usd", aggregation: "average" },
      horas: { label: "Horas facturadas", description: "Cantidad facturada exclusivamente en conceptos de Servicio.", unit: "hours", aggregation: "sum", requiredFilters: { rubro: "Servicio" } },
      km: { label: "Kilometros facturados", description: "Cantidad facturada exclusivamente en conceptos de Kilometraje.", unit: "km", aggregation: "sum", requiredFilters: { rubro: "Kilometraje" } },
      cantidad: { label: "Cantidad facturada", description: "Cantidad unitaria de las lineas despues de aplicar el rubro solicitado.", unit: "count", aggregation: "sum" },
    },
    dimensions: {
      periodo: { label: "Periodo", description: "Fecha agrupada por dia, semana, mes o anio.", source: "fecha" },
      fecha: { label: "Fecha", description: "Fecha de emision de la factura.", source: "fecha" },
      sucursal: { label: "Sucursal", description: "Sucursal que emitio la factura.", source: "sucursal" },
      cliente: { label: "Cliente", description: "Entidad facturada, normalizada para evitar duplicados por razon social.", source: "entidad_nombre" },
      marca: { label: "Marca", description: "Marca derivada del maestro de productos o de la OS vinculada.", source: "marca" },
      rubro: { label: "Rubro", description: "Servicio, Repuestos, Kilometraje u Otros.", source: "rubro" },
      tipo_tiempo: { label: "Tipo de tiempo", description: "Cliente, Garantia o Interno.", source: "tipo_tiempo" },
      factura: { label: "Factura", description: "Numero corto del documento cuando esta disponible.", source: "factura" },
      codigo_producto: { label: "Codigo de producto", description: "Codigo de fabricante cuando existe; en su defecto codigo interno de mercaderia.", source: "codigo_producto" },
      concepto: { label: "Producto o concepto", description: "Descripcion de mercaderia o concepto facturado.", source: "concepto" },
      observacion: { label: "Observacion", description: "Observacion textual de la linea facturada.", source: "observacion" },
      origen: { label: "Origen", description: "Fuente historica o importada.", source: "origen" },
    },
  },
  ordenes_servicio: {
    label: "Ordenes de servicio",
    description: "Ordenes de servicio importadas, sus participantes, estados, cantidades y valores.",
    source: "ordenes_servicio_importadas",
    grain: "Una OS por sucursal y tipo de tiempo; una misma OS puede aportar una fila por cada tipo de tiempo.",
    canonicalDate: "fecha de apertura de la OS",
    stableKey: "sucursal + numero de OS + tipo de tiempo",
    aliases: ["os", "ordenes de servicio", "servicios", "productividad", "produccion tecnica"],
    metrics: {
      ordenes: { label: "Ordenes", description: "OS unicas por sucursal, numero y tipo de tiempo.", unit: "count", aggregation: "count_distinct", distinctBy: "sucursal + OS + tipo de tiempo" },
      horas: { label: "Horas OS", description: "Horas registradas en las OS. Por tecnico se atribuyen a todos los participantes y no deben sumarse entre tecnicos para obtener el total global.", unit: "hours", aggregation: "sum" },
      km: { label: "Kilometros OS", description: "Kilometros registrados en las OS.", unit: "km", aggregation: "sum" },
      total_usd: { label: "Total OS", description: "Servicio + kilometraje + repuestos + terceros.", unit: "usd", aggregation: "sum" },
      servicio_usd: { label: "Servicio OS", description: "Valor de servicio de las OS.", unit: "usd", aggregation: "sum" },
      kilometraje_usd: { label: "Kilometraje OS", description: "Valor de kilometraje de las OS.", unit: "usd", aggregation: "sum" },
      repuestos_usd: { label: "Repuestos OS", description: "Valor de repuestos de las OS.", unit: "usd", aggregation: "sum" },
      terceros_usd: { label: "Terceros OS", description: "Valor de terceros de las OS.", unit: "usd", aggregation: "sum" },
    },
    dimensions: {
      periodo: { label: "Periodo", description: "Apertura agrupada por dia, semana, mes o anio.", source: "fecha_abierta_os" },
      fecha: { label: "Fecha", description: "Fecha de apertura de la OS.", source: "fecha_abierta_os" },
      sucursal: { label: "Sucursal", description: "Sucursal derivada del trabajo vinculado, origen importado, prefijo de OS o cliente.", source: "campo logico derivado; no es una columna fisica de la OS" },
      cliente: { label: "Cliente", description: "Cliente de la OS.", source: "cliente_nombre" },
      marca: { label: "Marca", description: "Marca de la maquina o producto asociado.", source: "marca" },
      tipo_tiempo: { label: "Tipo de tiempo", description: "Cliente, Garantia o Interno.", source: "tipo_tiempo" },
      estado: { label: "Estado", description: "Abierta, Cerrada o Anulada despues de normalizar variantes.", source: "situacion_os" },
      factura: { label: "Factura", description: "Documento vinculado a la OS.", source: "factura" },
      os: { label: "OS", description: "Numero de orden de servicio con prefijo de sucursal.", source: "os_numero" },
      problema: { label: "Problema o trabajo", description: "Problema, producto o trabajo registrado en la orden de servicio.", source: "problema" },
      tecnico: { label: "Tecnico", description: "Responsable o auxiliar participante, asociado al perfil cuando existe coincidencia segura.", source: "participante" },
      activo: { label: "Situacion del tecnico", description: "Activo o Inactivo segun el perfil actual. El historial del inactivo se conserva.", source: "participante_activo" },
    },
  },
  trabajos: {
    label: "Trabajos",
    description: "Casos macro creados en la aplicacion; no son equivalentes a las OS importadas.",
    source: "trabajos",
    grain: "Un caso macro por trabajo.",
    canonicalDate: "fecha de creacion del trabajo",
    stableKey: "trabajo.id",
    aliases: ["trabajos", "casos", "tr"],
    metrics: {
      trabajos: { label: "Trabajos", description: "Trabajos unicos por id.", unit: "count", aggregation: "count_distinct", distinctBy: "trabajo.id" },
    },
    dimensions: {
      periodo: { label: "Periodo", description: "Creacion agrupada por dia, semana, mes o anio.", source: "creado_en" },
      fecha: { label: "Fecha", description: "Fecha de creacion del trabajo.", source: "creado_en" },
      sucursal: { label: "Sucursal", description: "Sucursal del trabajo.", source: "sucursal" },
      marca: { label: "Marca", description: "Marca del trabajo.", source: "marca" },
      estado: { label: "Estado", description: "Estado macro calculado del trabajo.", source: "estado_general" },
      trabajo: { label: "Trabajo", description: "OS interna cuando existe o codigo TR.", source: "os_numero o codigo" },
      cliente: { label: "Cliente", description: "Nombre del cliente asociado al trabajo; el id se conserva como clave estable.", source: "clientes.nombre" },
    },
  },
  jornadas: {
    label: "Jornadas",
    description: "Fechas operativas planificadas para los trabajos con resultado y horas registradas.",
    source: "servicio_jornadas",
    grain: "Una fecha operativa de un trabajo.",
    canonicalDate: "fecha de jornada",
    stableKey: "jornada.id",
    aliases: ["jornadas", "fechas de trabajo", "planificacion", "calendario"],
    metrics: {
      jornadas: { label: "Jornadas", description: "Cantidad de fechas operativas.", unit: "count", aggregation: "count" },
      horas: { label: "Horas de jornadas", description: "Horas cerradas en las jornadas de la app, no horas de OS ni facturadas.", unit: "hours", aggregation: "sum" },
    },
    dimensions: {
      periodo: { label: "Periodo", description: "Jornada agrupada por dia, semana, mes o anio.", source: "fecha" },
      fecha: { label: "Fecha", description: "Fecha de la jornada.", source: "fecha" },
      sucursal: { label: "Sucursal", description: "Sucursal del servicio del trabajo.", source: "servicios.sucursal" },
      cliente: { label: "Cliente", description: "Nombre del cliente del servicio del trabajo.", source: "servicios.clientes.nombre" },
      marca: { label: "Marca", description: "Marca del servicio del trabajo.", source: "servicios.marca" },
      estado: { label: "Estado", description: "Pendiente, Completado o Cancelada.", source: "estado" },
      tecnico: { label: "Tecnico", description: "Tecnico responsable de la jornada.", source: "tecnico_responsable_id" },
      trabajo: { label: "Trabajo", description: "Servicio o trabajo asociado.", source: "servicio_id" },
    },
  },
  tecnicos: {
    label: "Tecnicos",
    description: "Dotacion tecnica de la app y su carga operativa por jornadas.",
    source: "profiles + user_roles + servicio_jornadas",
    grain: "Un perfil tecnico.",
    canonicalDate: null,
    stableKey: "profile.id",
    aliases: ["tecnicos", "equipo", "dotacion"],
    metrics: {
      tecnicos: { label: "Tecnicos", description: "Perfiles tecnicos unicos; la dotacion actual excluye perfiles inactivos y pasantes cuando corresponde.", unit: "count", aggregation: "count" },
      jornadas: { label: "Jornadas por tecnico", description: "Jornadas de la app atribuidas al tecnico.", unit: "count", aggregation: "sum" },
      horas: { label: "Horas por tecnico", description: "Horas de jornadas de la app, no horas de OS.", unit: "hours", aggregation: "sum" },
    },
    dimensions: {
      sucursal: { label: "Sucursal", description: "Sucursal real del perfil.", source: "profiles.sucursal" },
      tecnico: { label: "Tecnico", description: "Nombre del perfil.", source: "profiles.nombre" },
      carga: { label: "Carga", description: "Con carga o Sin carga segun jornadas del periodo.", source: "jornadas" },
      activo: { label: "Situacion", description: "Activo o Inactivo.", source: "profiles.activo" },
    },
  },
  disponibilidades: {
    label: "No disponibilidades",
    description: "Intervalos en los que un tecnico no esta disponible por capacitacion, vacaciones, permiso, taller interno u otro motivo.",
    source: "tecnico_disponibilidad + profiles",
    grain: "Un intervalo de no disponibilidad por tecnico.",
    canonicalDate: "fecha de inicio del intervalo",
    stableKey: "tecnico_disponibilidad.id",
    aliases: ["no disponibilidad", "indisponibilidad", "vacaciones", "capacitaciones", "permisos", "ausencias"],
    metrics: {
      registros: { label: "No disponibilidades", description: "Cantidad de intervalos de no disponibilidad registrados.", unit: "count", aggregation: "count" },
      dias: { label: "Dias no disponibles", description: "Dias calendario del intervalo que se superponen con el periodo consultado.", unit: "count", aggregation: "sum" },
      tecnicos: { label: "Tecnicos no disponibles", description: "Tecnicos unicos con al menos una no disponibilidad en el periodo.", unit: "count", aggregation: "count_distinct", distinctBy: "tecnico_id" },
    },
    dimensions: {
      periodo: { label: "Periodo", description: "Inicio del intervalo agrupado por dia, semana, mes o anio.", source: "fecha_inicio" },
      fecha: { label: "Fecha de inicio", description: "Fecha inicial de la no disponibilidad.", source: "fecha_inicio" },
      tecnico: { label: "Tecnico", description: "Nombre del tecnico no disponible.", source: "profiles.nombre" },
      sucursal: { label: "Sucursal", description: "Sucursal real del perfil tecnico.", source: "profiles.sucursal" },
      tipo: { label: "Tipo", description: "Capacitacion, Vacaciones, Permiso, Taller interno u Otro.", source: "tipo" },
      motivo: { label: "Motivo", description: "Observacion registrada para la no disponibilidad.", source: "observacion" },
      bloquea_agenda: { label: "Bloquea agenda", description: "Indica si el intervalo impide programar jornadas.", source: "bloquea_agenda" },
    },
  },
  parque: {
    label: "Parque",
    description: "Parque activo de maquinas y sus clientes.",
    source: "parque_maquinas",
    grain: "Una maquina activa.",
    canonicalDate: null,
    stableKey: "parque_maquinas.id",
    aliases: ["parque", "maquinas", "chasis", "series"],
    metrics: {
      maquinas: { label: "Maquinas", description: "Maquinas activas.", unit: "count", aggregation: "count" },
      clientes: { label: "Clientes del parque", description: "Clientes unicos propietarios de maquinas activas.", unit: "count", aggregation: "count_distinct", distinctBy: "cliente_id" },
    },
    dimensions: {
      sucursal: { label: "Sucursal", description: "Sucursal de la maquina.", source: "sucursal" },
      cliente: { label: "Cliente", description: "Propietario actual de la maquina.", source: "clientes.nombre" },
      marca: { label: "Marca", description: "Marca de la maquina.", source: "marca" },
      subgrupo: { label: "Subgrupo", description: "Subgrupo de producto.", source: "subgrupo" },
      modelo: { label: "Modelo", description: "Modelo o tipo de maquina.", source: "modelo_tipo" },
      serie: { label: "Serie", description: "Chasis o numero de serie.", source: "serie" },
      anio: { label: "Anio", description: "Anio de la maquina.", source: "anio" },
    },
  },
  agenda: {
    label: "Agenda comercial",
    description: "Seguimientos comerciales manuales registrados por cliente.",
    source: "seguimiento_comercial",
    grain: "Una gestion comercial manual.",
    canonicalDate: "fecha de gestion",
    stableKey: "seguimiento_comercial.id",
    aliases: ["agenda", "contactados", "seguimientos", "gestiones comerciales"],
    metrics: {
      gestiones: { label: "Gestiones", description: "Registros manuales de seguimiento comercial.", unit: "count", aggregation: "count" },
      clientes: { label: "Clientes gestionados", description: "Clientes unicos con seguimiento manual.", unit: "count", aggregation: "count_distinct", distinctBy: "cliente_id" },
    },
    dimensions: {
      periodo: { label: "Periodo", description: "Gestion agrupada por dia, semana, mes o anio.", source: "fecha" },
      fecha: { label: "Fecha", description: "Fecha de la gestion.", source: "fecha" },
      sucursal: { label: "Sucursal", description: "Sucursal del cliente.", source: "clientes.sucursal" },
      cliente: { label: "Cliente", description: "Nombre del cliente gestionado.", source: "clientes.nombre" },
      resultado: { label: "Resultado", description: "Resultado registrado en el seguimiento.", source: "resultado" },
    },
  },
  contactos: {
    label: "Contactos de clientes",
    description: "Personas y canales de contacto registrados para los clientes. No equivalen a gestiones comerciales realizadas.",
    source: "contactos_cliente + clientes",
    grain: "Una persona de contacto registrada para un cliente.",
    canonicalDate: "fecha de alta del contacto",
    stableKey: "contactos_cliente.id",
    aliases: ["personas de contacto", "contactos de clientes", "telefono", "correo", "email", "whatsapp", "cargo", "contacto principal"],
    metrics: {
      contactos: { label: "Contactos", description: "Personas de contacto registradas.", unit: "count", aggregation: "count" },
      clientes: { label: "Clientes con contacto", description: "Clientes unicos con al menos una persona de contacto.", unit: "count", aggregation: "count_distinct", distinctBy: "cliente_id" },
    },
    dimensions: {
      periodo: { label: "Periodo", description: "Alta del contacto agrupada por dia, semana, mes o anio.", source: "creado_en" },
      fecha: { label: "Fecha de alta", description: "Fecha en que se registro el contacto; no es una gestion comercial.", source: "creado_en" },
      sucursal: { label: "Sucursal", description: "Sucursal del cliente.", source: "clientes.sucursal" },
      cliente: { label: "Cliente", description: "Cliente al que pertenece el contacto.", source: "clientes.nombre" },
      contacto: { label: "Contacto", description: "Nombre de la persona de contacto.", source: "nombre" },
      cargo: { label: "Cargo", description: "Cargo o funcion de la persona.", source: "cargo" },
      telefono: { label: "Telefono", description: "Numero telefonico registrado.", source: "telefono" },
      correo: { label: "Correo", description: "Correo electronico registrado.", source: "correo" },
      canal: { label: "Canal", description: "Canales disponibles: WhatsApp, telefono y/o correo.", source: "telefono + correo + es_whatsapp" },
      principal: { label: "Principal", description: "Indica si es el contacto principal del cliente.", source: "es_principal" },
      activo: { label: "Situacion", description: "Activo o Inactivo.", source: "activo" },
    },
  },
  historial_trabajos: {
    label: "Historial de trabajos",
    description: "Eventos de auditoria registrados sobre los trabajos de la aplicacion.",
    source: "trabajo_historial + trabajos + clientes + profiles",
    grain: "Un evento de historial de un trabajo.",
    canonicalDate: "fecha del evento",
    stableKey: "trabajo_historial.id",
    aliases: ["historial de trabajos", "auditoria", "cambios de trabajos", "eventos de trabajos", "quien modifico", "quien creo", "quien cerro"],
    metrics: {
      eventos: { label: "Eventos", description: "Eventos de historial registrados.", unit: "count", aggregation: "count" },
      trabajos: { label: "Trabajos con cambios", description: "Trabajos unicos con eventos en el periodo.", unit: "count", aggregation: "count_distinct", distinctBy: "trabajo_id" },
      usuarios: { label: "Usuarios", description: "Usuarios unicos que generaron eventos.", unit: "count", aggregation: "count_distinct", distinctBy: "usuario_id" },
    },
    dimensions: {
      periodo: { label: "Periodo", description: "Evento agrupado por dia, semana, mes o anio.", source: "creado_en" },
      fecha: { label: "Fecha", description: "Fecha y hora del evento.", source: "creado_en" },
      evento: { label: "Evento", description: "Tipo de evento de historial.", source: "tipo_evento" },
      trabajo: { label: "Trabajo", description: "OS interna o codigo TR del trabajo.", source: "trabajos.os_numero o trabajos.codigo" },
      cliente: { label: "Cliente", description: "Cliente asociado al trabajo.", source: "clientes.nombre" },
      sucursal: { label: "Sucursal", description: "Sucursal del trabajo.", source: "trabajos.sucursal" },
      usuario: { label: "Usuario", description: "Usuario que genero el evento.", source: "profiles.nombre" },
    },
  },
  importaciones: {
    label: "Importaciones",
    description: "Historial de archivos importados, filas procesadas, insertadas y duplicadas.",
    source: "importaciones + profiles",
    grain: "Una ejecucion de importacion de archivo.",
    canonicalDate: "fecha de importacion",
    stableKey: "importaciones.id",
    aliases: ["importaciones", "archivos cargados", "cargas de datos", "duplicados", "insertados", "filas importadas", "ultima carga", "sistema nuevo", "sistema anterior"],
    metrics: {
      importaciones: { label: "Importaciones", description: "Ejecuciones de importacion.", unit: "count", aggregation: "count" },
      filas: { label: "Filas procesadas", description: "Suma de filas leidas por las importaciones.", unit: "count", aggregation: "sum" },
      insertados: { label: "Registros insertados", description: "Suma de registros insertados o actualizados segun el importador.", unit: "count", aggregation: "sum" },
      duplicados: { label: "Duplicados", description: "Suma de filas informadas como duplicadas.", unit: "count", aggregation: "sum" },
    },
    dimensions: {
      periodo: { label: "Periodo", description: "Importacion agrupada por dia, semana, mes o anio.", source: "creado_en" },
      fecha: { label: "Fecha", description: "Fecha y hora de la importacion.", source: "creado_en" },
      tipo: { label: "Tipo", description: "Tipo de datos importados.", source: "tipo" },
      archivo: { label: "Archivo", description: "Nombre del archivo importado.", source: "archivo_nombre" },
      origen: { label: "Origen", description: "Sistema de origen declarado por la importacion.", source: "origen_sistema" },
      usuario: { label: "Usuario", description: "Usuario que ejecuto la importacion.", source: "profiles.nombre" },
    },
  },
  dias_no_laborales: {
    label: "Dias no laborales",
    description: "Feriados, asuetos y otras fechas globales sin actividad laboral.",
    source: "dias_no_laborales",
    grain: "Una fecha no laboral global.",
    canonicalDate: "fecha no laboral",
    stableKey: "dias_no_laborales.id",
    aliases: ["dias no laborales", "feriados", "asuetos"],
    metrics: {
      dias: { label: "Dias no laborales", description: "Cantidad de fechas no laborales registradas.", unit: "count", aggregation: "count" },
    },
    dimensions: {
      periodo: { label: "Periodo", description: "Fecha agrupada por dia, semana, mes o anio.", source: "fecha" },
      fecha: { label: "Fecha", description: "Fecha no laboral.", source: "fecha" },
      motivo: { label: "Motivo", description: "Feriado, asueto u otra descripcion registrada.", source: "motivo" },
    },
  },
} as const satisfies Record<string, DatasetDefinition>;

export const semanticCatalogVersion = 5;

export type BusinessDataset = keyof typeof semanticCatalog;

export const businessCatalog = Object.fromEntries(
  (Object.keys(semanticCatalog) as BusinessDataset[]).map((dataset) => {
    const definition = semanticCatalog[dataset];
    return [dataset, {
      description: definition.description,
      metrics: Object.keys(definition.metrics),
      dimensions: Object.keys(definition.dimensions),
    }];
  }),
) as Record<BusinessDataset, { description: string; metrics: string[]; dimensions: string[] }>;

export type GenericQueryPlan = {
  dataset: BusinessDataset;
  metrics: string[];
  dimensions: string[];
  filters: SemanticRecord;
  granularity: QueryGranularity;
  order_by: string;
  order_direction: "asc" | "desc";
  limit: number;
};

export type PlanValidationIssue = {
  queryIndex: number;
  code: "invalid_query" | "invalid_dataset" | "missing_metric" | "unknown_metric" | "unknown_dimension" | "unknown_filter";
  detail: string;
};

export type SemanticIntent = {
  id: string;
  description: string;
  plan: Omit<GenericQueryPlan, "filters"> & { filters: SemanticRecord };
};

export type CompiledSemanticPlan = {
  plan: GenericQueryPlan;
  confidence: number;
  reasons: string[];
  inherited: boolean;
};

export type SemanticClarification = {
  id: string;
  message: string;
  options: string[];
};

const canonicalRules = [
  "Todos los importes se expresan en USD.",
  "Absorve CDM y Absorbe CDM se normalizan como Interno.",
  "Facturar a cliente se normaliza como Cliente.",
  "Completado es una jornada realizada y Cancelada es una jornada no realizada.",
  "Un trabajo Abierto agrupa Pendiente, Programado e Iniciado. Pausado se informa por separado.",
  "Facturas, clientes, OS y trabajos se cuentan por su clave estable, nunca por cantidad de lineas.",
  "Productividad tecnica significa OS y horas de OS, salvo que la pregunta diga explicitamente jornadas.",
  "Vacaciones, capacitaciones, permisos y otras ausencias se consultan en no disponibilidades, no se infieren desde jornadas.",
  "Una persona de contacto registrada no equivale a una gestion comercial: los contactos pertenecen al maestro de clientes y los seguimientos a la agenda.",
  "El historial de importaciones mide ejecuciones y filas procesadas; no reemplaza las metricas del negocio importado.",
  "Los dias no laborales son fechas globales; las no disponibilidades pertenecen a tecnicos concretos.",
  "El contexto visual se aplica solo cuando la pregunta se refiere al periodo visible, filtros actuales o seleccion actual.",
  "Las preguntas de seguridad, credenciales o fuera del negocio no estan permitidas.",
];

function normalizeText(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function safeLimit(value: unknown, fallback = 20, max = 100) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(1, Math.min(max, Math.floor(parsed))) : fallback;
}

function hasAny(text: string, values: readonly string[]) {
  return values.some((value) => text.includes(value));
}

export function getDataCatalog() {
  return {
    version: semanticCatalogVersion,
    datasets: semanticCatalog,
    rules: canonicalRules,
  };
}

export function getPlannerCatalog() {
  return {
    version: semanticCatalogVersion,
    datasets: Object.fromEntries(
      (Object.keys(semanticCatalog) as BusinessDataset[]).map((dataset) => {
        const definition = semanticCatalog[dataset];
        return [dataset, {
          description: definition.description,
          grain: definition.grain,
          date: definition.canonicalDate,
          metrics: Object.fromEntries(Object.entries(definition.metrics).map(([key, metric]) => [key, {
            description: metric.description,
            unit: metric.unit,
            required_filters: metric.requiredFilters ?? {},
          }])),
          dimensions: Object.keys(definition.dimensions),
        }];
      }),
    ),
    rules: canonicalRules,
  };
}

export function shouldSortTemporalSeriesChronologically(question: string, dimensions: readonly string[]) {
  if (!dimensions.includes("periodo")) return false;
  const text = normalizeText(question);
  return !hasAny(text, [
    "MAYOR",
    "MENOR",
    "TOP",
    "RANKING",
    "MAS ALTO",
    "MAS BAJO",
    "ORDEN DESCENDENTE",
    "RECIENTE PRIMERO",
  ]);
}

/**
 * Returns every canonical time bucket intersecting a closed date range.
 * An empty array means the range is invalid or too large to expand safely.
 */
export function enumeratePeriodBuckets(
  dateFrom: unknown,
  dateTo: unknown,
  granularity: QueryGranularity,
  maxBuckets = 100,
) {
  const from = String(dateFrom ?? "").slice(0, 10);
  const to = String(dateTo ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || maxBuckets < 1) return [];

  const start = new Date(`${from}T12:00:00Z`);
  const end = new Date(`${to}T12:00:00Z`);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start > end) return [];

  const buckets: string[] = [];
  const push = (value: string) => {
    buckets.push(value);
    return buckets.length <= maxBuckets;
  };

  if (granularity === "year") {
    for (let year = start.getUTCFullYear(); year <= end.getUTCFullYear(); year += 1) {
      if (!push(String(year))) return [];
    }
    return buckets;
  }

  if (granularity === "month") {
    const current = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1, 12));
    const last = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1, 12));
    while (current <= last) {
      if (!push(current.toISOString().slice(0, 7))) return [];
      current.setUTCMonth(current.getUTCMonth() + 1);
    }
    return buckets;
  }

  const current = new Date(start);
  const last = new Date(end);
  const stepDays = granularity === "week" ? 7 : 1;
  if (granularity === "week") {
    current.setUTCDate(current.getUTCDate() - ((current.getUTCDay() + 6) % 7));
    last.setUTCDate(last.getUTCDate() - ((last.getUTCDay() + 6) % 7));
  }
  while (current <= last) {
    if (!push(current.toISOString().slice(0, 10))) return [];
    current.setUTCDate(current.getUTCDate() + stepDays);
  }
  return buckets;
}

export function detectSemanticIntent(question: string): SemanticIntent | null {
  const text = normalizeText(question);
  const asksInactive = hasAny(text, ["INACTIVO", "INACTIVOS", "EX TECNICO", "SALIO DE LA EMPRESA"]);
  const asksProductivity = hasAny(text, ["PRODUCTIVIDAD", "PRODUCTIVO", "PRODUCTIVA", "PRODUCCION TECNICA"]);
  const explicitlyAsksJourneys = hasAny(text, ["JORNADA", "JORNADAS", "PLANIFICADOR", "CALENDARIO"]);

  if (asksProductivity && !explicitlyAsksJourneys) {
    return {
      id: "productividad_tecnica_os",
      description: "Productividad tecnica medida por horas y cantidad de OS, incluyendo responsables y auxiliares.",
      plan: {
        dataset: "ordenes_servicio",
        metrics: ["horas", "ordenes"],
        dimensions: ["tecnico"],
        filters: asksInactive ? { activo: "Inactivo" } : {},
        granularity: "month",
        order_by: "horas",
        order_direction: "desc",
        limit: 20,
      },
    };
  }

  const asksBilledHours = hasAny(text, ["HORA FACTURADA", "HORAS FACTURADAS", "HS FACTURADA", "HS FACTURADAS"]);
  if (asksBilledHours) {
    return {
      id: "horas_facturadas",
      description: "Horas facturadas tomadas de lineas de facturacion cuyo rubro canonico es Servicio.",
      plan: {
        dataset: "facturacion",
        metrics: ["horas"],
        dimensions: text.includes("TIPO DE TIEMPO") ? ["tipo_tiempo"] : [],
        filters: { rubro: "Servicio" },
        granularity: "month",
        order_by: "horas",
        order_direction: "desc",
        limit: 20,
      },
    };
  }

  const asksBilledKm = hasAny(text, ["KM FACTURADO", "KM FACTURADOS", "KILOMETRO FACTURADO", "KILOMETROS FACTURADOS"]);
  if (asksBilledKm) {
    return {
      id: "kilometros_facturados",
      description: "Kilometros facturados tomados de lineas cuyo rubro canonico es Kilometraje.",
      plan: {
        dataset: "facturacion",
        metrics: ["km"],
        dimensions: text.includes("TIPO DE TIEMPO") ? ["tipo_tiempo"] : [],
        filters: { rubro: "Kilometraje" },
        granularity: "month",
        order_by: "km",
        order_direction: "desc",
        limit: 20,
      },
    };
  }

  if (hasAny(text, ["OS CERRADA", "OS CERRADAS", "ORDENES CERRADAS", "ORDEN CERRADA"])) {
    return {
      id: "ordenes_cerradas",
      description: "OS unicas cuyo estado canonico es Cerrada.",
      plan: {
        dataset: "ordenes_servicio",
        metrics: ["ordenes"],
        dimensions: hasAny(text, ["MES", "SEMANA", "DIA", "ANO"]) ? ["periodo"] : [],
        filters: { estado: "Cerrada" },
        granularity: text.includes("SEMANA") ? "week" : text.includes("DIA") ? "day" : text.includes("ANO") ? "year" : "month",
        order_by: "ordenes",
        order_direction: "desc",
        limit: 20,
      },
    };
  }

  return null;
}

function mergeRequiredMetricFilters(dataset: BusinessDataset, metrics: string[], filters: SemanticRecord) {
  const merged = { ...filters };
  const metricDefinitions = semanticCatalog[dataset].metrics as Record<string, MetricDefinition>;
  for (const metricName of metrics) {
    const metric = metricDefinitions[metricName];
    if (!metric?.requiredFilters) continue;
    for (const [key, value] of Object.entries(metric.requiredFilters)) merged[key] = value;
  }
  return merged;
}

export function validateGenericPlans(
  raw: SemanticRecord,
  explicitFilters: SemanticRecord = {},
  maxQueries = 3,
): { plans: GenericQueryPlan[]; issues: PlanValidationIssue[] } {
  const rawQueries = Array.isArray(raw.queries) ? raw.queries.slice(0, maxQueries) : [];
  const plans: GenericQueryPlan[] = [];
  const issues: PlanValidationIssue[] = [];

  for (let queryIndex = 0; queryIndex < rawQueries.length; queryIndex += 1) {
    const rawQuery = rawQueries[queryIndex];
    if (!rawQuery || typeof rawQuery !== "object" || Array.isArray(rawQuery)) {
      issues.push({ queryIndex, code: "invalid_query", detail: "La consulta no es un objeto." });
      continue;
    }

    const query = rawQuery as SemanticRecord;
    const dataset = String(query.dataset ?? "") as BusinessDataset;
    if (!(dataset in semanticCatalog)) {
      issues.push({ queryIndex, code: "invalid_dataset", detail: `Dataset no permitido: ${dataset || "vacio"}.` });
      continue;
    }

    const definition = semanticCatalog[dataset];
    const allowedMetrics = new Set(Object.keys(definition.metrics));
    const requestedMetrics = Array.isArray(query.metrics) ? query.metrics.map(String) : [];
    const metrics = requestedMetrics.filter((metric) => allowedMetrics.has(metric)).slice(0, 6);
    for (const metric of requestedMetrics.filter((metric) => !allowedMetrics.has(metric))) {
      issues.push({ queryIndex, code: "unknown_metric", detail: `${dataset}.${metric} no existe.` });
    }
    if (!metrics.length) {
      issues.push({ queryIndex, code: "missing_metric", detail: `Falta una metrica valida para ${dataset}.` });
      continue;
    }

    const allowedDimensions = new Set(Object.keys(definition.dimensions));
    const requestedDimensions = Array.isArray(query.dimensions) ? query.dimensions.map(String) : [];
    const dimensions = requestedDimensions.filter((dimension) => allowedDimensions.has(dimension)).slice(0, 3);
    for (const dimension of requestedDimensions.filter((dimension) => !allowedDimensions.has(dimension))) {
      issues.push({ queryIndex, code: "unknown_dimension", detail: `${dataset}.${dimension} no existe.` });
    }

    const requestedFilters = query.filters && typeof query.filters === "object" && !Array.isArray(query.filters)
      ? query.filters as SemanticRecord
      : {};
    const allowedFilters = new Set(["date_from", "date_to", "sucursal", "sucursales", ...allowedDimensions]);
    // Fechas, sucursales y demas valores extraidos literalmente de la pregunta
    // tienen prioridad sobre cualquier valor sugerido por el modelo.
    const mergedFilters = { ...requestedFilters, ...explicitFilters };
    const validFilters: SemanticRecord = {};
    for (const [key, value] of Object.entries(mergedFilters)) {
      if (!allowedFilters.has(key)) {
        issues.push({ queryIndex, code: "unknown_filter", detail: `${dataset}.${key} no se puede filtrar.` });
        continue;
      }
      if (value === "" || value === null || value === undefined) continue;
      validFilters[key] = value;
    }
    const filters = mergeRequiredMetricFilters(dataset, metrics, validFilters);
    const requestedGranularity = String(query.granularity ?? "month") as QueryGranularity;
    const granularity: QueryGranularity = ["day", "week", "month", "year"].includes(requestedGranularity)
      ? requestedGranularity
      : "month";
    const requestedOrder = String(query.order_by ?? "");
    const orderBy = metrics.includes(requestedOrder) || dimensions.includes(requestedOrder)
      ? requestedOrder
      : metrics[0];

    plans.push({
      dataset,
      metrics,
      dimensions,
      filters,
      granularity,
      order_by: orderBy,
      order_direction: String(query.order_direction ?? "desc").toLowerCase() === "asc" ? "asc" : "desc",
      limit: safeLimit(query.limit, 20, 100),
    });
  }

  return { plans, issues };
}

export function buildIntentFallbackPlan(question: string, explicitFilters: SemanticRecord = {}) {
  const intent = detectSemanticIntent(question);
  if (!intent) return null;
  const raw = { queries: [{
    ...intent.plan,
    filters: { ...intent.plan.filters, ...explicitFilters },
    limit: requestedLimit(normalizeText(question)),
  }] };
  return validateGenericPlans(raw, explicitFilters, 1).plans[0] ?? null;
}

export function enforceSemanticIntent(
  question: string,
  plans: GenericQueryPlan[],
  explicitFilters: SemanticRecord = {},
) {
  const preferred = buildIntentFallbackPlan(question, explicitFilters);
  if (!preferred) return plans;
  if (!plans.length) return [preferred];

  const first = plans[0];
  const definition = semanticCatalog[preferred.dataset];
  const allowedDimensions = new Set(Object.keys(definition.dimensions));
  const allowedFilters = new Set(["date_from", "date_to", "sucursal", "sucursales", ...allowedDimensions]);
  const inheritedDimensions = first.dimensions.filter((dimension) => allowedDimensions.has(dimension));
  const inheritedFilters = Object.fromEntries(
    Object.entries(first.filters).filter(([key]) => allowedFilters.has(key)),
  );

  return [{
    ...preferred,
    dimensions: inheritedDimensions.length ? inheritedDimensions : preferred.dimensions,
    filters: { ...inheritedFilters, ...preferred.filters },
    granularity: inheritedDimensions.includes("periodo") ? first.granularity : preferred.granularity,
    limit: first.limit,
  }, ...plans.slice(1)];
}

export function semanticIntentHint(question: string) {
  const intent = detectSemanticIntent(question);
  if (!intent) return null;
  return {
    id: intent.id,
    description: intent.description,
    preferred_query: intent.plan,
  };
}

const datasetSignals: Record<BusinessDataset, readonly string[]> = {
  facturacion: ["FACTUR*", "VENTA*", "COMPROBANTE*", "TICKET PROMEDIO", "RUBRO"],
  ordenes_servicio: [" OS ", "ORDEN DE SERVICIO", "ORDENES DE SERVICIO", "PRODUCTIV*", "PRODUCCION TECNICA"],
  trabajos: ["TRABAJO*", "CASO*", "CODIGO TR", "TR ABIERTO", "TR CERRADO"],
  jornadas: ["JORNAD*", "PLANIFIC*", "CALENDARIO", "FECHA DE TRABAJO"],
  tecnicos: ["TECNICO*", "DOTACION", "EQUIPO TECNICO", "SIN CARGA", "CON CARGA", "ASIGNAD*"],
  disponibilidades: ["NO DISPONIB*", "INDISPONIB*", "VACACION*", "CAPACITACION*", "PERMISO*", "AUSENCIA*", "TALLER INTERNO"],
  parque: ["PARQUE", "MAQUINA*", "CHASIS", "SERIE*", "MODELO*"],
  agenda: ["AGENDA", "CONTACTADO*", "SEGUIMIENTO*", "GESTION COMERCIAL", "GESTIONES COMERCIALES"],
  contactos: ["PERSONA DE CONTACTO", "CONTACTO PRINCIPAL", "CONTACTOS DE CLIENTES", "TELEFONO", "CORREO", "EMAIL", "WHATSAPP", "CARGO"],
  historial_trabajos: ["HISTORIAL DE TRABAJO", "HISTORIAL DEL TRABAJO", "AUDITORIA", "CAMBIOS DE TRABAJO", "EVENTOS DE TRABAJO", "QUIEN MODIFICO", "QUIEN CREO", "QUIEN CERRO"],
  importaciones: ["IMPORTACION*", "ARCHIVO* CARGAD*", "CARGA DE DATOS", "DUPLICADO*", "INSERTADO*", "FILAS IMPORTADAS", "ULTIMA CARGA", "SISTEMA NUEVO", "SISTEMA ANTERIOR"],
  dias_no_laborales: ["DIA NO LABORAL", "DIAS NO LABORALES", "FERIADO*", "ASUETO*"],
};

function signalMatches(text: string, signal: string) {
  const normalizedSignal = normalizeText(signal.replace(/\*$/, ""));
  if (!normalizedSignal) return false;
  if (signal.endsWith("*")) return text.includes(normalizedSignal);
  if (signal.startsWith(" ") || signal.endsWith(" ")) {
    return ` ${text} `.includes(` ${normalizedSignal} `);
  }
  return text.includes(normalizedSignal);
}

function scoreDatasets(text: string) {
  return (Object.keys(datasetSignals) as BusinessDataset[])
    .map((dataset) => ({
      dataset,
      score: datasetSignals[dataset].reduce((score, signal) => score + (signalMatches(text, signal) ? 1 : 0), 0)
        + (dataset === "ordenes_servicio" && hasAny(text, [" ORDEN DE SERVICIO ", " ORDENES DE SERVICIO ", " OS ", "PRODUCTIV"]) ? 3 : 0)
        + (dataset === "tecnicos" && text.includes("TECNIC") && hasAny(text, ["CARGA", "ASIGNAD", "DOTACION"]) ? 3 : 0)
        + (dataset === "disponibilidades" && hasAny(text, ["NO DISPONIB", "VACACION", "CAPACITACION", "PERMISO", "AUSENCIA", "TALLER INTERNO"]) ? 4 : 0)
        + (dataset === "jornadas" && hasAny(text, ["JORNADA", "PLANIFICADOR", "CALENDARIO"]) ? 3 : 0)
        + (dataset === "parque" && hasAny(text, ["CHASIS", "NUMERO DE SERIE", "MAQUINA"]) ? 3 : 0)
        + (dataset === "facturacion" && hasAny(text, ["FACTUR", "VENTA", "COMPROBANTE", "TICKET"]) ? 3 : 0)
        + (dataset === "contactos" && hasAny(text, ["TELEFONO", "CORREO", "EMAIL", "WHATSAPP", "CONTACTO PRINCIPAL", "PERSONA DE CONTACTO"]) ? 4 : 0)
        + (dataset === "historial_trabajos" && hasAny(text, ["HISTORIAL DE TRABAJO", "AUDITORIA", "QUIEN MODIFICO", "QUIEN CREO", "QUIEN CERRO"]) ? 4 : 0)
        + (dataset === "importaciones" && hasAny(text, ["IMPORTACION", "ARCHIVO CARGADO", "DUPLICADO", "FILAS IMPORTADAS", "ULTIMA CARGA"]) ? 4 : 0)
        + (dataset === "dias_no_laborales" && hasAny(text, ["DIA NO LABORAL", "FERIADO", "ASUETO"]) ? 4 : 0),
    }))
    .sort((left, right) => right.score - left.score);
}

function detectGranularity(text: string): QueryGranularity {
  if (hasAny(text, ["POR DIA", "CADA DIA", "QUE DIA", "DIARIO"])) return "day";
  if (hasAny(text, ["POR SEMANA", "CADA SEMANA", "QUE SEMANA", "SEMANAL"])) return "week";
  if (hasAny(text, ["POR ANO", "CADA ANO", "QUE ANO", "ANUAL"])) return "year";
  return "month";
}

function requestedLimit(text: string) {
  const topMatch = text.match(/\bTOP\s+(\d{1,3})\b/);
  if (topMatch) return safeLimit(topMatch[1], 20, 100);
  if (hasAny(text, ["QUIEN LE SIGUE", "CUAL LE SIGUE", "SEGUNDO LUGAR"])) return 2;
  if (hasAny(text, ["CUAL FUE", "CUAL ES", "QUIEN FUE", "QUIEN ES", "QUE SUCURSAL", "QUE CLIENTE", "QUE TECNICO", "QUE MES", "QUE SEMANA"])) return 1;
  if (hasAny(text, ["DIME LOS", "DIME LAS", "LISTA LOS", "LISTA LAS", "LISTADO DE", "MOSTRA LOS", "MOSTRA LAS", "CUALES SON", "TODOS LOS", "TODAS LAS"])) return 100;
  return 20;
}

function isFollowUp(text: string) {
  const wordCount = text.split(" ").filter(Boolean).length;
  return wordCount <= 10 && (
    hasAny(text, ["Y EN ", "Y QUIEN", "Y CUAL", "Y CUANTO", "Y CUANTOS", "Y CUANTAS", "Y AHORA", "Y ESTE", "Y ESTA", "EL MISMO", "LA MISMA", "LE SIGUE"])
    || hasAny(text, [
      "ESTE MES", "MES EN CURSO", "MES ACTUAL",
      "ESTA SEMANA", "SEMANA EN CURSO", "SEMANA ACTUAL",
      "ESTE ANO", "ANO EN CURSO", "ANO ACTUAL",
    ])
  );
}

function inferDatasetMetrics(dataset: BusinessDataset, text: string) {
  if (dataset === "facturacion") {
    if (hasAny(text, ["HORA", "HORAS", " HS "])) return ["horas"];
    if (hasAny(text, ["KILOMETRO", "KILOMETROS", " KM "])) return ["km"];
    if (text.includes("TICKET")) return ["ticket_promedio"];
    if (hasAny(text, ["CUANTAS FACTURAS", "CANTIDAD DE FACTURAS", "NUMERO DE FACTURAS"])) return ["facturas"];
    if (hasAny(text, ["CUANTOS CLIENTES", "CANTIDAD DE CLIENTES", "CLIENTES UNICOS"])) return ["clientes"];
    return ["total_usd"];
  }
  if (dataset === "ordenes_servicio") {
    if (hasAny(text, ["VALOR", "MONTO", "IMPORTE", "TOTAL USD", "COSTO"])) return ["total_usd"];
    if (hasAny(text, ["KILOMETRO", "KILOMETROS", " KM "])) return ["km", "ordenes"];
    if (hasAny(text, ["HORA", "HORAS", "PRODUCTIV", "PRODUCCION TECNICA"])) return ["horas", "ordenes"];
    return ["ordenes"];
  }
  if (dataset === "trabajos") return ["trabajos"];
  if (dataset === "jornadas") return hasAny(text, ["HORA", "HORAS", " HS "]) ? ["horas", "jornadas"] : ["jornadas"];
  if (dataset === "tecnicos") {
    if (hasAny(text, ["CARGA", "ASIGNAD", "JORNADA", "HORA", "HORAS", "DISPONIB"])) {
      return ["jornadas", "horas"];
    }
    return ["tecnicos"];
  }
  if (dataset === "disponibilidades") {
    if (hasAny(text, ["CUANTOS TECNICOS", "CANTIDAD DE TECNICOS", "QUIENES", "QUE TECNICOS"])) return ["tecnicos"];
    if (hasAny(text, ["CUANTOS DIAS", "CANTIDAD DE DIAS", "DIAS NO DISPONIBLES"])) return ["dias"];
    return ["registros"];
  }
  if (dataset === "parque") return hasAny(text, ["CUANTOS CLIENTES", "CANTIDAD DE CLIENTES", "PROPIETARIOS"]) ? ["clientes"] : ["maquinas"];
  if (dataset === "agenda") return hasAny(text, ["CUANTOS CLIENTES", "CANTIDAD DE CLIENTES"]) ? ["clientes"] : ["gestiones"];
  if (dataset === "contactos") return hasAny(text, ["CUANTOS CLIENTES", "CANTIDAD DE CLIENTES"]) ? ["clientes"] : ["contactos"];
  if (dataset === "historial_trabajos") {
    if (hasAny(text, ["CUANTOS TRABAJOS", "CANTIDAD DE TRABAJOS"])) return ["trabajos"];
    if (hasAny(text, ["CUANTOS USUARIOS", "CANTIDAD DE USUARIOS"])) return ["usuarios"];
    return ["eventos"];
  }
  if (dataset === "importaciones") {
    const metrics: string[] = [];
    if (hasAny(text, ["FILA", "FILAS", "REGISTROS PROCESADOS"])) metrics.push("filas");
    if (hasAny(text, ["INSERTADO", "INSERTADOS", "REGISTROS NUEVOS"])) metrics.push("insertados");
    if (hasAny(text, ["DUPLICADO", "DUPLICADOS"])) metrics.push("duplicados");
    return metrics.length ? metrics : ["importaciones"];
  }
  return ["dias"];
}

function hasExplicitMetricSignal(dataset: BusinessDataset, text: string) {
  const signals: Record<BusinessDataset, readonly string[]> = {
    facturacion: ["FACTUR", "VENTA", "IMPORTE", "MONTO", "TICKET", "HORA", "HORAS", " HS ", "KILOMETRO", "KILOMETROS", " KM ", "CLIENTES", "LINEAS"],
    ordenes_servicio: ["ORDEN", " OS ", "HORA", "HORAS", "KILOMETRO", "KILOMETROS", "VALOR", "MONTO", "IMPORTE", "PRODUCTIV", "COSTO"],
    trabajos: ["TRABAJO", "TRABAJOS", "CASO", "CASOS", " TR "],
    jornadas: ["JORNADA", "JORNADAS", "HORA", "HORAS"],
    tecnicos: ["TECNICO", "TECNICOS", "DOTACION", "HORA", "HORAS", "JORNADA", "JORNADAS", "CARGA"],
    disponibilidades: ["NO DISPONIBILIDAD", "INDISPONIBILIDAD", "VACACION", "CAPACITACION", "PERMISO", "AUSENCIA", "DIA", "DIAS", "TECNICO", "TECNICOS"],
    parque: ["MAQUINA", "MAQUINAS", "CLIENTE", "CLIENTES", "PARQUE"],
    agenda: ["GESTION", "GESTIONES", "CONTACTADO", "CONTACTADOS", "CLIENTE", "CLIENTES", "SEGUIMIENTO"],
    contactos: ["CONTACTO", "CONTACTOS", "CLIENTE", "CLIENTES", "TELEFONO", "CORREO", "EMAIL", "WHATSAPP"],
    historial_trabajos: ["EVENTO", "EVENTOS", "TRABAJO", "TRABAJOS", "USUARIO", "USUARIOS", "CAMBIO", "CAMBIOS"],
    importaciones: ["IMPORTACION", "IMPORTACIONES", "FILA", "FILAS", "INSERTADO", "INSERTADOS", "DUPLICADO", "DUPLICADOS"],
    dias_no_laborales: ["DIA", "DIAS", "FERIADO", "FERIADOS", "ASUETO", "ASUETOS"],
  };
  return hasAny(` ${text} `, signals[dataset]);
}

function inferDimensions(dataset: BusinessDataset, text: string) {
  const allowed = new Set(Object.keys(semanticCatalog[dataset].dimensions));
  const dimensions: string[] = [];
  const add = (dimension: string, signals: readonly string[]) => {
    if (allowed.has(dimension) && hasAny(text, signals) && !dimensions.includes(dimension)) dimensions.push(dimension);
  };

  add("periodo", ["POR DIA", "POR SEMANA", "POR MES", "POR ANO", "QUE DIA", "QUE SEMANA", "QUE MES", "QUE ANO", "EVOLUCION"]);
  add("sucursal", ["POR SUCURSAL", "QUE SUCURSAL", "SUCURSALES", "ENTRE SUCURSALES"]);
  add("tecnico", ["POR TECNICO", "QUE TECNICO", "TECNICO MAS", "RESPONSABLE", "AUXILIAR", "PARTICIPANTE", "PRODUCTIV"]);
  add("cliente", ["POR CLIENTE", "DEL CLIENTE", "DE CLIENTE", "QUE CLIENTE", "CLIENTE QUE MAS", "TOP CLIENTES", "RANKING DE CLIENTES", "DUENO", "PROPIETARIO"]);
  if (allowed.has("cliente") && /(?:^| )TOP\s+\d+\s+CLIENTES(?: |$)/.test(text) && !dimensions.includes("cliente")) {
    dimensions.push("cliente");
  }
  add("tipo_tiempo", ["POR TIPO DE TIEMPO", "TIPO DE TIEMPO", "CLIENTE GARANTIA INTERNO", "CLIENTE INTERNO GARANTIA"]);
  add("rubro", ["POR RUBRO", "RUBROS", "COMPOSICION DE RUBROS"]);
  add("marca", ["POR MARCA", "QUE MARCA", "MARCAS"]);
  add("estado", ["POR ESTADO", "ESTADOS", "COMPOSICION DE ESTADOS"]);
  if (allowed.has("factura") && (
    /(?:^| )POR FACTURA(?: |$)/.test(text)
    || hasAny(text, ["FACTURA MAS GRANDE", "FACTURA DE MAYOR", "DETALLE DE FACTURAS"])
  )) dimensions.push("factura");
  add("trabajo", ["TRABAJO", "TRABAJOS", "CODIGO TR", "DETALLE DE TR", "HISTORIAL DEL TRABAJO"]);
  add("codigo_producto", ["CODIGO DE PRODUCTO", "CODIGO DE REPUESTO", "CODIGO FABRICANTE", "POR CODIGO", "REPUESTOS POR CODIGO"]);
  add("concepto", ["POR PRODUCTO", "QUE PRODUCTO", "PRODUCTOS FACTURADOS", "POR CONCEPTO", "CONCEPTOS", "MERCADERIA", "DESCRIPCION DEL PRODUCTO"]);
  add("observacion", ["OBSERVACION", "OBSERVACIONES"]);
  add("os", ["POR OS", "CUAL OS", "QUE OS", "DETALLE DE OS"]);
  add("problema", ["PROBLEMA", "MOTIVO DE LA OS", "TRABAJO DE LA OS", "TRABAJO REALIZADO"]);
  add("serie", ["CHASIS", "NUMERO DE SERIE", "POR SERIE"]);
  add("modelo", ["MODELO", "POR MODELO"]);
  add("resultado", ["POR RESULTADO", "RESULTADOS"]);
  add("tipo", ["POR TIPO", "TIPO DE AUSENCIA", "TIPO DE NO DISPONIBILIDAD", "VACACIONES", "CAPACITACIONES", "PERMISOS"]);
  add("motivo", ["MOTIVO", "OBSERVACION DE LA AUSENCIA"]);
  add("contacto", ["PERSONA DE CONTACTO", "NOMBRE DEL CONTACTO", "QUIEN ES EL CONTACTO", "QUIENES SON LOS CONTACTOS", "CONTACTOS DE"]);
  add("cargo", ["CARGO", "FUNCION DEL CONTACTO"]);
  add("telefono", ["TELEFONO", "NUMERO DE TELEFONO", "CELULAR"]);
  add("correo", ["CORREO", "EMAIL", "MAIL"]);
  add("canal", ["POR CANAL", "CANAL DE CONTACTO", "WHATSAPP"]);
  add("principal", ["CONTACTO PRINCIPAL", "PRINCIPALES"]);
  add("evento", ["TIPO DE EVENTO", "POR EVENTO", "QUE CAMBIO", "CAMBIOS REALIZADOS"]);
  add("usuario", ["POR USUARIO", "QUE USUARIO", "QUIEN MODIFICO", "QUIEN CREO", "QUIEN CERRO", "QUIEN IMPORTO"]);
  add("archivo", ["ARCHIVO", "NOMBRE DE ARCHIVO"]);
  add("origen", ["POR ORIGEN", "SISTEMA DE ORIGEN", "SISTEMA NUEVO", "SISTEMA ANTERIOR"]);
  add("fecha", ["QUE FECHA", "CUANDO", "FERIADO", "FERIADOS", "ASUETO", "ASUETOS", "ULTIMA IMPORTACION", "ULTIMA CARGA"]);
  add("carga", ["CON CARGA", "SIN CARGA", "POR CARGA"]);
  add("activo", ["ACTIVO", "ACTIVOS", "INACTIVO", "INACTIVOS"]);
  if (dataset === "tecnicos" && hasAny(text, [
    "TECNICOS TIENEN", "TECNICOS CON", "TECNICOS SIN", "QUIENES TIENEN",
    "QUIENES NO", "LISTA DE TECNICOS", "LISTADO DE TECNICOS", "POR TECNICO",
  ]) && !dimensions.includes("tecnico")) dimensions.unshift("tecnico");
  if (dataset === "tecnicos" && hasAny(text, ["CARGA", "ASIGNAD", "SIN ACTIVIDAD"]) && !dimensions.includes("carga")) {
    dimensions.push("carga");
  }
  if (dataset === "disponibilidades" && hasAny(text, [
    "QUIEN", "QUIENES", "QUE TECNICO", "TECNICOS", "LISTA", "LISTADO",
  ]) && !dimensions.includes("tecnico")) dimensions.unshift("tecnico");
  if (dataset === "contactos" && hasAny(text, ["TELEFONO", "CORREO", "EMAIL", "WHATSAPP", "CONTACTO"])) {
    for (const dimension of ["correo", "telefono", "contacto"]) {
      const existingIndex = dimensions.indexOf(dimension);
      if (existingIndex >= 0) dimensions.splice(existingIndex, 1);
      if (allowed.has(dimension)) dimensions.unshift(dimension);
    }
  }
  if (dataset === "historial_trabajos" && hasAny(text, ["QUIEN", "USUARIO"]) && !dimensions.includes("usuario")) dimensions.unshift("usuario");
  if (dataset === "dias_no_laborales") {
    if (!dimensions.includes("fecha")) dimensions.push("fecha");
    if (!dimensions.includes("motivo")) dimensions.push("motivo");
  }
  return dimensions.slice(0, 3);
}

function compactIdentifier(value: string) {
  return value.replace(/\s+/g, "").replace(/[.,;:]+$/, "");
}

function inferCanonicalFilters(dataset: BusinessDataset, text: string, rawQuestion = text) {
  const filters: SemanticRecord = {};
  const allowed = new Set(Object.keys(semanticCatalog[dataset].dimensions));
  const rawText = rawQuestion.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  if (allowed.has("estado")) {
    if (hasAny(text, ["CERRADA", "CERRADAS", "CERRADO", "CERRADOS", "CULMINAD"])) {
      filters.estado = dataset === "jornadas" ? "Completado" : dataset === "trabajos" ? "Completado" : "Cerrada";
    } else if (hasAny(text, ["ANULADA", "ANULADAS", "CANCELADA", "CANCELADAS", "NO REALIZADA", "NO REALIZADAS"])) {
      filters.estado = dataset === "jornadas" ? "Cancelada" : "Anulada";
    } else if (hasAny(text, ["ABIERTA", "ABIERTAS", "ABIERTO", "ABIERTOS"])) {
      filters.estado = dataset === "ordenes_servicio" ? "Abierta" : dataset === "trabajos" ? "Abierto" : "Pendiente";
    } else if (hasAny(text, ["PENDIENTE", "PENDIENTES"])) {
      filters.estado = "Pendiente";
    } else if (hasAny(text, ["PAUSADA", "PAUSADAS", "PAUSADO", "PAUSADOS"])) {
      filters.estado = "Pausado";
    } else if (hasAny(text, ["INICIADA", "INICIADAS", "INICIADO", "INICIADOS"])) {
      filters.estado = "Iniciado";
    }
  }
  if (allowed.has("activo")) {
    if (hasAny(text, ["INACTIVO", "INACTIVOS", "EX TECNICO", "SALIO DE LA EMPRESA"])) filters.activo = "Inactivo";
    else if (hasAny(text, ["TECNICO ACTIVO", "TECNICOS ACTIVOS"])) filters.activo = "Activo";
  }
  if (allowed.has("tipo_tiempo")) {
    const asksBreakdown = hasAny(text, ["POR TIPO DE TIEMPO", "DESGLOSAR POR TIPO", "DESGLOSE POR TIPO"]);
    if (!asksBreakdown) {
      if (text.includes("GARANTIA")) filters.tipo_tiempo = "Garantia";
      else if (hasAny(text, ["INTERNO", "ABSORVE CDM", "ABSORBE CDM"])) filters.tipo_tiempo = "Interno";
      else if (hasAny(text, ["FACTURAR A CLIENTE", "TIPO CLIENTE"])) filters.tipo_tiempo = "Cliente";
    }
  }
  if (dataset === "disponibilidades" && allowed.has("tipo")) {
    if (text.includes("VACACION")) filters.tipo = "Vacaciones";
    else if (text.includes("CAPACITACION")) filters.tipo = "Capacitacion";
    else if (text.includes("PERMISO")) filters.tipo = "Permiso";
    else if (text.includes("TALLER INTERNO")) filters.tipo = "Taller interno";
  }
  if (dataset === "contactos") {
    if (allowed.has("principal") && hasAny(text, ["CONTACTO PRINCIPAL", "CONTACTOS PRINCIPALES"])) filters.principal = "Si";
    if (allowed.has("activo") && hasAny(text, ["CONTACTO INACTIVO", "CONTACTOS INACTIVOS"])) filters.activo = "Inactivo";
    else if (allowed.has("activo") && hasAny(text, ["CONTACTO ACTIVO", "CONTACTOS ACTIVOS"])) filters.activo = "Activo";
    if (allowed.has("canal") && text.includes("WHATSAPP")) filters.canal = "WhatsApp";
  }
  if (dataset === "facturacion" && allowed.has("rubro")) {
    if (hasAny(text, ["SERVICIO", "SERVICIOS", "MANO DE OBRA"])) filters.rubro = "Servicio";
    else if (hasAny(text, ["REPUESTO", "REPUESTOS", "PIEZAS"])) filters.rubro = "Repuestos";
    else if (hasAny(text, ["KILOMETRAJE", "KILOMETROS FACTURADOS", "KM FACTURADOS"])) filters.rubro = "Kilometraje";
    else if (hasAny(text, ["RUBRO OTROS", "CONCEPTO OTROS"])) filters.rubro = "Otros";
  }
  if (allowed.has("os")) {
    const rawOrder = rawText.match(/(?:^|\s)(?:OS|ORDEN DE SERVICIO)(?:\s+(?:NRO|NUMERO|N[º°]))?\s*[:#-]?\s*([0-9]{1,3}\s*-\s*[0-9]{4,}|[0-9]{5,})(?=\s|$|[.,;:])/);
    const prefixedOrder = text.match(/(?:^|\s)(?:OS|ORDEN DE SERVICIO)(?:\s+(?:NRO|NUMERO))?\s+([0-9]{1,3})\s+([0-9]{4,})(?:\s|$)/);
    const plainOrder = text.match(/(?:^|\s)(?:OS|ORDEN DE SERVICIO)(?:\s+(?:NRO|NUMERO))?\s+([0-9]{5,})(?:\s|$)/);
    if (rawOrder?.[1]) filters.os = compactIdentifier(rawOrder[1]);
    else if (prefixedOrder?.[1] && prefixedOrder[2]) filters.os = `${prefixedOrder[1]}-${prefixedOrder[2]}`;
    else if (plainOrder?.[1]) filters.os = plainOrder[1];
  }
  if (allowed.has("factura")) {
    const invoiceMatch = rawText.match(/(?:^|\s)FACTURA(?:\s+(?:NRO|NUMERO|N[º°]))?\s*[:#-]?\s*((?:[0-9]{1,3}\s*-\s*){2}[0-9]{5,}|[0-9]{5,})(?=\s|$|[.,;:])/);
    if (invoiceMatch?.[1]) filters.factura = compactIdentifier(invoiceMatch[1]);
  }
  if (allowed.has("trabajo")) {
    const workMatch = rawText.match(/\bTR\s*-\s*([0-9]{1,})\b/);
    if (workMatch?.[1]) filters.trabajo = `TR-${workMatch[1]}`;
  }
  if (allowed.has("codigo_producto")) {
    const productMatch = rawText.match(/(?:CODIGO (?:DE )?(?:PRODUCTO|REPUESTO|FABRICANTE)|COD\.?(?: PROD\.?)?)\s*[:#]?\s*([A-Z0-9][A-Z0-9._/-]{1,})(?=\s|$|[,;:])/);
    if (productMatch?.[1]) filters.codigo_producto = compactIdentifier(productMatch[1]);
  }
  if (dataset === "parque" && allowed.has("serie")) {
    const prefixMatch = rawText.match(/(?:CHASIS|SERIE)(?: QUE)? (?:EMPIEZA|EMPIECEN|COMIENZA|COMIENCEN)(?: POR| CON)? ([A-Z0-9][A-Z0-9-]{1,})/)
      ?? rawText.match(/(?:CHASIS|SERIE) (?:PREFIJO )?([A-Z0-9][A-Z0-9-]{1,})/);
    if (prefixMatch?.[1]) filters.serie = prefixMatch[1];
  }
  return filters;
}

/**
 * Pide una aclaracion solo cuando distintas definiciones validas producirian
 * cifras distintas. Una repregunta conserva el plan anterior y no se frena.
 */
export function detectSemanticAmbiguity(
  question: string,
  previousPlan?: GenericQueryPlan,
): SemanticClarification | null {
  const text = normalizeText(question);
  if (!text || (previousPlan && isFollowUp(text))) return null;

  const asksClients = hasAny(text, ["CUANTOS CLIENTES", "CANTIDAD DE CLIENTES", "TOTAL DE CLIENTES", "CLIENTES HAY"]);
  const clientSourceIsClear = hasAny(text, [
    "FACTUR", "VENTA", "COMPROBANTE", "PARQUE", "MAQUINA", "PROPIETARIO",
    "AGENDA", "CONTACT", "SEGUIMIENTO", "GESTION COMERCIAL", "ORDEN DE SERVICIO", " OS ",
  ]);
  if (asksClients && !clientSourceIsClear) {
    return {
      id: "clientes_sin_universo",
      message: "Que universo de clientes queres consultar? Cada opcion tiene una definicion distinta.",
      options: ["Clientes facturados", "Clientes del parque activo", "Clientes con seguimiento comercial", "Clientes con OS"],
    };
  }

  const asksHours = hasAny(text, ["CUANTAS HORAS", "CANTIDAD DE HORAS", "TOTAL DE HORAS", "HORAS POR"]);
  const hourSourceIsClear = hasAny(text, [
    "FACTUR", "SERVICIO FACTURADO", " OS ", "ORDEN DE SERVICIO", "PRODUCTIV",
    "JORNADA", "PLANIFICADOR", "CALENDARIO",
  ]);
  if (asksHours && !hourSourceIsClear) {
    return {
      id: "horas_sin_fuente",
      message: "Que horas queres medir? No son equivalentes entre si.",
      options: ["Horas facturadas", "Horas de OS", "Horas de jornadas de la app"],
    };
  }

  const asksServices = hasAny(text, ["CUANTOS SERVICIOS", "CANTIDAD DE SERVICIOS", "TOTAL DE SERVICIOS"]);
  const serviceSourceIsClear = hasAny(text, ["FACTUR", "RUBRO", " OS ", "ORDEN DE SERVICIO", "TRABAJO", "JORNADA"]);
  if (asksServices && !serviceSourceIsClear) {
    return {
      id: "servicios_sin_fuente",
      message: "Cuando decis servicios, queres contar OS, trabajos de la app o lineas facturadas de Servicio?",
      options: ["Ordenes de servicio", "Trabajos de la app", "Lineas facturadas de Servicio"],
    };
  }

  return null;
}

function planFromParts(
  dataset: BusinessDataset,
  text: string,
  rawQuestion: string,
  explicitFilters: SemanticRecord,
  inheritedPlan?: GenericQueryPlan,
) {
  const metrics = inheritedPlan && isFollowUp(text) && !hasExplicitMetricSignal(dataset, text)
    ? inheritedPlan.metrics
    : inferDatasetMetrics(dataset, text);
  const inferredDimensions = inferDimensions(dataset, text);
  const dimensions = inferredDimensions.length ? inferredDimensions : inheritedPlan?.dimensions ?? [];
  const filters = {
    ...(inheritedPlan?.filters ?? {}),
    ...inferCanonicalFilters(dataset, text, rawQuestion),
    ...explicitFilters,
  };
  const granularity = dimensions.includes("periodo") ? detectGranularity(text) : inheritedPlan?.granularity ?? "month";
  const limit = requestedLimit(text);
  const ordersByLatestDate = dataset === "importaciones" && hasAny(text, ["ULTIMA IMPORTACION", "ULTIMA CARGA", "ARCHIVO MAS RECIENTE"]);
  return validateGenericPlans({ queries: [{
    dataset,
    metrics,
    dimensions,
    filters,
    granularity,
    order_by: ordersByLatestDate ? "fecha" : metrics[0],
    order_direction: ordersByLatestDate ? "desc" : hasAny(text, ["MENOR", "MENOS", "ULTIMO"]) ? "asc" : "desc",
    limit: ordersByLatestDate ? 1 : inheritedPlan && isFollowUp(text) ? Math.max(inheritedPlan.limit, limit) : limit,
  }] }, explicitFilters, 1).plans[0] ?? null;
}

/**
 * Compila preguntas frecuentes de negocio usando el catalogo, no respuestas
 * codificadas. El modelo queda para preguntas compuestas o ambiguas.
 */
export function compileSemanticPlan(
  question: string,
  explicitFilters: SemanticRecord = {},
  previousPlan?: GenericQueryPlan,
): CompiledSemanticPlan | null {
  const text = normalizeText(question);
  if (!text) return null;
  const intentPlan = buildIntentFallbackPlan(question, explicitFilters);
  if (intentPlan) return { plan: intentPlan, confidence: 1, reasons: ["regla semantica canonica"], inherited: false };

  if (previousPlan && isFollowUp(text)) {
    const plan = planFromParts(previousPlan.dataset, text, question, explicitFilters, previousPlan);
    return plan ? { plan, confidence: 0.96, reasons: ["continuidad de consulta", "plan anterior validado"], inherited: true } : null;
  }

  const ranked = scoreDatasets(text);
  const best = ranked[0];
  if (!best || best.score === 0) return null;
  const plan = planFromParts(best.dataset, text, question, explicitFilters);
  if (!plan) return null;
  const hasDimension = plan.dimensions.length > 0;
  const confidence = Math.min(0.96, 0.68 + best.score * 0.09 + (hasDimension ? 0.08 : 0));
  return {
    plan,
    confidence,
    reasons: [`dataset ${best.dataset}`, hasDimension ? "dimension explicita" : "metrica agregada"],
    inherited: false,
  };
}
