# Migracion nuevo sistema: datos indispensables

## Corte historico

- Historico legado congelado hasta `2026-06-30`
- Nuevo sistema operativo desde `2026-07-01`
- Regla base:
  - nunca reescribir filas del historico legado
  - si una fila pertenece al nuevo sistema, se puede reemplazar dentro de su propio rango

## 1. Facturacion: prioridad maxima

La facturacion es la fuente principal para:

- venta real del periodo
- analisis por cliente
- analisis por sucursal
- rubro facturado
- repuestos / servicios / kilometraje / otros
- comparativos ejecutivos

### Campos minimos obligatorios

- fecha de emision
- cliente codigo o clave estable
- cliente nombre
- sucursal / filial
- numero de factura
- documento
- codigo de producto
- descripcion producto
- cantidad
- valor unitario
- total
- moneda
- condicion de pago

### Campos muy recomendables

- tipo o especie del comprobante
- fecha de vencimiento
- tipo de cambio
- iva o alicuota

### Regla fiscal

Si la linea expone base y tambien menciona IVA:

- IVA 10% => total final = base * 1.10
- IVA 5% => total final = base * 1.05
- Exento => total final = base

## 2. Ordenes de servicio

Las OS sirven para:

- cruzar facturas contra trabajos ligados a servicio
- distinguir Cliente vs Garantia vs Interno
- traer tecnico, sucursal, marca, chasis, problema y contexto operativo

### Campos minimos obligatorios

- numero OS
- fecha apertura
- estado OS
- cliente facturado / cliente del equipo
- sucursal
- tecnico
- documento o numero de factura asociado
- tipo de tiempo
- codigo producto
- descripcion producto
- cantidad
- total

### Campos de valor operativo

- marca
- grupo
- modelo
- chasis
- problema
- fabricante codigo

## 3. Maestro de productos

Se usa para enriquecer lineas de facturacion y OS con:

- marca
- familia
- grupo
- descripcion normalizada

### Campos minimos

- codigo interno
- codigo fabricante
- descripcion
- marca
- grupo
- familia
- estado

## 4. Reglas de negocio clave

### Venta directa

Si una factura no se puede asociar a una OS, se considera venta directa al cliente.

### Cliente / Garantia / Interno

La clasificacion final del tiempo debe salir del cruce con OS cuando exista:

- `Cliente`
- `Garantia`
- `Interno`

La factura sola no debe inventar ese dato si la OS lo trae mejor.

### Enriquecimiento por producto

Si la linea no trae marca o rubro suficiente:

- primero intentar por codigo interno
- luego por codigo fabricante
- si no matchea, queda pendiente de clasificacion

## 5. Orden de implementacion

1. Parser XML Spreadsheet 2003
2. Mapeo canonico de Facturacion / OS / Productos
3. Regla fiscal IVA
4. Cruce Facturacion ↔ OS por documento / factura
5. Enriquecimiento con Maestro de productos
6. Encapsulado historico legado vs nuevo sistema
7. Recien despues: UI de importacion y dashboards
