import importlib.util
import unittest
from datetime import date
from pathlib import Path

spec = importlib.util.spec_from_file_location('grid', Path(__file__).with_name('prepare-grid-purchase-history.py'))
grid = importlib.util.module_from_spec(spec); spec.loader.exec_module(grid)

def row(code='1', day='01/01/2020', kind='ENTRADA POR COMPRA', qty='1', description='REPUESTO', state='CERRADO'):
    r = [''] * 28
    for k, v in {0:day+' 23:45:00',1:kind,2:state,3:qty,6:'MOV1',12:description,26:code}.items(): r[k]=v
    return ';'.join(r)

def document(*rows):
    h=['']*28;h[0]='Fecha';h[1]='Tipo de Factura';h[26]='Cód. Mercadería'
    return ';'.join(h)+'\n'+'\n'.join(rows)

class GridTests(unittest.TestCase):
    def test_returns_and_credit_do_not_reset_purchase(self):
        rows,stats=grid.parse(document(row(),row(day='01/02/2020',kind='ENTRADA POR DEVOLUCAO DE VENDA'),row(day='02/02/2020',kind='ENTRADA POR COMPRA - NOTA DE CRÉDITO')),date(2020,3,1))
        self.assertEqual(rows[0][1],'2020-01-01');self.assertEqual(stats['compras'],1)
    def test_positive_closed_purchase_only_and_null_coverage(self):
        rows,_=grid.parse(document(row(),row('2',qty='-1'),row('3',state='ABIERTO'),row('4',kind='SAIDA POR VENDA')),date(2020,3,1))
        self.assertEqual([r[1] for r in rows],['2020-01-01',None,None,None])
    def test_description_separator_and_locale(self):
        rows,stats=grid.parse(document(row(qty='1.234,50',description='REPUESTO; 1:32')),date(2020,3,1))
        self.assertEqual(rows[0][3],'1234.50');self.assertEqual(stats['descripciones_reconstruidas'],1)
    def test_cutoff_and_bad_number_fail(self):
        with self.assertRaises(ValueError):grid.parse(document(row(day='01/04/2020')),date(2020,3,1))
        with self.assertRaises(ValueError):grid.parse(document(row(qty='1.2.3')),date(2020,3,1))

if __name__=='__main__':unittest.main()
