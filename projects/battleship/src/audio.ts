import type {Cell,ShipKind,Shot} from './contract';

type SoundId=keyof typeof FILES;
type Group='sfx'|'ui'|'ambience';
type Activity={movingShips:number;fighters:number;burningShips:number;torpedoes?:number;active:boolean};
const FILES={sea:'sea-loop.wav',sonar:'sonar-ping.wav',missileLaunch:'missile-launch.wav',missileFlight:'missile-flight-loop.wav',cannonFlight:'cannon-flight-loop.wav',torpedoLaunch:'torpedo-launch.wav',torpedoFlight:'torpedo-flight-loop.wav',intercept:'intercept-detonation.wav',ciwsBurst:'ciws-burst.wav',impact:'metal-impact.wav',splash:'water-splash.wav',cannon:'naval-cannon-shot.wav',engine:'ship-engine-loop.wav',wake:'ship-wake-loop.wav',takeoff:'f22-takeoff.wav',fighter:'f22-flight-loop.wav',fire:'damage-fire-loop.wav',stress:'metal-stress-loop.wav',sinking:'sinking.wav',click:'ui-click.wav',turn:'turn-cue.wav',victory:'victory.wav',defeat:'defeat.wav'} as const;
const ASSET_VERSION='naval-recorded-v3-defense-20261003';
const LOOP_IDS=['sea','engine','wake','fighter','fire','stress','torpedoFlight'] as const;
interface Voice {id:SoundId;group:Group;source:AudioBufferSourceNode;gain:GainNode;filter:BiquadFilterNode;panner?:PannerNode;point?:[number,number,number];stopping:boolean}

/** Recorded naval mix, unlocked only by a user gesture. Projectile resolution is visual-clock driven. */
export class BattleAudio {
 private ctx?:AudioContext;private master?:GainNode;private compressor?:DynamicsCompressorNode;
 private groups=new Map<Group,GainNode>();private buffers=new Map<SoundId,AudioBuffer>();private errors=new Map<SoundId,string>();
 private loops=new Map<SoundId,Voice>();private shots=new Map<number,Voice|undefined>();private shotGeneration=new Map<number,number>();private nextShotGeneration=0;private sources=new Set<Voice>();
 private ciwsPlayed=new Set<number>();private intercepted=new Set<number>();private defenseVoices=new Map<number,Voice>();
 private resolved=new Set<number>();private timers=new Set<number>();private loopStops=new Map<SoundId,number>();private abort?:AbortController;
 private activity:Activity={movingShips:0,fighters:0,burningShips:0,torpedoes:0,active:true};
 private listenerForward:[number,number,number]=[0,-.646,-.763];private listenerPosition:[number,number,number]=[0,55,65];private listenerTarget:[number,number,number]=[0,0,0];
 private loading?:Promise<void>;private disposed=false;volume=.76;muted=false;
 async unlock(){
  if(this.disposed)return;
  if(!this.ctx){
   this.ctx=new AudioContext();this.master=this.ctx.createGain();this.master.gain.value=this.volume;
   this.compressor=this.ctx.createDynamicsCompressor();Object.assign(this.compressor.threshold,{value:-9});this.compressor.knee.value=8;this.compressor.ratio.value=4;this.compressor.attack.value=.003;this.compressor.release.value=.24;
   this.master.connect(this.compressor).connect(this.ctx.destination);
   for(const id of ['sfx','ui','ambience'] as Group[]){const gain=this.ctx.createGain();gain.connect(this.master);this.groups.set(id,gain);}
   this.syncListener(this.listenerPosition,this.listenerTarget);this.abort=new AbortController();this.loading=this.preload();
  }
  if(this.ctx.state==='suspended')await this.ctx.resume();await this.loading;if(!this.disposed)this.reconcileLoops();
 }
 setVolume(value:number){this.volume=Math.min(1,Math.max(0,Number.isFinite(value)?value:0));this.muted=this.volume===0;if(this.ctx&&this.master)this.master.gain.setTargetAtTime(this.volume,this.ctx.currentTime,.045);}
 toggle(){this.setVolume(this.muted?.76:0);}
 click(){this.play('click',.32,0,'ui');} turn(){this.play('turn',.4,0,'ui');} result(win:boolean){this.play(win?'victory':'defeat',.48,0,'ui');}
 sink(cell?:Cell){this.duck();this.play('sinking',.72,0,'sfx',cell);}
 torpedoLaunch(cell?:Cell){this.play('torpedoLaunch',.47,0,'sfx',cell);}
 sonar(cell?:Cell){this.play('sonar',.31,0,'sfx',cell);}
 /** Optional camera sync uses world coordinates, matching the scene's four-unit grid cells. */
 syncListener(position:readonly number[],target:readonly number[]){
  if(position.length<3||target.length<3||![...position,...target].every(Number.isFinite))return;
  this.listenerPosition=[position[0],position[1],position[2]];this.listenerTarget=[target[0],target[1],target[2]];if(!this.ctx)return;
  const l=this.ctx.listener,t=this.ctx.currentTime,dx=target[0]-position[0],dy=target[1]-position[1],dz=target[2]-position[2],length=Math.hypot(dx,dy,dz);
  if(length>.0001)this.listenerForward=[dx/length,dy/length,dz/length];
  const [fx,fy,fz]=this.listenerForward,reference=Math.abs(fy)>.995?[0,0,-1]:[0,1,0],dot=reference[0]*fx+reference[1]*fy+reference[2]*fz;
  const rawUp=[reference[0]-dot*fx,reference[1]-dot*fy,reference[2]-dot*fz],upLength=Math.hypot(...rawUp)||1,[ux,uy,uz]=rawUp.map(value=>value/upLength);
  if(l.positionX){for(const [param,value] of [[l.positionX,position[0]],[l.positionY,position[1]],[l.positionZ,position[2]],[l.forwardX,fx],[l.forwardY,fy],[l.forwardZ,fz],[l.upX,ux],[l.upY,uy],[l.upZ,uz]] as [AudioParam,number][])param.setTargetAtTime(value,t,.04);}
  else{l.setPosition(...this.listenerPosition);l.setOrientation(fx,fy,fz,ux,uy,uz);}
  for(const v of this.sources)if(v.point)v.filter.frequency.setTargetAtTime(this.cutoff(v.point),t,.1);
 }
 /** Starts only the matching weapon family. A resolved/cancelled shot can never launch after loading. */
 startShot(shot:Shot,kind:ShipKind){
  this.stopShot(shot.sequence);this.resolved.delete(shot.sequence);this.ciwsPlayed.delete(shot.sequence);this.intercepted.delete(shot.sequence);this.shots.set(shot.sequence,undefined);const generation=++this.nextShotGeneration;this.shotGeneration.set(shot.sequence,generation);
  const begin=()=>{
   if(this.shotGeneration.get(shot.sequence)!==generation||this.disposed||!this.activity.active)return;
   const shell=shot.kind==='shell'||!shot.kind&&kind==='battleship',torpedo=shot.kind==='torpedo';
   const flight=torpedo?'torpedoFlight':shell?'cannonFlight':'missileFlight';
   if(!torpedo){this.duck();this.play(shell?'cannon':'missileLaunch',shell?.82:.65,0,'sfx',shot.source,.985+(shot.sequence%5)*.0075);}
   // Persistent torpedoes have an activity bed; only add a short tracked flight when no bed owns it.
   const voice=torpedo&&this.activity.torpedoes?undefined:this.makeVoice(flight,torpedo?.12:shell?.13:.21,true,0,'sfx',shot.source??shot);
   if(this.shots.has(shot.sequence))this.shots.set(shot.sequence,voice);else if(voice)this.stopVoice(voice);
  };
  if(this.buffers.has('cannonFlight')&&this.buffers.has('missileFlight'))begin();else void this.loading?.then(begin);
 }
 /** Short rotary-gun burst at the defender's actual muzzle position. No late
  * loading callback: missed visual-clock events remain silent, never replayed. */
 ciwsBurst(shot:Shot,cell:Cell,duration=.28){
  if(this.disposed||!this.activity.active||this.resolved.has(shot.sequence)||!this.shotGeneration.has(shot.sequence)||this.ciwsPlayed.has(shot.sequence)||shot.kind==='shell'||shot.kind==='torpedo')return;
  this.ciwsPlayed.add(shot.sequence);this.trimHistory(this.ciwsPlayed);
  if(!this.ctx||!this.buffers.has('ciwsBurst'))return;
  if(this.defenseVoices.size>=4)return;
  const voice=this.makeVoice('ciwsBurst',.48,false,0,'sfx',cell,.985+(shot.sequence%5)*.0075);if(!voice)return;
  this.defenseVoices.set(shot.sequence,voice);const now=this.ctx.currentTime,length=Math.max(.10,Math.min(.78,Number.isFinite(duration)?duration:.28));
  voice.gain.gain.setValueAtTime(.48,now+Math.max(.006,length-.04));voice.gain.gain.linearRampToValueAtTime(0,now+length);voice.source.stop(now+length+.005);
 }
 /** Partial interceptions keep the missile flight voice alive. Root passes the
  * actual airborne interception point, converted to fractional grid cells. */
 intercept(shot:Shot,cell:Cell){if(this.resolved.has(shot.sequence)||!this.shotGeneration.has(shot.sequence))return;this.playIntercept(shot,cell);}
 private playIntercept(shot:Shot,cell:Cell){
  if(this.disposed||!this.activity.active||this.intercepted.has(shot.sequence))return;
  this.intercepted.add(shot.sequence);this.trimHistory(this.intercepted);this.duck();this.play('intercept',.64,0,'sfx',cell);
 }
 private trimHistory(history:Set<number>){if(history.size>256)history.delete(history.values().next().value!);}
 /** Exactly one resolution cue at visual arrival, followed by natural recorded debris/water tails. */
 finishShot(shot:Shot,_kind:ShipKind,position?:Cell){
  this.stopShot(shot.sequence);if(this.resolved.has(shot.sequence)||this.disposed)return;
  this.resolved.add(shot.sequence);if(this.resolved.size>256)this.resolved.delete(this.resolved.values().next().value!);
  this.duck();if(shot.blocked){this.playIntercept(shot,position??shot.interceptedBy??shot);return;}
  if(!shot.hit){this.play('splash',.66,0,'sfx',shot);return;}
  this.play('impact',shot.kind==='torpedo'?.8:.75,0,'sfx',shot,.97+(shot.sequence%5)*.012);
  if(shot.kind==='torpedo')this.play('splash',.23,.055,'sfx',shot,.84);
 }
 /** Legacy immediate-result API. Modern presentation uses startShot / finishShot. */
 shot(hit:boolean,sunk=false){this.play('missileLaunch',.55);this.play(hit?'impact':'splash',.64,.26);if(sunk)this.play('sinking',.67,.38);}
 syncActivity(next:Activity){
  const fighters=Math.max(0,next.fighters);if(fighters>this.activity.fighters&&next.active)this.play('takeoff',.42);
  this.activity={movingShips:Math.max(0,next.movingShips),fighters,burningShips:Math.max(0,next.burningShips),torpedoes:Math.max(0,next.torpedoes??0),active:next.active};
  if(!next.active){for(const sequence of [...this.shots.keys()])this.stopShot(sequence);for(const v of this.sources)if(v.group==='sfx'&&!v.source.loop)this.stopVoice(v,.12);}this.reconcileLoops();
 }
 suspend(){void this.ctx?.suspend();} resume(){if(this.ctx?.state==='suspended')void this.ctx.resume();}
 dispose(){
  this.disposed=true;this.abort?.abort();for(const timer of this.timers)window.clearTimeout(timer);this.timers.clear();this.loopStops.clear();
  for(const v of [...this.sources])this.stopVoice(v,0);this.shots.clear();this.shotGeneration.clear();this.loops.clear();this.resolved.clear();this.ciwsPlayed.clear();this.intercepted.clear();this.defenseVoices.clear();this.buffers.clear();this.errors.clear();
  for(const g of this.groups.values())g.disconnect();this.groups.clear();this.master?.disconnect();this.compressor?.disconnect();
  const ctx=this.ctx;this.ctx=undefined;this.master=undefined;if(ctx&&ctx.state!=='closed')void ctx.close();
 }
 diagnostics(){return {loaded:[...this.buffers.keys()],errors:Object.fromEntries(this.errors),voices:this.shots.size+this.loops.size,activeSources:this.sources.size,loops:[...this.loops.keys()],shots:this.shots.size,muted:this.muted,volume:Math.round(this.volume*100),state:this.ctx?.state??'locked',ciwsVoices:this.defenseVoices.size,ciwsEvents:this.ciwsPlayed.size,interceptEvents:this.intercepted.size,assetVersion:ASSET_VERSION};}
 private async preload(){
  const ctx=this.ctx!,base=import.meta.env.BASE_URL,queue=Object.keys(FILES) as SoundId[];
  // A small request pool avoids starving Vite's MP3/WAV responses alongside the GLB loads.
  const worker=async()=>{while(queue.length&&!this.disposed){const id=queue.shift()!;let failure='';for(let attempt=0;attempt<2;attempt++){
   const abort=new AbortController(),timeout=window.setTimeout(()=>abort.abort(),10000),cancel=()=>abort.abort();this.abort?.signal.addEventListener('abort',cancel,{once:true});
   try{const response=await fetch(`${base}audio/${FILES[id]}?v=${ASSET_VERSION}`,{signal:abort.signal});if(!response.ok)throw Error(`HTTP ${response.status}`);const data=await response.arrayBuffer();const buffer=await ctx.decodeAudioData(data);if(!this.disposed)this.buffers.set(id,buffer);failure='';break;}
   catch(error){failure=error instanceof Error?error.message:String(error);if(this.disposed)break;}
   finally{window.clearTimeout(timeout);this.abort?.signal.removeEventListener('abort',cancel);}
  }if(failure&&!this.disposed)this.errors.set(id,failure);}};
  await Promise.all(Array.from({length:4},worker));
 }
 private play(id:SoundId,volume:number,delay=0,group:Group='sfx',cell?:Cell,rate=1){this.makeVoice(id,volume,false,delay,group,cell,rate);}
 private makeVoice(id:SoundId,volume:number,loop:boolean,delay=0,group:Group='sfx',cell?:Cell,rate=1):Voice|undefined{
  if(!this.ctx||!this.master||this.disposed)return;const buffer=this.buffers.get(id);if(!buffer)return;
  const source=this.ctx.createBufferSource(),gain=this.ctx.createGain(),filter=this.ctx.createBiquadFilter();source.buffer=buffer;source.loop=loop;source.playbackRate.value=rate;
  const now=this.ctx.currentTime,start=now+delay;gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(volume,start+(loop?.04:.004));filter.type='lowpass';filter.Q.value=.55;
  const point:Voice['point']=cell?[(cell.x+.5)*4-60,1,(cell.z+.5)*4-60]:undefined;filter.frequency.value=point?this.cutoff(point):12500;
  const v:Voice={id,group,source,gain,filter,point,stopping:false};source.connect(filter).connect(gain);
  if(point){const p=this.ctx.createPanner();p.panningModel='equalpower';p.distanceModel='inverse';p.refDistance=75;p.maxDistance=10000;p.rolloffFactor=.38;p.positionX.value=point[0];p.positionY.value=point[1];p.positionZ.value=point[2];gain.connect(p).connect(this.groups.get(group)!);v.panner=p;}else gain.connect(this.groups.get(group)!);
  this.sources.add(v);source.onended=()=>this.disconnect(v);source.start(start,loop?Math.min(buffer.duration*.17,.7):0);return v;
 }
 private cutoff(point:[number,number,number]){const distance=Math.hypot(...point.map((value,i)=>value-this.listenerPosition[i]));return Math.max(2300,13000/(1+distance/420));}
 private duck(){if(!this.ctx)return;const param=this.groups.get('ambience')?.gain;if(!param)return;const t=this.ctx.currentTime;param.cancelScheduledValues(t);param.setTargetAtTime(.62,t,.045);param.setTargetAtTime(1,t+.9,.45);}
 private stopShot(sequence:number){const defense=this.defenseVoices.get(sequence);if(defense)this.stopVoice(defense,.035);this.defenseVoices.delete(sequence);const v=this.shots.get(sequence);if(v)this.stopVoice(v,.055);this.shots.delete(sequence);this.shotGeneration.delete(sequence);}
 private stopVoice(v:Voice,fade=.08){
  if(v.stopping&&fade>0)return;v.stopping=true;if(!this.ctx||fade===0){try{v.source.stop();}catch{}this.disconnect(v);return;}
  const t=this.ctx.currentTime;v.gain.gain.cancelScheduledValues(t);v.gain.gain.setTargetAtTime(0,t,Math.max(.006,fade/3));try{v.source.stop(t+fade);}catch{this.disconnect(v);}
 }
 private disconnect(v:Voice){if(!this.sources.delete(v))return;for(const [sequence,voice]of this.defenseVoices)if(voice===v)this.defenseVoices.delete(sequence);v.source.disconnect();v.gain.disconnect();v.filter.disconnect();v.panner?.disconnect();}
 private desiredLoop(id:typeof LOOP_IDS[number]){
  if(!this.activity.active)return 0;if(id==='sea')return .13;if(id==='engine')return Math.min(.2,.065*Math.sqrt(this.activity.movingShips));if(id==='wake')return Math.min(.15,.055*Math.sqrt(this.activity.movingShips));
  if(id==='fighter')return Math.min(.2,.068*Math.sqrt(this.activity.fighters));if(id==='fire')return Math.min(.17,.065*Math.sqrt(this.activity.burningShips));if(id==='torpedoFlight')return Math.min(.13,.065*Math.sqrt(this.activity.torpedoes??0));return Math.min(.105,.032*Math.sqrt(this.activity.burningShips));
 }
 private reconcileLoops(){
  if(!this.ctx)return;for(const id of LOOP_IDS){const target=this.desiredLoop(id),v=this.loops.get(id);
   if(target>0){const pending=this.loopStops.get(id);if(pending!==undefined){window.clearTimeout(pending);this.timers.delete(pending);this.loopStops.delete(id);}if(!v){const made=this.makeVoice(id,.0001,true,0,'ambience');if(made)this.loops.set(id,made);}this.loops.get(id)?.gain.gain.setTargetAtTime(target,this.ctx.currentTime,.2);}
   else if(v&&!this.loopStops.has(id)){v.gain.gain.setTargetAtTime(.0001,this.ctx.currentTime,.12);const timer=window.setTimeout(()=>{this.timers.delete(timer);this.loopStops.delete(id);if(this.desiredLoop(id)===0)this.stopLoop(id);},520);this.timers.add(timer);this.loopStops.set(id,timer);}
  }
 }
 private stopLoop(id:SoundId){const v=this.loops.get(id);if(!v)return;this.stopVoice(v,.08);this.loops.delete(id);}
}
