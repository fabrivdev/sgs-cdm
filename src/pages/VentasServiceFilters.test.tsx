import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import Ventas from "./Ventas";

const { rpc } = vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock("@/integrations/supabase/client",()=>({supabase:{rpc}}));
vi.mock("@/hooks/useAuth",()=>({useAuth:()=>({can:()=>true})}));
vi.mock("@/hooks/useServicioTecnicos",()=>({useServicioTecnicos:()=>({data:[]})}));
vi.mock("@/components/filters/FiltersBar",()=>({
  FiltersBar:({children,expanded,onClear,search}:{children:ReactNode;expanded?:ReactNode;onClear:()=>void;search:{value:string;onChange:(s:string)=>void}})=>{
    return <div>
      <input aria-label="Buscar" value={search.value} onChange={e=>search.onChange(e.target.value)}/>
      {children}
      {expanded&&<><button type="button" aria-label="Más filtros" aria-expanded="false" onClick={event=>{
        event.currentTarget.setAttribute('aria-expanded','true');
        (event.currentTarget.nextElementSibling as HTMLElement).hidden=false;
      }}>Más filtros</button><div role="dialog" aria-label="Filtros adicionales" hidden>{expanded}</div></>}
      <button onClick={onClear}>Limpiar filtros</button>
    </div>;
  },
  FilterCustom:({children}:{children:ReactNode})=><div>{children}</div>,
  FilterDate:({label,value,onChange}:{label:string;value:string;onChange:(s:string)=>void})=><input aria-label={label} value={value} onChange={e=>onChange(e.target.value)} />,
  FilterSelect:({label,value,onChange,options}:{label:string;value:string;onChange:(s:string)=>void;options:{value:string;label:string}[]})=><select aria-label={label} value={value} onChange={e=>onChange(e.target.value)}>{options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select>,
}));
const amounts={mo:100,km:10,repuestos:20,terceros:0,neto:130};
function setup() {
  rpc.mockImplementation(async(name:string,params:Record<string,unknown>)=> {
    if(name==='ventas_servicios_dimensiones') return {data:[{marca:'HORSCH',tipo_maquina:'SEMBRADORAS'}],error:null};
    if(name.startsWith('ventas_servicios_panorama')) return {data:{resumen:{total:130,facturas:1,clientes:1,ordenes:1,promedio:130},periodos:[{periodo:'2026-08-01',total:130,...amounts,facturas:1,clientes:1,metodologia:'actual'}],desde:params.p_desde,hasta:params.p_hasta},error:null};
    if(name.startsWith('ventas_servicios_indicadores')) return {data:{totales:{...amounts,ordenes:1,documentos:1,horas:4},por_tipo:[],por_marca_tipo:[],por_maquina:[]},error:null};
    return {data:[],error:null};
  });
  const view=render(<Ventas area="servicios" />);
  openFilters();
  return view;
}
const openFilters=()=>{
  const trigger=screen.getByRole('button',{name:'Más filtros'});
  expect(trigger).toHaveAttribute('aria-expanded','false');
  fireEvent.click(trigger);
  expect(trigger).toHaveAttribute('aria-expanded','true');
  expect(screen.getByRole('dialog',{name:'Filtros adicionales'})).toBeVisible();
};
afterEach(()=>{cleanup();rpc.mockReset();});
describe('Ventas Servicios global filter routing',()=>{
  it('uses one search and clears it across the sales panels',async()=>{
    setup();await screen.findByText('Total del período');
    expect(screen.queryByLabelText(/Filtrar Cliente facturado|Filtrar Factura|Filtrar Código/)).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox',{name:'Buscar'}),{target:{value:'Pagador A'}});
    await waitFor(()=>expect(rpc).toHaveBeenCalledWith('ventas_servicios_panorama_v2',expect.objectContaining({p_buscar:'Pagador A'})));
    await waitFor(()=>expect(rpc).toHaveBeenCalledWith('ventas_servicios_indicadores_v1',expect.objectContaining({p_buscar:'Pagador A'})));
    fireEvent.click(screen.getByRole('button',{name:'Limpiar filtros'}));
    expect(screen.getByRole('textbox',{name:'Buscar'})).toHaveValue('');
    await waitFor(()=>expect(rpc).toHaveBeenCalledWith('ventas_servicios_panorama_v2',expect.objectContaining({p_buscar:null})));
  });
  it('passes one filter population to periods and every tab; August ends August 31',async()=>{
    setup();
    fireEvent.change(screen.getByLabelText('Componente'),{target:{value:'Servicio'}});
    fireEvent.change(screen.getByRole('textbox',{name:'Buscar'}),{target:{value:'Pagador A'}});
    await waitFor(()=>expect(rpc).toHaveBeenCalledWith('ventas_servicios_panorama_v2_filtrado',expect.objectContaining({p_buscar:'Pagador A',p_filtros:{componente:'Servicio'}})));
    await waitFor(()=>expect(rpc).toHaveBeenCalledWith('ventas_servicios_indicadores_v1_filtrado',expect.objectContaining({p_buscar:'Pagador A',p_filtros:{componente:'Servicio'}})));
    fireEvent.click(screen.getByRole('button',{name:'Clientes'}));
    await waitFor(()=>expect(rpc).toHaveBeenCalledWith('ventas_servicios_lineas_v2_filtrado',expect.objectContaining({p_filtros:{componente:'Servicio'}})));
    fireEvent.click(screen.getByRole('button',{name:'Técnicos'}));
    await waitFor(()=>expect(rpc).toHaveBeenCalledWith('ventas_servicios_tecnicos_v2',expect.objectContaining({p_buscar:'Pagador A',p_filtros:{componente:'Servicio'}})));
    fireEvent.click(screen.getByRole('button',{name:'Máquinas'}));
    await screen.findByText('No hay facturación por máquina en el período.');
    fireEvent.click(screen.getByRole('button',{name:'Detalle'}));
    await screen.findByText('No hay líneas facturadas para estos filtros.');
    fireEvent.click(screen.getByText(/ago.*2026/i).closest('button')!);
    await waitFor(()=>expect(rpc).toHaveBeenCalledWith('ventas_servicios_lineas_v2_filtrado',expect.objectContaining({p_desde:'2026-08-01',p_hasta:'2026-08-31',p_filtros:{componente:'Servicio'}})));
  });
  it('combines selectors and clears back to compatible original RPCs',async()=>{
    setup();
    fireEvent.change(screen.getByLabelText('Documento'),{target:{value:'nc'}});
    fireEvent.change(screen.getByLabelText('Componente'),{target:{value:'Servicio'}});
    fireEvent.change(screen.getByLabelText('Vínculo OS'),{target:{value:'sin_os'}});
    await waitFor(()=>expect(rpc).toHaveBeenCalledWith('ventas_servicios_indicadores_v1_filtrado',expect.objectContaining({p_filtros:{documento:'nc',componente:'Servicio',vinculo:'sin_os'}})));
    rpc.mockClear();fireEvent.click(screen.getByRole('button',{name:'Limpiar filtros'}));
    await waitFor(()=>expect(rpc).toHaveBeenCalledWith('ventas_servicios_indicadores_v1',expect.not.objectContaining({p_filtros:expect.anything()})));
    expect(screen.getByLabelText('Documento')).toHaveValue('TODOS');
    expect(screen.queryByLabelText('Origen')).not.toBeInTheDocument();
  });
  it('reports missing new SQL instead of falling back to unfiltered data',async()=>{
    setup();await screen.findByText('Total del período');
    rpc.mockImplementation(async(name:string)=>name.endsWith('_filtrado')?{data:null,error:{code:'PGRST202'}}:{data:[],error:null});
    fireEvent.change(screen.getByLabelText('Documento'),{target:{value:'nc'}});
    expect((await screen.findAllByRole('alert')).every(node=>node.textContent?.includes('20260917180000'))).toBe(true);
    expect(screen.queryByText('Total del período')).not.toBeInTheDocument();
  });
});
