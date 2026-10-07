import asyncio,os
from aiohttp import ClientSession,WSServerHandshakeError
BASE=os.environ.get('BATTLESHIP_TEST_BASE','http://127.0.0.1:18092')
ORIGIN=os.environ.get('BATTLESHIP_TEST_ORIGIN',BASE)
KEYS={'phase','you','turn','round','turnNumber','winner','own','revealed','islands','visibleCells','recon','ready','connected','revision','lastShot','shots','sonar','torpedoes','combatPhase','queuedAttacks','attackProgress','resolutionStep'}
async def state(ws,predicate=lambda s:True):
 for _ in range(96):
  message=await ws.receive_json(timeout=7)
  if message.get('type')=='state':
   s=message['state'];assert set(s)<=KEYS
   visible={(c['x'],c['z']) for c in s['visibleCells']}
   assert all((v['x'],v['z']) in visible for v in s['revealed'])
   assert all(v['team']==s['you'] for v in s['own'])
   assert all(q['shipId'].startswith(str(s['you'])+'-') for q in s['queuedAttacks'])
   shot=s.get('lastShot')
   if shot and shot['by']!=s['you'] and 'source' in shot and s['combatPhase']!='attack':assert (shot['source']['x'],shot['source']['z']) in visible
   if predicate(s):return s
 raise AssertionError('Expected state missing')
async def error(ws):
 for _ in range(96):
  message=await ws.receive_json(timeout=7)
  if message.get('type')=='error':return message
 raise AssertionError('Expected rejection missing')
async def resolve_turn(actor,first,second,next_turn_number):
 """Network-only presentation clients acknowledge every step, including torpedo motion."""
 await actor.send_json({'type':'end'});last_step=0;shots=[]
 while True:
  a=await state(first,lambda s:s['turnNumber']==next_turn_number or s.get('resolutionStep',0)>last_step)
  if a['turnNumber']==next_turn_number:
   b=await state(second,lambda s:s['turnNumber']==next_turn_number)
   assert a['combatPhase']==b['combatPhase']=='action'
   return a,b,shots
  step=a['resolutionStep'];b=await state(second,lambda s:s.get('resolutionStep')==step)
  assert a['combatPhase']==b['combatPhase']=='attack' and a['turn']==b['turn']
  assert a['attackProgress']==b['attackProgress']
  assert b['queuedAttacks']==[] if a['turn']==0 else a['queuedAttacks']==[]
  if a['shots']:
   assert len(a['shots'])==len(b['shots'])==1
   shots.append((a['shots'][0],b['shots'][0],a,b))
  await first.send_json({'type':'attack-complete','step':step})
  await second.send_json({'type':'attack-complete','step':step})
  last_step=step
async def main():
 async with ClientSession(headers={'Origin':ORIGIN}) as client:
  async with client.post(BASE+'/api/battleship/rooms',json={}) as r:assert r.status==200;a=await r.json()
  async with client.post(BASE+'/api/battleship/rooms/'+a['code']+'/join',json={}) as r:assert r.status==200;b=await r.json()
  try:await client.ws_connect(BASE+'/ws/battleship/'+a['code']+'?token=invalid')
  except WSServerHandshakeError as rejection:assert rejection.status==403
  else:raise AssertionError('Invalid token accepted')
  async with client.ws_connect(BASE+'/ws/battleship/'+a['code']+'?token='+a['token']) as first:
   async with client.ws_connect(BASE+'/ws/battleship/'+a['code']+'?token='+b['token']) as second:
    await first.send_json({'type':'ready'});await second.send_json({'type':'ready'})
    sa=await state(first,lambda s:s['phase']=='battle');sb=await state(second,lambda s:s['phase']=='battle')
    assert next(v for v in sa['own'] if v['kind']=='carrier')['maxAp']==4
    assert len(sa['own'])==len(sb['own'])==7 and not sa['revealed'] and not sb['revealed']
    assert all([sum(v['kind']==kind for v in s['own']) for kind in ('carrier','destroyer','battleship')]==[1,3,3] for s in (sa,sb))
    assert len(sa['islands'])>80
    await first.send_json({'type':'sonar','shipId':'0-battleship-1'})
    sa=await state(first,lambda s:len(s['sonar'])==1);sb=await state(second,lambda s:s['revision']==sa['revision'])
    assert sb['sonar']==[] and next(v for v in sa['own'] if v['id']=='0-battleship-1')['ap']==2
    await first.send_json({'type':'torpedo','shipId':'0-destroyer-2','target':{'x':5,'z':7}})
    assert(await error(first))['type']=='error'
    for ws,s in [(first,sa),(second,sb)]:
     if s['you']==1:
      sa,sb,_=await resolve_turn(first,first,second,2)
     own=s['own'];attacker=next(ship for ship in own if ship['kind']=='destroyer')
     await ws.send_json({'type':'attack','shipId':attacker['id'],'target':{'x':15,'z':15}})
     assert (await error(ws))['message']=='첫 턴에는 공격할 수 없습니다'
    sa,sb,_=await resolve_turn(second,first,second,3)
    await second.send_json({'type':'end'})
    assert (await error(second))['message']=='행동 차례가 아닙니다'
    await first.send_json({'type':'torpedo','shipId':'0-destroyer-2','target':{'x':5,'z':18}})
    sa=await state(first,lambda s:len(s['torpedoes'])==1);sb=await state(second,lambda s:s['revision']==sa['revision'])
    assert len(sa['torpedoes'])==1 and sa['queuedAttacks']==sb['queuedAttacks']==[] and sb['torpedoes']==[] and next(v for v in sa['own'] if v['id']=='0-destroyer-2')['ap']==3
    carrier=next(s for s in sa['own'] if s['kind']=='carrier')
    victim=next(s for s in sb['own'] if s['kind']=='destroyer')
    await first.send_json({'type':'recon','shipId':carrier['id'],'target':{'x':max(2,min(27,victim['x'])),'z':max(2,min(27,victim['z']))}})
    sa=await state(first,lambda s:len(s['recon'])==1)
    center=sa['recon'][0]['center']
    expected={(center['x']+dx,center['z']+dz) for dx in range(-2,3) for dz in range(-2,3) if not(abs(dx)==2 and abs(dz)==2)}
    assert len(expected)==21 and expected<={(c['x'],c['z']) for c in sa['visibleCells']}
    assert any(s['id']==victim['id'] for s in sa['revealed'])
    assert next(s for s in sa['own'] if s['kind']=='carrier')['ap']==3
    assert not sa.get('lastShot') and len(sa['queuedAttacks'])==1
    prior_hp=next(s for s in sa['revealed'] if s['id']==victim['id'])['hp']
    shooter=next(s for s in sa['own'] if s['kind']=='destroyer')
    await first.send_json({'type':'attack','shipId':shooter['id'],'target':{'x':victim['x'],'z':victim['z']}})
    sa=await state(first,lambda s:len(s['queuedAttacks'])==2)
    assert not sa.get('lastShot') and next(s for s in sa['revealed'] if s['id']==victim['id'])['hp']==prior_hp
    sa,sb,shots=await resolve_turn(first,first,second,4)
    assert [pair[0]['kind'] for pair in shots]==['airstrike','missile']
    for shot,defender,attacker_state,defender_state in shots:
     assert shot['damage'] in (0,200) and shot['blocked']==(shot['damage']==0)
     assert attacker_state['turn']==defender_state['turn']==0 and defender['sourceShip']['team']==0 and defender_state['revealed']==[]
     if shot.get('shipId')==victim['id']:
      prior_hp-=shot['damage'];assert next(s for s in defender_state['own'] if s['id']==victim['id'])['hp']==prior_hp
    assert len(sa['torpedoes'])==1 and sb['torpedoes']==[]
    before=[(t['x'],t['z']) for t in sa['torpedoes']]
    sa,sb,_=await resolve_turn(second,first,second,5)
    assert [(t['x'],t['z']) for t in sa['torpedoes']]!=before
    sa,sb,_=await resolve_turn(first,first,second,6)
    assert not sa['recon'] and not sa['revealed'] and sa['visibleCells']
    await first.send_json({'type':'leave'})
    outcome=await state(second,lambda s:s['phase']=='finished');assert outcome['winner']==1
 print('Shared30x30 room: auth, fleet, AP, passive/recon fog, opening guards, reserved sortie/missile and immediate torpedo, carrier-first fleet order, escort defense, authoritative end/step acknowledgments, every-turn torpedo advances, expiry and outcome PASS')
if __name__=='__main__':asyncio.run(main())

