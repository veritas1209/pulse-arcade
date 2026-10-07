import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
const url=process.argv[2]??'http://127.0.0.1:19096',out=process.argv[3]??'artifacts/torpedo-package-contact';
if(!['localhost','127.0.0.1','[::1]'].includes(new URL(url).hostname))throw new Error('Local fixture hooks are disabled publicly; use scripts/browser-qa.mjs for public verification');
await mkdir(out,{recursive:true});const browser=await chromium.launch({channel:'chrome'}),page=await browser.newPage({ignoreHTTPSErrors:true,viewport:{width:1440,height:900}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
try{
 await page.goto(url);await page.waitForFunction(()=>!!window.__THREE_GAME_TEST_HOOKS__);
 await page.evaluate(()=>{const h=window.__THREE_GAME_TEST_HOOKS__;h.setState('damage');const w=h.getState().world;w.islands=[];w.recon=[];w.sonar=[];w.history=[];w.lastShot=undefined;w.shotEvents=[];w.torpedoes=[];for(const s of w.ships.filter(s=>s.team===1)){s.sunk=true;s.hp=0;s.x=29;s.z=29;}h.refresh();const v=w.ships.find(s=>s.id==='1-battleship-1');Object.assign(v,{sunk:false,hp:800,maxHp:800,x:8,z:2,damageMarks:[],damageControl:true});const launcher=w.ships.find(s=>s.id==='0-destroyer-1');Object.assign(launcher,{x:4,z:2,ap:4,torpedoed:false});h.refresh();});
 await page.waitForFunction(()=>{const d=window.__THREE_GAME_TEST_HOOKS__.getState();return d.texturesReady&&!d.presentationBusy;},{},{timeout:60000});
 const hidden=await page.evaluate(()=>!window.__THREE_GAME_TEST_HOOKS__.getState().state.revealed.some(s=>s.id==='1-battleship-1'));if(!hidden)throw new Error('Fixture target must be outside sight');
 await page.evaluate(()=>{const h=window.__THREE_GAME_TEST_HOOKS__;h.command({type:'torpedo',shipId:'0-destroyer-1',target:{x:14,z:2}});h.command({type:'end'});});
 await page.waitForFunction(()=>{const d=window.__THREE_GAME_TEST_HOOKS__.getState();return d.combatCameraStage==='impact'&&d.combatCameraStageAge>.2;},{},{timeout:60000});
 await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__.setPausedForScreenshot(true));const d=await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__.getState());await page.screenshot({path:out+'/contact.png'});
 const blast=d.impactBlasts.find(b=>b.name==='torpedo-contact'),contact=d.sinkingWater.contacts.at(-1),cell=[-26,-50];
 if(!blast||JSON.stringify(contact)!==JSON.stringify(blast.position))throw new Error('Spray detached from actual contact');
 if(Math.hypot(contact[0]-cell[0],contact[2]-cell[1])<.1)throw new Error('Spray originates at grid centre');
 if(!d.visibleShips.includes('1-battleship-1')||!d.cinematicTargetArrived)throw new Error('Hidden victim not shown at contact');
 if(d.impactVolume.active!==0||d.sinkingWater.spray<20)throw new Error('Torpedo must use local falling water, no wet smoke wall');
 if(d.state.shots[0].approachFrom?.x!==7)throw new Error('Missing last route segment');
 await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__.setPausedForScreenshot(false));
 await page.waitForFunction(()=>{const d=window.__THREE_GAME_TEST_HOOKS__.getState();return d.combatCameraStage==='impact'&&d.combatCameraStageAge>1.6;},{},{timeout:15000});
 await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__.setPausedForScreenshot(true));const late=await page.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__.getState());await page.screenshot({path:out+'/after.png'});
 const victimFire=late.fireEmitters.find(f=>f.position[0]>-27&&f.position[0]<-25&&f.position[2]>-52&&f.position[2]<-48);if(!victimFire||Math.abs(contact[2]-victimFire.position[2])>.1)throw new Error('Contact not aligned with struck compartment');if(victimFire.smokePuffs<40)throw new Error('Persistent smoke density too low');if(late.impactSmokeParticles!==0||late.impactVolume.active!==0)throw new Error('Transient smoke survived its 1.5s lifetime');if(errors.length)throw new Error(errors.join('\n'));
 await writeFile(out+'/report.json',JSON.stringify({url,errors,hidden,contact,blast,atContact:d,after:late},null,2));console.log(JSON.stringify({errors,hidden,contact,approach:d.state.shots[0].approachFrom,visible:d.visibleShips,waterSpray:d.sinkingWater.spray,lateSmoke:late.impactSmokeParticles,fireEmitters:late.fireEmitters.length,calls:d.calls,triangles:d.triangles}));
}finally{await browser.close();}
