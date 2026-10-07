import type {DamageMark,ShipView} from '../contract';

// Damage scars are append-only. Repair suppresses the existing prefix without
// deleting the geometry history, so a later hit ignites only its own location.
export function activeFireMarks(ship:ShipView,marks:readonly DamageMark[]=ship.damageMarks??[]):DamageMark[]{
 if(ship.damageControl)return [];
 const count=Number.isFinite(ship.extinguishedMarkCount)?Math.max(0,Math.floor(ship.extinguishedMarkCount!)):0;
 return marks.slice(count);
}
