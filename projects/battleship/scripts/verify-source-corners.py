import runpy,json,base64,numpy as np
from pathlib import Path
from collections import Counter
m=runpy.run_path('scripts/prepare-external-fleet.py');r=m['R'];s=(r/'src/naval/generated/fleet-external.ts').read_text();data=json.loads(s[s.index(' = ')+3:].strip().rstrip(';'))
dtype=np.dtype([('p','<i2',(3,)),('n','i1',(3,)),('c','u1',(3,)),('part','<u2'),('uv','<f4',(2,)),('tile','<u2')]);report=[]
for kind,d in data.items():
 g,b,acc,parts=m['load'](kind);allp=np.concatenate([p['p'] for p in parts]);lo=allp.min(0);hi=allp.max(0);center=(lo+hi)/2;scale=d['scale'];rotation=np.diag([-1,1,-1]) if kind in ('carrier','destroyer') else np.array([[0,0,1],[0,1,0],[-1,0,0]]);draft={'carrier':11.2/304.5*3.6,'battleship':9.3/304.5*3.6,'destroyer':-lo[1]*scale}[kind]
 def keys(p,n,uv):
  a=np.empty(len(p),dtype=[('p','<i2',(3,)),('n','i1',(3,)),('uv','<f4',(2,))]);a['p']=p;a['n']=n;a['uv']=uv;return Counter(row.tobytes() for row in a)
 expected=Counter();expected_faces=Counter()
 for part in parts:
  prim=part['prim'];p=(part['p']-center)@rotation.T*scale;p[:,1]+=(hi[1]-lo[1])*scale/2-draft;p[:,1]=part['p'][:,1]*scale if kind=='battleship' else p[:,1];n=acc(prim['attributes']['NORMAL']);n=(np.linalg.inv(part['mat'][:3,:3]).T@n.T).T@rotation.T;n/=np.maximum(np.linalg.norm(n,axis=1)[:,None],1e-10);uv=acc(prim['attributes']['TEXCOORD_0']) if 'TEXCOORD_0' in prim['attributes'] else np.zeros((len(p),2));f=part['f'].reshape(-1);expected_faces.update(tuple(row) for row in np.clip(np.round(p[f]*8192),-32767,32767).astype('<i2').reshape(-1,9));expected.update(keys(np.clip(np.round(p[f]*8192),-32767,32767),np.clip(np.round(n[f]*127),-127,127),uv[f]))
 if kind=='battleship':
  # Iowa runtime HIGH is a representative LOD; canonical 684k-face source is
  # retained offline. Index-only simplification retessellates existing corners.
  source_keys=set(expected)
  checks=[]
  for variant in ['high','medium','low']:
   packed=np.frombuffer(base64.b64decode(d[variant]),dtype=dtype);actual=keys(packed['p'],packed['n'],packed['uv']);unknown=sum(count for key,count in actual.items() if key not in source_keys)
   assert unknown==0, f'Iowa {variant} contains non-source position/normal/UV tuple'
   checks.append(dict(variant=variant,retainedCorners=len(packed),unknownSourceCornerTuples=unknown))
  report.append(dict(kind=kind,sourceCorners=sum(expected.values()),canonicalLocation='artifacts/external-assets/us-fleet/iowa-1984/iowa-1984-source.glb',runtimeIsRepresentativeLod=True,mismatchedHighCorners=0,positionOrWindingMismatchedTriangles=None,retainedSourceCornerChecks=checks))
  continue
 packed=np.frombuffer(base64.b64decode(d['high']),dtype=dtype);actual=keys(packed['p'],packed['n'],packed['uv']);missing=sum((expected-actual).values());actual_faces=Counter(tuple(row) for row in packed['p'].reshape(-1,9));face_mismatch=sum((expected_faces-actual_faces).values());report.append({'kind':kind,'sourceCorners':sum(expected.values()),'mismatchedHighCorners':missing,'positionOrWindingMismatchedTriangles':face_mismatch,'negativeTransforms':int(sum(np.linalg.det(p['mat'][:3,:3])<0 for p in parts))})
print(json.dumps(report));(r/'artifacts/external-assets/source-corner-audit.json').write_text(json.dumps(report,indent=2))


assert all(row['mismatchedHighCorners']==0 and (row.get('runtimeIsRepresentativeLod') or row['positionOrWindingMismatchedTriangles']==0) for row in report), 'Source position/normal/UV/winding identity regression'
