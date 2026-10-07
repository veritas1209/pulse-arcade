import type {Shot,ViewState} from './contract';

/** Finished authority and completed presentation are separate conditions. */
export function createResultGate(){
 const arriving=new Set<number>();
 let idleFrames=0;
 return {
  launch(shot:Pick<Shot,'sequence'>){arriving.add(shot.sequence);idleFrames=0;},
  impact(shot:Pick<Shot,'sequence'>){arriving.delete(shot.sequence);idleFrames=0;},
  ready(phase:ViewState['phase'],presentationBusy:boolean):boolean{
   if(phase!=='finished'||presentationBusy||arriving.size){idleFrames=0;return false;}
   // An impact may start asynchronous fracture preparation during the scene update.
   // Wait for the following idle update before opening the result overlay.
   return ++idleFrames>=2;
  },
  reset(){arriving.clear();idleFrames=0;},
  diagnostics(){return {arrivingShots:[...arriving],settledFrames:idleFrames};},
 };
}
