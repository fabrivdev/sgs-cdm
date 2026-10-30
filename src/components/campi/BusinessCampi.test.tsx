import {act,cleanup,render,screen} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {BusinessCampi} from './BusinessCampi';
import type {PanoramaStory} from '@/lib/campi/panoramaStoryTypes';
vi.mock('./CampiBadgeActor',()=>({badgeMood:()=> 'neutral',CampiBadgeActor:()=> <button aria-label="Saludar a Campi"/>}));
vi.mock('./CampiPanoramaAvatar',()=>({CampiPanoramaAvatar:()=>null}));
const row=(id:PanoramaStory['id'],label:string):PanoramaStory=>({id,title:label,question:'',status:'ready',message:'',scope:'',sections:['repuestos.ventas'],cutoff:null,time:{window:{from:'2026-10-01',to:'2026-10-28'}},periodLabel:'octubre',primary:{label,value:100,unit:'USD',comparison:{value:80,label:'mismo tramo anterior'}},supporting:[],chart:null,breakdown:[],details:[],source:'fixture',route:''});
let show:IntersectionObserverCallback;
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-28T12:00:00Z'));localStorage.clear();globalThis.IntersectionObserver=class {constructor(cb:IntersectionObserverCallback){show=cb;}observe(){}disconnect(){}} as unknown as typeof IntersectionObserver;});
afterEach(()=>{cleanup();vi.useRealTimers();vi.unstubAllGlobals();});
const view=(stories:PanoramaStory[],allowed=true,user='a')=><BusinessCampi userId={user} stories={stories} hasAccess={()=>allowed} loading={false}/>;
it('solo comenta sin botones enlaces ni detalle; respeta rondas y vuelve al primero al terminar',()=>{
 render(view([row('ventas_evolucion','Ventas'),row('ventas_facturacion','Neto')]));
 expect(screen.getAllByRole('button')).toHaveLength(1);expect(screen.getByRole('button',{name:'Saludar a Campi'})).toBeInTheDocument();expect(screen.queryByRole('link')).toBeNull();expect(screen.queryByText(/Ver detalle|Más detalles/)).toBeNull();
 expect(screen.getByRole('heading')).toHaveTextContent('facturación bruta');
 act(()=>show([{isIntersecting:true,intersectionRatio:1}] as IntersectionObserverEntry[],{} as IntersectionObserver));
 act(()=>vi.advanceTimersByTime(60000));expect(screen.getByRole('heading')).toHaveTextContent('facturación neta');
 act(()=>show([{isIntersecting:true,intersectionRatio:1}] as IntersectionObserverEntry[],{} as IntersectionObserver));
 act(()=>vi.advanceTimersByTime(60000));expect(screen.getByRole('heading')).toHaveTextContent('facturación bruta');
 act(()=>show([{isIntersecting:true,intersectionRatio:1}] as IntersectionObserverEntry[],{} as IntersectionObserver));
 act(()=>vi.advanceTimersByTime(60000));expect(screen.getByRole('heading')).toHaveTextContent('facturación neta');
});
it('no avanza antes de presentación visible y no escribe ni borra memoria',()=>{
 localStorage.setItem('sig-cdm:campi:findings:v1:a','{"preserved":true}');
 render(view([row('ventas_evolucion','Ventas'),row('ventas_facturacion','Neto')]));
 act(()=>vi.advanceTimersByTime(60000));expect(screen.getByRole('heading')).toHaveTextContent('facturación bruta');
 expect(localStorage.getItem('sig-cdm:campi:findings:v1:a')).toBe('{"preserved":true}');
});
it('retira inmediatamente temas y permisos, sin fallback ni texto anterior de otro usuario',()=>{
 const v=render(view([row('ventas_evolucion','Ventas')]));
 v.rerender(view([row('ventas_facturacion','Neto')]));expect(screen.getByRole('heading')).toHaveTextContent('facturación neta');
 v.rerender(view([row('ventas_facturacion','Neto')],false,'b'));expect(screen.getByRole('heading')).not.toHaveTextContent('facturación neta');
 expect(screen.getByRole('heading')).toHaveTextContent('Todavía no tengo información suficiente');
});

it('espera resolución de temas antes de comenzar rondas y no adelanta A2 mientras B carga',()=>{
 const a=row('ventas_evolucion','Ventas');a.supporting=[{label:'Ventas acumuladas del año',value:400,unit:'USD',comparison:{value:300,label:'anterior'}}];
 const b=row('ventas_facturacion','Neto');
 const v=render(<BusinessCampi userId="a" stories={[a]} hasAccess={()=>true} loading/>);
 act(()=>vi.advanceTimersByTime(60000));expect(screen.getByRole('heading')).toHaveTextContent('Estoy revisando');
 v.rerender(view([a,b]));expect(screen.getByRole('heading')).toHaveTextContent('facturación bruta');
 act(()=>show([{isIntersecting:true,intersectionRatio:1}] as IntersectionObserverEntry[],{} as IntersectionObserver));
 act(()=>vi.advanceTimersByTime(60000));expect(screen.getByRole('heading')).toHaveTextContent('facturación neta');
 act(()=>show([{isIntersecting:true,intersectionRatio:1}] as IntersectionObserverEntry[],{} as IntersectionObserver));
 act(()=>vi.advanceTimersByTime(60000));expect(screen.getByRole('heading')).toHaveTextContent('La facturación bruta acumulada alcanza $ 400');
});


it('uno y cero comentarios no crean temporizadores de rotación',()=>{
 const v=render(view([row('ventas_evolucion','Ventas')]));
 expect(vi.getTimerCount()).toBe(0);
 act(()=>vi.advanceTimersByTime(180000));expect(screen.getByRole('heading')).toHaveTextContent('facturación bruta');
 v.rerender(view([]));expect(vi.getTimerCount()).toBe(0);
 expect(screen.getByRole('heading')).toHaveTextContent('Todavía no tengo información suficiente');
});
it('cancela el ciclo anterior al cambiar datos, lista o usuario y al desmontar',()=>{
 const a=row('ventas_evolucion','Ventas'),b=row('ventas_facturacion','Neto');
 const v=render(view([a,b]));
 const visible=()=>act(()=>show([{isIntersecting:true,intersectionRatio:1}] as IntersectionObserverEntry[],{} as IntersectionObserver));
 visible();visible();expect(vi.getTimerCount()).toBe(1);
 act(()=>vi.advanceTimersByTime(60000));expect(screen.getByRole('heading')).toHaveTextContent('facturación neta');
 visible();
 v.rerender(view([{...a,primary:{...a.primary!,value:123}},b]));
 expect(screen.getByRole('heading')).toHaveTextContent('$ 123');expect(vi.getTimerCount()).toBe(0);
 visible();v.rerender(view([b,a],true,'b'));
 expect(screen.getByRole('heading')).toHaveTextContent('facturación neta');expect(vi.getTimerCount()).toBe(0);
 visible();v.rerender(view([a]));expect(vi.getTimerCount()).toBe(0);
 v.unmount();expect(vi.getTimerCount()).toBe(0);
});
it('pausa fuera de vista, con documento oculto y con modal sin duplicar temporizadores',()=>{
 render(view([row('ventas_evolucion','Ventas'),row('ventas_facturacion','Neto')]));
 const visibility=(visible:boolean)=>act(()=>show([{isIntersecting:visible,intersectionRatio:visible?1:0}] as IntersectionObserverEntry[],{} as IntersectionObserver));
 visibility(true);expect(vi.getTimerCount()).toBe(1);
 visibility(false);expect(vi.getTimerCount()).toBe(0);
 act(()=>vi.advanceTimersByTime(60000));expect(screen.getByRole('heading')).toHaveTextContent('facturación bruta');
 const hidden=vi.spyOn(document,'hidden','get').mockReturnValue(true);
 visibility(true);expect(vi.getTimerCount()).toBe(0);
 hidden.mockReturnValue(false);act(()=>document.dispatchEvent(new Event('visibilitychange')));expect(vi.getTimerCount()).toBe(1);
 const modal=document.createElement('div');modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');document.body.append(modal);
 act(()=>document.dispatchEvent(new Event('visibilitychange')));expect(vi.getTimerCount()).toBe(0);
 modal.remove();act(()=>document.dispatchEvent(new Event('visibilitychange')));expect(vi.getTimerCount()).toBe(1);
 hidden.mockRestore();
});


it('distingue carga, error, información insuficiente y comparaciones sin variación',()=>{
 const a=row('ventas_evolucion','Ventas');a.primary!.comparison!.value=a.primary!.value!;
 const v=render(<BusinessCampi userId="a" stories={[]} hasAccess={()=>true} loading/>);
 expect(screen.getByRole('heading')).toHaveTextContent('Estoy revisando las novedades de tu panorama.');
 v.rerender(<BusinessCampi userId="a" stories={[]} hasAccess={()=>true} loading={false} failed/>);
 expect(screen.getByRole('heading')).toHaveTextContent('No pude verificar los datos de tus temas.');
 v.rerender(view([]));expect(screen.getByRole('heading')).toHaveTextContent('Todavía no tengo información suficiente para destacar una novedad.');
 v.rerender(view([a]));expect(screen.getByRole('heading')).toHaveTextContent('Por ahora no hay comparaciones verificadas para comentar.');
});
