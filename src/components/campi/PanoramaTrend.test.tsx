import {render,screen} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import {it,expect,vi} from 'vitest';
import type {ReactNode} from 'react';
type XProps={tickFormatter:(value:string)=>string};
type TooltipProps={formatter:(value:number)=>string[]};
const observed=vi.hoisted(()=>({axis:{} as Record<string,unknown>,x:{} as XProps,tooltip:{} as TooltipProps,rows:[] as unknown[]}));
vi.mock('recharts',()=>({ResponsiveContainer:({children}:{children:ReactNode})=>children,LineChart:({children,data}:{children:ReactNode;data:unknown[]})=>{observed.rows=data;return children;},Line:()=>null,YAxis:(props:Record<string,unknown>)=>{observed.axis=props;return null;},XAxis:(props:XProps)=>{observed.x=props;return null;},Tooltip:(props:TooltipProps)=>{observed.tooltip=props;return null;}}));
import {PanoramaStoryCard} from './PanoramaStoryCard';
import type {PanoramaStory} from '@/lib/campi/panoramaStoryTypes';
it('hides Y without changing scale, keeps every month, units and year legend',()=>{
 const story={id:'ventas_evolucion',title:'Ventas',status:'ready',periodLabel:'',sections:[],primary:{value:100,unit:'USD',label:'Ventas'},supporting:[],chart:{kind:'trend',title:'Ventas',unit:'USD',currentLabel:'2026',previousLabel:'2025',rows:Array.from({length:12},(_,i)=>({label:i===9?'oct 2026*':'ene 2026',value:100,previous:80}))},details:[],breakdown:[],route:''} as PanoramaStory;
 render(<MemoryRouter><PanoramaStoryCard story={story} index={0} retrying={false} onRetry={vi.fn()} /></MemoryRouter>);
 expect(observed.axis).toMatchObject({hide:true,width:0,domain:[76.4,103.6]});expect(observed.rows).toHaveLength(12);
 expect(observed.x.tickFormatter('oct 2026*')).toBe('Oct*');expect(observed.tooltip.formatter(100)[0]).toContain('$');
 expect(screen.getByText('2026')).toBeInTheDocument();expect(screen.getByText('2025')).toBeInTheDocument();expect(screen.getByText('* parcial')).toBeInTheDocument();
});
