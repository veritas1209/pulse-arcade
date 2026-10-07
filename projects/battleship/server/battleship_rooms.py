"""Authoritative 30x30 fleet combat; recipient-specific fog snapshots."""
import asyncio
import copy
import hmac
import ipaddress
import json
import math
import random
import secrets
import time
from collections import deque
from dataclasses import dataclass, field
from aiohttp import web, WSMsgType

BOARD_SIZE = 30
# The deadline is a presentation fallback, never a client-supplied combat outcome.
ATTACK_PRESENTATION_TIMEOUT = 60.0
ATTACK_MIN_PRESENTATION_HOLD = .25
SHIPS = {
    'carrier': {'label': '항공모함', 'hp': 1000, 'ap': 4, 'count': 1, 'damage': 0, 'range': 0},
    'destroyer': {'label': '구축함', 'hp': 500, 'ap': 4, 'count': 3, 'damage': 200, 'range': math.inf},
    'battleship': {'label': '전함', 'hp': 800, 'ap': 4, 'count': 3, 'damage': 200, 'range': 12.5},
}
STARTING_FLEET = [('carrier','carrier',3,3),('destroyer','destroyer-1',2,1),('destroyer','destroyer-2',5,3),('battleship','battleship-1',2,5),('battleship','battleship-2',4,5),('destroyer','destroyer-3',4,1),('battleship','battleship-3',1,3)]
FLEET_SIZE = len(STARTING_FLEET)
PART_HP=200
WEAPON_REGIONS={"carrier":[],"battleship":[{"id":"battleship-weapon-iowa-assembly-7614","x0":-0.6750652935733453,"x1":-0.26575776637459037,"z0":0.08814988609115239,"z1":0.10518384176555766},{"id":"battleship-weapon-iowa-assembly-7632","x0":-0.6293745571201088,"x1":-0.31187350695916677,"z0":0.2532454577689803,"z1":0.3044094763984542},{"id":"battleship-weapon-iowa-assembly-7923","x0":-0.49579416710552904,"x1":-0.3456865681193506,"z0":0.14936758985988546,"z1":0.16364360229985633},{"id":"battleship-weapon-iowa-assembly-7946","x0":-0.633103280566363,"x1":-0.3351976432731269,"z0":0.20943876492295035,"z1":0.22182685780127356},{"id":"battleship-weapon-iowa-assembly-8227","x0":-0.4109565844593601,"x1":-0.26084898547318186,"z0":-0.0760182017427385,"z1":-0.061742189302767626},{"id":"battleship-weapon-iowa-assembly-8286","x0":-0.633103280566363,"x1":-0.3351976432731269,"z0":0.1865307185882254,"z1":0.19891881146654866},{"id":"battleship-weapon-iowa-assembly-8367","x0":-0.6750652895868211,"x1":-0.26575776626145114,"z0":0.11327489196355871,"z1":0.130308847609334},{"id":"battleship-weapon-iowa-assembly-8385","x0":-0.6293745571201088,"x1":-0.31187350695916677,"z0":0.29536674167398974,"z1":0.34653076030346364},{"id":"battleship-weapon-iowa-assembly-8666","x0":-0.3836167770025038,"x1":0.3836166172891472,"z0":-0.5867525125594515,"z1":-0.3745120524967016},{"id":"battleship-weapon-iowa-assembly-8790","x0":0.26575744966311776,"x1":0.6750649768618725,"z0":0.08814988609115239,"z1":0.10518384176555766},{"id":"battleship-weapon-iowa-assembly-8808","x0":0.31187319024769455,"x1":0.6293742404086368,"z0":0.2532454577689803,"z1":0.3044094763984542},{"id":"battleship-weapon-iowa-assembly-9099","x0":0.3456862514078784,"x1":0.4957938503940566,"z0":0.14936758985988546,"z1":0.16364360229985633},{"id":"battleship-weapon-iowa-assembly-9122","x0":0.3351973265616547,"x1":0.6331029638548908,"z0":0.20943876492295035,"z1":0.22182685780127356},{"id":"battleship-weapon-iowa-assembly-9403","x0":0.26084866876170965,"x1":0.41095626774788785,"z0":-0.0760182017427385,"z1":-0.061742189302767626},{"id":"battleship-weapon-iowa-assembly-9462","x0":0.3351973265616547,"x1":0.6331029638548908,"z0":0.1865307185882254,"z1":0.19891881146654866},{"id":"battleship-weapon-iowa-assembly-9543","x0":0.2657574495499785,"x1":0.6750649728753485,"z0":0.11327489196355871,"z1":0.130308847609334},{"id":"battleship-weapon-iowa-assembly-9561","x0":0.31187319024769455,"x1":0.6293742404086368,"z0":0.29536674167398974,"z1":0.34653076030346364},{"id":"battleship-weapon-iowa-assembly-10979","x0":-0.38361675391453726,"x1":0.38361664037711635,"z0":0.4215134418627582,"z1":0.633753901925508},{"id":"battleship-weapon-iowa-assembly-11100","x0":-0.3836167770025038,"x1":0.3836166172891472,"z0":-0.42639600614895157,"z1":-0.2141555460862016}],"destroyer":[{"id":"destroyer-weapon-1-8170","x0":-0.29298722423549883,"x1":0.29791536024070914,"z0":-0.6261852581246724,"z1":-0.47141857359183037},{"id":"destroyer-weapon-1-8172","x0":-0.29298722423549883,"x1":-0.007342389805443819,"z0":-0.5357942043247225,"z1":-0.47876442818192677},{"id":"destroyer-weapon-1-8377","x0":-0.27721214205358574,"x1":0.2843453661873067,"z0":0.4962082652722132,"z1":0.6063452786616084},{"id":"destroyer-weapon-1-8919","x0":-0.25191913502294855,"x1":-0.0071459861313874174,"z0":0.5013405100040665,"z1":0.6008011326153581},{"id":"destroyer-weapon-1-9076","x0":-0.24338675640790972,"x1":-0.015678345468484112,"z0":0.6000535381796398,"z1":0.6018532621351246},{"id":"destroyer-weapon-1-10558","x0":-0.14182270169390296,"x1":0.14675090517191058,"z0":-0.6932483191870783,"z1":-0.5777860598476889},{"id":"destroyer-weapon-1-13534","x0":0.020606481473694382,"x1":0.24831489241312002,"z0":0.6000535381796398,"z1":0.6018532621351246},{"id":"destroyer-weapon-2-0","x0":-0.9999900775758518,"x1":-0.6469912172171018,"z0":0.03007507221166836,"z1":0.06999538959570961},{"id":"destroyer-weapon-2-28","x0":0.646991448552407,"x1":0.9999900775758518,"z0":0.03007507221166836,"z1":0.06999538959570961}]}
SYSTEM_REGIONS={"carrier":[{"id":"carrier-radar-0-2083","x0":0.7047894593090833,"x1":0.7863582112617582,"z0":0.5247371785861141,"z1":0.5453599928774004,"system":"radar"},{"id":"carrier-bridge-0-1025","x0":0.5523075692750953,"x1":0.8818464369686115,"z0":0.47601256540099013,"z1":0.6125402049918407,"system":"bridge"},{"id":"carrier-radar-0-1910","x0":0.5133323153733199,"x1":0.9766625533546625,"z0":0.5034645763225039,"z1":0.6026488964473343,"system":"radar"}],"battleship":[{"id":"battleship-radar-iowa-sensor-6394","x0":-0.049993718291065886,"x1":0.04999350574596657,"z0":-0.18618210661293833,"z1":-0.17398910136040777,"system":"radar"},{"id":"battleship-radar-iowa-sensor-10739","x0":-0.30007516146099483,"x1":-0.22100787068377872,"z0":-0.05877212927470182,"z1":-0.04135701870699414,"system":"radar"},{"id":"battleship-radar-iowa-sensor-10616","x0":0.2210077386759715,"x1":0.30007502945318765,"z0":-0.05877216870602533,"z1":-0.04135705813831755,"system":"radar"},{"id":"battleship-radar-iowa-sensor-10672","x0":-0.09785240463731018,"x1":0.0978522836956337,"z0":-0.02602977449511106,"z1":-0.018734363030857314,"system":"radar"},{"id":"battleship-radar-iowa-sensor-10989","x0":-0.4635771866320447,"x1":-0.2638251771684606,"z0":0.43188923170376403,"z1":0.4521833096167569,"system":"radar"},{"id":"battleship-radar-iowa-sensor-10984","x0":0.26382501745510395,"x1":0.46357702691868813,"z0":0.43188923170376403,"z1":0.4521833096167569,"system":"radar"},{"id":"battleship-radar-iowa-sensor-11105","x0":-0.4635771866320447,"x1":-0.2638251771684606,"z0":-0.24482539386909327,"z1":-0.22453131595610032,"system":"radar"},{"id":"battleship-radar-iowa-sensor-11110","x0":0.26382501745510395,"x1":0.46357702691868813,"z0":-0.24482539386909327,"z1":-0.22453131595610032,"system":"radar"},{"id":"battleship-radar-iowa-sensor-11002","x0":-6.452557195535735e-8,"x1":0.21355596244153333,"z0":0.31714562773435423,"z1":0.3385757569077739,"system":"radar"},{"id":"battleship-radar-iowa-sensor-10965","x0":-0.2135560934468343,"x1":-6.599463112733809e-8,"z0":-0.06101584893989174,"z1":-0.039585719770156826,"system":"radar"},{"id":"battleship-radar-iowa-sensor-10959","x0":-7.895770556545521e-8,"x1":0.21355594849449933,"z0":-0.0610158489398911,"z1":-0.039585719770154945,"system":"radar"},{"id":"battleship-radar-iowa-sensor-10996","x0":-0.21355607992015233,"x1":-5.147410782331197e-8,"z0":0.31714562773435173,"z1":0.3385757569077713,"system":"radar"},{"id":"battleship-radar-iowa-sensor-11045","x0":-0.13389198406525005,"x1":0.13389195952799038,"z0":-0.13711764083677663,"z1":-0.11324576745662736,"system":"radar"},{"id":"battleship-radar-iowa-sensor-12954","x0":0.17272814928728852,"x1":0.36848647977347243,"z0":0.003847722952868262,"z1":0.036502805261848424,"system":"radar"},{"id":"battleship-radar-iowa-sensor-12990","x0":-0.3684866117812796,"x1":-0.1727282812950957,"z0":0.003847779295703501,"z1":0.03650286160468367,"system":"radar"},{"id":"battleship-radar-iowa-sensor-12917","x0":-0.3684866117818273,"x1":-0.17272828129557538,"z0":0.0038477792956600255,"z1":0.036502861604642285,"system":"radar"},{"id":"battleship-radar-iowa-sensor-12879","x0":-0.1338920915321032,"x1":0.13389185206174217,"z0":0.38412790025217886,"z1":0.40799977363242956,"system":"radar"},{"id":"battleship-radar-iowa-radar--16","x0":-0.31501715658364626,"x1":0.31501710884087425,"z0":-0.08956176076609113,"z1":-0.015664759973312372,"system":"radar"},{"id":"battleship-bridge-iowa-bridge","x0":-0.4575173233834977,"x1":0.4575171926383182,"z0":-0.2241622028712888,"z1":-0.008214380005975635,"system":"bridge"},{"id":"battleship-engine-iowa-engine","x0":-0.6499723940755092,"x1":0.6499720773640371,"z0":0.5022369403337277,"z1":0.8884350607892505,"system":"engine"}],"destroyer":[{"id":"destroyer-radar-5-9","x0":-0.07235456506492571,"x1":-0.056302728746307255,"z0":-0.2657699707419638,"z1":-0.2617496908689714,"system":"radar"},{"id":"destroyer-radar-5-3","x0":-0.10956107523811669,"x1":0.0025138022457584035,"z0":-0.2823301698643618,"z1":-0.275007237269839,"system":"radar"},{"id":"destroyer-bridge-1-39568","x0":0.6412144662009018,"x1":0.714674144115867,"z0":-0.3208199711501919,"z1":-0.3091832876787429,"system":"bridge"},{"id":"destroyer-bridge-1-36342","x0":0.2771151740048515,"x1":0.41353364199661313,"z0":-0.29253008578426143,"z1":-0.27024819437933634,"system":"bridge"},{"id":"destroyer-airDefense-0-5","x0":-0.08531700995374174,"x1":-0.0003470885035648657,"z0":0.3750029297107033,"z1":0.4180774526068465,"system":"airDefense"},{"id":"destroyer-airDefense-0-4","x0":-0.08576885599951825,"x1":0.003648052335673431,"z0":-0.4243003278726764,"z1":-0.38122578016917874,"system":"airDefense"},{"id":"destroyer-radar-5-8","x0":-0.07299230348683171,"x1":0.06406192211828572,"z0":0.25540739299849763,"z1":0.2841770774081375,"system":"radar"},{"id":"destroyer-radar-5-4","x0":-0.07601269916187875,"x1":0.08093948089165691,"z0":-0.2776976444818948,"z1":-0.2524513982489849,"system":"radar"},{"id":"destroyer-radar-5-7","x0":-0.07417357866660007,"x1":0.09013799915679208,"z0":0.3014507856611477,"z1":0.33033944614305016,"system":"radar"},{"id":"destroyer-radar-5-0","x0":-0.13142564485185404,"x1":0.09668994514151567,"z0":0.3075494256955575,"z1":0.3359019000169339,"system":"radar"},{"id":"destroyer-radar-5-2","x0":-0.11488599948648222,"x1":0.11981245831073029,"z0":-0.2867171024371125,"z1":-0.258541603782859,"system":"radar"},{"id":"destroyer-airDefense-0-0","x0":-0.10462706909953871,"x1":0.10955229413549274,"z0":0.36996051240955524,"z1":0.4043633268460972,"system":"airDefense"},{"id":"destroyer-radar-5-5","x0":-0.0759868378025593,"x1":0.14290522561529345,"z0":0.2537996531596184,"z1":0.2890709730777935,"system":"radar"},{"id":"destroyer-airDefense-0-2","x0":-0.09175595828087979,"x1":0.09668116403889172,"z0":0.371772764079071,"z1":0.4180774526068465,"system":"airDefense"},{"id":"destroyer-airDefense-0-1","x0":-0.10462546903034488,"x1":0.10955389420468656,"z0":-0.4243003278726764,"z1":-0.3761833876753852,"system":"airDefense"},{"id":"destroyer-engine-3-0","x0":-0.12580324267903184,"x1":0.12967226782352514,"z0":0.19010354548165045,"z1":0.23119759803729953,"system":"engine"},{"id":"destroyer-radar-1-43034","x0":-0.6529073091987592,"x1":-0.3557137343880015,"z0":-0.34405964970565606,"z1":-0.2962027898131189,"system":"radar"},{"id":"destroyer-radar-1-57395","x0":0.36064187039321177,"x1":0.6578354452039694,"z0":-0.34405964970565606,"z1":-0.2962027898131189,"system":"radar"},{"id":"destroyer-bridge-1-22708","x0":-0.7097460081106568,"x1":-0.33447391468268417,"z0":-0.35806813953510164,"z1":-0.3091832876787429,"system":"bridge"},{"id":"destroyer-bridge-1-25093","x0":-0.41419973345185435,"x1":-0.0680194522949338,"z0":-0.40585988012203217,"z1":-0.300563674663627,"system":"bridge"},{"id":"destroyer-bridge-1-22790","x0":-0.6998232657558952,"x1":0.7047514017611055,"z0":-0.4090123491193179,"z1":-0.2672893715914087,"system":"bridge"}]}

def create_parts(kind):
    ids=('bridge','engine','radar','flightDeck','airDefense') if kind=='carrier' else ('bridge','engine','weapon','radar','airDefense') if kind=='destroyer' else ('bridge','engine','weapon','radar')
    return {key:{'hp':PART_HP,'maxHp':PART_HP,'disabled':False} for key in ids}

def part_disabled(ship,key):
    part=ship.get('parts',{}).get(key)
    return bool(part and (part.get('disabled') is True or part.get('hp',PART_HP)<=0))

def part_at(kind,hit):
    x,z=hit['x'],hit['z']
    if any(r['x0']<=x<=r['x1'] and r['z0']<=z<=r['z1'] for r in WEAPON_REGIONS[kind]): return 'weapon'
    system=next((r['system'] for r in SYSTEM_REGIONS[kind] if r['x0']<=x<=r['x1'] and r['z0']<=z<=r['z1']),None)
    if system: return system
    if kind=='carrier' and abs(x)>=.66 and -.55<=z<=.8: return 'airDefense'
    if z>=.55: return 'engine'
    if kind=='carrier' and abs(x)<=.65 and z<.55: return 'flightDeck'
    return None
ISLAND_ROWS = [
    (5,8,[[2,3,4],[1,2,3,4,5],[0,1,2,3,4,5],[0,1,2,3,4,5,6],[1,2,3,4,5],[2,3,4]]),
    (18,10,[[2,3],[1,2,3,4],[0,1,2,3,4,5],[0,1,2,3,4,5],[1,2,3,4,5],[2,3,4]]),
    (11,19,[[2,3,4,5],[1,2,3,4,5,6],[0,1,2,3,4,5,6,7],[0,1,2,3,4,5,6,7],[1,2,3,4,5,6],[3,4,5]]),
]
ISLANDS = [[{'x':ox+x,'z':oz+z} for z,row in enumerate(rows) for x in row] for ox,oz,rows in ISLAND_ROWS]
DIRECTIONS = [(0,1),(1,0),(0,-1),(-1,0),(1,1),(1,-1),(-1,-1),(-1,1)]
ROOMS_KEY = web.AppKey('battleship_rooms', dict)
LIMITER_KEY = web.AppKey('battleship_limiter', dict)
TASK_KEY = web.AppKey('battleship_cleanup_task', asyncio.Task)
ORIGIN_KEY = web.AppKey('battleship_origin', object)
MAX_ROOMS = 200
ROOM_TTL = 3600

def rejection(error_type, message):
    return error_type(text=json.dumps({'error':message},ensure_ascii=False), content_type='application/json', headers={'Cache-Control':'no-store'})

def cell_key(cell):
    return cell['x'],cell['z']

def in_bounds(cell):
    return isinstance(cell,dict) and type(cell.get('x')) is int and type(cell.get('z')) is int and 0<=cell['x']<30 and 0<=cell['z']<30

def finite_number(value):
    return type(value) in (int,float) and abs(value)<=1.7976931348623157e308

def is_opening_turn(state):
    return state['turnNumber']<=2

def deployment_cells(team):
    if type(team) is not int or team not in (0,1): return []
    offset=23 if team else 0
    return [{'x':offset+x,'z':offset+z} for z in range(7) for x in range(7)]

def placement_valid(fleet,team):
    if type(team) is not int or team not in (0,1) or not isinstance(fleet,list) or len(fleet)!=FLEET_SIZE: return False
    ids={f'{team}-{suffix}' for _,suffix,_,_ in STARTING_FLEET}
    zone={cell_key(c) for c in deployment_cells(team)};occupied=set()
    for p in fleet:
        if not in_bounds(p) or not isinstance(p.get('id'),str) or p['id'] not in ids or cell_key(p) not in zone or cell_key(p) in occupied: return False
        heading=p.get('heading')
        if 'heading' in p and not finite_number(heading): return False
        ids.remove(p['id']);occupied.add(cell_key(p))
    return not ids

def apply_placement(state,team,fleet):
    if state['phase']!='setup' or type(team) is not int or team not in (0,1) or state['ready'][team]: return {'ok':False,'error':'배치를 변경할 수 없습니다'}
    if not placement_valid(fleet,team): return {'ok':False,'error':f'함선 {FLEET_SIZE}척을 시작 구역 안에 겹치지 않게 배치하세요'}
    for p in fleet:
        s=next(s for s in state['ships'] if s['id']==p['id'])
        s.update({'x':p['x'],'z':p['z']})
        if 'heading' in p: s['heading']=p['heading']%(2*math.pi)
    state['revision']+=1
    return {'ok':True}

def start_battle(state):
    if state['phase']!='setup' or not all(placement_valid([s for s in state['ships'] if s['team']==team],team) for team in (0,1)): return {'ok':False,'error':'함선 배치를 확인하세요'}
    state['ready']=[True,True];state['phase']='battle';state['revision']+=1
    return {'ok':True}

def create_battle(started=True):
    ships=[]
    for team in range(2):
        for kind,suffix,x,z in STARTING_FLEET:
            spec=SHIPS[kind]
            ships.append({'id':f'{team}-{suffix}','kind':kind,'team':team,'x':29-x if team else x,'z':29-z if team else z,'heading':math.pi if team else 0,'hp':spec['hp'],'maxHp':spec['hp'],'ap':spec['ap'],'maxAp':spec['ap'],'attacked':False,'moved':False,'sunk':False,'parts':create_parts(kind),'scouted':False,'repaired':False,'repairCharges':2,'damageControl':False,'sonared':False,'torpedoed':False})
    return {'combatPhase':'action','queuedAttacks':[[],[]],'reservationSequence':0,'attackProgress':{'completed':0,'total':0},'pendingTorpedoes':[],'phase':'battle' if started else 'setup','turn':0,'round':1,'turnNumber':1,'winner':None,'ships':ships,'islands':copy.deepcopy([c for island in ISLANDS for c in island]),'recon':[],'sonar':[],'torpedoes':[],'torpedoSequence':0,'shotEvents':[],'history':[],'ownTurns':[1,0],'ready':[started,started],'connected':[True,True],'revision':0,'sequence':0}

def recon_cells(center):
    return [{'x':center['x']+x,'z':center['z']+z} for z in range(-2,3) for x in range(-2,3) if not(abs(x)==2 and abs(z)==2) and in_bounds({'x':center['x']+x,'z':center['z']+z})]

def active_recon(state,you):
    return [r for r in state['recon'] if r['team']==you and r['expiresAt']>=state['turnNumber'] and any(s['id']==r['carrierId'] and not s['sunk'] and not part_disabled(s,'flightDeck') for s in state['ships'])]

def sonar_cells(center,islands):
    land={cell_key(c) for c in islands}
    return [{'x':center['x']+x,'z':center['z']+z} for z in range(-12,13) for x in range(-12,13) if x*x+z*z<=144 and in_bounds({'x':center['x']+x,'z':center['z']+z}) and (center['x']+x,center['z']+z) not in land]

def active_sonar(state,team):
    return [r for r in state['sonar'] if r['team']==team and r['expiresAt']>=state['turnNumber'] and any(s['id']==r['shipId'] and not s['sunk'] and not part_disabled(s,'bridge') for s in state['ships'])]

def torpedo_route(origin,target,islands=None):
    land={cell_key(c) for c in islands or []}
    if not in_bounds(origin) or not in_bounds(target) or cell_key(origin) in land or cell_key(target) in land or cell_key(origin)==cell_key(target): return []
    def valid_step(start,end):
        return in_bounds(end) and cell_key(end) not in land and (start['x']==end['x'] or start['z']==end['z'] or ((end['x'],start['z']) not in land and (start['x'],end['z']) not in land))
    direct=[];x,z=origin['x'],origin['z'];dx,dz=abs(target['x']-x),abs(target['z']-z);sx,sz=1 if x<target['x'] else -1,1 if z<target['z'] else -1;error=dx-dz
    while x!=target['x'] or z!=target['z']:
        start={'x':x,'z':z};twice=2*error
        if twice>-dz: error-=dz;x+=sx
        if twice<dx: error+=dx;z+=sz
        end={'x':x,'z':z}
        if not valid_step(start,end): direct=[];break
        direct.append(end)
    if direct: return direct
    queue=deque([dict(origin)]);previous={cell_key(origin):None}
    while queue:
        current=queue.popleft()
        neighbors=sorted([({'x':current['x']+dx,'z':current['z']+dz},order) for order,(dx,dz) in enumerate(DIRECTIONS)],key=lambda item:((item[0]['x']-target['x'])**2+(item[0]['z']-target['z'])**2,item[1]))
        for cell,_ in neighbors:
            key=cell_key(cell)
            if key in previous or not valid_step(current,cell): continue
            previous[key]=current
            if key==cell_key(target):
                route=[];step=cell
                while step and cell_key(step)!=cell_key(origin): route.append({'x':step['x'],'z':step['z']});step=previous[cell_key(step)]
                return list(reversed(route))
            queue.append(cell)
    return []

def visible_cells(state,you):
    visible={cell_key(c):c for r in active_sonar(state,you) for c in sonar_cells(r['center'],state['islands'])}
    visible.update({cell_key(c):c for r in active_recon(state,you) for c in recon_cells(r['center'])})
    for ship in state['ships']:
        if ship['team']==you and not ship['sunk']:
            for cell in recon_cells(ship):
                if not part_disabled(ship,'radar') or abs(cell['x']-ship['x'])<=1 and abs(cell['z']-ship['z'])<=1: visible[cell_key(cell)]=cell
    return visible

def snapshot(state,you):
    recon=active_recon(state,you)
    visible=visible_cells(state,you)
    own=copy.deepcopy([s for s in state['ships'] if s['team']==you])
    revealed=copy.deepcopy([s for s in state['ships'] if s['team']!=you and cell_key(s) in visible])
    view={'phase':'waiting' if state['phase']=='setup' and state['ready'][you] else state['phase'],'you':you,'turn':state['turn'],'round':state['round'],'turnNumber':state['turnNumber'],'winner':state['winner'],'own':own,'revealed':revealed,'islands':copy.deepcopy(state['islands']),'visibleCells':copy.deepcopy(list(visible.values())),'recon':copy.deepcopy(recon),'ready':list(state['ready']),'connected':list(state['connected']),'revision':state['revision']}
    view['sonar']=copy.deepcopy(active_sonar(state,you))
    view['torpedoes']=[{**{key:t[key] for key in ('id','team','x','z','heading')},'route':copy.deepcopy(t['route'][t['index']:]),**({'target':copy.deepcopy(t['target'])} if t['team']==you else {})} for t in state['torpedoes'] if t['team']==you or cell_key(t) in visible]
    def filter_shot(shot,flags):
        presenting_source=state['combatPhase']=='attack' and any(event['shot']['sequence']==shot['sequence'] for event in state['shotEvents'])
        result={key:shot[key] for key in ('x','z','by','sequence','hit','damage','blocked','halved','sunk') if key in shot}
        if shot.get('projectileId') and (shot['by']==you or cell_key(shot) in visible): result['projectileId']=shot['projectileId']
        if shot.get('approachFrom'): result['approachFrom']=copy.deepcopy(shot['approachFrom'])
        if 'localHit' in shot: result['localHit']=copy.deepcopy(shot['localHit'])
        if 'kind' in shot: result['kind']=shot['kind']
        before=shot.get('targetBefore')
        if before and (before['team']==you or shot['by']==you and shot['hit'] and not shot['blocked'] or flags['target'][you] and any(s['id']==before['id'] and cell_key(s) in visible for s in own+revealed)): result['targetBefore']=copy.deepcopy(before)
        if shot.get('interceptedBy') and flags['interceptor'][you] and cell_key(shot['interceptedBy']) in visible: result['interceptedBy']=copy.deepcopy(shot['interceptedBy'])
        if shot.get('source') and (presenting_source or shot['by']==you or flags['source'][you] and cell_key(shot['source']) in visible):
            result['source']=copy.deepcopy(shot['source'])
            if shot.get('sourceShip'): result['sourceShip']=copy.deepcopy(shot['sourceShip'])
        if result.get('targetBefore') and shot.get('targetAfter'): result['targetAfter']=copy.deepcopy(shot['targetAfter'])
        if shot.get('shipId') and any(s['id']==shot['shipId'] for s in own+revealed): result['shipId']=shot['shipId']
        return result
    if state.get('lastShot'): view['lastShot']=filter_shot(state['lastShot'],{'source':state.get('lastShotVisibility',[False,False]),'target':state.get('lastShotTargetVisibility',[False,False]),'interceptor':state.get('lastShotInterceptorVisibility',[False,False])})
    view['shots']=[filter_shot(e['shot'],e) for e in state['shotEvents']]
    view.update({'combatPhase':state['combatPhase'],'queuedAttacks':copy.deepcopy(state['queuedAttacks'][you]),'attackProgress':dict(state['attackProgress'])})
    if state['combatPhase']=='attack' and 'resolutionStep' in state: view['resolutionStep']=state['resolutionStep']
    return view

def paths(origin,budget,islands,ships,ignored_id,with_routes=False):
    blocked={cell_key(c) for c in islands}|{cell_key(s) for s in ships if not s['sunk'] and s['id']!=ignored_id}
    start=cell_key(origin)
    seen={start:0};routes={start:[]}
    queue=deque([(start,0)])
    while queue:
        (x,z),distance=queue.popleft()
        if distance>=budget: continue
        for dx,dz in DIRECTIONS:
            key=(x+dx,z+dz)
            if not(0<=key[0]<30 and 0<=key[1]<30) or key in seen or key in blocked: continue
            if dx and dz and ((x+dx,z) in blocked or (x,z+dz) in blocked): continue
            seen[key]=distance+1;routes[key]=routes[(x,z)]+[{'x':key[0],'z':key[1]}]
            queue.append((key,distance+1))
    seen.pop(start,None)
    routes.pop(start,None)
    return routes if with_routes else seen

def reachable_cells(view,ship_id):
    ship=next((s for s in view['own'] if s['id']==ship_id),None)
    if not ship or ship['sunk'] or ship['ap']<1 or part_disabled(ship,'engine') or view['phase']!='battle' or view.get('combatPhase')=='attack' or view['turn']!=view['you']: return []
    return [{'x':x,'z':z} for x,z in paths(ship,ship['ap'],view['islands'],view['own']+view['revealed'],ship_id)]

def can_recon_ship(ship): return not ship['sunk'] and ship['kind']=='carrier' and ship['ap']>=1 and not ship['moved'] and not ship.get('scouted',False) and not part_disabled(ship,'flightDeck')

def can_sonar_ship(ship): return not ship['sunk'] and ship['ap']>=2 and not ship.get('sonared',False) and not part_disabled(ship,'bridge')
def can_torpedo_ship(ship): return not ship['sunk'] and ship['kind']=='destroyer' and ship['ap']>=1 and not ship.get('torpedoed',False) and not part_disabled(ship,'weapon')

def repair_eligible(ship):
    return not ship['sunk'] and not ship.get('repaired',False) and ship.get('repairCharges',2)>0 and (ship['hp']<ship['maxHp'] or any(not p['disabled'] and 0<p['hp']<p['maxHp'] for p in ship.get('parts',{}).values()))

def can_repair_ship(ship): return ship['ap']>=1 and repair_eligible(ship)

def exhaust_inactionable(state,team):
    for ship in state['ships']:
        if ship['team']!=team or ship['sunk']: continue
        move=ship['ap']>0 and not part_disabled(ship,'engine') and bool(paths(ship,ship['ap'],state['islands'],state['ships'],ship['id']))
        fire=ship['kind']!='carrier' and not is_opening_turn(state) and ship['ap']>0 and not ship['attacked'] and not part_disabled(ship,'weapon')
        recon=can_recon_ship(ship)
        torpedo=not is_opening_turn(state) and can_torpedo_ship(ship)
        if not move and not fire and not recon and not can_sonar_ship(ship) and not torpedo: ship['ap']=min(ship['ap'],1) if repair_eligible(ship) else 0

def finish_mission_deadlock(state):
    if state['phase']!='battle' or state['combatPhase']=='attack' or any(state['queuedAttacks']) or state['torpedoes']: return
    for ship in state['ships']:
        if ship['sunk']: continue
        refreshed={**ship,'ap':ship['maxAp'],'attacked':False,'moved':False,'scouted':False,'repaired':False,'sonared':False,'torpedoed':False}
        move=not part_disabled(ship,'engine') and bool(paths(ship,ship['maxAp'],state['islands'],state['ships'],ship['id']))
        fire=ship['kind']!='carrier' and not part_disabled(ship,'weapon')
        if move or fire or can_recon_ship(refreshed) or can_repair_ship(refreshed) or can_sonar_ship(refreshed) or can_torpedo_ship(refreshed): return
    state['phase'],state['winner']='finished',None

def begin_own_turn(state):
    incoming=[s for s in state['ships'] if s['team']==state['turn']]
    for ship in incoming:
        ship['lastTurnDamage']=0
        if ship['sunk'] or ship.get('damageControl',False) or ship['hp']>=ship['maxHp']: continue
        damage=min(ship['hp'],50,max(5,math.ceil((ship['maxHp']-ship['hp'])*.05)))
        ship['hp']-=damage;ship['lastTurnDamage']=damage
        if ship['hp']==0:
            ship['sunk']=True;ship['ap']=0;state['recon']=[r for r in state['recon'] if r['carrierId']!=ship['id']]
    alive=[any(s['team']==team and not s['sunk'] for s in state['ships']) for team in (0,1)]
    if not all(alive):
        state['phase']='finished';state['winner']=0 if alive[0] else 1 if alive[1] else None;state['torpedoes']=[];return
    for ship in incoming:
        if not ship['sunk']: ship['ap']=ship['maxAp'];ship['attacked']=False;ship['moved']=False;ship['scouted']=False;ship['repaired']=False;ship['sonared']=False;ship['torpedoed']=False
    exhaust_inactionable(state,state['turn'])

def advance_turn(state):
    def advance():
        state['recon']=[r for r in state['recon'] if r['expiresAt']>state['turnNumber']];state['sonar']=[r for r in state['sonar'] if r['expiresAt']>state['turnNumber']]
        state['turn']=1-state['turn'];state['turnNumber']+=1;state['round']=(state['turnNumber']-1)//2+1;state['ownTurns'][state['turn']]+=1
        begin_own_turn(state)
    advance()
    if state['phase']!='battle': return
    finish_mission_deadlock(state)

def mix32(value):
    value=((value^(value>>16))*0x7feb352d)&0xffffffff
    value=((value^(value>>15))*0x846ca68b)&0xffffffff
    return (value^(value>>16))&0xffffffff

def fallback_hit(seed):
    return {'x':mix32(seed^0x9e3779b9)/4294967296*1.6-.8,'z':mix32(seed^0x85ebca6b)/4294967296*1.6-.8}

def torpedo_impact_mark(victim,approach):
    # Same fitted source hull ratios and model-frame convention as src/rules.ts.
    yaw=victim.get('heading',0)+math.pi;c,s=math.cos(yaw),math.sin(yaw)
    dx,dz=approach['x']-victim['x'],approach['z']-victim['z']
    ratio={'carrier':.252827,'destroyer':.16085,'battleship':.121946}[victim['kind']]
    x,z=(c*dx-s*dz)/ratio,s*dx+c*dz;extent=max(abs(x),abs(z))
    return {'x':.88,'z':0} if extent<1e-9 else {'x':x*.88/extent,'z':z*.88/extent}

def resolve_shot(state,player,ship,target,victim,rng,aim=None,kind=None,options=None):
    options=options or {}
    target_before=copy.deepcopy(victim) if victim else None
    target_visibility=[bool(victim and cell_key(victim) in visible_cells(state,you)) for you in (0,1)]
    source_visibility=options.get('sourceVisibility') or [you==player or cell_key(ship) in visible_cells(state,you) for you in (0,1)]
    blocked,halved,damage,interceptor=False,False,options.get('damage',200) if victim else 0,None
    if not options.get('bypassDefense') and victim and (ship['kind']=='destroyer' or kind=='airstrike'):
        guards=sorted([s for s in state['ships'] if s['team']==victim['team'] and not s['sunk'] and s['kind']=='destroyer' and not part_disabled(s,'radar') and not part_disabled(s,'airDefense') and any(cell_key(c)==cell_key(target) for c in recon_cells(s))],key=lambda s:s['id'])
        if guards and rng()<.5: blocked,damage,interceptor=True,0,guards[0]
    interceptor_visibility=[bool(interceptor and (interceptor['team']==you or cell_key(interceptor) in visible_cells(state,you))) for you in (0,1)]
    if not options.get('bypassDefense') and not blocked and victim and victim['kind']=='carrier' and not part_disabled(victim,'airDefense'):
        blocked=rng()<.33
        if blocked: damage=0
        elif rng()<.33: halved,damage=True,100
    seed=((state['sequence']+1)*1664525+1013904223)&0xffffffff
    local_hit=({'x':aim['x'],'z':aim['z']} if aim else torpedo_impact_mark(victim,options.get('approachFrom',ship)) if kind=='torpedo' else fallback_hit(seed)) if victim and damage>0 else None
    if victim:
        victim['hp']=max(0,victim['hp']-damage);victim['sunk']=victim['hp']==0
        if local_hit:
            victim['damageControl']=False;victim.setdefault('damageMarks',[]).append({**local_hit,'seed':seed})
            key=part_at(victim['kind'],local_hit);parts=victim.setdefault('parts',create_parts(victim['kind']))
            if key in parts:
                part=parts[key];part['hp']=max(0,part['hp']-damage);part['disabled']=part['hp']==0
        if victim['sunk']:
            victim['ap']=0;state['recon']=[r for r in state['recon'] if r['carrierId']!=victim['id']]
        else:
            if part_disabled(victim,'bridge'): state['sonar']=[r for r in state['sonar'] if r['shipId']!=victim['id']]
            if part_disabled(victim,'flightDeck'): state['recon']=[r for r in state['recon'] if r['carrierId']!=victim['id']]
            if part_disabled(victim,'engine') and part_disabled(victim,'flightDeck' if victim['kind']=='carrier' else 'weapon') and not can_sonar_ship(victim): victim['ap']=1 if repair_eligible(victim) else 0
    shot={'x':target['x'],'z':target['z'],'by':player,'sequence':state['sequence']+1,'hit':victim is not None,'damage':damage,'blocked':blocked,'halved':halved,'source':{'x':ship['x'],'z':ship['z']},'sourceShip':copy.deepcopy(ship)}
    if kind: shot['kind']=kind
    if options.get('projectileId'): shot['projectileId']=options['projectileId']
    if options.get('approachFrom'): shot['approachFrom']=copy.deepcopy(options['approachFrom'])
    if target_before: shot.update({'targetBefore':target_before,'targetAfter':copy.deepcopy(victim)})
    if interceptor: shot['interceptedBy']={'x':interceptor['x'],'z':interceptor['z']}
    if victim: shot.update({'shipId':victim['id'],'sunk':victim['sunk']})
    if local_hit: shot['localHit']=local_hit
    state['sequence']+=1;state['lastShot']=shot;state['lastShotVisibility']=source_visibility;state['lastShotInterceptorVisibility']=interceptor_visibility;state['lastShotTargetVisibility']=target_visibility;state['shotEvents'].append({'shot':copy.deepcopy(shot),'source':source_visibility,'target':target_visibility,'interceptor':interceptor_visibility})
    state['history'].append(copy.deepcopy(shot))
    if len(state['history'])>256: state['history'].pop(0)
    if state['combatPhase']!='attack' and all(s['sunk'] for s in state['ships'] if s['team']!=player): state['phase'],state['winner']='finished',player if any(s['team']==player and not s['sunk'] for s in state['ships']) else None

def advance_torpedoes(state,only_id):
    remaining=[]
    for torpedo in state['torpedoes']:
        if torpedo['id']!=only_id: remaining.append(torpedo);continue
        active=True
        for _ in range(5):
            if torpedo['index']>=len(torpedo['route']): break
            approach_from={'x':torpedo['x'],'z':torpedo['z']};step=torpedo['route'][torpedo['index']];torpedo['index']+=1;torpedo['heading']=math.atan2(step['x']-torpedo['x'],step['z']-torpedo['z']);diagonal=step['x']!=torpedo['x'] and step['z']!=torpedo['z']
            swept=[{'x':step['x'],'z':torpedo['z']},{'x':torpedo['x'],'z':step['z']},step] if diagonal else [step]
            if any(cell_key(c)==cell_key(land) for c in swept for land in state['islands']): active=False;break
            victim=next((s for s in state['ships'] if s['team']!=torpedo['team'] and not s['sunk'] and cell_key(s)==cell_key(step)),None)
            torpedo['x'],torpedo['z']=step['x'],step['z']
            if victim:
                launcher=next(s for s in state['ships'] if s['id']==torpedo['shipId']);resolve_shot(state,torpedo['team'],{**launcher,**torpedo['source']},victim,victim,lambda:1,kind='torpedo',options={'damage':300,'bypassDefense':True,'projectileId':torpedo['id'],'sourceVisibility':torpedo['sourceVisibility'],'approachFrom':approach_from});active=False;break
        if active and torpedo['index']<len(torpedo['route']): torpedo['nextAdvanceAt']=state['turnNumber']+1;remaining.append(torpedo)
    state['torpedoes']=remaining

def reserve_attack(state,ship,kind,target,aim=None):
    state['reservationSequence']+=1
    attack={'id':'attack-'+str(state['reservationSequence']),'shipId':ship['id'],'kind':kind,'target':{'x':target['x'],'z':target['z']}}
    if aim: attack['localHit']=copy.deepcopy(aim)
    state['queuedAttacks'][ship['team']].append(attack)

def launch_torpedo(state,ship,target,route):
    state['torpedoSequence']+=1;identifier='torpedo-'+format(((state['torpedoSequence']*2246822519)^3266489917)&0xffffffff,'x')
    state['torpedoes'].append({'id':identifier,'team':ship['team'],'x':ship['x'],'z':ship['z'],'heading':math.atan2(route[0]['x']-ship['x'],route[0]['z']-ship['z']),'target':{'x':target['x'],'z':target['z']},'source':{'x':ship['x'],'z':ship['z']},'shipId':ship['id'],'route':route,'index':0,'nextAdvanceAt':state['turnNumber'],'sourceVisibility':[you==ship['team'] or cell_key(ship) in visible_cells(state,you) for you in (0,1)]})
    return identifier

ATTACK_FLEET_ORDER=['carrier','destroyer-1','destroyer-2','destroyer-3','battleship-1','battleship-2','battleship-3']

def attack_rank(ship_id):
    suffix=ship_id[2:]
    return ATTACK_FLEET_ORDER.index(suffix) if suffix in ATTACK_FLEET_ORDER else 99

def begin_attack_phase(state):
    state['combatPhase']='attack';state.pop('resolutionStep',None);state['shotEvents']=[]
    state['queuedAttacks'][state['turn']].sort(key=lambda attack:attack_rank(attack['shipId']))
    state['pendingTorpedoes']=[t['id'] for t in sorted(state['torpedoes'],key=lambda t:attack_rank(t['shipId'])) if t['nextAdvanceAt']<=state['turnNumber']]
    state['attackProgress']={'completed':0,'total':len(state['pendingTorpedoes'])+len(state['queuedAttacks'][state['turn']])}

def resolve_attack_step(state,rng=random.random):
    if state['phase']!='battle' or state['combatPhase']!='attack': return {'ok':False,'error':'공격 처리 차례가 아닙니다'}
    if not all(state['connected']): return {'ok':False,'error':'상대의 재접속을 기다리는 중입니다'}
    state['shotEvents']=[]
    queue=state['queuedAttacks'][state['turn']]
    next_torpedo=next((t for t in state['torpedoes'] if state['pendingTorpedoes'] and t['id']==state['pendingTorpedoes'][0]),None)
    torpedo_id=state['pendingTorpedoes'].pop(0) if next_torpedo and (not queue or attack_rank(next_torpedo['shipId'])<=attack_rank(queue[0]['shipId'])) else None
    queued=queue.pop(0) if not torpedo_id and queue else None
    if not torpedo_id and not queued:
        state['combatPhase']='action';state.pop('resolutionStep',None)
        alive=[any(s['team']==team and not s['sunk'] for s in state['ships']) for team in (0,1)]
        if not all(alive): state['phase']='finished';state['winner']=0 if alive[0] else 1 if alive[1] else None;state['torpedoes']=[]
        else: advance_turn(state)
        state['revision']+=1
        return {'ok':True,'complete':True}
    if torpedo_id: advance_torpedoes(state,torpedo_id)
    elif queued:
        ship=next(s for s in state['ships'] if s['id']==queued['shipId'])
        if queued['kind']=='torpedo':
            route=torpedo_route(ship,queued['target'],state['islands'])
            if route:
                identifier=launch_torpedo(state,ship,queued['target'],route)
                advance_torpedoes(state,identifier)
        else:
            mask={cell_key(c) for c in recon_cells(queued['target'])} if queued['kind']=='airstrike' else None
            victims=sorted([s for s in state['ships'] if s['team']!=state['turn'] and not s['sunk'] and (cell_key(s) in mask if mask is not None else cell_key(s)==cell_key(queued['target']))],key=lambda s:(math.hypot(s['x']-queued['target']['x'],s['z']-queued['target']['z']),s['id']))
            victim=victims[0] if victims else None
            resolve_shot(state,state['turn'],ship,victim if victim and mask is not None else queued['target'],victim,rng,queued.get('localHit'),queued['kind'])
    state['attackProgress']['completed']+=1;state['resolutionCounter']=state.get('resolutionCounter',0)+1;state['resolutionStep']=state['resolutionCounter'];state['revision']+=1
    # Present the final hit, then finish when both clients acknowledge it.
    if any(not any(s['team']==team and not s['sunk'] for s in state['ships']) for team in (0,1)):
        state['queuedAttacks']=[[],[]];state['pendingTorpedoes']=[];state['torpedoes']=[]
        state['attackProgress']['total']=state['attackProgress']['completed']

    result={'ok':True,'complete':False}
    if state['shotEvents']: result['shot']=copy.deepcopy(state['shotEvents'][0]['shot'])
    return result

def apply_action(state,player,command,rng=random.random):
    def fail(error): return {'ok':False,'error':error}
    if type(player) is not int or player not in (0,1) or not isinstance(command,dict): return fail('잘못된 요청입니다')
    if state['phase']!='battle' or state['combatPhase']=='attack' or state['turn']!=player: return fail('행동 차례가 아닙니다')
    if not all(state['connected']): return fail('상대의 재접속을 기다리는 중입니다')
    kind=command.get('type')
    if kind in ('attack','torpedo') and is_opening_turn(state): return fail('첫 턴에는 공격할 수 없습니다')
    previous_sequence=state['sequence']
    if kind=='end': begin_attack_phase(state);state['revision']+=1;return {'ok':True}
    if kind not in ('move','attack','recon','repair','sonar','torpedo'): return fail('알 수 없는 행동입니다')
    ship=next((s for s in state['ships'] if s['id']==command.get('shipId') and s['team']==player and not s['sunk']),None)
    if not ship: return fail('함선을 확인하세요')
    if kind=='sonar':
        if not can_sonar_ship(ship): return fail('함교가 정상이고 행동력 2가 필요합니다')
        ship['ap']-=2;ship['sonared']=True;state['sonar']=[r for r in state['sonar'] if r['shipId']!=ship['id']];state['sonar'].append({'shipId':ship['id'],'team':player,'center':{'x':ship['x'],'z':ship['z']},'expiresAt':state['turnNumber']+2})
    elif kind=='repair':
        if not can_repair_ship(ship): return fail('대미지 컨트롤를 사용할 수 없습니다')
        ship['ap']-=1;ship['repaired']=True;ship['repairCharges']=ship.get('repairCharges',2)-1;ship['damageControl']=True;ship['extinguishedMarkCount']=len(ship.get('damageMarks',[]));ship['hp']=min(ship['maxHp'],ship['hp']+50)
        for part in ship.get('parts',{}).values():
            if not part['disabled'] and 0<part['hp']<part['maxHp']: part['hp']=min(part['maxHp'],part['hp']+50)
    else:
        target=command.get('target')
        if not in_bounds(target): return fail('좌표를 확인하세요')
        if kind=='torpedo':
            if not can_torpedo_ship(ship): return fail('구축함의 주무장과 행동력 1이 필요합니다')
            if math.hypot(target['x']-ship['x'],target['z']-ship['z'])>15 or cell_key(target)==cell_key(ship): return fail('어뢰 사거리 밖입니다')
            route=torpedo_route(ship,target,state['islands'])
            if not route: return fail('어뢰가 도달할 수 없는 좌표입니다')
            ship['ap']-=1;ship['torpedoed']=True;launch_torpedo(state,ship,target,route)
        elif kind=='move':
            if part_disabled(ship,'engine'): return fail('추진 계통이 파괴되었습니다')
            if ship['ap']<1: return fail('행동력이 부족합니다')
            before=snapshot(state,player);route=paths(ship,ship['ap'],state['islands'],before['own']+before['revealed'],ship['id'],True).get(cell_key(target))
            if not route: return fail('이동할 수 없는 좌표입니다')
            original={'x':ship['x'],'z':ship['z']};seen={s['id'] for s in before['revealed']}
            for step in route:
                if any(not s['sunk'] and s['id']!=ship['id'] and cell_key(s)==cell_key(step) for s in state['ships']): break
                ship['x'],ship['z']=step['x'],step['z']
                if any(s['id'] not in seen and not s['sunk'] for s in snapshot(state,player)['revealed']): break
            if cell_key(ship)!=cell_key(original): ship['heading']=math.atan2(ship['x']-original['x'],ship['z']-original['z'])
            ship['ap']-=len(route);ship['moved']=True
        elif kind=='recon':
            if not can_recon_ship(ship): return fail('이동 전 턴당 한 번 출격할 수 있습니다')
            ship['ap']-=1;ship['scouted']=True;state['recon']=[r for r in state['recon'] if r['carrierId']!=ship['id']]
            state['recon'].append({'center':{'x':target['x'],'z':target['z']},'team':player,'carrierId':ship['id'],'expiresAt':state['turnNumber']+2})
            if not is_opening_turn(state): reserve_attack(state,ship,'airstrike',target)
        else:
            if part_disabled(ship,'weapon'): return fail('주무장이 파괴되었습니다')
            aim=command.get('localHit')
            if 'localHit' in command and (not isinstance(aim,dict) or any(not finite_number(aim.get(k)) or abs(aim[k])>1 for k in ('x','z'))): return fail('피격 위치를 확인하세요')
            if ship['kind']=='carrier' or ship['ap']<1 or ship['attacked']: return fail('이번 턴에는 공격할 수 없습니다')
            if any(cell_key(c)==cell_key(target) for c in state['islands']): return fail('섬에는 공격할 수 없습니다')
            if math.hypot(target['x']-ship['x'],target['z']-ship['z'])>SHIPS[ship['kind']]['range']: return fail('사거리 밖입니다')
            if any(s['team']==player and not s['sunk'] and cell_key(s)==cell_key(target) for s in state['ships']): return fail('아군에게 공격할 수 없습니다')
            ship['ap']-=1;ship['attacked']=True;reserve_attack(state,ship,'missile' if ship['kind']=='destroyer' else 'shell',target,aim)
    if state['phase']=='battle':
        exhaust_inactionable(state,player);finish_mission_deadlock(state)
    state['shotEvents']=[e for e in state['shotEvents'] if e['shot']['sequence']>previous_sequence]
    state['revision']+=1
    return {'ok':True}

def room_battle():
    state=create_battle()
    state.update({'phase':'setup','ready':[False,False],'connected':[False,False]})
    return state

@dataclass
class Room:
    code:str
    tokens:list=field(default_factory=lambda:[secrets.token_urlsafe(32),None])
    sockets:list=field(default_factory=lambda:[None,None])
    battle:dict=field(default_factory=room_battle)
    rematch:set=field(default_factory=set)
    touched:float=field(default_factory=time.monotonic)
    lock:asyncio.Lock=field(default_factory=asyncio.Lock)
    resolution_task:asyncio.Task|None=None
    presentation_acks:set=field(default_factory=set)

    @property
    def phase(self): return self.battle['phase']

    def connected(self):
        return [s is not None and not s.closed for s in self.sockets]

    def snapshot(self,player):
        self.battle['connected']=self.connected()
        return {'type':'state','state':snapshot(self.battle,player)}

    async def broadcast(self):
        self.battle['revision']+=1
        self.touched=time.monotonic()
        for player,socket in enumerate(self.sockets):
            if socket is not None and not socket.closed:
                try: await socket.send_json(self.snapshot(player))
                except (ConnectionError,RuntimeError): pass
        if self.phase=='battle' and self.battle['combatPhase']=='attack' and self.resolution_task is None:
            self.resolution_task=asyncio.create_task(self.resolve_attacks())

    async def resolve_attacks(self):
        """Only the server resolves damage; client acknowledgments control presentation cadence."""
        try:
            while self.phase=='battle' and self.battle['combatPhase']=='attack':
                # A disconnect suspends resolution without spending fallback time.
                if not all(self.connected()):
                    await asyncio.sleep(.1)
                    continue
                async with self.lock:
                    self.battle['connected']=self.connected()
                    if not all(self.battle['connected']): continue
                    result=resolve_attack_step(self.battle)
                    self.presentation_acks.clear()
                    await self.broadcast()
                if not result['ok'] or result.get('complete'): break
                connected_elapsed=0.0;previous=time.monotonic()
                while self.phase=='battle' and self.battle['combatPhase']=='attack':
                    await asyncio.sleep(.1)
                    now=time.monotonic()
                    if all(self.connected()):
                        connected_elapsed+=now-previous
                        # Every step, including torpedo launch/motion, has a unique token.
                        if connected_elapsed>=ATTACK_MIN_PRESENTATION_HOLD and (self.presentation_acks=={0,1} or connected_elapsed>=ATTACK_PRESENTATION_TIMEOUT): break
                    else:
                        connected_elapsed=0.0
                        self.presentation_acks.clear()
                    previous=now
        finally:
            self.resolution_task=None

    def command(self,player,message):
        kind=message.get('type')
        if kind=='attack-complete':
            step=message.get('step')
            if self.phase!='battle' or self.battle['combatPhase']!='attack' or type(step) is not int or step!=self.battle.get('resolutionStep'):
                raise ValueError('공격 처리 번호를 확인하세요')
            self.presentation_acks.add(player)
        elif kind=='ready':
            if self.phase!='setup' or self.battle['ready'][player]: raise ValueError('준비 상태를 변경할 수 없습니다')
            if 'fleet' in message:
                result=apply_placement(self.battle,player,message['fleet'])
                if not result['ok']: raise ValueError(result['error'])
            self.battle['ready'][player]=True
            if all(self.battle['ready']):
                result=start_battle(self.battle)
                if not result['ok']: self.battle['ready'][player]=False;raise ValueError(result['error'])
        elif kind=='placement':
            result=apply_placement(self.battle,player,message.get('fleet'))
            if not result['ok']: raise ValueError(result['error'])
        elif kind in ('move','attack','recon','repair','sonar','torpedo','end','action'):
            command=message.get('action',message.get('command')) if kind=='action' else message
            self.battle['connected']=self.connected()
            result=apply_action(self.battle,player,command,random.random)
            if not result['ok']: raise ValueError(result['error'])
        elif kind=='rematch':
            if self.phase!='finished': raise ValueError('게임 종료 후 다시 시작할 수 있습니다')
            if not all(self.connected()): raise ValueError('상대의 재접속을 기다리는 중입니다')
            self.rematch.add(player)
            if len(self.rematch)==2:
                previous=self.battle
                self.battle=room_battle()
                self.battle['sequence']=previous['sequence']
                self.battle['revision']=previous['revision']
                self.battle['resolutionCounter']=previous.get('resolutionCounter',0)
                self.rematch.clear()
        elif kind=='leave':
            self.battle['phase']='finished'
            self.battle['winner']=1-player if self.tokens[1-player] else None
        else: raise ValueError('알 수 없는 요청입니다')

def allow_request(request):
    configured_origin=request.app[ORIGIN_KEY]
    if request.headers.get('Origin') and configured_origin and request.headers['Origin']!=configured_origin:
        raise rejection(web.HTTPForbidden,'다른 사이트에서 연결할 수 없습니다')
    limiter = request.app[LIMITER_KEY]
    now = time.monotonic()
    ip = request.remote or 'unknown'
    # Pulse binds to loopback behind nginx. Only trust the last proxy-added hop
    # from a local reverse proxy; a remote client's own forwarded prefix is ignored.
    if ip in ('127.0.0.1', '::1') and request.headers.get('X-Forwarded-For'):
        candidate = request.headers['X-Forwarded-For'].split(',')[-1].strip()
        try: ip = str(ipaddress.ip_address(candidate))
        except ValueError: pass
    for key in list(limiter):
        if not limiter[key] or now - limiter[key][-1] > 60: del limiter[key]
    if ip not in limiter and len(limiter) >= 1000: raise rejection(web.HTTPTooManyRequests, '요청이 많습니다')
    times = limiter.setdefault(ip, deque())
    while times and now - times[0] > 60: times.popleft()
    if len(times) >= 40: raise rejection(web.HTTPTooManyRequests, '잠시 후 다시 시도하세요')
    times.append(now)

async def create_room(request):
    allow_request(request)
    rooms = request.app[ROOMS_KEY]
    if len(rooms) >= MAX_ROOMS: raise rejection(web.HTTPServiceUnavailable, '방이 가득 찼습니다')
    alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    code = ''.join(secrets.choice(alphabet) for _ in range(6))
    while code in rooms: code = ''.join(secrets.choice(alphabet) for _ in range(6))
    room = rooms[code] = Room(code)
    return web.json_response({'code': code, 'token': room.tokens[0], 'player': 0}, headers={'Cache-Control': 'no-store'})

async def join_room(request):
    allow_request(request)
    room = request.app[ROOMS_KEY].get(request.match_info['code'].upper())
    if room is None: raise rejection(web.HTTPNotFound, '방을 찾을 수 없습니다')
    async with room.lock:
        if room.tokens[1] or room.phase == 'finished': raise rejection(web.HTTPConflict, '입장할 수 없는 방입니다')
        room.tokens[1] = secrets.token_urlsafe(32)
        await room.broadcast()
    return web.json_response({'code': room.code, 'token': room.tokens[1], 'player': 1}, headers={'Cache-Control': 'no-store'})

async def websocket(request):
    room = request.app[ROOMS_KEY].get(request.match_info['code'].upper())
    token = request.query.get('token', '')
    if room is None or len(token) > 100 or not token.isascii(): raise rejection(web.HTTPForbidden, '입장 정보가 올바르지 않습니다')
    player = next((i for i, t in enumerate(room.tokens) if t and hmac.compare_digest(t, token)), None)
    if player is None: raise rejection(web.HTTPForbidden, '입장 정보가 올바르지 않습니다')
    origin = request.headers.get('Origin')
    # Browser sockets must be same-origin; nonbrowser clients need the private token.
    configured_origin = request.app[ORIGIN_KEY]
    if configured_origin and origin and origin != configured_origin:
        raise rejection(web.HTTPForbidden, '다른 사이트에서 연결할 수 없습니다')
    if origin and not configured_origin:
        from urllib.parse import urlsplit
        try: origin_host = urlsplit(origin).netloc
        except ValueError: raise rejection(web.HTTPForbidden, '다른 사이트에서 연결할 수 없습니다')
        if origin_host != request.host: raise rejection(web.HTTPForbidden, '다른 사이트에서 연결할 수 없습니다')
    # Small authoritative snapshots do not need permessage-deflate. Avoid protocol
    # errors after control frames on proxied Chrome connections. Static game assets
    # retain their normal HTTP compression.
    ws = web.WebSocketResponse(max_msg_size=4096, heartbeat=20, compress=False)
    await ws.prepare(request)
    async with room.lock:
        previous = room.sockets[player]
        room.sockets[player] = ws
        room.presentation_acks.clear()
        if previous is not None and not previous.closed: await previous.close(code=4001, message=b'Reconnected')
        await room.broadcast()
    messages = deque()
    try:
        async for event in ws:
            if event.type != WSMsgType.TEXT: continue
            now = time.monotonic()
            while messages and now - messages[0] > 1: messages.popleft()
            if len(messages) >= 12:
                await ws.send_json({'type': 'error', 'message': '요청이 너무 빠릅니다'})
                continue
            messages.append(now)
            try:
                message = json.loads(event.data)
                if not isinstance(message, dict): raise ValueError('잘못된 요청입니다')
                async with room.lock:
                    if room.sockets[player] is not ws: break
                    room.command(player, message)
                    await room.broadcast()
                    if message['type'] == 'leave': await ws.close()
            except (json.JSONDecodeError, TypeError, KeyError):
                await ws.send_json({'type': 'error', 'message': '요청을 처리할 수 없습니다'})
            except ValueError as error:
                await ws.send_json({'type': 'error', 'message': str(error)})
    finally:
        async with room.lock:
            if room.sockets[player] is ws:
                room.sockets[player] = None
                room.presentation_acks.clear()
                await room.broadcast()
    return ws

async def cleanup_rooms(app):
    while True:
        await asyncio.sleep(60)
        now = time.monotonic()
        for code, room in list(app[ROOMS_KEY].items()):
            ttl = 300 if room.tokens[1] is None else 600 if room.phase in ('setup', 'finished') else ROOM_TTL
            if now - room.touched > ttl:
                app[ROOMS_KEY].pop(code, None)
                if room.resolution_task: room.resolution_task.cancel()
                for socket in room.sockets:
                    if socket is not None and not socket.closed: await socket.close(code=4000, message=b'Room expired')

async def startup(app):
    app[TASK_KEY] = asyncio.create_task(cleanup_rooms(app))

async def shutdown(app):
    app[TASK_KEY].cancel()
    try: await app[TASK_KEY]
    except asyncio.CancelledError: pass
    for room in app[ROOMS_KEY].values():
        if room.resolution_task: room.resolution_task.cancel()
        for socket in room.sockets:
            if socket is not None and not socket.closed: await socket.close(code=1001, message=b'Server shutdown')

def setup_battleship(app, origin=None):
    app[ROOMS_KEY], app[LIMITER_KEY] = {}, {}
    app[ORIGIN_KEY] = origin
    app.router.add_post('/api/battleship/rooms', create_room)
    app.router.add_post('/api/battleship/rooms/{code}/join', join_room)
    app.router.add_get('/ws/battleship/{code}', websocket)
    app.on_startup.append(startup)
    app.on_shutdown.append(shutdown)
