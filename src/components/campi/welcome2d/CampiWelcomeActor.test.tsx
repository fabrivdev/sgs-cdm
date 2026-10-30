import {createRef} from 'react';
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {CampiWelcomeActor} from './CampiWelcomeActor';
import {clearCampiAssetCache,CAMPI_ASSET_TIMEOUT} from '../campiAssets';
const {draw,resize}=vi.hoisted(()=>({draw:vi.fn(),resize:vi.fn()}));
vi.mock('./entryRenderer',()=>({createEntryRenderer:()=>({duration:5.4,draw,resize,drawTimeline:vi.fn()})}));
let images:MockImage[]=[];
class MockImage{onload:(()=>void)|null=null;onerror:(()=>void)|null=null;src='';constructor(){images.push(this);}}
beforeEach(()=>{clearCampiAssetCache();images=[];vi.useFakeTimers();draw.mockClear();resize.mockClear();vi.stubGlobal('Image',MockImage);});
afterEach(()=>{cleanup();clearCampiAssetCache();vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals();});
const load=()=>act(()=>images.forEach(i=>i.onload?.()));
function setup(){const ref=createRef<{prepare():void}>(),next=vi.fn();return{ref,next,...render(<CampiWelcomeActor ref={ref} onAdvance={next}/>)};}
it('starts exactly three resources in parallel, no SVG atlas or presentation dependency',()=>{const t=setup();expect(images).toHaveLength(3);expect(images.some(i=>i.src.includes('presentacion'))).toBe(false);expect(t.container.querySelector('svg,image')).toBeNull();expect(draw).not.toHaveBeenCalled();expect(t.container.querySelector('canvas')).toHaveStyle({visibility:'hidden'});});
it('keeps entire entry at time zero after slow assets instead of consuming the greeting while loading',()=>{setup();act(()=>vi.advanceTimersByTime(15000));expect(draw).not.toHaveBeenCalled();load();expect(draw).toHaveBeenCalledWith(0);expect(screen.getByRole('group')).toHaveAttribute('data-entry-phase','entry');act(()=>vi.advanceTimersByTime(5600));expect(screen.getByRole('group')).toHaveAttribute('data-entry-phase','existing');});
it('does not block early CTA or start later after navigation',()=>{const t=setup();act(()=>{t.ref.current?.prepare();t.ref.current?.prepare();});expect(t.next).toHaveBeenCalledOnce();load();expect(draw).not.toHaveBeenCalled();});
it('waits for decoding before revealing the same canvas',async()=>{let resolve!:()=>void;const pending=new Promise<void>(r=>resolve=r);const t=setup();Object.assign(images[1],{decode:()=>pending});load();expect(t.container.querySelector('canvas')).toHaveStyle({visibility:'hidden'});await act(async()=>{resolve();await pending;});expect(t.container.querySelector('canvas')).toHaveStyle({visibility:'visible'});});
it('times out honestly and can retry without blocking the CTA',()=>{const t=setup();act(()=>vi.advanceTimersByTime(CAMPI_ASSET_TIMEOUT));fireEvent.click(screen.getByRole('button',{name:'Reintentar cargar Campi'}));expect(images).toHaveLength(6);load();expect(t.container.querySelector('canvas')).toHaveStyle({visibility:'visible'});});
it('cleans pending load and ignores completion after unmount',()=>{const t=setup();const callbacks=images.map(i=>i.onload);t.unmount();act(()=>callbacks.forEach(f=>f?.()));expect(draw).not.toHaveBeenCalled();expect(vi.getTimerCount()).toBe(0);});
it('reentry owns a fresh timeline while reusing decoded images',()=>{const a=setup();load();a.unmount();draw.mockClear();const b=setup();expect(images).toHaveLength(3);expect(draw).toHaveBeenCalledWith(0);expect(b.next).not.toHaveBeenCalled();});
it('pauses while hidden and respects reduced motion',()=>{let hidden=true;vi.spyOn(document,'hidden','get').mockImplementation(()=>hidden);setup();load();expect(vi.getTimerCount()).toBe(0);hidden=false;fireEvent(document,new Event('visibilitychange'));expect(vi.getTimerCount()).toBe(1);});
it('reduced motion is static and CTA advances once',()=>{vi.spyOn(window,'matchMedia').mockReturnValue({matches:true,addEventListener(){},removeEventListener(){}} as unknown as MediaQueryList);const t=setup();load();expect(vi.getTimerCount()).toBe(0);act(()=>{t.ref.current?.prepare();t.ref.current?.prepare();});expect(t.next).toHaveBeenCalledOnce();});
