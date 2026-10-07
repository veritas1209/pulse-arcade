import {wakeNoise,wakeSeed} from './wake-noise';
/** Fixed-step finite-depth dispersive gravity-wave heightfield, in world metres.
 * Linear Boussinesq: (1-H²/3 laplacian) h_tt = gH laplacian(h).
 * Ship pressure is a zero-volume dipole. Foam persists/diffuses independently.
 * This is a bounded surface-fluid approximation, not a 3D CFD solver. */
export const WAKE_PHYSICS={resolution:512,extent:120,step:1/30,metresPerUnit:304.5/3.6,timeScale:18,depth:.20,heightRange:.03,slopeRange:.06,foamDecay:.045,waveDamping:.15};
export interface WakeBody {id:string;x:number;z:number;heading:number;width:number;length:number;speed:number}
export function createWakePhysics(resolution=WAKE_PHYSICS.resolution){
 const n=resolution,count=n*n,dx=120/(n-1),dt=WAKE_PHYSICS.step,h=new Float32Array(count),v=new Float32Array(count),foam=new Float32Array(count),nextFoam=new Float32Array(count),rhs=new Float32Array(count);let a=new Float32Array(count),b=new Float32Array(count);
 const absorption=new Float32Array(count),land=new Uint8Array(count),pixels=new Uint8Array(count*4),bodies=new Map<string,WakeBody&{travelled:number;seed:number}>(),seen=new Set<string>();
 const gravity=9.81/WAKE_PHYSICS.metresPerUnit*WAKE_PHYSICS.timeScale**2,c2=gravity*WAKE_PHYSICS.depth,dispersion=WAKE_PHYSICS.depth**2/(3*dx*dx),diag=1+4*dispersion;
 for(let z=0;z<n;z++)for(let x=0;x<n;x++){const edge=Math.min(x,z,n-1-x,n-1-z);absorption[z*n+x]=edge<18?Math.exp(-dt*(18-edge)*.35):1;}
 let accumulator=0,steps=0,emissions=0,moving=0,terrainKey='',active=false,lastMs=0,maxMs=0,foamMass=0,maxHeight=0,energy=0,disposed=false;
 const clamp=(x:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,x));
 const world=(i:number)=>i*dx-60;
 function stamp(cx:number,cz:number,sx:number,sz:number,heading:number,impulse:number,bubbles:number){
  const radius=Math.max(sx,sz)*3,minX=clamp(Math.floor((cx-radius+60)/dx),1,n-2),maxX=clamp(Math.ceil((cx+radius+60)/dx),1,n-2),minZ=clamp(Math.floor((cz-radius+60)/dx),1,n-2),maxZ=clamp(Math.ceil((cz+radius+60)/dx),1,n-2),sn=Math.sin(heading),cs=Math.cos(heading);
  // Subtract the discrete source mean: pressure never creates net water volume.
  let sum=0,cells=0;for(let z=minZ;z<=maxZ;z++)for(let x=minX;x<=maxX;x++){const i=z*n+x;if(land[i])continue;const px=world(x)-cx,pz=world(z)-cz,rx=(px*cs-pz*sn)/sx,rz=(px*sn+pz*cs)/sz,r2=rx*rx+rz*rz;sum+=(1-r2)*Math.exp(-r2);cells++;}
  const mean=cells?sum/cells:0;for(let z=minZ;z<=maxZ;z++)for(let x=minX;x<=maxX;x++){const i=z*n+x;if(land[i])continue;const px=world(x)-cx,pz=world(z)-cz,rx=(px*cs-pz*sn)/sx,rz=(px*sn+pz*cs)/sz,r2=rx*rx+rz*rz,g=Math.exp(-r2);v[i]+=impulse*((1-r2)*g-mean);const pore=.12+.88*((Math.imul(x,374761393)^Math.imul(z,668265263))>>>0)/4294967295;foam[i]=Math.min(.85,foam[i]+bubbles*g*pore);}
  emissions++;active=true;
 }
 function begin(){seen.clear();moving=0;}
 function observe(body:WakeBody){if(disposed)return;seen.add(body.id);const previous=bodies.get(body.id);const distance=previous?Math.hypot(body.x-previous.x,body.z-previous.z):0,travelled=(previous?.travelled??0)+(distance<=8?distance:0),seed=previous?.seed??wakeSeed(body.id);bodies.set(body.id,{...body,travelled,seed});if(!previous)return;if(distance<.0001||distance>8||body.speed<.025)return;moving++;
  const speed=Math.min(3.5,body.speed),froude=(speed/WAKE_PHYSICS.timeScale)/Math.sqrt(9.81/WAKE_PHYSICS.metresPerUnit*body.length),power=clamp(froude/.30,.05,1.4),pieces=Math.max(1,Math.ceil(distance/(dx*.6))),travel=distance/pieces;
  for(let j=1;j<=pieces;j++){const t=j/pieces,x=previous.x+(body.x-previous.x)*t,z=previous.z+(body.z-previous.z)*t,sn=Math.sin(body.heading),cs=Math.cos(body.heading),bow=body.length*.43,stern=body.length*.43,phase=travelled-distance+distance*t,eddy=wakeNoise(phase*1.7,seed%997,seed),swell=wakeNoise(phase*.53+23,seed%991,seed),width=.78+.44*swell,strength=.45+1.05*eddy,lateral=(eddy-.5)*body.width*.3;
   stamp(x-sn*bow+cs*lateral,z-cs*bow-sn*lateral,Math.max(dx*.9,body.width*.65*width),Math.max(dx*.8,body.width*.5),body.heading,.52*travel*power,.45*travel*power*strength);
   stamp(x+sn*stern-cs*lateral,z+cs*stern+sn*lateral,Math.max(dx*.9,body.width*.6*width),Math.max(dx,body.width),body.heading,-.144*travel*power,1.55*travel*power*strength);
  }
 }
 function terrain(cells:readonly {x:number;z:number}[]){const key=cells.map(c=>c.x+','+c.z).join(';');if(key===terrainKey)return;terrainKey=key;land.fill(0);for(const c of cells){const x0=clamp(Math.floor(c.x*4/dx),0,n-1),x1=clamp(Math.ceil((c.x+1)*4/dx),0,n-1),z0=clamp(Math.floor(c.z*4/dx),0,n-1),z1=clamp(Math.ceil((c.z+1)*4/dx),0,n-1);for(let z=z0;z<=z1;z++)for(let x=x0;x<=x1;x++)land[z*n+x]=1;}for(let i=0;i<count;i++)if(land[i])h[i]=v[i]=foam[i]=0;}
 function step(){
  for(let z=1;z<n-1;z++)for(let x=1;x<n-1;x++){const i=z*n+x;if(land[i]){rhs[i]=a[i]=0;continue;}const center=h[i],sum=(land[i-1]?center:h[i-1])+(land[i+1]?center:h[i+1])+(land[i-n]?center:h[i-n])+(land[i+n]?center:h[i+n]);rhs[i]=c2*(sum-4*center)/(dx*dx);a[i]=rhs[i]/diag;}
  for(let pass=0;pass<4;pass++){for(let z=1;z<n-1;z++)for(let x=1;x<n-1;x++){const i=z*n+x;if(land[i]){b[i]=0;continue;}const center=a[i],sum=(land[i-1]?center:a[i-1])+(land[i+1]?center:a[i+1])+(land[i-n]?center:a[i-n])+(land[i+n]?center:a[i+n]);b[i]=(rhs[i]+dispersion*sum)/diag;}const temp=a;a=b;b=temp;}
  foamMass=0;maxHeight=0;energy=0;const damping=Math.exp(-WAKE_PHYSICS.waveDamping*dt),decay=Math.exp(-WAKE_PHYSICS.foamDecay*dt),diffusion=.020*dt/(dx*dx);
  for(let z=1;z<n-1;z++)for(let x=1;x<n-1;x++){const i=z*n+x;if(land[i])continue;const absorb=absorption[i];v[i]=(v[i]+a[i]*dt)*damping*absorb;h[i]=(h[i]+v[i]*dt)*absorb;
   const f=foam[i],sum=(land[i-1]?f:foam[i-1])+(land[i+1]?f:foam[i+1])+(land[i-n]?f:foam[i-n])+(land[i+n]?f:foam[i+n]);nextFoam[i]=Math.max(0,(f+(sum-4*f)*diffusion)*decay*absorb);foamMass+=nextFoam[i];maxHeight=Math.max(maxHeight,Math.abs(h[i]));energy+=h[i]*h[i]+v[i]*v[i]/c2;
  }foam.set(nextFoam);steps++;
 }
 function encode(){for(let z=0;z<n;z++)for(let x=0;x<n;x++){const i=z*n+x,k=i*4,edge=x>0&&z>0&&x<n-1&&z<n-1&&!land[i],gx=edge?(h[i+1]-h[i-1])/(2*dx):0,gz=edge?(h[i+n]-h[i-n])/(2*dx):0;pixels[k]=Math.round(128+clamp(h[i]/WAKE_PHYSICS.heightRange,-1,1)*127);pixels[k+1]=Math.round(128+clamp(gx/WAKE_PHYSICS.slopeRange,-1,1)*127);pixels[k+2]=Math.round(128+clamp(gz/WAKE_PHYSICS.slopeRange,-1,1)*127);pixels[k+3]=Math.round(clamp(foam[i],0,1)*255);}}
 function advance(delta:number){if(disposed)return false;for(const id of bodies.keys())if(!seen.has(id))bodies.delete(id);if(!active){lastMs=0;return false;}accumulator+=Math.min(.1,Math.max(0,delta));let changed=false;const start=performance.now();while(accumulator+1e-9>=dt){step();accumulator-=dt;changed=true;}if(changed){if(foamMass<.001&&energy<1e-10){h.fill(0);v.fill(0);foam.fill(0);active=false;}encode();lastMs=performance.now()-start;maxMs=Math.max(maxMs,lastMs);}return changed;}
 function reset(){for(const field of [h,v,foam,nextFoam,rhs,a,b])field.fill(0);bodies.clear();seen.clear();accumulator=steps=emissions=moving=foamMass=maxHeight=energy=0;active=false;encode();}
 function sample(x:number,z:number){const ix=clamp(Math.round((x+60)/dx),0,n-1),iz=clamp(Math.round((z+60)/dx),0,n-1),i=iz*n+ix;return{height:h[i]!,foam:foam[i]!,velocity:v[i]!};}
 function diagnostics(){return{wakePhysics:'finite-depth-dispersive-heightfield',wakeGrid:n,wakeFixedStep:dt,wakeSteps:steps,wakeEmissions:emissions,movingShipWakes:moving,wakeFoamMass:foamMass,wakeEnergy:energy,wakeMaxHeightMetres:maxHeight*WAKE_PHYSICS.metresPerUnit,wakeSolveMs:lastMs,wakeSolveMaxMs:maxMs,wakeBytes:count*4,wakeHistoryPersistent:true,wakeBreakup:'nonperiodic-domain-warp',shipWakeDrawCalls:0,shipWakeTriangles:0,trackedWakeBodies:bodies.size};}
 reset();return{begin,observe,terrain,advance,reset,pixels,sample,diagnostics,dispose(){reset();disposed=true;}};
}
