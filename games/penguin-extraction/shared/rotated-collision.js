// Coordinates follow Three.js rotation.y: local +X rotates toward world -Z.
export function obstacleLocalPoint(obstacle, point) {
  const a=obstacle.rotation??obstacle.yaw??0,x=point.x-obstacle.x,z=point.z-obstacle.z;
  if(!a)return {x,z};
  const c=Math.cos(a),s=Math.sin(a);return {x:c*x-s*z,z:s*x+c*z};
}
export function obstacleWorldPoint(obstacle, point) {
  const a=obstacle.rotation??obstacle.yaw??0;
  if(!a)return {x:obstacle.x+point.x,z:obstacle.z+point.z};
  const c=Math.cos(a),s=Math.sin(a);return {x:obstacle.x+c*point.x+s*point.z,z:obstacle.z-s*point.x+c*point.z};
}
export function obstacleBounds(obstacle) {
  const a=obstacle.rotation??obstacle.yaw??0,w=obstacle.w??obstacle.width??1,d=obstacle.d??obstacle.depth??1;
  if(!a)return {x:obstacle.x,z:obstacle.z,w,d};
  const c=Math.abs(Math.cos(a)),s=Math.abs(Math.sin(a));return {x:obstacle.x,z:obstacle.z,w:c*w+s*d,d:s*w+c*d};
}
export function obstacleContainsPoint(obstacle, point, padding=0) {
  const p=obstacleLocalPoint(obstacle,point);
  return Math.abs(p.x)<=(obstacle.w??obstacle.width??1)/2+padding && Math.abs(p.z)<=(obstacle.d??obstacle.depth??1)/2+padding;
}
export function rayObstacleDistance(origin,direction,obstacle,maxDistance,padding=0) {
  const p=obstacleLocalPoint(obstacle,origin),a=obstacle.rotation??obstacle.yaw??0;
  let velocity=direction;
  if(a){const c=Math.cos(a),s=Math.sin(a);velocity={x:c*direction.x-s*direction.z,z:s*direction.x+c*direction.z};}
  let near=0,far=maxDistance;
  for(const [position,v,half] of [[p.x,velocity.x,(obstacle.w??obstacle.width??1)/2+padding],[p.z,velocity.z,(obstacle.d??obstacle.depth??1)/2+padding]]) {
    if(Math.abs(v)<1e-8){if(Math.abs(position)>half)return Infinity;continue;}
    const first=(-half-position)/v,second=(half-position)/v;
    near=Math.max(near,Math.min(first,second));far=Math.min(far,Math.max(first,second));
    if(near>far)return Infinity;
  }
  return far<=1e-6?Infinity:near;
}
