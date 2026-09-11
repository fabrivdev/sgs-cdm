import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync('supabase/migrations/20260911160000_fix_service_sales_timeout.sql', 'utf8');
describe('service sales timeout migration', () => {
  it('uses a primary-key join in all three RPCs instead of scalar lookups', () => {
    expect(sql.match(/left join public.facturacion_lineas_importadas fl/g)).toHaveLength(3);
    expect(sql).not.toContain('ventas_linea_tipo_tiempo(b.');
    expect(sql).not.toContain('f.id::text');
    expect(sql).toContain("then b.linea_id::uuid else null::uuid end");
  });
  it('retains access checks, timeout, owner and component rules', () => {
    expect(sql.match(/has_section_access\(auth.uid\(\), 'servicios.ventas'\)/g)).toHaveLength(3);
    expect(sql.match(/set statement_timeout = '30s'/g)).toHaveLength(3);
    expect(sql).toContain("'propietario', a.cliente");
    expect(sql.match(/b.concepto in \('Servicio', 'Kilometraje', 'Repuestos', 'Terceros'\)/g)).toHaveLength(3);
  });
});
