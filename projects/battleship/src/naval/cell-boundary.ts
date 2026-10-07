import type {Cell} from '../contract';
export interface CellBoundaryEdge {a:Cell;b:Cell}
/** Only exposed edges of the public reachable-cell union; shared edges disappear. */
export function cellBoundaryEdges(cells:readonly Cell[],origin?:Cell):CellBoundaryEdge[]{
 const area=new Map<string,Cell>();for(const c of cells){if(c.x>=0&&c.x<30&&c.z>=0&&c.z<30)area.set(`${c.x},${c.z}`,c);}
 if(area.size&&origin)area.set(`${origin.x},${origin.z}`,origin);
 const edges:CellBoundaryEdge[]=[];
 for(const {x,z} of area.values()){
  if(!area.has(`${x},${z-1}`))edges.push({a:{x,z},b:{x:x+1,z}});
  if(!area.has(`${x+1},${z}`))edges.push({a:{x:x+1,z},b:{x:x+1,z:z+1}});
  if(!area.has(`${x},${z+1}`))edges.push({a:{x:x+1,z:z+1},b:{x,z:z+1}});
  if(!area.has(`${x-1},${z}`))edges.push({a:{x,z:z+1},b:{x,z}});
 }
 return edges;
}
