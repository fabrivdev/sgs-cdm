import type {WelcomeFrame} from './timeline';
// Verified alpha-component bounds; all art belongs to the same v2 family.
export const frames=[{"bounds": [161, 9, 446, 498], "anchor": 303.5, "atlas": "/campi/campi-reposo-v2.png"}, {"bounds": [624, 9, 924, 498], "anchor": 803.0, "atlas": "/campi/campi-reposo-v2.png"}, {"bounds": [1103, 9, 1402, 498], "anchor": 1281.5, "atlas": "/campi/campi-reposo-v2.png"}, {"bounds": [161, 521, 446, 1011], "anchor": 303.5, "atlas": "/campi/campi-reposo-v2.png"}, {"bounds": [629, 516, 912, 1011], "anchor": 758.0, "atlas": "/campi/campi-reposo-v2.png"}, {"bounds": [1090, 521, 1375, 1011], "anchor": 1233.0, "atlas": "/campi/campi-reposo-v2.png"}, {"bounds": [129, 7, 415, 499], "anchor": 271.5, "atlas": "/campi/campi-saludo-v2.png"}, {"bounds": [600, 8, 929, 498], "anchor": 785.0, "atlas": "/campi/campi-saludo-v2.png"}, {"bounds": [1094, 7, 1410, 499], "anchor": 1266.0, "atlas": "/campi/campi-saludo-v2.png"}, {"bounds": [78, 517, 433, 1011], "anchor": 281.5, "atlas": "/campi/campi-saludo-v2.png"}, {"bounds": [596, 519, 932, 1011], "anchor": 785.0, "atlas": "/campi/campi-saludo-v2.png"}, {"bounds": [1120, 519, 1408, 1011], "anchor": 1264.0, "atlas": "/campi/campi-saludo-v2.png"}, {"bounds": [162, 11, 446, 498], "anchor": 304.0, "atlas": "/campi/campi-presentacion-v2.png"}, {"bounds": [612, 11, 896, 498], "anchor": 755.0, "atlas": "/campi/campi-presentacion-v2.png"}, {"bounds": [1111, 12, 1381, 498], "anchor": 1243.0, "atlas": "/campi/campi-presentacion-v2.png"}, {"bounds": [113, 521, 496, 1010], "anchor": 303.5, "atlas": "/campi/campi-presentacion-v2.png"}, {"bounds": [537, 519, 997, 1010], "anchor": 753.5, "atlas": "/campi/campi-presentacion-v2.png"}, {"bounds": [1080, 521, 1480, 1011], "anchor": 1238.0, "atlas": "/campi/campi-presentacion-v2.png"}] as const;
export const atlases=[...new Set(frames.map(frame=>frame.atlas))];
export const CANONICAL_NEUTRAL=0;
const greeting=[0,7,8,9,8,9,10,0];
const presentation=[0,13,14,15,16,15,13,0];
const invitation=[0,13,15,16,17];
const returnPaths:Record<number,readonly number[]>={0:[0],1:[1,0],2:[2,1,0],4:[4,1,0],5:[5,0],7:[7,0],8:[8,7,0],9:[9,8,7,0],10:[10,7,0],13:[13,0],14:[14,13,0],15:[15,13,0],16:[16,15,13,0],17:[17,16,15,13,0]};
const sample=(sequence:readonly number[],progress:number)=>sequence[Math.min(sequence.length-1,Math.max(0,Math.floor(progress*sequence.length)))];
/** No running art is eligible. Every completed gesture reconnects to exactly frame 0. */
export function spriteFrame(frame:WelcomeFrame,interrupted=0){
 if(frame.static)return 0;
 if(frame.beat==='greet')return sample(greeting,frame.progress);
 if(frame.beat==='present')return sample(presentation,frame.progress);
 if(frame.beat==='curiosity')return sample([0,1,2,1,0],frame.progress);
 if(frame.beat==='bow')return sample([0,1,4,4,1,0],frame.progress); // Hand-on-hip posture, not a fabricated bow.
 if(frame.beat==='rest'&&frame.progress>.49&&frame.progress<.51)return 5;
 if(frame.beat==='settle')return sample(returnPaths[interrupted]??[interrupted,0],frame.progress);
 if(frame.beat==='invite')return sample(invitation,frame.progress);
 if(frame.beat==='exit')return 17; // Invitation held, never fake walking by sliding an idle pose.
 return 0;
}
