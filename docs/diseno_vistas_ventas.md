# Diseño de las vistas de Ventas — vista del negocio primero, detalle después

Referencia de interacción: la sección "Facturación" del dashboard viejo. NO rehacer
de cero: reutilizar su presentación, pero verificando que los cálculos respeten las
definiciones de ESTE documento. Combinar lo mejor de cada versión.

Principio corregido (del propio usuario): el error previo fue tratar las 3 áreas como
un explorador de facturas genérico y resolver falta de espacio empeorando la lectura
(ej. tarjetas de clientes). Se invierte: recuperar una VISTA DEL NEGOCIO antes del detalle.

Orden de construcción: Servicios primero (panorama + detalle + análisis resueltos en una
misma pantalla), y con esa composición lista, adaptar Repuestos y Máquinas.

---

## 1. PANORAMA mensual — la entrada principal, compacto

- **Meses en FILAS** (no en columnas), importes alineados, desglose propio de cada área.
- Compacto — es lo primero que se ve, pero no debe ocupar toda la pantalla.
- **Plegable**: poder colapsar el panorama para trabajar el detalle sin tanto scroll.
- **Al seleccionar un mes**: el detalle inferior se filtra a ese mes, con una forma
  CLARA de volver al período completo (no dejar al usuario atrapado en un mes).
- **Sin gráfico por ahora** — la tabla compacta alcanza; el gráfico se evalúa después.

Desglose por área:
- Servicios: Mes | Total | MO | Km | Repuestos(OS) | Otros | Fact. | Clientes | Var.
- Repuestos: Mes | Total | (familia/marca si existe) | Fact. | Clientes | Var.
- Máquinas: Mes | Total | (marca si aplica) | Fact. | Clientes | Var.

---

## 2. DETALLE de Servicios — cuánto se facturó por cada OS

Columnas: OS | Cliente | Sucursal | Cant. facturas | MO | Km | Repuestos | Otros | Total.
Mejoras:
- **Agregar CHASIS** desde la OS vinculada. Si una OS tiene varias máquinas, mostrar
  los chasis correspondientes. **Si falta la relación, NO inferirla** (dejar vacío).
- **El importe debe rotularse "Facturado en el período"**, no "valor de la OS": una OS
  puede tener facturas fuera del rango seleccionado, así que este importe NO representa
  necesariamente su valor completo. Esto evita leer mal el número.

(Repuestos y Máquinas conservan su detalle actual, que ya está bien: líneas de repuesto
con código/descripción/cant/importe; y modelo/chasis/importe respectivamente.)

---

## 3. ANÁLISIS (tabla dinámica) — flexible pero con sentido por área

Recuperar la tabla dinámica VIEJA (mejor que la de Codex) e intercambiar filas/columnas
libremente entre las dimensiones ÚTILES de cada área:

| Área      | Dimensiones para cruzar |
|-----------|--------------------------|
| Servicios | Mes, Sucursal, Cliente, Componente |
| Repuestos | Mes, Sucursal, Cliente, Código de repuesto, Código de fabricante; Marca/Familia cuando existan |
| Máquinas  | Mes, Sucursal, Cliente, Marca, Subgrupo, Modelo normalizado |

Reglas:
- **OS, factura y chasis** quedan como IDENTIFICADORES del detalle, NO como dimensiones
  de cruce por defecto — evita ofrecer cruces casi 1:1 que aportan poco.
- **Impedir seleccionar la misma dimensión en ambos ejes** (fila = columna no tiene sentido).
- Mes debe poder ir tanto en filas como en columnas.

---

## 4. COMPARACIONES — definición visible y consistente (crítico)

- **Panorama**: variación contra el MES ANTERIOR, con ese encabezado explícito ("vs mes anterior").
- **Clientes**: comparación contra el MISMO PERÍODO DEL AÑO ANTERIOR, rotulado.
- **NO comparar un mes incompleto contra uno completo** (ej. septiembre a mitad vs agosto full).
- **NO calcular porcentajes al cruzar el cambio de metodología del histórico** (legacy vs nuevo).
- **Sin datos NO es cero.** Pasar de cero a un importe positivo NO debe producir un
  porcentaje ficticio (evitar el "+100%"/"-100%" engañoso que hoy aparece en meses vacíos).

> Esta sección es clave: son las reglas que evitan que el tablero muestre números que
> mienten. Un porcentaje mal calculado en una comparación es peor que no mostrarlo.

---

## 5. CLIENTES — lista comparativa (usar la versión nueva, acotada)

Conservar: facturación, participación %, facturas, última compra, comparación anual.
- En Servicios, sumar **OS identificadas**.
- Clic en un cliente → ver sus operaciones CONSERVANDO los filtros activos.
- NO llenar la tabla de indicadores que no ayuden a comparar o decidir (menos es más).

---

## 6. TOTALES y NOTAS DE CRÉDITO — cuidado especial

- Importes: se suman los NETOS.
- **Clientes y facturas: contar SIN duplicados.** Una factura con MO + repuestos es UNA
  factura, no dos. (Cuidado al agregar por línea: no inflar el conteo de facturas/clientes.)
- **Notas de crédito**: etiqueta discreta + importe negativo claramente visible.
  Un importe negativo por sí solo NO basta para identificar el documento como nota de
  crédito — usar el tipo de documento real (canonical_document_kind), no el signo.

---

## Orden de trabajo
1. Servicios primero: resolver panorama + detalle + análisis en una misma pantalla,
   revisándolo juntos en vivo.
2. Con esa composición aprobada, adaptar Repuestos y Máquinas (misma estructura, sus
   dimensiones y campos propios).
3. Reutilizar la presentación del dashboard viejo, pero cada cálculo verificado contra
   las definiciones de este documento (sobre todo sección 4 y 6).
