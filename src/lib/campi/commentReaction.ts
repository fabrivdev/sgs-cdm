import type { PanoramaStory, StoryDatum, StoryTopicId } from './panoramaStoryTypes';
import { validDay, type DateRange } from './panoramaDates';

export type CommentEvidence = {
 topic: StoryTopicId; period: 'month'|'ytd'|'day'|'week'|'snapshot'|'closed-month';
 value: number|null; unit: StoryDatum['unit']; window: DateRange|null;
 comparison: {value:number; window:DateRange|null}|null;
 complete: boolean;
};
const range=(r?:DateRange):DateRange|null=>r&&validDay(r.from)&&validDay(r.to)&&r.from<=r.to?{...r}:null;
const finite=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v);
/** The datum belongs to this exact sentence, never the story's other period. */
export function commentEvidence(story:PanoramaStory,datum:StoryDatum,period:CommentEvidence['period'],window?:DateRange,previous?:DateRange,mentionsComparison=false):CommentEvidence {
 return {topic:story.id,period,value:finite(datum.value)?datum.value:null,unit:datum.unit,window:range(window),
 comparison:mentionsComparison&&finite(datum.comparison?.value)?{value:datum.comparison.value,window:range(previous)}:null,
 complete:story.status==='ready'&&(!story.billingCoverage||(story.billingCoverage.additional==='available'&&story.billingCoverage.allCoreAreas))};
}
// Direction describes this KPI only; it makes no causal or profitability claim.
const polarity:Partial<Record<StoryTopicId,'higher'|'lower'>>={
 ventas_evolucion:'higher',ventas_facturacion:'higher',ventas_repuestos:'higher',ventas_servicios:'higher',ventas_maquinas:'higher',
 servicios_pendientes:'lower',repuestos_stock:'lower',repuestos_alertas:'lower',
 agenda_cumplimiento:'higher',servicios_productividad:'higher',servicios_eficiencia:'higher',clientes_retencion:'higher',clientes_cobertura_posventa:'higher',
};
export type CommentReaction={gesture:'neutral'|'consultar'|'presentar'|'comparar'|'saltito';mood:'neutral'|'thinking'|'attentive'|'happy'|'concerned';assessment:'insufficient'|'uncompared'|'neutral'|'favorable'|'unfavorable'};
export function commentReaction(e?:CommentEvidence,loading=false):CommentReaction {
 if(loading)return {gesture:'consultar',mood:'thinking',assessment:'insufficient'};
 if(!e||!e.complete||!finite(e.value))return {gesture:'neutral',mood:'neutral',assessment:'insufficient'};
 const c=e.comparison;
 if(!c||!finite(c.value)||!range(e.window??undefined)||!range(c.window??undefined))return {gesture:'presentar',mood:'attentive',assessment:'uncompared'};
 // No celebration with nonpositive sales baselines or sub-dollar differences hidden by USD formatting.
 const delta=e.value-c.value,small=e.unit==='USD'&&Math.round(Math.abs(delta))===0;
 const direction=polarity[e.topic];
 if(!direction||delta===0||small||c.value<=0||e.value<0)return {gesture:'comparar',mood:'attentive',assessment:'neutral'};
 const favorable=direction==='higher'?delta>0:delta<0;
 return {gesture:favorable?'saltito':'comparar',mood:favorable?'happy':'concerned',assessment:favorable?'favorable':'unfavorable'};
}
