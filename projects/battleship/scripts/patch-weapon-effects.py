from pathlib import Path
p=Path('src/naval/effects.ts')
s=p.read_text(encoding='utf8')
s=s.replace('type Burst={','export type WeaponLaunchOptions={launchDelay?:number;getMuzzle?:()=>THREE.Vector3|undefined;onLaunch?:()=>void;getDefenseMuzzle?:()=>THREE.Vector3|undefined;onDefenseAim?:(target:THREE.Vector3,duration:number)=>void};\ntype Burst={launched:boolean;hasSource:boolean;options?:WeaponLaunchOptions;')
start=s.index(' function impact(')
end=s.index(' function emitLaunch(',start)
s=s[:start]+''' function launchBurst(b:Burst){if(b.launched)return;b.launched=true;const muzzle=b.options?.getMuzzle?.();if(muzzle){b.source.copy(muzzle);b.trail=[muzzle.clone()];}b.options?.onLaunch?.();if(b.hasSource&&!b.torpedo&&!b.airstrike&&b.duration>0)emitLaunch(b.source,b.target,b.kind,b.shot.sequence);onPhase?.('launch',b.shot,b.kind);}
 function impact(shot:Shot,fragment:THREE.BufferGeometry,at?:THREE.Vector3,kind:ShipKind='battleship',sourceWorld?:THREE.Vector3,instant=false,defenseOrigin?:THREE.Vector3,options?:WeaponLaunchOptions){
  const target=at?.clone()??cellPosition(shot).setY(shot.hit?.4:.1),airstrike=shot.kind==='airstrike',torpedo=shot.kind==='torpedo';if(airstrike)kind='carrier';if(torpedo)target.y=.12;
  const launch=instant?target.clone():sourceWorld?.clone()??target.clone().add(new THREE.Vector3(-1.2,7,1.5));if(torpedo)launch.copy(sourceWorld??target).setY(.12);if(airstrike&&!sourceWorld&&launch.y<2)launch.y=4.5;
  // Presentation speed: retain authoritative outcomes while giving aiming and defense time to read.
  const distance=launch.distanceTo(target),duration=instant?0:torpedo?(sourceWorld?Math.hypot(sourceWorld.x-target.x,sourceWorld.z-target.z)*.12:0):airstrike?3.4:kind==='battleship'?THREE.MathUtils.clamp(3.2+distance*.035,3.2,5.5):THREE.MathUtils.clamp(4+distance*.045,4,6.5),delay=instant?0:Math.max(0,options?.launchDelay??0);
  const burst:Burst={at:target.clone(),target,source:launch,age:-duration-delay,duration,launched:false,hasSource:!!sourceWorld,options,hit:shot.hit&&!shot.blocked,blocked:!!shot.blocked,fired:false,seed:shot.sequence+shot.x*17+shot.z*51,fragment,shot:{...shot},kind,airstrike,torpedo,trail:[launch.clone()],trailClock:0,defenseOrigin:defenseOrigin?.clone()??target.clone().setY(Math.max(target.y,.22)),defenseStarted:false,defenseClock:0,defenseFleck:false};bursts.push(burst);if(delay===0)launchBurst(burst);if(bursts.length>8){const old=bursts.shift()!;if(!old.fired){launchBurst(old);onPhase?.('impact',old.shot,old.kind);}}
 }
''' + s[end:]
s=s.replace('else p.y+=Math.sin(q*Math.PI)*Math.min(13,2+b.source.distanceTo(b.target)*.13);','else if(b.kind!==\'battleship\'){const height=Math.min(9,1.4+b.source.distanceTo(b.target)*.09),c1=b.source.clone().add(new THREE.Vector3(0,height,0)),c2=b.source.clone().lerp(b.target,.75);c2.y+=height;p.copy(new THREE.CubicBezierCurve3(b.source,c1,c2,b.target).getPoint(q));}else p.y+=Math.sin(q*Math.PI)*Math.min(13,2+b.source.distanceTo(b.target)*.13);')
s=s.replace('if(!b.defenseStarted){','const q=THREE.MathUtils.clamp(1+b.age/b.duration,0,1),aim=trajectory(b,q);b.options?.onDefenseAim?.(aim,window.end-b.age);const muzzle=b.options?.getDefenseMuzzle?.();if(muzzle)b.defenseOrigin.copy(muzzle);\n  if(!b.defenseStarted){')
s=s.replace('const q=THREE.MathUtils.clamp(1+b.age/b.duration,0,1),aim=trajectory(b,q),direction=aim.clone().sub(b.defenseOrigin)','const direction=aim.clone().sub(b.defenseOrigin)')
s=s.replace('distance/.10)),length:.13+rnd(b.seed+i)*.16','distance/.18)),length:.22+rnd(b.seed+i)*.24')
s=s.replace('dummy.scale.set(.004,.004,length)','const width=THREE.MathUtils.clamp(camera.position.distanceTo(dummy.position)/Math.max(1,viewportHeight())*.75,.004,.028);dummy.scale.set(width,width,length)')
s=s.replace('b.age+=dt;defend(b,dt);','b.age+=dt;if(!b.launched){if(b.age < -b.duration)continue;launchBurst(b);}defend(b,dt);')
s=s.replace('map(b=>({kind:b.kind,delivery:',"map(b=>({sequence:b.shot.sequence,phase:b.launched?'flight':'preparing',kind:b.kind,delivery:")
s=s.replace('ciwsTracerCapacity:tracerCapacity,','ciwsTracerCapacity:tracerCapacity,ciwsTracerOrigins:tracerPool.slice(-4).map(t=>t.origin.toArray()),')
p.write_text(s,encoding='utf8')
p=Path('src/naval/weapon-vfx.ts');s=p.read_text(encoding='utf8').replace('CIWS_BURST_SECONDS=.28','CIWS_BURST_SECONDS=.8');p.write_text(s,encoding='utf8')
