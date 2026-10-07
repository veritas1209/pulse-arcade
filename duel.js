(() => {
 'use strict';
 const $=id=>document.getElementById(id),colors={I:'#69d6da',J:'#709bea',L:'#f2ac67',O:'#ead66c',S:'#a9d786',T:'#b396da',Z:'#e88286',G:'#617c91'};
 let game=new TetrisEngine(),ws=null,connecting=null,ticket=null,room=null,seat=0,round='',phase='lobby',startAt=0,clockOffset=0,bestRTT=Infinity;
 let seq=0,ack=0,committed=[],pending=0,outbound=new Map(),topoutSent=false,opponent=null,oldOpponent=null,opponentAt=0;
 let previous=0,lastState=0,hitstop=0,repeat=null,repeatAt=0,noticeTimer=null,retryTimer=null,reconnectUntil=0,roundResult=null,uiKey='';
 const ctx=$('board').getContext('2d'),rivalCtx=$('opponent-board').getContext('2d');
 const effects=new PulseEffects(ctx,$('my-shell')),audio=new PulseAudio(),stage=new PulseStage($('ambience'),$('screen-fx'),$('my-shell'));
 const music=new PulseMusic(audio,power=>stage.beat(power));
 const query=new URLSearchParams(location.search);$('room-code').value=(query.get('room')||'').slice(0,6).toUpperCase();
 try{$('duel-name').value=localStorage.getItem('pulse-name')||'';}catch(_){}
 for(let i=0;i<12;i++)$('garbage-meter').append(document.createElement('i'));
 const pad=n=>String(n).padStart(2,'0'),score=n=>String(n).padStart(6,'0');
 function send(data){if(ws?.readyState===WebSocket.OPEN&&ws.bufferedAmount<65536){ws.send(JSON.stringify(data));return true;}return false;}
 function lobbyMessage(message,error=false){$('lobby-message').textContent=message;$('lobby-message').classList.toggle('error',error);}
 function busy(value){$('create-room').disabled=value;$('join-room').disabled=value;}
 function stopInput(){repeat=null;}
 function setPhase(value){phase=value;document.body.dataset.mode=value;stopInput();music.sync(value==='playing');$('surrender').hidden=!['playing','countdown','awaiting'].includes(value);}
 function announce(text){clearTimeout(noticeTimer);$('board-notice').textContent=text;$('board-notice').classList.remove('show');void $('board-notice').offsetWidth;$('board-notice').classList.add('show');noticeTimer=setTimeout(()=>$('board-notice').classList.remove('show'),900);}
 function overlay(title,note,tag='WAITING FOR TWO',kind=''){$('field-overlay').hidden=false;$('field-overlay').className='field-overlay '+kind;$('round-title').textContent=title;$('round-note').textContent=note;$('round-tag').textContent=tag;}
 function updateRoom(){
  if(!room)return;const me=room.players[seat],rival=room.players[1-seat];
  $('my-name').textContent=me?.name||'YOU';$('opponent-name').textContent=rival?.name||'CHALLENGER';$('my-wins').textContent=pad(room.wins[seat]);$('their-wins').textContent=pad(room.wins[1-seat]);
  $('opponent-wait').hidden=Boolean(opponent)||phase==='playing'||phase==='countdown';
  if(rival&&!opponent){$('opponent-wait').querySelector('b').textContent=rival.ready?'✓':'VS';$('opponent-wait').querySelector('span').textContent=rival.ready?'READY TO DUEL':'CHALLENGER CONNECTED';}
  if(!rival){$('opponent-wait').querySelector('b').textContent='?';$('opponent-wait').querySelector('span').textContent='CHALLENGER WANTED';}
  if(['waiting','finished'].includes(phase)){
   $('ready').hidden=false;$('ready').disabled=false;$('ready').textContent=me?.ready?'준비 취소':phase==='finished'?'한 판 더 · 준비':'준비 완료 ↗';
   if(phase==='waiting')overlay(rival?'승부를 시작할까요?':'친구를 기다리는 중',rival?'둘 다 준비하면 3초 뒤 시작합니다.':'상단의 초대 링크를 친구에게 보내세요.');
   $('match-message').textContent=me?.ready?(rival?.ready?'곧 시작합니다.':'준비 완료 · 상대를 기다립니다.'):'두 플레이어가 준비하면 시작합니다.';
  }
  if(phase==='finished'&&roundResult)$('match-message').textContent=rival?'이번 라운드 완료 · 둘 다 준비하면 다시 대전합니다.':'상대가 방을 나갔습니다. 새 친구를 초대할 수 있어요.';
  if(['playing','countdown','awaiting'].includes(phase)){
   if(rival&&!rival.connected)$('match-message').textContent='상대 연결이 끊겼습니다. 10초 동안 복구를 기다립니다.';
   else if(rival?.away)$('match-message').textContent='상대가 다른 탭으로 이동했습니다. 10초가 지나면 승리합니다.';
   else $('match-message').textContent='줄을 지워 공격하세요. 대기 중인 공격은 내 공격으로 상쇄됩니다.';
  }
 }
 async function connect(){
  if(ws?.readyState===WebSocket.OPEN)return;
  if(connecting)return connecting;
  connecting=new Promise((resolve,reject)=>{
   const socket=new WebSocket(location.origin.replace(/^http/,'ws')+'/api/games/tetris/duel');ws=socket;
   const timeout=setTimeout(()=>{socket.close();reject(new Error('서버 연결이 지연되고 있습니다.'));},8000);
   socket.onopen=()=>{clearTimeout(timeout);bestRTT=Infinity;$('connection').textContent='LIVE';$('net-dot').classList.remove('bad');send({type:'ping',stamp:performance.now()});resolve();};
   socket.onerror=()=>{clearTimeout(timeout);reject(new Error('대전 서버에 연결할 수 없습니다.'));};
   socket.onmessage=event=>{try{receive(JSON.parse(event.data));}catch(error){console.error('Versus message failed',error);}};
   socket.onclose=()=>{clearTimeout(timeout);reject(new Error('연결이 종료되었습니다.'));if(ws!==socket)return;$('connection').textContent='OFFLINE';$('net-dot').classList.add('bad');
    if(ticket){if(phase!=='reconnecting')reconnectUntil=Date.now()+9000;setPhase('reconnecting');overlay('다시 연결하는 중','잠시만 기다려 주세요. 10초 안에 복구합니다.','RECONNECTING');$('ready').hidden=true;scheduleReconnect();}
    else busy(false);
   };
  }).finally(()=>{connecting=null;});
  return connecting;
 }
 function scheduleReconnect(){
  clearTimeout(retryTimer);retryTimer=setTimeout(async()=>{
   if(!ticket)return;
   if(Date.now()>reconnectUntil){setPhase('offline');overlay('연결이 종료됐어요','방에서 나간 뒤 다시 입장해 주세요.','CONNECTION LOST');return;}
   try{await connect();send({type:'resume',ticket,ack});}catch(_){scheduleReconnect();}
  },750);
 }
 function initializeRound(data){
  if(round!==data.round){game=new TetrisEngine(seededRandom(data.seed));round=data.round;seq=ack=0;committed=[];pending=0;outbound.clear();opponent=oldOpponent=null;topoutSent=false;roundResult=null;uiKey='';$('sent').textContent='0';effects.reset();stage.reset();hitstop=0;}
  startAt=data.start_at;setPhase('countdown');$('ready').hidden=true;$('opponent-wait').hidden=true;overlay('3','같은 블록, 같은 출발선.','GET READY','countdown');requestAnimationFrame(()=>stage.measure());
 }
 function receive(data){
  if(data.type==='hello'){if(bestRTT===Infinity)clockOffset=data.server_ms-Date.now();return;}
  if(data.type==='pong'){const rtt=performance.now()-data.stamp;$('ping').textContent=Math.round(rtt)+' ms';if(rtt<bestRTT){bestRTT=rtt;clockOffset=data.server_ms-(Date.now()-rtt/2);}return;}
  if(data.type==='error'){busy(false);lobbyMessage(data.message,true);$('match-message').textContent=data.message;
   if(phase==='reconnecting'){clearTimeout(retryTimer);setPhase('offline');overlay('방 연결이 종료됐어요',data.message,'CONNECTION CLOSED');}return;}
  if(data.type==='joined'){
   busy(false);ticket=data.ticket;seat=data.seat;$('room-label').textContent=data.code;history.replaceState(null,'','?room='+data.code);$('lobby').hidden=true;$('match').hidden=false;setPhase('waiting');
   $('connection').textContent='LIVE';$('net-dot').classList.remove('bad');send({type:'focus',hidden:document.hidden});requestAnimationFrame(()=>stage.measure());return;
  }
  if(data.type==='room'){room=data;if(data.phase==='waiting'&&phase!=='reconnecting'){if(!roundResult)setPhase('waiting');if(!data.players[1-seat]){opponent=null;oldOpponent=null;}}updateRoom();return;}
  if(data.type==='start'){initializeRound(data);return;}
  if(data.type==='resumed'){
   clearTimeout(retryTimer);pending=data.pending;$('connection').textContent='LIVE';$('net-dot').classList.remove('bad');
   if(data.round&&round!==data.round)initializeRound(data);
   if(data.phase==='playing'){setPhase(game.over?'awaiting':'playing');$('field-overlay').hidden=!game.over;}
   else if(data.phase==='countdown'){setPhase('countdown');startAt=data.start_at;}
   else setPhase(data.phase);
   send({type:'focus',hidden:document.hidden});for(const event of outbound.values())send(event);if(game.over&&data.phase==='playing'){topoutSent=false;reportTopout();}updateRoom();return;
  }
  if(data.type==='left'||data.type==='expired'){exitRoom();if(data.message)lobbyMessage(data.message);return;}
  if(data.round!==round)return;
  if(data.type==='opponent'){oldOpponent=opponent;opponent=data;opponentAt=performance.now();return;}
  if(data.type==='incoming'){pending=data.pending;announce('INCOMING +'+data.lines);stage.beat(.55);flash();return;}
  if(data.type==='settle'){
   if(data.seq<=ack)return;ack=data.seq;outbound.delete(data.seq);committed.push(...data.holes);pending=data.pending;$('sent').textContent=data.sent;
   if(data.cancelled)announce('COUNTER −'+data.cancelled);
   if(data.attack){announce('ATTACK +'+data.attack);const field=document.querySelector('.opponent');field.classList.remove('incoming-hit');void field.offsetWidth;field.classList.add('incoming-hit');const r=$('opponent-board').getBoundingClientRect();stage.emit(r.left+r.width/2,r.top+r.height*.6,'#ff93b8',35,1.2);}
   updateMeter();return;
  }
  if(data.type==='result'){
   roundResult=data;setPhase('finished');outbound.clear();committed=[];pending=0;room.wins=data.wins;const won=data.winner===seat,draw=data.winner===null;
   overlay(draw?'DRAW':won?'VICTORY':'NEXT TIME',draw?'팽팽한 승부였습니다. 한 판 더 갈까요?':won?'상대의 보드를 넘어섰습니다.':'이번엔 상대가 한 수 앞섰네요. 다시 붙어볼까요?',draw?'EVENLY MATCHED':won?'THIS ROUND IS YOURS':'THE NEXT ROUND IS WAITING',draw?'':won?'winner':'loser');
   stage.title(draw?'DRAW':won?'VICTORY':'GOOD GAME',won?'YOU OWN THIS ROUND':'ONE MORE ROUND?');audio.play(won?'start':'over');if(won){stage.emit(stage.cx,stage.cy,'#ddff86',150,1.7);effects.shake(10);}
   updateRoom();const reasons={disconnect:'연결 복구 시간이 지났습니다.',away:'10초 넘게 다른 탭으로 이동했습니다.',surrender:'기권으로 승부가 결정되었습니다.',leave:'상대가 방을 나갔습니다.',time_limit:'10분이 지나 무승부입니다.',topout:'게임판이 가득 차 승부가 결정되었습니다.'};$('match-message').textContent=reasons[data.reason]||'라운드가 끝났습니다.';return;
  }
 }
 function updateMeter(){const total=pending+committed.length;$('pending-count').textContent=total;document.querySelectorAll('#garbage-meter i').forEach((el,i)=>el.classList.toggle('lit',i<total));}
 function exitRoom(){ticket=null;room=null;round='';clearTimeout(retryTimer);outbound.clear();committed=[];pending=0;roundResult=null;opponent=null;game=new TetrisEngine();effects.reset();stage.reset();setPhase('lobby');$('match').hidden=true;$('lobby').hidden=false;history.replaceState(null,'',location.pathname);busy(false);requestAnimationFrame(()=>stage.measure());}
 async function enter(type){
  if(!$('duel-name').reportValidity())return;const code=$('room-code').value.trim().toUpperCase();if(type==='join'&&!/^[A-Z2-9]{6}$/.test(code)){lobbyMessage('초대받은 6자리 방 코드를 입력해 주세요.',true);return;}
  audio.init();busy(true);lobbyMessage('대전 서버에 연결하고 있습니다…');try{await connect();const name=$('duel-name').value.trim();try{localStorage.setItem('pulse-name',name);}catch(_){}send({type,name,code});}catch(error){busy(false);lobbyMessage(error.message,true);}
 }
 $('create-room').addEventListener('click',()=>enter('create'));$('join-form').addEventListener('submit',event=>{event.preventDefault();enter('join');});
 $('ready').addEventListener('click',()=>{audio.init();send({type:'ready',ready:!room?.players[seat]?.ready});$('ready').blur();});
 $('copy-invite').addEventListener('click',async()=>{$('copy-invite').blur();const url=location.origin+location.pathname+'?room='+room.code;try{await navigator.clipboard.writeText(url);$('match-message').textContent='초대 링크를 복사했습니다. 친구에게 보내세요.';}catch(_){$('match-message').textContent='초대 주소: '+url;}});
 $('leave-room').addEventListener('click',()=>{if(['playing','countdown','awaiting'].includes(phase)&&!window.confirm('방을 나가면 이번 판은 패배합니다. 나갈까요?'))return;if(!send({type:'leave'}))exitRoom();});
 $('surrender').addEventListener('click',()=>{if(window.confirm('이번 판을 기권할까요?'))send({type:'surrender',round});$('surrender').blur();});
 function flash(){const el=$('attack-flash');el.classList.remove('hit');void el.offsetWidth;el.classList.add('hit');}
 function block(c,x,y,size,type,ghost=false){const color=colors[type]||colors.G,gap=size*.05;c.fillStyle=ghost?color+'10':color;c.fillRect(x+gap,y+gap,size-2*gap,size-2*gap);c.strokeStyle=ghost?color+'66':'#ffffff30';c.lineWidth=1;c.strokeRect(x+gap+.5,y+gap+.5,size-2*gap-1,size-2*gap-1);if(!ghost){c.fillStyle='#ffffff28';c.fillRect(x+gap+2,y+gap+2,size-2*gap-4,size*.09);c.fillStyle='#00000035';c.fillRect(x+gap+2,y+size-gap-size*.12,size-2*gap-4,size*.08);}}
 function drawPiece(c,p,y=p.y,ghost=false,x=p.x){p.matrix.forEach((row,py)=>row.forEach((cell,px)=>{if(cell&&y+py>=0)block(c,(x+px)*60,(y+py)*60,60,p.type,ghost);}));}
 function grid(c){c.fillStyle='#0b141e';c.fillRect(0,0,600,1200);c.strokeStyle='#25384877';c.lineWidth=1;c.beginPath();for(let x=60;x<600;x+=60){c.moveTo(x,0);c.lineTo(x,1200);}for(let y=60;y<1200;y+=60){c.moveTo(0,y);c.lineTo(600,y);}c.stroke();}
 function preview(c,type,centerY,size){if(!type)return;const cells=[];SHAPES[type].forEach((row,y)=>row.forEach((v,x)=>{if(v)cells.push([x,y]);}));const xs=cells.map(p=>p[0]),ys=cells.map(p=>p[1]),minX=Math.min(...xs),minY=Math.min(...ys),w=(Math.max(...xs)-minX+1)*size,h=(Math.max(...ys)-minY+1)*size;cells.forEach(([x,y])=>block(c,(160-w)/2+(x-minX)*size,centerY-h/2+(y-minY)*size,size,type));}
 function render(now){
  grid(ctx);game.board.forEach((row,y)=>row.forEach((type,x)=>{if(type)block(ctx,x*60,y*60,60,type);}));if(['playing','countdown','reconnecting'].includes(phase)&&!game.over){drawPiece(ctx,game.active,game.ghostY(),true);drawPiece(ctx,game.active);}effects.draw();
  grid(rivalCtx);if(opponent){opponent.board.forEach((row,y)=>[...row].forEach((type,x)=>{if(type!=='.')block(rivalCtx,x*60,y*60,60,type);}));const p=opponent.active;if(p){let x=p.x,y=p.y;const old=oldOpponent?.active;if(old&&old.type===p.type&&JSON.stringify(old.matrix)===JSON.stringify(p.matrix)&&oldOpponent.board.join('')===opponent.board.join('')&&Math.abs(old.y-p.y)<=3&&Math.abs(old.x-p.x)<=3){const a=Math.min(1,(now-opponentAt)/80);x=old.x+(p.x-old.x)*a;y=old.y+(p.y-old.y)*a;}drawPiece(rivalCtx,p,y,false,x);}}
  const key=[game.score,game.lines,game.held,game.canHold,game.queue.join(''),opponent?.score,opponent?.lines,pending,committed.length].join('|');if(key!==uiKey){uiKey=key;$('my-score').textContent=score(game.score);$('my-lines').textContent=pad(game.lines);$('their-score').textContent=score(opponent?.score||0);$('their-lines').textContent=pad(opponent?.lines||0);const held=$('hold').getContext('2d'),next=$('next').getContext('2d');held.clearRect(0,0,160,90);next.clearRect(0,0,160,260);held.globalAlpha=game.canHold?1:.4;preview(held,game.held,45,27);game.queue.slice(0,3).forEach((t,i)=>preview(next,t,46+i*84,25));updateMeter();}
 }
 function state(){send({type:'state',round,board:game.board.map(row=>row.map(c=>c||'.').join('')),active:game.over?null:{type:game.active.type,x:game.active.x,y:game.active.y,matrix:game.active.matrix},score:game.score,lines:game.lines,pieces:game.pieces});}
 function reportTopout(){if(game.over&&!topoutSent&&round){state();topoutSent=send({type:'topout',round});setPhase('awaiting');overlay('마지막 블록까지','승부를 확인하고 있습니다.','ROUND COMPLETE');$('ready').hidden=true;}}
 function processEvents(){
  for(const event of game.events.splice(0)){
   if(event.type==='drop'){effects.drop(event,colors[event.piece.type]);audio.play('drop');hitstop=effects.enabled?45:0;stage.beat(.3);}
   if(event.type==='lock'){
    effects.lock(event,colors);const powered=stage.hit(event,colors[event.piece.type]);if(powered)audio.play('overdrive');
    if(event.rows.length||event.spin){audio.play(event.spin?'spin':'clear',event.rows.length);hitstop=effects.enabled?(event.spin||event.rows.length===4?100:60):0;}else audio.play('lock');
    if(committed.length){game.riseGarbage(committed.splice(0,8));effects.shake(12);flash();audio.play('drop');}
    const packet={type:'lock',round,seq:++seq,lines:event.rows.length,spin:event.spin,perfect:event.perfectClear};outbound.set(seq,packet);send(packet);
   }
   if(event.type==='level')audio.play('level');
  }
  reportTopout();
 }
 function action(name){if(phase!=='playing'||game.over)return;switch(name){case'left':game.move(-1);break;case'right':game.move(1);break;case'down':game.softDrop();break;case'rotate':if(game.rotate())audio.play('rotate');break;case'rotateBack':if(game.rotate(-1))audio.play('rotate');break;case'drop':game.hardDrop();break;case'hold':if(game.hold())audio.play('hold');break;}processEvents();}
 const bindings={ArrowLeft:'left',ArrowRight:'right',ArrowDown:'down',ArrowUp:'rotate',KeyX:'rotate',KeyZ:'rotateBack',Space:'drop',KeyC:'hold',ShiftLeft:'hold',ShiftRight:'hold'};
 document.addEventListener('keydown',event=>{if(['INPUT','TEXTAREA','SELECT'].includes(event.target.tagName)||event.ctrlKey||event.altKey||event.metaKey)return;if(event.target.tagName==='BUTTON'&&['Enter','Space'].includes(event.code))return;const name=bindings[event.code];if(!name||phase!=='playing')return;event.preventDefault();if(event.repeat)return;action(name);if(['left','right','down'].includes(name)){repeat={name,code:event.code};repeatAt=performance.now()+(name==='down'?80:160);}});
 document.addEventListener('keyup',event=>{if(repeat?.code===event.code)repeat=null;});window.addEventListener('blur',stopInput);
 document.addEventListener('visibilitychange',()=>{stopInput();if(ticket)send({type:'focus',hidden:document.hidden});});
 document.querySelectorAll('[data-action]').forEach(button=>{button.addEventListener('pointerdown',event=>{event.preventDefault();button.setPointerCapture(event.pointerId);action(button.dataset.action);if(phase==='playing'&&['left','right','down'].includes(button.dataset.action)){repeat={name:button.dataset.action,pointer:event.pointerId};repeatAt=performance.now()+160;}});const release=event=>{if(repeat?.pointer===event.pointerId)repeat=null;};['pointerup','pointercancel','lostpointercapture'].forEach(name=>button.addEventListener(name,release));button.addEventListener('click',event=>{if(!event.detail)action(button.dataset.action);});});
 $('music').addEventListener('click',()=>{audio.init();music.enabled=!music.enabled;music.sync(phase==='playing');$('music').textContent=music.enabled?'MUSIC ON':'MUSIC OFF';$('music').setAttribute('aria-pressed',String(music.enabled));$('music').blur();});
 $('sound').addEventListener('click',()=>{audio.enabled=!audio.enabled;if(audio.context&&audio.output)audio.output.gain.setTargetAtTime(audio.enabled?1:0,audio.context.currentTime,.02);$('sound').textContent=audio.enabled?'SOUND ON':'SOUND OFF';$('sound').setAttribute('aria-pressed',String(audio.enabled));$('sound').blur();});
 function motion(){stage.enabled=effects.enabled;document.body.classList.toggle('low-motion',!effects.enabled);$('motion').textContent=effects.enabled?'FX ON':'FX OFF';$('motion').setAttribute('aria-pressed',String(effects.enabled));}
 $('motion').addEventListener('click',()=>{effects.enabled=!effects.enabled;effects.reset();motion();$('motion').blur();});motion();
 setInterval(()=>{if(ws?.readyState===WebSocket.OPEN)send({type:'ping',stamp:performance.now()});},4000);
 function frame(now){
  const dt=previous?Math.min(now-previous,100):0;previous=now;effects.step(dt);stage.step(dt,phase==='playing',effects.enabled);music.tick(stage.overdrive>0?1:stage.charge/100);
  if(phase==='countdown'){const left=startAt-(Date.now()+clockOffset);if(left<=0){setPhase('playing');$('field-overlay').hidden=true;audio.play('start');stage.title('GO!','MAKE YOUR FIRST MOVE');}else $('round-title').textContent=Math.ceil(left/1000);}
  if(phase==='playing'){
   if(repeat&&now>=repeatAt){action(repeat.name);repeatAt=now+45;}
   if(phase==='playing'){if(hitstop>0)hitstop=Math.max(0,hitstop-dt);else game.tick(dt);processEvents();if(now-lastState>=100){lastState=now;state();}}
  }
  if(['playing','awaiting','countdown'].includes(phase)){const seconds=Math.max(0,Math.floor((Date.now()+clockOffset-startAt)/1000));$('match-clock').textContent=pad(Math.floor(seconds/60))+':'+pad(seconds%60);}
  if(phase!=='lobby')render(now);requestAnimationFrame(frame);
 }
 if(location.protocol==='file:'){busy(true);lobbyMessage('1대1 대전은 공개 웹사이트에서 이용해 주세요.',true);}
 requestAnimationFrame(frame);
})();
