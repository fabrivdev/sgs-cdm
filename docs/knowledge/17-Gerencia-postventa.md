---
project: sig-cdm
type: propuesta
status: propuesta
module: gerencia
tags:
  - sig-cdm
  - propuesta
---

# Gerencia — actividad real de Servicios

Parte del [[15-Panel-gerencial]]. Necesidad registrada: separar lo trabajado en el mes de la facturación emitida en el mes. Fuente del acuerdo: `docs/pendientes-postventa.md` y [[08-Pendientes-y-validacion]].

## Decisiones

Reasignar atención/capacidad, destrabar trabajos pendientes y revisar lo realizado que todavía no tiene facturación identificada. No usar el ranking de ventas como ranking de productividad técnica.

## Instrumento propuesto: trabajo realizado sin cobertura comprobada

Población: intervenciones efectivamente realizadas en el período, no todas las OS facturadas en ese mes. Aplicar exclusiones, vigencia y validación; no tratar una jornada planificada como realizada por su fecha solamente.

Mostrar cantidad de OS identificadas y horas-persona de la población de trabajo, separando: con factura válida identificada; sin factura identificada; vínculo ambiguo/no verificable. Mantener Garantía e Interno separados de Cliente; la ausencia de factura puede ser esperable y no equivale a mora de facturación.

Cobertura financiera se observa hasta una fecha de corte visible. Una factura posterior al mes puede cubrir trabajo del mes sin entrar en la venta de ese mes. Una OS facturada parcialmente no permite asegurar que todas sus horas quedaron facturadas: no prorratear horas por importe sin una regla aprobada y vínculos suficientes. El indicador agregado definitivo queda pendiente de validar esa granularidad.

## Diagnósticos y límites

Horas-persona realizadas = suma válida por participante, después de deduplicación y exclusiones. Horas OS = bloques únicos operativos según la regla vigente; no es el mismo denominador. Para bloques que atraviesen el límite de mes, definir recorte por intervalo y zona horaria antes de calcular.

Pendientes y antigüedad por trabajo/OS explican la cola, pero no constituyen compromisos vencidos si no hay fecha acordada. No publicar eficiencia ni utilización sin capacidad disponible, ausencias, feriados y definición de tiempo productivo aprobados.

## Dependencias

[[SIG CDM/Generado/Entidades/trabajo|Trabajo]], [[SIG CDM/Generado/Entidades/jornada|Jornada operativa]], [[SIG CDM/Generado/Entidades/jornada-comision|Jornadas técnicas]], [[SIG CDM/Generado/Entidades/OS|OS]] y [[SIG CDM/Generado/Entidades/factura|Factura]]. Reglas: [[SIG CDM/Generado/Reglas/horas-os-persona|Horas]], [[SIG CDM/Generado/Reglas/tiempo-manual|Correcciones manuales]], [[SIG CDM/Generado/Reglas/exclusion-os|Exclusiones]] y [[02-Servicios-y-comisiones]].

## Aceptación

Probar trabajo en julio facturado en agosto, trabajo del mes facturado después, OS parcialmente cubierta, trabajo interno/garantía, varios técnicos y OS reemplazada. Nunca resucitar horas excluidas ni autorizar pagos desde el panel. La liquidación continúa en [[SIG CDM/Generado/Pantallas/servicios-comisiones|Comisiones]].
