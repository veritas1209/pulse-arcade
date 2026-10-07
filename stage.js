/* The stage lives outside the board: an orbital light field and impact debris. */
class PulseStage {
  constructor(background,foreground,board){
    this.bg=background;this.fg=foreground;this.board=board;
    this.b=background.getContext('2d');this.f=foreground.getContext('2d');
    this.enabled=true;this.time=0;this.lastAmbient=-1;this.charge=0;this.overdrive=0;
    this.particles=[];this.rings=[];this.kick=0;this.serial=0;this.calloutTime=0;
    this.stars=Array.from({length:90},()=>({x:Math.random(),y:Math.random(),z:.2+Math.random()*.8,phase:Math.random()*7}));
    this.measure();window.addEventListener('resize',()=>this.measure());
    window.addEventListener('scroll',()=>this.measure(),{passive:true});
  }
  measure(){
    this.w=innerWidth;this.h=innerHeight;this.dpr=Math.min(devicePixelRatio||1,1.5);
    for(const canvas of [this.bg,this.fg]){canvas.width=Math.round(this.w*this.dpr);canvas.height=Math.round(this.h*this.dpr);canvas.getContext('2d').setTransform(this.dpr,0,0,this.dpr,0,0);}
    this.rect=this.board.getBoundingClientRect();
    this.cx=this.rect.left+this.rect.width/2;this.cy=this.rect.top+this.rect.height*.47;
    document.documentElement.style.setProperty('--callout-y',Math.min(this.h*.6,this.rect.top+this.rect.height*.35)+'px');
    this.base=document.createElement('canvas');this.base.width=this.bg.width;this.base.height=this.bg.height;
    const c=this.base.getContext('2d');c.scale(this.dpr,this.dpr);c.fillStyle='#05080f';c.fillRect(0,0,this.w,this.h);
    const clouds=[[-.34,-.19,.5,'#0c788140'],[.4,.16,.48,'#67276938'],[0,.38,.48,'#17456938']];
    for(const [x,y,r,color] of clouds){const px=this.cx+x*this.w,py=this.cy+y*this.h,g=c.createRadialGradient(px,py,0,px,py,this.w*r);g.addColorStop(0,color);g.addColorStop(1,'#00000000');c.fillStyle=g;c.fillRect(0,0,this.w,this.h);}
    this.lastAmbient=-1;
  }
  reset(){this.charge=0;this.overdrive=0;this.particles=[];this.rings=[];this.kick=0;this.calloutTime=0;document.getElementById('big-callout').classList.remove('visible');this.paintMeter();}
  beat(power=.12){this.kick=Math.max(this.kick,power);}
  title(word,sub){
    const box=document.getElementById('big-callout');
    document.getElementById('callout-word').textContent=word;document.getElementById('callout-sub').textContent=sub;
    box.dataset.kind=word.includes('SPIN')?'spin':word==='OVERDRIVE'?'overdrive':'clear';
    box.classList.remove('visible');void box.offsetWidth;box.classList.add('visible');this.calloutTime=.95;
  }
  paintMeter(){
    const state=this.overdrive>0?'OVERDRIVE':this.charge>=60?'ON FIRE':this.charge>=25?'IN THE FLOW':'WARMING UP';
    document.getElementById('energy-name').textContent=state;
    document.getElementById('energy-value').textContent=Math.round(this.overdrive>0?100:this.charge)+'%';
    document.getElementById('energy-fill').style.transform=`scaleX(${(this.overdrive>0?100:this.charge)/100})`;
    document.body.dataset.energy=this.overdrive>0?'overdrive':this.charge>=60?'hot':'cool';
  }
  emit(x,y,color,count,power=1){
    if(!this.enabled)return;
    for(let i=0;i<count;i++){
      const angle=Math.random()*Math.PI*2,speed=(80+Math.random()*340)*power;
      this.particles.push({x,y,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed-60,life:.6+Math.random()*.6,size:1+Math.random()*4,color,spin:Math.random()*8,angle});
    }
    if(this.particles.length>240)this.particles.splice(0,this.particles.length-240);
  }
  hit(event,color){
    const rows=event.rows.length;
    if(!rows&&!event.spin){this.charge=Math.min(99,this.charge+1.5);return false;}
    this.charge=Math.min(100,this.charge+rows*16+(event.spin?18:0)+Math.max(0,event.combo)*9);
    const entered=this.charge>=100&&this.overdrive<=0;
    if(entered)this.overdrive=9;
    if(event.spin)color='#ef91ff';
    const r=this.rect,x=r.left+r.width/2,y=r.top+(rows?event.rows.reduce((a,b)=>a+b,0)/rows+.5:event.piece.y+1.5)*r.height/20;
    const strong=rows===4||Boolean(event.spin);
    this.kick=strong?1:.6;
    this.emit(x,y,rows===4?'#dfff84':color,strong?125:35,strong?1.6:1);
    if(this.enabled)this.rings.push({x,y,life:1.1,color:rows===4?'#dfff84':color});
    if(event.spin)this.title(event.spin==='mini'?'T-SPIN MINI':'T-SPIN',(['NO LINE','SINGLE','DOUBLE','TRIPLE'][rows])+(event.b2b?' / BACK TO BACK':'')+(entered?' / OVERDRIVE':'') );
    else if(entered)this.title('OVERDRIVE','MAXIMUM PULSE / 09 SECONDS');
    else if(rows===4)this.title('TETRIS',event.combo>0?'BACK TO BACK / '+(event.combo+1)+'× COMBO':event.perfectClear?'PERFECT CLEAR / NOTHING LEFT BEHIND':'FOUR LINES. ONE PERFECT HIT.');
    else if(event.combo>0)this.title((event.combo+1)+'× COMBO','KEEP THE CHAIN ALIVE');
    this.paintMeter();return entered;
  }
  step(ms,active,enabled){
    this.enabled=enabled;const dt=Math.min(ms,70)/1000;this.time+=dt;
    if(active){
      if(this.overdrive>0){this.overdrive=Math.max(0,this.overdrive-dt);if(this.overdrive===0)this.charge=35;}
      else this.charge=Math.max(0,this.charge-dt*1.4);
    }
    if(Math.floor(this.time*8)!==this.serial){this.serial=Math.floor(this.time*8);this.paintMeter();}
    this.kick*=Math.pow(.9,dt*60);
    this.calloutTime-=dt;if(this.calloutTime<=0)document.getElementById('big-callout').classList.remove('visible');
    for(const p of this.particles){p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=210*dt;p.angle+=p.spin*dt;}
    this.particles=this.particles.filter(p=>p.life>0);
    this.rings.forEach(r=>r.life-=dt);this.rings=this.rings.filter(r=>r.life>0);
    if(this.time-this.lastAmbient>1/30||this.lastAmbient<0){this.drawAmbient();this.lastAmbient=this.time;}
    this.drawForeground();
  }
  drawAmbient(){
    const c=this.b,w=this.w,h=this.h,t=this.enabled?this.time:0,intensity=this.overdrive>0?1:this.charge/130;
    c.clearRect(0,0,w,h);c.drawImage(this.base,0,0,w,h);
    const tint=this.overdrive>0?'#dfff84':'#6de5ea';
    c.save();c.globalCompositeOperation='lighter';
    for(const s of this.stars){
      const x=(s.x*w+Math.sin(t*.08+s.phase)*12+w)%w,y=(s.y*h-t*(2+intensity*30)*s.z+h*100)%h;
      c.globalAlpha=(.18+s.z*.45)*(this.enabled?.75+Math.sin(t+s.phase)*.25:1);c.fillStyle=s.z>.75?'#f1ecdb':'#76a5bd';c.fillRect(x,y,s.z*1.7,s.z*1.7);
      if(intensity>.65){c.globalAlpha*=.2;c.fillRect(x,y,1,12*s.z);}
    }
    c.translate(this.cx,this.cy);c.rotate(-.27);
    const radius=Math.max(270,this.rect.height*.65),power=this.enabled?this.kick:0;
    for(let ring=0;ring<4;ring++){
      c.save();c.rotate(t*(ring%2?-.035:.025)+ring*.7);
      c.strokeStyle=ring===2?'#e09a74':tint;c.globalAlpha=(ring===2?.24:.13)+power*.13;c.lineWidth=ring===2?2:1;
      c.setLineDash(ring===2?[100,30,4,22]:ring===1?[3,19]:[300,80]);
      c.beginPath();c.ellipse(0,0,radius+ring*24,(radius+ring*24)*.66,0,0,Math.PI*2);c.stroke();c.restore();
    }
    c.restore();
    // Perspective floor, kept dim beneath the game controls.
    c.save();const horizon=h*.68;c.strokeStyle=tint;c.globalAlpha=.085+intensity*.035;c.lineWidth=1;c.beginPath();
    for(let i=-10;i<=10;i++){c.moveTo(this.cx+i*20,horizon);c.lineTo(this.cx+i*140,h+50);}
    for(let j=0;j<10;j++){const z=((j+t*.25)%10)/10,y=horizon+z*z*(h-horizon);c.moveTo(0,y);c.lineTo(w,y);}c.stroke();c.restore();
  }
  drawForeground(){
    const c=this.f;c.clearRect(0,0,this.w,this.h);if(!this.enabled)return;
    c.save();c.globalCompositeOperation='lighter';
    for(const r of this.rings){c.globalAlpha=r.life/1.1*.5;c.strokeStyle=r.color;c.lineWidth=1+r.life*2;c.beginPath();c.ellipse(r.x,r.y,(1.1-r.life)*600+15,(1.1-r.life)*175+5,0,0,Math.PI*2);c.stroke();}
    for(const p of this.particles){
      c.save();c.translate(p.x,p.y);c.rotate(p.angle);c.globalAlpha=Math.min(1,p.life*1.5);c.fillStyle=p.color;c.fillRect(-p.size/2,-p.size/2,p.size,p.size*2.5);c.restore();
    }
    c.restore();
  }
}

/* A small generative synthwave score. No media files and no network. */
class PulseMusic {
  constructor(synth,onBeat){this.synth=synth;this.onBeat=onBeat;this.enabled=true;this.playing=false;this.next=0;this.stepIndex=0;this.bus=null;}
  sync(active){
    this.playing=active;
    const c=this.synth.context;
    if(!c)return;
    if(!this.bus){this.bus=c.createGain();this.bus.gain.value=0;this.bus.connect(c.destination);}
    const gain=this.bus.gain;
    if(gain.cancelAndHoldAtTime)gain.cancelAndHoldAtTime(c.currentTime);else{gain.cancelScheduledValues(c.currentTime);gain.setValueAtTime(gain.value,c.currentTime);}
    gain.linearRampToValueAtTime(this.enabled&&active?.52:0,c.currentTime+.08);
    if(active)this.next=c.currentTime+.05;
  }
  note(freq,time,length,type,volume,end){this.synth.note(freq,time,length,type,volume,end,this.bus);}
  tick(intensity){
    const c=this.synth.context;if(!c||!this.playing||!this.enabled||!this.bus||c.state!=='running')return;
    const eighth=60/112/2;
    if(this.next<c.currentTime-.15)this.next=c.currentTime+.02;
    while(this.next<c.currentTime+.09){
      const i=this.stepIndex%32,t=this.next,root=[55,43.65,65.41,49][Math.floor(i/8)];
      if(i%2===0){this.note(110,t,.16,'sine',.13,36);this.onBeat(.09+intensity*.11);}
      if(i%4===2){this.note(170,t,.085,'triangle',.055,75);this.note(1800,t,.025,'square',.009,600);}
      this.note(root*(i%4===3?2:1),t,.21,'triangle',.06);
      this.note(6500,t,.018,'square',i%2?.006:.003,2900);
      if(intensity>.2){const scale=[0,7,12,15,12,7,3,10];this.note(root*4*Math.pow(2,scale[i%8]/12),t,.19,'sine',.017+intensity*.01);}
      if(intensity>.7&&i%4===0){[0,7,15].forEach(n=>this.note(root*2*Math.pow(2,n/12),t,.65,'sine',.012));}
      this.next+=eighth;this.stepIndex++;
    }
  }
}
