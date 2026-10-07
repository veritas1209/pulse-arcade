"""Bounded two-player rooms. Local movement, server-ordered attacks and results."""
import asyncio
import contextlib
import json
import math
import secrets
import time
import unicodedata
from collections import deque
from dataclasses import dataclass, field
from aiohttp import web, WSMsgType


def nickname(raw):
    if not isinstance(raw, str):
        raise ValueError('닉네임을 입력해 주세요.')
    name = unicodedata.normalize('NFKC', raw).strip()
    if not 2 <= len(name) <= 16 or any(not (c.isalnum() or c in ' _-.') for c in name):
        raise ValueError('닉네임은 한글·영문·숫자·공백·_-. 조합 2~16자입니다.')
    return name


def attack_power(lines, spin, combo, b2b, perfect):
    base = ([0, 2, 4, 6][lines] if spin == 'full' else [0, 0, 1][lines] if spin == 'mini' else [0, 0, 1, 2, 4][lines])
    return min(12, base + (1 if b2b else 0) + (min(4, max(0, combo) // 2) if lines else 0) + (6 if perfect else 0))


@dataclass
class Player:
    name: str
    ws: object
    ticket: str = field(default_factory=lambda: secrets.token_urlsafe(24))
    room: object = None
    seat: int = 0
    ready: bool = False
    disconnected: float = 0
    last_seq: int = 0
    combo: int = -1
    b2b: bool = False
    sent: int = 0
    received: int = 0
    pending: list = field(default_factory=list)
    receipts: dict = field(default_factory=dict)
    board: object = None
    dead: bool = False
    last_state: float = 0
    away: float = 0

    def reset(self):
        self.ready = False
        self.last_seq = 0
        self.combo = -1
        self.b2b = False
        self.sent = self.received = 0
        self.pending = []
        self.receipts = {}
        self.board = None
        self.dead = False


@dataclass
class Room:
    code: str
    players: list = field(default_factory=lambda: [None, None])
    phase: str = 'waiting'
    round: str = ''
    seed: int = 0
    start_at: float = 0
    start_mono: float = 0
    death_at: float = 0
    created: float = field(default_factory=time.monotonic)
    touched: float = field(default_factory=time.monotonic)
    wins: list = field(default_factory=lambda: [0, 0])
    result: object = None


class DuelHub:
    def __init__(self, origin, countdown=3.0, disconnect_grace=10.0):
        self.origin = origin
        self.countdown = countdown
        self.disconnect_grace = disconnect_grace
        self.rooms = {}
        self.players = {}
        self.sockets = set()
        self.creations = deque()

    def attach(self, app):
        app.router.add_get('/api/games/tetris/duel', self.connect)
        app.cleanup_ctx.append(self.lifecycle)

    async def lifecycle(self, app):
        task = asyncio.create_task(self.sweep())
        yield
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task
        for ws in list(self.sockets):
            await ws.close(code=1001, message=b'Server shutdown')

    async def send(self, player, data):
        ws = player.ws if isinstance(player, Player) else player
        if ws is None or ws.closed:
            return
        try:
            await asyncio.wait_for(ws.send_json(data), timeout=1)
        except (ConnectionError, RuntimeError, asyncio.TimeoutError):
            await ws.close()

    async def broadcast(self, room, data):
        await asyncio.gather(*(self.send(p, data) for p in room.players if p))

    async def room_state(self, room):
        await self.broadcast(room, {'type': 'room', 'code': room.code, 'phase': room.phase,
            'round': room.round, 'wins': room.wins,
            'players': [None if p is None else {'name': p.name, 'ready': p.ready,
                'connected': p.ws is not None and not p.ws.closed, 'away': bool(p.away)} for p in room.players]})

    async def start(self, room):
        room.phase = 'countdown'
        room.round = secrets.token_hex(8)
        room.seed = secrets.randbits(32)
        room.start_at = time.time() * 1000 + self.countdown * 1000
        room.start_mono = time.monotonic() + self.countdown
        room.death_at = 0
        room.result = None
        for p in room.players:
            p.reset()
        await self.broadcast(room, {'type': 'start', 'round': room.round, 'seed': room.seed,
            'start_at': room.start_at, 'server_ms': time.time() * 1000})
        await self.room_state(room)

    async def finish(self, room, winner, reason):
        if room.phase not in ('countdown', 'playing'):
            return
        room.phase = 'finished'
        room.touched = time.monotonic()
        if winner is not None:
            room.wins[winner] += 1
        for p in room.players:
            if p:
                p.ready = False
        room.result = {'type': 'result', 'round': room.round, 'winner': winner,
            'reason': reason, 'wins': room.wins[:],
            'attacks': [p.sent if p else 0 for p in room.players]}
        await self.broadcast(room, room.result)
        await self.room_state(room)

    async def remove(self, p):
        room = p.room
        if not room:
            return
        if room.phase in ('countdown', 'playing'):
            await self.finish(room, 1 - p.seat if room.players[1 - p.seat] else None, 'leave')
        room.players[p.seat] = None
        self.players.pop(p.ticket, None)
        p.room = None
        if not any(room.players):
            self.rooms.pop(room.code, None)
        else:
            room.phase = 'waiting'
            room.touched = time.monotonic()
            for remaining in room.players:
                if remaining:
                    remaining.ready = False
            await self.room_state(room)

    def live(self, room):
        if room.phase == 'countdown' and time.monotonic() >= room.start_mono:
            room.phase = 'playing'
        return room.phase == 'playing'

    async def sweep(self):
        while True:
            await asyncio.sleep(.1)
            now = time.monotonic()
            for room in list(self.rooms.values()):
                self.live(room)
                gone = [p for p in room.players if p and p.disconnected and now - p.disconnected > self.disconnect_grace]
                if gone and room.phase in ('countdown', 'playing'):
                    alive = [p for p in room.players if p and p not in gone and not p.dead]
                    await self.finish(room, alive[0].seat if len(alive) == 1 else None, 'disconnect')
                away = [p for p in room.players if p and p.away and now - p.away > self.disconnect_grace]
                if away and room.phase in ('countdown', 'playing'):
                    alive = [p for p in room.players if p and p not in away and not p.dead]
                    await self.finish(room, alive[0].seat if len(alive) == 1 else None, 'away')
                if room.phase == 'playing' and room.death_at and now - room.death_at >= .12:
                    alive = [p for p in room.players if p and not p.dead]
                    await self.finish(room, alive[0].seat if len(alive) == 1 else None, 'topout')
                if room.phase == 'playing' and now - room.start_mono >= 600:
                    await self.finish(room, None, 'time_limit')
                for p in gone:
                    await self.remove(p)
                if room.phase in ('waiting', 'finished') and now - room.touched > 900:
                    for p in list(room.players):
                        if p:
                            await self.send(p, {'type': 'expired', 'message': '대기 시간이 지나 방이 닫혔습니다.'})
                            await self.remove(p)

    def state_payload(self, data):
        rows = data.get('board')
        if not isinstance(rows, list) or len(rows) != 20 or any(not isinstance(r, str) or len(r) != 10 or any(c not in '.IJLOSTZG' for c in r) for r in rows):
            raise ValueError('게임판 정보가 올바르지 않습니다.')
        active = data.get('active')
        if active is not None:
            if not isinstance(active, dict) or active.get('type') not in 'IJLOSTZ' or not isinstance(active.get('type'), str) or len(active['type']) != 1:
                raise ValueError('블록 정보가 올바르지 않습니다.')
            x, y, matrix = active.get('x'), active.get('y'), active.get('matrix')
            if type(x) is not int or type(y) is not int or not -4 <= x <= 10 or not -4 <= y <= 20:
                raise ValueError('블록 위치가 올바르지 않습니다.')
            if not isinstance(matrix, list) or not 2 <= len(matrix) <= 4 or any(not isinstance(row, list) or len(row) != len(matrix) or any(type(c) is not int or c not in (0, 1) for c in row) for row in matrix):
                raise ValueError('블록 모양이 올바르지 않습니다.')
            active = {'type': active['type'], 'x': x, 'y': y, 'matrix': matrix}
        stats = {}
        for key, maximum in (('score', 50000000), ('lines', 10000), ('pieces', 100000)):
            value = data.get(key, 0)
            if type(value) is not int or not 0 <= value <= maximum:
                raise ValueError('기록 범위를 확인해 주세요.')
            stats[key] = value
        return {'board': rows, 'active': active, **stats}

    async def lock(self, p, data):
        room = p.room
        seq, lines, spin, perfect = data.get('seq'), data.get('lines'), data.get('spin'), data.get('perfect', False)
        if type(seq) is not int:
            raise ValueError('블록 순서가 올바르지 않습니다.')
        if seq in p.receipts:
            await self.send(p, p.receipts[seq])
            return
        if seq != p.last_seq + 1:
            raise ValueError('블록 순서가 어긋났습니다. 방을 다시 열어 주세요.')
        if type(lines) is not int or not 0 <= lines <= 4 or spin not in (None, 'full', 'mini') or (spin == 'full' and lines > 3) or (spin == 'mini' and lines > 2) or type(perfect) is not bool or (perfect and not lines):
            raise ValueError('클리어 정보가 올바르지 않습니다.')
        p.last_seq = seq
        p.combo = p.combo + 1 if lines else -1
        difficult = lines > 0 and (lines == 4 or spin is not None)
        b2b = difficult and p.b2b
        if lines:
            p.b2b = difficult
        power = attack_power(lines, spin, p.combo, b2b, perfect)
        original = power
        while power and p.pending:
            item = p.pending[0]
            cancel = min(power, len(item['holes']))
            item['holes'] = item['holes'][cancel:]
            power -= cancel
            if not item['holes']:
                p.pending.pop(0)
        holes = []
        if lines == 0:
            while p.pending and p.pending[0]['at'] <= time.monotonic() and len(holes) < 8:
                item = p.pending[0]
                amount = min(8 - len(holes), len(item['holes']))
                holes.extend(item['holes'][:amount])
                item['holes'] = item['holes'][amount:]
                if not item['holes']:
                    p.pending.pop(0)
        target = room.players[1 - p.seat]
        sent = 0
        if power and target and not target.dead:
            capacity = max(0, 40 - sum(len(item['holes']) for item in target.pending))
            sent = min(power, capacity)
            if sent:
                hole = secrets.randbelow(10)
                target.pending.append({'holes': [hole] * sent, 'at': time.monotonic() + .9})
                target.received += sent
                p.sent += sent
                await self.send(target, {'type': 'incoming', 'round': room.round, 'lines': sent,
                    'pending': sum(len(item['holes']) for item in target.pending)})
        receipt = {'type': 'settle', 'round': room.round, 'seq': seq, 'holes': holes,
            'attack': sent, 'cancelled': original - power,
            'pending': sum(len(item['holes']) for item in p.pending), 'sent': p.sent}
        p.receipts[seq] = receipt
        for old in sorted(p.receipts)[:-64]:
            p.receipts.pop(old, None)
        await self.send(p, receipt)

    async def connect(self, request):
        if request.headers.get('Origin') != self.origin:
            raise web.HTTPForbidden(text='허용되지 않은 출처입니다.')
        if len(self.sockets) >= 64:
            raise web.HTTPServiceUnavailable(text='대전 서버가 가득 찼습니다.')
        ws = web.WebSocketResponse(heartbeat=10, receive_timeout=25, max_msg_size=8192)
        await ws.prepare(request)
        self.sockets.add(ws)
        p = None
        timestamps = deque()
        errors = 0
        try:
            await self.send(ws, {'type': 'hello', 'server_ms': time.time() * 1000})
            async for msg in ws:
                if msg.type != WSMsgType.TEXT:
                    break
                now = time.monotonic()
                while timestamps and timestamps[0] < now - 1:
                    timestamps.popleft()
                timestamps.append(now)
                if len(timestamps) > 90:
                    await ws.close(code=1008, message=b'Too many messages')
                    break
                try:
                    data = json.loads(msg.data)
                    if not isinstance(data, dict):
                        raise ValueError('메시지 형식이 올바르지 않습니다.')
                    op = data.get('type')
                    if op == 'ping':
                        stamp = data.get('stamp', 0)
                        if type(stamp) not in (int, float) or not math.isfinite(stamp):
                            raise ValueError('시각 정보가 올바르지 않습니다.')
                        await self.send(ws, {'type': 'pong', 'stamp': stamp, 'server_ms': time.time() * 1000})
                        continue
                    if op == 'resume' and p is None:
                        ticket = data.get('ticket')
                        if not isinstance(ticket, str) or ticket not in self.players:
                            raise ValueError('방 연결을 복구할 수 없습니다.')
                        candidate = self.players[ticket]
                        if candidate.ws is not None and not candidate.ws.closed:
                            raise ValueError('이미 연결된 플레이어입니다.')
                        p = candidate
                        p.ws = ws
                        p.disconnected = 0
                        await self.send(p, {'type': 'resumed', 'round': p.room.round, 'phase': p.room.phase,
                            'start_at': p.room.start_at, 'seed': p.room.seed, 'pending': sum(len(i['holes']) for i in p.pending)})
                        ack = data.get('ack', 0)
                        if type(ack) is not int:
                            raise ValueError('복구 순서가 올바르지 않습니다.')
                        for seq, receipt in p.receipts.items():
                            if seq > ack:
                                await self.send(p, receipt)
                        if p.room.result:
                            await self.send(p, p.room.result)
                        await self.room_state(p.room)
                        continue
                    if op in ('create', 'join') and p is None:
                        name = nickname(data.get('name'))
                        if op == 'create':
                            while self.creations and self.creations[0] < now - 60:
                                self.creations.popleft()
                            if len(self.rooms) >= 32 or len(self.creations) >= 60:
                                raise ValueError('지금은 새 방을 열 수 없습니다. 잠시 후 다시 시도해 주세요.')
                            self.creations.append(now)
                            code = ''.join(secrets.choice('ABCDEFGHJKLMNPQRSTUVWXYZ23456789') for _ in range(6))
                            while code in self.rooms:
                                code = ''.join(secrets.choice('ABCDEFGHJKLMNPQRSTUVWXYZ23456789') for _ in range(6))
                            room = Room(code)
                            self.rooms[code] = room
                        else:
                            code = data.get('code', '')
                            if not isinstance(code, str):
                                raise ValueError('방 코드를 확인해 주세요.')
                            room = self.rooms.get(code.strip().upper())
                            if not room:
                                raise ValueError('방을 찾을 수 없습니다. 초대 링크를 확인해 주세요.')
                            if all(room.players) or room.phase in ('playing', 'countdown'):
                                raise ValueError('이미 두 명이 입장한 방입니다.')
                        seat = room.players.index(None)
                        p = Player(name, ws, room=room, seat=seat)
                        room.players[seat] = p
                        room.touched = now
                        self.players[p.ticket] = p
                        await self.send(p, {'type': 'joined', 'code': room.code, 'seat': seat, 'ticket': p.ticket})
                        await self.room_state(room)
                        continue
                    if p is None or p.room is None:
                        raise ValueError('먼저 대전 방에 입장해 주세요.')
                    room = p.room
                    if op == 'leave':
                        await self.remove(p)
                        p = None
                        await self.send(ws, {'type': 'left'})
                        continue
                    if op == 'focus':
                        p.away = now if data.get('hidden') is True else 0
                        await self.room_state(room)
                        continue
                    if op == 'ready' and room.phase in ('waiting', 'finished'):
                        p.ready = data.get('ready') is True
                        room.touched = now
                        if all(player and player.ready and not player.away and player.ws is not None and not player.ws.closed for player in room.players):
                            await self.start(room)
                        else:
                            await self.room_state(room)
                        continue
                    if data.get('round') != room.round:
                        continue
                    if op == 'surrender' and room.phase in ('countdown', 'playing'):
                        await self.finish(room, 1 - p.seat, 'surrender')
                        continue
                    if not self.live(room):
                        continue
                    if op == 'state' and now - p.last_state >= .04:
                        p.board = self.state_payload(data)
                        p.last_state = now
                        target = room.players[1 - p.seat]
                        if target:
                            await self.send(target, {'type': 'opponent', 'round': room.round, **p.board})
                    elif op == 'lock' and not p.dead:
                        await self.lock(p, data)
                    elif op == 'topout':
                        p.dead = True
                        room.death_at = room.death_at or now
                except (ValueError, TypeError, KeyError) as exc:
                    errors += 1
                    await self.send(ws, {'type': 'error', 'message': str(exc)[:160]})
                    if errors >= 8:
                        await ws.close(code=1008, message=b'Invalid messages')
                        break
        finally:
            self.sockets.discard(ws)
            if p is not None and p.ws is ws:
                p.ws = None
                p.disconnected = time.monotonic()
                if p.room:
                    if p.room.phase in ('waiting', 'finished'):
                        p.ready = False
                    await self.room_state(p.room)
        return ws
