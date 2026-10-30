import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {CampiVector} from './CampiVector';
import {CampiOnboardingScene} from './CampiOnboardingScene';
vi.mock('@/components/auth/GradientWaves',()=>({default:()=> <div data-testid="login-waves"/>}));
beforeEach(()=>vi.useFakeTimers());afterEach(()=>{cleanup();vi.useRealTimers();vi.restoreAllMocks();});
it('uses layered native vector artwork and a finite greeting followed by spaced idle',()=>{
 const {container}=render(<CampiVector context="welcome"/>);const svg=screen.getByRole('img');
 expect(container.querySelector('image,img,canvas')).toBeNull();expect(container.querySelectorAll('.cv-head,.cv-body,.cv-eyes,.cv-lids,.cv-mouth,.cv-arm').length).toBe(7);
 expect(svg).toHaveAttribute('data-gesture','wave');act(()=>vi.advanceTimersByTime(1300));expect(svg).toHaveAttribute('data-gesture','rest');
 act(()=>vi.advanceTimersByTime(3400));expect(svg).toHaveAttribute('data-gesture','blink');act(()=>vi.advanceTimersByTime(200));expect(svg).toHaveAttribute('data-gesture','rest');
});
it('responds to a selection without deriving a business mood',()=>{
 const view=render(<CampiVector context="selector"/>);expect(screen.getByRole('img')).toHaveAttribute('data-gesture','invite');
 view.rerender(<CampiVector context="selector" eventKey={1}/>);expect(screen.getByRole('img')).toHaveAttribute('data-gesture','nod');
});
it('keeps reduced motion static and the CTA immediately available',()=>{
 vi.spyOn(window,'matchMedia').mockReturnValue({matches:true,addEventListener(){},removeEventListener(){}} as unknown as MediaQueryList);
 const select=vi.fn();render(<CampiOnboardingScene name="Fabrizio" selecting={false} onSelect={select}><button>Ver mi Panorama</button></CampiOnboardingScene>);
 expect(screen.getByRole('img')).toHaveAttribute('data-motion-status','whole-pose-v2');act(()=>vi.advanceTimersByTime(30000));expect(screen.getByRole('img')).toHaveAttribute('data-motion-status','whole-pose-v2');
 expect(screen.queryByRole('button',{name:'Ver mi Panorama'})).toBeNull();fireEvent.click(screen.getByRole('button',{name:'Preparar mi Panorama'}));expect(select).toHaveBeenCalledOnce();
});
it('clears scheduled gestures on unmount',()=>{const view=render(<CampiVector context="badge"/>);view.unmount();expect(vi.getTimerCount()).toBe(0);});

it('does not repeat greeting when returning to a visible tab',()=>{
 let hidden=false;vi.spyOn(document,'hidden','get').mockImplementation(()=>hidden);
 render(<CampiVector context="welcome"/>);expect(screen.getByRole('img')).toHaveAttribute('data-gesture','wave');
 hidden=true;fireEvent(document,new Event('visibilitychange'));expect(screen.getByRole('img')).toHaveAttribute('data-gesture','rest');
 hidden=false;fireEvent(document,new Event('visibilitychange'));expect(screen.getByRole('img')).toHaveAttribute('data-gesture','rest');
});

it('uses login background only for welcome, leaving selector unchanged',()=>{
 const view=render(<CampiOnboardingScene name="Fabrizio" selecting={false} onSelect={()=>{}}>Selector</CampiOnboardingScene>);
 expect(screen.getByTestId('login-waves')).toBeInTheDocument();expect(view.container.querySelector('[data-background-source="auth-gradient-waves"]')).not.toBeNull();
 view.rerender(<CampiOnboardingScene name="Fabrizio" selecting onSelect={()=>{}}>Selector</CampiOnboardingScene>);
 act(()=>vi.advanceTimersByTime(600));expect(screen.queryByTestId('login-waves')).toBeNull();expect(screen.queryByRole('img')).toBeNull();
});
