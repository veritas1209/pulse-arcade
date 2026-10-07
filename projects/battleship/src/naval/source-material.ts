import * as THREE from 'three';
import {externalFighter} from './generated/f22-external';
import {externalFleet} from './generated/fleet-external';
import type {ShipKind} from '../contract';
export interface SourceFleetTexture {color:THREE.Texture;pbr:THREE.Texture;normal:THREE.Texture;layout:THREE.Vector4}
export type SourceFleetTextures=Record<ShipKind|'fighter',SourceFleetTexture>;
/** Original source UVs, colour and metallic/roughness maps; padding protects mip boundaries. */
export function loadFleetSourceTextures(loader:THREE.TextureLoader,base:string,anisotropy=4):SourceFleetTextures{
 const result={} as SourceFleetTextures;
 for(const kind of ['carrier','battleship','destroyer','fighter'] as (ShipKind|'fighter')[]){
  const atlas=kind==='fighter'?externalFighter.atlas:externalFleet[kind].atlas!;
  const color=loader.load(base+atlas.colorPath),pbr=loader.load(base+atlas.pbrPath),normal=loader.load(base+((atlas as typeof atlas&{normalPath?:string}).normalPath??`materials/${kind}-source-normal.webp`));
  color.colorSpace=THREE.SRGBColorSpace;
  for(const texture of [color,pbr,normal]){texture.flipY=false;texture.anisotropy=anisotropy;texture.minFilter=THREE.LinearMipmapLinearFilter;}
  result[kind]={color,pbr,normal,layout:new THREE.Vector4(atlas.columns,atlas.tileSize/atlas.width,atlas.tileSize/atlas.height,atlas.padding/atlas.tileSize)};
 }
 return result;
}
export const fleetSourceGlsl=`
varying float vSourceTile;
// F22 has no authored normal map; matte paint uses constant PBR. Avoid two
// redundant samplers so fleet + environment + shadows fit 16-unit desktop GPUs.
uniform sampler2D uFighterColor; uniform vec4 uFighterLayout;
uniform sampler2D uCarrierColor; uniform sampler2D uCarrierPbr; uniform sampler2D uCarrierNormal; uniform vec4 uCarrierLayout;
uniform sampler2D uBattleshipColor; uniform sampler2D uBattleshipPbr; uniform sampler2D uBattleshipNormal; uniform vec4 uBattleshipLayout;
uniform sampler2D uDestroyerColor; uniform sampler2D uDestroyerPbr; uniform sampler2D uDestroyerNormal; uniform vec4 uDestroyerLayout;
vec4 fleetSourceSample(sampler2D tex,vec4 atlasLayout){
 vec2 cell=atlasLayout.yz;
 vec2 scale=cell*(1.-2.*atlasLayout.w);
 vec2 tile=vec2(mod(floor(vSourceTile+.5),atlasLayout.x),floor(floor(vSourceTile+.5)/atlasLayout.x));
 vec2 at=tile*cell+cell*atlasLayout.w+fract(vFleetUv)*scale;
 return textureGrad(tex,at,dFdx(vFleetUv)*scale,dFdy(vFleetUv)*scale);
}
vec4 fleetSourceColor(){
 if(vSourceTile<-.5)return vec4(1.);
 if(vFleetSurface< -3.5)return fleetSourceSample(uFighterColor,uFighterLayout);
 if(vFleetSurface< -2.5)return fleetSourceSample(uDestroyerColor,uDestroyerLayout);
 if(vFleetSurface< -1.5)return fleetSourceSample(uBattleshipColor,uBattleshipLayout);
 return fleetSourceSample(uCarrierColor,uCarrierLayout);
}
vec4 fleetSourceNormal(){
 if(vSourceTile<-.5)return vec4(.5,.5,1.,1.);
 if(vFleetSurface< -3.5)return vec4(.5,.5,1.,1.);
 if(vFleetSurface< -2.5)return fleetSourceSample(uDestroyerNormal,uDestroyerLayout);
 if(vFleetSurface< -1.5)return fleetSourceSample(uBattleshipNormal,uBattleshipLayout);
 return fleetSourceSample(uCarrierNormal,uCarrierLayout);
}
vec4 fleetSourcePbr(){
 if(vSourceTile<-.5)return vec4(1.,.65,.05,1.);
 if(vFleetSurface< -3.5)return vec4(1.,.8,.035,1.);
 if(vFleetSurface< -2.5)return fleetSourceSample(uDestroyerPbr,uDestroyerLayout);
 if(vFleetSurface< -1.5)return fleetSourceSample(uBattleshipPbr,uBattleshipLayout);
 return fleetSourceSample(uCarrierPbr,uCarrierLayout);
}
`;
