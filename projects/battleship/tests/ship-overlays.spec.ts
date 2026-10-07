import {expect,test} from '@playwright/test';
import * as THREE from 'three';
import {createShipOverlays} from '../src/naval/ship-overlays';

test('normal overlays retain contextual health while tactical mode preserves all visible contacts',()=>{
 const scene=new THREE.Scene(),overlays=createShipOverlays(scene,8),at=new THREE.Vector3(2,.2,3);
 overlays.begin(1,1280,720,{tacticalMode:false});
 overlays.addContact(at,0,1,3,true);
 overlays.addHealth(at,1,.72,true,true);
 overlays.addHealth(at,1,1,true,true);
 overlays.addHealth(at,1,1,true,true,{selected:true});
 overlays.addHealth(at,1,1,false,true,{actionable:true});
 overlays.end();
 expect(overlays.diagnostics().healthOverlayPriority).toEqual({depthTest:false,depthWrite:false,renderOrder:1000000});
 expect(overlays.diagnostics()).toMatchObject({waterContactShadows:1,visibleHealthBars:3,totalHealthBarCandidates:4,contextualHealthBars:3,tacticalHealthMode:false,overlayTriangles:14,overlayDrawCalls:2,overlayVertexCost:42});

 overlays.begin(2,1280,720,{tacticalMode:true});
 for(let i=0;i<4;i++)overlays.addHealth(at,1,1,true,true);
 overlays.end();
 expect(overlays.diagnostics()).toMatchObject({visibleHealthBars:4,totalHealthBarCandidates:4,contextualHealthBars:0,tacticalHealthMode:true,overlayTriangles:8,overlayDrawCalls:1,overlayVertexCost:24});
 expect(scene.children.filter(child=>child instanceof THREE.InstancedMesh)).toHaveLength(2);
 overlays.dispose();expect(scene.children).toHaveLength(0);
});
