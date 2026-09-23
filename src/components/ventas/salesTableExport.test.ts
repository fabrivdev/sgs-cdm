import { describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";
import { createSalesWorkbook, exportSalesTable } from "./salesTableExport";
import type { SalesColumn } from "./salesTableInteraction";
vi.mock('xlsx',async importOriginal=>({...await importOriginal<typeof import('xlsx')>(),writeFile:vi.fn()}));
type Row={code:string;description:string;date:string|null;quantity:number|null;money:number};
const columns:SalesColumn<Row>[]=[
  {key:'code',label:'Código',kind:'text',value:row=>row.code},
  {key:'description',label:'Descripción',kind:'text',value:row=>row.description},
  {key:'date',label:'Fecha',kind:'date',value:row=>row.date},
  {key:'quantity',label:'Cant.',kind:'number',value:row=>row.quantity},
  {key:'money',label:'Facturado',kind:'number',value:row=>row.money,excelFormat:'"$" #,##0.00;"$" -#,##0.00'},
];
const row:Row={code:'000001234',description:'=1+2',date:'2026-08-31',quantity:4.25,money:-10.25};
describe('shared sales Excel export',()=>{
  it('preserves column/row order, full text, leading zeros, exact numbers and NC signs in a real XLSX round trip',()=>{
    const long='Descripción extensa que no se debe recortar '.repeat(15);
    const rows=[row,{...row,code:'REPIN004178',description:long,quantity:0,money:0},{...row,quantity:null,date:null}];
    const workbook=createSalesWorkbook(rows,columns,'Detalle');
    const bytes=XLSX.write(workbook,{type:'array',bookType:'xlsx'});
    const read=XLSX.read(bytes,{type:'array',cellDates:true});
    const sheet=read.Sheets.Detalle;
    expect(sheet.A2.t).toBe('s'); expect(sheet.A2.v).toBe('000001234');
    expect(sheet.B2.t).toBe('s'); expect(sheet.B2.v).toBe('=1+2'); expect(sheet.B2.f).toBeUndefined();
    expect(sheet.B3.v).toBe(long);
    expect(sheet.C2.t).toBe('d'); expect((sheet.C2.v as Date).getFullYear()).toBe(2026); expect((sheet.C2.v as Date).getMonth()).toBe(7); expect((sheet.C2.v as Date).getDate()).toBe(31);
    expect(sheet.D2.t).toBe('n'); expect(sheet.D2.v).toBe(4.25);
    expect(sheet.E2.t).toBe('n'); expect(sheet.E2.v).toBe(-10.25);
    expect(sheet.D3.v).toBe(0); expect(sheet.E3.v).toBe(0);
    expect(sheet.D4).toBeUndefined(); expect(sheet.C4).toBeUndefined();
    expect(XLSX.utils.sheet_to_json(sheet,{header:1})[0]).toEqual(['Código','Descripción','Fecha','Cant.','Facturado']);
    expect(sheet['!ref']).toBe('A1:E4'); expect(sheet['!autofilter']?.ref).toBe('A1:E4');
    expect(workbook.Sheets.Detalle.E2.z).toContain('"$"');
  });
  it('exports all supplied rows, including legitimate duplicates, without adding a financial total',()=>{
    const sheet=createSalesWorkbook(Array.from({length:125},()=>row),columns,'Detalle').Sheets.Detalle;
    expect(sheet['!ref']).toBe('A1:E126');
    expect(XLSX.utils.sheet_to_json(sheet,{header:1})).toHaveLength(126);
    expect(sheet.A126.v).toBe('000001234');
  });
  it('fails before writing a file on malformed numeric/date values instead of silently exporting an incomplete result',()=>{
    expect(()=>createSalesWorkbook([{...row,money:NaN}],columns,'Detalle')).toThrow(/inválido/);
    expect(()=>createSalesWorkbook([{...row,date:'2026-02-30'}],columns,'Detalle')).toThrow(/inválida/);
  });
  it('always writes an xlsx workbook with an explicit extension',()=>{
    exportSalesTable({rows:[row],columns,sheetName:'Detalle',fileName:'ventas-detalle'});
    expect(XLSX.writeFile).toHaveBeenCalledWith(expect.objectContaining({SheetNames:['Detalle']}),'ventas-detalle.xlsx',{bookType:'xlsx'});
  });
});
