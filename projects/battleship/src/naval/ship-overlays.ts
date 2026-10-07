import * as THREE from 'three';
import {oceanGridHeightGLSL} from './ocean';
import {fleetLabelLayout,paintFleetLabel,type FleetLabel} from './fleet-label';

export interface ShipOverlayFrameContext {tacticalMode?:boolean;showAll?:boolean}
export interface ShipOverlayEntryContext {selected?:boolean;hovered?:boolean;damaged?:boolean;actionable?:boolean;label?:FleetLabel}

/** Caller submits only its current visible fleet; no persistent vessel/contact cache. */
export function createShipOverlays(scene:THREE.Scene,capacity=20){
 const transform=new THREE.Object3D();
 const contactGeometry=new THREE.PlaneGeometry(1,1,1,4);contactGeometry.rotateX(-Math.PI/2);
 const opacity=new THREE.InstancedBufferAttribute(new Float32Array(capacity),1);contactGeometry.setAttribute('aOpacity',opacity);
 const contactMaterial=new THREE.ShaderMaterial({name:'soft-hull-water-contact',transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1,uniforms:{uTime:{value:0}},
  vertexShader:`uniform float uTime;attribute float aOpacity;varying vec2 vUv;varying float vOpacity;${oceanGridHeightGLSL}
   void main(){vUv=uv;vOpacity=aOpacity;vec4 world=modelMatrix*instanceMatrix*vec4(position,1.);world.y=oceanGridHeight(world.xz,uTime)+.006;gl_Position=projectionMatrix*viewMatrix*world;}`,
  fragmentShader:`varying vec2 vUv;varying float vOpacity;void main(){vec2 q=(vUv-vec2(.5,.47))*2.;float edge=1.-smoothstep(.12,1.,dot(q,q));float directional=mix(.72,1.08,smoothstep(.05,.95,vUv.y));gl_FragColor=vec4(.009,.027,.031,edge*edge*.15*directional*vOpacity);
   #include <tonemapping_fragment>
   #include <colorspace_fragment>
  }`});
 const contacts=new THREE.InstancedMesh(contactGeometry,contactMaterial,capacity);contacts.name='visible-fleet-water-contact';contacts.count=0;contacts.frustumCulled=false;contacts.renderOrder=1;scene.add(contacts);
 // One canvas atlas and one instanced draw for all health banners and torpedo names.
 const labelCapacity=capacity+24,slotW=640,slotH=128,columns=4,atlasW=slotW*columns,atlasH=slotH*Math.ceil(labelCapacity/columns);
 const atlas=typeof document==='undefined'?null:document.createElement('canvas');if(atlas){atlas.width=atlasW;atlas.height=atlasH;}
 const painter=atlas?.getContext('2d')??null,texture=atlas?new THREE.CanvasTexture(atlas):new THREE.Texture();texture.colorSpace=THREE.SRGBColorSpace;texture.generateMipmaps=false;texture.minFilter=texture.magFilter=THREE.LinearFilter;
 const geometry=new THREE.PlaneGeometry(1,1),size=new THREE.InstancedBufferAttribute(new Float32Array(labelCapacity*2),2),uvRect=new THREE.InstancedBufferAttribute(new Float32Array(labelCapacity*4),4);
 geometry.setAttribute('aSize',size);geometry.setAttribute('aUvRect',uvRect);
 const material=new THREE.ShaderMaterial({name:'faction-health-and-mk48-atlas',transparent:true,depthWrite:false,depthTest:false,toneMapped:false,uniforms:{uViewport:{value:new THREE.Vector2(1,1)},uAtlas:{value:texture}},
 vertexShader:`uniform vec2 uViewport;attribute vec2 aSize;attribute vec4 aUvRect;varying vec2 vUv;void main(){vUv=aUvRect.xy+uv*aUvRect.zw;vec4 anchor=projectionMatrix*viewMatrix*modelMatrix*instanceMatrix*vec4(0.,0.,0.,1.);vec2 pixels=position.xy*aSize+vec2(0.,aSize.y*.5+8.);anchor.xy+=pixels*2./uViewport*anchor.w;if(anchor.w<=0.)anchor=vec4(2.,2.,2.,1.);gl_Position=anchor;}`,
 fragmentShader:`uniform sampler2D uAtlas;varying vec2 vUv;void main(){gl_FragColor=texture2D(uAtlas,vUv);if(gl_FragColor.a<.01)discard;
#include <colorspace_fragment>
}`});
 const health=new THREE.InstancedMesh(geometry,material,labelCapacity);health.name='faction-fleet-health-and-torpedo-names';health.count=0;health.frustumCulled=false;health.renderOrder=1000000;scene.add(health);
 const entries:{position:THREE.Vector3;label:FleetLabel}[]=[],paintKeys:string[]=[],slots=new Map<string,number>(),view=new THREE.Vector3();
 let contactCount=0,healthCount=0,healthCandidates=0,contextualBars=0,tacticalMode=true,showAll=false,cssWidth=1,cssHeight=1;
 let labels:{id:string;kind:string;friendly:boolean;color:string;width:number;height:number;detailed:boolean;hp:number|null;anchor:number[];screen:number[];compact:boolean;drawn:boolean;drawOrder:number;atlasSlot:number}[]=[];
 let atlasPaints=0,atlasUploads=0;
 return {
  begin(time:number,width:number,height:number,frame:ShipOverlayFrameContext={}){contactCount=healthCount=healthCandidates=contextualBars=0;entries.length=0;tacticalMode=frame.tacticalMode??true;showAll=frame.showAll??false;cssWidth=Math.max(1,width);cssHeight=Math.max(1,height);contactMaterial.uniforms.uTime.value=time;material.uniforms.uViewport.value.set(cssWidth,cssHeight);},
  addContact(position:THREE.Vector3,heading:number,width:number,length:number,visible=true,alpha=1){if(!visible||contactCount>=capacity||alpha<=0)return;transform.position.copy(position);transform.rotation.set(0,heading,0);transform.scale.set(width*1.18+.04,1,length*1.025+.04);transform.updateMatrix();contacts.setMatrixAt(contactCount,transform.matrix);opacity.setX(contactCount++,THREE.MathUtils.clamp(alpha,0,1));},
  addHealth(position:THREE.Vector3,height:number,hpFraction:number,friendly:boolean,visible=true,context:ShipOverlayEntryContext={}){if(!visible)return;healthCandidates++;const damaged=context.damaged??hpFraction<.999,contextual=!!(context.selected||context.hovered||context.actionable||damaged);if((!showAll&&!tacticalMode&&!contextual)||healthCount>=capacity)return;if(contextual)contextualBars++;healthCount++;const anchor=position.clone();anchor.y+=Math.max(.2,height);entries.push({position:anchor,label:context.label??{id:String(entries.length),kind:'destroyer',name:'구축함',hp:hpFraction*100,maxHp:100,friendly,length:3,selected:context.selected,hovered:context.hovered}});},
  addTorpedo(position:THREE.Vector3,id:string,friendly:boolean){if(entries.length>=labelCapacity)return;entries.push({position:position.clone().add(new THREE.Vector3(0,.12,0)),label:{id,kind:'torpedo',name:'MK48 어뢰',hp:0,maxHp:0,friendly,length:.28}});},
  end(){contacts.count=contactCount;health.count=entries.length;contacts.instanceMatrix.needsUpdate=true;opacity.needsUpdate=true;},
  prepare(camera:THREE.PerspectiveCamera){
   camera.updateMatrixWorld();labels=[];let dirty=false;const occupied:{x:number;y:number;width:number;height:number}[]=[];
   // Stable atlas ownership is independent of depth order. Hover never changes size or stacking.
   const active=new Set(entries.map(e=>e.label.id));for(const id of slots.keys())if(!active.has(id))slots.delete(id);
   const used=new Set(slots.values());for(const {label} of entries)if(!slots.has(label.id)){let slot=0;while(used.has(slot))slot++;slots.set(label.id,slot);used.add(slot);}
   // Reserve crowded space near-to-far, but draw complete banners far-to-near.
   entries.sort((a,b)=>a.position.distanceToSquared(camera.position)-b.position.distanceToSquared(camera.position)||a.label.id.localeCompare(b.label.id));
   entries.forEach(({position,label},i)=>{
    view.copy(position).applyMatrix4(camera.matrixWorldInverse);const depth=Math.max(.1,-view.z),pixels=label.length*cssHeight/(2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*depth),layout=fleetLabelLayout(pixels,cssWidth,label);
    const screen=position.clone().project(camera),screenX=(screen.x*.5+.5)*cssWidth;
    let screenY=(-screen.y*.5+.5)*cssHeight-8-layout.height*.5;
    const intersects=()=>occupied.some(r=>Math.abs(r.x-screenX)<(r.width+layout.width)/2+2&&Math.abs(r.y-screenY)<(r.height+layout.height)/2+2);
    // Crowded torpedo names collapse to their colored diamond instead of covering ship HP.
    if(label.kind==='torpedo'&&intersects()){layout.width=18;layout.height=18;layout.compact=true;screenY=(-screen.y*.5+.5)*cssHeight-17;}
    const onScreen=view.z<0&&screen.z>=-1&&screen.z<=1&&screenX+layout.width/2>0&&screenX-layout.width/2<cssWidth&&screenY+layout.height/2>0&&screenY-layout.height/2<cssHeight;
    const drawn=onScreen&&(label.kind==='torpedo'||!layout.compact||!intersects());if(drawn)occupied.push({x:screenX,y:screenY,width:layout.width,height:layout.height});
    // Quantize only the rasterization, not the on-screen size, to avoid texture uploads every frame.
    const slot=slots.get(label.id)!,drawOrder=entries.length-1-i,rasterWidth=layout.compact?28:Math.ceil(layout.width/8)*8,rasterHeight=layout.compact?28:layout.height,key=JSON.stringify(layout.compact?[label.kind,label.friendly,'icon']:[label.kind,label.name,label.hp,label.maxHp,label.friendly,rasterWidth,rasterHeight,layout.detailed]),sx=slot%columns*slotW,sy=Math.floor(slot/columns)*slotH;
    if(drawn&&painter&&paintKeys[slot]!==key){painter.clearRect(sx,sy,slotW,slotH);painter.save();painter.translate(sx,sy);painter.scale(3,3);paintFleetLabel(painter,label,rasterWidth,rasterHeight,layout.detailed);painter.restore();paintKeys[slot]=key;dirty=true;atlasPaints++;}
    size.setXY(drawOrder,drawn?layout.width:0,drawn?layout.height:0);uvRect.setXYZW(drawOrder,sx/atlasW,1-(sy+rasterHeight*3)/atlasH,rasterWidth*3/atlasW,rasterHeight*3/atlasH);
    transform.position.copy(position);transform.rotation.set(0,0,0);transform.scale.set(1,1,1);transform.updateMatrix();health.setMatrixAt(drawOrder,transform.matrix);
    labels.push({id:label.id,kind:label.kind,friendly:label.friendly,color:label.friendly?'#65a7ff':'#ff626c',width:layout.width,height:layout.height,detailed:layout.detailed,hp:label.kind==='torpedo'?null:label.hp,anchor:position.toArray(),screen:[screenX,screenY],compact:layout.compact,drawn,drawOrder,atlasSlot:slot});
   });
   if(dirty){texture.needsUpdate=true;atlasUploads++;}health.instanceMatrix.needsUpdate=true;size.needsUpdate=true;uvRect.needsUpdate=true;
  },
  diagnostics(){const count=entries.length,triangles=contactCount*8+count*2;return{waterContactShadows:contactCount,healthBars:healthCount,visibleHealthBars:healthCount,totalHealthBarCandidates:healthCandidates,contextualHealthBars:contextualBars,tacticalHealthMode:tacticalMode,healthBarCssSize:[208,38],healthBarCssWidthRange:[18,208],torpedoNameplates:count-healthCount,fleetLabels:labels,healthAtlas:{paints:atlasPaints,uploads:atlasUploads,bytesPerUpload:atlasW*atlasH*4,stableSlots:true},healthOverlayPriority:{depthTest:material.depthTest,depthWrite:material.depthWrite,renderOrder:health.renderOrder},overlayTriangles:triangles,overlayDrawCalls:Number(contactCount>0)+Number(count>0),overlayVertexCost:contactCount*24+count*6};},
  dispose(){scene.remove(contacts,health);contactGeometry.dispose();contactMaterial.dispose();geometry.dispose();material.dispose();texture.dispose();entries.length=0;paintKeys.length=0;slots.clear();labels=[];if(atlas){atlas.width=atlas.height=1;}}
 };
}
