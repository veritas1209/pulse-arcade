import {test,expect} from '@playwright/test';
import {createWakePhysics} from '../src/naval/wake-physics';
test('ship displacement emits bounded waves; stationary water remains idle and foam persists then decays',()=>{
 const w=createWakePhysics(192);const body={id:'a',x:-5,z:0,heading:-Math.PI/2,width:.3,length:3.6,speed:0};w.begin();w.observe(body);w.advance(.05);expect(w.diagnostics().wakeSteps).toBe(0);
 for(let i=0;i<180;i++){w.begin();body.x+=3/60;body.speed=3;w.observe(body);w.advance(1/60);}const moving=w.diagnostics();expect(moving.wakeEnergy).toBeGreaterThan(0);expect(moving.wakeMaxHeightMetres).toBeLessThan(3);
 body.speed=0;for(let i=0;i<120;i++){w.begin();w.observe(body);w.advance(1/60);}const stopped=w.diagnostics();expect(stopped.movingShipWakes).toBe(0);expect(stopped.wakeFoamMass).toBeGreaterThan(0);
 for(let i=0;i<600;i++){w.begin();w.observe(body);w.advance(1/60);}const late=w.diagnostics();expect(late.wakeFoamMass).toBeLessThan(stopped.wakeFoamMass);expect(late.wakeEnergy).toBeLessThan(stopped.wakeEnergy);expect(Number.isFinite(late.wakeEnergy)).toBe(true);w.reset();expect(w.diagnostics().wakeFoamMass).toBe(0);
});
test('pressure creates no net volume; island cells remain dry; teleports do not generate a wake',()=>{
 const w=createWakePhysics(192),body={id:'a',x:0,z:0,heading:0,width:.3,length:3.6,speed:3};w.terrain([{x:15,z:15}]);w.begin();w.observe(body);body.z-=.08;w.begin();w.observe(body);let volume=0;for(let z=0;z<192;z++)for(let x=0;x<192;x++)volume+=w.sample(x*120/191-60,z*120/191-60).velocity;expect(Math.abs(volume)).toBeLessThan(1e-6);w.advance(.05);expect(w.sample(2,2)).toEqual({height:0,foam:0,velocity:0});const e=w.diagnostics().wakeEmissions;body.x=30;w.begin();w.observe(body);expect(w.diagnostics().wakeEmissions).toBe(e);
});
