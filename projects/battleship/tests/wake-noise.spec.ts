import {test,expect} from '@playwright/test';import {bakeWakeTurbulence,wakeNoise,wakeSeed} from '../src/naval/wake-noise';
test('wake breakup has no former 1.1-world repeating texture period and differs between ships',()=>{
 const pixels=bakeWakeTurbulence(512),offset=5;let sx=0,sy=0,sxx=0,syy=0,sxy=0,n=0;
 for(let z=16;z<496;z+=3)for(let x=16;x<490;x+=3){const a=pixels[(z*512+x)*4]!,b=pixels[(z*512+x+offset)*4]!;sx+=a;sy+=b;sxx+=a*a;syy+=b*b;sxy+=a*b;n++;}const correlation=(n*sxy-sx*sy)/Math.sqrt((n*sxx-sx*sx)*(n*syy-sy*sy));expect(correlation).toBeLessThan(.85);
 const a=Array.from({length:60},(_,i)=>wakeNoise(i*.19,3,wakeSeed('carrier'))),b=Array.from({length:60},(_,i)=>wakeNoise(i*.19,3,wakeSeed('destroyer')));expect(a).not.toEqual(b);expect(a).toEqual(Array.from({length:60},(_,i)=>wakeNoise(i*.19,3,wakeSeed('carrier'))));
});
