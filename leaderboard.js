class PulseLeaderboard {
  constructor(){
    this.online=location.protocol==='https:'||location.protocol==='http:';
    const home=document.getElementById('arcade-home');if(home)home.hidden=!this.online;
    const duel=document.getElementById('duel-link');if(duel)duel.hidden=!this.online;
    this.generation=0;this.run=null;this.result=null;this.elapsed=0;this.loading=false;
    this.dialog=document.getElementById('ranking-dialog');this.form=document.getElementById('score-form');
    this.message=document.getElementById('ranking-message');
    try{document.getElementById('player-name').value=localStorage.getItem('pulse-name')||'';}catch(_){}
    document.querySelectorAll('[data-ranking-open]').forEach(button=>button.addEventListener('click',()=>this.open()));
    document.getElementById('ranking-close').addEventListener('click',()=>this.dialog.close());
    document.getElementById('ranking-refresh').addEventListener('click',()=>this.refresh());
    this.form.addEventListener('submit',event=>{event.preventDefault();this.submit();});
    this.refresh();
  }
  async request(path,options={}){
    const response=await fetch(path,{...options,signal:AbortSignal.timeout(10000),credentials:'same-origin',headers:{'Content-Type':'application/json',...options.headers}});
    const data=await response.json();if(!response.ok)throw new Error(data.error||'서버에 연결할 수 없습니다.');return data;
  }
  startRun(){
    const generation=++this.generation;this.result=null;this.run=null;this.elapsed=0;this.form.hidden=true;
    if(!this.online)return;
    this.pending=this.request('/api/games/tetris/runs',{method:'POST',body:'{}'}).then(data=>{if(generation===this.generation)this.run=data.run_id;}).catch(()=>{if(generation===this.generation)this.run=null;});
  }
  tick(ms){this.elapsed+=Math.max(0,Math.min(ms,100));}
  finishRun(game){
    this.result={score:game.score,lines:game.lines,level:game.level,pieces:game.pieces,elapsed_ms:Math.max(1,Math.round(this.elapsed))};
    this.form.hidden=!this.online||game.score===0;
    document.getElementById('submit-score').disabled=false;
    document.getElementById('run-score').textContent=game.score.toLocaleString();
  }
  open(){
    document.dispatchEvent(new Event('pulse:ranking-open'));
    if(!this.dialog.open)this.dialog.showModal();this.refresh();
  }
  async refresh(){
    if(!this.online){this.message.textContent='로컬 플레이 중입니다. 공개 웹사이트에서 온라인 랭킹을 이용할 수 있어요.';document.getElementById('ranking-status').textContent='LOCAL';return;}
    if(this.loading)return;this.loading=true;
    try{
      const data=await this.request('/api/games/tetris/scores');
      document.getElementById('ranking-status').textContent='ONLINE';
      this.message.textContent=data.players?`${data.players}명의 최고 기록 · 브라우저별 최고 점수`:'아직 기록이 없습니다. 첫 번째 기록을 남겨보세요.';
      const list=document.getElementById('ranking-list');list.replaceChildren();
      for(const entry of data.scores){
        const row=document.createElement('tr');
        const cells=[String(entry.rank).padStart(2,'0'),entry.name,entry.score.toLocaleString(),String(entry.lines)];
        cells.forEach(value=>{const cell=document.createElement('td');cell.textContent=value;row.append(cell);});list.append(row);
      }
      const mini=document.getElementById('ranking-mini');mini.replaceChildren();
      if(!data.scores.length){const item=document.createElement('li');item.textContent='첫 챔피언을 기다립니다';mini.append(item);}
      data.scores.slice(0,3).forEach(entry=>{const item=document.createElement('li'),name=document.createElement('span'),score=document.createElement('b');name.textContent=entry.rank+'. '+entry.name;score.textContent=entry.score.toLocaleString();item.append(name,score);mini.append(item);});
    }catch(_){this.message.textContent='서버에 연결하지 못했습니다. 잠시 후 새로고침해 주세요.';document.getElementById('ranking-status').textContent='OFFLINE';}
    finally{this.loading=false;}
  }
  async submit(){
    const status=document.getElementById('submit-message'),button=document.getElementById('submit-score');
    const generation=this.generation,result=this.result;
    if(!result)return;
    button.disabled=true;status.textContent='기록을 등록하고 있습니다…';
    try{
      if(this.pending)await this.pending;
      if(generation!==this.generation||!this.run)throw new Error('온라인 플레이 연결이 없어 등록할 수 없습니다. 연결 후 새 게임을 시작해 주세요.');
      const name=document.getElementById('player-name').value.trim();
      const data=await this.request('/api/games/tetris/scores',{method:'POST',body:JSON.stringify({...result,name,run_id:this.run})});
      try{localStorage.setItem('pulse-name',name);}catch(_){}
      status.textContent=data.improved?`등록 완료! 현재 ${data.rank}위 · 최고 ${data.best.toLocaleString()}점`:`기존 최고 ${data.best.toLocaleString()}점을 유지합니다. 현재 ${data.rank}위`;
      this.refresh();
    }catch(error){status.textContent=error.message;button.disabled=false;}
  }
}
