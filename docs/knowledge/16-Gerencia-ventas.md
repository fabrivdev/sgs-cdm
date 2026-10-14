---
project: sig-cdm
type: propuesta
status: propuesta
module: gerencia
tags:
  - sig-cdm
  - propuesta
---

# Gerencia — resultados comerciales

Parte del [[15-Panel-gerencial]]. Decisión: ¿qué área/sucursal explica el resultado y dónde hay que profundizar? Responsable funcional propuesto: gerencia/comercial, por confirmar.

## Instrumento principal: facturación neta

Suma de importes canónicos de documentos emitidos en el período, con NC negativas, moneda/base explícitas y exclusiones persistentes. Granularidad de cálculo: línea canónica; conteos de documentos y clientes se recalculan por identidad única en el rango completo.

Diagnósticos: composición por área, sucursal y período comparable; ventas brutas y NC separadas. Ticket Medio = neto / documentos, con población de documentos explícita y sin división por cero. No es importe cobrado ni utilidad.

## Conciliación obligatoria

Separar los componentes monetarios que no se solapan: MO, km, repuestos, terceros, máquinas y otros. Ventas de Servicios puede incluir repuestos de OS; no sumar ese total a otro total que ya incluya esas mismas líneas. Cada componente tendrá detalle y puente de conciliación hacia los módulos.

Un faltante en vinculación OS/chasis no borra una línea financiera válida. Los costos de envío, intereses y merchandising conservados en Otros no deben transformarse en MO para cerrar una suma. No comparar series legacy/actuales de cobertura incompatible sin advertencia.

## Contrato de lectura propuesto

Período por fecha de factura, sucursal y búsqueda compartidas; marca/tipo solo donde sean dimensiones válidas. Mes seleccionado termina el último día calendario. Comparación mensual parcial contra corte equivalente; base ausente o nula se informa, no se inventa porcentaje.

Fuentes de partida: [[SIG CDM/Generado/Pantallas/servicios-ventas|Servicios]], [[SIG CDM/Generado/Pantallas/parque-ventas|Máquinas]], [[SIG CDM/Generado/Pantallas/repuestos-ventas|Repuestos]] y [[SIG CDM/Generado/Flujos/conciliar-dashboard|Conciliación del dashboard]]. Definición local: [[03-Ventas-y-conciliacion]]. Estado productivo y cifras pendientes de validación.

## Aceptación

Reconciliar rangos completos y parciales, NC, histórico, repuestos de OS y anulaciones contra detalle canónico. Todas las diferencias deben tener puente identificable, no ajustes para forzar coincidencia. Conectar excepciones con [[21-Gerencia-alertas]].
