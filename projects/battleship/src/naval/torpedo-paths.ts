import * as THREE from 'three';
import {LineSegments2} from 'three/addons/lines/LineSegments2.js';
import {LineSegmentsGeometry} from 'three/addons/lines/LineSegmentsGeometry.js';
import {LineMaterial} from 'three/addons/lines/LineMaterial.js';
import type {Cell,SceneState,TorpedoView} from '../contract';
import {torpedoRoute} from '../rules';
import {cellPosition,key,CELL} from './fleet';
import {followWaterOutline} from './surface-overlays';

type TorpedoTrack={id:string;cells:Cell[];style:'solid'|'dashed';role:'launched'|'locked'|'preview'|'enemy'};
/** Committed/selected routes stay solid; pointer-only candidates remain dashed. */
export function createTorpedoPaths(scene:THREE.Scene,time:{value:number}){
 const makeLine=(dashed:boolean,enemy=false)=>{
  const material=new LineMaterial({color:enemy?0xff4b55:0xffdf62,linewidth:dashed?2:2.5,worldUnits:false,depthTest:true,depthWrite:false,transparent:true,opacity:dashed?.82:.96,toneMapped:false,dashed,dashSize:.55,gapSize:.3});followWaterOutline(material,time,dashed?.035:.027);
  const line=new LineSegments2(new LineSegmentsGeometry().setPositions([0,0,0,0,0,0]),material);line.name=enemy?'detected-enemy-torpedo-tracks':dashed?'torpedo-hover-preview':'friendly-torpedo-locked-tracks';line.frustumCulled=false;line.renderOrder=dashed?49:48;line.visible=false;scene.add(line);return{line,material,signature:''};
 };
 const solid=makeLine(false),dashed=makeLine(true),enemy=makeLine(true,true);let enemyCount=0,friendlyCount=0,previewSteps=0,segments=0;let tracks:TorpedoTrack[]=[];
 function fill(batch:typeof solid,entries:TorpedoTrack[]){
  const signature=JSON.stringify(entries);if(signature===batch.signature)return;batch.signature=signature;const positions:number[]=[];
  for(const track of entries)for(let i=1;i<track.cells.length;i++){
   const a=cellPosition(track.cells[i-1]!).setY(0),b=cellPosition(track.cells[i]!).setY(0),pieces=Math.max(1,Math.ceil(a.distanceTo(b)/1.5));
   for(let j=0;j<pieces;j++)positions.push(...a.clone().lerp(b,j/pieces).toArray(),...a.clone().lerp(b,(j+1)/pieces).toArray());
  }
  batch.line.visible=positions.length>0;if(!batch.line.visible)return;
  const old=batch.line.geometry;batch.line.geometry=new LineSegmentsGeometry().setPositions(positions);old.dispose();batch.line.computeLineDistances();
 }
 function sync(state:SceneState,hover:Cell|null){
  tracks=(state.torpedoes??[]).filter(t=>t.team===state.you&&t.route?.length).slice(0,24).map(t=>({id:t.id,cells:[{x:t.x,z:t.z},...t.route!],style:'solid',role:'launched'}));friendlyCount=tracks.length;previewSteps=0;const contacts:TorpedoTrack[]=(state.torpedoes??[]).filter(t=>t.team!==state.you&&t.route?.length).slice(0,24).map(t=>({id:t.id,cells:[{x:t.x,z:t.z},...t.route!],style:'dashed',role:'enemy'}));enemyCount=contacts.length;tracks.push(...contacts);
  const ship=state.own.find(s=>s.id===state.selectedId&&!s.sunk);
  if(state.action==='torpedo'&&ship?.kind==='destroyer'){
   const planned=(target:Cell|undefined,role:'locked'|'preview')=>{
    if(!target||Math.hypot(target.x-ship.x,target.z-ship.z)>15)return;
    const route=torpedoRoute(ship,target,state.islands);if(!route.length)return;
    if(role==='preview')previewSteps=route.length;
    tracks.push({id:role==='locked'?'locked':'preview',cells:[{x:ship.x,z:ship.z},...route],style:role==='locked'?'solid':'dashed',role});
   };
   planned(state.targetCell,'locked');if(hover&&(!state.targetCell||key(hover)!==key(state.targetCell)))planned(hover,'preview');
  }
  fill(solid,tracks.filter(t=>t.style==='solid'));fill(dashed,tracks.filter(t=>t.role==='preview'));fill(enemy,tracks.filter(t=>t.role==='enemy'));segments=[solid,dashed,enemy].reduce((n,b)=>n+(b.line.visible?b.line.geometry.getAttribute('instanceStart').count:0),0);
 }
 return{sync,resize(w:number,h:number){for(const b of [solid,dashed,enemy])b.material.resolution.set(w,h);},diagnostics:()=>({friendlyTorpedoRoutes:friendlyCount,detectedEnemyTorpedoRoutes:enemyCount,torpedoPreviewSteps:previewSteps,torpedoRouteSegments:segments,torpedoLockedTarget:tracks.find(t=>t.role==='locked')?.cells.at(-1)??null,torpedoPathDrawCalls:Number(solid.line.visible)+Number(dashed.line.visible)+Number(enemy.line.visible),torpedoTracks:tracks.map(t=>({...t,cells:t.cells.map(c=>({...c}))}))}),dispose(){for(const b of [solid,dashed,enemy]){scene.remove(b.line);b.line.geometry.dispose();b.material.dispose();}}};
}

/** Animate every traversed corner, including when a turn advances five cells. */
export function createTorpedoMotion(){
 const records=new Map<string,{position:THREE.Vector3;path:THREE.Vector3[];heading:number}>();
 function sync(previous:TorpedoView[],next:TorpedoView[],islands:Cell[]){
  const ids=new Set(next.map(t=>t.id));for(const id of records.keys())if(!ids.has(id))records.delete(id);
  for(const t of next){
   const old=previous.find(p=>p.id===t.id);let record=records.get(t.id);if(!record){record={position:cellPosition(old??t),path:[],heading:t.heading};records.set(t.id,record);}
   if(old&&key(old)!==key(t)){
    const advanced=old.route&&t.route?old.route.length-t.route.length:0;
    const route=advanced>0?old.route!.slice(0,advanced):torpedoRoute(old,t,islands);
    const cells=route.length?route:[{x:t.x,z:t.z}];if(key(cells.at(-1)!)!==key(t))cells.push({x:t.x,z:t.z});
    record.path.push(...cells.map(cellPosition));
   }
   if(!record.path.length)record.heading=t.heading;
  }
 }
 function step(t:TorpedoView,delta:number){
  let record=records.get(t.id);if(!record){record={position:cellPosition(t),path:[],heading:t.heading};records.set(t.id,record);}
  let travel=Math.max(0,Math.min(.05,delta))*CELL*5;
  while(record.path.length&&travel>0){const target=record.path[0]!,direction=target.clone().sub(record.position).setY(0),distance=direction.length();
   if(distance<.0001){record.path.shift();continue;}record.heading=Math.atan2(direction.x,direction.z);
   if(distance<=travel){record.position.copy(target);record.path.shift();travel-=distance;}else{record.position.addScaledVector(direction,travel/distance);travel=0;}
  }
  return record;
 }
 return{sync,step,position:(id:string)=>records.get(id)?.position.clone(),clear:()=>records.clear(),diagnostics:()=>[...records].map(([id,r])=>({id,position:r.position.toArray(),heading:r.heading,waypoints:r.path.map(p=>p.toArray())}))};
}
