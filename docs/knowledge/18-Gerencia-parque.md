---
project: sig-cdm
type: propuesta
status: propuesta
module: gerencia
tags:
  - sig-cdm
  - propuesta
---

# Gerencia — Parque y pedidos

Parte del [[15-Panel-gerencial]]. Decisión: qué máquinas/pedidos requieren asignación, recepción o seguimiento comercial. Base local: [[04-Parque-y-operaciones]].

## Vista propuesta

Mostrar existencia física por unidad/chasis y su disponibilidad comercial: libre, reservada u otra condición vigente. Desglosar marca/tipo/modelo y Nueva/Usada; agrupación comercial CLAAS/HORSCH/OTROS sin destruir las marcas originales.

Relacionar pedidos pendientes con unidades cubiertas/faltantes cuando exista vínculo inequívoco. Conteo de pedidos únicos y conteo de unidades pendientes se muestran separados. Una NP no equivale a factura ni a venta reconocida.

## Stock proyectado implementado

La pantalla operativa de Stock proyectado materializa una parte de esta necesidad para máquinas nuevas, agrupada por marca, tipo y modelo. Usa apertura al 31/08/2026, OC pendientes y ventas pendientes; permite retroceder únicamente hasta esa apertura. No reemplaza el inventario físico por chasis ni incluye usadas. Factura, NC, ATA y NP posteriores al corte modifican el saldo según [[04-Parque-y-operaciones#Stock proyectado de máquinas nuevas]].

El total proyectado es una estimación operacional, no disponibilidad física certificada. Ajustes históricos, contradicciones de la apertura y SQL no aplicado deben permanecer visibles como límites; no presentar compilación o fixtures como cifra productiva.

## Indicadores diagnósticos candidatos

- Unidades físicamente existentes sin reserva comercial comprobada: snapshot actual, no serie histórica inventada.
- Pedidos con unidades sin abastecimiento/asignación válida: una unidad no puede cubrir dos compromisos simultáneos.
- Compromisos de entrega vencidos: solo si la fecha comprometida y la entrega efectiva están disponibles. No usar ETA de proveedor ni fecha de creación como promesa al cliente.

El último puede alimentar el instrumento común de [[21-Gerencia-alertas|compromisos vencidos]]. Dueño, comprador facturado y stock propio son perspectivas distintas; preservar incertidumbre y el nombre canónico CAMPOS DEL MAÑANA S.A.

## Dependencias

[[SIG CDM/Generado/Entidades/NP|NP]], [[SIG CDM/Generado/Entidades/stock-maquina|Stock]], [[SIG CDM/Generado/Entidades/cliente|Cliente]], [[SIG CDM/Generado/Flujos/gestionar-np|Proceso de pedido]] y [[SIG CDM/Generado/Pantallas/parque-stock|Pantalla de stock]]. Abastecimiento físico conectado con [[19-Gerencia-importaciones]], resultado comercial con [[16-Gerencia-ventas]].

## Aceptación y faltantes

Probar reservado en stock, arribo sin stock confirmado, pedido con varias unidades y edición administrativa sin retroceso de estado. Validar si existen fechas de compromiso/entrega aptas para gerencia; si no, registrar la necesidad del campo, sin implementarlo en esta etapa.
