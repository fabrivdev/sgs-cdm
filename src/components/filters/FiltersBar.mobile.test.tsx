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
  expect(screen.queryAllByRole('button',{name:'Exportación'})).toHaveLength(0);
  expect(screen.getAllByRole('button',{name:'Exportación',hidden:true})).toHaveLength(1);
 });
});
