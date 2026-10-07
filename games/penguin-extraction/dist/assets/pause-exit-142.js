(()=>{
 'use strict';
 const base='/games/penguin-extraction';
 let overlay=null,overlayObserver=null,confirmPanel=null;
 const style=document.createElement('style');
 style.textContent='.pause-panel .pause-exit{border-color:#d4a98b88;color:#f3d5bd;margin-top:12px}.pause-panel .pause-exit:hover{background:#69463766;border-color:#e9bb97}.pause-panel.pause-confirm p{font-size:14px;line-height:1.8;color:#efe8d8;margin:25px 0}.pause-confirm-actions{display:grid;grid-template-columns:1fr 1fr;gap:10px}.pause-confirm-actions button{min-height:48px}.pause-confirm-actions .primary{background:#e3ba76;color:#1a3430}';
 document.head.append(style);
 const training=()=>Boolean(sessionStorage.getItem('bluecap-training-raid'));
 async function leave(button,errorNode){
  if(button.disabled)return;
  button.disabled=true;
  try{
   const response=await fetch(base+'/api/'+(training()?'training/exit':'raid/leave'),{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:'{}'});
   const data=await response.json();
   if(!response.ok)throw Error(data.error?.message||'나가기 요청을 처리하지 못했습니다.');
   if(training())sessionStorage.removeItem('bluecap-training-raid');
   location.assign(base+'/');
  }catch(error){
   button.disabled=false;
   errorNode.textContent=error.message||'다시 시도해 주세요.';
  }
 }
 function clearConfirm(){
  if(!confirmPanel)return;
  confirmPanel.remove();confirmPanel=null;
  const main=overlay?.querySelector('.pause-panel');
  if(main)main.style.display='';
 }
 function showConfirm(){
  if(confirmPanel||!overlay)return;
  const main=overlay.querySelector('.pause-panel');
  if(!main)return;
  main.style.display='none';
  confirmPanel=document.createElement('section');
  confirmPanel.className='pause-panel pause-confirm';
  confirmPanel.setAttribute('role','dialog');
  confirmPanel.setAttribute('aria-modal','true');
  confirmPanel.setAttribute('aria-labelledby','leave-title');
  confirmPanel.innerHTML='<span class="eyebrow">EXPEDITION / EXIT</span><h2 id="leave-title">원정 나가기</h2><p>지금 원정을 나가면 아이템을 잃을 수 있습니다.<br>정말 나가시겠습니까?</p><div class="pause-confirm-actions"><button class="outline" id="pause-confirm-no">아니오</button><button class="primary" id="pause-confirm-yes">예</button></div><p class="pause-exit-error" role="alert"></p>';
  overlay.append(confirmPanel);
  confirmPanel.querySelector('#pause-confirm-no').addEventListener('click',clearConfirm);
  confirmPanel.querySelector('#pause-confirm-yes').addEventListener('click',event=>void leave(event.currentTarget,confirmPanel.querySelector('.pause-exit-error')));
  confirmPanel.querySelector('#pause-confirm-no').focus();
 }
 function enhance(){
  if(!overlay||!overlay.classList.contains('visible')){clearConfirm();return;}
  const panel=overlay.querySelector('.pause-panel:not(.pause-confirm)');
  if(!panel||panel.querySelector('#pause-exit'))return;
  if(training()){
   const primary=panel.querySelector('#resume');if(primary)primary.innerHTML='훈련 계속하기 <span>→</span>';
   const note=panel.querySelector('p');if(note)note.textContent='훈련은 계속 진행됩니다.';
  }
  const button=document.createElement('button');
  button.type='button';button.id='pause-exit';button.className='outline pause-exit';
  button.textContent=training()?'훈련장 나가기':'원정 나가기';
  button.addEventListener('click',()=>{
   if(training())void leave(button,panel.querySelector('.pause-exit-error'));
   else showConfirm();
  });
  const error=document.createElement('p');error.className='pause-exit-error';error.setAttribute('role','alert');
  panel.querySelector('#pause-guide')?.before(button);
  button.after(error);
 }
 document.addEventListener('keydown',event=>{
  if(confirmPanel&&event.key==='Escape'){
   event.preventDefault();event.stopImmediatePropagation();clearConfirm();
  }
 },true);
 const boot=setInterval(()=>{
  const node=document.querySelector('#pause-overlay');
  if(!node||node===overlay)return;
  overlayObserver?.disconnect();overlay=node;
  overlayObserver=new MutationObserver(enhance);
  overlayObserver.observe(node,{childList:true,attributes:true,attributeFilter:['class']});
  enhance();
 },500);
 window.addEventListener('pagehide',()=>{clearInterval(boot);overlayObserver?.disconnect();},{once:true});
})();
