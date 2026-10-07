import {createWakePhysics,type WakeBody} from './wake-physics';
const physics=createWakePhysics();
export interface WakeRequest {epoch:number;bodies:WakeBody[];delta:number;terrain?:{x:number;z:number}[];recycle?:ArrayBuffer;reset?:boolean}
export interface WakeResponse {epoch:number;pixels?:Uint8Array;diagnostics:ReturnType<typeof physics.diagnostics>}
let recycled:ArrayBuffer|undefined;
self.onmessage=(event:MessageEvent<WakeRequest>)=>{const request=event.data;if(request.recycle)recycled=request.recycle;if(request.reset)physics.reset();if(request.terrain)physics.terrain(request.terrain);physics.begin();for(const body of request.bodies)physics.observe(body);const changed=physics.advance(request.delta);let pixels:Uint8Array|undefined;if(changed||request.reset){pixels=recycled&&recycled.byteLength===physics.pixels.byteLength?new Uint8Array(recycled):new Uint8Array(physics.pixels.length);pixels.set(physics.pixels);recycled=undefined;}const response:WakeResponse={epoch:request.epoch,pixels,diagnostics:physics.diagnostics()};self.postMessage(response,{transfer:pixels?[pixels.buffer]:[]});};
