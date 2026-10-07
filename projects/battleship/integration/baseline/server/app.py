"""PULSE static hosting + persistent, anonymous per-browser leaderboard."""
import argparse, hashlib, json, os, secrets, sqlite3, time, unicodedata
from collections import defaultdict, deque
from pathlib import Path
from aiohttp import web, WSMsgType
if __package__:
    from .duel import DuelHub
    from .board_rooms import BoardHub
    from .penguin_proxy import attach_penguin
else:
    from duel import DuelHub
    from board_rooms import BoardHub
    from penguin_proxy import attach_penguin

PUBLIC_FILES = {'index.html','style.css','overdrive.css','engine.js','effects.js','stage.js','showcase.js','game.js','leaderboard.js','leaderboard.css'}
COOKIE = 'pulse_player'

def token_hash(value):
    return hashlib.sha256(value.encode()).hexdigest()

def create_app(root, database, origin, secure=True, catalog_path=None):
    root = Path(root).resolve()
    catalog = json.loads(Path(catalog_path or Path(__file__).with_name('games.json')).read_text(encoding='utf-8-sig'))
    games = {game['id']:game for game in catalog}
    def game_id(request):
        value=request.match_info.get('game','tetris')
        if value not in games:raise web.HTTPNotFound(text='게임을 찾을 수 없습니다.')
        return value
    Path(database).parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(database)
    db.row_factory = sqlite3.Row
    db.execute('PRAGMA journal_mode=WAL')
    db.executescript('''
      CREATE TABLE IF NOT EXISTS players (id TEXT PRIMARY KEY, created REAL NOT NULL);
      CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, player TEXT NOT NULL, game TEXT NOT NULL, started REAL NOT NULL, result TEXT);
      CREATE INDEX IF NOT EXISTS runs_started ON runs(started);
      CREATE INDEX IF NOT EXISTS runs_player ON runs(player,started);
      CREATE TABLE IF NOT EXISTS scores (player TEXT NOT NULL, game TEXT NOT NULL, name TEXT NOT NULL, score INTEGER NOT NULL,
        lines INTEGER NOT NULL, level INTEGER NOT NULL, elapsed_ms INTEGER NOT NULL, recorded REAL NOT NULL, PRIMARY KEY(game,player));
      CREATE INDEX IF NOT EXISTS scores_order ON scores(score DESC,recorded ASC);
    ''')
    db.commit()
    limits = defaultdict(deque)
    sockets = set()

    def rate(key, count, seconds):
        now = time.monotonic()
        while limits[key] and limits[key][0] <= now-seconds: limits[key].popleft()
        if len(limits[key]) >= count: raise web.HTTPTooManyRequests(text='잠시 후 다시 시도해 주세요.')
        limits[key].append(now)
        if len(limits)>3000:
            for old in list(limits):
                if not limits[old] or limits[old][-1] < now-120: limits.pop(old,None)

    @web.middleware
    async def guard(request, handler):
        try:
            if request.method == 'POST':
                if request.headers.get('Origin') != origin:
                    raise web.HTTPForbidden(text='허용되지 않은 출처입니다.')
                if request.content_type != 'application/json':
                    raise web.HTTPUnsupportedMediaType(text='JSON 요청이 필요합니다.')
                rate('global-post',300,60)
            response = await handler(request)
        except web.HTTPException as exc:
            response = web.Response(status=exc.status, headers={'Location': exc.headers['Location']}) if 300<=exc.status<400 else web.json_response({'error':exc.text}, status=exc.status)
        response.headers.update({
            'X-Content-Type-Options':'nosniff', 'Referrer-Policy':'same-origin',
            'X-Frame-Options':'DENY',
            'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
            'Cache-Control':'no-store' if request.path.startswith(('/api/','/games/penguin-extraction/api/')) else 'no-cache',
        })
        return response

    app = web.Application(middlewares=[guard],client_max_size=4096)

    async def body(request):
        try:
            data = await request.json()
            if not isinstance(data,dict): raise ValueError()
            return data
        except (ValueError,TypeError): raise web.HTTPBadRequest(text='올바른 JSON 객체가 필요합니다.')

    async def health(request):
        db.execute('SELECT 1').fetchone()
        return web.json_response({'ok':True,'service':'pulse-arcade','version':1})

    async def catalogue(request):
        return web.json_response({'games':[{k:v for k,v in game.items() if k not in ('source','files')} for game in catalog]})

    async def ranking(request):
        game=game_id(request)
        rows=db.execute('SELECT name,score,lines,level,elapsed_ms,recorded FROM scores WHERE game=? ORDER BY score DESC,recorded ASC LIMIT 20',(game,)).fetchall()
        return web.json_response({'scores':[dict(row,rank=i+1) for i,row in enumerate(rows)],
                                 'players':db.execute('SELECT COUNT(*) FROM scores WHERE game=?',(game,)).fetchone()[0]})

    async def start_run(request):
        game=game_id(request)
        await body(request)
        now=time.time()
        cookie=request.cookies.get(COOKIE,'')
        player=token_hash(cookie) if cookie else ''
        if not db.execute('SELECT 1 FROM players WHERE id=?',(player,)).fetchone():
            cookie=secrets.token_urlsafe(32);player=token_hash(cookie)
            db.execute('INSERT INTO players VALUES (?,?)',(player,now))
        rate(player,12,60)
        # Old tokens are not useful after the maximum run duration.
        db.execute('DELETE FROM runs WHERE started < ?',(now-86400,))
        db.execute('DELETE FROM players WHERE created < ? AND id NOT IN (SELECT player FROM scores) AND id NOT IN (SELECT player FROM runs)',(now-86400,))
        if db.execute('SELECT COUNT(*) FROM runs').fetchone()[0]>=50000:
            db.rollback();raise web.HTTPServiceUnavailable(text='서버가 혼잡합니다. 잠시 후 다시 시도해 주세요.')
        run=secrets.token_urlsafe(32)
        db.execute('INSERT INTO runs VALUES (?,?,?,?,NULL)',(token_hash(run),player,game,now));db.commit()
        response=web.json_response({'run_id':run},status=201)
        response.set_cookie(COOKIE,cookie,httponly=True,secure=secure,samesite='Strict',max_age=31536000,path='/api/')
        return response

    async def submit(request):
        game=game_id(request)
        data=await body(request)
        raw=data.get('run_id','')
        if not isinstance(raw,str) or len(raw)>100:raise web.HTTPBadRequest(text='잘못된 플레이 정보입니다.')
        player=token_hash(request.cookies.get(COOKIE,''))
        rate(player+'-submit',20,60)
        row=db.execute('SELECT * FROM runs WHERE id=? AND player=? AND game=?',(token_hash(raw),player,game)).fetchone()
        if not row:raise web.HTTPForbidden(text='이 브라우저에서 시작한 온라인 플레이만 등록할 수 있습니다.')
        if row['result']:return web.json_response(json.loads(row['result']))
        wall_ms=(time.time()-row['started'])*1000
        if wall_ms>86400000:raise web.HTTPGone(text='플레이 기록의 등록 시간이 만료되었습니다.')
        name=data.get('name','')
        if not isinstance(name,str):raise web.HTTPBadRequest(text='닉네임을 확인해 주세요.')
        name=unicodedata.normalize('NFKC',name).strip()
        if not 2<=len(name)<=16 or any(not(c.isalnum() or c in ' _-.') for c in name):
            raise web.HTTPBadRequest(text='닉네임은 한글·영문·숫자·공백·_-. 조합으로 2~16자입니다.')
        values={}
        for field in ('score','lines','level','pieces','elapsed_ms'):
            value=data.get(field,0 if field in ('lines','pieces') else 1 if field=='level' else None)
            if type(value) is not int or value<0:raise web.HTTPBadRequest(text='기록 형식이 올바르지 않습니다.')
            values[field]=value
        score,lines,level,pieces,elapsed=(values[k] for k in ('score','lines','level','pieces','elapsed_ms'))
        if not (1<=score<=50000000 and 1<=elapsed<=86400000 and lines<=10000 and level<=1001 and pieces<=100000):
            raise web.HTTPBadRequest(text='등록 가능한 기록 범위를 벗어났습니다.')
        if elapsed>wall_ms+10000 or (game=='tetris' and (level!=1+lines//10 or pieces<1 or pieces>int(wall_ms/40)+20 or lines*10>pieces*4)):
            raise web.HTTPBadRequest(text='플레이 시간과 기록이 일치하지 않습니다.')
        if game=='tetris' and score>pieces*(1800*level+40)+250*lines*lines:
            raise web.HTTPBadRequest(text='플레이 기록을 확인할 수 없습니다.')
        previous=db.execute('SELECT score FROM scores WHERE player=? AND game=?',(player,game)).fetchone()
        improved=not previous or score>previous['score']
        if improved:
            db.execute('''INSERT INTO scores VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(game,player) DO UPDATE SET
                          name=excluded.name,score=excluded.score,lines=excluded.lines,level=excluded.level,
                          elapsed_ms=excluded.elapsed_ms,recorded=excluded.recorded''',
                       (player,game,name,score,lines,level,elapsed,time.time()))
        best=db.execute('SELECT score,recorded FROM scores WHERE player=? AND game=?',(player,game)).fetchone()
        rank=1+db.execute('SELECT COUNT(*) FROM scores WHERE game=? AND (score>? OR (score=? AND recorded<?))',
                          (game,best['score'],best['score'],best['recorded'])).fetchone()[0]
        result={'saved':True,'improved':improved,'rank':rank,'best':best['score']}
        db.execute('UPDATE runs SET result=? WHERE id=?',(json.dumps(result),token_hash(raw)));db.commit()
        return web.json_response(result)

    async def latency(request):
        # Small, bounded WebSocket probe; the game itself never waits for this channel.
        if request.headers.get('Origin') != origin:raise web.HTTPForbidden(text='허용되지 않은 출처입니다.')
        if len(sockets)>=32:raise web.HTTPServiceUnavailable(text='연결이 혼잡합니다.')
        ws=web.WebSocketResponse(heartbeat=15,receive_timeout=15,max_msg_size=256)
        await ws.prepare(request);sockets.add(ws);count=0
        try:
            async for msg in ws:
                if msg.type==WSMsgType.TEXT:
                    count+=1
                    if count>60:break
                    await ws.send_str(msg.data)
                else:break
        finally:sockets.discard(ws);await ws.close()
        return ws

    async def static(request):
        name=request.match_info['file']
        if name in ('','index.html'):
            return web.FileResponse(root/'portal/index.html')
        if name in ('portal.css','portal.js'):
            return web.FileResponse(root/'portal'/name)
        parts=name.split('/',2)
        if len(parts)>=2 and parts[0]=='games' and parts[1] in games:
            if len(parts)==2:raise web.HTTPFound('/games/'+parts[1]+'/')
            game=games[parts[1]];asset=parts[2] or 'index.html'
            source=(root/game['source']).resolve();target=(source/asset).resolve()
            if not source.is_relative_to(root) or not target.is_relative_to(source):raise web.HTTPNotFound()
            if asset in game['files'] and target.is_file():return web.FileResponse(target)
        raise web.HTTPNotFound(text='파일을 찾을 수 없습니다.')

    async def cleanup(app):
        for ws in list(sockets):await ws.close(code=1001,message=b'Server shutdown')
        db.close()

    DuelHub(origin).attach(app)
    board_games=[g["id"] for g in catalog if g.get("online")=="board"]
    if board_games:BoardHub(root,origin,games=board_games).attach(app)
    app.router.add_get('/api/health',health)
    app.router.add_get('/api/games',catalogue)
    app.router.add_get('/api/games/{game}/scores',ranking)
    app.router.add_post('/api/games/{game}/runs',start_run)
    app.router.add_post('/api/games/{game}/scores',submit)
    app.router.add_get('/api/scores',ranking)
    app.router.add_post('/api/runs',start_run)
    app.router.add_post('/api/scores',submit)
    app.router.add_get('/api/latency',latency)
    if 'penguin-extraction' in games:
        attach_penguin(app, origin, os.environ.get('PENGUIN_UPSTREAM','http://127.0.0.1:18090'))
    app.router.add_get('/{file:.*}',static)
    app.on_cleanup.append(cleanup)
    return app

if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--host',default='127.0.0.1');parser.add_argument('--port',type=int,default=18080)
    parser.add_argument('--root',default=str(Path(__file__).resolve().parent.parent))
    parser.add_argument('--database',default=os.environ.get('TETRIS_DATABASE',str(Path.home()/'.local/share/tetris/scores.sqlite3')))
    parser.add_argument('--origin',default=os.environ.get('TETRIS_PUBLIC_ORIGIN','http://127.0.0.1:18080'))
    args=parser.parse_args()
    web.run_app(create_app(args.root,args.database,args.origin,args.origin.startswith('https:')),host=args.host,port=args.port,access_log=None)
