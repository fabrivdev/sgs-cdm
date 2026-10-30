import type { PanoramaStory } from './panoramaStoryTypes';
/** Presentation consumes numeric components, never parses labels or rounded amounts. */
export function billingComponents(story: PanoramaStory) {
 const ytd=story.periodMode==='ytd';
 const find=(labels:string[])=>story.supporting.find(row=>labels.includes(row.label))?.value;
 const components=story.billingComponents??{
  gross:find(ytd?['Ventas antes de NC acumuladas','Ventas acumuladas antes de NC']:['Ventas antes de NC del mes']),
  credits:find(ytd?['Notas de crédito acumuladas','NC acumuladas del año']:['Notas de crédito del mes']),
  net:story.primary?.value,
 };
 const {gross,credits,net}=components;
 if(typeof gross!=='number'||typeof credits!=='number'||typeof net!=='number'||
  ![gross,credits,net].every(Number.isFinite)||gross<0||credits>0||
  Math.abs(gross+credits-net)>.02||typeof story.primary?.value!=='number'||Math.abs(net-story.primary.value)>.02)return null;
 return {gross,credits,net};
}
