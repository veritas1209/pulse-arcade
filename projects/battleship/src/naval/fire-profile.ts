/** Presentation bounds in metres, using the fleet's 84.58 m/world scale.
 * Smoke dominates a persistent compartment fire; this is not a fire simulation. */
export const FIRE_METRES_PER_WORLD=84.58;
export function fireProfile(strength:number,seed=0,opening?:{width:number;depth:number},scale=1){
 const heat=Math.max(0,Math.min(1,strength/1.3));
 const hash=Math.sin(seed*12.9898)*43758.5453,variation=.94+.12*(hash-Math.floor(hash));
 const flameHeight=(2.8+5.8*heat)*variation/FIRE_METRES_PER_WORLD;
 const width=Math.min((3.1+4.2*heat)/FIRE_METRES_PER_WORLD,opening?.width??Infinity);
 const depth=Math.min((2.8+3.8*heat)/FIRE_METRES_PER_WORLD,opening?.depth??Infinity);
 return {width:width*scale,depth:depth*scale,height:flameHeight*scale/.75,flameHeight:flameHeight*scale,smokeHeight:(20+42*heat)*1.65*scale/FIRE_METRES_PER_WORLD,smokeWidth:(2.2+3.8*heat)*2.8*scale/FIRE_METRES_PER_WORLD,puffCount:Math.max(32,Math.round(96*Math.min(1,scale))),smokeOpacity:.82};
}
