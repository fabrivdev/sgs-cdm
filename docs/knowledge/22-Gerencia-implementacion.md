---
project: sig-cdm
type: propuesta
status: propuesta
module: gerencia
tags:
  - sig-cdm
  - propuesta
---

# Panel gerencial — construcción por etapas

Plan del [[15-Panel-gerencial]]. Implementación funcional pendiente de autorización separada; esta tarea construye la propuesta documental.

## Estados del conocimiento

Idea → Propuesta → Diseño aprobado → Implementado localmente → Validado en producción. Cada promoción requiere evidencia y fecha. Tener una nota conectada no implica que el módulo existe, que una migración está aplicada o que su indicador ya es medible.

## Etapas propuestas

1. Confirmar alcance, prioridades y pedido original; revisar dashboard actual para no duplicar entradas ni romper consumidores.
2. Aprobar contratos: población, granularidad, fecha/corte, unidades/moneda, filtros, fuente canónica, exclusiones, cobertura, responsable y acción de cada indicador.
3. Prototipar lectura y navegación sin datos comerciales ficticios presentados como reales. Primera versión: resultado comercial conciliado y enlaces operativos; indicadores sin fuente suficiente permanecen pendientes.
4. Implementar lecturas agregadas acotadas y alertas por evidencia; añadir trabajo real como sección propia, no cambiar la definición de Ventas.
5. Validar contra detalles y casos extremos, comprobar permisos reales y rendimiento; registrar evidencia de producción antes de declarar completado.

## Diseño técnico a evaluar

Reutilizar contratos fiables de los módulos, no copiar cálculos a un componente gigantesco. Bloques independientes con timeout, estado de error y actualización controlada; carga diferida para detalle. Evaluar snapshots/cache solo con política visible de frescura y reconciliación tras cargas/correcciones/exclusiones.

No elevar límites de consulta como sustituto de optimización. No ejecutar cinco exports completos para producir tarjetas. Cualquier nueva RPC/migración debe revisarse y entregarse para aplicación manual del usuario, sin suponer que push actualiza la base.

Punto de partida: [[SIG CDM/Generado/Codigo/src__pages__Dashboard_tsx|Dashboard.tsx]], [[SIG CDM/Generado/Pantallas/servicios-dashboard|Dashboard actual]], [[SIG CDM/Generado/Modulos/administracion|Accesos]] y [[SIG CDM/Generado/Modulos/datos|Datos]]. El prototipo de Panorama está solo en `feat/campi-panorama`; `main` conserva la bienvenida «Muy pronto». La rama explora una configuración de hasta tres intereses entre 19 secciones de negocio autorizadas, sin indicadores publicados ni permiso adicional. Ver [[36-Campi-bienvenida]]. Siguen pendientes las decisiones sobre datos, sucursales, alertas y fuente de cada KPI.

## Pruebas de aceptación previstas

- Mismo período/sucursal/moneda: conciliación financiera sin solapamiento de repuestos OS ni duplicados GRID.
- Trabajo en un mes, factura en otro: separación de perspectivas y cobertura al corte.
- OS anulada/reemplazada: no resucitar estadísticas ni jornadas pagables.
- Lote con recepción parcial: conteos unitarios y fechas individuales.
- NC, datos ambiguos, rango inválido y source caída: no ceros/porcentajes ficticios.
- Gerente sin acceso a un módulo: no fuga de detalle ni de agregados; autorización servidor, no solo menú.
- Evidencia de comparación histórica y snapshot: no inventar series retrospectivas.

## Registro de decisiones pendientes

Metas, alertas/severidades, responsables, plazos, alcance de sucursales, base monetaria, frescura y presupuesto de latencia se aprobarán antes de implementar. Margen, caja y productividad quedan fuera de la primera versión mientras falten fuentes/reglas fiables. Relación con ampliaciones: [[23-Modulos-futuros]].
