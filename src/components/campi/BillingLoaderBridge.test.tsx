import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,render,screen,fireEvent} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import {loadSalesStories} from '@/lib/campi/salesStories';
import {scopedSalesStory} from '@/lib/campi/salesScope';
import {billingComponents} from '@/lib/campi/billingComponents';
import {ApprovedPanoramaCard} from './ApprovedPanoramaCard';
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc:vi.fn(async(_name:string,args:{p_desde:string;p_hasta:string})=>{
 const year=args.p_desde.slice(0,4),start=+args.p_desde.slice(5,7),end=+args.p_hasta.slice(5,7);
 const periodos=Array.from({length:end-start+1},(_,i)=>({periodo:`${year}-${String(start+i).padStart(2,'0')}-01`,ventas:120.45,notas_credito:-20.11,facturado:100.34}));
 return {data:{resumen:{ventas:120.45*periodos.length,notas_credito:-20.11*periodos.length,facturado:100.34*periodos.length},periodos},error:null};
})}}));
afterEach(cleanup);
it.each(['month','ytd'] as const)('renderiza el puente desde el cargador real en %s sin depender del texto',async period=>{
 const [story]=await loadSalesStories(['ventas_facturacion'],['repuestos.ventas'],'2026-10-29',period);
 expect(story.status).toBe('ready');expect(billingComponents(story)).not.toBeNull();
 story.supporting=story.supporting.map(row=>({...row,label:'Etiqueta modificada'}));
 render(<MemoryRouter><ApprovedPanoramaCard story={story} index={0} retrying={false} onRetry={()=>{}} /></MemoryRouter>);
 expect(screen.queryByText('Puente de facturación no conciliado')).not.toBeInTheDocument();
 expect(document.querySelectorAll('.approved-waterfall rect')).toHaveLength(3);
 expect(screen.getByText(/Sobre el total facturado se descontó/)).toBeInTheDocument();
 const original=story.billingComponents!;
 expect(billingComponents({...story,billingComponents:{...original,net:original.net+.03}})).toBeNull();
 expect(billingComponents({...story,billingComponents:{...original,credits:20}})).toBeNull();
 expect(billingComponents({...story,billingComponents:{...original,gross:NaN}})).toBeNull();
});

it.each(['month','ytd'] as const)('conserva neto, NC y acumulado al filtrar la salida real del cargador en %s',async period=>{
 const [story]=await loadSalesStories(['ventas_facturacion'],['repuestos.ventas'],'2026-10-29',period);
 const filtered=scopedSalesStory(story,['repuestos.ventas','repuestos.ventas']);
 expect(filtered.primary?.value).toBeCloseTo(story.primary!.value!);
 for(const key of ['gross','credits','net'] as const) expect(billingComponents(filtered)![key]).toBeCloseTo(billingComponents(story)![key],8);
 expect(filtered.supporting.find(x=>x.label==='Facturación neta acumulada')?.value).toBeCloseTo(1003.4);
 render(<MemoryRouter><ApprovedPanoramaCard story={story} index={0} retrying={false} onRetry={()=>{}} /></MemoryRouter>);
 const button=screen.getByRole('button',{name:'Filtrar ventas de repuestos'});
 fireEvent.click(button);expect(button).toHaveAttribute('aria-pressed','true');
 expect(screen.queryByText('Puente de facturación no conciliado')).not.toBeInTheDocument();
 fireEvent.click(button);expect(button).toHaveAttribute('aria-pressed','false');
 expect(document.querySelectorAll('.approved-waterfall rect')).toHaveLength(3);
});
