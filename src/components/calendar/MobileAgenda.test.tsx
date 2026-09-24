import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {MobileAgenda} from './MobileAgenda';
afterEach(cleanup);
describe('mobile calendar agenda',()=>{
 it('retains separate jornadas, non-working information and availability without making schedule changes',()=>{
  const day=vi.fn(),event=vi.fn();
  const first={id:'OS1',jornada:'J1'},second={id:'OS1',jornada:'J2'};
  render(<MobileAgenda days={[{key:'2026-09-24',label:'jue 24 de sep',nonWorking:'Feriado',events:[{key:'J1',label:'Cliente de prueba',status:'Pendiente',value:first},{key:'J2',label:'Cliente de prueba',status:'En curso',value:second}],availability:[{key:'D1',label:'Técnico · Capacitación'}]},{key:'2026-09-25',label:'vie 25 de sep',events:[],availability:[]}]} onDay={day} onEvent={event}/>);
  expect(screen.getByText('Feriado')).toBeInTheDocument();
  expect(screen.getByText('Técnico · Capacitación')).toBeInTheDocument();
  expect(screen.getByText('Sin actividades programadas')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Cliente de prueba En curso'}));
  expect(event).toHaveBeenCalledExactlyOnceWith(second);
  fireEvent.click(screen.getByRole('button',{name:'jue 24 de sep'}));
  expect(day).toHaveBeenCalledExactlyOnceWith('2026-09-24');
  expect(screen.getAllByTitle('Cliente de prueba')).toHaveLength(2);
 });
});
