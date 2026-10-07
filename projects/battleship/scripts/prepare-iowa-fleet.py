"""Iowa 1984 supplied-GLB integration. Source positions/normals/UV tuples only."""
from pathlib import Path
import json,base64,hashlib,subprocess,shutil,os,runpy
import numpy as np
R=Path(__file__).resolve().parents[1]
DT=np.dtype([('p','<i2',(3,)),('n','i1',(3,)),('c','u1',(3,)),('part','<u2'),('uv','<f4',(2,)),('tile','<u2')])

def convert_iowa(load,guard):
 g,buf,acc,parts=load('battleship');folder=R/'artifacts/external-assets/us-fleet/iowa-1984'
 xyz=np.concatenate([p['p'] for p in parts]);lo=xyz.min(0);hi=xyz.max(0);center=(lo+hi)/2
 span=270.43/304.5*3.6;scale=span/(hi[0]-lo[0]);rotation=np.array([[0,0,1],[0,1,0],[-1,0,0]])
 tiles,atlas=runpy.run_path(str(R/'scripts/source-fleet-atlas.py'))['build_atlas'](R,'battleship',g,buf)
 node=shutil.which('node') or str(Path(os.environ['USERPROFILE'])/'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe')
 worker=subprocess.Popen([node,str(R/'artifacts/model-tools/iowa-source-index-lods.mjs')],stdin=subprocess.PIPE,stdout=subprocess.PIPE,text=True)
 meta=[];groups={};records={'high':[],'medium':[],'low':[]};audit=[];omitted=[];source_count=sum(len(p['f']) for p in parts)
 def region(p):
  a=p['p'].min(0);b=p['p'].max(0);x,y,z=(a+b)/2;e=b-a
  if p['node']==6005:return 'hull','hull',None
  if p['node']==4411:
   return 'superstructure','superstructure',None
  if a[1]<0 and x<-195:return 'engine','engine','engine'
  # Named source ancestors define attachments. Leaves alone are unnamed in
  # this gltfpack export; spatial shoreline strips include boats/rails and are
  # never a valid substitute for authored weapon membership.
  for ancestor,label in reversed(p.get('ancestry',())):
   if any(token in label.lower() for token in ['mark 7','rgm-84 harpoon','slam launcher','phalanx']):return f'assembly-{ancestor}','weapon','weapon'
   if any(token in label.lower() for token in ['director','sps-10','slq_32','oe-82c','mk.13','mk.37','range finder']):return f'sensor-{ancestor}','radar','radar'
  if e[0]>35 or e[2]>30:return 'structure','structure',None
  if y>29 or (y>23 and -146<x<-118):return f'radar-{int(x//8)}','radar','radar'
  if -133<x<-98 and y>13:return 'bridge','bridge','bridge'
  if max(e)>60:return 'structure','structure',None
  return f'fitting-{int(x//8)}-{int(y//6)}-{int(z//8)}','fitting',None
 for pi,part in enumerate(parts):
  extent=np.ptp(part['p'],axis=0);key,role,system=region(part);material=part['prim'].get('material',0)
  structural=role in ['hull','structure','superstructure']
  # Small screws/links are below a few pixels at tactical view. Preserve every
  # major authored shell, weapon mount, mast, radar and named tactical structure.
  if max(extent)<1.5 and not structural:
   omitted.append(dict(primitive=pi,node=part['node'],triangles=len(part['f']),reason='sub-1.5m-detail',extent=extent.tolist()));continue
  p=(part['p']-center)@rotation.T*scale;p[:,1]=part['p'][:,1]*scale # source waterline Y=0
  normal=acc(part['prim']['attributes']['NORMAL']) if 'NORMAL' in part['prim']['attributes'] else np.zeros_like(p)
  normal=(np.linalg.inv(part['mat'][:3,:3]).T@normal.T).T@rotation.T;normal/=np.maximum(np.linalg.norm(normal,axis=1)[:,None],1e-12)
  uv=acc(part['prim']['attributes']['TEXCOORD_0']) if 'TEXCOORD_0' in part['prim']['attributes'] else np.zeros((len(p),2))
  f=part['f'];n=len(f);bounds=np.stack([p.min(0),p.max(0)]);group=(key,role)
  if group not in groups:
   groups[group]=len(meta);meta.append(dict(id=f'battleship-{role}-iowa-{key}',source=f'Iowa 1984 source region {key}',system=system,detachable=role not in ['hull','structure','superstructure'],bounds=bounds.tolist()))
  index=groups[group];meta[index]['bounds']=np.stack([np.minimum(meta[index]['bounds'][0],bounds[0]),np.maximum(meta[index]['bounds'][1],bounds[1])]).tolist()
  exact=structural or max(extent)>30 or n<16
  if exact:lods={v:dict(indices=f.reshape(-1).tolist(),error=0) for v in records}
  else:
   req=dict(p=p.reshape(-1).tolist(),f=f.reshape(-1).tolist(),attributes=np.c_[normal,uv].reshape(-1).tolist());worker.stdin.write(json.dumps(req)+'\n');worker.stdin.flush();lods=json.loads(worker.stdout.readline())
  item=dict(primitive=pi,node=part['node'],material=material,sourceTriangles=n,sourceRegion=key,structuralExact=bool(exact),variants={})
  reference=None;reference_ids=None;reference_opposed=0
  for variant in records:
   threshold={'high':1.5,'medium':2.0,'low':3.5}[variant]
   if max(extent)<threshold and not structural:
    item['variants'][variant]=dict(triangles=0,reason=f'sub-{threshold}m-distance-detail');continue
   source_lod='high' if variant=='medium' else variant
   ids=np.array(lods[source_lod]['indices'],dtype='int32');a=np.empty(len(ids),dtype=DT);a['p']=np.round(p[ids]*8192);a['n']=np.round(normal[ids]*127);a['uv']=uv[ids];a['part']=index;a['tile']=tiles.get(material,65535)
   color=g['materials'][material].get('pbrMetallicRoughness',{}).get('baseColorFactor',[1,1,1,1])[:3];a['c']=np.clip(np.round(np.array(color)*255),0,255)
   tri=a['p'].astype('int64').reshape(-1,3,3);keep=np.any(np.cross(tri[:,1]-tri[:,0],tri[:,2]-tri[:,0])!=0,axis=1);a=a[np.repeat(keep,3)]
   assert np.array_equal(a['uv'],uv[ids[np.repeat(keep,3)]].astype('<f4'))
   xyz=a['p'].astype(float).reshape(-1,3,3)/8192;cross=np.cross(xyz[:,1]-xyz[:,0],xyz[:,2]-xyz[:,0]);area=np.linalg.norm(cross,axis=1)/2
   opposing=int(((cross*a['n'].astype(float).reshape(-1,3,3).sum(1)/127).sum(1)<-area*.2).sum())
   if variant=='high':reference=a.copy();reference_ids=ids.copy();reference_opposed=opposing
   elif opposing>reference_opposed and reference is not None:a=reference.copy();ids=reference_ids.copy()
   records[variant].append(a.tobytes());item['variants'][variant]=dict(triangles=len(a)//3,error=lods[source_lod]['error'],sourceIndicesSha256=hashlib.sha256(ids.tobytes()).hexdigest(),droppedQuantizedDegenerates=int((~keep).sum()))
  audit.append(item)
 worker.stdin.close();worker.wait()
 # Tactical hit regions must correspond to visible source geometry at every LOD.
 arrays={v:np.frombuffer(b''.join(records[v]),dtype=DT) for v in records}
 for variant in ['medium','low']:
  present=set(arrays[variant]['part'].tolist())
  for i,part in enumerate(meta):
   if part['system'] and i not in present:
    records[variant].append(arrays['high'][arrays['high']['part']==i].tobytes())
 # Enforce the same surface coverage and winding gate used for DDG. Sparse
 # structural source parts fall back to their representative source HIGH.
 medium_records={'high':records['high'],'low':records['medium']}
 medium_fallback=guard(medium_records,meta,span);records['medium']=medium_records['low']
 low_fallback=guard(records,meta,span)
 # Source front/back pairs share the same plane. Our one DoubleSide runtime
 # material needs one authored surface, with textured wood winning on decks.
 clean_surfaces=runpy.run_path(str(R/'scripts/iowa-surface-cleanup.py'))['clean_iowa_surfaces']
 surface_cleanup={}
 for variant in records:
  clean,surface_cleanup[variant]=clean_surfaces(b''.join(records[variant]),meta)
  records[variant]=[clean]
 (folder/'iowa-surface-cleanup.json').write_text(json.dumps(surface_cleanup,indent=2))
 (folder/'iowa-lod-fallback.json').write_text(json.dumps(dict(medium=medium_fallback,low=low_fallback),indent=2))
 # Full canonical source is retained offline; runtime HIGH is representative.
 result=dict(stride=24,atlas=atlas,parts=meta,span=span,scale=scale,sourceSize=((hi-lo)@np.abs(rotation).T).tolist(),sourceMeshes=len(parts),sourceTriangles=source_count)
 for v in records:result[v]=base64.b64encode(b''.join(records[v])).decode()
 counts={v:len(base64.b64decode(result[v]))//72 for v in ['high','medium','low']}
 report=dict(source='User attachment source/USS+BB-61+Iowa+1984+2.glb',sourceSha256=hashlib.sha256((folder/'iowa-1984-source.glb').read_bytes()).hexdigest(),sourceAsset=g['asset'],license='No author, source URL or license metadata supplied in ZIP/GLB; no license inferred.',sourceBounds=[lo.tolist(),hi.tolist()],sourceTriangles=source_count,sourceMeshes=len(parts),sourceImages=len(g.get('images',[])),sourceMaterials=len(g['materials']),runtimeTriangles=counts,scale=scale,span=span,axisTransform='source +X bow to runtime -Z; +Y up; source Y0 waterline retained; one uniform scalar',runtimeHigh='Representative source-index LOD, full canonical source retained as offline GLB',sourceAttributes='Retained position/normal/UV tuples selected by source index; no nearest attribute transfer',omittedSubpixelDetails=omitted,parts=audit)
 (folder/'iowa-conversion-audit.json').write_text(json.dumps(report,indent=2));print('Iowa',counts,'parts',len(meta),'source',source_count,flush=True)
 return result

