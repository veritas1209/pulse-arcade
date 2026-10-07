import {chromium} from '@playwright/test';
import fs from 'node:fs/promises';
import {PNG} from 'pngjs';
const browser=await chromium.launch({channel:'chrome'}),page=await browser.newPage({viewport:{width:1440,height:900}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const out='C:/Users/hajin/IT_Projects/screw-harbor/artifacts/public-camera';await fs.mkdir(out,{recursive:true});
function diff(a,b){const x=PNG.sync.read(a),y=PNG.sync.read(b);let changed=0;for(let i=0;i<x.data.length;i+=16)if(Math.abs(x.data[i]-y.data[i])+Math.abs(x.data[i+1]-y.data[i+1])+Math.abs(x.data[i+2]-y.data[i+2])>25)changed++;return changed;}
try{
 await page.goto('https://222.96.173.194/games/screw-harbor/');await page.waitForTimeout(1600);
 const canvas=page.locator('canvas').first(),box=await canvas.boundingBox();
 const before=await canvas.screenshot();
 await page.mouse.move(box.x+box.width*.5,box.y+box.height*.5);await page.mouse.wheel(0,-600);await page.waitForTimeout(900);
 const zoom=await canvas.screenshot();if(diff(before,zoom)<1000)throw new Error('Zoom did not change scene');
 await page.mouse.move(box.x+box.width*.5,box.y+box.height*.5);await page.mouse.down({button:'right'});await page.mouse.move(box.x+box.width*.6,box.y+box.height*.52,{steps:10});await page.mouse.up({button:'right'});await page.waitForTimeout(600);
 const pan=await canvas.screenshot();if(diff(zoom,pan)<1000)throw new Error('Pan did not change scene');
 await page.screenshot({path:out+'/camera.png'});
 if(errors.length)throw new Error(errors.join('\n'));
 await fs.writeFile(out+'/qa.json',JSON.stringify({zoomChanged:diff(before,zoom),panChanged:diff(zoom,pan),errors},null,2));console.log('Public Screw camera: wheel zoom, right-drag pan, zero errors PASS');
}finally{await browser.close();}

