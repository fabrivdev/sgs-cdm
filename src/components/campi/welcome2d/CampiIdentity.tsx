import {useId} from 'react';
import {frames,CANONICAL_NEUTRAL} from './sprites';
/** Same approved canonical art as welcome, no additional badge choreography. */
export function CampiIdentity(){
 const id=useId().replace(/:/g,'');const {bounds:[l,t,r,b],atlas}=frames[CANONICAL_NEUTRAL];
 return <svg viewBox={`${l-4} ${t-4} ${r-l+8} ${b-t+8}`} width="100%" height="100%" role="img" aria-label="Campi" data-identity="campi-v2"><defs><clipPath id={id}><rect x={l-2} y={t-2} width={r-l+4} height={b-t+4}/></clipPath></defs><image href={atlas} width="1536" height="1024" clipPath={`url(#${id})`}/></svg>;
}
