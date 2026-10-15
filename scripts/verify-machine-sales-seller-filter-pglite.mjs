import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
try {
  await db.exec(`
    create role anon;
    create role authenticated;
    create schema auth;
    create type public.sucursal as enum ('Santa Rita');
    create function auth.uid() returns uuid language sql stable as $$ select '00000000-0000-0000-0000-000000000001'::uuid $$;
    create function public.has_section_access(uuid, text) returns boolean language sql stable as $$ select true $$;
    create function public.parque_normalizar_clave(text) returns text language sql immutable as $$ select $1 $$;
    create function public.normalizar_chasis_notificacion(text) returns text language sql immutable as $$ select $1 $$;
    create function public.maquinaria_normalizar_marca(text) returns text language sql immutable as $$ select upper($1) $$;
    create function public.parque_modelo_clave(text) returns text language sql immutable as $$ select lower($1) $$;
    create function public.ventas_normalizar_vendedor_maquinas(text) returns text language sql immutable as $$ select $1 $$;
    create table public.parque_maquinas (
      serie text, activo boolean, actualizado_en timestamp, marca_nombre text, marca text,
      subgrupo text, subgrupo_personalizado text, modelo_tipo text, modelo_catalogo_id text, vendedor text
    );
    create table public.maquinaria_pedidos_lineas_estado_actual (
      chasis text, factura_venta text, np_fecha date, actualizado_en timestamp,
      comercial text, marca text, producto text, modelo text, condicion text
    );
    create table public.parque_modelos_catalogo (
      id text, nombre text, subgrupo text, activo boolean, marca_nombre text, clave_normalizada text
    );
    create table public.parque_modelos_alias (modelo_catalogo_id text, clave_alias text);
    create function public.ventas_maquinas_fuente_v2(date, date, text)
    returns table (
      linea_id text, fecha date, factura text, cliente text, sucursal public.sucursal,
      total_venta numeric, es_nota_credito boolean, cantidad numeric, marca text,
      tipo_maquina text, modelo text, chasis text, descripcion text, metodologia text,
      vendedor text, codigo_pedido text, pedido_fecha date, condicion_fuente text,
      cod_mercaderia text
    ) language sql stable as $$
      select * from (values
        ('a', date '2026-10-10', 'F1', 'Cliente A', 'Santa Rita'::public.sucursal, 100::numeric, false, 1::numeric, 'CLAAS', 'TRACTORES', 'AXION', null::text, 'TRACTOR', 'actual', 'CARLOS', null::text, null::date, 'NUEVA', 'M1'),
        ('b', date '2026-10-11', 'F2', 'Cliente B', 'Santa Rita'::public.sucursal, 200::numeric, false, 1::numeric, 'CLAAS', 'TRACTORES', 'AXION', null::text, 'TRACTOR', 'actual', 'JUAN', null::text, null::date, 'NUEVA', 'M2'),
        ('c', date '2026-10-12', 'F3', 'Cliente C', 'Santa Rita'::public.sucursal, 50::numeric, false, 1::numeric, 'CLAAS', 'TRACTORES', 'AXION', null::text, 'TRACTOR', 'actual', null::text, null::text, null::date, 'NUEVA', 'M3'),
        ('d', date '2026-09-10', 'F0', 'Cliente A', 'Santa Rita'::public.sucursal, 80::numeric, false, 1::numeric, 'CLAAS', 'TRACTORES', 'AXION', null::text, 'TRACTOR', 'actual', 'CARLOS BENITEZ', null::text, null::date, 'NUEVA', 'M0'),
        ('e', date '2026-10-13', 'F4', 'Cliente D', 'Santa Rita'::public.sucursal, 20::numeric, false, 1::numeric, 'CLAAS', 'TRACTORES', 'AXION', null::text, 'TRACTOR', 'actual', 'CARLOS BENITEZ', null::text, null::date, 'NUEVA', 'M4')
      ) as rows(linea_id, fecha, factura, cliente, sucursal, total_venta, es_nota_credito, cantidad, marca, tipo_maquina, modelo, chasis, descripcion, metodologia, vendedor, codigo_pedido, pedido_fecha, condicion_fuente, cod_mercaderia)
      where rows.fecha between $1 and $2 and ($3 is null or rows.sucursal::text = $3)
    $$;
  `);
  await db.exec(fs.readFileSync('supabase/migrations/20261015231000_machine_sales_seller_filter.sql', 'utf8'));
  await db.exec(fs.readFileSync('supabase/migrations/20261015232000_unify_short_machine_seller_alias.sql', 'utf8'));
  const run = async (seller) => {
    const { rows } = await db.query(
      `select public.ventas_maquinas_dashboard_filtros_v2($1::date, $2::date, null, null, null, null, $3, 'mes') as report`,
      ['2026-10-01', '2026-10-31', seller],
    );
    return rows[0].report;
  };
  const all = await run(null);
  const carlos = await run('CARLOS BENITEZ');
  const missing = await run('__SIN_VENDEDOR__');
  assert.equal(Number(all.resumen.total), 370);
  assert.equal(Number(carlos.resumen.total), 120);
  assert.equal(Number(carlos.comparacion.total), 80);
  assert.equal(carlos.lineas.length, 2);
  assert.equal(Number(missing.resumen.total), 50);
  assert.equal(missing.lineas.length, 1);
  assert.deepEqual(all.dimensiones.vendedores, ['CARLOS BENITEZ', 'JUAN', '__SIN_VENDEDOR__']);
  assert.equal(Number(carlos.periodos[0].total), 120);
  assert.equal(Number(carlos.por_maquina[0].total), 120);
  console.log('Filtro Vendedor: totales, comparación, períodos, agrupaciones, detalle y Sin vendedor verificados.');
} finally {
  await db.close();
}
