/* Shared invitation rooms. This file is copied into each standalone game. */
(function(root){
 'use strict';
 const TITLE={gomoku:'오목',janggi:'장기',chess:'체스'},SIDES={gomoku:['흑','백'],janggi:['초','한'],chess:['백','흑']};
 class PulseOnlineRoom{
  constructor(options){
   this.options=options;this.gameId=options.gameId;this.seat=0;this.ticket=null;this.room=null;this.state=null;this.ws=null;this.connected=false;this.pending=null;this.opening=null;this.retry=null;this.deadline=0;this.offset=0;this.grace=30;this.lastSnapshot='';this.savedKey='pulse-board-room:'+this.gameId;
   this.online=/^https?:$/.test(location.protocol);this.build(options.mount);
   this.clock=setInterval(()=>this.renderStatus(),250);this.pinger=setInterval(()=>{if(this.connected)this.send({type:'ping',stamp:performance.now()});},10000);
   if(this.online){let saved;try{saved=JSON.parse(sessionStorage.getItem(this.savedKey)||'null');}catch(_){}
    if(saved?.ticket){this.ticket=saved.ticket;this.seat=saved.seat;this.code=saved.code;this.restore=true;this.resume();}
   }
  }
  get active(){return Boolean(this.ticket);}
  get phase(){return this.room?.phase||'waiting';}
  get canAct(){return this.active&&this.connected&&this.phase==='playing'&&this.state?.turn===this.seat&&!this.pending&&this.room.players.every(p=>p?.connected);}
  build(mount){
   this.mount=mount||document.body.appendChild(document.createElement('div'));this.mount.classList.add('pulse-online-mount');
   this.launch=document.createElement(this.online?'button':'a');this.launch.className='pulse-online-launch';this.launch.textContent=this.online?'친구와 온라인 대국 ↗':'사이트에서 온라인 대국 ↗';
   if(this.online){this.launch.type='button';this.launch.addEventListener('click',()=>this.open());}else{this.launch.href='https://hajin-desktop.tailfb939b.ts.net:10000/games/'+this.gameId+'/';this.launch.target='_blank';this.launch.rel='noopener';}
   this.badge=document.createElement('span');this.badge.className='pulse-online-badge';this.mount.append(this.launch,this.badge);
   this.dialog=document.createElement('dialog');this.dialog.className='pulse-online-dialog';this.dialog.setAttribute('aria-label',TITLE[this.gameId]+' 온라인 대국');
   this.dialog.innerHTML='<div class="pulse-online-heading"><div><span>PULSE / INVITE A RIVAL</span><h2>친구와 한 판</h2></div><button type="button" data-close aria-label="온라인 대국 창 닫기">×</button></div><section data-lobby><p class="pulse-online-copy">방을 만들고 초대 링크를 친구에게 보내세요.</p><form><label>플레이어 이름<input data-name autocomplete="nickname" minlength="2" maxlength="16" placeholder="당신의 이름" required></label><button type="button" data-create class="pulse-online-primary">새 대국 방 만들기 ↗</button><label>초대받은 6자리 방 코드<div class="pulse-online-join"><input data-code autocomplete="off" maxlength="6" placeholder="ABC234" aria-label="6자리 방 코드"><button type="submit">입장 ↗</button></div></label></form></section><section data-room hidden><div class="pulse-online-roomcode"><div><small>PRIVATE ROOM</small><strong data-roomcode>------</strong></div><button data-copy type="button">초대 링크 복사 ↗</button></div><div data-seats class="pulse-online-seats"></div><div class="pulse-online-round"><span data-status role="status"></span><b data-ping>— ms</b></div><button type="button" data-ready class="pulse-online-primary">준비 완료 ↗</button><div data-draw-offer class="pulse-online-draw" hidden><span>상대가 무승부를 제안했습니다.</span><button type="button" data-accept>수락</button><button type="button" data-decline>계속 대국</button></div><div class="pulse-online-actions"><button type="button" data-draw>무승부 제안</button><button type="button" data-resign>기권</button><button type="button" data-leave>방 나가기 ↗</button></div><p class="pulse-online-hint">두 사람이 준비하면 시작합니다. 끊긴 연결은 30초 동안 복구할 수 있습니다.</p></section><p data-message class="pulse-online-message" role="status"></p>';
   document.body.append(this.dialog);this.el=selector=>this.dialog.querySelector(selector);
   this.el('[data-close]').onclick=()=>this.dialog.close();this.el('[data-create]').onclick=()=>this.enter('create');this.el('form').onsubmit=event=>{event.preventDefault();this.enter('join');};
   const code=new URLSearchParams(location.search).get('room');this.el('[data-code]').value=(code||'').slice(0,6).toUpperCase();
   try{this.el('[data-name]').value=localStorage.getItem('pulse-name')||'';}catch(_){}
   this.el('[data-ready]').onclick=()=>{let values={};try{values=this.options.getOptions?.()||{};}catch(_){}this.send({type:'ready',ready:!this.room.players[this.seat]?.ready,options:values});};
   this.el('[data-copy]').onclick=async()=>{const url=location.origin+location.pathname+'?room='+this.code;try{await navigator.clipboard.writeText(url);this.message('초대 링크를 복사했습니다.');}catch(_){this.message('초대 주소: '+url);}};
   this.el('[data-leave]').onclick=()=>this.leave();this.el('[data-resign]').onclick=()=>{if(confirm('이번 대국을 기권할까요?'))this.send({type:'resign'});};
   this.el('[data-draw]').onclick=()=>this.send({type:'offer_draw'});this.el('[data-accept]').onclick=()=>this.send({type:'accept_draw'});this.el('[data-decline]').onclick=()=>this.send({type:'decline_draw'});
   if(this.online&&(code||new URLSearchParams(location.search).get('online')==='1'))setTimeout(()=>this.open(),100);
  }
  open(){if(!this.online){root.open('https://hajin-desktop.tailfb939b.ts.net:10000/games/'+this.gameId+'/','_blank','noopener');return;}this.render();if(!this.dialog.open)this.dialog.showModal();}
  message(text,error=false){this.el('[data-message]').textContent=text;this.el('[data-message]').classList.toggle('is-error',error);}
  busy(value){this.el('[data-create]').disabled=value;this.el('button[type=submit]').disabled=value;}
  send(data){if(this.ws?.readyState===WebSocket.OPEN&&this.ws.bufferedAmount<65536){this.ws.send(JSON.stringify(data));return true;}return false;}
  connect(){
   if(this.ws?.readyState===WebSocket.OPEN)return Promise.resolve();if(this.opening)return this.opening;
   this.opening=new Promise((resolve,reject)=>{
    const socket=new WebSocket(location.origin.replace(/^http/,'ws')+'/api/board/'+this.gameId+'/ws');this.ws=socket;
    const timeout=setTimeout(()=>{socket.close();reject(Error('서버 연결이 지연되고 있습니다.'));},8000);
    socket.onopen=()=>{clearTimeout(timeout);this.connected=true;this.send({type:'ping',stamp:performance.now()});this.render();resolve();};
    socket.onerror=()=>{clearTimeout(timeout);reject(Error('온라인 서버에 연결할 수 없습니다.'));};
    socket.onmessage=event=>this.receive(JSON.parse(event.data));
    socket.onclose=()=>{clearTimeout(timeout);reject(Error('연결이 끊겼습니다.'));if(this.ws!==socket)return;this.connected=false;this.busy(false);this.render();
     if(this.active){if(!this.deadline)this.deadline=Date.now()+this.grace*1000;this.message('연결을 복구하고 있습니다. 대국 상태는 서버에 보관됩니다.');this.schedule();}
    };
   }).finally(()=>{this.opening=null;});return this.opening;
  }
  schedule(){clearTimeout(this.retry);this.retry=setTimeout(()=>this.resume(),900);}
  async resume(){
   if(!this.ticket)return;if(this.deadline&&Date.now()>this.deadline){this.message('복구 시간이 지났습니다. 방을 나가 다시 입장해 주세요.',true);return;}
   try{await this.connect();this.send({type:'resume',ticket:this.ticket});}catch(_){this.schedule();}
  }
  async enter(type){
   if(!this.el('[data-name]').reportValidity())return;const name=this.el('[data-name]').value.trim(),code=this.el('[data-code]').value.trim().toUpperCase();
   if(type==='join'&&!/^[A-Z2-9]{6}$/.test(code)){this.message('6자리 초대 코드를 입력해 주세요.',true);return;}
   this.busy(true);this.message('연결 중…');try{await this.connect();try{localStorage.setItem('pulse-name',name);}catch(_){}this.send({type,name,code});}catch(error){this.message(error.message,true);this.busy(false);}
  }
  receive(data){
   if(data.type==='hello'){this.offset=data.server_ms-Date.now();this.grace=data.grace||30;return;}
   if(data.type==='pong'){const rtt=performance.now()-data.stamp;this.offset=data.server_ms-(Date.now()-rtt/2);this.el('[data-ping]').textContent=Math.round(rtt)+' ms';return;}
   if(data.type==='error'){
    this.busy(false);this.pending=null;this.message(data.message,true);
    if(data.code==='expired'){this.reset();this.message(data.message,true);}
    else if(this.restore&&this.ticket){this.restore=false;setTimeout(()=>this.send({type:'resume',ticket:this.ticket}),1000);}
    this.render();return;
   }
   if(data.type==='joined'){
    const wasActive=this.active;this.ticket=data.ticket;this.code=data.code;this.seat=data.seat;this.connected=true;this.deadline=0;clearTimeout(this.retry);this.restore=false;this.busy(false);
    try{sessionStorage.setItem(this.savedKey,JSON.stringify({ticket:this.ticket,code:this.code,seat:this.seat}));}catch(_){}
    history.replaceState(null,'','?room='+this.code);if(!wasActive||!this.notifiedOnline){this.notifiedOnline=true;this.options.onMode?.('online');}
    this.message(data.resumed?'대국 연결을 복구했습니다.':'친구를 초대하고 준비해 주세요.');this.render();return;
   }
   if(data.type==='room'){this.room=data;this.render();return;}
   if(data.type==='snapshot'){
    if(this.room?.round===data.round&&data.revision<(this.room?.revision||0))return;
    const newRound=this.room?.round!==data.round,oldPhase=this.room?.phase;this.room=data;this.state=data.state;
    if(newRound||data.phase==='finished'||data.ack===this.pending?.request_id)this.pending=null;
    const signature=[data.round,data.revision,data.phase,data.winner,data.reason].join('|');
    if(this.state&&signature!==this.lastSnapshot){this.lastSnapshot=signature;this.options.onState?.(JSON.parse(JSON.stringify(this.state)),this.meta());}
    if(['countdown','playing'].includes(data.phase)&&this.dialog.open)this.dialog.close();
    if(data.phase==='finished'&&oldPhase!=='finished')this.message(data.winner===null?'무승부입니다.':data.winner===this.seat?'승리했습니다! 준비하면 재대국합니다.':'이번 판은 패배했습니다. 한 판 더 도전해 보세요.');
    if(this.pending&&data.phase==='playing')this.send(this.pending);this.render();return;
   }
   if(data.type==='left'||data.type==='expired'){this.reset();this.message(data.message||'방을 나왔습니다. 컴퓨터 대국을 시작할 수 있어요.');}
  }
  meta(){return {seat:this.seat,phase:this.phase,status:this.phase==='finished'?'finished':'playing',winner:this.room?.winner??null,reason:this.room?.reason||'',round:this.room?.round||'',revision:this.room?.revision||0,players:this.room?.players||[],connected:this.connected,pending:Boolean(this.pending)};}
  submit(action){if(!this.canAct)return false;const id=root.crypto?.randomUUID?.()||Date.now().toString(36)+Math.random().toString(36).slice(2);this.pending={type:'action',request_id:id,action,round:this.room.round,revision:this.room.revision};if(!this.send(this.pending)){this.pending=null;return false;}this.render();return true;}
  leave(){if(this.active&&['playing','countdown'].includes(this.phase)&&!confirm('방을 나가면 이번 대국은 패배합니다. 나갈까요?'))return;if(!this.send({type:'leave'}))this.reset();}
  reset(){this.ticket=null;this.room=null;this.state=null;this.pending=null;this.deadline=0;this.restore=false;this.lastSnapshot='';clearTimeout(this.retry);try{sessionStorage.removeItem(this.savedKey);}catch(_){}history.replaceState(null,'',location.pathname);this.notifiedOnline=false;this.options.onMode?.('local');this.render();}
  renderStatus(){
   if(!this.active){this.badge.textContent='';return;}
   let text='친구를 기다리는 중';
   if(!this.connected)text='재연결 중';
   else if(this.phase==='countdown')text=Math.max(1,Math.ceil((this.room.start_at-Date.now()-this.offset)/1000))+'초 뒤 시작';
   else if(this.phase==='playing')text=this.room.players.some(p=>!p?.connected)?'상대 재연결 대기':this.pending?'착수 확인 중':this.state?.turn===this.seat?'내 차례':'상대 차례';
   else if(this.phase==='finished')text=this.room.winner===null?'무승부':this.room.winner===this.seat?'승리 · 재대국 가능':'패배 · 재대국 가능';
   else if(this.room?.players[this.seat]?.ready)text='준비 완료 · 상대 대기';
   this.badge.textContent=text;this.el('[data-status]').textContent=text;this.badge.dataset.active=this.canAct?'true':'false';
  }
  render(){
   this.launch.textContent=this.active?'대국 방 '+(this.code||'')+' ↗':'친구와 온라인 대국 ↗';this.el('[data-lobby]').hidden=this.active;this.el('[data-room]').hidden=!this.active;
   if(this.active){
    this.el('[data-roomcode]').textContent=this.code||'------';const seats=this.el('[data-seats]');seats.replaceChildren();
    for(let i=0;i<2;i++){const p=this.room?.players[i],box=document.createElement('div'),side=document.createElement('small'),name=document.createElement('b'),status=document.createElement('span');side.textContent=SIDES[this.gameId][i]+(i===this.seat?' · 나':' · 상대');name.textContent=p?.name||'초대 대기';status.textContent=p?(p.connected?(p.ready?'준비 완료':'접속 중'):'재연결 대기'):'링크를 공유하세요';box.append(side,name,status);seats.append(box);}
    const playable=['playing','countdown'].includes(this.phase);this.el('[data-ready]').hidden=playable;this.el('[data-ready]').disabled=!this.connected;this.el('[data-ready]').textContent=this.room?.players[this.seat]?.ready?'준비 취소':this.phase==='finished'?'한 판 더 · 준비':'준비 완료 ↗';
    this.el('[data-resign]').hidden=!playable;this.el('[data-draw]').hidden=this.phase!=='playing';this.el('[data-draw]').disabled=this.room?.draw_offer===this.seat;this.el('[data-draw-offer]').hidden=!(this.phase==='playing'&&this.room.draw_offer===1-this.seat);
   }
   this.renderStatus();
  }
 }
 root.PulseOnlineRoom=PulseOnlineRoom;
})(window);
