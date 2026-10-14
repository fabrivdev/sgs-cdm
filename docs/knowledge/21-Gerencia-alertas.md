---
project: sig-cdm
type: propuesta
status: propuesta
module: gerencia
tags:
  - sig-cdm
  - propuesta
---

# Gerencia — atención hoy y confianza

Parte del [[15-Panel-gerencial]]. Propuesta transversal, no mecanismo de avisos ya implementado.

## Instrumento principal: compromisos vencidos

Contar compromisos activos con fecha acordada menor que la fecha de corte y sin cumplimiento verificable. Identidad estable = origen + tipo de compromiso + registro/unidad. Excluir cancelados, cerrados efectivamente y duplicados; separar fecha de previsión de compromiso real.

No sumar alertas de diferentes etapas del mismo compromiso como compromisos distintos. Proponer una lista consolidada con múltiples causas por identidad y enlace al caso. Si faltan fechas/cumplimientos, mostrar cobertura y “No medible”; no inferir atraso por antigüedad solamente.

## Cada caso debe responder

Qué pasó; por qué importa; qué fuente lo demuestra; responsable propuesto/confirmado; plazo; siguiente acción; registro para revisar. Si no existe un responsable asignado, mostrar “Sin asignar”, no elegirlo por ser creador o vendedor.

Casos de partida: trabajo Cliente sin factura identificada para revisión, pedido sin unidad cubierta, importación arribada sin stock, compra pendiente vencida y fuente desactualizada. Las reglas finales y severidades requieren aprobación. No afirmar pérdida de dinero, doble pago o demora al cliente sin evidencia suficiente.

## Semáforos propuestos

Rojo/ámbar/verde solo con condición y umbral aprobados; gris para dato insuficiente; estado propio para error técnico. Un proveedor demoró, un documento falta y una consulta falló son tres causas distintas. No generar metas, SLA ni tolerancias económicas ficticias.

## Confianza y actualización

Mostrar origen y fecha de snapshot/carga donde estén disponibles; fecha de consulta no equivale a fecha de actualización de la fuente. Separar bloque listo, parcial, error y no autorizado. Nunca rellenar un timeout con cero o un número viejo sin advertencia.

Relaciones: [[SIG CDM/Generado/Modulos/datos|Calidad de datos]], [[SIG CDM/Generado/Reglas/loader-error|Errores y rangos]], [[SIG CDM/Generado/Reglas/acceso-servidor|Autorización]], [[17-Gerencia-postventa]], [[18-Gerencia-parque]], [[19-Gerencia-importaciones]] y [[20-Gerencia-repuestos]].

## Faltantes

Confirmar responsables, fuentes de compromisos/cumplimientos, persistencia de revisión/descarte y evidencia histórica. Confirmar si el gerente solo consulta/delega o también puede modificar registros; no ampliar permisos por ser un panel ejecutivo.
