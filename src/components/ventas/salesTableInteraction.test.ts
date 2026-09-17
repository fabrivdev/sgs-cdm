import { describe, expect, it } from "vitest";
import { salesDate, sortSalesRows, type SalesColumn } from "./salesTableInteraction";
type Row = {id:string;text:string|null;number:number|null;date:string|null};
const columns:SalesColumn<Row>[]=[
  {key:'text',label:'Código',kind:'text',value:row=>row.text},
  {key:'number',label:'Importe',kind:'number',value:row=>row.number},
  {key:'date',label:'Fecha',kind:'date',value:row=>row.date},
];
const rows:Row[]=[
  {id:'ten',text:'REP10',number:10,date:'2026-01-31'},
  {id:'two',text:'REP2',number:2,date:'2026-02-01'},
  {id:'negative',text:'Álvaro',number:-20,date:'2025-12-31'},
  {id:'zero',text:'000001',number:0,date:'2026-03-01'},
  {id:'missing',text:null,number:null,date:null},
];
const sort=(key:string,direction:'asc'|'desc',data=rows)=>sortSalesRows(data,columns,{key,direction}).map(row=>row.id);
describe('shared sales table sorting',()=>{
  it('sorts raw numbers, including negative NC and zero, with missing last in both directions',()=>{
    expect(sort('number','asc')).toEqual(['negative','zero','two','ten','missing']);
    expect(sort('number','desc')).toEqual(['ten','two','zero','negative','missing']);
  });
  it('uses Spanish natural text ordering without modifying codes or accents',()=>{
    expect(sort('text','asc')).toEqual(['zero','negative','two','ten','missing']);
    expect(sort('text','desc')).toEqual(['ten','two','negative','zero','missing']);
    expect(rows[3].text).toBe('000001'); expect(rows[2].text).toBe('Álvaro');
  });
  it('sorts dates chronologically, not by the formatted day or month',()=>{
    expect(sort('date','asc')).toEqual(['negative','ten','two','zero','missing']);
    expect(sort('date','desc')).toEqual(['zero','two','ten','negative','missing']);
  });
  it('keeps equal financial lines stable and does not mutate input',()=>{
    const ties=[rows[0],{...rows[0],id:'second'},{...rows[0],id:'third'}];
    for(const direction of ['asc','desc'] as const) expect(sort('number',direction,ties)).toEqual(['ten','second','third']);
    expect(sort('nonexistent','asc')).toEqual(rows.map(row=>row.id));
    expect(rows.map(row=>row.id)).toEqual(['ten','two','negative','zero','missing']);
  });
  it('places blanks, invalid dates and nonfinite numbers last without inventing zeros',()=>{
    const invalid={id:'invalid',text:'  ',number:NaN,date:'2026-02-30'};
    for(const key of ['text','number','date']) for(const direction of ['asc','desc'] as const) expect(sort(key,direction,[invalid,rows[3]])).toEqual(['zero','invalid']);
    expect(salesDate('2026-02-30')).toBeNull(); expect(salesDate('31/01/2026')).toBeNull();
    expect(salesDate('2024-02-29')?.getDate()).toBe(29);
  });
});
