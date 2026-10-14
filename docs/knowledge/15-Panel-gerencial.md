---
project: sig-cdm
type: propuesta
status: local-pendiente-validacion
module: gerencia
tags:
  - sig-cdm
  - propuesta
  - gerencia
---

# Panel de avión del gerente

## Estado vigente al 14/10/2026

Existe implementación local en panel-gerencial-v1 con consumidores RPC y migraciones locales; ya no corresponde describir el trabajo completo como una demo sin fuentes. Continúa fuera de main y no debe integrarse ni publicarse todavía. Ubicación y base en [[12-Estado-local]].

Pendientes: validar fórmula/fuentes de absorción, meses cerrados detectados automáticamente, actualización estable, carga total ≤5 segundos y aceptación visual del ajuste de redondeo. El 52,03% observado (198.897,20 / (300.299,01 + 81.953,47)) es una referencia técnica comunicada, no aprobación de fórmula ni cierre contable formal. No modificar el formato acordado ni exigir ajustes manuales mensuales.

Las propuestas siguientes conservan decisiones de diseño y antecedentes; no son un retrato del código actual ni autorizan inventar metas/datos. [[SIG CDM/Personal/Objetivos/05-Panel-gerencial|Objetivo personal]] conserva el prototipo previo como histórico.

## Para qué existe

Una entrada gerencial que permita responder: ¿cómo va el negocio?, ¿qué está trabado?, ¿qué requiere una decisión hoy? No reemplaza las pantallas operativas: resume y conduce al registro que permite actuar.

## Alcance y evidencia

El usuario pidió incorporar este panel futuro a la memoria de Obsidian y construir su propuesta. No se recuperó la especificación completa del pedido anterior. La composición siguiente es un diseño inicial por confirmar, no una reconstrucción literal ni autorización para desarrollar/publicar la pantalla.

Las reglas existentes de facturación, horas, NC, importaciones y stock son restricciones del diseño; los bloques, prioridades y navegación son propuestas. No se consultó producción ni se fijaron metas con cifras inventadas.

## Primera pantalla propuesta

| Zona | Contenido | Acción del gerente |
| --- | --- | --- |
| Contexto | Fecha de corte, período, sucursal, moneda y estado de fuentes | Saber qué está mirando y si puede confiar en ello |
| Tres instrumentos principales | Facturación neta; compromisos vencidos; trabajo realizado sin cobertura de facturación comprobada | Evaluar resultado, destrabar compromisos y revisar recuperación de trabajo |
| Atención hoy | Pocos casos priorizados, responsable, vencimiento, causa y vínculo al registro | Delegar, resolver o pedir revisión |
| Situación por área | Ventas, Servicios, Parque, Importaciones y Repuestos | Abrir el segmento que explica el problema |

Los dos instrumentos operativos quedan condicionados a validar fechas de compromiso y vínculos trabajo-factura. Si falta evidencia, se muestra “No medible” o cobertura parcial, nunca un cero ni una alerta roja ficticia. No sumar horas, dólares y unidades en un puntaje global.

## Segmentos conectados

- [[16-Gerencia-ventas|Resultados comerciales y facturación]].
- [[17-Gerencia-postventa|Trabajo real de Servicios y su recuperación]].
- [[18-Gerencia-parque|Parque, stock y pedidos comerciales]].
- [[19-Gerencia-importaciones|Abastecimiento e importaciones por unidad]].
- [[20-Gerencia-repuestos|Disponibilidad, compras y sugerencias de Repuestos]].
- [[21-Gerencia-alertas|Alertas, responsables y calidad de la evidencia]].
- [[22-Gerencia-implementacion|Etapas, permisos, rendimiento y aceptación]].
- [[23-Modulos-futuros|Posibles módulos posteriores]].

## Reglas de interacción propuestas

Revisión diaria de pendientes y semanal/mensual de resultados, cadencia a confirmar. Cada clic conserva contexto aplicable y anuncia cuando cambia de fecha de factura a fecha de trabajo o a snapshot actual. Stock y pendientes actuales no deben presentarse como snapshot histórico si no existe esa evidencia.

Comparar períodos equivalentes y cobertura comparable. El valor facturado no prueba cobro; la OC no prueba costo definitivo; una ETA no prueba llegada; reserva no elimina stock físico. No presentar margen, caja ni productividad sin sus denominadores y fuentes.

## Qué falta decidir

Confirmar el alcance del gerente y sus sucursales, recuperar requisitos anteriores, acordar tres prioridades reales, responsables, fechas de compromiso y reglas de severidad. Decidir si evolucionar el dashboard existente o crear una ruta gerencial separada después de revisar permisos y usos actuales.

## Estado local y formato final pendiente - 07/10/2026

Existe una implementación local en `/gerencial`, todavía sin autorización para subir a `main`. El orden acordado es: validar cada KPI con su fuente y filtros; aplicar después el formato final; ejecutar QA; y presentar el resultado al usuario antes de cualquier commit o publicación. Retomar únicamente por pedido expreso del usuario.

Referencia visual final: Library `libfile_06ceb4610ea48191bd5c128a7397dc80`. Sus valores, metas, series y colores son ejemplos visuales, no datos reales ni evidencia de KPI.

Disposición confirmada para aplicar sólo después de validar los KPI:

- `Resultado económico`: ocho tarjetas en grilla fija de cuatro columnas por dos filas, sin mover la estructura.
- Primera fila: Facturación general; Cumplimiento de meta de facturación; Facturado sobre pedidos; Margen bruto.
- Segunda fila: Gastos / ventas; EBITDA; Gastos financieros; ROA.
- Encabezado: icono, contador `8` y acción `Ver todos`.
- Debajo se ve únicamente el encabezado de `Capital y caja`, con `7 indicadores`; la referencia no autoriza inventar sus tarjetas.
- Tarjeta: título y menú de tres puntos; valor principal grande; porcentaje o variación subordinados; gráfico central de barras o línea según la naturaleza del KPI; meta/avance sólo si existe una meta real; franja inferior con dos datos y divisor vertical.
- Moneda USD y lectura compacta para dirección. No agregar explicaciones técnicas extensas en la cara principal.
- No copiar cifras, metas, series o colores de la referencia como datos validados. Estados sin evidencia permanecen desconocidos o provisionales.

Contexto visual orientativo independiente menciona quitar elementos marcados con `X`, separar círculos y jerarquizar el KPI principal frente al porcentaje. No ejecutarlo sin contrastar la referencia y recibir autorización al retomar. Las correcciones móviles entre secciones son un trabajo distinto y no reanudan este diseño gerencial.

## Base existente

[[SIG CDM/Generado/Pantallas/servicios-dashboard|Dashboard ejecutivo actual]] y [[SIG CDM/Generado/Codigo/src__pages__Dashboard_tsx|Dashboard.tsx]] son puntos de partida, no la implementación de esta propuesta. Reglas y fuentes locales: [[03-Ventas-y-conciliacion]], [[08-Pendientes-y-validacion]], `docs/diseno_vistas_ventas.md`, `docs/pendientes-postventa.md` y `docs/knowledge/mapa-negocio.json`.
