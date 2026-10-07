import {test,expect} from '@playwright/test';
import {createTorpedoWakeHistory} from '../src/naval/torpedo-wakes';
test('torpedo foam records observed travel only, persists after removal, decays and bounds memory',()=>{
 const h=createTorpedoWakeHistory();h.observe('observed',0,0,0);h.observe('observed',1,0,.1);
 expect(h.segments().length).toBeGreaterThan(1);expect(h.segments().every(s=>s.a.x>=0&&s.b.x<=1&&s.b.z===0)).toBe(true);
 const born=h.segments().at(-1)!.b.born;h.observe('observed',1,0,2);expect(h.segments().at(-1)!.b.born).toBe(born);
 h.prune(4);expect(h.segments().length).toBeGreaterThan(0);h.prune(12);expect(h.segments()).toEqual([]);
 for(let i=0;i<500;i++)h.observe('bounded',i*.1,0,13+i*.01);
 expect(h.segments().length).toBeLessThanOrEqual(127);
 h.observe('bounded',100,100,19);expect(h.segments()).toEqual([]);h.clear();expect(h.diagnostics().torpedoWakeHistory).toBe(0);
});
