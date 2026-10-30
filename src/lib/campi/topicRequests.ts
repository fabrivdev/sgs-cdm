export type RequestStatus='recibida'|'preparacion'|'disponible'|'no_viable';
export const requestStatusLabels:Record<RequestStatus,string>={recibida:'Recibida',preparacion:'En preparación',disponible:'Disponible',no_viable:'No viable'};
export type TopicRequest={id:string;owner:string;question:string;createdAt:string;status:RequestStatus;topicId:string|null;reason:string;notified:boolean};
export function validateQuestion(value:string){const text=value.trim();if(text.length<15||text.length>1000)throw new Error('Escribí entre 15 y 1000 caracteres.');return text;}
export const ownRequests=(rows:readonly TopicRequest[],owner:string)=>rows.filter(r=>r.owner===owner);
