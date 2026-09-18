import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {TrabajosAbiertosList} from './DashboardCharts';
vi.mock('@/hooks/useAuth',()=>({useAuth:()=>({can:()=>true})}));
afterEach(cleanup);
const rows=[
  {id:'new',ref:'TR10',cliente:'Cliente 10',sucursal:'Santa Rita',estado:'Abierto',ultimaFecha:'01/01/26',ultimaFechaISO:'2026-01-01',díasSinCierre:10,pendientes:1,programados:0,iniciados:0},
  {id:'old',ref:'TR2',cliente:'Cliente 2',sucursal:'Santa Rita',estado:'Abierto',ultimaFecha:'31/12/25',ultimaFechaISO:'2025-12-31',díasSinCierre:20,pendientes:1,programados:0,iniciados:0},
  {id:'null',ref:'TR3',cliente:'Cliente 3',sucursal:'Santa Rita',estado:'Abierto',ultimaFecha:'Sin fecha',ultimaFechaISO:null,díasSinCierre:5,pendientes:1,programados:0,iniciados:0},
];
describe('Dashboard: tablas de trabajos',()=>{
  it('ordena fechas originales, no dd/MM/yy, y deja ausencias al final en ambos sentidos',()=>{
    const {container}=render(<TrabajosAbiertosList rows={rows} onSelect={()=>{}}/>);
    const references=()=>Array.from(container.querySelectorAll('.md\\:block > button')).map(b=>b.textContent?.match(/TR\d+/)?.[0]);
    fireEvent.click(screen.getByRole('button',{name:'Ordenar Últ. fecha: más antigua a más reciente'}));
    expect(references()).toEqual(['TR2','TR10','TR3']);
    fireEvent.click(screen.getByRole('button',{name:'Ordenar Últ. fecha: más reciente a más antigua'}));
    expect(references()).toEqual(['TR10','TR2','TR3']);
  });
  it('ordena códigos naturalmente y conserva la acción de abrir el trabajo',()=>{
    const open=vi.fn();const {container}=render(<TrabajosAbiertosList rows={rows} onSelect={open}/>);
    fireEvent.click(screen.getByRole('button',{name:'Ordenar OS/TR: A a Z'}));
    const ordered=container.querySelectorAll('.md\\:block > button');
    expect(Array.from(ordered).map(b=>b.textContent?.match(/TR\d+/)?.[0])).toEqual(['TR2','TR3','TR10']);
    fireEvent.click(ordered[0]);expect(open).toHaveBeenCalledWith(rows[1]);
  });
});
