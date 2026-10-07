import * as THREE from 'three';
import {LineSegments2} from 'three/addons/lines/LineSegments2.js';
import {LineSegmentsGeometry} from 'three/addons/lines/LineSegmentsGeometry.js';
import {LineMaterial} from 'three/addons/lines/LineMaterial.js';
import type {SceneState} from '../contract';
import {CELL,HALF} from './fleet';
import {cellBoundaryEdges} from './cell-boundary';
import {followWaterOutline} from './surface-overlays';
/** One crisp white perimeter, following the ocean instead of floating above ships. */
export function createMovementOutline(scene:THREE.Scene,time:{value:number}){
 const material=new LineMaterial({color:0xf4ffff,linewidth:2.3,depthTest:true,depthWrite:false,transparent:true,opacity:.94,toneMapped:false});followWaterOutline(material,time,.033);
 const line=new LineSegments2(new LineSegmentsGeometry().setPositions([0,0,0,0,0,0]),material);line.name='selected-ship-movement-boundary';line.frustumCulled=false;line.renderOrder=47;line.visible=false;scene.add(line);
 let signature='',edgeCount=0,cellCount=0;
 return{
  sync(state:SceneState){
   const ship=state.own.find(s=>s.id===state.selectedId&&!s.sunk),cells=state.action==='move'&&state.turn===state.you&&ship?state.reachable??[]:[];
   const next=JSON.stringify([ship?.id,ship?.x,ship?.z,cells]);if(next===signature)return;signature=next;cellCount=cells.length;
   const edges=cellBoundaryEdges(cells,ship);edgeCount=edges.length;line.visible=edgeCount>0;if(!line.visible)return;
   const positions:number[]=[];for(const {a,b} of edges){const start=new THREE.Vector3(a.x*CELL-HALF,0,a.z*CELL-HALF),end=new THREE.Vector3(b.x*CELL-HALF,0,b.z*CELL-HALF);for(let i=0;i<4;i++)positions.push(...start.clone().lerp(end,i/4).toArray(),...start.clone().lerp(end,(i+1)/4).toArray());}
   const old=line.geometry;line.geometry=new LineSegmentsGeometry().setPositions(positions);old.dispose();
  },
  resize(w:number,h:number){material.resolution.set(w,h);},
  diagnostics:()=>({movementOutlineVisible:line.visible,movementBoundaryEdges:edgeCount,movementRangeCells:cellCount,movementOutlineColor:'white'}),
  dispose(){scene.remove(line);line.geometry.dispose();material.dispose();}
 };
}
