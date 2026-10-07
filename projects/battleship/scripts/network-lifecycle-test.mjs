import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import ts from 'typescript';
const source=await fs.readFile(new URL('../src/network.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const {BattleConnection}=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
const saved=new Map(),sockets=[];let requests=[],storageBlocked=false;
globalThis.location={protocol:'https:',host:'battle.example'};
globalThis.sessionStorage={getItem:k=>{if(storageBlocked)throw new Error('blocked');return saved.get(k)??null;},setItem:(k,v)=>{if(storageBlocked)throw new Error('blocked');saved.set(k,v);},removeItem:k=>{if(storageBlocked)throw new Error('blocked');saved.delete(k);}};
class Socket {static OPEN=1;readyState=0;constructor(url){this.url=url;sockets.push(this);}close(){this.readyState=3;}send(message){this.sent=message;}}
globalThis.WebSocket=Socket;
globalThis.fetch=(url,options)=>new Promise((resolve,reject)=>requests.push({url,options,resolve,reject}));
const host={code:'ABC234',token:'private-token',player:0},guest={code:'DEF567',token:'other-token',player:1};
const response=data=>({ok:true,json:async()=>data});
function setup(){requests=[];sockets.length=0;saved.clear();storageBlocked=false;const states=[],status=[],errors=[];return {connection:new BattleConnection(s=>states.push(s),s=>status.push(s),e=>errors.push(e)),states,status,errors};}
let count=0;async function check(name,test){await test();count++;console.log('PASS '+name);}
await check('empty join cannot create a room',async()=>{const {connection}=setup();const pending=connection.enter(' ');await assert.rejects(pending,/방 코드/);assert.equal(requests.length,0);connection.close();});
await check('reset cancels pending room even if fetch ignores abort',async()=>{const {connection}=setup();const pending=connection.enter();const rejected=assert.rejects(pending,{name:'AbortError'});connection.close();requests[0].resolve(response(host));await rejected;assert.equal(connection.session,undefined);assert.equal(sockets.length,0);assert.equal(saved.size,0);});
await check('latest entry wins and stale HTTP cannot replace it',async()=>{const {connection}=setup();const old=connection.enter();const rejected=assert.rejects(old,{name:'AbortError'});const latest=connection.enter(' def567 ');requests[1].resolve(response(guest));assert.deepEqual(await latest,guest);requests[0].resolve(response(host));await rejected;assert.deepEqual(connection.session,guest);assert.equal(sockets.length,1);assert.equal(requests[1].url,'/api/battleship/rooms/DEF567/join');connection.close();});
await check('blocked session storage does not prevent multiplayer',async()=>{const {connection}=setup();storageBlocked=true;const pending=connection.enter();requests[0].resolve(response(host));assert.deepEqual(await pending,host);assert.equal(sockets.length,1);connection.close();});
await check('old socket events cannot update the current room',async()=>{const {connection,states,status,errors}=setup();let pending=connection.enter();requests[0].resolve(response(host));await pending;const old=sockets[0];pending=connection.enter('DEF567');requests[1].resolve(response(guest));await pending;status.length=0;old.onopen?.();old.onmessage?.({data:JSON.stringify({type:'state',state:{revision:99}})});old.onerror?.();old.onclose?.({code:4001});assert.equal(states.length,0);assert.equal(errors.length,0);assert.equal(status.length,0);assert.deepEqual(connection.session,guest);connection.close();});
await check('expired or malformed saved session is rejected',async()=>{const {connection}=setup();saved.set('battleship-room',JSON.stringify({code:'ABC234',token:'token',player:2}));assert.equal(connection.restore(),false);assert.equal(sockets.length,0);assert.equal(saved.size,0);connection.close();});
await check('proxy HTML errors produce a useful connection message',async()=>{const {connection}=setup();const pending=connection.enter();requests[0].resolve({ok:false,status:502,json:async()=>{throw new SyntaxError('Unexpected <');}});await assert.rejects(pending,/연결|서버/);assert.equal(connection.session,undefined);connection.close();});
console.log(JSON.stringify({ok:true,checks:count}));
