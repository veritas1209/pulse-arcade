import * as THREE from 'three';

let resources: { color: THREE.Texture; roughness: THREE.Texture; normal: THREE.Texture; ready: boolean; failed: boolean } | undefined;

export function surfaceResources() {
  if (!resources && typeof window !== 'undefined') {
    const loader = new THREE.TextureLoader();
    let loaded = 0;
    const complete = () => { if (++loaded === 3 && resources) resources.ready = true; };
    const failed = () => { if (resources) resources.failed = true; };
    const load = (name: string, color = false) => {
      const texture = loader.load(`${import.meta.env.BASE_URL}materials/${name}`, complete, undefined, failed);
      texture.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      texture.anisotropy = 4;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      return texture;
    };
    resources = { color: load('surface-color.webp', true), roughness: load('surface-roughness.webp'), normal: load('surface-normal.webp'), ready: false, failed: false };
  }
  return resources;
}

/** Object-anchored triplanar material coordinates survive clipping and release. */
export function createSurfaceMaterial() {
  const material = new THREE.MeshStandardMaterial({ name: 'authored-pbr-surfaces', vertexColors: true, roughness: 0.66, metalness: 0.02 });
  const maps = surfaceResources();
  material.onBeforeCompile = shader => {
    if (maps) Object.assign(shader.uniforms, { surfaceColor: { value: maps.color }, surfaceRoughness: { value: maps.roughness }, surfaceNormalMap: { value: maps.normal } });
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>
      attribute vec4 surface;
      attribute vec3 materialPosition;
      varying vec4 vSurface;
      varying vec3 vMaterialPosition;
      varying vec3 vMaterialNormal;`);
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vSurface = surface;
      vMaterialPosition = materialPosition;
      vMaterialNormal = normal;`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
      uniform sampler2D surfaceColor;
      uniform sampler2D surfaceRoughness;
      uniform sampler2D surfaceNormalMap;
      uniform mat3 normalMatrix;
      varying vec4 vSurface;
      varying vec3 vMaterialPosition;
      varying vec3 vMaterialNormal;
      vec2 surfaceUv(vec2 coord, float kind) {
        vec2 cell = vec2(mod(kind, 4.0), floor(kind / 4.0));
        return (cell + clamp(fract(coord), vec2(0.003), vec2(0.997))) / vec2(4.0, 2.0);
      }
      vec3 surfaceWeights(vec3 n) {
        vec3 w = pow(abs(n), vec3(8.0));
        return w / max(w.x + w.y + w.z, 0.0001);
      }
      vec3 sampleSurface(sampler2D tex, vec3 p, vec3 w, float kind) {
        return texture2D(tex, surfaceUv(p.zy, kind)).rgb * w.x
          + texture2D(tex, surfaceUv(p.xz, kind)).rgb * w.y
          + texture2D(tex, surfaceUv(p.xy, kind)).rgb * w.z;
      }
      vec3 sampleSurfaceNormal(vec3 p, vec3 n, vec3 w, float kind) {
        vec3 x = texture2D(surfaceNormalMap, surfaceUv(p.zy, kind)).rgb * 2.0 - 1.0;
        vec3 y = texture2D(surfaceNormalMap, surfaceUv(p.xz, kind)).rgb * 2.0 - 1.0;
        vec3 z = texture2D(surfaceNormalMap, surfaceUv(p.xy, kind)).rgb * 2.0 - 1.0;
        return normalize(vec3(x.z * sign(n.x), x.y, x.x) * w.x
          + vec3(y.x, y.z * sign(n.y), y.y) * w.y
          + vec3(z.x, z.y, z.z * sign(n.z)) * w.z);
      }`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      vec3 surfaceN = normalize(vMaterialNormal);
      vec3 surfaceW = surfaceWeights(surfaceN);
      vec3 surfaceP = vMaterialPosition * vSurface.w;
      if (vSurface.z >= 0.0) {
        vec3 grain = sampleSurface(surfaceColor, surfaceP, surfaceW, vSurface.z);
        diffuseColor.rgb *= mix(vec3(1.0), grain, 0.58);
      }`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      roughnessFactor = vSurface.x;
      if (vSurface.z >= 0.0) roughnessFactor = mix(roughnessFactor, sampleSurface(surfaceRoughness, surfaceP, surfaceW, vSurface.z).r, 0.58);`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = vSurface.y;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      if (vSurface.z >= 0.0) {
        vec3 detailNormal = sampleSurfaceNormal(surfaceP, surfaceN, surfaceW, vSurface.z);
        normal = normalize(normalMatrix * normalize(mix(surfaceN, detailNormal, 0.40)));
      }`);
  };
  material.customProgramCacheKey = () => 'screw-harbor-pbr-atlas-v2';
  return material;
}

export function materialProfile(role: string, name: string, stage: number): [number, number, number, number] {
  const ship = [5,8,10,12,16,17,18,19].includes(stage);
  if (role === 'glass') return [0.16, 0.12, -1, 1];
  if (role === 'wood') return [0.72, 0, 0, 0.7];
  if (role === 'gold') return [0.38, 0.78, 1, 0.6];
  if (role === 'dark') return [0.55, ship ? 0.58 : 0.15, 1, 0.8];
  if (stage === 13 && ['jade','teal'].includes(role)) return [0.7, 0.58, 4, 0.65];
  if (role === 'navy' && /갑판|deck|Deck|floor|Floor/.test(name)) return [0.85, 0.08, 7, 0.8];
  if (/roof|Roof|지붕|처마/.test(name) && ['coral','red','teal'].includes(role)) return [0.5, 0.06, 5, 0.7];
  if (!ship && ['stone','cream','white'].includes(role)) return [0.82, 0, 2, 0.55];
  if (/seat|Seat|매트|침구|cushion|Cushion/.test(name) && ['coral','teal','navy'].includes(role)) return [0.94, 0, 6, 3];
  return [0.5, ship ? 0.15 : 0.03, 3, 0.36];
}
