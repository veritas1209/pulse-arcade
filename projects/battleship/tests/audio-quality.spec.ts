import {test,expect} from '@playwright/test';
import {readFileSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';

const audioDir=resolve('public/audio');
interface Derivative {file:string;sha256:string;duration:number;loop:boolean;peak:number;rms:number;layers:{source:string}[];license:string}
const manifest=JSON.parse(readFileSync(resolve(audioDir,'source-manifest.json'),'utf8')) as {derivatives:Derivative[];sources:{file:string;license:string;page:string;licenseUrl:string}[]};
function pcm(file:string){const b=readFileSync(resolve(audioDir,file));expect(b.toString('ascii',0,4)).toBe('RIFF');expect(b.toString('ascii',8,12)).toBe('WAVE');expect(b.readUInt16LE(22)).toBe(1);expect(b.readUInt16LE(34)).toBe(16);const rate=b.readUInt32LE(24);const x=Array.from({length:(b.length-44)/2},(_,i)=>b.readInt16LE(44+i*2)/32768);return {b,rate,x};}

test('all 25 licensed audio files ship with exact hashes, permitted sources, and unclipped headroom',()=>{
 // Runtime uses 23 cues; two earlier derivatives retain their source audit.
 const files=readdirSync(audioDir).filter(f=>f.endsWith('.wav')).sort();expect(files).toEqual(manifest.derivatives.map(d=>d.file).sort());expect(files).toHaveLength(25);
 const credits=readFileSync(resolve(audioDir,'LICENSE.txt'),'utf8');expect(credits).toContain('gkillhour');expect(credits).toContain('https://creativecommons.org/licenses/by/4.0/');
 for(const d of manifest.derivatives){const {b,rate,x}=pcm(d.file);expect(createHash('sha256').update(b).digest('hex'),d.file).toBe(d.sha256);expect(rate).toBe(32000);expect(x.length/rate).toBeCloseTo(d.duration,3);
  const peak=x.reduce((max,v)=>Math.max(max,Math.abs(v)),0),rms=Math.sqrt(x.reduce((sum,v)=>sum+v*v,0)/x.length);expect(peak,d.file).toBeLessThan(.881);expect(peak,d.file).toBeGreaterThan(.025);expect(rms,d.file).toBeGreaterThan(.004);
  for(const layer of d.layers){const source=manifest.sources.find(s=>s.file===layer.source);expect(source,`${d.file}: ${layer.source}`).toBeDefined();expect(['CC0-1.0','CC-BY-3.0','CC-BY-4.0']).toContain(source!.license);expect(source!.page).toMatch(/^https:\/\/(freesound.org\/people\/|soundbible.com\/1920-Minigun.html$)/);expect(credits).toContain(source!.page);}
 }
});

test('activity beds have continuous seams and longer nonrepeating recorded sections',()=>{
 for(const d of manifest.derivatives.filter(d=>d.loop)){const {x}=pcm(d.file);const seam=Math.abs(x[0]-x.at(-1)!);expect(seam,`${d.file}: loop seam`).toBeLessThan(.035);expect(d.duration,d.file).toBeGreaterThanOrEqual(d.file==='cannon-flight-loop.wav'?2.5:4);}
 // Weapon identity is audible in the files; neither shell nor torpedo reuses the missile motor WAV.
 const hashes=['cannon-flight-loop.wav','torpedo-flight-loop.wav','missile-flight-loop.wav'].map(f=>manifest.derivatives.find(d=>d.file===f)!.sha256);expect(new Set(hashes).size).toBe(3);
});

test('launch, hit, interception, and splash have recorded energy at event onset',()=>{
 for(const file of ['missile-launch.wav','naval-cannon-shot.wav','ciws-burst.wav','metal-impact.wav','intercept-detonation.wav','water-splash.wav']){const {x,rate}=pcm(file);const first=x.slice(0,Math.floor(rate*.12));const peak=first.reduce((max,v)=>Math.max(max,Math.abs(v)),0);expect(peak,file).toBeGreaterThan(.07);}
 const sinking=manifest.derivatives.find(d=>d.file==='sinking.wav')!;expect(sinking.layers.some(l=>l.source==='hull.mp3')).toBe(true);expect(sinking.layers.some(l=>l.source==='bubbles.mp3')).toBe(true);expect(sinking.layers.some(l=>l.source==='cannon.mp3')).toBe(false);
});
