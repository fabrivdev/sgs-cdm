import type {WelcomeFrame} from './timeline';
const smooth=(t:number)=>{t=Math.max(0,Math.min(1,t));return t*t*t*(10+t*(-15+6*t));};
const arc=(p:number)=>Math.sin(Math.PI*p);
export function welcomePose(f:WelcomeFrame){
 const p=f.progress;const pose={x:0,y:0,head:0,body:0,leftArm:0,leftForearm:0,rightArm:0,rightForearm:0,leftLeg:0,leftKnee:0,rightLeg:0,rightKnee:0,blink:false};
 if(f.static)return pose;
 if(f.beat==='entry'){const swing=Math.sin(p*Math.PI*4)*arc(p);pose.x=-220*(1-smooth(p));pose.y=10*Math.abs(swing);pose.body=-5*arc(p);pose.leftArm=-30*swing;pose.rightArm=30*swing;pose.leftLeg=14*swing;pose.rightLeg=-14*swing;pose.leftKnee=25*Math.max(0,-swing);pose.rightKnee=-25*Math.max(0,swing);}
 if(f.beat==='brake'){pose.x=22*arc(p);pose.y=14*arc(p);pose.body=9*arc(p);pose.leftArm=22*arc(p);pose.rightArm=-22*arc(p);}
 if(f.beat==='greet'){const lift=smooth(p/.25)*(1-smooth((p-.75)/.25));pose.leftArm=140*lift;pose.leftForearm=(18+14*Math.sin(p*Math.PI*6))*lift;pose.head=-8*lift;pose.body=-4*lift;}
 if(f.beat==='present'){const chest=arc(Math.min(p/.5,1)),open=arc(Math.max(0,(p-.4)/.6));pose.leftArm=-18*chest+65*open;pose.leftForearm=100*chest+15*open;pose.rightArm=-65*open;pose.rightForearm=-15*open;pose.head=5*chest;}
 if(f.beat==='curiosity'){pose.head=13*arc(p);pose.body=3*arc(p);pose.blink=p>.46&&p<.55;}
 if(f.beat==='bow'){pose.y=18*arc(p);pose.head=10*arc(p);pose.body=5*arc(p);pose.leftArm=12*arc(p);pose.rightArm=-12*arc(p);}
 if(f.beat==='rest')pose.blink=p>.49&&p<.515;
 if(f.beat==='invite'){const a=arc(p);pose.rightArm=-85*a;pose.rightForearm=-25*a;pose.leftArm=25*a;pose.head=10*a;}
 if(f.beat==='exit'){pose.x=260*smooth(p);const swing=Math.sin(p*Math.PI*4)*arc(p);pose.y=8*Math.abs(swing);pose.leftLeg=12*swing;pose.rightLeg=-12*swing;pose.leftArm=-25*swing;pose.rightArm=25*swing;}
 return pose;
}
export type WelcomePose=ReturnType<typeof welcomePose>;
/** Smoothly release the actual interrupted pose; early CTA never snaps to neutral. */
export function settlePose(from:WelcomePose,progress:number):WelcomePose{const weight=1-smooth(progress);return Object.fromEntries(Object.entries(from).map(([k,v])=>[k,typeof v==='number'?v*weight:false])) as WelcomePose;}
