(() => {
 const $=id=>document.getElementById(id);let games=[],filter='all';
 function element(tag,className,text){const el=document.createElement(tag);if(className)el.className=className;if(text!==undefined)el.textContent=text;return el;}
 function card(game){
  const link=element('a','game-card');link.href=game.href;link.setAttribute('aria-label',game.title+' 플레이');
  const poster=element('div','game-poster'),top=element('div','poster-top');
  top.append(element('span','',game.subtitle||'PULSE ORIGINAL'),element('b','','PLAY NOW'));poster.append(top);
  if(game.cover){poster.classList.add('has-cover');const image=element('img','game-cover');image.src=game.cover;image.alt=game.title+' 게임 화면';image.loading='lazy';image.decoding='async';poster.append(image);}
  const title=element('div','poster-title',game.title.split(' / ')[0]);title.append(element('span','',game.title.split(' / ')[1]||'ARCADE'));if(!game.cover)poster.append(title);
  const shape=element('div','poster-t');shape.setAttribute('aria-hidden','true');for(let i=0;i<4;i++)shape.append(element('i'));if(!game.cover)poster.append(shape,element('div','poster-bottom','FEEL EVERY MOVE.'));
  const info=element('div','game-info'),tags=element('div','game-tags');tags.append(element('span','',game.genre),element('span','',game.players),element('span','',game.controls));
  info.append(tags,element('h3','',game.title),element('p','',game.description));
  const foot=element('div','card-foot'),play=element('span','play-cta','지금 플레이');play.append(element('b','','↗'));foot.append(element('span','','INSTANT PLAY / FREE'),play);info.append(foot);link.append(poster,info);const entry=element('div','game-entry');entry.append(link);const versusHref=game.multiplayer_href||(game.online==='board'?game.href+'?online=1':null);if(versusHref){const duel=element('a','duel-cta',game.multiplayer_label||'친구와 실시간 1대1');duel.href=versusHref;duel.append(element('b','',game.online==='coop'?'CO-OP ↗':'VERSUS ↗'));entry.append(duel);}return entry;
 }
 function render(){const term=$('search').value.trim().toLocaleLowerCase(),selected=games.filter(g=>(filter==='all'||g.genre===filter)&&(g.title+' '+g.genre+' '+g.description+' '+(g.search_terms||[]).join(' ')).toLocaleLowerCase().includes(term));$('game-list').replaceChildren(...selected.map(card));$('game-list').classList.toggle('multiple',selected.length>1);$('empty').hidden=selected.length!==0;$('count-badge').textContent=String(selected.length).padStart(2,'0');}
 async function ranking(){
  const id=$('rank-game').value,game=games.find(g=>g.id===id);if(!game)return;$('rank-play').href=game.href;
  try{const response=await fetch('/api/games/'+encodeURIComponent(id)+'/scores',{signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error();const data=await response.json();
   if($('rank-game').value!==id)return;$('leaders').replaceChildren();
   data.scores.slice(0,4).forEach(score=>{const item=element('li');item.append(element('span','rank',String(score.rank).padStart(2,'0')),element('span','name',score.name),element('span','score',score.score.toLocaleString()));$('leaders').append(item);});
   $('rank-note').textContent=data.players?`${data.players}명의 최고 기록이 쌓이고 있습니다.`:'아직 기록이 없습니다. 첫 번째 챔피언이 되어보세요.';
  }catch(_){$('rank-note').textContent='랭킹을 불러오지 못했습니다. 잠시 후 다시 방문해 주세요.';}
 }
 $('search').addEventListener('input',render);$('rank-game').addEventListener('change',ranking);
 document.querySelector('.filters').addEventListener('click',event=>{const button=event.target.closest('[data-filter]');if(!button)return;filter=button.dataset.filter;document.querySelectorAll('[data-filter]').forEach(b=>{b.classList.toggle('selected',b===button);b.setAttribute('aria-pressed',String(b===button));});render();});
 fetch('/api/games',{signal:AbortSignal.timeout(10000)}).then(r=>{if(!r.ok)throw Error();return r.json();}).then(data=>{games=data.games;for(const genre of new Set(games.map(g=>g.genre))){if([...document.querySelectorAll('[data-filter]')].some(b=>b.dataset.filter===genre))continue;const b=element('button','',genre);b.dataset.filter=genre;b.setAttribute('aria-pressed','false');document.querySelector('.filters').insertBefore(b,document.querySelector('.filters>span'));}$('game-count').textContent=String(games.length).padStart(2,'0')+' / GAMES & COUNTING';$('rank-game').replaceChildren(...games.filter(g=>g.leaderboard!==false).map(g=>{const option=element('option','',g.title);option.value=g.id;return option;}));render();ranking();}).catch(()=>{$('empty').hidden=false;$('empty').textContent='게임 목록을 불러오지 못했습니다. 새로고침해 주세요.';$('rank-note').textContent='서버 연결을 기다리고 있습니다.';});
})();
