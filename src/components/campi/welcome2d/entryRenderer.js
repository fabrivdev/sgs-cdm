import {CampiDropScene,dropPose} from './approvedDropScene';
/** Approved v12 sequence; subsequent timeline beats never replay the old atlas greeting. */
export function continuationPose(frame){return dropPose(frame.static?5.4:5.4+(frame.elapsed??0));}
export function createEntryRenderer(canvas,canonical,blank=canonical,palm=canonical){
 const ctx=canvas.getContext('2d');if(!ctx)return null;
 const scene=new CampiDropScene({canonical,blank,palm},{transparent:true});let time=0,W=1,H=540,dpr=1,S=368/600,groundX=0,groundY=0,pose=null;
 function paint(){ctx.setTransform(dpr,0,0,dpr,0,0);scene.draw(ctx,W,H,time,{scale:S,anchor:groundX,ground:groundY});}
 function draw(t){time=t;pose=null;paint();}
 function drawTimeline(frame){pose=continuationPose(frame);time=pose.t;paint();}
 function resize(width,height,pixelRatio=1,topInset=0){W=width;H=height;dpr=Math.min(pixelRatio||1,2);S=Math.min(Math.min(W,368)/600,Math.min(H-topInset,350)/570);groundX=W/2;groundY=(H-topInset)/2+255*S+topInset;canvas.width=Math.round(W*dpr);canvas.height=Math.round(H*dpr);paint();}
 return {draw,drawTimeline,capturePose(){},resize,duration:5.4,snapshot(){return{time,duration:5.4,scale:S,groundX,groundY,pose}}};
}
