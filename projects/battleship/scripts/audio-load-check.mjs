import {chromium} from '@playwright/test';
const b=await chromium.launch({channel:'chrome'}),p=await b.newPage();
p.on('requestfailed',r=>console.log('FAIL',r.url(),r.failure()));
await p.goto('http://127.0.0.1:5195');await p.waitForFunction(()=>window.__THREE_GAME_TEST_HOOKS__);
await p.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__.setState('damage'));await p.locator('[data-ship="0-destroyer-1"]').click();
for(let i=0;i<3;i++){await p.waitForTimeout(10000);console.log(JSON.stringify(await p.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__.getState().audio)));}
await b.close();
