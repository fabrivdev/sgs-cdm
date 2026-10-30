import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {CampiBadgeActor,badgeMood} from './CampiBadgeActor';
let show:IntersectionObserverCallback,reduced=false,change:()=>void,images:MockImage[]=[],rafs:Map<number,FrameRequestCallback>,clock=1000,id=0;
class MockImage{onload:(()=>void)|null=null;onerror:(()=>void)|null=null;src='';constructor(){images.push(this)}}
beforeEach(()=>{images=[];rafs=new Map();clock=1000;id=0;reduced=false;vi.stubGlobal('Image',MockImage);vi.stubGlobal('requestAnimationFrame',(cb:FrameRequestCallback)=>{rafs.set(++id,cb);return id});vi.stubGlobal('cancelAnimationFrame',(key:number)=>rafs.delete(key));
 globalThis.IntersectionObserver=class{constructor(cb:IntersectionObserverCallback){show=cb;}observe(){}disconnect(){}} as unknown as typeof IntersectionObserver;
 window.matchMedia=(()=>({get matches(){return reduced},addEventListener(_:string,cb:()=>void){change=cb},removeEventListener(){}})) as unknown as typeof matchMedia;
 const noop=()=>{};const ctx=new Proxy({drawImage:vi.fn(),createRadialGradient:()=>({addColorStop:noop})},{get:(o,k)=>k in o?o[k as keyof typeof o]:noop,set:()=>true});vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
});
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.restoreAllMocks();});
const load=()=>act(()=>images.forEach(i=>i.onload?.()));
const visible=(value=true)=>act(()=>show([{isIntersecting:value,intersectionRatio:value?1:0}] as IntersectionObserverEntry[],{} as IntersectionObserver));
const advance=(seconds:number)=>act(()=>{for(let i=0;i<seconds*20+2;i++){clock+=50;const list=[...rafs.values()];rafs.clear();list.forEach(f=>f(clock));}});
it('maps only content and loading, never business sentiment',()=>{expect(badgeMood(true,false)).toBe('attentive');expect(badgeMood(false,true)).toBe('thinking');expect(badgeMood(false,false)).toBe('neutral');});
it('starts offscreen paused and cycles three native-button gestures with a busy guard',()=>{render(<CampiBadgeActor mood="attentive" messageKey="a"/>);load();expect(rafs.size).toBe(0);visible();advance(5.1);const b=screen.getByRole('button',{name:'Saludar a Campi'});expect(b).toHaveAttribute('type','button');for(const gesture of ['saludo','sorpresa','saltito']){fireEvent.click(b);expect(b).toHaveAttribute('data-gesture',gesture);advance(.5);fireEvent.click(b);expect(b).toHaveAttribute('data-gesture',gesture);advance(4.6);expect(b).toHaveAttribute('data-gesture','rest');}expect(screen.queryByRole('link')).toBeNull();});
it('pauses hidden time and disposes all RAF on unmount',()=>{let hidden=false;vi.spyOn(document,'hidden','get').mockImplementation(()=>hidden);const t=render(<CampiBadgeActor mood="thinking" messageKey="a"/>);visible();load();expect(rafs.size).toBe(1);hidden=true;fireEvent(document,new Event('visibilitychange'));expect(rafs.size).toBe(0);expect(screen.getByRole('button')).toHaveAttribute('data-motion','off');hidden=false;fireEvent(document,new Event('visibilitychange'));expect(rafs.size).toBe(1);t.unmount();expect(rafs.size).toBe(0);});
it('reduced motion cancels gestures and keeps a static actor',()=>{render(<CampiBadgeActor mood="attentive" messageKey="a"/>);visible();load();fireEvent.click(screen.getByRole('button'));reduced=true;act(()=>change());fireEvent.click(screen.getByRole('button'));expect(screen.getByRole('button')).toHaveAttribute('data-motion','off');expect(screen.getByRole('button')).toHaveAttribute('data-gesture','rest');expect(rafs.size).toBe(0);});
it('updates message without recreating actor or losing offscreen state',()=>{const t=render(<CampiBadgeActor mood="thinking" messageKey="a"/>);visible();load();fireEvent.click(screen.getByRole('button'));t.rerender(<CampiBadgeActor mood="attentive" messageKey="b"/>);expect(screen.getByRole('button')).toHaveAttribute('data-gesture','presentacion');expect(images.length).toBe(3);visible(false);t.rerender(<CampiBadgeActor mood="neutral" messageKey="c"/>);expect(rafs.size).toBe(0);});
it('pauses for modal and resumes after closing it',async()=>{render(<CampiBadgeActor mood="neutral" messageKey="a"/>);visible();load();const modal=document.createElement('div');modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');await act(async()=>{document.body.appendChild(modal)});expect(rafs.size).toBe(0);await act(async()=>{modal.remove()});expect(rafs.size).toBe(1);});
it('ignores late image completion after unmount and keeps reserved space without a partial actor on load error',()=>{const t=render(<CampiBadgeActor mood="neutral" messageKey="a"/>);act(()=>images[0].onerror?.());expect(rafs.size).toBe(0);t.unmount();load();expect(rafs.size).toBe(0);});

it('keeps one fixed canvas hidden until all images finish decoding, then reveals a drawn frame',async()=>{
 let resolve!:()=>void;const pending=new Promise<void>(r=>{resolve=r});
 const t=render(<CampiBadgeActor mood="neutral" messageKey="cold"/>);
 const c=t.container.querySelector('canvas')!;
 expect(c).toHaveAttribute('width','240');expect(c).toHaveAttribute('height','224');
 expect(c).toHaveStyle({visibility:'hidden'});expect(t.container.querySelector('svg,image')).toBeNull();
 expect(screen.getByRole('button')).toBeDisabled();
 Object.assign(images[2],{decode:()=>pending});load();
 expect(c).toHaveStyle({visibility:'hidden'});expect(rafs.size).toBe(0);
 const ctx=c.getContext('2d')!;const draw=vi.spyOn(ctx,'drawImage');
 await act(async()=>{resolve();await pending;});
 expect(draw).toHaveBeenCalled();expect(c).toHaveStyle({visibility:'visible'});
 expect(screen.getByRole('button')).not.toBeDisabled();
 t.rerender(<CampiBadgeActor mood="attentive" messageKey="next"/>);
 expect(t.container.querySelector('canvas')).toBe(c);expect(images).toHaveLength(3);
});
it('does not reveal or start after a failed asset even if other assets finish later',()=>{
 const t=render(<CampiBadgeActor mood="neutral" messageKey="error"/>);
 act(()=>images[1].onerror?.());load();
 expect(t.container.querySelector('canvas')).toHaveStyle({visibility:'hidden'});
 expect(screen.getByRole('button',{name:'Campi no disponible'})).toBeDisabled();expect(rafs.size).toBe(0);
});
it('ignores decoded images after disposal and supports a fresh mount',async()=>{
 let resolve!:()=>void;const pending=new Promise<void>(r=>{resolve=r});
 const t=render(<CampiBadgeActor mood="neutral" messageKey="old"/>);
 Object.assign(images[0],{decode:()=>pending});load();t.unmount();
 await act(async()=>{resolve();await pending;});expect(rafs.size).toBe(0);
 const next=render(<CampiBadgeActor mood="neutral" messageKey="new"/>);load();
 expect(next.container.querySelector('canvas')).toHaveStyle({visibility:'visible'});
});

it('handles decode rejection without exposing an incomplete frame',async()=>{
 const t=render(<CampiBadgeActor mood="neutral" messageKey="decode-error"/>);
 Object.assign(images[0],{decode:()=>Promise.reject(new Error('decode failed'))});
 await act(async()=>{images.forEach(i=>i.onload?.());await Promise.resolve();});
 expect(t.container.querySelector('canvas')).toHaveStyle({visibility:'hidden'});
 expect(screen.getByRole('button',{name:'Campi no disponible'})).toHaveAttribute('aria-busy','false');
 expect(rafs.size).toBe(0);
});
it('ignores repeated image load events without creating another actor',()=>{
 render(<CampiBadgeActor mood="attentive" messageKey="once"/>);visible();load();
 expect(rafs.size).toBe(1);load();expect(rafs.size).toBe(1);
});
