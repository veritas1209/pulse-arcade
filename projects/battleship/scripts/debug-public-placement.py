import asyncio,json,sys
from aiohttp import ClientSession,TCPConnector
async def main():
 async with ClientSession(connector=TCPConnector(ssl=False),headers={'Origin':'https://222.96.173.194'}) as c:
  root='https://222.96.173.194'
  async with c.post(root+'/api/battleship/rooms',json={}) as r:h=await r.json()
  a=await c.ws_connect(root+'/ws/battleship/'+h['code']+'?token='+h['token'])
  before=(await a.receive_json())['state']
  async with c.post(root+'/api/battleship/rooms/'+h['code']+'/join',json={}) as r:g=await r.json()
  await a.receive_json()
  b=await c.ws_connect(root+'/ws/battleship/'+g['code']+'?token='+g['token'])
  await a.receive_json();await b.receive_json()
  fleet=[{k:s[k] for k in ('id','x','z','heading')} for s in before['own']]
  fleet[1].update(x=6,z=6)
  await a.send_json({'type':'placement','fleet':fleet});after=await a.receive_json()
  print(json.dumps({'before':[(s['id'],s['x'],s['z']) for s in before['own']],'after':[(s['id'],s['x'],s['z']) for s in after['state']['own']],'revision':after['state']['revision']}))
  await b.close();await a.close()
asyncio.run(main())
