import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription,DialogFooter} from './dialog';
import {Sheet,SheetContent,SheetHeader,SheetTitle,SheetDescription} from './sheet';
afterEach(cleanup);
describe('mobile form affordances',()=>{
 it('reserves title space, keeps the close control accessible and does not submit a form when closing',()=>{
  const close=vi.fn(),submit=vi.fn();
  render(<Dialog open onOpenChange={close}><DialogContent><form onSubmit={e=>{e.preventDefault();submit()}}><DialogHeader><DialogTitle>Editar pedido con título largo</DialogTitle><DialogDescription>Datos de prueba</DialogDescription></DialogHeader><DialogFooter><button type="submit">Guardar</button></DialogFooter></form></DialogContent></Dialog>);
  expect(screen.getByRole('button',{name:'Close'})).toHaveClass('h-11','w-11');
  expect(screen.getByRole('heading').parentElement).toHaveClass('pr-10');
  fireEvent.click(screen.getByRole('button',{name:'Close'}));
  expect(close).toHaveBeenCalledWith(false);expect(submit).not.toHaveBeenCalled();
 });
 it('uses the same touch target in side panels',()=>{
  render(<Sheet open><SheetContent><SheetHeader><SheetTitle>Filtros</SheetTitle><SheetDescription>Opciones</SheetDescription></SheetHeader></SheetContent></Sheet>);
  expect(screen.getByRole('button',{name:'Close'})).toHaveClass('h-11','w-11');
 });
});
