---
project: sig-cdm
type: propuesta
status: propuesta
module: gerencia
tags:
  - sig-cdm
  - propuesta
---

# Gerencia — disponibilidad y compras de Repuestos

Parte del [[15-Panel-gerencial]]. Decisión: qué abastecimiento revisar y qué compras requieren seguimiento. Fuentes locales: [[06-Repuestos]], pantallas y entidades del atlas. Ninguna cifra productiva calculada en esta propuesta.

## Diagnósticos candidatos

Productos con necesidad neta positiva en la última corrida válida y stock insuficiente, restringidos a demanda confirmada. La necesidad proviene de la versión del modelo/snapshot correspondiente; es sugerencia, no una orden automática ni una falta real de entrega al cliente.

Líneas de compra con cantidad pendiente = pedido menos entregado bajo la regla vigente, considerando cancelaciones y unidad de medida. Plazos vencidos solo con fecha comprometida válida. Contar líneas, productos y pedidos como medidas diferentes.

Cobertura de identidad/demanda: mostrar qué proporción de la población seleccionada carece de vínculo de producto comprobado. Definir el denominador antes de publicar el porcentaje; una línea financiera sin código confirmado no debe eliminarse de Ventas ni usarse ciegamente para comprar.

## Vista propuesta

Pocos casos accionables por sucursal/marca, con producto, stock, necesidad, pedido abierto, evidencia y vínculo a Compras/Sugerencias. No sumar cantidades de repuestos heterogéneos como si fueran máquinas equivalentes. No ofrecer cobertura en días si el modelo no acredita una tasa/horizonte aptos.

## Dependencias

[[SIG CDM/Generado/Pantallas/repuestos-stock|Stock]], [[SIG CDM/Generado/Pantallas/repuestos-compras|Compras]], [[SIG CDM/Generado/Pantallas/repuestos-sugerencias|Sugerencias]], [[SIG CDM/Generado/Entidades/corrida|Corrida]], [[SIG CDM/Generado/Entidades/demanda|Demanda]] y [[SIG CDM/Generado/Reglas/finance-vs-demanda|Finanzas vs demanda]]. Ventas se consulta en [[16-Gerencia-ventas]], no desde la cantidad recomendada por el modelo.

## Aceptación

Probar devoluciones/NC, producto ambiguo, pedidos parciales, corrida obsoleta y sucursales distintas. Carga gerencial acotada; no ejecutar export completo ni agregaciones caras para cada tarjeta.
