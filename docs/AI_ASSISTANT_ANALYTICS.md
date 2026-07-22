# Arquitectura analitica del asistente

## Objetivo

El asistente debe contestar preguntas nuevas sobre los datos de Servicios Tecnicos CDM sin depender de respuestas programadas pregunta por pregunta. La IA interpreta la intencion; los numeros se calculan en el servidor mediante un catalogo semantico y consultas controladas.

## Flujo de una pregunta

1. La Edge Function valida el JWT y confirma el rol `admin`.
2. El control de alcance rechaza secretos, autenticacion, seguridad y preguntas ajenas al negocio.
3. Se detectan fuente, metrica, dimensiones, periodo y filtros.
4. Las preguntas comunes se compilan localmente, sin gastar una llamada al modelo.
5. Para preguntas complejas, el modelo genera solamente un plan JSON basado en el catalogo.
6. El servidor valida el plan y rechaza datasets, metricas, dimensiones o filtros desconocidos.
7. El motor consulta fuentes permitidas y calcula agregados con reglas canonicas.
8. Un renderizador determinista responde siempre que el resultado sea estructurable. La IA redacta solo los casos analiticos que requieren interpretacion.
9. La respuesta informa periodo, filtros y fuentes consultadas.

La IA nunca genera ni ejecuta SQL.

## Catalogo semantico

La fuente de verdad vive en `supabase/functions/_shared/assistant-semantic.ts`. Cada dataset declara:

- significado de negocio;
- tabla o vista de origen;
- granularidad de cada fila;
- fecha canonica;
- clave estable para conteos distintos;
- metricas permitidas;
- dimensiones permitidas;
- alias de lenguaje natural.

Datasets cubiertos:

- facturacion;
- ordenes de servicio;
- trabajos macro;
- jornadas operativas;
- tecnicos;
- no disponibilidades;
- parque de maquinas;
- agenda comercial;
- contactos de clientes;
- historial de trabajos;
- importaciones;
- dias no laborales.

## Definiciones canonicas

- Facturas, clientes, OS y trabajos se cuentan por claves estables, no por filas importadas.
- Productividad tecnica usa OS y horas de OS. Solo usa jornadas si la pregunta las menciona expresamente.
- `Absorve CDM` y `Absorbe CDM` equivalen a `Interno`.
- `Facturar a cliente` equivale a `Cliente`.
- Una jornada `Completado` es realizada y `Cancelada` es no realizada.
- Un trabajo `Abierto` agrupa `Pendiente`, `Programado` e `Iniciado`; `Pausado` queda separado.
- Contactos del maestro y gestiones comerciales son conceptos distintos.
- El contexto de pantalla solo se aplica cuando la pregunta dice, por ejemplo, `periodo visible`, `estos filtros` o `esta seleccion`.

## Conversacion y contexto

Una repregunta corta hereda el ultimo plan valido. Por ejemplo, despues de preguntar por horas facturadas por tipo de tiempo, `Y este mes?` conserva fuente, metrica y desglose, y cambia solamente el periodo.

La seccion abierta no limita al asistente. Se puede preguntar por facturacion desde Planificador o por OS desde Parque. Los filtros visuales son una ayuda opcional, no una frontera de datos.

## Como ampliar capacidades

Para incorporar un dato nuevo:

1. agregar o ampliar su dataset en el catalogo;
2. declarar metricas, dimensiones, clave estable y fecha canonica;
3. implementar la carga controlada de filas en `loadBusinessRows`;
4. mapear dimensiones y metricas en el motor;
5. agregar preguntas representativas al contrato de cobertura;
6. ejecutar `npm run test:assistant` y `npm run build`.

No se deben agregar ramas que respondan frases concretas. Una mejora valida amplia una definicion, una metrica, una dimension, un filtro o una regla conversacional reusable.

## Seguridad

- Acceso exclusivo para administradores verificados en servidor.
- Service role confinada a la Edge Function.
- Catalogo y validacion estricta; sin nombres de tabla enviados por el modelo.
- Consultas de solo lectura y resultados limitados.
- Sin credenciales, secretos, tokens ni configuracion de autenticacion en respuestas.
- Conversaciones y auditoria asociadas al usuario propietario.

## Calidad y despliegue

La bateria automatizada cubre catalogo, compilador, contexto, entidades, renderizado y preguntas representativas de todos los dominios. El despliegue de la Edge Function se hace una sola vez por version completa; no se requiere redesplegar por cada pregunta nueva cubierta por el mismo modelo semantico.

Antes de produccion se debe validar una matriz de preguntas reales contra las cifras visibles en la app, incluyendo totales, rankings, desgloses, periodos, filtros y repreguntas.
