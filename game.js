(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const game = new TetrisEngine();
  const leaderboard = new PulseLeaderboard();
  const canvas = $('board'), ctx = canvas.getContext('2d');
  const colors = {I:'#69d6da',J:'#709bea',L:'#f2ac67',O:'#ead66c',S:'#a9d786',T:'#b396da',Z:'#e88286'};
  const names = {I:'I형',J:'J형',L:'L형',O:'O형',S:'S형',T:'T형',Z:'Z형'};
  const effects=new PulseEffects(ctx,document.querySelector('.board-shell')), synth=new PulseAudio();
  const stage=new PulseStage($('ambience'),$('screen-fx'),document.querySelector('.board-shell'));
  const music=new PulseMusic(synth,power=>stage.beat(power));
  let hitstop=0,showtime=null;
  let mode = 'ready', previous = 0, sound = true, uiSignature = ''; 
  let best = 0, noticeTimer = null, repeatAction = null, repeatAt = 0;
  const keys = new Set();
  try { best = Math.max(0, Number(localStorage.getItem('block-club-best')) || 0); } catch (_) { /* Storage is optional for file://. */ }
  const formatted = n => String(n).padStart(6, '0');
  function block(context, x, y, size, type, ghost = false) {
    const gap = size * .045, edge = size - gap * 2;
    if(!ghost){context.shadowColor=colors[type]+'55';context.shadowBlur=size*.18;}
    context.fillStyle = ghost ? colors[type] + '0b' : colors[type];
    context.fillRect(x + gap, y + gap, edge, edge);context.shadowBlur=0;
    context.strokeStyle = ghost ? colors[type] + '77' : '#ffffff35';
    context.lineWidth = ghost ? 1.5 : 1;
    context.strokeRect(x + gap + .5, y + gap + .5, edge - 1, edge - 1);
    if (!ghost) {
      context.fillStyle = '#ffffff28'; context.fillRect(x+gap+2, y+gap+2, edge-4, size*.08);
      context.fillStyle='#ffffff0d';context.fillRect(x+size*.25,y+size*.25,size*.5,size*.5);
      context.fillStyle = '#00000030'; context.fillRect(x+gap+2, y+size-gap-size*.12, edge-4, size*.09);
    }
  }
  function piece(p, y, ghost) {
    p.matrix.forEach((row, py) => row.forEach((cell, px) => {
      if (cell && y+py >= 0) block(ctx, (p.x+px)*60, (y+py)*60, 60, p.type, ghost);
    }));
  }
  function drawBoard() {
    ctx.fillStyle = '#0c131a'; ctx.fillRect(0,0,600,1200);
    ctx.strokeStyle = '#1d2932'; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x=60;x<600;x+=60) { ctx.moveTo(x,0);ctx.lineTo(x,1200); }
    for (let y=60;y<1200;y+=60) { ctx.moveTo(0,y);ctx.lineTo(600,y); }
    ctx.stroke();
    game.board.forEach((row,y) => row.forEach((type,x) => { if(type) block(ctx,x*60,y*60,60,type); }));
    if (mode === 'playing'||mode==='showcase') { piece(game.active,game.ghostY(),true);piece(game.active,game.active.y,false); }
    $('leaderboard-result').hidden=mode!=='over';
    if(mode==='ready'){
      const pattern=['..........','..........','..........','..........','..........','..........','..........','..........','..........','..........','..........','..........','..........','..........','..........','..........','T.........','TT....L...','TJJ...L.SS','JJOO.LLSS.'];
      ctx.globalAlpha=.45;pattern.forEach((row,y)=>[...row].forEach((t,x)=>{if(t!=='.')block(ctx,x*60,y*60,60,t);}));ctx.globalAlpha=1;
    }
    effects.draw();
  }
  function preview(context, type, centerY, size) {
    if (!type) return;
    const matrix = SHAPES[type], cells = [];
    matrix.forEach((row,y) => row.forEach((cell,x) => {if(cell) cells.push([x,y]);}));
    const xs=cells.map(c=>c[0]), ys=cells.map(c=>c[1]);
    const minX=Math.min(...xs), minY=Math.min(...ys);
    const width=(Math.max(...xs)-minX+1)*size, height=(Math.max(...ys)-minY+1)*size;
    cells.forEach(([x,y])=>block(context,(160-width)/2+(x-minX)*size,centerY-height/2+(y-minY)*size,size,type));
  }
  function render() {
    drawBoard();
    const signature=[game.score,best,game.level,game.lines,game.held,game.canHold,game.queue.join(''),game.combo,game.b2bChain,game.pieces,mode].join('|');
    if(signature===uiSignature)return;uiSignature=signature;
    $('b2b').textContent=game.b2bChain>1?game.b2bChain+'×':'—';
    const danger=(mode==='playing')&&game.board.slice(0,5).some(row=>row.some(Boolean));$('danger').hidden=!danger;document.querySelector('.board-shell').classList.toggle('in-danger',danger);
    $('combo').textContent=game.combo>0?String(game.combo+1).padStart(2,'0')+'×':'—';
    $('combo-caption').textContent=game.combo>0?'연속 클리어 · 보너스 점수!':'연속으로 줄을 지워보세요';
    document.querySelectorAll('.combo-bars i').forEach((bar,i)=>bar.classList.toggle('lit',i<=game.combo));
    $('score').textContent = formatted(game.score); $('best').textContent = formatted(best);
    $('level').textContent = String(game.level).padStart(2,'0'); $('lines').textContent = String(game.lines).padStart(2,'0');
    $('progress').style.width = (game.lines%10)*10+'%';
    $('level-hint').textContent = `다음 레벨까지 ${10-game.lines%10}줄`;
    const held = $('hold').getContext('2d'), next = $('next').getContext('2d');
    held.clearRect(0,0,160,90); next.clearRect(0,0,160,260);
    held.globalAlpha = game.canHold ? 1 : .4; preview(held,game.held,45,25);
    $('hold').setAttribute('aria-label',game.held ? `보관 블록: ${names[game.held]}` : '보관 중인 블록 없음');
    $('hold-hint').textContent = game.canHold ? '블록을 잠시 보관하세요' : '다음 블록부터 다시 사용 가능';
    game.queue.slice(0,3).forEach((type,i)=>preview(next,type,46+i*84,i===0?27:23));
    $('next').setAttribute('aria-label',`다음 블록: ${game.queue.slice(0,3).map(t=>names[t]).join(', ')}`);
  }
  function saveBest() {
    if(mode==='showcase')return;
    if(game.score > best) {
      best=game.score;
      try { localStorage.setItem('block-club-best',String(best)); } catch (_) {}
    }
  }
  function announce(text) {
    clearTimeout(noticeTimer); $('notice').classList.remove('show');
    $('notice').textContent=text; void $('notice').offsetWidth; $('notice').classList.add('show');
    noticeTimer=setTimeout(()=>$('notice').classList.remove('show'),1000);
  }
  function stopInput() { keys.clear(); repeatAction=null; }
  function setMode(nextMode) {
    mode=nextMode; stopInput();document.body.dataset.mode=mode;music.sync(mode==='playing'||mode==='showcase');requestAnimationFrame(()=>stage.measure());
    $('overlay').hidden=mode==='playing'||mode==='showcase';$('demo-exit').hidden=mode!=='showcase';$('showcase').hidden=mode!=='ready'&&mode!=='over';
    $('pause').disabled=mode==='ready'||mode==='over'||mode==='showcase'; $('restart').disabled=mode==='ready'||mode==='showcase';
    $('pause').innerHTML=mode==='paused'?'▶ <span>계속하기</span>':'Ⅱ <span>일시정지</span>';
    $('status').textContent={ready:'READY TO PLAY',playing:'IN THE FLOW',paused:'TAKE A BREATH',over:'NICE RUN',showcase:'SHOWTIME / DEMO'}[mode];
    $('status-dot').style.background=mode==='playing'?'#d5f56b':'#96a5b2';
    $('play-label').textContent=mode==='playing'?'MAKE ROOM FOR WHAT’S NEXT':'YOUR NEXT HIGH SCORE STARTS HERE';
    $('leaderboard-result').hidden=mode!=='over';
    if(mode==='ready'){
      $('overlay-tag').textContent='BEYOND THE DROP';$('overlay-title').textContent='한 판, 터뜨려볼까요?';$('overlay-text').innerHTML='소리와 빛이 터지는 테트리스.<br>당신의 플레이가 이 무대를 깨웁니다.';$('start').innerHTML='LET’S PLAY <span>↗</span>';$('overlay-hint').textContent='또는 Enter 키를 누르세요';
    } else if(mode==='paused') {
      $('overlay-tag').textContent='TAKE A BREATH';$('overlay-title').textContent='잠시 쉬어가기';
      $('overlay-text').textContent='준비되면 이어서 플레이하세요.';$('start').innerHTML='계속하기 <span>↗</span>';
      $('overlay-hint').textContent='Enter 또는 P 키로 계속하기';
    } else if(mode==='over') {
      leaderboard.finishRun(game);
      $('overlay-tag').textContent='ONE MORE ROUND?';$('overlay-title').textContent='멋진 도전이었어요';
      $('overlay-text').textContent=`점수 ${game.score.toLocaleString()} · 완성한 줄 ${game.lines}`;
      $('start').innerHTML='다시 도전 <span>↗</span>';$('overlay-hint').textContent='Enter 키로 다시 시작';
    }
    render();
  }
  function start() {
    if(mode==='paused') { setMode('playing'); return; }
    leaderboard.startRun();showtime=null;hitstop=0;synth.init();game.reset(); effects.reset();stage.reset(); $('notice').classList.remove('show');setMode('playing');synth.play('start');
  }
  function pause() { if(mode==='playing') setMode('paused'); else if(mode==='paused') setMode('playing'); }
  function afterAction() {
    for(const event of game.events.splice(0)){
      if(event.type==='drop'){effects.drop(event,colors[event.piece.type]);hitstop=effects.enabled?55:0;synth.play('drop');stage.beat(.3);}
      if(event.type==='lock'){
        effects.lock(event,colors);const powered=stage.hit(event,colors[event.piece.type]);if(powered)synth.play('overdrive');
        if(event.rows.length||event.spin){
          const label=event.spin?(event.spin==='mini'?'T-SPIN MINI':'T-SPIN')+' '+(['','SINGLE','DOUBLE','TRIPLE'][event.rows.length]):['','SINGLE','DOUBLE','TRIPLE','TETRIS'][event.rows.length];
          announce(label+' / +'+event.reward.toLocaleString());synth.play(event.spin?'spin':'clear',event.rows.length);hitstop=effects.enabled?(event.spin||event.rows.length===4?140:85):0;
          $('score').classList.remove('score-pop');void $('score').offsetWidth;$('score').classList.add('score-pop');
          if(event.rows.length===4){document.body.classList.remove('super-clear');void document.body.offsetWidth;document.body.classList.add('super-clear');}
        }else synth.play('lock');
      }
      if(event.type==='level'){announce('LEVEL '+String(event.level).padStart(2,'0'));synth.play('level');}
    }
    saveBest();
    if(game.over && mode!=='over') { setMode('over');synth.play('over'); }
    else render();
  }
  function action(name) {
    if(mode!=='playing') return;
    switch(name) {
      case 'left':game.move(-1);break;case 'right':game.move(1);break;
      case 'down':game.softDrop();break;case 'rotate':if(game.rotate(1))synth.play('rotate');break;
      case 'rotateBack':if(game.rotate(-1))synth.play('rotate');break;
      case 'drop':game.hardDrop();break;case 'hold':if(game.hold())synth.play('hold');break;
    }
    afterAction();
  }
  const bindings={ArrowLeft:'left',ArrowRight:'right',ArrowDown:'down',ArrowUp:'rotate',KeyX:'rotate',KeyZ:'rotateBack',Space:'drop',KeyC:'hold',ShiftLeft:'hold',ShiftRight:'hold'};
  document.addEventListener('keydown',event=>{
    if($('ranking-dialog').open||['INPUT','TEXTAREA','SELECT'].includes(event.target.tagName)||event.ctrlKey||event.altKey||event.metaKey)return;
    const code=event.code;
    // Let focused buttons retain native Enter / Space activation.
    if(document.activeElement?.tagName==='BUTTON'&&(code==='Enter'||code==='Space'))return;
    if(bindings[code]||['KeyP','Escape','Enter'].includes(code))event.preventDefault();
    if(event.repeat)return;
    if(code==='Enter'&&mode!=='playing'){start();return;}
    if(code==='KeyP'||code==='Escape'){pause();return;}
    const name=bindings[code];
    if(!name||mode!=='playing')return;
    keys.add(code);action(name);
    if(['left','right','down'].includes(name)) { repeatAction={name,code};repeatAt=performance.now()+(name==='down'?80:160); }
  });
  document.addEventListener('keyup',event=>{
    keys.delete(event.code);
    if(repeatAction?.code===event.code)repeatAction=null;
  });
  document.querySelectorAll('[data-action]').forEach(button=>{
    button.addEventListener('pointerdown',event=>{
      event.preventDefault();button.setPointerCapture(event.pointerId);
      const name=button.dataset.action;action(name);
      if(mode==='playing'&&['left','right','down'].includes(name)){repeatAction={name,pointer:event.pointerId};repeatAt=performance.now()+160;}
    });
    const release=event=>{if(repeatAction?.pointer===event.pointerId)repeatAction=null;};
    button.addEventListener('pointerup',release);button.addEventListener('pointercancel',release);button.addEventListener('lostpointercapture',release);
    button.addEventListener('click',event=>{if(event.detail===0)action(button.dataset.action);});
  });
  document.addEventListener('pulse:ranking-open',()=>{if(mode==='playing')setMode('paused');else if(mode==='showcase')endShowcase();});
  $('start').addEventListener('click',()=>{start();$('start').blur();});
  $('pause').addEventListener('click',()=>{pause();$('pause').blur();});
  $('restart').addEventListener('click',()=>{
    if(mode==='over'){start();$('restart').blur();return;}
    const wasPlaying=mode==='playing';if(wasPlaying)setMode('paused');
    if(window.confirm('현재 게임을 끝내고 처음부터 시작할까요?'))start();else if(wasPlaying)setMode('playing');
    $('restart').blur();
  });
  $('sound').addEventListener('click',()=>{
    sound=!sound;synth.enabled=sound;if(synth.context&&synth.output)synth.output.gain.setTargetAtTime(sound?1:0,synth.context.currentTime,.02);$('sound').textContent=sound?'SOUND ON':'SOUND OFF';
    $('sound').setAttribute('aria-pressed',String(sound));$('sound').setAttribute('aria-label',sound?'효과음 끄기':'효과음 켜기');
    synth.play('hold');$('sound').blur();
  });
  function updateMotion(){
    stage.enabled=effects.enabled;stage.particles=[];stage.rings=[];
    $('motion').textContent=effects.enabled?'FX ON':'FX OFF';$('motion').setAttribute('aria-pressed',String(effects.enabled));$('motion').setAttribute('aria-label',effects.enabled?'화면 반동 끄기':'화면 반동 켜기');document.body.classList.toggle('low-motion',!effects.enabled);
  }
  $('motion').addEventListener('click',()=>{effects.enabled=!effects.enabled;effects.reset();updateMotion();$('motion').blur();});updateMotion();
  window.addEventListener('blur',()=>{if(mode==='playing')setMode('paused');else if(mode==='showcase')endShowcase();stopInput();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){if(mode==='playing')setMode('paused');else if(mode==='showcase')endShowcase();}});
  function endShowcase(){showtime=null;game.reset();effects.reset();stage.reset();hitstop=0;setMode('ready');}
  $('showcase').addEventListener('click',()=>{
    synth.init();game.reset();effects.reset();stage.reset();hitstop=0;
    showtime=new PulseShowcase(game,afterAction);setMode('showcase');$('showcase').blur();synth.play('start');
  });
  $('demo-exit').addEventListener('click',start);
  $('music').addEventListener('click',()=>{
    music.enabled=!music.enabled;synth.init();music.sync(mode==='playing'||mode==='showcase');
    $('music').setAttribute('aria-pressed',String(music.enabled));$('music').setAttribute('aria-label',music.enabled?'배경음악 끄기':'배경음악 켜기');
    $('music').lastChild.textContent=music.enabled?' MUSIC ON':' MUSIC OFF';$('music').blur();
  });
  $('fullscreen').addEventListener('click',async()=>{
    try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch(_){announce('전체 화면을 사용할 수 없습니다');}
    $('fullscreen').blur();
  });
  document.addEventListener('fullscreenchange',()=>{$('fullscreen').setAttribute('aria-label',document.fullscreenElement?'전체 화면 종료':'전체 화면');stage.measure();});
  function frame(now) {
    const dt=previous?Math.min(now-previous,100):0;previous=now;
    effects.step(dt);stage.step(dt,mode==='playing'||mode==='showcase',effects.enabled);
    music.tick(stage.overdrive>0?1:stage.charge/100);
    if(mode==='showcase'){
      if(showtime.update(dt))endShowcase();else render();
    }else if(mode==='playing') {
      leaderboard.tick(dt);
      if(repeatAction&&now>=repeatAt){action(repeatAction.name);repeatAt=now+45;}
      if(mode==='playing'){
        if(hitstop>0)hitstop=Math.max(0,hitstop-dt);else game.tick(dt);
        afterAction();
      }
    }
    requestAnimationFrame(frame);
  }
  render();requestAnimationFrame(frame);
})();
