import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {subscribeCampiAssets,clearCampiAssetCache,CAMPI_ASSET_TIMEOUT} from './campiAssets';
let images:MockImage[]=[];
class MockImage{onload:(()=>void)|null=null;onerror:(()=>void)|null=null;src='';constructor(){images.push(this);}}
beforeEach(()=>{clearCampiAssetCache();images=[];vi.useFakeTimers();vi.stubGlobal('Image',MockImage);});
afterEach(()=>{clearCampiAssetCache();vi.useRealTimers();vi.unstubAllGlobals();});
it('deduplicates overlapping consumers and reuses decoded art on warm mount',()=>{const a=vi.fn(),b=vi.fn();subscribeCampiAssets(a,vi.fn());subscribeCampiAssets(b,vi.fn());expect(images).toHaveLength(3);images.forEach(i=>i.onload?.());expect(a).toHaveBeenCalledOnce();expect(b).toHaveBeenCalledOnce();const c=vi.fn();subscribeCampiAssets(c,vi.fn());expect(c).toHaveBeenCalledOnce();expect(images).toHaveLength(3);expect(vi.getTimerCount()).toBe(0);});
it('does not cancel another mounted consumer',()=>{const a=vi.fn(),b=vi.fn();const stop=subscribeCampiAssets(a,vi.fn());subscribeCampiAssets(b,vi.fn());stop();images.forEach(i=>i.onload?.());expect(a).not.toHaveBeenCalled();expect(b).toHaveBeenCalledOnce();});
it('evicts failed loading and ignores late decode',async()=>{let resolve!:()=>void;const pending=new Promise<void>(r=>resolve=r);const ready=vi.fn(),error=vi.fn();subscribeCampiAssets(ready,error);Object.assign(images[0],{decode:()=>pending});images[0].onload?.();vi.advanceTimersByTime(CAMPI_ASSET_TIMEOUT);expect(error).toHaveBeenCalledOnce();resolve();await pending;await Promise.resolve();expect(ready).not.toHaveBeenCalled();subscribeCampiAssets(vi.fn(),vi.fn());expect(images).toHaveLength(6);});
