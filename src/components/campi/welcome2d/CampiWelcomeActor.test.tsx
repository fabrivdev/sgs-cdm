import {createRef} from 'react';
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {CampiWelcomeActor} from './CampiWelcomeActor';
vi.mock('./entryRenderer',()=>({createEntryRenderer:()=>({duration:1,draw:vi.fn(),resize:vi.fn()})}));
beforeEach(()=>{vi.useFakeTimers();vi.stubGlobal('Image',class {onload:(()=>void)|null=null;onerror=null;set src(_:string){this.onload?.();}});});afterEach(()=>{cleanup();vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals();});
function setup(){const ref=createRef<{prepare():void}>();const next=vi.fn();const view=render(<CampiWelcomeActor ref={ref} onAdvance={next}/>);return{ref,next,...view};}
it('does not block early CTA waiting for the atlas and ignores double clicks',()=>{const t=setup();act(()=>{t.ref.current?.prepare();t.ref.current?.prepare();});expect(t.next).toHaveBeenCalledOnce();});
it('plays a loaded sequence then returns to neutral, and invites once',()=>{const t=setup();t.container.querySelectorAll('[data-preload]').forEach(image=>fireEvent.load(image));act(()=>vi.advanceTimersByTime(7000));expect(screen.getByRole('img')).toHaveAttribute('data-frame','0');act(()=>{t.ref.current?.prepare();t.ref.current?.prepare();});act(()=>vi.advanceTimersByTime(2000));expect(t.next).toHaveBeenCalledOnce();});
it('cancels navigation on unmount and reentry owns a fresh controller',()=>{const a=setup();a.container.querySelectorAll('[data-preload]').forEach(image=>fireEvent.load(image));act(()=>vi.advanceTimersByTime(1200));act(()=>a.ref.current?.prepare());a.unmount();act(()=>vi.advanceTimersByTime(5000));expect(a.next).not.toHaveBeenCalled();expect(vi.getTimerCount()).toBe(0);const b=setup();expect(screen.getByRole('img')).toHaveAttribute('data-frame','0');expect(b.next).not.toHaveBeenCalled();});
it('loaded reduced-motion scene stays still and advances immediately',()=>{vi.spyOn(window,'matchMedia').mockReturnValue({matches:true,addEventListener(){},removeEventListener(){}} as unknown as MediaQueryList);const t=setup();t.container.querySelectorAll('[data-preload]').forEach(image=>fireEvent.load(image));act(()=>vi.advanceTimersByTime(7000));expect(screen.getByRole('img')).toHaveAttribute('data-frame','0');act(()=>t.ref.current?.prepare());expect(t.next).toHaveBeenCalledOnce();});

it('keeps the user-marked visible size even on high-density displays',()=>{vi.spyOn(window,'devicePixelRatio','get').mockReturnValue(2);setup();expect(screen.getByRole('img')).toHaveStyle({maxWidth:'368px',maxHeight:'350px'});});

it('stops RAF while hidden and resumes without replaying the greeting',()=>{let hidden=false;vi.spyOn(document,'hidden','get').mockImplementation(()=>hidden);const t=setup();t.container.querySelectorAll('[data-preload]').forEach(image=>fireEvent.load(image));expect(vi.getTimerCount()).toBe(1);hidden=true;fireEvent(document,new Event('visibilitychange'));expect(vi.getTimerCount()).toBe(0);hidden=false;fireEvent(document,new Event('visibilitychange'));expect(vi.getTimerCount()).toBe(1);});
it('does not schedule RAF for reduced-motion scenes',()=>{vi.spyOn(window,'matchMedia').mockReturnValue({matches:true,addEventListener(){},removeEventListener(){}} as unknown as MediaQueryList);const t=setup();t.container.querySelectorAll('[data-preload]').forEach(image=>fireEvent.load(image));expect(vi.getTimerCount()).toBe(0);});

it('cancels entry once for early CTA without starting greeting',()=>{const t=setup();t.container.querySelectorAll('[data-preload]').forEach(image=>fireEvent.load(image));act(()=>vi.advanceTimersByTime(200));expect(t.container.querySelector('[data-entry-phase]')).toHaveAttribute('data-entry-phase','entry');act(()=>{t.ref.current?.prepare();t.ref.current?.prepare();});expect(t.next).toHaveBeenCalledOnce();act(()=>vi.advanceTimersByTime(7000));expect(screen.getByRole('img')).toHaveAttribute('data-frame','0');});

it('keeps canonical body and camera unchanged during the facial blink',()=>{
 const t=setup();t.container.querySelectorAll('[data-preload]').forEach(image=>fireEvent.load(image));
 const initial=screen.getByRole('img').getAttribute('viewBox');let found=false;
 for(let i=0;i<800;i++){act(()=>vi.advanceTimersByTime(16));if(screen.getByRole('img').getAttribute('data-frame')==='5'){found=true;break;}}
 expect(found).toBe(true);expect(screen.getByRole('img')).toHaveAttribute('viewBox',initial);
 expect(t.container.querySelector('[data-face-only="blink"]')).not.toBeNull();
 act(()=>vi.advanceTimersByTime(200));expect(t.container.querySelector('[data-face-only="blink"]')).toBeNull();
});
