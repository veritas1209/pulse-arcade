"""Online board rooms with a shared JavaScript rules worker and canonical state."""
import asyncio, contextlib, json, os, secrets, shutil, time
from collections import deque
from dataclasses import dataclass, field
from pathlib import Path
from aiohttp import web, WSMsgType
try:
    from .duel import nickname
except ImportError:
    from duel import nickname

class RulesBridge:
    def __init__(self, root, node=None):
        self.root=Path(root);self.node=node or os.environ.get('PULSE_NODE') or shutil.which('node')
        self.process=None;self.lock=asyncio.Lock();self.sequence=0
    async def start(self):
        if self.process is not None and self.process.returncode is None:return
        if not self.node:raise RuntimeError('온라인 규칙 엔진을 시작할 수 없습니다.')
        kwargs={'creationflags':0x08000000} if os.name=='nt' else {}
        self.process=await asyncio.create_subprocess_exec(self.node,'--max-old-space-size=96',str(Path(__file__).with_name('board-worker.cjs')),str(self.root),stdin=asyncio.subprocess.PIPE,stdout=asyncio.subprocess.PIPE,stderr=asyncio.subprocess.DEVNULL,limit=1048576,**kwargs)
    async def close(self):
        process,self.process=self.process,None
        if process and process.returncode is None:
            process.terminate()
            try:await asyncio.wait_for(process.wait(),2)
            except asyncio.TimeoutError:process.kill();await process.wait()
    async def request(self,op,**data):
        async with self.lock:
            try:
                await self.start();self.sequence+=1
                packet=json.dumps({'id':self.sequence,'op':op,**data},ensure_ascii=False).encode()+b'\n'
                self.process.stdin.write(packet);await self.process.stdin.drain()
                line=await asyncio.wait_for(self.process.stdout.readline(),3)
                result=json.loads(line)
                if result.get('id')!=self.sequence:raise RuntimeError('규칙 응답 순서 오류')
                if not result.get('ok'):raise ValueError(result.get('error','둘 수 없는 수입니다.'))
                return result['value']
            except ValueError:raise
            except (OSError,RuntimeError,asyncio.TimeoutError,json.JSONDecodeError) as exc:
                await self.close();raise RuntimeError('규칙 확인이 지연됐습니다. 같은 수를 다시 시도해 주세요.') from exc

@dataclass
class BoardPlayer:
    name:str
    ws:object
    ticket:str=field(default_factory=lambda:secrets.token_urlsafe(24))
    room:object=None
    seat:int=0
    ready:bool=False
    options:dict=field(default_factory=dict)
    disconnected:float=0
    receipts:set=field(default_factory=set)

@dataclass
class BoardRoom:
    game:str
    code:str
    players:list=field(default_factory=lambda:[None,None])
    phase:str='waiting'
    round:str=''
    state:object=None
    revision:int=0
    winner:object=None
    reason:str=''
    wins:list=field(default_factory=lambda:[0,0])
    start_at:float=0
    started:float=0
    touched:float=field(default_factory=time.monotonic)
    draw_offer:object=None
    mutex:object=field(default_factory=asyncio.Lock)

class BoardHub:
    def __init__(self,root,origin,games=None,countdown=3,grace=30,bridge=None):
        self.origin=origin;self.games=set(games or ['gomoku','janggi','chess']);self.countdown=countdown;self.grace=grace
        self.bridge=bridge or RulesBridge(root);self.rooms={};self.players={};self.sockets=set();self.creations=deque()
    def attach(self,app):
        app.router.add_get('/api/board/{game}/ws',self.connect);app.cleanup_ctx.append(self.lifecycle)
    async def lifecycle(self,app):
        await self.bridge.request('ping');task=asyncio.create_task(self.sweep())
        yield
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):await task
        for ws in list(self.sockets):await ws.close(code=1001,message=b'Server restart')
        await self.bridge.close()
    async def send(self,player,data):
        ws=player.ws if isinstance(player,BoardPlayer) else player
        if ws is None or ws.closed:return
        try:await asyncio.wait_for(ws.send_json(data),2)
        except (ConnectionError,RuntimeError,asyncio.TimeoutError):await ws.close()
    def describe(self,room):
        return {'type':'room','game':room.game,'code':room.code,'phase':room.phase,'round':room.round,'revision':room.revision,
            'winner':room.winner,'reason':room.reason,'wins':room.wins[:],'start_at':room.start_at,'server_ms':time.time()*1000,
            'draw_offer':room.draw_offer,'players':[None if p is None else {'name':p.name,'ready':p.ready,'connected':p.ws is not None and not p.ws.closed} for p in room.players]}
    async def room_state(self,room):
        message=self.describe(room)
        await asyncio.gather(*(self.send(p,message) for p in room.players if p))
    async def snapshot(self,room,player=None,ack=None):
        message={**self.describe(room),'type':'snapshot','state':room.state,'ack':ack}
        await asyncio.gather(*(self.send(p,message) for p in ([player] if player else room.players) if p))
    async def begin(self,room):
        options={'choSetup':room.players[0].options.get('setup',0),'hanSetup':room.players[1].options.get('setup',0)} if room.game=='janggi' else {}
        result=await self.bridge.request('create',game=room.game,options=options)
        room.state=result['state'];room.revision=0;room.winner=None;room.reason='';room.draw_offer=None;room.round=secrets.token_hex(8)
        room.phase='countdown';room.start_at=time.time()*1000+self.countdown*1000;room.started=time.monotonic()+self.countdown;room.touched=time.monotonic()
        for p in room.players:p.ready=False;p.receipts.clear()
        await self.snapshot(room)
    async def finish(self,room,winner,reason):
        if room.phase not in ('playing','countdown'):return
        room.phase='finished';room.winner=winner;room.reason=reason;room.draw_offer=None;room.touched=time.monotonic()
        if winner is not None:room.wins[winner]+=1
        for p in room.players:
            if p:p.ready=False
        await self.snapshot(room)
    async def remove(self,p):
        room=p.room
        if not room:return
        if room.phase in ('countdown','playing'):await self.finish(room,1-p.seat if room.players[1-p.seat] else None,'leave')
        room.players[p.seat]=None;self.players.pop(p.ticket,None);p.room=None
        if not any(room.players):self.rooms.pop((room.game,room.code),None)
        else:
            if room.phase!='finished':room.phase='waiting'
            for other in room.players:
                if other:other.ready=False
            room.touched=time.monotonic();await self.room_state(room)
    async def sweep(self):
        while True:
            await asyncio.sleep(.25);now=time.monotonic()
            for room in list(self.rooms.values()):
                async with room.mutex:
                    if room.phase=='countdown' and now>=room.started:room.phase='playing';await self.snapshot(room)
                    gone=[p for p in room.players if p and p.disconnected and now-p.disconnected>self.grace]
                    if gone and room.phase in ('playing','countdown'):
                        connected=[p for p in room.players if p and p not in gone]
                        await self.finish(room,connected[0].seat if len(connected)==1 else None,'disconnect')
                    for p in gone:await self.remove(p)
                    if room.phase=='playing' and now-room.started>7200:await self.finish(room,None,'time_limit')
                    if room.phase in ('waiting','finished') and now-room.touched>1800:
                        for p in list(room.players):
                            if p:await self.send(p,{'type':'expired','message':'대기 시간이 지나 방이 닫혔습니다.'});await self.remove(p)
    async def action(self,p,data):
        room=p.room
        async with room.mutex:
            request_id=data.get('request_id')
            if not isinstance(request_id,str) or not 8<=len(request_id)<=64:raise ValueError('수 요청을 확인해 주세요.')
            if data.get('round')!=room.round:await self.snapshot(room,p);raise ValueError('이전 대국의 수입니다. 현재 판을 확인해 주세요.')
            if request_id in p.receipts:await self.snapshot(room,p,request_id);return
            if room.phase!='playing':raise ValueError('대국이 진행 중일 때만 둘 수 있습니다.')
            if not all(peer and peer.ws is not None and not peer.ws.closed for peer in room.players):raise ValueError('상대가 다시 연결될 때까지 기다려 주세요.')
            if data.get('revision')!=room.revision:await self.snapshot(room,p);raise ValueError('대국 상태를 갱신했습니다. 수를 다시 선택해 주세요.')
            if room.state.get('turn')!=p.seat:raise ValueError('상대 차례입니다.')
            action=data.get('action')
            if not isinstance(action,dict):raise ValueError('수 형식이 올바르지 않습니다.')
            result=await self.bridge.request('apply',game=room.game,state=room.state,action=action,seat=p.seat)
            room.state=result['state'];room.revision+=1;room.touched=time.monotonic();room.draw_offer=None;p.receipts.add(request_id)
            if len(p.receipts)>4096:await self.finish(room,None,'move_limit');return
            if result['status']=='finished':await self.finish(room,result['winner'],result.get('reason','game_over'))
            else:await self.snapshot(room,ack=request_id)
    async def connect(self,request):
        game=request.match_info['game']
        if game not in self.games:raise web.HTTPNotFound()
        if request.headers.get('Origin')!=self.origin:raise web.HTTPForbidden(text='허용되지 않은 출처입니다.')
        if len(self.sockets)>=64:raise web.HTTPServiceUnavailable(text='온라인 대국이 혼잡합니다.')
        ws=web.WebSocketResponse(heartbeat=20,receive_timeout=90,max_msg_size=8192);await ws.prepare(request);self.sockets.add(ws)
        p=None;messages=deque();errors=0
        try:
            await self.send(ws,{'type':'hello','server_ms':time.time()*1000,'grace':self.grace})
            async for msg in ws:
                if msg.type!=WSMsgType.TEXT:break
                now=time.monotonic()
                while messages and messages[0]<now-1:messages.popleft()
                messages.append(now)
                if len(messages)>30:await ws.close(code=1008,message=b'Too many messages');break
                data={}
                try:
                    data=json.loads(msg.data)
                    if not isinstance(data,dict):raise ValueError('잘못된 메시지입니다.')
                    op=data.get('type')
                    if op=='ping':
                        stamp=data.get('stamp');await self.send(ws,{'type':'pong','stamp':stamp if type(stamp) in (int,float) else 0,'server_ms':time.time()*1000});continue
                    if op=='resume' and p is None:
                        token=data.get('ticket');candidate=self.players.get(token) if isinstance(token,str) else None
                        if candidate is None or candidate.room.game!=game:await self.send(ws,{'type':'error','code':'expired','message':'이전 방을 복구할 수 없습니다. 새 방에 입장해 주세요.'});continue
                        if candidate.ws is not None and not candidate.ws.closed:raise ValueError('이 플레이어는 다른 탭에서 연결 중입니다.')
                        p=candidate;p.ws=ws;p.disconnected=0
                        await self.send(p,{'type':'joined','resumed':True,'seat':p.seat,'ticket':p.ticket,'code':p.room.code,'game':game})
                        await self.room_state(p.room)
                        if p.room.state is not None:await self.snapshot(p.room,p)
                        continue
                    if op in ('create','join') and p is None:
                        name=nickname(data.get('name'))
                        if op=='create':
                            while self.creations and self.creations[0]<now-60:self.creations.popleft()
                            if len(self.rooms)>=32 or len(self.creations)>=40:raise ValueError('지금은 새 방을 열 수 없습니다. 잠시 후 다시 시도해 주세요.')
                            self.creations.append(now)
                            code=''.join(secrets.choice('ABCDEFGHJKLMNPQRSTUVWXYZ23456789') for _ in range(6))
                            while (game,code) in self.rooms:code=''.join(secrets.choice('ABCDEFGHJKLMNPQRSTUVWXYZ23456789') for _ in range(6))
                            room=BoardRoom(game,code);self.rooms[game,code]=room
                        else:
                            code=data.get('code','');room=self.rooms.get((game,code.strip().upper())) if isinstance(code,str) else None
                            if room is None:raise ValueError('초대받은 방을 찾을 수 없습니다.')
                            if all(room.players):raise ValueError('이미 두 명이 입장한 방입니다.')
                        async with room.mutex:
                            seat=room.players.index(None);p=BoardPlayer(name,ws,room=room,seat=seat);room.players[seat]=p;room.touched=now;self.players[p.ticket]=p
                            await self.send(p,{'type':'joined','game':game,'code':room.code,'seat':seat,'ticket':p.ticket});await self.room_state(room)
                            if room.state is not None:await self.snapshot(room,p)
                        continue
                    if p is None or p.room is None:raise ValueError('먼저 방에 입장해 주세요.')
                    room=p.room
                    if op=='action':await self.action(p,data);continue
                    async with room.mutex:
                        if op=='leave':await self.remove(p);p=None;await self.send(ws,{'type':'left'});continue
                        if op=='ready' and room.phase in ('waiting','finished'):
                            options=data.get('options',{})
                            if not isinstance(options,dict):raise ValueError('대국 설정을 확인해 주세요.')
                            p.options=options;p.ready=data.get('ready') is True;room.touched=now
                            if all(peer and peer.ready and peer.ws is not None and not peer.ws.closed for peer in room.players):await self.begin(room)
                            else:await self.room_state(room)
                            continue
                        if op=='resign' and room.phase in ('countdown','playing'):await self.finish(room,1-p.seat,'resign');continue
                        if op=='offer_draw' and room.phase=='playing':room.draw_offer=p.seat;await self.room_state(room);continue
                        if op=='accept_draw' and room.phase=='playing' and room.draw_offer==1-p.seat:await self.finish(room,None,'agreement');continue
                        if op=='decline_draw':room.draw_offer=None;await self.room_state(room);continue
                except (ValueError,TypeError,KeyError,RuntimeError) as exc:
                    errors+=1;await self.send(ws,{'type':'error','message':str(exc)[:180],'request_id':data.get('request_id') if isinstance(data,dict) else None})
                    if errors>30:await ws.close(code=1008,message=b'Invalid messages');break
        finally:
            self.sockets.discard(ws)
            if p is not None and p.ws is ws:
                p.ws=None;p.disconnected=time.monotonic();p.ready=False
                if p.room:await self.room_state(p.room)
        return ws
