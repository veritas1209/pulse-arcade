import * as THREE from 'three';
import {frameNavalBounds} from './navigation';

export const FLEET_DEPRESSION=22*Math.PI/180;
/** Fleet composition retains ship proportions; the overview remains a distinct map fit. */
export function fleetPresentationPose(camera:THREE.PerspectiveCamera,bounds:THREE.Box3,team:number){
 const direction=new THREE.Vector3(.5,0,.8660254).normalize();if(team){direction.x*=-1;direction.z*=-1;}
 direction.multiplyScalar(Math.cos(FLEET_DEPRESSION));direction.y=Math.sin(FLEET_DEPRESSION);
 const pose=frameNavalBounds(camera,bounds,direction,1.12),distance=Math.max(18,pose.distance);
 return {target:pose.target,position:pose.target.clone().addScaledVector(direction,distance),distance};
}

export function projectedHullPixels(camera:THREE.PerspectiveCamera,position:THREE.Vector3,length:number,viewportHeight:number){
 const point=position.clone().applyMatrix4(camera.matrixWorldInverse),depth=-point.z;
 if(depth<=camera.near)return 0;
 const pixels=length*Math.max(1,viewportHeight)/(2*depth*Math.tan(THREE.MathUtils.degToRad(camera.fov)*.5));
 const margin=length*.5,halfHeight=depth*Math.tan(THREE.MathUtils.degToRad(camera.fov)*.5),halfWidth=halfHeight*camera.aspect;
 return Math.abs(point.x)>halfWidth+margin||Math.abs(point.y)>halfHeight+margin?0:pixels;
}
export interface DetailCandidate {id:string;pixels:number;triangles:number;selected:boolean;hovered:boolean;wasHigh:boolean;sunk:boolean}
/** Spend a bounded detail budget on what is visible, with a stable hysteresis band. */
export function selectDetailedHulls(candidates:DetailCandidate[],maxCount=4,triangleBudget=600000){
 const eligible=candidates.filter(c=>!c.sunk&&c.pixels>=(c.selected?18:c.wasHigh?32:40));
 eligible.sort((a,b)=>Number(b.selected)-Number(a.selected)||Number(b.hovered)-Number(a.hovered)||b.pixels-a.pixels||a.id.localeCompare(b.id));
 const chosen=new Set<string>();let triangles=0;
 for(const candidate of eligible){if(chosen.size>=maxCount)break;if(triangles+candidate.triangles>triangleBudget)continue;chosen.add(candidate.id);triangles+=candidate.triangles;}
 return chosen;
}
