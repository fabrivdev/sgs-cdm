"""Prepare private SQL from a GRID movement CSV; never connects to a database.

Usage: python scripts/prepare-grid-purchase-history.py INPUT --cutoff YYYY-MM-DD --output PRIVATE_DIR
Keep generated data outside the repository. Dates are local calendar dates, not UTC timestamps.
"""
import argparse
import csv
import hashlib
import io
import json
import re
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path

PURCHASES = {'ENTRADA POR COMPRA', 'ENTRADA POR IMPORTACAO', 'ENTRADA POR IMPORTACAO COM PEDIDO'}

def number(value):
    value = value.strip()
    if not re.fullmatch(r'-?(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d+)?', value):
        raise ValueError('Número GRID inválido')
    return Decimal(value.replace('.', '').replace(',', '.'))

def parse(text, cutoff):
    reader = csv.reader(io.StringIO(text, newline=''), delimiter=';')
    headers = next(reader)
    if len(headers) != 28 or headers[0] != 'Fecha' or headers[1] != 'Tipo de Factura' or headers[26] != 'Cód. Mercadería':
        raise ValueError('Encabezado GRID inesperado')
    codes = {}; stats = {'movimientos': 0, 'compras': 0, 'descripciones_reconstruidas': 0, 'totalizadores': 0}
    footer = False
    for row in reader:
        if not row or not any(v.strip() for v in row):
            continue
        if len(row) > 28:
            # GRID does not escape semicolons in product descriptions. Preserve
            # the 12 fixed prefix and 15 fixed suffix columns; validate all below.
            row = row[:12] + [';'.join(row[12:-15])] + row[-15:]
            stats['descripciones_reconstruidas'] += 1
        if len(row) != 28:
            raise ValueError(f'Fila {reader.line_num}: ancho inválido')
        if not any(row[i].strip() for i in (0, 1, 2, 26)):
            stats['totalizadores'] += 1; footer = True; continue
        if footer:
            raise ValueError('Movimientos después del totalizador')
        code = row[26].strip()
        if not re.fullmatch(r'\d+', code):
            raise ValueError(f'Fila {reader.line_num}: código inválido')
        movement_date = datetime.strptime(row[0].strip(), '%d/%m/%Y %H:%M:%S').date()
        if movement_date > cutoff:
            raise ValueError('Movimiento posterior al corte declarado')
        for i in (3, 4, 5, 13, 14, 15, 16, 17, 18, 19, 20, 27):
            if row[i].strip(): number(row[i])
        qty = number(row[3]); kind = row[1].strip(); state = row[2].strip()
        codes.setdefault(code, None); stats['movimientos'] += 1
        if kind not in PURCHASES or state != 'CERRADO' or qty <= 0:
            continue
        movement = row[6].strip()
        if not movement:
            raise ValueError('Compra sin código de movimiento')
        stats['compras'] += 1
        record = [code, movement_date.isoformat(), kind, str(qty), movement, reader.line_num]
        if codes[code] is None or (record[1], record[4], record[5]) > (codes[code][1], codes[code][4], codes[code][5]):
            codes[code] = record
    if not codes or not stats['compras']:
        raise ValueError('Ficha vacía o sin compras')
    rows = [codes[k] or [k, None, None, None, None, None] for k in sorted(codes)]
    stats['codigos'] = len(rows)
    stats['codigos_con_compra'] = sum(r[1] is not None for r in rows)
    return rows, stats

def quote(value):
    return "'" + str(value).replace("'", "''") + "'"

def prepare(source, cutoff, output):
    raw = source.read_bytes()
    text = raw.decode('utf-16' if raw[:2] in (b'\xff\xfe', b'\xfe\xff') else 'utf-8-sig')
    rows, stats = parse(text, cutoff)
    sha = hashlib.sha256(raw).hexdigest()
    checksum = hashlib.md5('\n'.join(r[0] + '|' + (r[1] or '') for r in rows).encode()).hexdigest()
    output.mkdir(parents=True, exist_ok=True)
    # No source descriptions, names, RUCs, money or documents leave the CSV.
    (output / '00-register.sql').write_text(
        'INSERT INTO public.repuestos_ficha_grid_cargas '
        '(archivo_sha256,archivo_nombre,fecha_corte,movimientos,codigos_esperados,compras_esperadas,contenido_md5) VALUES (' +
        ','.join(map(quote, [sha, source.name, cutoff.isoformat(), stats['movimientos'], len(rows), stats['codigos_con_compra'], checksum])) +
        ') ON CONFLICT (archivo_sha256) DO NOTHING;\n', encoding='utf8')
    for part, start in enumerate(range(0, len(rows), 1500), 1):
        chunk = rows[start:start+1500]
        payload = quote(json.dumps(chunk, ensure_ascii=False, separators=(',', ':')))
        sql = f"""BEGIN;
INSERT INTO public.repuestos_ficha_grid_compras
 (archivo_sha256,codigo_legacy_norm,ultima_compra,tipo_movimiento,cantidad,codigo_movimiento,fila_origen)
SELECT '{sha}',r->>0,(r->>1)::date,r->>2,(r->>3)::numeric,r->>4,(r->>5)::integer
FROM jsonb_array_elements({payload}::jsonb) r
ON CONFLICT (archivo_sha256,codigo_legacy_norm) DO NOTHING;
COMMIT;
SELECT count(*) filas FROM public.repuestos_ficha_grid_compras WHERE archivo_sha256='{sha}';
"""
        (output / f'{part:02d}-batch.sql').write_text(sql, encoding='utf8')
    (output / '99-activate.sql').write_text(f"""BEGIN;
SET LOCAL statement_timeout='90s';
UPDATE public.repuestos_ficha_grid_cargas SET activo=false WHERE activo AND archivo_sha256<>'{sha}';
UPDATE public.repuestos_ficha_grid_cargas SET activo=true WHERE archivo_sha256='{sha}';
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM public.repuestos_ficha_grid_cargas WHERE archivo_sha256='{sha}' AND activo)
 THEN RAISE EXCEPTION 'Ficha no registrada'; END IF; END $$;
ANALYZE public.repuestos_ficha_grid_compras;
COMMIT;
SELECT archivo_nombre,activo,codigos_esperados,compras_esperadas FROM public.repuestos_ficha_grid_cargas WHERE activo;
""", encoding='utf8')
    result = {**stats, 'sha256': sha, 'contenido_md5': checksum, 'fecha_corte': cutoff.isoformat()}
    (output / 'manifest.json').write_text(json.dumps(result, indent=2), encoding='utf8')
    return result

if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('input', type=Path); p.add_argument('--cutoff', type=date.fromisoformat, required=True)
    p.add_argument('--output', type=Path, required=True)
    args = p.parse_args()
    if Path(__file__).resolve().parents[1] in args.output.resolve().parents:
        p.error('El directorio privado de salida debe estar fuera del repositorio')
    print(json.dumps(prepare(args.input, args.cutoff, args.output), ensure_ascii=False))
