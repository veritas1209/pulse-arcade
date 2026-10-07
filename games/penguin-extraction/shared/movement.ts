import {obstacleContainsPoint,obstacleLocalPoint} from './rotated-collision.js';
export type MoveInput={moveX:number;moveZ:number;sprint:boolean};
export type MoveState={x:number;z:number;stamina:number;maxStamina:number;moveMultiplier:number;coldUntil:number;staminaRecoveryAt?:number};
export type MoveWorld={size:number;
 obstacles:readonly {id?:string;x:number;z:number;w?:number;d?:number;width?:number;depth?:number;rotation?:number;yaw?:number}[];
 terrain?:readonly {kind:string;x:number;z:number;w:number;d:number}[];
 roads?:readonly {x:number;z:number;w:number;d:number}[]};
const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));
export function riverBlocked(world:MoveWorld,x:number,z:number){
 const inWater=world.terrain?.some(t=>t.kind==='river'&&Math.abs(x-t.x)<=t.w/2+.45&&Math.abs(z-t.z)<=t.d/2+.45);
 if(!inWater)return false;
 // Crossing roads are elevated bridge decks; all other river coordinates are impassable.
 return !(world.roads??[]).some(r=>r.w>r.d&&Math.abs(x-r.x)<r.w/2-.45&&Math.abs(z-r.z)<r.d/2-.45);
}
export function movementBlocked(world:MoveWorld,x:number,z:number){
 return riverBlocked(world,x,z)||world.obstacles.some(o=>obstacleContainsPoint(o,{x,z},.45));
}
function trySlideStep(world:MoveWorld,state:MoveState,dx:number,dz:number){
 const half=world.size/2;
 const next={x:clamp(state.x+dx,-half,half),z:clamp(state.z+dz,-half,half)};
 if(!movementBlocked(world,next.x,next.z)){state.x=next.x;state.z=next.z;return;}
 // Resolve in the obstacle's local axes, so a diagonal face slides like a face.
 // The old world-X/world-Z fallback turned diagonal travel into stair steps.
 let remaining={x:next.x-state.x,z:next.z-state.z};
 for(let attempt=0;attempt<2;attempt++){
  const hit=world.obstacles.find(o=>obstacleContainsPoint(o,{x:state.x+remaining.x,z:state.z+remaining.z},.45));
  if(!hit)break;
  const local=obstacleLocalPoint(hit,{x:state.x+remaining.x,z:state.z+remaining.z});
  const xDepth=(hit.w??hit.width??1)/2+.45-Math.abs(local.x);
  const zDepth=(hit.d??hit.depth??1)/2+.45-Math.abs(local.z);
  const lx=xDepth<zDepth?Math.sign(local.x)||1:0;
  const lz=zDepth<=xDepth?Math.sign(local.z)||1:0;
  const angle=hit.rotation??hit.yaw??0,c=Math.cos(angle),s=Math.sin(angle);
  const normal={x:c*lx+s*lz,z:-s*lx+c*lz};
  const into=remaining.x*normal.x+remaining.z*normal.z;
  if(into>=-1e-8)break;
  remaining={x:remaining.x-into*normal.x,z:remaining.z-into*normal.z};
  const sx=clamp(state.x+remaining.x,-half,half),sz=clamp(state.z+remaining.z,-half,half);
  if(!movementBlocked(world,sx,sz)){state.x=sx;state.z=sz;return;}
 }
 // Water and joined corners still permit a safe world-axis component.
 const nx=clamp(state.x+dx,-half,half),nz=clamp(state.z+dz,-half,half);
 if(!movementBlocked(world,nx,state.z))state.x=nx;
 if(!movementBlocked(world,state.x,nz))state.z=nz;
}
export function normalizeMove(input:MoveInput):MoveInput{
 const x=clamp(input.moveX,-1,1),z=clamp(input.moveZ,-1,1),length=Math.hypot(x,z),m=Math.min(1,Math.hypot(input.moveX,input.moveZ));
 return {moveX:length?x/length*m:0,moveZ:length?z/length*m:0,sprint:input.sprint===true};
}
/** Same bounded substeps, collision radius, speed and stamina rules on both peers. */
export function advanceMovement(state:MoveState,input:MoveInput,dt:number,now:number,world:MoveWorld){
 const move=normalizeMove(input);let remaining=Math.max(0,Math.min(dt,.25)),at=now-remaining*1000;
 while(remaining>1e-8){const step=Math.min(.01,remaining);at+=step*1000;
 const recoveryAt=state.staminaRecoveryAt??0;
 const sprinting=Math.hypot(move.moveX,move.moveZ)>.01&&move.sprint&&state.stamina>0&&at>=recoveryAt;
 const speed=(sprinting?9:5.5)*state.moveMultiplier*(state.coldUntil>at?.65:1);
 trySlideStep(world,state,move.moveX*speed*step,move.moveZ*speed*step);
 if(sprinting){
  state.stamina=clamp(state.stamina-22*step,0,state.maxStamina);
  if(state.stamina<=0)state.staminaRecoveryAt=at+5000;
 }else if(at>=recoveryAt)state.stamina=clamp(state.stamina+14*step,0,state.maxStamina);remaining-=step;
 }
 return state;
}
