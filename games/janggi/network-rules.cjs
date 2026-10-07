'use strict';
// One deterministic Korean Janggi rules engine is shared by the browser and server.
const VALUES={K:0,A:3,R:13,C:7,H:5,E:3,P:2};
const NAMES={K:'궁',A:'사',R:'차',C:'포',H:'마',E:'상',P:'졸'};
const at=(r,c)=>r*9+c, rc=i=>[Math.floor(i/9),i%9];
const inside=(r,c)=>r>=0&&r<10&&c>=0&&c<9;
const palace=(r,c,s)=>c>=3&&c<=5&&(s===1?r<=2:r>=7)&&inside(r,c);
const diagonals=[[3,13,23],[5,13,21],[66,76,86],[68,76,84]];
function diagonalNeighbors(i){const out=[]; for(const d of diagonals){const k=d.indexOf(i);if(k>=0){if(k>0)out.push(d[k-1]);if(k<2)out.push(d[k+1]);}}return out;}
function rays(i){const[r,c]=rc(i),out=[];for(const[dr,dc]of[[1,0],[-1,0],[0,1],[0,-1]]){const a=[];for(let n=1;inside(r+dr*n,c+dc*n);n++)a.push(at(r+dr*n,c+dc*n));out.push(a);}for(const d of diagonals){const k=d.indexOf(i);if(k>=0){out.push(d.slice(k+1));out.push(d.slice(0,k).reverse());}}return out;}
function pseudo(board,i){const p=board[i];if(!p)return[];const[r,c]=rc(i),out=[];const add=(rr,cc)=>{if(inside(rr,cc)){const j=at(rr,cc);if(!board[j]||board[j].s!==p.s)out.push(j);}};
 if(p.t==='K'||p.t==='A'){for(const[dr,dc]of[[1,0],[-1,0],[0,1],[0,-1]])if(palace(r+dr,c+dc,p.s))add(r+dr,c+dc);for(const j of diagonalNeighbors(i)){const[rr,cc]=rc(j);if(palace(rr,cc,p.s))add(rr,cc);}}
 if(p.t==='R'||p.t==='C'){for(const ray of rays(i)){let screen=p.t==='R';for(const j of ray){const q=board[j];if(!screen){if(q){if(q.t==='C')break;screen=true;}continue;}if(!q)out.push(j);else{if(q.s!==p.s&&(p.t!=='C'||q.t!=='C'))out.push(j);break;}}}}
 if(p.t==='H'||p.t==='E'){for(const[dr,dc]of[[1,0],[-1,0],[0,1],[0,-1]]){if(!inside(r+dr,c+dc)||board[at(r+dr,c+dc)])continue;for(const sign of[-1,1]){const er=dr?dr:sign,ec=dc?dc:sign;if(p.t==='H')add(r+dr+er,c+dc+ec);else if(inside(r+dr+er,c+dc+ec)&&!board[at(r+dr+er,c+dc+ec)])add(r+dr+2*er,c+dc+2*ec);}}}
 if(p.t==='P'){const f=p.s===0?-1:1;add(r+f,c);add(r,c-1);add(r,c+1);for(const j of diagonalNeighbors(i)){const[rr,cc]=rc(j);if(rr===r+f)add(rr,cc);}}
 return [...new Set(out)];
}
function check(board,s){const king=board.findIndex(p=>p&&p.s===s&&p.t==='K');if(king<0)return true;for(let i=0;i<90;i++)if(board[i]&&board[i].s!==s&&pseudo(board,i).includes(king))return true;return false;}
function facing(board){const a=board.findIndex(p=>p&&p.s===0&&p.t==='K'),b=board.findIndex(p=>p&&p.s===1&&p.t==='K');if(a<0||b<0||a%9!==b%9)return false;for(let i=Math.min(a,b)+9;i<Math.max(a,b);i+=9)if(board[i])return false;return true;}
function moved(board,from,to){const b=board.slice();b[to]=b[from];b[from]=null;return b;}
function legal(state,from){if(state.status!=='playing')return[];const p=state.board[from];if(!p||p.s!==state.turn)return[];const mustBreak=facing(state.board);return pseudo(state.board,from).filter(to=>{if(state.board[to]?.t==='K')return false;const b=moved(state.board,from,to);return !check(b,p.s)&&(!mustBreak||!facing(b));});}
function allMoves(state){const a=[];for(let from=0;from<90;from++)for(const to of legal(state,from))a.push({type:'move',from,to});if(!check(state.board,state.turn)&&!facing(state.board))a.push({type:'pass'});if(facing(state.board))a.push({type:'accept-bikjang'});return a;}
function signature(s){return s.turn+':'+s.board.map(p=>p?p.s+p.t:'.').join('');}
function create(options={}){const board=Array(90).fill(null);let id=0;for(const s of[1,0]){const r=s===1?0:9,pr=s===1?3:6,cr=s===1?2:7;const setup=Number(s===0?options.choSetup:options.hanSetup)||0;if(!Number.isInteger(setup)||setup<0||setup>3)throw Error('Invalid setup');const variants=[['H','E','E','H'],['E','H','H','E'],['H','E','H','E'],['E','H','E','H']];const v=variants[setup],row=['R',v[0],v[1],'A',null,'A',v[2],v[3],'R'];row.forEach((t,c)=>{if(t)board[at(r,c)]={t,s,id:id++};});board[at(s===1?1:8,4)]={t:'K',s,id:id++};for(const c of[1,7])board[at(cr,c)]={t:'C',s,id:id++};for(const c of[0,2,4,6,8])board[at(pr,c)]={t:'P',s,id:id++};}
const state={board,turn:0,status:'playing',winner:null,reason:'',ply:0,quiet:0,history:[],positions:[]};state.positions=[signature(state)];return state;}
function finish(state,winner,reason){state.status='finished';state.winner=winner;state.reason=reason;}
function apply(original,action,seat){if(!original||original.status!=='playing')throw Error('대국이 끝났습니다.');if(seat!==original.turn)throw Error('자신의 차례에 두세요.');if(!action||typeof action!=='object')throw Error('잘못된 수');const state={...original,board:original.board.slice(),history:original.history.slice(),positions:original.positions.slice()};
if(action.type==='resign'){finish(state,1-seat,'기권');return {state,status:state.status,winner:state.winner,reason:state.reason};}
let record={side:seat,type:action.type};
if(action.type==='accept-bikjang'){if(!facing(state.board))throw Error('빅장 상태가 아닙니다.');finish(state,null,'빅장 합의');state.history.push(record);return{state,status:state.status,winner:null,reason:state.reason};}
if(action.type==='pass'){if(check(state.board,seat)||facing(state.board))throw Error('장군 중에는 한 수 쉴 수 없습니다.');state.quiet++;}
else if(action.type==='move'){const{from,to}=action;if(!Number.isInteger(from)||!Number.isInteger(to)||from<0||from>89||to<0||to>89||!legal(state,from).includes(to))throw Error('둘 수 없는 자리입니다.');record={...record,from,to,piece:state.board[from].t,captured:state.board[to]?.t||null};state.quiet=state.board[to]?0:state.quiet+1;state.board=moved(state.board,from,to);}
else throw Error('지원하지 않는 수');
state.turn=1-seat;state.ply++;record.check=check(state.board,state.turn);state.history.push(record);state.positions.push(signature(state));
if(!facing(state.board)&&record.check&&!allMoves(state).length)finish(state,seat,'외통 장군');
else if(state.positions.filter(v=>v===state.positions.at(-1)).length>=3)finish(state,null,'동일 국면 3회 반복 · 친선 무승부');
else if(state.quiet>=100)finish(state,null,'100수 무포획 · 친선 무승부');
return{state,status:state.status,winner:state.winner,reason:state.reason};}
module.exports={create,apply,legal,allMoves,pseudo,check,facing,moved,signature,VALUES,NAMES};
