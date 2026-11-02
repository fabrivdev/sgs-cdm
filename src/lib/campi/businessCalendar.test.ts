import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { loadBusinessClosures } from './businessCalendar';
const { chain, from } = vi.hoisted(() => {
  const chain = {select:vi.fn(),gte:vi.fn(),lte:vi.fn(),abortSignal:vi.fn()};
  return {chain,from:vi.fn(()=>chain)};
});
vi.mock('@/integrations/supabase/client',()=>({supabase:{from}}));
beforeEach(()=>{vi.clearAllMocks();chain.select.mockReturnValue(chain);chain.gte.mockReturnValue(chain);chain.lte.mockReturnValue(chain);});
afterEach(()=>vi.useRealTimers());
it('reads only dates in the current month, with existing RLS, and deduplicates',async()=>{
  chain.abortSignal.mockResolvedValue({data:[{fecha:'2026-11-02'},{fecha:'2026-11-02'}],error:null});
  expect(await loadBusinessClosures('2026-11-09')).toEqual(['2026-11-02']);
  expect(from).toHaveBeenCalledWith('dias_no_laborales');
  expect(chain.select).toHaveBeenCalledWith('fecha');
  expect(chain.gte).toHaveBeenCalledWith('fecha','2026-11-01');
  expect(chain.lte).toHaveBeenCalledWith('fecha','2026-11-09');
});
it('does not treat a denied or invalid response as an empty verified calendar',async()=>{
  chain.abortSignal.mockResolvedValue({data:null,error:{code:'42501'}});
  await expect(loadBusinessClosures('2026-11-09')).rejects.toThrow('calendario');
  chain.abortSignal.mockResolvedValue({data:[{fecha:'2026-02-30'}],error:null});
  await expect(loadBusinessClosures('2026-11-09')).rejects.toThrow('calendario');
});
it('aborts a slow read rather than holding the cards indefinitely',async()=>{
  vi.useFakeTimers();
  chain.abortSignal.mockImplementation((signal:AbortSignal)=>new Promise(resolve=>signal.addEventListener('abort',()=>resolve({data:null,error:true}))));
  const pending=expect(loadBusinessClosures('2026-11-09')).rejects.toThrow('calendario');
  await vi.advanceTimersByTimeAsync(10000);await pending;
  expect(vi.getTimerCount()).toBe(0);
});
