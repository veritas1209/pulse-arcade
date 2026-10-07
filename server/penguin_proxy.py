"""Bounded, same-origin bridge to the loopback Penguin game service."""
import asyncio
from urllib.parse import urlsplit
from aiohttp import ClientSession, ClientTimeout, DummyCookieJar, TCPConnector, ClientError, web, WSMsgType
from multidict import CIMultiDict
from yarl import URL

PREFIX = '/games/penguin-extraction'
HOP = {'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade'}


def attach_penguin(app, origin, upstream='http://127.0.0.1:18090'):
    target = urlsplit(upstream)
    if target.scheme != 'http' or target.hostname not in ('127.0.0.1', 'localhost', '::1') or target.path not in ('', '/') or target.username or target.query or target.fragment:
        raise ValueError('Penguin upstream must be a loopback HTTP origin')
    public = urlsplit(origin)
    sockets = set()
    session = None

    async def lifecycle(application):
        nonlocal session
        session = ClientSession(cookie_jar=DummyCookieJar(), auto_decompress=False,
                                connector=TCPConnector(limit=80), timeout=ClientTimeout(total=30, connect=5), trust_env=False)
        yield
        await asyncio.gather(*(ws.close(code=1001, message=b'Server shutdown') for ws in list(sockets)), return_exceptions=True)
        await session.close()

    def forwarded(request):
        banned = HOP | {s.strip().lower() for s in request.headers.get('Connection', '').split(',')}
        banned |= {'host', 'x-forwarded-proto', 'x-forwarded-host', 'x-forwarded-for', 'forwarded'}
        headers = CIMultiDict((k, v) for k, v in request.headers.items() if k.lower() not in banned and not k.lower().startswith('sec-websocket-'))
        headers['Host'] = public.netloc
        headers['X-Forwarded-Proto'] = public.scheme
        headers['X-Forwarded-For'] = request.remote or 'unknown'
        return headers

    async def bridge(request):
        if request.path == PREFIX:
            raise web.HTTPPermanentRedirect(PREFIX + '/')
        endpoint = URL(upstream.rstrip('/') + request.raw_path, encoded=True)
        headers = forwarded(request)
        if request.path == PREFIX + '/ws':
            if request.headers.get('Origin') != origin:
                raise web.HTTPForbidden(text='허용되지 않은 출처입니다.')
            if len(sockets) >= 64:
                raise web.HTTPServiceUnavailable(text='연결이 혼잡합니다.')
            try:
                remote = await session.ws_connect(endpoint, headers=headers, heartbeat=20, max_msg_size=1024 * 1024, compress=0)
            except ClientError:
                raise web.HTTPBadGateway(text='게임 서버에 연결하지 못했습니다.')
            ws = web.WebSocketResponse(heartbeat=20, max_msg_size=16384, compress=True)
            try:
                await ws.prepare(request)
                sockets.add(ws)
                async def relay(source, destination):
                    async for msg in source:
                        if msg.type == WSMsgType.TEXT:
                            await destination.send_str(msg.data)
                        elif msg.type == WSMsgType.BINARY:
                            await destination.send_bytes(msg.data)
                        else:
                            break
                tasks = [asyncio.create_task(relay(ws, remote)), asyncio.create_task(relay(remote, ws))]
                try:
                    await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
                finally:
                    for task in tasks:
                        task.cancel()
                    await asyncio.gather(*tasks, return_exceptions=True)
            finally:
                sockets.discard(ws)
                await remote.close()
                await ws.close()
            return ws
        if request.method not in ('GET', 'HEAD', 'POST'):
            raise web.HTTPMethodNotAllowed(request.method, ['GET', 'HEAD', 'POST'])
        body = await request.read() if request.can_read_body else None
        try:
            async with session.request(request.method, endpoint, headers=headers, data=body, allow_redirects=False) as response:
                banned = HOP | {s.strip().lower() for s in response.headers.get('Connection', '').split(',')}
                outgoing = CIMultiDict((k, v) for k, v in response.headers.items() if k.lower() not in banned)
                outgoing['Cache-Control'] = 'no-store' if request.path.startswith(PREFIX + '/api/') else 'no-cache'
                outgoing['X-Content-Type-Options'] = 'nosniff'
                outgoing['Referrer-Policy'] = 'same-origin'
                outgoing['X-Frame-Options'] = 'DENY'
                result = web.StreamResponse(status=response.status, headers=outgoing)
                await result.prepare(request)
                async for chunk in response.content.iter_chunked(65536):
                    await result.write(chunk)
                await result.write_eof()
                return result
        except (ClientError, asyncio.TimeoutError):
            raise web.HTTPBadGateway(text='게임 서버에 연결하지 못했습니다.')

    app.cleanup_ctx.append(lifecycle)
    app.router.add_route('*', PREFIX, bridge)
    app.router.add_route('*', PREFIX + '/{tail:.*}', bridge)
