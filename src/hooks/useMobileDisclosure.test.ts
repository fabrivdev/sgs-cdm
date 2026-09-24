import {act,renderHook} from '@testing-library/react';
import {describe,it,expect,vi} from 'vitest';
import {useMobileDisclosure} from './useMobileDisclosure';
const state=vi.hoisted(()=>({mobile:true}));
vi.mock('./use-mobile',()=>({useIsMobile:()=>state.mobile}));
describe('mobile period disclosure',()=>{
 it('starts closed on phones, preserves a choice on resize and never hides an error',()=>{
  state.mobile=true;
  const {result,rerender}=renderHook(({error})=>useMobileDisclosure(error),{initialProps:{error:false}});
  expect(result.current[0]).toBe(true);
  act(()=>result.current[1](false));
  state.mobile=false;rerender({error:false});expect(result.current[0]).toBe(false);
  act(()=>result.current[1](true));rerender({error:true});expect(result.current[0]).toBe(false);
 });
 it('starts open on desktop',()=>{
  state.mobile=false;
  const {result}=renderHook(()=>useMobileDisclosure());
  expect(result.current[0]).toBe(false);
 });
});
