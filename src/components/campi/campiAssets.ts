/** Shared, decoded, unchanged V12/V5 art. No network dependency on KPI data. */
export const CAMPI_ASSETS = {canonical:'/campi/campi-reposo-v2.png',blank:'/campi/campi-drop-blank-visor.png',palm:'/campi/campi-saludo-v2.png'} as const;
export type CampiImages = Record<keyof typeof CAMPI_ASSETS,HTMLImageElement>;
export const CAMPI_ASSET_TIMEOUT = 20000;
type Listener={ready:(images:CampiImages)=>void;error:()=>void};
type Load={images:CampiImages;listeners:Set<Listener>;done:boolean;dead:boolean;timer:ReturnType<typeof setTimeout>|null};
let cached:Load|null=null;
function stop(load:Load){load.dead=true;if(load.timer)clearTimeout(load.timer);for(const image of Object.values(load.images)){image.onload=null;image.onerror=null;}}
export function clearCampiAssetCache(){if(cached)stop(cached);cached=null;}
export function subscribeCampiAssets(ready:Listener['ready'],error:Listener['error']){
 const listener={ready,error};
 if(cached?.done){ready(cached.images);return()=>{};}
 let load=cached;
 if(load){load.listeners.add(listener);}
 else {
  load={images:{} as CampiImages,listeners:new Set([listener]),done:false,dead:false,timer:null};cached=load;
  const request=load,decoded=new Set<string>();
  const fail=()=>{if(request.dead||request.done)return;stop(request);if(cached===request)cached=null;for(const l of request.listeners)l.error();request.listeners.clear();};
  const complete=(key:string)=>{if(request.dead||request.done)return;decoded.add(key);if(decoded.size!==3)return;request.done=true;if(request.timer)clearTimeout(request.timer);for(const image of Object.values(request.images)){image.onload=null;image.onerror=null;}for(const l of request.listeners)l.ready(request.images);request.listeners.clear();};
  request.timer=setTimeout(fail,CAMPI_ASSET_TIMEOUT);
  for(const key of Object.keys(CAMPI_ASSETS) as (keyof CampiImages)[]){
   const image=new Image();request.images[key]=image;image.decoding='async';image.fetchPriority='high';
   image.onload=()=>{if(request.dead)return;if(typeof image.decode==='function')image.decode().then(()=>complete(key),fail);else complete(key);};
   image.onerror=fail;image.src=CAMPI_ASSETS[key];
  }
 }
 const subscription=load;
 return()=>{subscription.listeners.delete(listener);if(!subscription.done&&!subscription.listeners.size){stop(subscription);if(cached===subscription)cached=null;}};
}
