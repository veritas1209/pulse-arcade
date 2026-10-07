import type { ViewState } from './contract';
export interface RoomSession { code:string; token:string; player:number }
const SESSION_KEY='battleship-room';
function validSession(value:unknown):value is RoomSession {
 if(!value||typeof value!=='object')return false;
 const s=value as Partial<RoomSession>;
 return typeof s.code==='string'&&/^[A-Z2-9]{6}$/.test(s.code)&&typeof s.token==='string'&&s.token.length>0&&s.token.length<=100&&(s.player===0||s.player===1);
}
function remember(session?:RoomSession) {
 // Privacy settings can disable storage. The live room should still work.
 try{if(session)sessionStorage.setItem(SESSION_KEY,JSON.stringify(session));else sessionStorage.removeItem(SESSION_KEY);}catch{}
}
function cancelled(){return new DOMException('방 연결이 취소되었습니다.','AbortError');}
export class BattleConnection {
 private socket?: WebSocket;
 private reconnectTimer?: ReturnType<typeof setTimeout>;
 private request?: AbortController;
 private generation=0;
 private closed = true;
 private attempts = 0;
 session?: RoomSession;
 constructor(private onState:(state:ViewState)=>void,private onStatus:(status:string)=>void,private onError:(message:string)=>void) {}
 async enter(code?:string) {
  const roomCode=code?.trim().toUpperCase();
  if(code!==undefined&&!/^[A-Z2-9]{6}$/.test(roomCode!))throw new Error('6자리 방 코드를 입력하세요.');
  if(this.session)this.leave();else this.close();
  const generation=this.generation,controller=new AbortController();this.request=controller;
  const timeout=setTimeout(()=>controller.abort(),12000);this.onStatus('연결 중');
  try{
   const response=await fetch(roomCode?`/api/battleship/rooms/${encodeURIComponent(roomCode)}/join`:'/api/battleship/rooms',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',signal:controller.signal});
   let data:unknown;try{data=await response.json();}catch{throw new Error('멀티플레이 서버에 연결할 수 없습니다. 잠시 후 다시 시도하세요.');}
   if(generation!==this.generation||controller.signal.aborted)throw cancelled();
   if(!response.ok){const error=data as {error?:string;message?:string}|null;throw new Error(error?.error||error?.message||'연결할 수 없습니다.');}
   if(!validSession(data))throw new Error('방 입장 정보가 올바르지 않습니다. 다시 시도하세요.');
   this.session=data;remember(data);this.closed=false;this.attempts=0;this.connect();return data;
  }catch(error){
   if(generation!==this.generation)throw cancelled();
   this.onStatus('연결 실패');
   if(controller.signal.aborted)throw new Error('연결 시간이 초과되었습니다. 다시 시도하세요.');
   throw error;
  }finally{clearTimeout(timeout);if(this.request===controller)this.request=undefined;}
 }
 restore() {
  try{
   const raw=sessionStorage.getItem(SESSION_KEY);if(!raw)return false;
   const s:unknown=JSON.parse(raw);if(!validSession(s)){remember();return false;}
   this.close(false);this.session=s;this.closed=false;this.attempts=0;this.connect();return true;
  }catch{remember();return false;}
 }
 private connect() {
  if(this.closed||!this.session)return;
  this.onStatus('연결 중');
  const {code,token}=this.session;
  const socket=new WebSocket(`${location.protocol==='https:'?'wss':'ws'}://${location.host}/ws/battleship/${encodeURIComponent(code)}?token=${encodeURIComponent(token)}`);this.socket=socket;
  const current=()=>!this.closed&&this.socket===socket;
  socket.onopen=()=>{if(!current())return;this.attempts=0;this.onStatus('연결됨');};
  socket.onmessage=e=>{if(!current())return;try{const message=JSON.parse(e.data);if(message.type==='state')this.onState(message.state);else if(message.type==='error')this.onError(message.message);}catch{this.onError('통신 오류');}};
  socket.onerror=()=>{if(current())this.onStatus('연결 확인 중');};
  socket.onclose=e=>{if(!current())return;if([1008,4000,4001].includes(e.code)||this.attempts>=8){this.close();this.onStatus('연결 종료');this.onError(e.code===4001?'다른 창에서 이 방에 접속했습니다.':'방이 종료되었습니다. 새 방을 만들거나 다시 입장하세요.');return;}this.onStatus('재연결 중');this.reconnectTimer=setTimeout(()=>{this.attempts++;this.connect();},Math.min(8000,700*2**this.attempts));};
 }
 send(command:Record<string,unknown>) { if(this.socket?.readyState!==WebSocket.OPEN){this.onError('연결을 기다려 주세요.');return false;}this.socket.send(JSON.stringify(command));return true; }
 close(forget=true) { this.generation++;this.request?.abort();this.request=undefined;this.closed=true;clearTimeout(this.reconnectTimer);this.reconnectTimer=undefined;const socket=this.socket;this.socket=undefined;socket?.close();if(forget){remember();this.session=undefined;} }
 leave() { if(this.socket?.readyState===WebSocket.OPEN)this.send({type:'leave'});this.close(); }
}
