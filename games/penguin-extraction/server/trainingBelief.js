import {movementBlocked} from '../shared/movement.ts';
import {enemyLineOfSight,enemyVisionProfile} from './enemyPerception.js';

const CELL=4,MAX_CELLS=32,MAX_AGE_MS=15000,STEP_MS=700;
const DIRS=[[0,0],[1,0],[-1,0],[0,1],[0,-1]];
const key=(x,z)=>`${x},${z}`;
const worldPoint=(x,z)=>({x:x*CELL,z:z*CELL});
const gridPoint=point=>({x:Math.round(point.x/CELL),z:Math.round(point.z/CELL)});
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
function free(world,point){return Math.abs(point.x)<world.size/2-1&&Math.abs(point.z)<world.size/2-1&&!movementBlocked(world,point.x,point.z);}
function nearestCell(world,point){
 const cell=gridPoint(point);
 for(const radius of [0,1,2])for(let x=-radius;x<=radius;x++)for(let z=-radius;z<=radius;z++){
  if(Math.max(Math.abs(x),Math.abs(z))!==radius)continue;
  const candidate=worldPoint(cell.x+x,cell.z+z);
  if(free(world,candidate))return {x:cell.x+x,z:cell.z+z};
 }
 return null;
}
function connected(world,from,to){
 for(const fraction of [.25,.5,.75,1])if(!free(world,{x:from.x+(to.x-from.x)*fraction,z:from.z+(to.z-from.z)*fraction}))return false;
 return true;
}
function trim(cells){
 const selected=[...cells.values()].sort((a,b)=>b.weight-a.weight).slice(0,MAX_CELLS);
 const sum=selected.reduce((n,cell)=>n+cell.weight,0)||1;
 return new Map(selected.map(cell=>[key(cell.x,cell.z),{...cell,weight:cell.weight/sum}]));
}
export function observeTrainingBelief(raid,point,now,kind='sight'){
 if(!raid.options?.training||raid.trainingAiLevel!==4||!raid.world)return;
 const cell=nearestCell(raid.world,point);if(!cell)return;
 const previous=raid.trainingBelief;
 const heading=kind==='sight'&&previous?.lastVisual&&now>previous.lastVisual.at&&now-previous.lastVisual.at<1600?
  {x:Math.max(-6,Math.min(6,(point.x-previous.lastVisual.x)*1000/(now-previous.lastVisual.at))),z:Math.max(-6,Math.min(6,(point.z-previous.lastVisual.z)*1000/(now-previous.lastVisual.at)))}:previous?.heading??{x:0,z:0};
 if(kind==='sound'&&previous&&now-previous.observedAt<2500&&distance(previous.point,point)>14)return;
 const cells=new Map();
 if(kind==='sound')for(const [dx,dz] of DIRS){const nearby={x:cell.x+dx,z:cell.z+dz},candidate=worldPoint(nearby.x,nearby.z);if(free(raid.world,candidate))cells.set(key(nearby.x,nearby.z),{...nearby,weight:dx===0&&dz===0?.5:.125});}
 else cells.set(key(cell.x,cell.z),{...cell,weight:1});
 raid.trainingBelief={cells:trim(cells),point:{x:point.x,z:point.z},observedAt:now,advancedAt:now,lastVisual:kind==='sight'?{x:point.x,z:point.z,at:now}:previous?.lastVisual,heading};
}
export function advanceTrainingBelief(raid,now){
 const belief=raid.trainingBelief;
 if(!belief||now-belief.observedAt>MAX_AGE_MS)return null;
 const steps=Math.min(12,Math.floor((now-belief.advancedAt)/STEP_MS));
 for(let step=0;step<steps;step++){
  const next=new Map(),headingAge=now-(belief.lastVisual?.at??-Infinity);
  for(const cell of belief.cells.values())for(const [dx,dz] of DIRS){
   const candidate={x:cell.x+dx,z:cell.z+dz},from=worldPoint(cell.x,cell.z),to=worldPoint(candidate.x,candidate.z);
   if(!free(raid.world,to)||!connected(raid.world,from,to))continue;
   const bias=headingAge<2500?Math.max(.4,1+(dx*belief.heading.x+dz*belief.heading.z)*.14):1;
   const weight=cell.weight*(dx||dz?.19:.24)*bias,id=key(candidate.x,candidate.z);
   const old=next.get(id);next.set(id,{...candidate,weight:(old?.weight??0)+weight});
  }
  if(next.size)belief.cells=trim(next);
  belief.advancedAt+=STEP_MS;
 }
 return belief;
}
export function excludeVisibleTrainingCells(raid,enemy,now){
 const belief=advanceTrainingBelief(raid,now);
 if(!belief||now-(enemy.trainingBeliefPrunedAt??-Infinity)<1000)return;
 enemy.trainingBeliefPrunedAt=now;
 const profile=enemyVisionProfile(enemy),forward={x:Math.sin(enemy.yaw??0),z:Math.cos(enemy.yaw??0)};
 const revised=new Map();
 for(const cell of belief.cells.values()){
  const p=worldPoint(cell.x,cell.z),dx=p.x-enemy.x,dz=p.z-enemy.z,range=Math.hypot(dx,dz);
  const visible=range<profile.range*.65&&range>1&&((dx*forward.x+dz*forward.z)/range)>Math.cos(profile.primaryFov*Math.PI/360)&&enemyLineOfSight(raid.world,raid.areas,enemy,p,now);
  revised.set(key(cell.x,cell.z),{...cell,weight:cell.weight*(visible?.15:1)});
 }
 belief.cells=trim(revised);
}
export function trainingBeliefGoal(raid,role,now){
 const belief=advanceTrainingBelief(raid,now);
 if(!belief)return null;
 const ranked=[...belief.cells.values()].sort((a,b)=>b.weight-a.weight);
 if(!ranked.length)return null;
 const rank={breach:0,rifle:1,machinegun:2,dmr:3,sniper:4}[role]??0;
 const picked=ranked[Math.min(rank,ranked.length-1)];
 return worldPoint(picked.x,picked.z);
}
export const TRAINING_BELIEF_LIMITS={cellMeters:CELL,maxCells:MAX_CELLS,maxAgeMs:MAX_AGE_MS,stepMs:STEP_MS};
