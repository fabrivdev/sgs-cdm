import { screen, waitFor, cleanup, within, fireEvent } from '@testing-library/react';
import { render, selectExport } from "./salesSectionExports.test-support";
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ServiciosDetalleOS } from './ServiciosDetalleOS';

const { rpc, can, exportSalesTable } = vi.hoisted(() => ({ rpc: vi.fn(), can: vi.fn(()=>true), exportSalesTable: vi.fn() }));
vi.mock('@/hooks/useAuth', () => ({useAuth:()=>({can})}));
vi.mock('./salesTableExport',()=>({exportSalesTable}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc } }));
vi.mock('@/components/ventas/MachineHistorySheet', () => ({ MachineHistorySheet: ({target}: {target:{chassis:string}}) => <div>Historial: {target.chassis}</div> }));
afterEach(() => { cleanup(); vi.clearAllMocks(); can.mockReturnValue(true); exportSalesTable.mockReset(); });
const props = { desde: '2026-01-01', hasta: '2026-09-11', sucursal: 'TODAS', buscar: '', tipoTiempo: 'TODOS' };
const line = { id: 'line-1', fecha: '2026-05-11', factura: '001-003-54', os: '5734', chasis: 'C7501463',
  cliente: 'Pagador tercero', propietario: 'Propietario no informado', propietario_os: 'VALDECIR MOHR',
  sucursal: 'Santa Rita', tipo_tiempo: 'Cliente', componente: 'Mano de obra', descripcion: 'Reparación de máquina', cantidad: 1, cantidad_os: 4, total_venta: 200 };

describe('invoice line detail', () => {
  it('sorts every header both ways, uses real numeric values, preserves ties and does not refetch', async () => {
    rpc.mockResolvedValue({error:null,data:[{...line,id:'large',total_venta:1000,cantidad_os:20,fecha:'2026-08-01'},
      {...line,id:'small',total_venta:9,cantidad_os:3,fecha:'2026-07-01'},
      {...line,id:'unknown',total_venta:-50,cantidad_os:null,fecha:'2026-06-01'}]});
    const {container}=render(<ServiciosDetalleOS {...props} />);
    await screen.findByText('3 líneas · 3 documentos');
    const ids=()=>Array.from(container.querySelectorAll('[data-invoice-line]')).map(row=>row.getAttribute('data-invoice-line'));
    expect(ids()).toEqual(['large','small','unknown']);
    fireEvent.click(screen.getByRole('button',{name:'Ordenar Facturado: menor a mayor'}));
    expect(ids()).toEqual(['unknown','small','large']);
    expect(screen.getByRole('columnheader',{name:'Facturado'})).toHaveAttribute('aria-sort','ascending');
    fireEvent.click(screen.getByRole('button',{name:'Ordenar Facturado: mayor a menor'}));
    expect(ids()).toEqual(['large','small','unknown']);
    fireEvent.click(screen.getByRole('button',{name:'Ordenar Cant.: menor a mayor'}));
    expect(ids()).toEqual(['small','large','unknown']);
    fireEvent.click(screen.getByRole('button',{name:'Ordenar Cant.: mayor a menor'}));
    expect(ids()).toEqual(['large','small','unknown']);
    for(const header of screen.getAllByRole('columnheader')){
      fireEvent.click(within(header).getByRole('button'));
      fireEvent.click(within(header).getByRole('button'));
    }
    expect(screen.getAllByRole('columnheader')).toHaveLength(12);
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it('exports every filtered row in screen order, not only rows inside the vertical scroll viewport', async () => {
    const fixture=Array.from({length:25},(_,index)=>({...line,id:`export-${index}`,cliente:'Cliente seleccionado',factura:'000001234',codigo:'MA01',total_venta:index-2,cantidad_os:index===0?null:index}));
    rpc.mockResolvedValue({error:null,data:[...fixture,{...line,id:'excluded',cliente:'Otro',propietario_os:'Otro'}]});
    const {container}=render(<ServiciosDetalleOS {...props} buscar="Cliente seleccionado" />);
    await screen.findByText('25 líneas · 1 documentos');
    fireEvent.click(screen.getByRole('button',{name:'Ordenar Facturado: menor a mayor'}));
    await selectExport();
    await waitFor(()=>expect(exportSalesTable).toHaveBeenCalledTimes(1));
    const exported=exportSalesTable.mock.calls[0][0];
    expect(exported.fileName).toBe('ventas-servicios-detalle-2026-01-01-2026-09-11.xlsx');
    expect(exported.rows.map((row:{id:string})=>row.id)).toEqual(Array.from(container.querySelectorAll('[data-invoice-line]')).map(row=>row.getAttribute('data-invoice-line')));
    expect(exported.rows).toHaveLength(25);
    expect(exported.rows.some((row:{id:string})=>row.id==='excluded')).toBe(false);
    expect(exported.columns.map((column:{label:string})=>column.label)).toEqual(['Fecha','Factura','Sucursal','Cliente facturado','Propietario','OS','Chasis','Tiempo','Código','Descripción','Cant.','Facturado']);
    expect(exported.columns[1].exportValue(exported.rows[0])).toBe('000001234');
    expect(exported.columns[10].value(exported.rows[0])).toBeNull();
    expect(exported.columns[11].value(exported.rows[0])).toBe(-2);
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it('preserves export types and exact visible quantity semantics for NC, zero, long text and unknowns', async () => {
    const nc={...line,id:'export-nc',factura:'000000001',es_nota_credito:true,total_venta:-10.25,cantidad_os:4.25,descripcion:'Descripción íntegra sin recortar'.repeat(6)};
    const km={...line,id:'export-km',componente:'Kilometraje',cantidad_os:0,total_venta:0};
    const part={...line,id:'export-part',componente:'Repuestos',cantidad:3,cantidad_os:null};
    rpc.mockResolvedValue({error:null,data:[nc,km,part]});
    render(<ServiciosDetalleOS {...props} />);
    await screen.findByText('3 líneas · 2 documentos');
    await selectExport();
    await waitFor(()=>expect(exportSalesTable).toHaveBeenCalled());
    const {columns}=exportSalesTable.mock.calls[0][0];
    expect(columns[1].exportValue(nc)).toBe('NC 000000001');
    expect(columns[9].value(nc)).toBe(nc.descripcion);
    expect(columns[10].value(nc)).toBe(4.25);
    expect(columns[10].value(km)).toBe(0);
    expect(columns[10].value(part)).toBe(3);
    expect(columns[11].value(nc)).toBe(-10.25);
  });
  it('hides export without permission and blocks exports while loading, after errors or without rows', async () => {
    can.mockReturnValue(false); rpc.mockResolvedValue({error:null,data:[line]});
    const first=render(<ServiciosDetalleOS {...props} />);
    await screen.findByText('1 líneas · 1 documentos');
    expect(can).toHaveBeenCalledWith('datos:exportar');
    expect(screen.queryByRole('button',{name:'Acciones de la sección'})).not.toBeInTheDocument();
    first.unmount(); can.mockReturnValue(true);
    rpc.mockResolvedValue({error:null,data:[]});
    const empty=render(<ServiciosDetalleOS {...props} />);
    expect(screen.getByRole('button',{name:'Acciones de la sección'})).toBeDisabled();
    await screen.findByText('No hay líneas facturadas para estos filtros.');
    expect(screen.getByRole('button',{name:'Acciones de la sección'})).toBeDisabled();
    empty.unmount(); rpc.mockResolvedValue({error:{message:'Error de consulta'},data:null});
    render(<ServiciosDetalleOS {...props} />);
    await screen.findByRole('alert');
    expect(screen.getByRole('button',{name:'Acciones de la sección'})).toBeDisabled();
    expect(exportSalesTable).not.toHaveBeenCalled();
  });
  it('reports export failure and permits a retry without falsely claiming a download', async () => {
    rpc.mockResolvedValue({error:null,data:[line]}); exportSalesTable.mockImplementationOnce(()=>{throw new Error('Download failed');});
    render(<ServiciosDetalleOS {...props} />);
    await screen.findByText('1 líneas · 1 documentos');
    await selectExport();
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo exportar.');
    await selectExport();
    await waitFor(()=>expect(exportSalesTable).toHaveBeenCalledTimes(2));
    await waitFor(()=>expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });
  it('replaces Concepto with real product/service codes, leaving unknown codes empty without inventing MA01', async () => {
    rpc.mockResolvedValue({error:null,data:[{...line,codigo:'MA01'},
      {...line,id:'part-code',componente:'Repuestos',codigo:'REPIN004178'},
      {...line,id:'km-code',componente:'Kilometraje',codigo:'KM01'},
      {...line,id:'third-code',componente:'Terceros',codigo:'SE'},
      {...line,id:'missing-code',codigo:null},
      {...line,id:'old-code',codigo:undefined},
      {...line,id:'blank-code',codigo:'  '}
    ]});
    const {container}=render(<ServiciosDetalleOS {...props} />);
    expect(await screen.findByText('MA01')).toBeInTheDocument();
    expect(screen.getByText('Código')).toBeInTheDocument();
    expect(screen.queryByText('Concepto')).not.toBeInTheDocument();
    expect(screen.queryByText('Mano de obra')).not.toBeInTheDocument();
    for (const [id,code] of [['line-1','MA01'],['part-code','REPIN004178'],['km-code','KM01'],['third-code','SE'],['missing-code','—'],['old-code','—'],['blank-code','—']]) {
      const row=container.querySelector(`[data-invoice-line="${id}"]`) as HTMLElement;
      expect(row.children[8].textContent).toBe(code);
      expect(row.children[8]).toHaveClass('truncate');
      expect(row.children[8].getAttribute('title')).toContain(id==='part-code'?'Repuestos':id==='km-code'?'Kilometraje':id==='third-code'?'Terceros':'Mano de obra');
    }
    expect(container.querySelectorAll('[data-invoice-line]')).toHaveLength(7);
  });
  it('shows OS clock hours for labor, OS kilometers for travel, and invoice quantities for parts/third parties', async () => {
    rpc.mockResolvedValue({error:null,data:[line,
      {...line,id:'km',componente:'Kilometraje',cantidad:1,cantidad_os:76},
      {...line,id:'part',componente:'Repuestos',cantidad:3,cantidad_os:null},
      {...line,id:'third',componente:'Terceros',cantidad:2,cantidad_os:null},
      {...line,id:'unknown',cantidad_os:null},
      {...line,id:'zero',cantidad_os:0},
      {...line,id:'old-schema',cantidad_os:undefined}
    ]});
    render(<ServiciosDetalleOS {...props} />);
    expect(await screen.findByTitle('Horas de la OS: 4')).toHaveTextContent(/^4$/);
    expect(screen.getByTitle('Kilómetros de la OS: 76')).toHaveTextContent(/^76$/);
    expect(screen.getByTitle('Cantidad facturada: 3')).toHaveTextContent('3');
    expect(screen.getByTitle('Cantidad facturada: 2')).toHaveTextContent('2');
    expect(screen.getByTitle('Horas de la OS: no informada')).toHaveTextContent('—');
    expect(screen.getByTitle('Horas de la OS: 0')).toHaveTextContent(/^0$/);
    expect(screen.getByTitle(/requiere SQL de cantidad operacional/)).toHaveTextContent('—');
  });
  it('keeps recipient and owners distinct; opens machine history only on demand', async () => {
    rpc.mockResolvedValue({ error: null, data: [line] });
    render(<ServiciosDetalleOS {...props} buscar="valdecir mohr" />);
    expect(await screen.findByTitle('Propietario actual: Propietario no informado · En la OS: VALDECIR MOHR')).toHaveTextContent('No informado');
    expect(screen.getByText('Pagador tercero')).toBeInTheDocument();
    expect(screen.queryByText('Historial: C7501463')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', {name:'C7501463'}));
    expect(screen.getByText('Historial: C7501463')).toBeInTheDocument();
    expect(rpc).toHaveBeenCalledWith('ventas_servicios_lineas_v2', expect.objectContaining({p_desde:props.desde,p_hasta:props.hasta,p_sucursal:null,p_tipo_tiempo:null}));
  });
  it('preserves repeated invoice/OS, identical lines, individual components, NC and history without OS', async () => {
    rpc.mockResolvedValue({data:[line, {...line,id:'line-2'}, {...line,id:'line-3',componente:'Kilometraje',descripcion:'Traslado',total_venta:20},
      {...line,id:'credit',factura:'NC-54',es_nota_credito:true,total_venta:-50},
      {...line,id:'legacy',factura:'legacy-99',os:null,chasis:null,total_venta:10.25}],error:null});
    const {container} = render(<ServiciosDetalleOS {...props} />);
    expect(await screen.findByText('5 líneas · 3 documentos')).toBeInTheDocument();
    expect(container.querySelectorAll('[data-invoice-line]')).toHaveLength(5);
    expect(screen.getAllByText('001-003-54')).toHaveLength(3);
    expect(screen.getAllByText('5734')).toHaveLength(4);
    expect(screen.getByTitle('Nota de crédito: NC-54')).toHaveTextContent('NC NC-54');
    expect(screen.getByText('Sin OS vinculada')).toBeInTheDocument();
    expect(screen.queryByText(/Total facturado/)).not.toBeInTheDocument();
    expect(screen.getByTitle('$ -50,00')).toHaveTextContent('$ -50,00');
    expect(screen.getByTitle('$ 10,25')).toHaveTextContent('$ 10,25');
    const mileage = container.querySelector('[data-invoice-line="line-3"]') as HTMLElement;
    expect(within(mileage).getByText('Traslado')).toBeInTheDocument();
    expect(within(mileage).getByTitle('Código no informado · Kilometraje')).toHaveTextContent('—');
    expect(container.querySelector('[class*="overflow-x-auto"], [class*="min-w-[1380px]"]')).toBeNull();
  });
  it('enforces dollar symbol, numeric-only quantities and no financial footer', async () => {
    rpc.mockResolvedValue({error:null,data:[{...line,total_venta:1234.56,cantidad_os:4.25},
      {...line,id:'km-format',componente:'Kilometraje',cantidad_os:76,total_venta:0}
    ]});
    const {container}=render(<ServiciosDetalleOS {...props} />);
    expect(await screen.findByTitle('$ 1.234,56')).toHaveTextContent('$ 1.234,56');
    expect(screen.getByTitle('$ 0,00')).toHaveTextContent('$ 0,00');
    expect(screen.getByTitle('Horas de la OS: 4,25')).toHaveTextContent(/^4,25$/);
    expect(screen.getByTitle('Kilómetros de la OS: 76')).toHaveTextContent(/^76$/);
    for(const row of container.querySelectorAll('[data-invoice-line]')){
      expect(row.children[10].textContent).toMatch(/^\d+(?:[.,]\d+)*$/);
      expect(row.children[11].textContent).toMatch(/^\$ /);
    }
    expect(container.textContent).not.toMatch(/USD|\d\s*(?:h|hs|km)\b|Total facturado/);
    expect(screen.getByText('2 líneas · 1 documentos')).toBeInTheDocument();
  });
  it('uses one visual line with separate columns, without explanatory text or stacked metadata', async () => {
    rpc.mockResolvedValue({data:[line],error:null});
    const {container}=render(<ServiciosDetalleOS {...props} />);
    await screen.findByText('Pagador tercero');
    const row=container.querySelector('[data-invoice-line]') as HTMLElement;
    expect(row).toHaveClass('h-9');
    expect(row.children).toHaveLength(12);
    for (const column of Array.from(row.children)) {
      expect(column).toHaveClass('truncate');
      expect(column.querySelectorAll('div, p, br')).toHaveLength(0);
    }
    expect(screen.queryByText(/Una fila por línea facturada/)).not.toBeInTheDocument();
    expect(screen.getByTitle('Reparación de máquina')).toHaveTextContent('Reparación de máquina');
    expect(screen.getByText('Sucursal')).toBeInTheDocument();
    expect(screen.getByText('Chasis')).toBeInTheDocument();
    expect(screen.getByText('Propietario')).toBeInTheDocument();
  });
  it('shares normalized search with Clients and updates without refetching', async () => {
    rpc.mockResolvedValue({data:[line,{...line,id:'other',cliente:'Otro',propietario_os:'Otro',os:'99',factura:'99',descripcion:'Otro'}],error:null});
    const {rerender,container} = render(<ServiciosDetalleOS {...props} buscar="Váldecir-Mohr" />);
    expect(await screen.findByText('1 líneas · 1 documentos')).toBeInTheDocument();
    expect(screen.queryByText('Otro')).not.toBeInTheDocument();
    rerender(<ServiciosDetalleOS {...props} buscar="001 / 003 / 54" />);
    expect(container.querySelectorAll('[data-invoice-line]')).toHaveLength(1);
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it('passes machine, branch and time filters to the financial line query', async () => {
    rpc.mockResolvedValue({data:[],error:null});
    render(<ServiciosDetalleOS {...props} marca="HORSCH" tipoMaquina="SEMBRADORAS" sucursal="Katuete" tipoTiempo="Garantia" />);
    await waitFor(()=>expect(rpc).toHaveBeenCalledWith('ventas_servicios_lineas_v2',expect.objectContaining({p_marca:'HORSCH',p_tipo_maquina:'SEMBRADORAS',p_sucursal:'Katuete',p_tipo_tiempo:'Garantia'})));
  });
  it('shows timeout as an error, never as an empty result', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'canceling statement due to statement timeout' } });
    render(<ServiciosDetalleOS {...props} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('statement timeout');
    expect(screen.queryByText('No hay líneas facturadas para estos filtros.')).not.toBeInTheDocument();
  });
  it('handles rejected network requests without an infinite loader', async () => {
    rpc.mockRejectedValue(new Error('Sin conexión'));
    render(<ServiciosDetalleOS {...props} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Sin conexión');
    expect(screen.queryByText('Cargando…')).not.toBeInTheDocument();
  });
  it('shows empty only for a successful empty response', async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    render(<ServiciosDetalleOS {...props} />);
    expect(await screen.findByText('No hay líneas facturadas para estos filtros.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
  it('does not query an invalid date range', async () => {
    render(<ServiciosDetalleOS {...props} desde="2026-09-12" hasta="2026-09-11" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Seleccioná un rango de fechas válido');
    expect(rpc).not.toHaveBeenCalled();
    expect(screen.queryByText('Cargando…')).not.toBeInTheDocument();
  });
  it('ignores stale responses after changing the period', async () => {
    let resolveOld: (value:unknown)=>void = ()=>{};
    rpc.mockImplementationOnce(()=>new Promise(resolve=>{resolveOld=resolve;})).mockResolvedValue({data:[{...line,id:'new',factura:'NEW'}],error:null});
    const {rerender} = render(<ServiciosDetalleOS {...props} />);
    rerender(<ServiciosDetalleOS {...props} desde="2026-08-01" />);
    expect(await screen.findByText('NEW')).toBeInTheDocument();
    resolveOld({data:[line],error:null});
    await waitFor(()=>expect(screen.queryByText('001-003-54')).not.toBeInTheDocument());
  });
});
