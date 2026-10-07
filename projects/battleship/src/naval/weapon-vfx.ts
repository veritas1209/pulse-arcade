import type {Shot,ShipKind} from '../contract';
import type {Vector3} from 'three';
/** Visual-only events. The server's blocked/halved result remains authoritative. */
export type DefenseVisualEvent={phase:'ciws-start'|'intercept';shot:Shot;kind:ShipKind;position:Vector3;duration:number};
export const CIWS_BURST_SECONDS=.8;
/** Modern Phalanx cyclic rate; rendered rounds remain bounded by the instance pool. */
export const CIWS_ROUNDS_PER_SECOND=75;
/** A visible lead round reaches the planned interception point before detonation. */
export function ciwsContactFlight(distance:number,seconds=CIWS_BURST_SECONDS){
 const travel=Math.max(.001,distance),duration=Math.max(.04,seconds);
 return {distance:travel,speed:Math.max(12.8,travel/duration),seconds:Math.min(duration,travel/12.8)};
}
/** Finite impact burst; persistent breach fires retain their separate small scale. */
export function impactBlastProfile(kind:ShipKind,torpedo=false){
 const missile=kind!=='battleship'&&!torpedo;
 return missile?{name:'missile-impact',radius:.95,flashSeconds:.12,flameCount:24,smokeCount:30,flameLife:.68,smokeLife:3.3}
 :{name:torpedo?'torpedo-contact':'shell-impact',radius:torpedo?.7:.6,flashSeconds:.09,flameCount:12,smokeCount:18,flameLife:.45,smokeLife:2.6};
}
export function defenseVisualWindow(shot:Shot,kind:ShipKind,duration:number){
 const missile=shot.kind==='airstrike'||shot.kind==='missile'||(!shot.kind&&kind!=='battleship');
 const enabled=duration>0&&missile;
 const end=shot.blocked?-duration*.3:0;
 return {enabled,start:end-Math.min(CIWS_BURST_SECONDS,duration*.45),end};
}
/** World scale is 84.583 metres/unit. These describe visual envelopes, not ballistics. */
export function launchSmokeProfile(kind:ShipKind){return kind==='battleship'
 ?{name:'gun-pressure-cloud',count:32,duration:.22,life:2.7,size:.028,spread:.28,forward:.62,rise:.035,growth:3.8,drag:2.2}
 :{name:'missile-booster-exhaust',count:28,duration:.55,life:3,size:.024,spread:.085,forward:.24,rise:.05,growth:2.7,drag:1.15};}
