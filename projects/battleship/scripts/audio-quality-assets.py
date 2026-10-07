"""Rebuild the recorded naval mix from decoded public Freesound previews.
Run node scripts/decode-audio-quality.mjs first, then python this file.
CPU filters/mixes only; every sample originates in the licensed recordings.
"""
from pathlib import Path
import json,hashlib,wave
import numpy as np
from scipy.signal import butter,sosfilt,resample_poly
ROOT=Path(__file__).resolve().parents[1]
INPUT=Path('C:/tmp/battleship-audio-sources')
OUTPUT=ROOT/'public/audio'
RATE=32000
cache={}
def recorded(name,start,duration,rate=1,cutoff=10000,highpass=32):
 if name not in cache:
  d=json.loads((INPUT/(name+'.json')).read_text()); cache[name]=np.array(d['channels'],dtype=np.float64).mean(axis=0)
 x=cache[name][round(start*RATE):round((start+duration*rate)*RATE)]
 if rate!=1:
  x=np.interp(np.arange(round(duration*RATE))*rate,np.arange(len(x)),x,left=0,right=0)
 x=np.pad(x,(0,max(0,round(duration*RATE)-len(x))))[:round(duration*RATE)]
 if highpass:x=sosfilt(butter(2,highpass,fs=RATE,btype='highpass',output='sos'),x)
 if cutoff:x=sosfilt(butter(2,cutoff,fs=RATE,output='sos'),x)
 return x
# file, duration, loop, target RMS, layers: source / offset / playback rate / mix weight / low-pass / high-pass / delay
recipes=[
 ('sonar-ping.wav',2.2,False,.07,[('sonar',0,1,1,4600,480,0)]),
 ('sea-loop.wav',8,True,.12,[('ocean',18,1,1,7500,45,0)]),
 ('missile-launch.wav',2.3,False,.2,[('rocket',0,1,1,8500,55,0),('cannon',0,1.35,.18,2100,35,0)]),
 ('missile-flight-loop.wav',4,True,.14,[('rocket',2.1,1,.85,7100,95,0),('jet',18,1,.15,5000,90,0)]),
 ('cannon-flight-loop.wav',2.5,True,.09,[('jet',19,1.35,1,2300,350,0)]),
 ('torpedo-launch.wav',1.8,False,.15,[('splash',0,1.18,.65,4300,40,0),('ship-engine',7,.88,.22,1800,55,.04),('bubbles',4.8,1,.3,2200,32,.1)]),
 ('torpedo-flight-loop.wav',5,True,.1,[('ship-engine',10,.87,.3,1100,45,0),('bubbles',23.7,1,.8,2400,40,0)]),
 ('air-intercept.wav',1.45,False,.18,[('cannon',0,1.22,.82,8000,110,0),('metal',0,1.18,.27,6500,250,.07)]),
 ('metal-impact.wav',2.8,False,.2,[('cannon',0,.74,.68,6100,35,0),('metal',0,.86,.45,7000,90,.026),('hull',3.25,.83,.3,3400,40,.07)]),
 ('water-splash.wav',3,False,.15,[('splash',0,.85,1,8300,35,0)]),
 ('battleship-cannon.wav',3.3,False,.22,[('cannon',0,.81,.8,6800,35,0),('cannon',0,.49,.27,1100,25,.015)]),
 ('ship-engine-loop.wav',6,True,.14,[('ship-engine',7,1,1,5300,38,0)]),
 ('ship-wake-loop.wav',6,True,.12,[('ocean',46,1,1,8200,100,0)]),
 ('f22-takeoff.wav',5,False,.18,[('jet',10.7,1,1,9500,80,0)]),
 ('f22-flight-loop.wav',6,True,.14,[('jet',16.1,1,1,7200,70,0)]),
 ('damage-fire-loop.wav',6,True,.12,[('fire',9,1,1,7200,130,0)]),
 ('metal-stress-loop.wav',7,True,.1,[('hull',2.5,1,1,4200,45,0)]),
 ('sinking.wav',7,False,.17,[('hull',2.8,.91,.8,3500,32,0),('bubbles',3.7,.88,1,3400,35,.65),('splash',.65,.77,.35,3400,30,1.1)]),
 ('ui-click.wav',.14,False,.045,[('metal',.025,1,.6,5200,650,0)]),
 ('turn-cue.wav',.38,False,.06,[('metal',.025,.87,1,5000,450,0)]),
 ('victory.wav',.7,False,.065,[('metal',.018,.9,.75,5800,300,0),('metal',.025,1.15,.45,5200,650,.14)]),
 ('defeat.wav',.8,False,.055,[('metal',.025,.63,.8,2800,180,0),('hull',3.5,1,.1,2600,50,.12)]),
]
ledger=json.loads((ROOT/'scripts/audio-sources.json').read_text())
for name,creator,ident,user,license in [('rocket','qubodup',211617,71257,'CC0-1.0'),('hull','Lewooz',514306,4984902,'CC0-1.0'),('bubbles','gkillhour',267223,3112522,'CC-BY-4.0'),('sonar','Breviceps',493162,9159316,'CC0-1.0')]:
 entry={'file':name+'.mp3','creator':creator,'page':f'https://freesound.org/people/{creator}/sounds/{ident}/','url':f'https://cdn.freesound.org/previews/{ident//1000}/{ident}_{user}-hq.mp3','sha256':hashlib.sha256((INPUT/(name+'.mp3')).read_bytes()).hexdigest(),'license':license,'licenseUrl':'https://creativecommons.org/licenses/by/4.0/' if license=='CC-BY-4.0' else 'https://creativecommons.org/publicdomain/zero/1.0/'}
 ledger['sources']=[e for e in ledger['sources'] if e['file']!=entry['file']]+[entry]
for e in ledger['sources']:
 e.setdefault('license','CC0-1.0');e.setdefault('licenseUrl','https://creativecommons.org/publicdomain/zero/1.0/')
ledger['license']='Per-source CC0-1.0 / CC-BY-4.0; see LICENSE.txt'
ledger['assetVersion']='naval-recorded-v2-20261002'
ledger['derivatives']=[]
for name,duration,loop,target,layers in recipes:
 cross=.25 if loop else 0;n=round((duration+cross)*RATE);x=np.zeros(n)
 layerdata=[]
 for source,start,rate,weight,low,high,delay in layers:
  offset=round(delay*RATE);part=recorded(source,start,(n-offset)/RATE,rate,low,high);x[offset:]+=part*weight
  layerdata.append({'source':source+'.mp3','offsetSeconds':start,'playbackRate':rate,'weight':weight,'lowpassHz':low,'highpassHz':high,'delaySeconds':delay})
 x-=np.mean(x)
 if loop:
  k=round(cross*RATE);a=np.linspace(0,1,k);x=np.concatenate([x[k:-k],x[-k:]*(1-a)+x[:k]*a])
 else:
  attack=round((.12 if name=='sinking.wav' else .003)*RATE);release=round(min(.35,duration*.22)*RATE);x[:attack]*=np.linspace(0,1,attack);x[-release:]*=np.linspace(1,0,release)
 rms=float(np.sqrt(np.mean(x*x)));gain=min(target/max(rms,1e-9),.88/max(float(abs(x).max()),1e-9));x*=gain
 pcm=np.round(x*32767).astype('<i2');path=OUTPUT/name
 with wave.open(str(path),'wb') as w:w.setnchannels(1);w.setsampwidth(2);w.setframerate(RATE);w.writeframes(pcm.tobytes())
 data=path.read_bytes();entry={'file':name,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),'duration':len(x)/RATE,'loop':loop,'sampleRate':RATE,'channels':1,'peak':round(float(abs(x).max()),6),'rms':round(float(np.sqrt(np.mean(x*x))),6),'gain':round(gain,6),'crossfadeSeconds':cross,'layers':layerdata,'license':'CC-BY-4.0' if any(l[0]=='bubbles' for l in layers) else 'CC0-1.0'}
 ledger['derivatives'].append(entry);print(name,entry['duration'],'peak',entry['peak'],'rms',entry['rms'])
ledger['processing']='Mono 32 kHz 16-bit PCM; source-only layering, rate shifts, second-order high/low-pass, DC removal, peak/RMS gain, 3 ms attacks (120 ms sinking), release fades, 250 ms overlapping loop seams. No runtime oscillators, generated noise, music, or voices; the licensed sonar source is an authored electronic sonar design.'
(ROOT/'scripts/audio-sources.json').write_text(json.dumps(ledger,indent=2)+'\n',encoding='utf8')
(OUTPUT/'source-manifest.json').write_text(json.dumps(ledger,indent=2)+'\n',encoding='utf8')
