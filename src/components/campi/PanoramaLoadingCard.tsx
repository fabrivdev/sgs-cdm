import { useEffect, useState } from 'react';

/** Placeholders reserve layout only; they never encode amounts or progress. */
export function PanoramaLoadingCard({index,label}:{index:number;label:string}) {
 const [slow,setSlow]=useState(false);
 useEffect(()=>{const timer=setTimeout(()=>setSlow(true),10_000);return()=>clearTimeout(timer);},[]);
 return <article className="approved-story-card panorama-card-skeleton" role="status" aria-label={`Consultando ${label}`} aria-busy="true">
  <header className="approved-card-header"><span className="approved-card-index">{String(index+1).padStart(2,'0')}</span><h2>{label}</h2></header>
  <div className="panorama-skeleton-body" aria-hidden="true">
   <div className="panorama-skeleton-summary"><span className="skeleton-value"/><span className="skeleton-line"/><span className="skeleton-line skeleton-line-short"/></div>
   <div className="panorama-skeleton-chart"><span/><span/><span/></div>
  </div>
  <span className="panorama-skeleton-status">{slow?'La consulta sigue en curso.':'Cargando datos…'}</span>
 </article>;
}
