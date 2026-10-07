/** Non-wrapping, seeded turbulence. Coordinates never modulo a texture period. */
export function wakeHash(x:number,z:number,seed=0){let a=Math.imul(x,374761393)^Math.imul(z,668265263)^Math.imul(seed,1274126177);a=Math.imul(a^(a>>>13),1274126177);return((a^(a>>>16))>>>0)/4294967295;}
export function wakeNoise(x:number,z:number,seed=0){const ix=Math.floor(x),iz=Math.floor(z),fx=x-ix,fz=z-iz,sx=fx*fx*(3-2*fx),sz=fz*fz*(3-2*fz),a=wakeHash(ix,iz,seed),b=wakeHash(ix+1,iz,seed),c=wakeHash(ix,iz+1,seed),d=wakeHash(ix+1,iz+1,seed);return(a+(b-a)*sx)*(1-sz)+(c+(d-c)*sx)*sz;}
export function wakeSeed(id:string){let n=2166136261;for(let i=0;i<id.length;i++)n=Math.imul(n^id.charCodeAt(i),16777619);return n>>>0;}
/** One unique texture across the whole board, with warped multi-scale clusters.
 * G/B carry independent, slowly varying warp fields. R carries foam breakup. */
export function bakeWakeTurbulence(size=512){const pixels=new Uint8Array(size*size*4);for(let z=0;z<size;z++)for(let x=0;x<size;x++){const u=x/(size-1),v=z/(size-1),wx=wakeNoise(u*13,v*13,19),wz=wakeNoise(u*11+3,v*11-9,47),qx=u+(wx-.5)*.025,qz=v+(wz-.5)*.025,clusters=wakeNoise(qx*73,qz*73,71)*.55+wakeNoise(qx*181+8,qz*181-7,103)*.30+wakeNoise(qx*397,qz*397,211)*.15,k=(z*size+x)*4;pixels[k]=Math.round(clusters*255);pixels[k+1]=Math.round(wx*255);pixels[k+2]=Math.round(wz*255);pixels[k+3]=255;}return pixels;}
