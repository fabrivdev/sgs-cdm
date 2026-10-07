import {Fragment} from 'react';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {FiltersBar,FilterSelect} from './FiltersBar';
vi.stubGlobal('ResizeObserver',class {observe(){} disconnect(){}});
afterEach(cleanup);
describe('compact mobile filter bar',()=>{
 it('shortens only the mobile placeholder and retains a descriptive accessible label',()=>{
  render(<FiltersBar search={{value:'',onChange:vi.fn(),placeholder:'Modelo, chasis o factura'}}/>);
  expect(screen.getByPlaceholderText('Buscar…')).toHaveAttribute('aria-description','Modelo, chasis o factura');
  expect(screen.getByPlaceholderText('Buscar…')).toHaveAttribute('aria-label','Buscar');
  expect(screen.getByPlaceholderText('Modelo, chasis o factura')).toBeInTheDocument();
  expect(screen.getByPlaceholderText('Buscar…')).toHaveClass('h-9','text-base');
 });
 it('keeps the section action mounted once and filter controls available in the panel',()=>{
  render(<FiltersBar search={{value:'',onChange:vi.fn()}} secondaryActions={<button>Exportación</button>}><FilterSelect label="Marca" value="all" onChange={()=>{}} placeholder="Todas" options={[{value:'all',label:'Todas'}]}/></FiltersBar>);
  expect(screen.getAllByRole('button',{name:'Exportación'})).toHaveLength(1);
  fireEvent.click(screen.getByRole('button',{name:'Más filtros'}));
  expect(screen.getByRole('dialog')).toHaveTextContent('Marca');
  expect(screen.getByRole('button',{name:'Limpiar'})).toHaveClass('max-sm:min-h-11');
  expect(screen.getByRole('button',{name:'Aplicar'})).toHaveClass('max-sm:min-h-11');
  expect(screen.queryAllByRole('button',{name:'Exportación'})).toHaveLength(0);
  expect(screen.getAllByRole('button',{name:'Exportación',hidden:true})).toHaveLength(1);
 });

 it.each([
  ['without filter children', undefined],
  ['with false', false],
  ['with null', null],
  ['with an empty fragment', <Fragment>{false}{null}{undefined}</Fragment>],
  ['with nested empty fragments', <><Fragment>{false}</Fragment>{null}</>],
  ['with blank text', <> {'   '} </>],
 ])('does not show an empty filter panel %s',(_label,children)=>{
  render(<FiltersBar search={{value:'',onChange:vi.fn()}} secondaryActions={<button>Exportación</button>}>{children}</FiltersBar>);
  expect(screen.queryByRole('button',{name:'Más filtros'})).not.toBeInTheDocument();
  expect(screen.getByRole('button',{name:'Exportación'})).toBeInTheDocument();
 });

 it('recognizes useful content inside nested fragments and exposes the drawer state',()=>{
  render(<FiltersBar search={{value:'',onChange:vi.fn()}}><><Fragment><FilterSelect label="Marca" value="all" onChange={()=>{}} placeholder="Todas" options={[{value:'all',label:'Todas'}]}/></Fragment></></FiltersBar>);
  const filters=screen.getByRole('button',{name:'Más filtros'});
  expect(filters).toHaveClass('sm:hidden');
  expect(filters).toHaveAttribute('aria-expanded','false');
  expect(filters).toHaveAttribute('aria-controls');
  fireEvent.click(filters);
  expect(filters).toHaveAttribute('aria-expanded','true');
  expect(screen.getByRole('dialog')).toHaveTextContent('Marca');
  fireEvent.click(screen.getByRole('button',{name:'Close'}));
  expect(filters).toHaveAttribute('aria-expanded','false');
 });

 it('does not count an empty expanded fragment as additional filters',()=>{
  render(<FiltersBar search={{value:'',onChange:vi.fn()}} activeCount={1} onClear={vi.fn()} expanded={<>{false}{null}</>} secondaryActions={<button>Exportación</button>}/>);
  expect(screen.queryByRole('button',{name:'Más filtros'})).not.toBeInTheDocument();
 });

 it('separates desktop secondary filters from mobile primary controls',()=>{
  render(<FiltersBar
    search={{value:'',onChange:vi.fn()}}
    expanded={<FilterSelect label="Vendedor" value="all" onChange={()=>{}} placeholder="Todos" options={[{value:'all',label:'Todos'}]}/>}
  >
    <FilterSelect label="Sucursal" value="all" onChange={()=>{}} placeholder="Todas" options={[{value:'all',label:'Todas'}]}/>
  </FiltersBar>);
  const filters=screen.getByRole('button',{name:'Más filtros'});
  expect(filters).not.toHaveClass('sm:hidden');
  fireEvent.click(filters);
  const panel=screen.getByRole('dialog');
  expect(panel.querySelector('[data-primary-filter-panel]')).toHaveClass('sm:hidden');
  expect(panel.querySelector('[data-primary-filter-panel]')).toHaveTextContent('Sucursal');
  expect(panel.querySelector('[data-expanded-filter-panel]')).toHaveTextContent('Vendedor');
 });
});
