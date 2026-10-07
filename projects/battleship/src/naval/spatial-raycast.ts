import * as THREE from 'three';

type Node={box:THREE.Box3;start:number;end:number;left?:Node;right?:Node};
export interface SerializedSpatialTree {order:Uint32Array;bounds:Float32Array;ranges:Uint32Array;children:Int32Array}
type Tree={root?:Node;serialized?:SerializedSpatialTree;order:Uint32Array;position:THREE.BufferAttribute|THREE.InterleavedBufferAttribute;version:number;index:THREE.BufferAttribute|null};
const trees=new WeakMap<THREE.BufferGeometry,Tree>();
/** Static local-space BVH. Transform changes do not rebuild it; removed geometry is weakly owned. */
export function prepareSpatialRaycast(geometry:THREE.BufferGeometry):Tree|undefined{
 const position=geometry.getAttribute('position'),index=geometry.index;
 if(!position)return;
 const version=position instanceof THREE.BufferAttribute?position.version:position.data.version;
 const cached=trees.get(geometry);if(cached?.position===position&&cached.version===version&&cached.index===index)return cached;
 const count=Math.floor((index?.count??position.count)/3),order=new Uint32Array(count),bounds=new Float32Array(count*6),centers=new Float32Array(count*3);
 const vertex=new THREE.Vector3();
 for(let t=0;t<count;t++){order[t]=t;const box=new THREE.Box3();for(let j=0;j<3;j++){vertex.fromBufferAttribute(position,index?index.getX(t*3+j):t*3+j);box.expandByPoint(vertex);}box.min.toArray(bounds,t*6);box.max.toArray(bounds,t*6+3);box.getCenter(vertex).toArray(centers,t*3);}
 function build(start:number,end:number):Node{const box=new THREE.Box3();for(let i=start;i<end;i++){const offset=order[i]*6;box.min.x=Math.min(box.min.x,bounds[offset]);box.min.y=Math.min(box.min.y,bounds[offset+1]);box.min.z=Math.min(box.min.z,bounds[offset+2]);box.max.x=Math.max(box.max.x,bounds[offset+3]);box.max.y=Math.max(box.max.y,bounds[offset+4]);box.max.z=Math.max(box.max.z,bounds[offset+5]);}const node:Node={box,start,end};if(end-start>16){const size=box.getSize(vertex),axis=size.x>=size.y&&size.x>=size.z?0:size.y>=size.z?1:2;order.subarray(start,end).sort((a,b)=>centers[a*3+axis]-centers[b*3+axis]);const mid=(start+end)>>>1;node.left=build(start,mid);node.right=build(mid,end);}return node;}
 const tree={root:build(0,count),order,position,version,index};trees.set(geometry,tree);return tree;
}
/** Build on the worker, then keep the flat tree as transferred buffers on the render thread. */
export function serializeSpatialRaycast(geometry:THREE.BufferGeometry):SerializedSpatialTree|undefined {
 const tree=prepareSpatialRaycast(geometry);if(!tree)return;
 if(tree.serialized)return tree.serialized;
 const nodes:Node[]=[];function collect(node:Node){nodes.push(node);if(node.left)collect(node.left);if(node.right)collect(node.right);}collect(tree.root!);
 const indices=new Map(nodes.map((node,index)=>[node,index])),bounds=new Float32Array(nodes.length*6),ranges=new Uint32Array(nodes.length*2),children=new Int32Array(nodes.length*2);children.fill(-1);
 nodes.forEach((node,index)=>{node.box.min.toArray(bounds,index*6);node.box.max.toArray(bounds,index*6+3);ranges[index*2]=node.start;ranges[index*2+1]=node.end;if(node.left)children[index*2]=indices.get(node.left)!;if(node.right)children[index*2+1]=indices.get(node.right)!;});
 return {order:tree.order,bounds,ranges,children};
}
/** O(1) adoption: installation and the first ray do not rebuild or decode the BVH. */
export function restoreSpatialRaycast(geometry:THREE.BufferGeometry,serialized:SerializedSpatialTree){
 const position=geometry.getAttribute('position');if(!position)return;
 const version=position instanceof THREE.BufferAttribute?position.version:position.data.version;
 trees.set(geometry,{serialized,order:serialized.order,position,version,index:geometry.index});
}
const fallback=THREE.Mesh.prototype.raycast;
/** Preserve exact rendered-triangle contact and nearest picking without scanning every triangle. */
export function installSpatialRaycast(mesh:THREE.Mesh){
 if(mesh instanceof THREE.InstancedMesh||mesh instanceof THREE.SkinnedMesh||Array.isArray(mesh.material))return;
 prepareSpatialRaycast(mesh.geometry);
 const inverse=new THREE.Matrix4(),ray=new THREE.Ray(),a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),hit=new THREE.Vector3(),world=new THREE.Vector3(),boxPoint=new THREE.Vector3(),bestPoint=new THREE.Vector3(),flatBox=new THREE.Box3();
 mesh.raycast=function(raycaster:THREE.Raycaster,intersections:THREE.Intersection[]){
  const tree=prepareSpatialRaycast(this.geometry);if(!tree||Array.isArray(this.material)){fallback.call(this,raycaster,intersections);return;}
  inverse.copy(this.matrixWorld).invert();ray.copy(raycaster.ray).applyMatrix4(inverse);
  let best=Infinity,bestFace=-1,worldDistance=Infinity;const {position,index,order}=tree,side=(this.material as THREE.Material).side,range=this.geometry.drawRange;
  function visit(node:Node){if(!ray.intersectBox(node.box,boxPoint)||boxPoint.distanceToSquared(ray.origin)>best&&!node.box.containsPoint(ray.origin))return;
   if(node.left&&node.right){visit(node.left);visit(node.right);return;}
   visitFaces(node.start,node.end);
  }
  function visitFaces(start:number,end:number){
   for(let i=start;i<end;i++){const face=order[i],offset=face*3;if(offset<range.start||offset+2>=range.start+range.count)continue;
    a.fromBufferAttribute(position,index?index.getX(offset):offset);b.fromBufferAttribute(position,index?index.getX(offset+1):offset+1);c.fromBufferAttribute(position,index?index.getX(offset+2):offset+2);
    const point=side===THREE.BackSide?ray.intersectTriangle(c,b,a,true,hit):ray.intersectTriangle(a,b,c,side!==THREE.DoubleSide,hit);if(!point)continue;
    const localDistance=point.distanceToSquared(ray.origin);if(localDistance>=best)continue;world.copy(point).applyMatrix4(mesh.matrixWorld);const distance=world.distanceTo(raycaster.ray.origin);if(distance<raycaster.near||distance>raycaster.far)continue;best=localDistance;bestFace=face;worldDistance=distance;bestPoint.copy(point);
   }
  }
  function visitFlat(node:number){const {bounds,ranges,children}=tree!.serialized!,offset=node*6;flatBox.min.fromArray(bounds,offset);flatBox.max.fromArray(bounds,offset+3);if(!ray.intersectBox(flatBox,boxPoint)||boxPoint.distanceToSquared(ray.origin)>best&&!flatBox.containsPoint(ray.origin))return;const left=children[node*2],right=children[node*2+1];if(left>=0&&right>=0){visitFlat(left);visitFlat(right);}else visitFaces(ranges[node*2],ranges[node*2+1]);}
  if(tree.serialized)visitFlat(0);else visit(tree.root!);if(bestFace<0)return;
  const offset=bestFace*3,ia=index?index.getX(offset):offset,ib=index?index.getX(offset+1):offset+1,ic=index?index.getX(offset+2):offset+2;a.fromBufferAttribute(position,ia);b.fromBufferAttribute(position,ib);c.fromBufferAttribute(position,ic);
  intersections.push({distance:worldDistance,point:bestPoint.clone().applyMatrix4(this.matrixWorld),object:this,faceIndex:bestFace,face:{a:ia,b:ib,c:ic,normal:THREE.Triangle.getNormal(a,b,c,new THREE.Vector3()),materialIndex:0}});
 };
}
export function installSpatialRaycasts(root:THREE.Object3D){root.traverse(object=>{if(object instanceof THREE.Mesh)installSpatialRaycast(object);});}
