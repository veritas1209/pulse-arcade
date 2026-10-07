import * as THREE from 'three';
const bounds=new THREE.Box3();
/** A sinking body ceases to own the cinematic when every corner is below the waterline. */
export function meshAboveWater(mesh:THREE.Mesh,waterY:number){
 if(!mesh.visible)return false;
 if(!mesh.geometry.boundingBox)mesh.geometry.computeBoundingBox();
 mesh.updateWorldMatrix(true,false);
 return bounds.copy(mesh.geometry.boundingBox!).applyMatrix4(mesh.matrixWorld).max.y>waterY-.015;
}
