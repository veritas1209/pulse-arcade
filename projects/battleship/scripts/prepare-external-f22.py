"""User-supplied Sketchfab Standard F22; source corner identities retained."""
from pathlib import Path
import json,struct,base64,hashlib,runpy,re,sys,subprocess,shutil,os
import numpy as np
R=Path(__file__).resolve().parents[1];folder=R/'artifacts/external-assets/us-fleet/stealth-fighter';src=folder/'f22-topnotch-source.glb';raw=src.read_bytes();jl=struct.unpack_from('<I',raw,12)[0];g=json.loads(raw[20:20+jl]);buf=raw[28+jl:]
def acc(i):
 a=g['accessors'][i];v=g['bufferViews'][a['bufferView']];dt={5123:'<u2',5125:'<u4',5126:'<f4'}[a['componentType']];n={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']];return np.ndarray((a['count'],n),dtype=dt,buffer=buf,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',np.dtype(dt).itemsize*n),np.dtype(dt).itemsize)).copy()
def node_matrix(node):
 if 'matrix' in node:return np.array(node['matrix']).reshape(4,4).T
 x,y,z,w=node.get('rotation',[0,0,0,1]);m=np.eye(4);m[:3,:3]=np.array([[1-2*y*y-2*z*z,2*x*y-2*z*w,2*x*z+2*y*w],[2*x*y+2*z*w,1-2*x*x-2*z*z,2*y*z-2*x*w],[2*x*z-2*y*w,2*y*z+2*x*w,1-2*x*x-2*y*y]])@np.diag(node.get('scale',[1,1,1]));m[:3,3]=node.get('translation',[0,0,0]);return m
parts=[]
def walk(i,parent,path):
 node=g['nodes'][i];mat=parent@node_matrix(node);path=path+'/'+node.get('name','')
 if 'mesh' in node:
  for prim in g['meshes'][node['mesh']]['primitives']:
   p=acc(prim['attributes']['POSITION']);p=(mat@np.c_[p,np.ones(len(p))].T).T[:,:3];n=acc(prim['attributes']['NORMAL']);n=(np.linalg.inv(mat[:3,:3]).T@n.T).T;n/=np.maximum(np.linalg.norm(n,axis=1)[:,None],1e-12);f=acc(prim['indices']).reshape(-1,3).astype('int32');
   if np.linalg.det(mat[:3,:3])<0:f=f[:,[0,2,1]]
   parts.append(dict(p=p,n=n,f=f,uv=acc(prim['attributes']['TEXCOORD_0']),material=prim.get('material',0),path=path))
 for child in node.get('children',[]):walk(child,mat,path)
for i in g['scenes'][g.get('scene',0)]['nodes']:walk(i,np.eye(4),'')
allp=np.concatenate([x['p'] for x in parts]);lo=allp.min(0);hi=allp.max(0);print('bounds',lo,hi,'extent',hi-lo)

# Source has nose -Z, +Y up; preserve dimensions and per-index hard seams.
# material_tiles,atlas= source-load boundary for the canonical preservation audit.
output=R/'src/naval/generated/f22-external.ts'
# Geometry LOD updates keep the approved material maps unchanged.
if output.exists():
 existing=json.loads(output.read_text().split(' = ',1)[1].split(' as const;')[0]);atlas=existing['atlas']
 material_tiles={i:tile for tile,i in enumerate(i for i,m in enumerate(g.get('materials',[])) if 'baseColorTexture' in m.get('pbrMetallicRoughness',{}))}
else:
 material_tiles,atlas=runpy.run_path(str(R/'scripts/source-fleet-atlas.py'))['build_atlas'](R,'fighter',g,buf)
center=(lo+hi)/2;length=hi[2]-lo[2];variants={};report={}
dtype=np.dtype([('p','<i2',(3,)),('n','i1',(3,)),('c','u1',(3,)),('uv','<f4',(2,)),('tile','<u2')])
for variant in ['flight','parked','flightLow']:
 records=[];included=[]
 for part in parts:
  mid=part['material'];path=part['path'];gear=bool(re.search(r'/(wheel_|gear_[flr]m?\d?_|gear_f_)',path))
  # Cockpit instrument screws/seat internals are occluded by the canopy.
  if 14<=mid<=24 or mid in [6,12,27] or '/steeringwheel_' in path:continue
  if variant!='parked' and gear:continue
  if variant=='flightLow' and (mid in [2,5] or '/weapon_' in path or '/door_hatch_' in path or '/door_pside_' in path or '/bonnet_' in path):continue
  ids=part['f'].reshape(-1);p=(part['p'][ids]-center)/length;n=part['n'][ids];uv=part['uv'][ids];color=np.tile(g['materials'][mid].get('pbrMetallicRoughness',{}).get('baseColorFactor',[1,1,1,1])[:3],(len(ids),1))
  if mid==28:color[:]=[.28,.34,.32] # Opaque tinted canopy retains its exterior form.
  a=np.empty(len(ids),dtype=dtype);a['p']=np.round(p*32767);a['n']=np.round(n*127);a['c']=np.clip(np.round(color*255),0,255);a['uv']=uv;a['tile']=material_tiles.get(mid,65535);tri=a['p'].astype('int64').reshape(-1,3,3);keep=np.any(np.cross(tri[:,1]-tri[:,0],tri[:,2]-tri[:,0])!=0,axis=1);a=a[np.repeat(keep,3)];records.append(a.tobytes());included.append(path)
 packed=b''.join(records);variants[variant]=base64.b64encode(packed).decode();report[variant]={'triangles':len(packed)//(dtype.itemsize*3),'includedParts':included}
# Seam-aware indexed LODs: meshoptimizer returns retained source corner indices.
# The actual source tuple (position, normal, UV) is selected together; no nearest
# position lookup, attribute interpolation, new vertices, or texture rebake occurs.
lod_parts=[p for p in parts if not (14<=p['material']<=24 or p['material'] in [6,12,27] or '/steeringwheel_' in p['path'])]
request={'parts':[dict(p=p['p'].tolist(),n=p['n'].tolist(),uv=p['uv'].tolist(),f=p['f'].reshape(-1).tolist()) for p in lod_parts]}
node=shutil.which('node') or str(Path(os.environ['USERPROFILE'])/'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe')
lod_indices=json.loads(subprocess.run([node,str(R/'artifacts/model-tools/f22-source-index-lods.mjs')],input=json.dumps(request),capture_output=True,text=True,check=True).stdout)
canonical_flight_low=variants['flightLow']
lod_report={}
for variant in ['parkedNear','parkedLow','flightLow']:
 records=[];audits=[]
 for part,lods in zip(lod_parts,lod_indices):
  if variant=='flightLow' and part['path'] not in report['flightLow']['includedParts']:continue
  source_lod='parkedNear' if variant=='flightLow' else variant
  ids=np.array(lods[source_lod]['indices'],dtype=np.int32);mid=part['material']
  assert len(ids)%3==0 and np.all((ids>=0)&(ids<len(part['p'])))
  p=(part['p'][ids]-center)/length;n=part['n'][ids];uv=part['uv'][ids]
  color=np.tile(g['materials'][mid].get('pbrMetallicRoughness',{}).get('baseColorFactor',[1,1,1,1])[:3],(len(ids),1))
  if mid==28:color[:]=[.28,.34,.32]
  a=np.empty(len(ids),dtype=dtype);a['p']=np.round(p*32767);a['n']=np.round(n*127);a['c']=np.clip(np.round(color*255),0,255);a['uv']=uv;a['tile']=material_tiles.get(mid,65535)
  tri=a['p'].astype('int64').reshape(-1,3,3);keep=np.any(np.cross(tri[:,1]-tri[:,0],tri[:,2]-tri[:,0])!=0,axis=1);a=a[np.repeat(keep,3)];ids=ids[np.repeat(keep,3)]
  # Tests compare every packed corner back to the source index that produced it.
  assert np.array_equal(a['uv'],part['uv'][ids].astype('<f4'))
  assert np.array_equal(a['n'],np.round(part['n'][ids]*127).astype('i1'))
  assert np.array_equal(a['p'],np.round((part['p'][ids]-center)/length*32767).astype('<i2'))
  records.append(a.tobytes());audits.append(dict(path=part['path'],material=mid,sourceTriangles=len(part['f']),triangles=len(a)//3,error=lods[source_lod]['error'],sourceIndices=ids.tolist(),droppedQuantizedDegenerates=int((~keep).sum())))
 packed=b''.join(records);variants[variant]=base64.b64encode(packed).decode()
 lod_report[variant]=dict(triangles=len(packed)//(dtype.itemsize*3),exactRetainedSourcePositions=True,exactRetainedSourceNormals=True,exactRetainedSourceUV=True,algorithm='meshoptimizer 1.0 simplifyWithAttributes, source indices only, extrema locked',parts=audits)
(folder/'f22-parked-lod-audit.json').write_text(json.dumps(lod_report,indent=2))
# Canonical parked data exists only for offline source-preservation verification.
# It is never imported by the runtime bundle; optimized parked LOD bytes stay intact.
(folder/'f22-canonical.json').write_text(json.dumps(dict(stride=dtype.itemsize,parked=variants.pop('parked'),flightLow=canonical_flight_low),separators=(',',':'))+'\n')
output.write_text('/** User supplied F22 RAPTOR, Sketchfab Standard; see public/models/f22-source-notice.txt. */\nexport const externalFighter = '+json.dumps(dict(stride=dtype.itemsize,atlas=atlas,**variants),separators=(',',':'))+' as const;\n')
record={'sourcePath':str(src),'sourceUrl':g['asset']['extras']['source'],'sha256':hashlib.sha256(raw).hexdigest(),'bytes':len(raw),'embeddedAttribution':g['asset']['extras'],'userSupplied':True,'sourceTriangles':sum(len(x['f']) for x in parts),'sourceBounds':[lo.tolist(),hi.tolist()],'sourceExtent':(hi-lo).tolist(),'nose':'-Z','up':'+Y','realLengthMetres':18.9,'variants':report,'atlas':atlas,'parkedLods':{v:{k:x for k,x in info.items() if k!='parts'} for v,info in lod_report.items()},'modifications':['Baked node matrices, reversed winding for mirrored nodes','Original indexed UV and normal corner attributes retained without nearest-position remapping','Removed occluded cockpit detail and deployed gear for flight','Uniform scaling only; intact source wings and tail retained for all LODs','Parked distance LODs select original vertex indices with attribute-aware meshoptimizer; exact source position-normal-UV tuples and part extrema retained']}
(folder/'f22-topnotch-conversion-report.json').write_text(json.dumps(record,indent=2));(folder/'f22-topnotch-source-license-record.json').write_text(json.dumps({k:v for k,v in record.items() if k in ['sourcePath','sourceUrl','sha256','bytes','embeddedAttribution','userSupplied']},indent=2));(R/'public/models/f22-source-notice.txt').write_text('F22 RAPTOR\n'+json.dumps(g['asset']['extras'],indent=2)+'\nUser supplied GLB. Adaptations: '+ '; '.join(record['modifications'])+'\n');print({v:x['triangles'] for v,x in {**report,**lod_report}.items()})
