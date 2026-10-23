import {cleanup,render,screen,waitFor,fireEvent,act,renderHook} from '@testing-library/react';
import {afterEach,beforeEach,it,expect,vi} from 'vitest';
import Stock from './StockProyectado';
import {useSectionTable} from '@/components/exports/useSectionTable';
import type {ProjectedMachineStockRow} from '@/lib/projectedMachineStock';
const {rpc,ytd,auth,exportSalesTable}=vi.hoisted(()=>({rpc:vi.fn(),ytd:vi.fn(),auth:{id:'one',sales:true,stock:true,loading:false,export:true},exportSalesTable:vi.fn()}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc}}));
vi.mock('@/lib/projectedStockYtd',()=>({loadProjectedStockYtd:ytd}));
vi.mock('@/hooks/useAuth',()=>({useAuth:()=>({can:()=>auth.export,hasSectionAccess:(section:string)=>section==='parque.ventas'?auth.sales:auth.stock,loading:auth.loading,user:{id:auth.id}})}));
vi.mock('@/components/ventas/salesTableExport',()=>({exportSalesTable}));
const base={marca:'HORSCH',programa:'HORSCH',tipo:'SEMBRADORAS',modelo:'BASE MODEL',stock:5,pedidos_compra:2,ventas_pendientes:1,stock_proyectado:6};
const enrich=(rows:ProjectedMachineStockRow[])=>[...rows.map(r=>({...r,vendidas_ytd:0})),{...rows[0],modelo:'SALES ONLY',stock:0,pedidos_compra:0,ventas_pendientes:0,stock_proyectado:0,vendidas_ytd:-1}];
const deferred=<T,>()=>{let resolve!:(value:T)=>void;const promise=new Promise<T>(r=>{resolve=r});return{promise,resolve};};
beforeEach(()=>{Object.assign(auth,{id:'one',sales:true,stock:true,loading:false,export:true});vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});rpc.mockResolvedValue({data:{filas:[base]},error:null});ytd.mockImplementation(async rows=>enrich(rows));});
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.resetAllMocks();});
async function exportRows(){fireEvent.keyDown(screen.getByRole('button',{name:/Acciones de la secci/}),{key:'Enter'});fireEvent.click(await screen.findByRole('menuitem',{name:'Exportar Stock proyectado'}));await waitFor(()=>expect(exportSalesTable).toHaveBeenCalled());return exportSalesTable.mock.calls.slice(-1)[0][0];}
function expectStock(){expect(screen.getByText('BASE MODEL')).toBeInTheDocument();expect(document.querySelectorAll('.kpi-item')[1]).toHaveTextContent('Stock5');expect(screen.getByRole('button',{name:/Acciones de la secci/})).toBeEnabled();}
it('does not query sales without permission and exports stock with unavailable YTD',async()=>{auth.sales=false;render(<Stock/>);await screen.findByText('BASE MODEL');expectStock();expect(ytd).not.toHaveBeenCalled();const x=await exportRows();expect(x.rows[0].vendidas_ytd).toBeNull();expect(x.columns.find((c:{key:string})=>c.key==='vendidas_ytd').exportValue(x.rows[0])).toBe('No disponible');});
it.each(['No tenes acceso a Ventas de Maquinas','Network lookup failed'])('keeps stock and export after YTD error %s',async message=>{ytd.mockRejectedValue(new Error(message));render(<Stock/>);await screen.findByText('BASE MODEL');expectStock();const x=await exportRows();expect(x.rows[0].vendidas_ytd).toBeNull();expect(document.querySelector('.kpi-item')).toHaveTextContent('Vendidas YTD-');});
it('keeps stock while YTD is pending, then includes authorized sales-only net rows and real zero',async()=>{const d=deferred<ProjectedMachineStockRow[]>();ytd.mockReturnValue(d.promise);render(<Stock/>);await screen.findByText('BASE MODEL');expectStock();await waitFor(()=>expect(ytd).toHaveBeenCalled());expect((await exportRows()).rows[0].vendidas_ytd).toBeNull();await act(async()=>d.resolve(enrich(ytd.mock.calls[0][0])));await screen.findByText('SALES ONLY');expect((await exportRows()).rows.map((r:ProjectedMachineStockRow)=>r.vendidas_ytd)).toEqual([0,-1]);});
it.each(['permission','user','cutoff'] as const)('ignores stale YTD after changing %s',async change=>{const d=deferred<ProjectedMachineStockRow[]>();ytd.mockReturnValue(d.promise);const view=render(<Stock/>);await screen.findByText('BASE MODEL');await waitFor(()=>expect(ytd).toHaveBeenCalledOnce());const prior=enrich(ytd.mock.calls[0][0]);ytd.mockImplementation(async rows=>rows);if(change==='permission'){auth.sales=false;view.rerender(<Stock/>);}if(change==='user'){auth.id='two';view.rerender(<Stock/>);}if(change==='cutoff')fireEvent.change(document.querySelector('input[type=date]')!,{target:{value:'2026-09-01'}});await act(async()=>d.resolve(prior));await screen.findByText('BASE MODEL');expect(screen.queryByText('SALES ONLY')).not.toBeInTheDocument();expect((await exportRows()).rows[0].vendidas_ytd).toBeNull();});
it('removes loaded sales-only rows and values on permission revocation',async()=>{const view=render(<Stock/>);await screen.findByText('SALES ONLY');auth.sales=false;view.rerender(<Stock/>);expectStock();expect(screen.queryByText('SALES ONLY')).not.toBeInTheDocument();expect((await exportRows()).rows.map((r:ProjectedMachineStockRow)=>r.vendidas_ytd)).toEqual([null]);});
it('waits for authentication and clears all stock when stock access is revoked',async()=>{auth.loading=true;const view=render(<Stock/>);expect(rpc).not.toHaveBeenCalled();auth.loading=false;view.rerender(<Stock/>);await screen.findByText('BASE MODEL');auth.stock=false;view.rerender(<Stock/>);expect(screen.queryByText('BASE MODEL')).not.toBeInTheDocument();expect(screen.getByRole('button',{name:/Acciones de la secci/})).toBeDisabled();});

it('blocks an already-started export if its access scope becomes obsolete during lazy loading',async()=>{
 let allowed=true;
 const {result}=renderHook(()=>useSectionTable({rows:[base],columns:[{key:'modelo',label:'Modelo',kind:'text',value:r=>r.modelo}],initialSort:{key:'modelo',direction:'asc'},title:'Review',fileName:'review.xlsx',exportGuard:()=>allowed}));
 const pending=result.current.action!.onSelect();allowed=false;await pending;
 expect(exportSalesTable).not.toHaveBeenCalled();
});
