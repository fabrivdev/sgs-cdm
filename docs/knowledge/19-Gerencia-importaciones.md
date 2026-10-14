---
project: sig-cdm
type: propuesta
status: propuesta
module: gerencia
tags:
  - sig-cdm
  - propuesta
---

# Gerencia — abastecimiento e importaciones

Parte del [[15-Panel-gerencial]]. Decisión: qué unidades están demoradas, qué recepción hay que confirmar y qué diferencia con el proveedor requiere revisión. Base: [[05-Importaciones]].

## Diagnósticos candidatos

Unidades por estado logístico y ETA efectiva individual. Contar unidades, no filas de cabecera ni lotes. Mostrar vencimiento de una previsión de embarque como tal; no llamarlo retraso de arribo si la ETA disponible significa embarque.

Arribadas sin stock confirmado: fecha real de arribo y chasis presentes, sin coincidencia única de existencia física positiva. Identificar conflictos de chasis aparte. Una unidad reservada sí puede completar su recepción física.

Diferencia proveedor menos OC: calcular por unidad/alcance compatible, moneda y base consistentes. No sumar USD con EUR; no contar un total OC de cabecera una vez por cada unidad. Valor OC, factura proveedor y costo definitivo de stock siguen siendo tres valores distintos.

## Vista propuesta

Tabla breve: unidad/llave, OC, marca/modelo, estado, previsión efectiva, arribo, bloqueo y siguiente acción. En lotes parciales, tres unidades adelantadas no cambian la previsión de las siete restantes. La llave CLAAS es única por unidad.

## Dependencias

[[SIG CDM/Generado/Entidades/unidad-importacion|Unidad]], [[SIG CDM/Generado/Entidades/OC|OC]], [[SIG CDM/Generado/Entidades/factura-proveedor|Factura proveedor]], [[SIG CDM/Generado/Flujos/recibir-importacion|Recepción]], [[SIG CDM/Generado/Reglas/herencia-independiente|Herencia independiente]] y [[SIG CDM/Generado/Reglas/llegada-fisica|Confirmación física]]. Relación comercial con [[18-Gerencia-parque]]; alertas con [[21-Gerencia-alertas]].

## Aceptación

Probar lote con embarques divididos, unidad 1/1, OC total/unitaria, monedas distintas, reserva en stock, arribo sin chasis y chasis ambiguo. Montos/documentos faltantes se informan como incompletos; no se reconstruyen desde costo stock sin evidencia.
