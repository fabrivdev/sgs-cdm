import {act,cleanup,render,screen} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {CampiOnboardingScene} from './CampiOnboardingScene';
vi.mock('@/components/auth/GradientWaves',()=>({default:()=>null}));
beforeEach(()=>vi.useFakeTimers());afterEach(()=>{cleanup();vi.useRealTimers();vi.restoreAllMocks();});
it('pushes outgoing welcome and incoming selector together, then removes the actor',()=>{
 const view=render(<CampiOnboardingScene name="Ana" selecting={false} onSelect={()=>{}}><button>Confirmar temas</button></CampiOnboardingScene>);
 expect(screen.queryByRole('button',{name:'Confirmar temas'})).toBeNull();
 view.rerender(<CampiOnboardingScene name="Ana" selecting onSelect={()=>{}}><button>Confirmar temas</button></CampiOnboardingScene>);
 expect(view.container.querySelector('.campi-welcome-slide--out')).not.toBeNull();
 expect(screen.getByRole('button',{name:'Confirmar temas'})).toBeVisible();
 expect(screen.queryByRole('button',{name:'Preparar mi Panorama'})).toBeNull();
 act(()=>vi.advanceTimersByTime(600));expect(view.container.querySelector('.campi-welcome-slide')).toBeNull();expect(screen.queryByRole('img')).toBeNull();
});
it('cancels removal on rapid return and disposes transition timers on close',()=>{
 const props={name:'Ana',onSelect:()=>{},children:<button>Temas</button>};
 const view=render(<CampiOnboardingScene {...props} selecting={false}/>);
 view.rerender(<CampiOnboardingScene {...props} selecting/>);act(()=>vi.advanceTimersByTime(200));
 view.rerender(<CampiOnboardingScene {...props} selecting={false}/>);act(()=>vi.advanceTimersByTime(800));
 expect(screen.getByRole('button',{name:'Preparar mi Panorama'})).toBeVisible();
 view.unmount();expect(vi.getTimerCount()).toBe(0);
});
it('starts directly in selector without Campi and skips retained welcome for reduced motion',()=>{
 vi.spyOn(window,'matchMedia').mockReturnValue({matches:true,addEventListener(){},removeEventListener(){}} as unknown as MediaQueryList);
 const view=render(<CampiOnboardingScene name="Ana" selecting onSelect={()=>{}}>Temas</CampiOnboardingScene>);
 expect(screen.queryByRole('img')).toBeNull();expect(view.container.querySelector('.campi-welcome-slide')).toBeNull();
});
