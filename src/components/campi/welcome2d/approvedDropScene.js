/* Rigid articulated Campi: every body surface is a clipped source image.
   No mesh warp, body squash, frame swapping or crossfade. */
'use strict';
const PI=Math.PI,clamp=x=>Math.max(0,Math.min(1,x)),smooth=x=>{x=clamp(x);return clamp(x*x*x*(x*(x*6-15)+10))},mix=(a,b,t)=>a+(b-a)*t;
const shapes={head:[[160,5],[449,5],[449,179],[160,179]],torso:[[242,178],[366,178],[369,218],[358,257],[338,287],[341,299],[323,319],[304,325],[286,319],[265,300],[268,285],[246,260],[235,217]],upper:[[207,181],[231,180],[244,192],[241,220],[225,248],[215,265],[190,265],[181,247],[190,217],[194,199]],fore:[[190,244],[217,249],[221,267],[212,300],[204,326],[181,332],[162,317],[166,285],[178,259]],hand:[[177,316],[203,316],[211,337],[215,356],[204,374],[188,378],[173,369],[164,350],[163,327]],thigh:[[245,283],[268,287],[283,310],[290,342],[277,368],[263,379],[238,378],[228,350],[225,316],[232,294]],shin:[[240,360],[267,363],[279,395],[285,425],[275,449],[226,454],[204,439],[216,404],[230,376]],boot:[[211,432],[249,431],[273,446],[284,475],[276,493],[224,499],[184,493],[180,478],[194,455]]};
const mirrored=p=>p.map(([x,y])=>[607-x,y]);
function state(t){let y=0,crouch=0,arms=0,fore=0,face=0,head=0,phase='Reposo';
 if(t<.18){y=-570;phase='Preparación'}
 else if(t<1.08){let u=(t-.18)/.9;y=-570*(1-u*u);arms=.48*smooth(u/.6);fore=.25*smooth(u);face=smooth(u/.25);phase='Caída'}
 else if(t<1.34){let u=(t-1.08)/.26;crouch=5*Math.sin(PI*u);arms=.48+.15*Math.sin(PI*u);fore=.25;face=1-smooth(u);head=.025*Math.sin(PI*u);phase='Aterrizaje'}
 else if(t<1.80){let u=(t-1.34)/.46;y=-22*Math.sin(PI*u);arms=mix(.48,.16,smooth(u));fore=mix(.25,0,smooth(u));phase='Rebote'}
 else if(t<2.05){let u=(t-1.80)/.25;crouch=2*Math.sin(PI*u);arms=.16*(1-smooth(u));phase='Asentarse'}
 const greet=smooth((t-2.20)/.7)*(1-smooth((t-4.65)/.75));
 const wave=greet*.17*Math.sin((t-2.85)*PI*3.2)*smooth((t-2.85)/.18)*(1-smooth((t-4.4)/.25));
 if(t>=2.2&&t<5.4)phase='Saludo';
 if(t>=5.4){phase='Reposo vivo';y=-1.2*(1-Math.cos((t-5.4)*PI*1.2));head=.012*Math.sin((t-5.4)*PI*.8)}
 let blink=0;for(const b of [1.13,5.6,8.2])blink=Math.max(blink,Math.max(0,1-Math.abs(t-b)/.09));
 return {t,y,crouch,arms,fore,face,head,greet,wave,blink,phase};}
function Scene(images,options={}){this.images=images;this.options=options;}
Scene.prototype.draw=function(ctx,w,h,t,geometry){const a=this.images.canonical,b=this.images.blank,parts=this.images.parts,p=state(t),s=geometry?.scale??Math.min(.613333,(h-65)/500,(w-32)/560),gx=geometry?.anchor??w/2,gy=geometry?.ground??h-34;if(t<1.08)p.y*=((gy/s)+50)/570;
ctx.clearRect(0,0,w,h);if(!this.options.transparent){ctx.fillStyle='#eef3ed';ctx.fillRect(0,0,w,h);}ctx.save();ctx.translate(gx,gy);ctx.scale(s,s);
ctx.fillStyle='rgba(39,64,49,'+(.11*clamp(1+p.y/550))+')';ctx.beginPath();ctx.ellipse(0,4,110*(.65+.35*clamp(1+p.y/550)),9,0,0,PI*2);ctx.fill();ctx.translate(-303.5,-498+p.y);
function poly(points){ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath()}
function cut(image,points,from,to,rot=0,scale=1){ctx.save();ctx.translate(to[0],to[1]);ctx.rotate(rot);ctx.scale(scale,scale);ctx.translate(-from[0],-from[1]);poly(points);ctx.clip();ctx.drawImage(image,0,0);ctx.restore()}
function circle(x,y,r){let g=ctx.createRadialGradient(x-r*.3,y-r*.4,1,x,y,r);g.addColorStop(0,'#424844');g.addColorStop(.4,'#242b28');g.addColorStop(1,'#101714');ctx.fillStyle=g;ctx.beginPath();ctx.arc(x,y,r,0,PI*2);ctx.fill()}
function bone(points,sa,sb,ta,tb){cut(a,points,sa,ta,Math.atan2(tb[1]-ta[1],tb[0]-ta[0])-Math.atan2(sb[1]-sa[1],sb[0]-sa[0]));}
function IK(hip,ankle,side){const right=hip[0]>303.5,l1=Math.hypot(right?9:10,78),l2=Math.hypot(right?15:14,72),dx=ankle[0]-hip[0],dy=ankle[1]-hip[1],d=Math.hypot(dx,dy),q=(l1*l1-l2*l2+d*d)/(2*d),v=Math.sqrt(Math.max(0,l1*l1-q*q));return[hip[0]+dx*q/d+side*dy*v/d,hip[1]+dy*q/d-side*dx*v/d]}
// Legs planted throughout impact; armor lengths remain constant.
for(let j=0;j<2;j++){const mir=j?mirrored:x=>x,hip=[j?343:264,297+p.crouch],ankle=[j?367:240,447],knee=IK(hip,ankle,j?-1:1),sourceH=[j?343:264,297],sourceK=[j?352:254,375],sourceA=[j?367:240,447];circle(...hip,16);bone(mir(shapes.thigh),sourceH,sourceK,hip,knee);circle(...knee,17);bone(mir(shapes.shin),sourceK,sourceA,knee,ankle);cut(a,mir(shapes.boot),[0,0],[0,0]);}
// Torso is original canonical image, not the generated replacement torso.
ctx.save();ctx.translate(0,p.crouch);circle(243,202,15);circle(364,202,15);cut(a,shapes.torso,[0,0],[0,0]);
const lift=smooth((t-2.20)/.72)*(1-smooth((t-4.65)/.75));
const bend=smooth((t-2.30)/.65)*(1-smooth((t-4.70)/.68));
const hello=.20*Math.sin((t-2.97)*PI*1.9)*smooth((t-2.97)/.3)*(1-smooth((t-4.16)/.40));
for(let j=0;j<2;j++){const right=!!j,mir=right?mirrored:x=>x,sign=right?-1:1,shoulder=[right?386:221,204],sa=[right?386:221,204],se=[right?404:203,255],sw=[right?419:188,324],rot=sign*(p.arms+(right?0:lift*.40)),eangle=Math.atan2(se[1]-sa[1],se[0]-sa[0])+rot,elbow=[shoulder[0]+54.08*Math.cos(eangle),shoulder[1]+54.08*Math.sin(eangle)],frot=rot+sign*(p.fore+(right?0:bend*2.32+hello*.55)),fangle=Math.atan2(sw[1]-se[1],sw[0]-se[0])+frot,wrist=[elbow[0]+70.61*Math.cos(fangle),elbow[1]+70.61*Math.sin(fangle)];circle(...shoulder,16);bone(mir(shapes.upper),sa,se,shoulder,elbow);circle(...elbow,13);bone(mir(shapes.fore),se,sw,elbow,wrist);circle(...wrist,10);if(right)cut(a,mir(shapes.hand),sw,wrist,frot);
else {
 ctx.save();ctx.translate(...wrist);ctx.rotate(frot-PI+.12+hello*.4);ctx.scale(.72,.72);ctx.translate(-640,-196);
 poly([[600,144],[600,138],[609,134],[614,137],[615,128],[622,123],[628,125],[633,121],[641,120],[647,125],[649,141],[655,142],[662,140],[671,145],[675,153],[670,166],[663,175],[659,189],[649,199],[635,202],[626,197],[622,188],[620,174],[610,163],[604,156]]);
 ctx.clip();ctx.drawImage(this.images.palm,0,0);ctx.restore();
}}
ctx.save();ctx.translate(303.5,173);ctx.rotate(p.head);ctx.translate(-303.5,-173);cut(a,shapes.head,[0,0],[0,0]);
// Only the interior visor is repainted; helmet/body never swap or blink.
cut(b,[[238,77],[249,67],[276,60],[333,61],[359,71],[370,91],[372,127],[364,145],[341,153],[271,151],[247,145],[237,127]],[0,0],[0,0]);
ctx.strokeStyle='#f2ffff';ctx.fillStyle='#f2ffff';ctx.lineCap='round';ctx.lineWidth=4;ctx.shadowColor='#bfeaff';ctx.shadowBlur=4;
for(const x of [270,338]){const ry=(1-p.blink)*mix(13,17,p.face)+p.blink*1;ctx.beginPath();ctx.ellipse(x,110,8.4,Math.max(1,ry),0,0,PI*2);ctx.fill()}
ctx.beginPath();const f=p.face,mx=13-6*f,my=133+2*f;ctx.moveTo(304-mx,my);ctx.quadraticCurveTo(304,144+2*p.greet-27*f,304+mx,my);ctx.quadraticCurveTo(304,144+2*p.greet+9*f,304-mx,my);ctx.stroke();ctx.shadowBlur=0;ctx.restore();ctx.restore();ctx.restore();return{...p,scale:s,ground:gy,anchor:gx};};
export {Scene as CampiDropScene,state as dropPose};
