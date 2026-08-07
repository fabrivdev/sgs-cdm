-- Vista pivot de stock: una fila por producto, una columna por sucursal
-- (mas Total), para la matriz de existencias del modulo Repuestos. Se
-- agrega/agrupa en Postgres en vez de traer las ~18.310 filas de
-- repuestos_stock al browser y pivotear ahi -- mismo criterio que ya se
-- uso para v_compras_pedidos_resumen.
--
-- Las 6 sucursales son un enum fijo (public.sucursal / SUCURSALES en
-- constants.ts), asi que se hardcodean como columnas via FILTER en vez de
-- un crosstab dinamico.
create or replace view public.v_repuestos_stock_matriz as
select
  p.codigo_interno,
  p.descripcion,
  p.codigo_fabricante,
  p.marca,
  p.familia,
  p.unidad,
  coalesce(sum(rs.saldo_actual) filter (where rs.sucursal = 'Santa Rita'), 0) as santa_rita,
  coalesce(sum(rs.saldo_actual) filter (where rs.sucursal = 'Santa Rosa'), 0) as santa_rosa,
  coalesce(sum(rs.saldo_actual) filter (where rs.sucursal = 'Campo 9'), 0) as campo_9,
  coalesce(sum(rs.saldo_actual) filter (where rs.sucursal = 'Misiones'), 0) as misiones,
  coalesce(sum(rs.saldo_actual) filter (where rs.sucursal = 'Loma Plata'), 0) as loma_plata,
  coalesce(sum(rs.saldo_actual) filter (where rs.sucursal = 'Katuete'), 0) as katuete,
  coalesce(sum(rs.saldo_actual), 0) as total
from public.productos p
left join public.repuestos_stock rs on rs.producto_codigo = p.codigo_interno
-- Este catalogo es de Repuestos: el maestro de TOTVS trae tambien activos
-- fijos, mercaderia y otros rubros con otros prefijos de codigo -- mismo
-- filtro que ya usa el catalogo/busqueda de Repuestos.
where p.codigo_interno ilike 'REP%'
group by p.codigo_interno, p.descripcion, p.codigo_fabricante, p.marca, p.familia, p.unidad;

-- Sin esto la vista corre con los privilegios de quien la creo (la
-- migracion), saltandose RLS de productos/repuestos_stock -- ya nos paso
-- este bug con las vistas de Compras.
alter view public.v_repuestos_stock_matriz set (security_invoker = true);
