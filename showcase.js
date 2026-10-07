/* Scripted attract sequence. Every spin uses the actual rotation and scoring rules. */
class PulseShowcase {
  constructor(game,changed){this.game=game;this.changed=changed;this.time=0;this.index=0;
    this.cues=[[0,()=>this.prepare('tetris')],[950,()=>this.drop()],[2400,()=>this.prepare('double')],[3150,()=>this.rotate()],[3450,()=>this.drop()],[4900,()=>this.prepare('tetris')],[5700,()=>this.drop()],[7150,()=>this.prepare('triple')],[7900,()=>this.rotate()],[8250,()=>this.drop()]];
  }
  prepare(kind){
    const g=this.game;g.board=Array.from({length:20},()=>Array(10).fill(null));g.lastRotation=null;g.gravity=0;g.lockTime=0;g.lockResets=0;
    if(kind==='tetris'){
      const types=['J','L','S','Z'];for(let y=16;y<20;y++)for(let x=0;x<10;x++)if(x!==4)g.board[y][x]=types[Math.floor(x/3)%4];
      g.active=g.makePiece('I');g.active.matrix=[[0,0,1,0],[0,0,1,0],[0,0,1,0],[0,0,1,0]];g.active.rotation=1;g.active.x=2;g.active.y=1;
    }else if(kind==='double'){
      g.board[17][3]='J';for(let x=0;x<10;x++){if(![3,4,5].includes(x))g.board[18][x]=x<4?'J':'L';if(x!==4)g.board[19][x]=x<4?'S':'Z';}
      g.active=g.makePiece('T');g.active.matrix=[[0,1,0],[0,1,1],[0,1,0]];g.active.rotation=1;g.active.x=3;g.active.y=17;
    }else{
      for(let y=17;y<20;y++)for(let x=0;x<10;x++)if(x!==4&&!(y===18&&x===5))g.board[y][x]=['J','S','L'][y-17];
      g.board[15][4]='Z';g.active=g.makePiece('T');g.active.x=4;g.active.y=15;
    }
    this.changed();
  }
  rotate(){this.game.rotate(1);this.changed();}
  drop(){this.game.hardDrop();this.changed();}
  update(ms){this.time+=Math.min(ms,100);while(this.index<this.cues.length&&this.time>=this.cues[this.index][0])this.cues[this.index++][1]();return this.time>=11100;}
}
if(typeof module !== 'undefined' && module.exports)module.exports={PulseShowcase};
