"""Same-origin local API + optional Vite proxy. python server/dev_server.py --port 19095"""
import argparse
from pathlib import Path
from aiohttp import web, ClientSession
from battleship_rooms import setup_battleship

def create_app(frontend=None, dist=None, origin=None):
    app = web.Application(client_max_size=8192)
    setup_battleship(app, origin=origin)
    app.router.add_get('/api/battleship/health', lambda request: web.json_response({'ok': True}))
    if frontend:
        async def proxy(request):
            async with ClientSession() as client:
                async with client.get(f'http://127.0.0.1:{frontend}{request.rel_url}') as response:
                    return web.Response(body=await response.read(), status=response.status,
                                        headers={k: v for k, v in response.headers.items() if k.lower() in ('content-type', 'cache-control')})
        app.router.add_get('/{tail:.*}', proxy)
    elif dist:
        root = Path(dist).resolve()
        async def index(request): return web.FileResponse(root / 'index.html')
        app.router.add_get('/', index)
        app.router.add_static('/', root, show_index=False)
    return app

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=19095)
    parser.add_argument('--frontend', type=int, default=None)
    parser.add_argument('--dist', default=None)
    parser.add_argument('--origin', default=None)
    args = parser.parse_args()
    web.run_app(create_app(args.frontend, args.dist, args.origin), host='127.0.0.1', port=args.port, access_log=None)
