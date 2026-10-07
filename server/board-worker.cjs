'use strict';
const readline=require('node:readline'),path=require('node:path');
const root=path.resolve(process.argv[2]);
const allowed=new Set(['gomoku','janggi','chess']),cache=new Map();
function rules(id){if(!allowed.has(id))throw Error('지원하지 않는 게임입니다.');if(!cache.has(id))cache.set(id,require(path.join(root,'games',id,'network-rules.cjs')));return cache.get(id);}
function checkState(state){if(!state||typeof state!=='object'||Array.isArray(state)||![0,1].includes(state.turn))throw Error('규칙 엔진 상태가 올바르지 않습니다.');}
const input=readline.createInterface({input:process.stdin,crlfDelay:Infinity});
input.on('line',line=>{
 let request;
 try{
  if(Buffer.byteLength(line)>1048576)throw Error('대국 상태가 너무 큽니다.');
  request=JSON.parse(line);
  let value;
  if(request.op==='ping')value={ok:true};
  else if(request.op==='create'){const state=rules(request.game).create(request.options||{});checkState(state);value={state,status:'playing',winner:null};}
  else if(request.op==='apply'){
   if(![0,1].includes(request.seat))throw Error('잘못된 플레이어입니다.');
   checkState(request.state);
   value=rules(request.game).apply(request.state,request.action,request.seat);
   checkState(value?.state);
   if(!['playing','finished'].includes(value.status)||![null,0,1].includes(value.winner))throw Error('규칙 판정 결과가 올바르지 않습니다.');
  }else throw Error('알 수 없는 규칙 요청입니다.');
  process.stdout.write(JSON.stringify({id:request.id,ok:true,value})+'\n');
 }catch(error){process.stdout.write(JSON.stringify({id:request?.id,ok:false,error:String(error.message||error).slice(0,180)})+'\n');}
});
