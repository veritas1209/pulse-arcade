/* Pure game rules: no DOM or external dependencies. Also usable from Node tests. */
(function (root) {
  'use strict';
  const SHAPES = {
    I: [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]],
    J: [[1,0,0],[1,1,1],[0,0,0]],
    L: [[0,0,1],[1,1,1],[0,0,0]],
    O: [[1,1],[1,1]],
    S: [[0,1,1],[1,1,0],[0,0,0]],
    T: [[0,1,0],[1,1,1],[0,0,0]],
    Z: [[1,1,0],[0,1,1],[0,0,0]]
  };
  // SRS kick offsets in board coordinates (positive y points down).
  const KICKS = {
    '0>1':[[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],
    '1>0':[[0,0],[1,0],[1,1],[0,-2],[1,-2]],
    '1>2':[[0,0],[1,0],[1,1],[0,-2],[1,-2]],
    '2>1':[[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],
    '2>3':[[0,0],[1,0],[1,-1],[0,2],[1,2]],
    '3>2':[[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],
    '3>0':[[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],
    '0>3':[[0,0],[1,0],[1,-1],[0,2],[1,2]]
  };
  const I_KICKS = {
    '0>1':[[0,0],[-2,0],[1,0],[-2,1],[1,-2]],
    '1>0':[[0,0],[2,0],[-1,0],[2,-1],[-1,2]],
    '1>2':[[0,0],[-1,0],[2,0],[-1,-2],[2,1]],
    '2>1':[[0,0],[1,0],[-2,0],[1,2],[-2,-1]],
    '2>3':[[0,0],[2,0],[-1,0],[2,-1],[-1,2]],
    '3>2':[[0,0],[-2,0],[1,0],[-2,1],[1,-2]],
    '3>0':[[0,0],[1,0],[-2,0],[1,2],[-2,-1]],
    '0>3':[[0,0],[-1,0],[2,0],[-1,-2],[2,1]]
  };
  class TetrisEngine {
    constructor(random = Math.random) { this.random = random; this.reset(); }
    reset() {
      this.board = Array.from({length:20}, () => Array(10).fill(null));
      this.queue = []; this.bag = []; this.active = null; this.held = null;
      this.canHold = true; this.score = 0; this.lines = 0; this.level = 1;
      this.over = false; this.gravity = 0; this.lockTime = 0; this.lockResets = 0;
      this.lastClear = 0; this.pieces = 0; this.combo = -1; this.backToBack = false; this.events = []; this.lastRotation = null; this.b2bChain = 0;
      this.fillQueue(); this.spawn();
    }
    fillQueue() {
      while (this.queue.length < 5) {
        if (!this.bag.length) {
          this.bag = Object.keys(SHAPES);
          for (let i = this.bag.length - 1; i > 0; i--) {
            const j = Math.floor(this.random() * (i + 1));
            [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
          }
        }
        this.queue.push(this.bag.pop());
      }
    }
    makePiece(type) { return {type, matrix:SHAPES[type].map(row => row.slice()), x:type === 'O' ? 4 : 3, y:-1, rotation:0}; }
    spawn(type) {
      this.active = this.makePiece(type || this.queue.shift());
      this.lastRotation = null; this.fillQueue(); this.gravity = 0; this.lockTime = 0; this.lockResets = 0;
      if (this.collides(this.active)) this.over = true;
    }
    collides(piece, dx = 0, dy = 0, matrix = piece.matrix) {
      return matrix.some((row, y) => row.some((cell, x) => {
        if (!cell) return false;
        const bx = piece.x + x + dx, by = piece.y + y + dy;
        return bx < 0 || bx >= 10 || by >= 20 || (by >= 0 && this.board[by][bx] !== null);
      }));
    }
    grounded() { return this.collides(this.active, 0, 1); }
    resetLock(wasGrounded) {
      if (wasGrounded && this.lockResets < 15) { this.lockTime = 0; this.lockResets++; }
    }
    move(dx) {
      if (this.over || this.collides(this.active, dx)) return false;
      const ground = this.grounded(); this.active.x += dx; this.lastRotation = null; this.resetLock(ground); return true;
    }
    rotate(direction = 1) {
      if (this.over || this.active.type === 'O') return false;
      const a = this.active.matrix, n = a.length;
      const rotated = a.map((row, y) => row.map((_, x) => direction > 0 ? a[n-1-x][y] : a[x][n-1-y]));
      const ground = this.grounded(), from = this.active.rotation || 0;
      const to = (from + (direction > 0 ? 1 : 3)) % 4;
      const kicks = (this.active.type === 'I' ? I_KICKS : KICKS)[from+'>'+to];
      for (let index=0;index<kicks.length;index++) {
        const [dx,dy]=kicks[index];
        if (!this.collides(this.active, dx, dy, rotated)) {
          this.active.matrix = rotated; this.active.x += dx; this.active.y += dy;this.active.rotation=to;
          this.lastRotation={from,to,kick:index};this.resetLock(ground); return true;
        }
      }
      return false;
    }
    softDrop() {
      if (this.over || this.grounded()) return false;
      this.active.y++; this.lastRotation = null; this.score++; this.gravity = 0; this.lockTime = 0; return true;
    }
    ghostY() {
      let dy = 0;
      while (!this.collides(this.active, 0, dy + 1)) dy++;
      return this.active.y + dy;
    }
    hardDrop() {
      if (this.over) return;
      const y = this.ghostY(); this.score += (y - this.active.y) * 2;
      this.events.push({type:'drop', piece:{...this.active}, from:this.active.y, to:y});
      if(y !== this.active.y)this.lastRotation = null;
      this.active.y = y; this.lock();
    }
    hold() {
      if (this.over || !this.canHold) return false;
      const type = this.active.type, old = this.held;
      this.held = type; this.spawn(old); this.canHold = false; return true;
    }
    spinType() {
      if(this.active.type !== 'T' || !this.lastRotation)return null;
      const p=this.active;
      const occupied=(x,y)=>x<0||x>=10||y>=20||(y>=0&&Boolean(this.board[y][x]));
      const corners=[[0,0],[2,0],[2,2],[0,2]].map(([x,y])=>occupied(p.x+x,p.y+y));
      if(corners.filter(Boolean).length<3)return null;
      const front=[[0,1],[1,2],[2,3],[3,0]][p.rotation];
      return front.every(i=>corners[i]) || this.lastRotation.kick===4 ? 'full' : 'mini';
    }
    lock() {
      const p = this.active;
      // A block that cannot fit fully inside the board ends the game.
      if (p.matrix.some((row,y) => row.some(cell => cell && p.y + y < 0))) { this.over = true; return; }
      const spin=this.spinType();
      p.matrix.forEach((row,y) => row.forEach((cell,x) => { if (cell) this.board[p.y+y][p.x+x] = p.type; }));
      const clearedRows = this.board.map((row,y) => row.every(Boolean) ? y : -1).filter(y => y >= 0);
      const oldLevel = this.level;
      const remaining = this.board.filter(row => row.some(cell => cell === null));
      this.lastClear = 20 - remaining.length;
      const spinBase=spin === 'mini' ? [100,200,400,1600] : [400,800,1200,1600];
      let reward = (spin ? spinBase[this.lastClear] : [0,100,300,500,800][this.lastClear]) * this.level;
      const difficult=this.lastClear>0 && (this.lastClear===4 || Boolean(spin));
      const b2b=difficult && this.backToBack;
      if (this.lastClear) {
        this.combo++;
        if(b2b)reward=Math.floor(reward*1.5);
        this.b2bChain=difficult ? this.b2bChain+1 : 0;
        this.backToBack=difficult;
        reward += Math.max(0,this.combo) * 50 * this.level;
      } else this.combo = -1;
      this.score += reward;
      const perfectClear=this.lastClear>0 && remaining.every(row=>row.every(cell=>cell===null));
      this.events.push({type:'lock',piece:{...p},rows:clearedRows,reward,combo:this.combo,spin,b2b,b2bChain:this.b2bChain,perfectClear});
      this.lines += this.lastClear; this.level = 1 + Math.floor(this.lines / 10);
      while (remaining.length < 20) remaining.unshift(Array(10).fill(null));
      if(this.level > oldLevel) this.events.push({type:'level', level:this.level});
      this.board = remaining; this.canHold = true; this.pieces++; this.spawn();
    }
    // Called at a piece boundary by versus mode, never during local movement.
    riseGarbage(holes) {
      if (!Array.isArray(holes) || holes.length > 20 || holes.some(h=>!Number.isInteger(h)||h<0||h>9)) throw new Error('Invalid garbage rows');
      if (!holes.length || this.over) return;
      const overflow=this.board.slice(0,holes.length).some(row=>row.some(Boolean));
      this.board=this.board.slice(holes.length).concat(holes.map(h=>Array.from({length:10},(_,x)=>x===h?null:'G')));
      this.over=overflow||this.collides(this.active);
      this.events.push({type:'garbage',count:holes.length});
    }
    tick(ms) {
      if (this.over) return;
      const dt = Math.min(Math.max(ms, 0), 100);
      this.gravity += dt;
      const interval = Math.max(70, 850 * Math.pow(.8, this.level - 1));
      while (this.gravity >= interval) {
        this.gravity -= interval;
        if (!this.grounded()) { this.active.y++; this.lastRotation = null; }
      }
      if (this.grounded()) {
        this.lockTime += dt;
        if (this.lockTime >= 500) this.lock();
      } else { this.lockTime = 0; }
    }
  }
  function seededRandom(seed) {
    let value=seed>>>0;
    return ()=>{value=(value+0x6D2B79F5)>>>0;let t=value;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};
  }
  const api = {TetrisEngine, SHAPES, seededRandom};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else Object.assign(root, api);
})(typeof globalThis !== 'undefined' ? globalThis : this);
