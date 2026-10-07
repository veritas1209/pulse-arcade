/* Procedural visuals and synthesis: every effect works offline. */
class PulseEffects {
  constructor(ctx, shell) {
    this.ctx=ctx;this.shell=shell;this.particles=[];this.waves=[];this.trails=[];this.flashes=[];this.spirals=[];
    this.enabled=!matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.impact=0;this.time=0;this.shakeTimer=null;
  }
  reset(){this.particles=[];this.waves=[];this.trails=[];this.flashes=[];this.spirals=[];this.impact=0;this.shell.style.transform='';}
  burst(x,y,color,count,power=1){
    if(!this.enabled)return;
    for(let i=0;i<count;i++){
      const a=Math.random()*Math.PI*2,s=(70+Math.random()*260)*power;
      this.particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s-100,color,life:.35+Math.random()*.5,max:.85,size:2+Math.random()*7});
    }
    if(this.particles.length>420)this.particles.splice(0,this.particles.length-420);
  }
  shake(strength){if(this.enabled)this.impact=Math.max(this.impact,strength);}
  drop(event,color){
    if(!this.enabled)return;
    const p=event.piece;
    if(event.to-event.from>1)p.matrix.forEach((row,y)=>row.forEach((cell,x)=>{
      if(cell)this.trails.push({x:(p.x+x)*60,y:Math.max(0,(event.from+y)*60),bottom:(event.to+y+1)*60,color,life:.24});
    }));
    const x=(p.x+p.matrix.length/2)*60,y=Math.min(1190,(event.to+p.matrix.length-1)*60);
    this.waves.push({x,y,life:.45,max:.45,color});
    this.burst(x,y,color,22,.8);this.shake(7);
  }
  lock(event,colors){
    const p=event.piece;
    if(event.spin && this.enabled){this.spirals.push({x:(p.x+1.5)*60,y:(p.y+1.5)*60,life:.8});this.burst((p.x+1.5)*60,(p.y+1.5)*60,'#ef91ff',55,1.4);this.shake(event.rows.length?12:5);}
    if(event.rows.length){
      for(const row of event.rows){
        this.flashes.push({y:row*60,life:.36,color:event.spin?'#f4ceff':'#eaffce'});
        for(let x=0;x<10;x++)this.burst(x*60+30,row*60+30,event.spin?'#ef91ff':event.rows.length===4?'#d5f56b':colors[p.type],9,event.rows.length===4?1.6:1);
      }
      this.shake(event.rows.length===4?16:8);
      this.waves.push({x:300,y:event.rows[0]*60,life:.6,max:.6,color:event.rows.length===4?'#d5f56b':'#ffffff'});
      this.shell.classList.remove('clear-impact','tetris-impact');void this.shell.offsetWidth;
      this.shell.classList.add(event.rows.length===4?'tetris-impact':'clear-impact');
    }else if(this.enabled){
      p.matrix.forEach((row,y)=>row.forEach((cell,x)=>{if(cell)this.burst((p.x+x+.5)*60,(p.y+y+1)*60,colors[p.type],3,.3);}));
      this.shake(2);
    }
  }
  step(ms){
    const dt=Math.min(ms,50)/1000;this.time+=dt;
    this.particles.forEach(p=>{p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=550*dt;p.vx*=Math.pow(.97,dt*60);});
    this.particles=this.particles.filter(p=>p.life>0);
    for(const items of [this.waves,this.trails,this.flashes,this.spirals]){items.forEach(p=>p.life-=dt);}
    this.waves=this.waves.filter(p=>p.life>0);this.trails=this.trails.filter(p=>p.life>0);this.flashes=this.flashes.filter(p=>p.life>0);
    this.spirals=this.spirals.filter(p=>p.life>0);
    this.impact*=Math.pow(.76,dt*60);
    if(this.enabled&&this.impact>.15){this.shell.style.transform=`translate(${Math.sin(this.time*130)*this.impact*.45}px,${Math.cos(this.time*100)*this.impact*.7}px)`;}
    else this.shell.style.transform='';
  }
  draw(){
    if(!this.enabled)return;
    const c=this.ctx;c.save();c.globalCompositeOperation='lighter';
    for(const s of this.spirals){c.globalAlpha=s.life/.8;c.strokeStyle='#ef91ff';c.lineWidth=3;for(let arm=0;arm<3;arm++){c.beginPath();for(let i=0;i<60;i++){const a=i*.09+arm*Math.PI*2/3+(1-s.life/.8)*8,r=i*(2.5+(1-s.life/.8)*2);const x=s.x+Math.cos(a)*r,y=s.y+Math.sin(a)*r;i?c.lineTo(x,y):c.moveTo(x,y);}c.stroke();}}
    for(const t of this.trails){
      const g=c.createLinearGradient(0,t.y,0,t.bottom);
      g.addColorStop(0,t.color+'00');g.addColorStop(1,t.color+'90');
      c.globalAlpha=t.life/.24;c.fillStyle=g;c.fillRect(t.x+4,t.y,52,t.bottom-t.y);
      c.fillStyle='#ffffff';c.fillRect(t.x+3,t.bottom-4,54,3);
    }
    for(const f of this.flashes){c.globalAlpha=f.life/.36;c.fillStyle=f.color;c.fillRect(0,f.y,600,60);c.fillStyle='#fff';c.fillRect(0,f.y+27,600,5);}
    for(const w of this.waves){
      c.globalAlpha=w.life/w.max*.7;c.strokeStyle=w.color;c.lineWidth=3*(w.life/w.max)+1;
      c.beginPath();c.ellipse(w.x,w.y,20+(1-w.life/w.max)*450,5+(1-w.life/w.max)*130,0,0,Math.PI*2);c.stroke();
    }
    for(const p of this.particles){
      c.globalAlpha=Math.min(1,p.life/.3);c.fillStyle=p.color;
      c.fillRect(p.x,p.y,p.size,p.size);c.globalAlpha*=.25;c.fillRect(p.x-p.vx*.012,p.y-p.vy*.012,p.size,p.size*2);
    }
    c.restore();
  }
}
class PulseAudio {
  constructor(){this.enabled=true;this.context=null;this.output=null;}
  init(){
    try{this.context ||= new (window.AudioContext||window.webkitAudioContext)();if(!this.output){this.output=this.context.createGain();this.output.gain.value=this.enabled?1:0;this.output.connect(this.context.destination);}if(this.context.state==='suspended')this.context.resume().catch(()=>{});return this.context;}catch(_){return null;}
  }
  note(freq,time,length=.12,type='sine',volume=.06,endFreq,destination){
    const c=this.context;if(!c)return;
    const o=c.createOscillator(),g=c.createGain();o.type=type;o.frequency.setValueAtTime(freq,time);
    if(endFreq)o.frequency.exponentialRampToValueAtTime(endFreq,time+length);
    g.gain.setValueAtTime(.001,time);g.gain.exponentialRampToValueAtTime(volume,time+.008);g.gain.exponentialRampToValueAtTime(.001,time+length);
    o.connect(g);g.connect(destination||this.output||c.destination);o.start(time);o.stop(time+length+.01);o.onended=()=>{o.disconnect();g.disconnect();};
  }
  noise(time,length=.1,volume=.06){
    const c=this.context,b=c.createBuffer(1,Math.floor(c.sampleRate*length),c.sampleRate),d=b.getChannelData(0);
    for(let i=0;i<d.length;i++)d[i]=(Math.random()*2-1)*(1-i/d.length);
    const s=c.createBufferSource(),g=c.createGain(),f=c.createBiquadFilter();s.buffer=b;f.type='lowpass';f.frequency.value=2800;
    g.gain.setValueAtTime(volume,time);g.gain.exponentialRampToValueAtTime(.001,time+length);s.connect(f);f.connect(g);g.connect(this.output||c.destination);s.start(time);s.onended=()=>{s.disconnect();f.disconnect();g.disconnect();};
  }
  play(kind,amount=1){
    if(!this.enabled)return;const c=this.init();if(!c)return;const t=c.currentTime;
    if(kind==='drop'){this.note(145,t,.18,'sine',.16,38);this.note(500,t,.055,'triangle',.035,80);this.noise(t,.09,.07);}
    else if(kind==='lock'){this.note(95,t,.06,'triangle',.025,50);}
    else if(kind==='spin'){this.note(80,t,.32,'sine',.16,30);[293.66,349.23,440,587.33,880].forEach((f,i)=>this.note(f,t+i*.04,.26,'triangle',.055));this.noise(t,.12,.07);}
    else if(kind==='overdrive'){[110,220,330,440,660,880].forEach((f,i)=>this.note(f,t+i*.05,.4,'sawtooth',.018));}
    else if(kind==='rotate'){this.note(420,t,.05,'sine',.035,650);}
    else if(kind==='hold'){this.note(350,t,.1,'sine',.04);this.note(525,t+.04,.1,'sine',.04);}
    else if(kind==='clear'){
      const notes=amount===4?[261.63,329.63,392,523.25,659.25,783.99]:[392,493.88,587.33,783.99].slice(0,amount+1);
      notes.forEach((f,i)=>this.note(f,t+i*.045,.26,'triangle',.045));
      this.note(75,t,.24,'sine',.13,32);this.noise(t,.16,.04);
    }else if(kind==='start'||kind==='level'){[329.63,440,659.25,880].forEach((f,i)=>this.note(f,t+i*.065,.18,'triangle',.04));}
    else if(kind==='over'){[329.63,261.63,164.81,82.41].forEach((f,i)=>this.note(f,t+i*.12,.3,'triangle',.045));}
  }
}
