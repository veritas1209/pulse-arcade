import asyncio
import copy
import json
import math
import sys
import unittest
from unittest.mock import patch
from pathlib import Path
from aiohttp.test_utils import TestClient,TestServer
from aiohttp import web,WSServerHandshakeError,ClientSession,TCPConnector
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'server'))
from battleship_rooms import setup_battleship,create_battle,apply_action as reserve_action,resolve_attack_step,snapshot,paths,ROOMS_KEY,BOARD_SIZE,ISLANDS,SHIPS,deployment_cells,placement_valid,apply_placement,start_battle,is_opening_turn,torpedo_route,create_parts,part_at,part_disabled,can_repair_ship,WEAPON_REGIONS,SYSTEM_REGIONS,fallback_hit

def source_hit(kind,system):
    if system=='flightDeck': return {'x':0,'z':-.5}
    regions=WEAPON_REGIONS[kind] if system=='weapon' else [r for r in SYSTEM_REGIONS[kind] if r['system']==system]
    for r in regions:
        points=[{'x':(r['x0']+r['x1'])/2,'z':(r['z0']+r['z1'])/2}]+[{'x':r['x0']+(r['x1']-r['x0'])*x,'z':r['z0']+(r['z1']-r['z0'])*z} for x in (.1,.5,.9) for z in (.1,.5,.9)]
        for hit in points:
            if part_at(kind,hit)==system: return hit
    # Imported carrier AA uses physical deck-edge fallback when no AA is tagged.
    if kind=='carrier' and system=='airDefense':
        for x in (-.8,.8):
            for z in (-.5,0,.5):
                hit={'x':x,'z':z}
                if part_at(kind,hit)==system: return hit
    raise AssertionError(f'No actual source footprint for {kind}/{system}')

def present(state,rng=lambda:.9):
    if state['combatPhase']=='action': assert reserve_action(state,state['turn'],{'type':'end'})['ok']
    while state['phase']=='battle' and (state['pendingTorpedoes'] or state['queuedAttacks'][state['turn']]): assert resolve_attack_step(state,rng)['ok']

def finish(state,rng=lambda:.9):
    present(state,rng)
    if state['phase']=='battle' and state['combatPhase']=='attack': assert resolve_attack_step(state,rng)['ok']

def apply_action(state,player,command,rng=lambda:.9):
    if command.get('type')=='end' and state['combatPhase']=='attack' and state['turn']==player and all(state['connected']):
        finish(state,rng);return {'ok':True}
    result=reserve_action(state,player,command,rng)
    if result['ok'] and command.get('type')=='end': finish(state,rng)
    return result

def fire_command(state,player,command,rng=lambda:.9):
    result=apply_action(state,player,command,rng)
    if result['ok']: present(state,rng)
    return result

def fire(state,player,kind,identifier=None,target=None,rng=lambda:.9):
    result=action(state,player,kind,identifier,target,rng)
    if result['ok']: present(state,rng)
    return result

def ship(state,identifier): return next(s for s in state['ships'] if s['id']==identifier)
def action(state,player,kind,identifier=None,target=None,rng=lambda:.9):
    return apply_action(state,player,{'type':kind,'shipId':identifier,'target':target},rng)

# Fixed legal deployment for hand-authored route/AP/privacy scenarios.
# Production default formation is checked separately before any fixture placement.
SCENARIO_FLEET=[('carrier',3,1),('destroyer-1',1,3),('destroyer-2',5,3),('battleship-1',2,5),('battleship-2',4,5),('destroyer-3',6,0),('battleship-3',0,5)]
def scenario_fleet(team):
    return [{'id':f'{team}-{suffix}','x':29-x if team else x,'z':29-z if team else z} for suffix,x,z in SCENARIO_FLEET]
def route_battle():
    state=create_battle()
    for team in (0,1):
        for placement in scenario_fleet(team): ship(state,placement['id']).update(x=placement['x'],z=placement['z'])
    return state

def combat_battle():
    state=route_battle();action(state,0,'end');action(state,1,'end');return state

def fixture_battle():
    state=combat_battle()
    for team in (0,1):
        for ship,x in zip([s for s in state['ships'] if s['team']==team],[14,4,24,9,19,0,29]): ship.update({'x':x,'z':27 if team else 2})
    return state

class CoreTests(unittest.TestCase):
    def test_enemy_torpedo_route_requires_live_passive_or_sonar_contact(self):
        state=fixture_battle();state['islands']=[]
        self.assertTrue(action(state,0,'torpedo','0-destroyer-1',{'x':19,'z':2})['ok']);action(state,0,'end')
        observer=ship(state,'1-carrier');observer.update(x=12,z=8)
        self.assertEqual(snapshot(state,1)['torpedoes'],[])
        self.assertTrue(action(state,1,'sonar',observer['id'])['ok']);contact=snapshot(state,1)['torpedoes'][0];t=state['torpedoes'][0]
        self.assertEqual(set(contact),{'id','team','x','z','heading','route'});self.assertEqual(contact['route'],t['route'][t['index']:])
        contact['route'][0]['x']=999;self.assertNotEqual(t['route'][t['index']]['x'],999)
        state['turnNumber']=state['sonar'][0]['expiresAt']+1;self.assertEqual(snapshot(state,1)['torpedoes'],[])
        observer.update(x=10,z=2);self.assertEqual(len(snapshot(state,1)['torpedoes'][0]['route']),10)
        observer.update(x=26,z=26);self.assertEqual(snapshot(state,1)['torpedoes'],[]);self.assertEqual(len(snapshot(state,0)['torpedoes'][0]['route']),10)


    def test_weapon_footprints_and_hashed_fallback_surface_distribution(self):
        source=json.loads((Path(__file__).resolve().parents[1]/'artifacts/external-assets/fleet-conversion-report.json').read_text(encoding='utf-8'))
        for kind in ('battleship','destroyer'):
            self.assertEqual(len(WEAPON_REGIONS[kind]),sum(part['system']=='weapon' for part in source[kind]['parts']))
            for r in WEAPON_REGIONS[kind]:
                self.assertEqual(part_at(kind,{'x':(r['x0']+r['x1'])/2,'z':(r['z0']+r['z1'])/2}),'weapon')
            self.assertIsNone(part_at(kind,{'x':.8,'z':-.7}))
        self.assertGreaterEqual(len(WEAPON_REGIONS['destroyer']),5);self.assertGreaterEqual(len(WEAPON_REGIONS['battleship']),3)
        self.assertEqual(part_at('destroyer',source_hit('destroyer','weapon')),'weapon')
        self.assertEqual(part_at('battleship',source_hit('battleship','weapon')),'weapon')
        hits=[fallback_hit((seq*1664525+1013904223)&0xffffffff) for seq in range(1,257)]
        for axis in ('x','z'):
            self.assertLess(min(h[axis] for h in hits),-.7);self.assertGreater(max(h[axis] for h in hits),.7)
            self.assertLess(abs(sum(h[axis] for h in hits)/len(hits)),.08)
        self.assertLess(sum(part_at('destroyer',h)=='weapon' for h in hits),90)

    def test_positive_weapon_hit_blocks_new_launch_after_ap_refresh(self):
        for kind in ('destroyer','battleship','carrier'):
            state=combat_battle();state['islands']=[];shooter=ship(state,'0-destroyer-1')
            victim=next(s for s in state['ships'] if s['team']==1 and s['kind']==kind);victim.update(x=4,z=4)
            self.assertTrue(fire_command(state,0,{'type':'attack','shipId':shooter['id'],'target':victim,'localHit':source_hit(kind,'flightDeck' if kind=='carrier' else 'weapon')},lambda:.9)['ok'])
            key='flightDeck' if kind=='carrier' else 'weapon';self.assertEqual(victim['parts'][key],{'hp':0,'maxHp':200,'disabled':True})
            self.assertTrue(action(state,0,'end')['ok']);self.assertEqual(victim['ap'],victim['maxAp'])
            for command in ('recon',) if kind=='carrier' else ('attack','torpedo') if kind=='destroyer' else ('attack',):
                before=copy.deepcopy(state)
                def forbidden_rng(): raise AssertionError('disabled action must not consume RNG')
                self.assertFalse(apply_action(state,1,{'type':command,'shipId':victim['id'],'target':shooter},forbidden_rng)['ok']);self.assertEqual(state,before)

    def test_destroyed_systems_reject_new_launches_even_with_stale_zero_hp_flags(self):
        for inconsistent in (False,True):
            for kind in ('destroyer','battleship','carrier'):
                state=combat_battle();actor=next(s for s in state['ships'] if s['team']==0 and s['kind']==kind)
                key='flightDeck' if kind=='carrier' else 'weapon'
                actor['parts'][key].update(hp=0 if inconsistent else 200,disabled=not inconsistent)
                self.assertTrue(part_disabled(actor,key))
                commands=('recon',) if kind=='carrier' else ('attack','torpedo') if kind=='destroyer' else ('attack',)
                draws=[]
                for kind_of_action in commands:
                    before=copy.deepcopy(state)
                    result=apply_action(state,0,{'type':kind_of_action,'shipId':actor['id'],'target':{'x':4,'z':4}},lambda:draws.append(1) or .9)
                    self.assertFalse(result['ok']);self.assertEqual(state,before)
                self.assertEqual(draws,[])

    def test_each_ship_passive21_moves_and_disappears_on_sinking(self):
        for kind in ('carrier','destroyer','battleship'):
            state=combat_battle();state['islands']=[]
            for own in [s for s in state['ships'] if s['team']==0]: own.update({'sunk':True,'hp':0})
            watcher=next(s for s in state['ships'] if s['team']==0 and s['kind']==kind);watcher.update({'sunk':False,'hp':watcher['maxHp'],'x':10,'z':10})
            inside=ship(state,'1-destroyer-1');inside.update({'x':12,'z':11})
            corner=ship(state,'1-battleship-1');corner.update({'x':12,'z':12})
            view=snapshot(state,0);self.assertEqual(len(view['visibleCells']),21)
            self.assertEqual([sum(c['z']==z for c in view['visibleCells']) for z in range(8,13)],[3,5,5,5,3])
            self.assertIn({'x':12,'z':11},view['visibleCells']);self.assertNotIn({'x':12,'z':12},view['visibleCells']);self.assertEqual([s['id'] for s in view['revealed']],[inside['id']])
            self.assertEqual(watcher['ap'],watcher['maxAp']);self.assertEqual(view['recon'],[])
            self.assertTrue(action(state,0,'move',watcher['id'],{'x':8,'z':10})['ok']);self.assertEqual(snapshot(state,0)['revealed'],[])
            watcher.update({'sunk':True,'hp':0});self.assertEqual(snapshot(state,0)['visibleCells'],[])

    def test_passive_union_plane_and_edge_clipping(self):
        state=combat_battle()
        for own in [s for s in state['ships'] if s['team']==0]: own.update({'sunk':True,'hp':0})
        carrier=ship(state,'0-carrier');carrier.update({'sunk':False,'hp':1000,'x':10,'z':10})
        destroyer=ship(state,'0-destroyer-1');destroyer.update({'sunk':False,'hp':500,'x':11,'z':10})
        self.assertEqual(len(snapshot(state,0)['visibleCells']),26)
        self.assertTrue(action(state,0,'recon','0-carrier',{'x':20,'z':20})['ok']);self.assertEqual(len(snapshot(state,0)['visibleCells']),47)
        carrier['sunk']=True;destroyer['sunk']=True;self.assertEqual(snapshot(state,0)['visibleCells'],[])
        destroyer.update({'sunk':False,'x':0,'z':0});self.assertEqual(len(snapshot(state,0)['visibleCells']),8)
        destroyer.update({'x':29,'z':29});self.assertEqual(len(snapshot(state,0)['visibleCells']),8)

    def test_passive_shot_origin_requires_fire_time_and_current_visibility(self):
        state=combat_battle();state['islands']=[]
        for own in [s for s in state['ships'] if s['team']==1]: own.update({'sunk':True,'hp':0})
        observer=ship(state,'1-destroyer-1');observer.update({'sunk':False,'hp':500,'x':12,'z':10})
        shooter=ship(state,'0-destroyer-1');shooter.update({'x':10,'z':10})
        self.assertTrue(fire(state,0,'attack',shooter['id'],observer)['ok']);self.assertEqual(snapshot(state,1)['lastShot']['source'],{'x':10,'z':10})
        finish(state);observer['x']=16;self.assertNotIn('source',snapshot(state,1)['lastShot'])
        observer.update({'x':12,'sunk':True,'hp':0});self.assertNotIn('source',snapshot(state,1)['lastShot'])
        hidden=combat_battle();ship(hidden,'0-destroyer-1').update({'x':10,'z':10})
        fire(hidden,0,'attack','0-destroyer-1',{'x':29,'z':29});finish(hidden);ship(hidden,'1-destroyer-1').update({'x':12,'z':10})
        self.assertTrue(any(s['id']=='0-destroyer-1' for s in snapshot(hidden,1)['revealed']));self.assertNotIn('source',snapshot(hidden,1)['lastShot'])

    def test_last_ap_move_recon_attack_waits_for_explicit_end_ignoring_wrecks(self):
        for kind in ('move','recon','attack'):
            state=combat_battle();state['islands']=[]
            for own in [s for s in state['ships'] if s['team']==0]:own['ap']=0
            wreck=ship(state,'0-destroyer-2');wreck.update(hp=0,sunk=True,ap=99)
            actor=ship(state,'0-carrier' if kind=='recon' else '0-destroyer-1');actor['ap']=1
            target={'x':2,'z':4} if kind=='move' else {'x':26,'z':28}
            self.assertTrue(action(state,0,kind,actor['id'],target)['ok']);self.assertEqual(state['turn'],0);self.assertEqual(actor['ap'],0);self.assertEqual(wreck['ap'],99)
            self.assertTrue(action(state,0,'end')['ok']);self.assertEqual(state['turn'],1)
            self.assertTrue(all(v['ap']==v['maxAp'] for v in state['ships'] if v['team']==1 and not v['sunk']))

    def test_explicit_end_expiry_privacy_and_victory_priority(self):
        state=combat_battle();state['recon']=[{'center':{'x':28,'z':26},'team':0,'carrierId':'0-carrier','expiresAt':3}]
        self.assertTrue(action(state,0,'attack','0-destroyer-1',ship(state,'1-destroyer-1'))['ok']);self.assertNotIn('lastShot',state);action(state,0,'end')
        self.assertEqual(state['turn'],1);self.assertEqual(snapshot(state,0)['revealed'],[]);self.assertNotIn('shipId',snapshot(state,0)['lastShot'])
        win=combat_battle()
        for enemy in win['ships']:
            if enemy['team']==1:enemy.update(hp=0,sunk=True)
        last=ship(win,'1-destroyer-1');last.update(hp=200,sunk=False)
        fire(win,0,'attack','0-destroyer-1',last);self.assertEqual(win['phase'],'battle');finish(win);self.assertEqual((win['phase'],win['winner'],win['turn']),('finished',0,0))

    def test_auto_end_does_not_run_for_rejected_or_nonzero_ap(self):
        state=combat_battle();state['islands']=[]
        for own in [s for s in state['ships'] if s['team']==0]: own['ap']=0
        ship(state,'0-destroyer-1')['ap']=2
        for enemy in [s for s in state['ships'] if s['team']==1]: enemy['ap']=0
        for change in ({'phase':'setup'},{'phase':'finished'},{'connected':[True,False]},{'turn':1}):
            blocked=copy.deepcopy(state);blocked.update(change);before=copy.deepcopy(blocked)
            self.assertFalse(action(blocked,0,'move','0-destroyer-1',{'x':2,'z':4})['ok']);self.assertEqual(blocked,before)
        self.assertTrue(action(state,0,'move','0-destroyer-1',{'x':2,'z':4})['ok']);self.assertEqual(state['turn'],0);self.assertEqual(ship(state,'0-destroyer-1')['ap'],1)

    def test_both_opening_turns_reject_without_mutation_or_rng_then_allow(self):
        state=create_battle();draws=[]
        for team in (0,1):
            self.assertEqual(state['turn'],team);self.assertTrue(is_opening_turn(state));before=copy.deepcopy(state)
            result=fire(state,team,'attack',f'{team}-destroyer-1',ship(state,f'{1-team}-carrier'),lambda:draws.append(1) or .9)
            self.assertEqual(result,{'ok':False,'error':'첫 턴에는 공격할 수 없습니다'});self.assertEqual(state,before);self.assertEqual(draws,[])
            self.assertTrue(action(state,team,'recon',f'{team}-carrier',{'x':15,'z':15})['ok'])
            self.assertTrue(action(state,team,'move',f'{team}-destroyer-1',{'x':27,'z':25} if team else {'x':2,'z':4})['ok'])
            action(state,team,'end')
        for team in (0,1):
            self.assertFalse(is_opening_turn(state));self.assertTrue(fire(state,team,'attack',f'{team}-destroyer-1',ship(state,f'{1-team}-destroyer-2'))['ok'])
            self.assertEqual(ship(state,f'{1-team}-destroyer-2')['hp'],300);action(state,team,'end')

    def test_corner_placement_identity_zones_and_authority(self):
        state=create_battle(False)
        formation=[('carrier',3,3),('destroyer-1',2,1),('destroyer-2',5,3),('battleship-1',2,5),('battleship-2',4,5),('destroyer-3',4,1),('battleship-3',1,3)]
        for team in (0,1): self.assertEqual([(v['id'],v['x'],v['z']) for v in state['ships'] if v['team']==team],[(f'{team}-{suffix}',29-x if team else x,29-z if team else z) for suffix,x,z in formation])
        self.assertEqual(state['phase'],'setup');self.assertEqual(state['ready'],[False,False])
        self.assertEqual(len(deployment_cells(0)),49);self.assertEqual(len(deployment_cells(1)),49)
        fleet=[{'id':s['id'],'x':i,'z':6,'heading':-math.pi/2,'hp':99999,'ap':99} for i,s in enumerate([s for s in state['ships'] if s['team']==0])]
        self.assertTrue(placement_valid(fleet,0));self.assertFalse(placement_valid(fleet[:5],0))
        for change in ({'x':7},{'x':1},{'id':'1-carrier'},{'heading':True},{'heading':10**1000}):
            bad=copy.deepcopy(fleet);bad[0].update(change);before=copy.deepcopy(state)
            self.assertFalse(apply_placement(state,0,bad)['ok']);self.assertEqual(state,before)
        self.assertTrue(apply_placement(state,0,fleet)['ok'])
        self.assertEqual(ship(state,'0-carrier')['hp'],1000);self.assertEqual(ship(state,'0-carrier')['ap'],4)
        self.assertEqual(snapshot(state,1)['revealed'],[])
        self.assertTrue(start_battle(state)['ok']);self.assertFalse(apply_placement(state,0,fleet)['ok'])

    def test_local_damage_validation_marks_and_private_copy(self):
        state=combat_battle();target=ship(state,'1-destroyer-1');before=copy.deepcopy(state)
        for aim in ({'x':2,'z':0},{'x':True,'z':0},{'x':10**1000,'z':0},{'x':0,'z':float('nan')}):
            self.assertFalse(fire_command(state,0,{'type':'attack','shipId':'0-destroyer-1','target':target,'localHit':aim})['ok']);self.assertEqual(state,before)
        self.assertTrue(fire_command(state,0,{'type':'attack','shipId':'0-destroyer-1','target':target,'localHit':{'x':.7,'z':-.3}},lambda:.9)['ok'])
        self.assertEqual(target['hp'],300);self.assertEqual((target['x'],target['z']),(28,26));self.assertEqual(len(target['damageMarks']),1)
        self.assertEqual(snapshot(state,0)['revealed'],[])
        view=snapshot(state,1)
        next(s for s in view['own'] if s['id']==target['id'])['damageMarks'][0]['x']=99
        self.assertEqual(target['damageMarks'][0]['x'],.7)
        action(state,0,'end');action(state,1,'end');self.assertTrue(fire(state,0,'attack','0-destroyer-1',target)['ok'])
        self.assertEqual(len(target['damageMarks']),2);self.assertNotEqual(target['damageMarks'][0]['seed'],target['damageMarks'][1]['seed'])
        blocked=combat_battle();fire(blocked,0,'attack','0-destroyer-1',ship(blocked,'1-carrier'),lambda:0)
        self.assertNotIn('damageMarks',ship(blocked,'1-carrier'))

    def test_map_stats_and_step_cost(self):
        state=fixture_battle()
        self.assertEqual(BOARD_SIZE,30)
        self.assertEqual(len(ISLANDS),3)
        self.assertEqual(len(state['ships']),14)
        for team in (0,1):
            fleet=[s for s in state['ships'] if s['team']==team]
            self.assertEqual([sum(s['kind']==kind for s in fleet) for kind in ('carrier','destroyer','battleship')],[1,3,3])
            self.assertEqual([SHIPS[k]['count'] for k in ('carrier','destroyer','battleship')],[1,3,3])
        self.assertEqual([SHIPS[k]['hp'] for k in ('carrier','destroyer','battleship')],[1000,500,800])
        state['islands']=[]
        mover=ship(state,'0-destroyer-1')
        self.assertTrue(action(state,0,'move',mover['id'],{'x':8,'z':6})['ok'])
        self.assertEqual(mover['ap'],0)
        self.assertFalse(action(state,0,'move',mover['id'],{'x':9,'z':6})['ok'])
        action(state,0,'end');action(state,1,'end')
        self.assertEqual(mover['ap'],4)
        self.assertFalse(mover['moved'])

    def test_no_diagonal_corner_cutting_and_live_occupancy(self):
        state=fixture_battle();state['islands']=[{'x':2,'z':1}]
        mover=ship(state,'0-destroyer-1');mover.update({'x':1,'z':1,'ap':1})
        self.assertFalse(action(state,0,'move',mover['id'],{'x':2,'z':2})['ok'])
        mover['ap']=2
        self.assertTrue(action(state,0,'move',mover['id'],{'x':2,'z':2})['ok'])
        self.assertEqual(mover['ap'],0)
        state=fixture_battle();state['islands']=[]
        enemy=ship(state,'1-destroyer-1');enemy.update({'x':5,'z':3})
        self.assertFalse(action(state,0,'move','0-destroyer-1',{'x':5,'z':3})['ok'])
        enemy.update({'sunk':True,'hp':0})
        self.assertTrue(action(state,0,'move','0-destroyer-1',{'x':5,'z':3})['ok'])

    def test_attack_cost_once_and_euclidean_range(self):
        state=fixture_battle();before=copy.deepcopy(state)
        for identifier,target in [('0-battleship-1',{'x':21,'z':6}),('0-battleship-1',{'x':22,'z':2}),('0-destroyer-1',state['islands'][0]),('0-carrier',{'x':4,'z':27}),('0-destroyer-1',{'x':9,'z':2})]:self.assertFalse(action(state,0,'attack',identifier,target)['ok'])
        self.assertEqual(state,before);self.assertTrue(action(state,0,'attack','0-battleship-1',{'x':21,'z':5})['ok']);self.assertFalse(action(state,0,'attack','0-battleship-1',{'x':21,'z':5})['ok'])
        self.assertTrue(action(state,0,'attack','0-destroyer-1',{'x':4,'z':27})['ok']);self.assertEqual(ship(state,'1-destroyer-1')['hp'],500)
        self.assertTrue(action(state,0,'move','0-destroyer-1',{'x':6,'z':4})['ok']);self.assertEqual(ship(state,'0-destroyer-1')['ap'],1);present(state);self.assertEqual(ship(state,'1-destroyer-1')['hp'],300)

    def test_recon_shape_lifetime_edges_and_movement_lock(self):
        state=fixture_battle();baseline=snapshot(state,0)['visibleCells']
        self.assertTrue(action(state,0,'recon','0-carrier',{'x':14,'z':27})['ok'])
        self.assertEqual(len(snapshot(state,0)['visibleCells']),len(baseline)+21)
        self.assertNotIn({'x':12,'z':25},snapshot(state,0)['visibleCells'])
        self.assertEqual(snapshot(state,1)['recon'],[])
        self.assertEqual(ship(state,'0-carrier')['ap'],3);self.assertFalse(action(state,0,'recon','0-carrier',{'x':15,'z':15})['ok'])
        action(state,0,'end');action(state,1,'end')
        self.assertEqual(len(snapshot(state,0)['visibleCells']),len(baseline)+21)
        action(state,0,'end')
        self.assertEqual(snapshot(state,0)['visibleCells'],baseline)
        edge=fixture_battle()
        for i,s in enumerate([s for s in edge['ships'] if s['team']==0]): s.update({'x':20+i,'z':15})
        base=len(snapshot(edge,0)['visibleCells']);action(edge,0,'recon','0-carrier',{'x':0,'z':0})
        self.assertEqual(len(snapshot(edge,0)['visibleCells']),base+8)
        moved=fixture_battle();action(moved,0,'move','0-carrier',{'x':15,'z':2})
        self.assertFalse(action(moved,0,'recon','0-carrier',{'x':10,'z':10})['ok'])

    def test_defense_both_weapons_independent_sequential_draws(self):
        for kind in ('destroyer','battleship'):
            for draws,damage,blocked,halved in (([.2],0,True,False),([.5,.2],100,False,True),([.33,.33],200,False,False)):
                state=fixture_battle();attacker=ship(state,f'0-{kind}-1');attacker.update({'x':14,'z':19})
                calls=[]
                def rng():
                    calls.append(len(calls));return draws[len(calls)-1]
                self.assertTrue(fire(state,0,'attack',attacker['id'],{'x':14,'z':27},rng)['ok'])
                self.assertEqual(len(calls),len(draws))
                self.assertEqual([state['lastShot'][key] for key in ('damage','blocked','halved')],[damage,blocked,halved])
                self.assertEqual(ship(state,'1-carrier')['hp'],1000-damage)

    def test_carrier_death_clears_sight_and_seventh_sinking_wins(self):
        state=fixture_battle();state['recon']=[{'center':{'x':4,'z':2},'team':1,'carrierId':'1-carrier','expiresAt':99}];ship(state,'1-carrier')['hp']=200
        fire(state,0,'attack','0-destroyer-1',ship(state,'1-carrier'));self.assertEqual(snapshot(state,1)['recon'],[]);self.assertEqual(state['phase'],'battle')
        win=fixture_battle()
        for enemy in win['ships']:
            if enemy['team']==1:enemy.update(hp=0,sunk=True)
        for identifier in ('1-destroyer-3','1-battleship-3'):ship(win,identifier).update(hp=200,sunk=False)
        action(win,0,'attack','0-destroyer-1',ship(win,'1-destroyer-3'));action(win,0,'attack','0-destroyer-3',ship(win,'1-battleship-3'));present(win);self.assertEqual(win['phase'],'battle');finish(win);self.assertEqual(win['winner'],0)

    def test_hidden_hit_source_identity_hp_recon_and_history_scrubbed(self):
        state=fixture_battle();fire(state,0,'attack','0-destroyer-1',{'x':4,'z':27})
        attack,defense=snapshot(state,0),snapshot(state,1)
        self.assertEqual(attack['revealed'],[])
        self.assertNotIn('shipId',attack['lastShot'])
        self.assertEqual(defense['lastShot']['sourceShip']['id'],'0-destroyer-1')
        self.assertEqual(defense['lastShot']['shipId'],'1-destroyer-1')
        for key in ('ships','history','lastAction','lastShotVisibility'): self.assertNotIn(key,attack)
        action(state,0,'end');fire(state,1,'recon','1-carrier',{'x':4,'z':2})
        self.assertEqual(snapshot(state,1)['lastShot']['kind'],'airstrike');self.assertEqual(snapshot(state,1)['lastShot']['source'],{'x':14,'z':27})
        snapshot(state,0)['own'][0]['hp']=1
        self.assertEqual(ship(state,'0-carrier')['hp'],1000)

class ExtendedCoreTests(unittest.TestCase):
    def disable(self,state,identifier,key): ship(state,identifier)['parts'][key]={'hp':0,'maxHp':200,'disabled':True}
    def aimed(self,state,attacker,victim,x,z,rng=lambda:.9):
        result=fire_command(state,state['turn'],{'type':'attack','shipId':attacker,'target':ship(state,victim),'localHit':{'x':x,'z':z}},rng)
        if result['ok']: present(state,rng)
        return result
    def test_parts_positions_penalties_and_private_copy(self):
        for key in ('engine','weapon','radar'):
            point=source_hit('destroyer',key)
            state=fixture_battle();victim=ship(state,'1-destroyer-1')
            self.assertTrue(self.aimed(state,'0-destroyer-1',victim['id'],point['x'],point['z'])['ok']);self.assertEqual(victim['hp'],300);self.assertTrue(victim['parts'][key]['disabled']);self.assertEqual(sum(p['disabled'] for p in victim['parts'].values()),1)
            self.assertEqual(snapshot(state,0)['revealed'],[]);view=snapshot(state,1);next(s for s in view['own'] if s['id']==victim['id'])['parts'][key]['hp']=99;self.assertEqual(victim['parts'][key]['hp'],0)
            action(state,0,'end');before=copy.deepcopy(state)
            if key=='engine': self.assertFalse(action(state,1,'move',victim['id'],{'x':5,'z':26})['ok'])
            if key=='weapon': self.assertFalse(fire(state,1,'attack',victim['id'],ship(state,'0-destroyer-1'))['ok'])
            self.assertEqual(state,before)
        state=fixture_battle()
        for s in [s for s in state['ships'] if s['team']==0]: s.update({'hp':0,'sunk':True})
        watcher=ship(state,'0-battleship-1');watcher.update({'hp':800,'sunk':False,'x':10,'z':10});self.assertEqual(len(snapshot(state,0)['visibleCells']),21);self.disable(state,watcher['id'],'radar');self.assertEqual(len(snapshot(state,0)['visibleCells']),9)
    def test_deck_loss_and_half_damage_then_aa_failure(self):
        state=fixture_battle();action(state,0,'end');action(state,1,'recon','1-carrier',{'x':14,'z':15});action(state,1,'end');self.assertEqual(len(state['recon']),1)
        self.aimed(state,'0-destroyer-1','1-carrier',0,-.5);self.assertEqual(state['recon'],[]);action(state,0,'end');self.assertFalse(action(state,1,'recon','1-carrier',{'x':14,'z':15})['ok'])
        half=fixture_battle();aa=source_hit('carrier','airDefense');draws=iter((.9,.1));self.aimed(half,'0-destroyer-1','1-carrier',aa['x'],aa['z'],lambda:next(draws));self.assertEqual(ship(half,'1-carrier')['parts']['airDefense']['hp'],100);self.assertEqual(ship(half,'1-carrier')['hp'],900)
        action(half,0,'end');action(half,1,'end');self.aimed(half,'0-destroyer-1','1-carrier',aa['x'],aa['z']);action(half,0,'end');action(half,1,'end');calls=[];self.aimed(half,'0-destroyer-1','1-carrier',0,.8,lambda:calls.append(1) or 0);self.assertEqual(calls,[]);self.assertEqual(half['lastShot']['damage'],200)
    def test_single_escort_roll_projectile_types_and_broken_escort(self):
        for projectile in ('missile','shell','airstrike'):
            state=fixture_battle();state['islands']=[];target=ship(state,'1-battleship-1');target.update({'x':14,'z':15});ship(state,'0-battleship-1').update({'x':14,'z':5})
            for i,identifier in enumerate(('1-destroyer-1','1-destroyer-2')): ship(state,identifier).update({'x':12+i,'z':14})
            calls=[];rng=lambda:calls.append(1) or 0
            result=fire(state,0,'recon','0-carrier',target,rng) if projectile=='airstrike' else self.aimed(state,'0-battleship-1' if projectile=='shell' else '0-destroyer-1',target['id'],.5,.1,rng)
            self.assertTrue(result['ok']);self.assertEqual(state['lastShot']['kind'],projectile);self.assertEqual(len(calls),0 if projectile=='shell' else 1);self.assertEqual(state['lastShot']['damage'],200 if projectile=='shell' else 0)
            if projectile=='missile': self.assertNotIn('interceptedBy',snapshot(state,0)['lastShot']);self.assertEqual(snapshot(state,1)['lastShot']['interceptedBy'],{'x':12,'z':14})
        for broken in ('radar','airDefense'):
            state=fixture_battle();self.disable(state,'1-destroyer-1',broken);calls=[];self.aimed(state,'0-destroyer-1','1-destroyer-1',.5,.1,lambda:calls.append(1) or 0);self.assertEqual(calls,[]);self.assertEqual(state['lastShot']['damage'],200)
        state=fixture_battle();target=ship(state,'1-battleship-1');target.update({'x':14,'z':15});ship(state,'1-destroyer-1').update({'x':12,'z':13});calls=[];self.aimed(state,'0-destroyer-1',target['id'],.5,.1,lambda:calls.append(1) or 0);self.assertEqual(calls,[])
    def test_sortie_ap_nearest_single_target_opening_guard_and_move_after(self):
        state=route_battle();calls=[];action(state,0,'recon','0-carrier',ship(state,'1-destroyer-1'),lambda:calls.append(1) or 0);self.assertEqual(calls,[]);self.assertEqual(state['sequence'],0);self.assertEqual(ship(state,'0-carrier')['ap'],3)
        self.assertFalse(action(state,0,'recon','0-carrier',{'x':15,'z':15})['ok']);self.assertTrue(action(state,0,'move','0-carrier',{'x':3,'z':4})['ok']);self.assertEqual(ship(state,'0-carrier')['ap'],0)
        state=fixture_battle();first=ship(state,'1-battleship-1');second=ship(state,'1-battleship-2');first.update({'x':14,'z':15});second.update({'x':15,'z':15});fire(state,0,'recon','0-carrier',first);self.assertEqual(state['lastShot']['shipId'],first['id']);self.assertEqual((first['hp'],second['hp']),(600,800));self.assertEqual(ship(state,'0-carrier')['ap'],3)
        action(state,0,'end');action(state,1,'end');self.assertFalse(ship(state,'0-carrier')['scouted']);action(state,0,'move','0-carrier',{'x':15,'z':2});self.assertFalse(action(state,0,'recon','0-carrier',first)['ok'])
    def test_damage_control_caps_preserves_disabled_parts_and_scars(self):
        state=fixture_battle();v=ship(state,'0-carrier');v['hp']=900;v['parts']['radar']['hp']=100;self.disable(state,v['id'],'engine');v['damageMarks']=[{'x':0,'z':.8,'seed':1}]
        self.assertTrue(action(state,0,'repair',v['id'])['ok']);self.assertEqual((v['hp'],v['ap'],v['repairCharges']),(950,3,1));self.assertTrue(v['damageControl']);self.assertEqual(v['parts']['radar']['hp'],150);self.assertEqual(v['parts']['engine']['hp'],0);self.assertEqual(len(v['damageMarks']),1)
        before=copy.deepcopy(state);self.assertFalse(action(state,0,'repair',v['id'])['ok']);self.assertEqual(state,before);action(state,0,'end');action(state,1,'end');self.assertTrue(v['damageControl']);self.assertFalse(v['repaired']);action(state,0,'repair',v['id']);self.assertEqual(v['hp'],1000);self.assertEqual(v['parts']['radar']['hp'],200);self.assertEqual(v['repairCharges'],0)
        action(state,0,'end');self.aimed(state,'1-destroyer-1',v['id'],0,-.5);self.assertFalse(v['damageControl']);action(state,1,'end');self.assertFalse(can_repair_ship(v));v['sunk']=True;v['hp']=0;self.assertFalse(action(state,0,'repair',v['id'])['ok'])
    def test_hidden_route_discovers_contact_before_collision_and_charges_planned_route(self):
        state=fixture_battle();ship(state,'1-destroyer-1').update({'x':6,'z':5});self.assertEqual(snapshot(state,0)['revealed'],[])
        self.assertTrue(action(state,0,'move','0-destroyer-1',{'x':6,'z':5})['ok']);mover=ship(state,'0-destroyer-1');self.assertEqual(mover['ap'],1);self.assertNotEqual((mover['x'],mover['z']),(6,5));self.assertIn('1-destroyer-1',[s['id'] for s in snapshot(state,0)['revealed']])
    def test_hit_presentation_snapshot_is_deep_copied_without_persistent_vision(self):
        state=fixture_battle();victim=ship(state,'1-destroyer-1');fire(state,0,'recon','0-carrier',victim);before=snapshot(state,0)['lastShot']['targetBefore'];self.assertEqual(before['hp'],500);self.assertEqual(victim['hp'],300);before['parts']['engine']['hp']=9;self.assertEqual(state['lastShot']['targetBefore']['parts']['engine']['hp'],200)
        state['recon']=[];self.assertEqual(snapshot(state,0)['lastShot']['targetBefore']['hp'],500);self.assertEqual(snapshot(state,1)['lastShot']['targetBefore']['hp'],500)
        blind=fixture_battle();self.aimed(blind,'0-destroyer-1','1-destroyer-1',0,.8);self.assertEqual(snapshot(blind,0)['lastShot']['targetBefore']['id'],'1-destroyer-1');blind['recon']=[{'team':0,'carrierId':'0-carrier','center':{'x':4,'z':27},'expiresAt':blind['turnNumber']+2}];self.assertTrue(snapshot(blind,0)['revealed']);self.assertEqual(snapshot(blind,0)['lastShot']['targetBefore']['id'],'1-destroyer-1')
    def test_disabled_actionless_turns_keep_repair_ap_then_terminal_draw(self):
        state=fixture_battle()
        for s in [s for s in state['ships'] if s['team']==1]:
            self.disable(state,s['id'],'bridge');self.disable(state,s['id'],'engine');self.disable(state,s['id'],'flightDeck' if s['kind']=='carrier' else 'weapon');s['hp']-=200;s['repairCharges']=2
        action(state,0,'end');self.assertEqual(state['turn'],1);self.assertTrue(all(s['ap']==1 for s in [s for s in state['ships'] if s['team']==1]))
        for s in [s for s in state['ships'] if s['team']==1]: self.assertTrue(action(state,1,'repair',s['id'])['ok'])
        self.assertEqual(state['turn'],1);action(state,1,'end')
        for s in state['ships']:
            self.disable(state,s['id'],'bridge');self.disable(state,s['id'],'engine');self.disable(state,s['id'],'flightDeck' if s['kind']=='carrier' else 'weapon');s['repairCharges']=0
        action(state,0,'end');self.assertEqual(state['phase'],'finished');self.assertIsNone(state['winner'])

class FireTests(unittest.TestCase):

    def test_repaired_fire_checkpoint_survives_rehit_and_snapshot(self):
        state=combat_battle();state['islands']=[];victim=ship(state,'0-battleship-1');attacker=ship(state,'1-destroyer-1')
        victim.update(hp=600,damageMarks=[{'x':-.4,'z':-.4,'seed':11},{'x':.4,'z':.4,'seed':12}]);attacker.update(x=victim['x']+1,z=victim['z'])
        for count,hit in [(2,{'x':.8,'z':0}),(3,{'x':-.8,'z':0})]:
            self.assertTrue(action(state,0,'repair',victim['id'])['ok']);self.assertEqual(victim['extinguishedMarkCount'],count);self.assertTrue(victim['damageControl'])
            action(state,0,'end');self.assertTrue(fire_command(state,1,{'type':'attack','shipId':attacker['id'],'target':{'x':victim['x'],'z':victim['z']},'localHit':hit},lambda:.9)['ok'])
            self.assertFalse(victim['damageControl']);self.assertEqual(len(victim['damageMarks']),count+1)
            for you in (0,1):
                view=snapshot(state,you);contact=next(v for v in view['own']+view['revealed'] if v['id']==victim['id'])
                self.assertEqual(contact['extinguishedMarkCount'],count);self.assertEqual(contact['damageMarks'][count:],victim['damageMarks'][-1:])
            action(state,1,'end')
    def test_proportion_minimum_one_tick_no_projectile_or_subsystem_damage(self):
        for identifier,hp,damage in (('1-carrier',999,5),('1-carrier',899,6),('1-destroyer-1',300,10),('1-battleship-1',400,20),('1-carrier',50,48)):
            state=fixture_battle();v=ship(state,identifier);v.update({'hp':hp,'ap':0,'lastTurnDamage':99});parts=copy.deepcopy(v['parts']);marks=copy.deepcopy(v.get('damageMarks'));sequence=state['sequence'];self.assertTrue(action(state,0,'end')['ok']);self.assertEqual((v['hp'],v['lastTurnDamage'],v['ap']),(hp-damage,damage,v['maxAp']));self.assertEqual(v['parts'],parts);self.assertEqual(v.get('damageMarks'),marks);self.assertEqual(state['sequence'],sequence);self.assertEqual(state['history'],[]);self.assertNotIn('lastShot',state)
            once=v['hp'];self.assertTrue(action(state,1,'move',v['id'],{'x':v['x'],'z':v['z']-1})['ok']);self.assertEqual(v['hp'],once);self.assertEqual(ship(state,'0-carrier')['lastTurnDamage'],0);self.assertEqual(ship(state,'1-destroyer-2')['lastTurnDamage'],0)
    def test_repair_suppresses_hit_reignites_and_skipped_ticks_reset(self):
        state=fixture_battle();v=ship(state,'0-destroyer-1');v.update({'hp':300,'lastTurnDamage':10});action(state,0,'repair',v['id']);self.assertEqual(v['hp'],350);action(state,0,'end');action(state,1,'end');self.assertEqual(v['hp'],350);self.assertEqual(v['lastTurnDamage'],0);self.assertTrue(v['damageControl']);action(state,0,'end')
        fire_command(state,1,{'type':'attack','shipId':'1-destroyer-1','target':v,'localHit':{'x':.5,'z':.1}},lambda:.9);self.assertEqual(v['hp'],150);self.assertFalse(v['damageControl']);shot=copy.deepcopy(state['lastShot']);action(state,1,'end');self.assertEqual((v['hp'],v['lastTurnDamage']),(132,18));self.assertEqual(state['lastShot'],shot)
        skip=fixture_battle();dead=ship(skip,'1-destroyer-1');dead.update({'hp':0,'sunk':True,'lastTurnDamage':25});full=ship(skip,'1-carrier');full['lastTurnDamage']=25;action(skip,0,'end');self.assertEqual(dead['lastTurnDamage'],0);self.assertEqual(full['lastTurnDamage'],0)
    def test_lethal_batch_carrier_sight_victory_and_terminal_validation(self):
        state=fixture_battle()
        for v in [s for s in state['ships'] if s['team']==1]:v.update({'hp':0,'sunk':True,'ap':0})
        c=ship(state,'1-carrier');d=ship(state,'1-destroyer-1');c.update({'hp':20,'sunk':False,'ap':99});d.update({'hp':5,'sunk':False,'ap':99});state['recon']=[{'team':1,'carrierId':c['id'],'center':{'x':4,'z':2},'expiresAt':99}];action(state,0,'end');self.assertEqual((state['phase'],state['winner'],state['turn'],state['turnNumber']),('finished',0,1,4));self.assertEqual((c['hp'],c['ap'],c['lastTurnDamage']),(0,0,20));self.assertEqual((d['hp'],d['ap'],d['lastTurnDamage']),(0,0,5));self.assertTrue(c['sunk']);self.assertTrue(d['sunk']);self.assertEqual(state['recon'],[]);self.assertEqual(snapshot(state,1)['visibleCells'],[]);before=copy.deepcopy(state);self.assertFalse(action(state,1,'repair',c['id'])['ok']);self.assertEqual(state,before)
        draw=fixture_battle()
        for v in draw['ships']:v.update({'hp':0,'sunk':True,'ap':0})
        last=ship(draw,'1-carrier');last.update({'hp':1,'sunk':False});action(draw,0,'end');self.assertEqual(draw['phase'],'finished');self.assertEqual(draw['winner'],1)
    def test_tick_details_are_filtered_by_current_fog(self):
        state=fixture_battle();ship(state,'1-carrier')['hp']=899;action(state,0,'end');self.assertEqual(snapshot(state,0)['revealed'],[]);self.assertNotIn('lastTurnDamage',snapshot(state,0));self.assertEqual(next(v for v in snapshot(state,1)['own'] if v['id']=='1-carrier')['lastTurnDamage'],6);state['recon']=[{'team':0,'carrierId':'0-carrier','center':{'x':14,'z':27},'expiresAt':99}];view=snapshot(state,0)['revealed'][0];self.assertEqual((view['hp'],view['lastTurnDamage']),(893,6));state['recon']=[];self.assertEqual(snapshot(state,0)['revealed'],[])

class SonarTorpedoTests(unittest.TestCase):
    def test_shortest_detour_remaining_private_path_heading_and_immutable_unreachable(self):
        origin={'x':1,'z':1};target={'x':3,'z':1};land=[{'x':2,'z':1}]
        route=torpedo_route(origin,target,land);self.assertEqual(len(route),4);self.assertEqual(route[-1],target);self.assertNotIn(origin,route);self.assertNotIn(land[0],route)
        wall=[{'x':x,'z':5} for x in range(30)];self.assertEqual(torpedo_route({'x':3,'z':3},{'x':3,'z':7},wall),[])
        for terrain,goal in ((land,land[0]),(wall,{'x':3,'z':7})):
            state=fixture_battle();state['islands']=terrain;ship(state,'0-destroyer-1').update(x=3,z=3);before=copy.deepcopy(state)
            self.assertFalse(action(state,0,'torpedo','0-destroyer-1',goal)['ok']);self.assertEqual(state,before)
        state=fixture_battle();state['islands']=[{'x':7,'z':2}];self.assertTrue(action(state,0,'torpedo','0-destroyer-1',{'x':14,'z':2})['ok']);self.assertEqual(state['torpedoes'][0]['index'],0);planned=torpedo_route(ship(state,'0-destroyer-1'),{'x':14,'z':2},state['islands']);present(state);t=state['torpedoes'][0]
        self.assertEqual(t['index'],5);self.assertEqual(snapshot(state,0)['torpedoes'][0]['route'],planned[5:])
        clone=snapshot(state,0)['torpedoes'][0]['route'];clone[0]['x']=99;self.assertEqual(t['route'],planned)
        self.assertTrue(action(state,0,'end')['ok']);self.assertEqual((t['x'],t['z'],t['index']),(planned[4]['x'],planned[4]['z'],5));self.assertEqual(t['heading'],math.atan2(planned[4]['x']-planned[3]['x'],planned[4]['z']-planned[3]['z']))
        self.assertEqual(snapshot(state,0)['torpedoes'][0]['route'],planned[5:]);ship(state,'1-carrier').update(x=t['x'],z=t['z']+1);self.assertEqual(set(snapshot(state,1)['torpedoes'][0]),{'id','team','x','z','heading','route'})

    def disable(self,state,identifier,key):ship(state,identifier)['parts'][key]={'hp':0,'maxHp':200,'disabled':True}
    def test_sonar_all_kinds_ocean_radius_duration_and_bridge_gate(self):
        for kind in ('carrier','destroyer','battleship'):
            state=fixture_battle();state['islands']=[{'x':15,'z':10}]
            for v in [s for s in state['ships'] if s['team']==0]:v.update({'hp':0,'sunk':True})
            v=next(v for v in [s for s in state['ships'] if s['team']==0] if v['kind']==kind);v.update({'hp':v['maxHp'],'sunk':False,'x':10,'z':10});ship(state,'1-destroyer-1').update({'x':22,'z':10});ship(state,'1-destroyer-2').update({'x':22,'z':11});ap=v['ap'];self.assertTrue(action(state,0,'sonar',v['id'])['ok']);view=snapshot(state,0);self.assertEqual((v['ap'],v['sonared']),(ap-2,True));self.assertEqual(view['sonar'][0],{'shipId':v['id'],'team':0,'center':{'x':10,'z':10},'expiresAt':5});self.assertIn({'x':22,'z':10},view['visibleCells']);self.assertNotIn({'x':22,'z':11},view['visibleCells']);self.assertNotIn({'x':15,'z':10},view['visibleCells']);self.assertEqual([e['id'] for e in view['revealed']],['1-destroyer-1']);self.assertEqual(snapshot(state,1)['sonar'],[]);self.assertFalse(action(state,0,'sonar',v['id'])['ok']);action(state,0,'end');self.assertEqual(len(snapshot(state,0)['sonar']),1);action(state,1,'end');self.assertFalse(v['sonared']);self.assertEqual(len(snapshot(state,0)['sonar']),1);action(state,0,'end');self.assertEqual(snapshot(state,0)['sonar'],[])
        state=fixture_battle();self.disable(state,'0-carrier','bridge');before=copy.deepcopy(state);self.assertFalse(action(state,0,'sonar','0-carrier')['ok']);self.assertEqual(state,before)
    def test_torpedo_launch_range_ap_weapon_independent_missile_and_opening_guard(self):
        initial=create_battle()
        for team in (0,1):
            before=copy.deepcopy(initial);self.assertFalse(action(initial,team,'torpedo',f'{team}-destroyer-1',{'x':15,'z':15})['ok']);self.assertEqual(initial,before);action(initial,team,'end')
        state=fixture_battle();d=ship(state,'0-destroyer-1');self.assertFalse(action(state,0,'torpedo',d['id'],{'x':19,'z':3})['ok']);self.assertFalse(action(state,0,'torpedo','0-battleship-1',{'x':14,'z':2})['ok']);self.assertTrue(action(state,0,'torpedo',d['id'],{'x':19,'z':2})['ok']);self.assertEqual((d['ap'],d['torpedoed'],d['attacked']),(3,True,False));self.assertEqual(state['sequence'],0);self.assertFalse(action(state,0,'torpedo',d['id'],{'x':18,'z':2})['ok']);self.assertTrue(action(state,0,'attack',d['id'],{'x':29,'z':29})['ok']);self.assertEqual(d['ap'],2)
        disabled=fixture_battle();self.disable(disabled,d['id'],'weapon');before=copy.deepcopy(disabled);self.assertFalse(action(disabled,0,'torpedo',d['id'],{'x':14,'z':2})['ok']);self.assertEqual(disabled,before)
    def test_every_side_end_five_steps_destination_island_corner_and_exact_collision(self):
        state=fixture_battle();state['islands']=[];action(state,0,'torpedo','0-destroyer-1',{'x':19,'z':2});self.assertEqual((state['torpedoes'][0]['x'],state['torpedoes'][0]['index']),(4,0))
        action(state,0,'end');self.assertEqual((state['torpedoes'][0]['x'],state['torpedoes'][0]['index']),(9,5));action(state,1,'end');self.assertEqual(state['torpedoes'][0]['index'],10)
        action(state,0,'end');self.assertEqual(state['torpedoes'],[])
        for land in [{'x':7,'z':2},{'x':5,'z':2}]:
            route=torpedo_route({'x':4,'z':2},{'x':14,'z':2},[land]);previous={'x':4,'z':2}
            for step in route:
                self.assertNotEqual(step,land)
                if step['x']!=previous['x'] and step['z']!=previous['z']:self.assertNotEqual({'x':step['x'],'z':previous['z']},land);self.assertNotEqual({'x':previous['x'],'z':step['z']},land)
                previous=step

    def test_defense_bypass300_subsystem_damage_and_launch_source_privacy(self):
        state=fixture_battle();state['islands']=[];v=ship(state,'1-carrier');v.update({'x':7,'z':2});ship(state,'1-destroyer-1').update({'x':7,'z':3});calls=[];action(state,0,'torpedo','0-destroyer-1',{'x':14,'z':2},lambda:calls.append(1) or 0);action(state,0,'end',rng=lambda:calls.append(1) or 0);self.assertEqual(state['lastShot']['targetAfter']['hp'],700);self.assertEqual(len(v['damageMarks']),1);self.assertTrue(any(p['disabled'] for p in v['parts'].values()));self.assertEqual(calls,[]);self.assertEqual([state['lastShot'][k] for k in ('kind','damage','blocked','halved')],['torpedo',300,False,False])
        hidden=fixture_battle();hidden['islands']=[];action(hidden,0,'torpedo','0-destroyer-1',{'x':19,'z':2});action(hidden,0,'end');observer=ship(hidden,'1-carrier');observer.update({'x':10,'z':2});wake=snapshot(hidden,1)['torpedoes'][0];self.assertEqual(set(wake),{'id','team','x','z','heading','route'});action(hidden,1,'end');action(hidden,0,'end');self.assertNotIn('source',snapshot(hidden,1)['lastShot']);self.assertEqual(snapshot(hidden,1)['lastShot']['targetBefore']['id'],observer['id'])
    def test_sequential_torpedo_impacts_launcher_loss_and_terminal_win(self):
        state=fixture_battle();state['islands']=[];ship(state,'0-destroyer-2').update(x=4,z=4);ship(state,'1-carrier').update(x=8,z=2);ship(state,'1-battleship-1').update(x=8,z=4)
        action(state,0,'torpedo','0-destroyer-1',{'x':14,'z':2});action(state,0,'torpedo','0-destroyer-2',{'x':14,'z':4});ship(state,'0-destroyer-1').update(hp=0,sunk=True)
        reserve_action(state,0,{'type':'end'});self.assertEqual(resolve_attack_step(state)['shot']['sequence'],1);self.assertEqual(len(snapshot(state,1)['shots']),1);self.assertEqual(resolve_attack_step(state)['shot']['sequence'],2);self.assertEqual(len(snapshot(state,1)['shots']),1)
        self.assertEqual((ship(state,'1-carrier')['hp'],ship(state,'1-battleship-1')['hp']),(700,500));finish(state);self.assertEqual(snapshot(state,0)['shots'],[])
        win=fixture_battle();win['islands']=[]
        for enemy in win['ships']:
            if enemy['team']==1:enemy.update(hp=0,sunk=True)
        ship(win,'1-carrier').update(hp=300,sunk=False,x=8,z=2);action(win,0,'torpedo','0-destroyer-1',{'x':14,'z':2});present(win);self.assertEqual(win['phase'],'battle');finish(win);self.assertEqual(win['winner'],0)

    def test_remaining_bridge_sonar_and_pending_projectile_prevent_premature_deadlock(self):
        state=fixture_battle();state['islands']=[];action(state,0,'torpedo','0-destroyer-1',{'x':19,'z':2});action(state,0,'end')
        for v in state['ships']:
            for part in ('bridge','engine','flightDeck' if v['kind']=='carrier' else 'weapon'):self.disable(state,v['id'],part)
            v['repairCharges']=0
        action(state,1,'end');self.assertEqual(state['phase'],'battle');action(state,0,'end');action(state,1,'end');action(state,0,'end');self.assertEqual(state['torpedoes'],[]);self.assertEqual((state['phase'],state['winner']),('finished',None))

class RoomTests(unittest.IsolatedAsyncioTestCase):
    async def test_detected_enemy_torpedo_route_over_websocket_has_no_hidden_launch_data(self):
        host,guest,a,b=await self.pair();await self.ready(a,b)
        room=self.client.app[ROOMS_KEY][host['code']];state=room.battle
        state['islands']=[];launcher=ship(state,'0-destroyer-1');launcher.update(x=4,z=2)
        observer=ship(state,'1-carrier');observer.update(x=12,z=8)
        sa,sb=await self.send(a,b,a,{'type':'torpedo','shipId':launcher['id'],'target':{'x':19,'z':2}});self.assertEqual(sb['torpedoes'],[])
        await self.send(a,b,a,{'type':'end'})
        sa,sb=await self.send(a,b,b,{'type':'sonar','shipId':observer['id']});contact=sb['torpedoes'][0]
        self.assertEqual(set(contact),{'id','team','x','z','heading','route'});self.assertEqual(len(contact['route']),10)
        self.assertEqual(contact['route'],sa['torpedoes'][0]['route']);self.assertEqual(sa['torpedoes'][0]['target'],{'x':19,'z':2})
        observer.update(x=26,z=26);state['sonar']=[]
        sa,sb=await self.send(a,b,b,{'type':'end'});self.assertEqual(sb['torpedoes'],[])


    async def asyncSetUp(self):
        asyncio.get_running_loop().set_debug(False);app=web.Application();setup_battleship(app,origin='https://battle.example')
        self.rng_patch=patch('battleship_rooms.random.random',return_value=.9);self.rng_patch.start();self.resolution_patch=patch('battleship_rooms.resolve_attack_step',side_effect=lambda state:resolve_attack_step(state,lambda:.9));self.resolve_mock=self.resolution_patch.start()
        self.client=TestClient(TestServer(app));await self.client.start_server();self.sockets=[]
    async def asyncTearDown(self):
        for socket in self.sockets: await socket.close()
        await self.client.close();self.rng_patch.stop();self.resolution_patch.stop()
    async def state(self,socket,predicate=lambda state:True):
        async with asyncio.timeout(6):
            while True:
                frame=await socket.receive_json();self.assertEqual(frame['type'],'state',str(frame))
                value=frame['state'];self.assertEqual(len(value['own']),7)
                self.assertEqual([sum(s['kind']==kind for s in value['own']) for kind in ('carrier','destroyer','battleship')],[1,3,3])
                if predicate(value):return value
    async def connect(self,seat):
        socket=await self.client.ws_connect(f'/ws/battleship/{seat["code"]}?token={seat["token"]}')
        self.sockets.append(socket);await self.state(socket);return socket
    async def pair(self):
        host=await(await self.client.post('/api/battleship/rooms',json={})).json()
        guest=await(await self.client.post(f'/api/battleship/rooms/{host["code"]}/join',json={})).json()
        a,b=await self.connect(host),await self.connect(guest);await self.state(a);self.room=self.client.server.app[ROOMS_KEY][host['code']]
        await self.send(a,b,a,{'type':'placement','fleet':scenario_fleet(0)})
        await self.send(a,b,b,{'type':'placement','fleet':scenario_fleet(1)})
        return host,guest,a,b
    async def send(self,a,b,source,message):
        await asyncio.sleep(.09)
        if message.get('type')=='end' and self.room.battle['combatPhase']=='attack':
            return await self.complete(a,b,self.room.battle['turnNumber']+1)
        before=self.room.battle['revision'];await source.send_json(message)
        submitted=await self.state(source,lambda s:s['revision']>before)
        if source is a:sa=submitted;sb=await self.state(b,lambda s:s['revision']==sa['revision'])
        else:sb=submitted;sa=await self.state(a,lambda s:s['revision']==sb['revision'])
        if message.get('type')=='end':return await self.complete(a,b,sa['turnNumber']+1,sa,sb)
        return sa,sb
    async def firing(self,a,b,source,message):
        sa,sb=await self.send(a,b,source,message)
        self.assertEqual(sa['combatPhase'],'action');self.assertEqual(sa.get('shots'),[])
        await source.send_json({'type':'end'})
        sa=await self.state(a,lambda s:s.get('resolutionStep') is not None);sb=await self.state(b,lambda s:s.get('resolutionStep')==sa['resolutionStep'])
        self.assertEqual(sa['combatPhase'],'attack');return sa,sb
    async def complete(self,a,b,next_turn,sa=None,sb=None):
        if sa is None:
            step=self.room.battle.get('resolutionStep');await a.send_json({'type':'attack-complete','step':step});await b.send_json({'type':'attack-complete','step':step})
        last=self.room.battle.get('resolutionStep',0) if sa is None else sa.get('resolutionStep',0)
        while True:
            sa=await self.state(a,lambda s:s['phase']=='finished' or s['turnNumber']==next_turn or s.get('resolutionStep',0)>last)
            sb=await self.state(b,lambda s:s['revision']==sa['revision'])
            if sa['phase']=='finished' or sa['turnNumber']==next_turn:return sa,sb
            last=sa['resolutionStep'];await a.send_json({'type':'attack-complete','step':last});await b.send_json({'type':'attack-complete','step':last})
    async def error(self,socket,message):
        await asyncio.sleep(.09);await socket.send_json(message)
        async with asyncio.timeout(5):
            while (await socket.receive_json()).get('type')!='error':pass
    async def ready(self,a,b,opening=False):
        sa,sb=await self.send(a,b,a,{'type':'ready','fleet':scenario_fleet(0)})
        self.assertEqual(sa['phase'],'waiting');self.assertEqual(sb['phase'],'setup')
        sa,sb=await self.send(a,b,b,{'type':'ready','fleet':scenario_fleet(1)})
        if not opening:
            await self.send(a,b,a,{'type':'end'});sa,sb=await self.send(a,b,b,{'type':'end'})
        return sa,sb
    async def test_auth_origin_private_fleets_and_authoritative_actions(self):
        host,guest,a,b=await self.pair()
        self.assertNotEqual(host['token'],guest['token'])
        self.assertEqual((await self.client.post(f'/api/battleship/rooms/{host["code"]}/join',json={})).status,409)
        self.assertEqual((await self.client.post('/api/battleship/rooms',json={},headers={'Origin':'https://evil.example'})).status,403)
        with self.assertRaises(WSServerHandshakeError): await self.client.ws_connect(f'/ws/battleship/{host["code"]}?token=wrong')
        with self.assertRaises(WSServerHandshakeError): await self.client.ws_connect(f'/ws/battleship/{host["code"]}?token={host["token"]}',headers={'Origin':'https://evil.example'})
        await self.error(a,{'type':'attack','shipId':'0-destroyer-1','target':{'x':28,'z':26}})
        sa,sb=await self.ready(a,b)
        self.assertEqual(len(sa['own']),7);self.assertEqual(sa['revealed'],[]);self.assertEqual(sb['revealed'],[])
        await self.error(b,{'type':'end'})
        await self.error(a,{'type':'move','shipId':'1-destroyer-1','target':{'x':5,'z':27}})
        await self.error(a,{'type':'move','shipId':'0-destroyer-1','target':{'x':True,'z':3}})
        await self.error(a,{'type':'attack','shipId':'0-battleship-1','target':{'x':29,'z':29}})
        with patch('battleship_rooms.random.random',return_value=0):
            sa,sb=await self.send(a,b,a,{'type':'recon','shipId':'0-carrier','target':{'x':26,'z':29}})
        self.assertIn({'x':26,'z':29},sa['visibleCells']);self.assertEqual([s['id'] for s in sa['revealed']],['1-carrier'])
        self.assertEqual(sb['recon'],[]);self.assertEqual(sb['revealed'],[])
        sa,sb=await self.send(a,b,a,{'type':'action','action':{'type':'attack','shipId':'0-destroyer-1','target':{'x':28,'z':26}}})
        self.assertNotIn('lastShot',sa);self.assertEqual(next(s['hp'] for s in sb['own'] if s['id']=='1-destroyer-1'),500)
        await self.error(a,{'type':'attack','shipId':'0-destroyer-1','target':{'x':28,'z':26}})
        before=copy.deepcopy(sb)
        sa,sb=await self.send(a,b,a,{'type':'move','shipId':'0-destroyer-1','target':{'x':2,'z':4}})
        before.pop('revision');sb.pop('revision');before.pop('shots');sb.pop('shots')
        self.assertEqual(before,sb,'hidden enemy movement must not serialize a location or action log')
        self.resolve_mock.side_effect=lambda state:resolve_attack_step(state,lambda:0 if state['turn']==0 and state['attackProgress']['completed']==0 else .9)
        sa,sb=await self.send(a,b,a,{'type':'end'})
        self.assertEqual(sa['turn'],1);self.assertEqual(sa['lastShot']['damage'],200);self.assertNotIn('source',sb['lastShot']);self.assertEqual(next(v['hp'] for v in sb['own'] if v['id']=='1-destroyer-1'),290)
        await asyncio.sleep(1.05)
        sa,sb=await self.firing(a,b,b,{'type':'recon','shipId':'1-carrier','target':{'x':2,'z':4}})
        self.assertIn('0-destroyer-1',[s['id'] for s in sb['revealed']])
        self.assertEqual(sb['lastShot']['kind'],'airstrike');self.assertEqual(sb['lastShot']['source'],{'x':26,'z':28})
    async def test_deployment_validation_lock_and_private_marks(self):
        host,guest,a,b=await self.pair()
        fleet=[{'id':s['id'],'x':i,'z':6,'heading':1.25,'hp':999999,'ap':999} for i,s in enumerate([s for s in create_battle()['ships'] if s['team']==0])]
        bad=copy.deepcopy(fleet);bad[0]['x']=8
        await self.error(a,{'type':'ready','fleet':bad})
        sa,sb=await self.send(a,b,a,{'type':'placement','fleet':fleet})
        self.assertEqual(sa['phase'],'setup');self.assertEqual(sb['revealed'],[])
        self.assertEqual(sa['own'][0]['hp'],1000);self.assertEqual(sa['own'][0]['ap'],4);self.assertEqual(sa['own'][0]['heading'],1.25)
        sa,sb=await self.send(a,b,a,{'type':'ready','fleet':fleet})
        self.assertEqual(sa['phase'],'waiting');await self.error(a,{'type':'placement','fleet':fleet})
        await self.send(a,b,b,{'type':'ready'})
        await self.send(a,b,a,{'type':'end'});await self.send(a,b,b,{'type':'end'})
        await self.error(a,{'type':'attack','shipId':'0-destroyer-1','target':{'x':28,'z':26},'localHit':{'x':1.1,'z':0}})
        sa,sb=await self.firing(a,b,a,{'type':'attack','shipId':'0-destroyer-1','target':{'x':28,'z':26},'localHit':{'x':-.6,'z':.2}})
        self.assertEqual(sa['revealed'],[]);self.assertNotIn('shipId',sa['lastShot']);self.assertEqual(sb['lastShot']['sourceShip']['team'],0)
        victim=next(s for s in sb['own'] if s['id']=='1-destroyer-1')
        self.assertEqual(victim['hp'],300);self.assertEqual(victim['damageMarks'][0]['x'],-.6);self.assertEqual(victim['damageMarks'][0]['z'],.2)
    async def test_opening_turns_and_rematch_reset_are_authoritative(self):
        host,guest,a,b=await self.pair();await self.ready(a,b,opening=True)
        room=self.client.server.app[ROOMS_KEY][host['code']]
        for player,ws in ((0,a),(1,b)):
            before=copy.deepcopy(room.battle)
            await self.error(ws,{'type':'action','action':{'type':'attack','shipId':f'{player}-destroyer-1','target':{'x':26,'z':28} if player==0 else {'x':3,'z':1},'turnNumber':3}})
            self.assertEqual(room.battle,before)
            await self.send(a,b,ws,{'type':'end'})
        for player,ws in ((0,a),(1,b)):
            sa,sb=await self.firing(a,b,ws,{'type':'attack','shipId':f'{player}-destroyer-1','target':{'x':24,'z':26} if player==0 else {'x':5,'z':3}})
            self.assertEqual(sa['lastShot']['damage'],200);await self.send(a,b,ws,{'type':'end'})
        await self.send(a,b,a,{'type':'leave'});await a.close();await self.state(b)
        a2=await self.connect(host);await self.state(b)
        await self.send(a2,b,a2,{'type':'rematch'});await self.send(a2,b,b,{'type':'rematch'})
        await self.ready(a2,b,opening=True)
        self.assertEqual(room.battle['turnNumber'],1)
        for player,ws in ((0,a2),(1,b)):
            before=copy.deepcopy(room.battle)
            await self.error(ws,{'type':'attack','shipId':f'{player}-destroyer-1','target':{'x':24,'z':26} if player==0 else {'x':5,'z':3}})
            self.assertEqual(room.battle,before);await self.send(a2,b,ws,{'type':'end'})
    async def test_all_seven_ships_exhaust_ap_waits_for_explicit_end(self):
        host,guest,a,b=await self.pair();await self.ready(a,b,opening=True)
        routes=[('carrier',3,5),('destroyer-1',1,7),('destroyer-2',5,7),('battleship-1',2,9),('battleship-2',4,9),('destroyer-3',6,4),('battleship-3',0,9)]
        for player,ws in ((0,a),(1,b)):
            for i,(suffix,x,z) in enumerate(routes):
                target={'x':29-x if player else x,'z':29-z if player else z}
                sa,sb=await self.send(a,b,ws,{'type':'move','shipId':f'{player}-{suffix}','target':target})
                self.assertEqual(sa['turnNumber'],player+1)
                self.assertEqual(sa['turn'],player)
                self.assertEqual(sa['revealed'],[]);self.assertEqual(sb['revealed'],[]);self.assertNotIn('lastShot',sa)
            own=sa['own'] if player==0 else sb['own']
            self.assertTrue(all(s['ap']==0 for s in own))
            other=sb['own'] if player==0 else sa['own']
            if player==1:self.assertTrue(all(s['ap']==0 for s in other))
            sa,sb=await self.send(a,b,ws,{'type':'end'});self.assertEqual(sa['turn'],1-player)
            other=sb['own'] if player==0 else sa['own'];self.assertTrue(all(s['ap']==s['maxAp'] and not s['moved'] and not s['attacked'] for s in other))
        sa,sb=await self.firing(a,b,a,{'type':'attack','shipId':'0-destroyer-1','target':{'x':28,'z':22}})
        self.assertEqual(sa['lastShot']['sequence'],1);self.assertEqual(sa['lastShot']['damage'],200);self.assertEqual(sa['turnNumber'],3)
    async def test_passive_ship_visibility_and_shot_source_follow_actual_moves(self):
        host,guest,a,b=await self.pair();await self.ready(a,b,opening=True)
        for first,second in (({'x':5,'z':4},{'x':24,'z':25}),({'x':9,'z':7},{'x':20,'z':21}),({'x':13,'z':7},{'x':17,'z':17}),({'x':13,'z':11},{'x':17,'z':13})):
            sa,sb=await self.send(a,b,a,{'type':'move','shipId':'0-destroyer-1','target':first})
            self.assertEqual(sa['revealed'],[]);self.assertEqual(sb['revealed'],[])
            await self.send(a,b,a,{'type':'end'})
            sa,sb=await self.send(a,b,b,{'type':'move','shipId':'1-destroyer-1','target':second})
            self.assertEqual(sa['revealed'],[]);self.assertEqual(sb['revealed'],[])
            await self.send(a,b,b,{'type':'end'})
            await asyncio.sleep(.3) # Respect the public WebSocket per-second command limit.
        sa,sb=await self.send(a,b,a,{'type':'move','shipId':'0-destroyer-1','target':{'x':15,'z':12}})
        self.assertEqual([s['id'] for s in sa['revealed']],['1-destroyer-1']);self.assertEqual([s['id'] for s in sb['revealed']],['0-destroyer-1'])
        sa,sb=await self.firing(a,b,a,{'type':'attack','shipId':'0-destroyer-1','target':{'x':17,'z':13}})
        self.assertEqual(sb['lastShot']['source'],{'x':15,'z':12});self.assertEqual(sa['lastShot']['shipId'],'1-destroyer-1')
        await self.send(a,b,a,{'type':'end'})
        sa,sb=await self.send(a,b,b,{'type':'move','shipId':'1-destroyer-1','target':{'x':17,'z':17}})
        self.assertEqual(sa['revealed'],[]);self.assertEqual(sb['revealed'],[]);self.assertNotIn('source',sb['lastShot'])
    async def test_subsystem_hits_sortie_repair_and_client_override_rejection(self):
        host,guest,a,b=await self.pair();await self.ready(a,b)
        sa,sb=await self.firing(a,b,a,{'type':'attack','shipId':'0-destroyer-1','target':{'x':28,'z':26},'localHit':source_hit('destroyer','engine'),'damage':999,'parts':{},'repairCharges':99})
        self.assertEqual(sa['lastShot']['targetBefore']['id'],'1-destroyer-1');self.assertEqual(sa['revealed'],[]);self.assertEqual(sb['lastShot']['targetBefore']['hp'],500);victim=next(v for v in sb['own'] if v['id']=='1-destroyer-1');self.assertEqual(victim['hp'],300);self.assertTrue(victim['parts']['engine']['disabled']);self.assertEqual(victim['repairCharges'],2)
        await self.send(a,b,a,{'type':'end'});await self.error(b,{'type':'move','shipId':victim['id'],'target':{'x':27,'z':25}})
        sa,sb=await self.send(a,b,b,{'type':'repair','shipId':victim['id'],'hp':9999,'repairCharges':99});victim=next(v for v in sb['own'] if v['id']==victim['id']);self.assertEqual((victim['hp'],victim['ap'],victim['repairCharges']),(340,3,1));self.assertTrue(victim['parts']['engine']['disabled']);self.assertTrue(victim['damageControl']);await self.error(b,{'type':'repair','shipId':victim['id']})
        sa,sb=await self.send(a,b,b,{'type':'recon','shipId':'1-carrier','target':{'x':1,'z':3}});self.assertEqual(next(v for v in sb['own'] if v['kind']=='carrier')['ap'],3);await self.error(b,{'type':'recon','shipId':'1-carrier','target':{'x':2,'z':4}})
        sa,sb=await self.send(a,b,b,{'type':'move','shipId':'1-carrier','target':{'x':26,'z':25}});self.assertEqual(next(v for v in sb['own'] if v['kind']=='carrier')['ap'],0);sa,sb=await self.send(a,b,b,{'type':'end'});self.assertEqual(sb['lastShot']['kind'],'airstrike');self.assertEqual(sb['lastShot']['targetBefore']['hp'],500)
    async def test_server_plans_public_detour_ignores_client_path_and_keeps_enemy_route_private(self):
        host,guest,a,b=await self.pair();await self.ready(a,b);room=self.client.server.app[ROOMS_KEY][host['code']]
        room.battle['islands']=[{'x':3,'z':3}]
        expected=torpedo_route({'x':1,'z':3},{'x':11,'z':3},room.battle['islands'])
        before=copy.deepcopy(room.battle);await self.error(a,{'type':'torpedo','shipId':'0-destroyer-1','target':{'x':3,'z':3}});self.assertEqual(room.battle,before)
        sa,sb=await self.send(a,b,a,{'type':'torpedo','shipId':'0-destroyer-1','target':{'x':11,'z':3},'route':[{'x':3,'z':3}],'heading':999,'speed':999})
        self.assertEqual((sa['torpedoes'][0]['x'],sa['torpedoes'][0]['z']),(1,3));self.assertEqual(sa['torpedoes'][0]['target'],{'x':11,'z':3});self.assertEqual(sa['queuedAttacks'],[]);self.assertEqual(sb['torpedoes'],[]);self.assertEqual(next(v['ap'] for v in sa['own'] if v['id']=='0-destroyer-1'),3)
        sa,sb=await self.send(a,b,a,{'type':'end'});self.assertEqual(sa['torpedoes'][0]['route'],expected[5:]);self.assertEqual((sa['torpedoes'][0]['x'],sa['torpedoes'][0]['z']),(expected[4]['x'],expected[4]['z']))

    async def test_authoritative_sonar_torpedo_payload_privacy_and_once_flags(self):
        host,guest,a,b=await self.pair();await self.ready(a,b,opening=True);await self.error(a,{'type':'torpedo','shipId':'0-destroyer-1','target':{'x':10,'z':3}})
        sa,sb=await self.send(a,b,a,{'type':'sonar','shipId':'0-destroyer-1','center':{'x':28,'z':26},'expiresAt':999,'ap':999});self.assertEqual(sa['sonar'][0]['center'],{'x':1,'z':3});self.assertEqual(sa['sonar'][0]['expiresAt'],3);self.assertEqual(sb['sonar'],[]);self.assertEqual(next(v for v in sa['own'] if v['id']=='0-destroyer-1')['ap'],2);await self.error(a,{'type':'sonar','shipId':'0-destroyer-1'})
        await self.send(a,b,a,{'type':'end'});await self.send(a,b,b,{'type':'end'});sa,sb=await self.send(a,b,a,{'type':'torpedo','shipId':'0-destroyer-1','target':{'x':11,'z':3},'damage':999,'nextAdvanceAt':1,'speed':999});self.assertEqual((sa['torpedoes'][0]['x'],sa['torpedoes'][0]['z']),(1,3));self.assertEqual(sa['torpedoes'][0]['target'],{'x':11,'z':3});self.assertEqual(sa['queuedAttacks'],[]);self.assertEqual(sb['torpedoes'],[]);self.assertEqual(sa['shots'],[]);await self.error(a,{'type':'torpedo','shipId':'0-destroyer-1','target':{'x':10,'z':3}})
        sa,sb=await self.send(a,b,a,{'type':'end'});self.assertEqual((sa['torpedoes'][0]['x'],sa['torpedoes'][0]['z']),(6,3));self.assertEqual(sa['sonar'],[]);sa,sb=await self.send(a,b,b,{'type':'end'});self.assertEqual(sa['torpedoes'],[]);self.assertEqual(sa['shots'],[]);sa,sb=await self.send(a,b,a,{'type':'end'});self.assertEqual(sa['torpedoes'],[])
    async def test_disconnect_pause_reconnect_and_socket_takeover(self):
        host,guest,a,b=await self.pair();await self.ready(a,b);await b.close()
        self.assertEqual((await self.state(a))['connected'],[True,False])
        await self.error(a,{'type':'end'})
        b2=await self.connect(guest);self.assertEqual((await self.state(a))['connected'],[True,True])
        sa,sb=await self.send(a,b2,a,{'type':'move','shipId':'0-destroyer-1','target':{'x':2,'z':4}})
        self.assertEqual(next(s['ap'] for s in sa['own'] if s['id']=='0-destroyer-1'),3)
        b3=await self.connect(guest);await self.state(a)
        self.assertTrue(b2.closed or (await b2.receive(timeout=4)).type.name in ('CLOSE','CLOSED','CLOSING'))
        await self.send(a,b3,a,{'type':'end'})
    async def test_ready_and_mutual_rematch_keep_private_setup(self):
        host,guest,a,b=await self.pair();await self.ready(a,b)
        await self.error(a,{'type':'ready'})
        sa,sb=await self.firing(a,b,a,{'type':'attack','shipId':'0-destroyer-1','target':{'x':28,'z':26}})
        sa,sb=await self.send(a,b,a,{'type':'leave'})
        self.assertEqual(sa['phase'],'finished');self.assertEqual(sa['winner'],1);self.assertEqual(sa['revealed'],[])
        await a.close()
        await self.state(b) # host disconnection broadcast
        a2=await self.connect(host);await self.state(b)
        sa,sb=await self.send(a2,b,a2,{'type':'rematch'})
        self.assertEqual(sa['phase'],'finished')
        sa,sb=await self.send(a2,b,b,{'type':'rematch'})
        self.assertEqual(sa['phase'],'setup');self.assertEqual(sa['ready'],[False,False]);self.assertEqual(sa['recon'],[])
        self.assertNotIn('lastShot',sa);self.assertTrue(all(s['hp']==s['maxHp'] for s in sa['own']))
        await self.ready(a2,b)
        sa,sb=await self.firing(a2,b,a2,{'type':'attack','shipId':'0-destroyer-1','target':{'x':28,'z':26}})
        self.assertEqual(sa['lastShot']['sequence'],2)
    async def test_external_helper(self):
        await external_smoke(str(self.client.make_url('/')).rstrip('/'),'https://battle.example')

async def external_smoke(url,origin,insecure=False):
    import importlib.util
    spec=importlib.util.spec_from_file_location('queued_room_smoke',Path(__file__).resolve().parents[1]/'scripts/remote-room-smoke.py')
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);module.BASE=url;module.ORIGIN=origin
    await module.main()
if __name__=='__main__':
    if '--url' in sys.argv:
        import argparse
        parser=argparse.ArgumentParser();parser.add_argument('--url',required=True);parser.add_argument('--origin',required=True);parser.add_argument('--insecure',action='store_true')
        args=parser.parse_args();asyncio.run(external_smoke(args.url.rstrip('/'),args.origin,args.insecure))
    else: unittest.main()


class FinalSalvoRegression(unittest.TestCase):
    def test_final_hit_cancels_remaining_salvos_and_waits_for_ack(self):
        state=fixture_battle();state['islands']=[]
        for enemy in (s for s in state['ships'] if s['team']==1): enemy.update(hp=0,sunk=True)
        victim=ship(state,'1-battleship-1');victim.update(hp=200,sunk=False,x=6,z=2)
        for identifier,target in [('0-destroyer-1',victim),('0-destroyer-2',{'x':29,'z':29}),('0-destroyer-3',{'x':29,'z':29})]:
            self.assertTrue(reserve_action(state,0,{'type':'attack','shipId':identifier,'target':target})['ok'])
        self.assertTrue(reserve_action(state,0,{'type':'torpedo','shipId':'0-destroyer-3','target':{'x':14,'z':4}})['ok'])
        self.assertTrue(reserve_action(state,0,{'type':'end'})['ok'])
        hit=resolve_attack_step(state,lambda:.9);self.assertTrue(hit['shot']['sunk']);self.assertEqual(state['phase'],'battle')
        self.assertEqual(state['queuedAttacks'],[[],[]]);self.assertEqual(state['pendingTorpedoes'],[]);self.assertEqual(state['torpedoes'],[])
        self.assertEqual(state['attackProgress'],{'completed':1,'total':1})
        def forbidden_rng(): raise AssertionError('Extra salvo after final hit')
        self.assertTrue(resolve_attack_step(state,forbidden_rng)['complete']);self.assertEqual((state['phase'],state['winner'],state['sequence']),('finished',0,1))
