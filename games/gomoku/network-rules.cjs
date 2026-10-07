var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/rules.js
var rules_exports = {};
__export(rules_exports, {
  DIRECTIONS: () => DIRECTIONS,
  SIZE: () => SIZE,
  apply: () => apply,
  candidates: () => candidates,
  chooseMove: () => chooseMove,
  chooseMoveAsync: () => chooseMoveAsync,
  coordinate: () => coordinate,
  create: () => create,
  search: () => search,
  undo: () => undo,
  winningLine: () => winningLine
});
module.exports = __toCommonJS(rules_exports);
var SIZE = 15;
var DIRECTIONS = [[1, 0], [0, 1], [1, 1], [1, -1]];
var coordinate = (x, y) => `${"ABCDEFGHJKLMNOP"[x]}${15 - y}`;
function create(options = {}) {
  return { board: Array(225).fill(0), turn: 0, history: [], winner: null, status: "playing", winning: [] };
}
function winningLine(board, x, y, stone) {
  for (const [dx, dy] of DIRECTIONS) {
    const line = [[x, y]];
    for (const sign of [-1, 1]) {
      let nx = x + dx * sign, ny = y + dy * sign;
      while (nx >= 0 && nx < 15 && ny >= 0 && ny < 15 && board[ny * 15 + nx] === stone) {
        sign < 0 ? line.unshift([nx, ny]) : line.push([nx, ny]);
        nx += dx * sign;
        ny += dy * sign;
      }
    }
    if (line.length >= 5) return line;
  }
  return [];
}
function apply(state, action, seat) {
  if (state.status !== "playing") throw new Error("\uC774\uBBF8 \uB05D\uB09C \uB300\uAD6D\uC785\uB2C8\uB2E4.");
  if (seat !== state.turn) throw new Error("\uC0C1\uB300 \uCC28\uB840\uC785\uB2C8\uB2E4.");
  if (!action || action.type !== "place" || !Number.isInteger(action.x) || !Number.isInteger(action.y) || action.x < 0 || action.x >= 15 || action.y < 0 || action.y >= 15) throw new Error("\uCC29\uC218 \uC704\uCE58\uAC00 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.");
  const { x, y } = action, index = y * 15 + x;
  if (state.board[index]) throw new Error("\uC774\uBBF8 \uB3CC\uC774 \uC788\uB294 \uC790\uB9AC\uC785\uB2C8\uB2E4.");
  const next = { ...state, board: state.board.slice(), history: state.history.slice(), turn: 1 - seat };
  next.board[index] = seat + 1;
  next.history.push({ x, y, seat });
  next.winning = winningLine(next.board, x, y, seat + 1);
  if (next.winning.length) {
    next.status = "finished";
    next.winner = seat;
  } else if (next.history.length === 225) {
    next.status = "finished";
    next.winner = null;
  }
  return { state: next, status: next.status, winner: next.winner, reason: next.status === "finished" ? next.winner === null ? "draw" : "five-in-row" : void 0 };
}
function undo(state, count = 1) {
  let next = create();
  for (const move of state.history.slice(0, Math.max(0, state.history.length - count))) next = apply(next, { type: "place", x: move.x, y: move.y }, move.seat).state;
  return next;
}
function candidates(board) {
  if (!board.some(Boolean)) return [{ x: 7, y: 7 }];
  const result = [];
  for (let y = 0; y < 15; y++) for (let x = 0; x < 15; x++) {
    if (board[y * 15 + x]) continue;
    let near = false;
    for (let yy = Math.max(0, y - 2); yy <= Math.min(14, y + 2) && !near; yy++) for (let xx = Math.max(0, x - 2); xx <= Math.min(14, x + 2); xx++) if (board[yy * 15 + xx]) {
      near = true;
      break;
    }
    if (near) result.push({ x, y });
  }
  return result;
}
function shape(board, x, y, stone) {
  let score = 0;
  for (const [dx, dy] of DIRECTIONS) {
    let line = "";
    for (let k = -5; k <= 5; k++) {
      const xx = x + dx * k, yy = y + dy * k;
      line += xx < 0 || yy < 0 || xx >= 15 || yy >= 15 ? "2" : k === 0 ? "1" : board[yy * 15 + xx] === stone ? "1" : board[yy * 15 + xx] === 0 ? "0" : "2";
    }
    if (line.includes("11111")) score += 1e7;
    else if (line.includes("011110")) score += 14e4;
    else if (/01111|11110|11101|11011|10111/.test(line)) score += 2e4;
    else if (/01110|010110|011010/.test(line)) score += 7e3;
    else if (/001110|011100|01011|11010|10110|01101/.test(line)) score += 700;
    else if (/001100|001010|010100/.test(line)) score += 350;
    else if (line.includes("11")) score += 25;
  }
  return score;
}
function* search(state, budget = 280, clock = () => performance.now()) {
  const board = state.board.slice(), mine = state.turn + 1, theirs = 3 - mine, all = candidates(board), start = clock();
  if (!all.length) return null;
  for (const move of all) {
    board[move.y * 15 + move.x] = mine;
    const win = winningLine(board, move.x, move.y, mine).length;
    board[move.y * 15 + move.x] = 0;
    if (win) return move;
    yield null;
  }
  for (const move of all) {
    board[move.y * 15 + move.x] = theirs;
    const win = winningLine(board, move.x, move.y, theirs).length;
    board[move.y * 15 + move.x] = 0;
    if (win) return move;
    yield null;
  }
  const ranked = [];
  for (const move of all) {
    const attack = shape(board, move.x, move.y, mine), defense = shape(board, move.x, move.y, theirs);
    ranked.push({ ...move, score: attack + defense * 1.08 + (14 - Math.abs(7 - move.x) - Math.abs(7 - move.y)) });
    yield null;
  }
  ranked.sort((a, b) => b.score - a.score);
  let best = ranked[0], bestValue = -Infinity;
  for (const move of ranked.slice(0, 12)) {
    if (clock() - start > budget) break;
    board[move.y * 15 + move.x] = mine;
    let danger = 0;
    for (const reply of candidates(board)) {
      danger = Math.max(danger, shape(board, reply.x, reply.y, theirs));
      yield null;
      if (clock() - start > budget) break;
    }
    board[move.y * 15 + move.x] = 0;
    const value = move.score - danger * 0.85;
    if (value > bestValue) {
      bestValue = value;
      best = move;
    }
    yield null;
  }
  return { x: best.x, y: best.y };
}
function chooseMove(state, budget = 280) {
  const it = search(state, budget);
  let item;
  do {
    item = it.next();
  } while (!item.done);
  return item.value;
}
function chooseMoveAsync(state, { budget = 280, signal } = {}) {
  return new Promise((resolve) => {
    const iterator = search(state, budget);
    function step() {
      if (signal?.aborted) {
        resolve(null);
        return;
      }
      const stop = performance.now() + 6;
      let result;
      do {
        result = iterator.next();
        if (result.done) {
          resolve(result.value);
          return;
        }
      } while (performance.now() < stop);
      setTimeout(step, 0);
    }
    setTimeout(step, 0);
  });
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  DIRECTIONS,
  SIZE,
  apply,
  candidates,
  chooseMove,
  chooseMoveAsync,
  coordinate,
  create,
  search,
  undo,
  winningLine
});
