"""Authoritative resolution and websocket cadence without rendering or deployed API changes."""
import asyncio
import copy
import sys
import unittest
from unittest.mock import patch
from pathlib import Path
from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'server'))
from battleship_rooms import (create_battle,apply_action,resolve_attack_step,snapshot,setup_battleship,ROOMS_KEY)


def battle():
    state=create_battle();state.update(turnNumber=3,round=2,islands=[])
    return state


class QueuedRulesTests(unittest.TestCase):
    def test_damage_rng_and_ap_deferred_in_fleet_order(self):
        state=battle();victim=next(s for s in state['ships'] if s['id']=='1-carrier')
        for identifier in ('0-destroyer-2','0-destroyer-1'):
            result=apply_action(state,0,{'type':'attack','shipId':identifier,'target':victim},lambda:self.fail('reservation consumed RNG'))
            self.assertTrue(result['ok'])
        self.assertEqual(victim['hp'],1000);self.assertEqual(snapshot(state,1)['queuedAttacks'],[])
        self.assertTrue(apply_action(state,0,{'type':'end'})['ok'])
        frozen=copy.deepcopy(state)
        self.assertFalse(apply_action(state,0,{'type':'end'})['ok']);self.assertEqual(state,frozen)
        for identifier,hp in (('0-destroyer-1',800),('0-destroyer-2',600)):
            shot=resolve_attack_step(state,lambda:1)['shot'];self.assertEqual(shot['sourceShip']['id'],identifier)
            self.assertEqual(victim['hp'],hp);self.assertEqual(state['turn'],0)
        self.assertTrue(resolve_attack_step(state)['complete']);self.assertEqual(state['turn'],1)

    def test_disconnect_does_not_mutate_and_victory_waits_for_completion(self):
        state=battle();victim=next(s for s in state['ships'] if s['id']=='1-carrier')
        for ship in state['ships']:
            if ship['team']==1 and ship is not victim: ship.update(hp=0,sunk=True)
        victim['hp']=100
        self.assertTrue(apply_action(state,0,{'type':'attack','shipId':'0-destroyer-1','target':victim})['ok'])
        apply_action(state,0,{'type':'end'});state['connected']=[True,False];frozen=copy.deepcopy(state)
        self.assertFalse(resolve_attack_step(state)['ok']);self.assertEqual(state,frozen)
        state['connected']=[True,True];self.assertTrue(resolve_attack_step(state,lambda:1)['shot']['sunk'])
        self.assertEqual(state['phase'],'battle');self.assertIsNone(state['winner'])
        self.assertTrue(resolve_attack_step(state)['complete']);self.assertEqual(state['winner'],0)


class QueuedSocketTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        app=web.Application();setup_battleship(app);self.client=TestClient(TestServer(app));await self.client.start_server()
        self.host=await (await self.client.post('/api/battleship/rooms')).json()
        self.guest=await (await self.client.post('/api/battleship/rooms/'+self.host['code']+'/join')).json()
        self.room=self.client.server.app[ROOMS_KEY][self.host['code']]
        self.room.battle=battle()
        self.a=await self.client.ws_connect('/ws/battleship/'+self.host['code']+'?token='+self.host['token'])
        self.b=await self.client.ws_connect('/ws/battleship/'+self.host['code']+'?token='+self.guest['token'])
        await self.state(self.a,lambda s:all(s['connected']));await self.state(self.b,lambda s:all(s['connected']))

    async def asyncTearDown(self):
        await self.a.close();await self.b.close();await self.client.close()

    async def state(self,socket,predicate):
        async with asyncio.timeout(3):
            while True:
                message=await socket.receive_json()
                if message.get('type')=='state' and predicate(message['state']): return message['state']

    async def reserve(self):
        for identifier in ('0-destroyer-1','0-destroyer-2'):
            await self.a.send_json({'type':'attack','shipId':identifier,'target':{'x':26,'z':26}})
        await self.state(self.a,lambda s:len(s['queuedAttacks'])==2)
        self.assertEqual(self.room.battle['sequence'],0)
        await self.a.send_json({'type':'end'})
        return await self.state(self.a,lambda s:s.get('resolutionStep') is not None)

    async def test_only_both_matching_acknowledgments_advance_and_no_client_command_can_resolve(self):
        first=await self.reserve();step=first['resolutionStep'];self.assertEqual(first['lastShot']['sequence'],1)
        await self.a.send_json({'type':'attack-complete','step':step+1})
        async with asyncio.timeout(2):
            while (message:=await self.a.receive_json()).get('type')!='error': pass
        self.assertEqual(self.room.battle['sequence'],1)
        await self.a.send_json({'type':'attack-complete','step':step})
        await self.b.send_json({'type':'end'});await asyncio.sleep(.4)
        self.assertEqual(self.room.battle['sequence'],1);self.assertEqual(self.room.battle['turn'],0)
        await self.b.send_json({'type':'attack-complete','step':step})
        second=await self.state(self.a,lambda s:s.get('resolutionStep',0)>step)
        self.assertEqual(second['lastShot']['sequence'],2);self.assertEqual(second['turn'],0)
        await self.a.send_json({'type':'attack-complete','step':second['resolutionStep']})
        await self.b.send_json({'type':'attack-complete','step':second['resolutionStep']})
        next_turn=await self.state(self.a,lambda s:s['turn']==1)
        self.assertEqual(next_turn['combatPhase'],'action');self.assertNotIn('resolutionStep',next_turn)

    async def test_disconnect_suspends_and_reconnect_restores_current_step_and_private_queue(self):
        first=await self.reserve();step=first['resolutionStep']
        await self.b.close();await self.state(self.a,lambda s:not all(s['connected']))
        await self.a.send_json({'type':'attack-complete','step':step});await asyncio.sleep(.4)
        self.assertEqual(self.room.battle['sequence'],1);self.assertEqual(self.room.battle['turn'],0)
        self.b=await self.client.ws_connect('/ws/battleship/'+self.host['code']+'?token='+self.guest['token'])
        restored=await self.state(self.b,lambda s:all(s['connected']))
        self.assertEqual(restored['resolutionStep'],step);self.assertEqual(restored['queuedAttacks'],[])
        self.assertIn('source',restored['lastShot']);self.assertEqual(restored['lastShot']['sourceShip']['id'],'0-destroyer-1');self.assertEqual(restored['revealed'],[])
        await self.a.send_json({'type':'attack-complete','step':step})
        await self.b.send_json({'type':'attack-complete','step':step})
        second=await self.state(self.a,lambda s:s.get('resolutionStep',0)>step)
        self.assertEqual(second['lastShot']['sequence'],2)

    async def test_connected_deadline_safely_progresses_without_client_acknowledgments(self):
        with patch('battleship_rooms.ATTACK_PRESENTATION_TIMEOUT',.35):
            first=await self.reserve();step=first['resolutionStep']
            second=await self.state(self.a,lambda s:s.get('resolutionStep',0)>step)
            self.assertEqual(second['lastShot']['sequence'],2);self.assertEqual(second['turn'],0)
            next_turn=await self.state(self.a,lambda s:s['turn']==1)
            self.assertEqual(next_turn['combatPhase'],'action')


if __name__=='__main__': unittest.main()
