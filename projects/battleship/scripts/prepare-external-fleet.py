from pathlib import Path
import json,struct, numpy as np
R=Path(__file__).resolve().parents[1]
def load(kind):
 source=R/'artifacts/external-assets/us-fleet/324120997379466caad30917911bcd8b.glb' if kind=='carrier' else R/'artifacts/external-assets/us-fleet/iowa-1984/iowa-1984-source.glb' if kind=='battleship' else R/f'artifacts/external-assets/{kind}-source.glb'
 b=source.read_bytes();jl=struct.unpack_from('<I',b,12)[0];g=json.loads(b[20:20+jl]);buf=b[28+jl:]
 def acc(i):
  a=g['accessors'][i];v=g['bufferViews'][a['bufferView']];dt={5120:'i1',5121:'u1',5122:'<i2',5123:'<u2',5125:'<u4',5126:'<f4'}[a['componentType']];n={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']];return np.ndarray((a['count'],n),dtype=dt,buffer=buf,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',np.dtype(dt).itemsize*n),np.dtype(dt).itemsize)).copy()
 def matrix(n):
  if 'matrix' in n:return np.array(n['matrix']).reshape(4,4).T
  x,y,z,w=n.get('rotation',[0,0,0,1]);m=np.eye(4);m[:3,:3]=np.array([[1-2*y*y-2*z*z,2*x*y-2*z*w,2*x*z+2*y*w],[2*x*y+2*z*w,1-2*x*x-2*z*z,2*y*z-2*x*w],[2*x*z-2*y*w,2*y*z+2*x*w,1-2*x*x-2*y*y]])@np.diag(n.get('scale',[1,1,1]));m[:3,3]=n.get('translation',[0,0,0]);return m
 parts=[]
 def walk(i,parent,ancestry=()):
  node=g['nodes'][i];mat=parent@matrix(node);ancestry=ancestry+((i,node.get('name','')) ,)
  if 'mesh' in node:
   mesh=g['meshes'][node['mesh']]
   for prim in mesh['primitives']:
    if prim.get('mode',4)!=4:continue
    p=acc(prim['attributes']['POSITION']);p=(mat@np.c_[p,np.ones(len(p))].T).T[:,:3];f=acc(prim['indices']).reshape(-1,3).astype('int32');f=f[:,[0,2,1]] if np.linalg.det(mat[:3,:3])<0 else f;parts.append(dict(name=node.get('name',mesh.get('name','part')),node=i,ancestry=ancestry,p=p,f=f,prim=prim,mat=mat))
  for child in node.get('children',[]):walk(child,mat,ancestry)
 for i in g['scenes'][g.get('scene',0)]['nodes']:walk(i,np.eye(4))
 return g,buf,acc,parts
# Offline conversion: original mesh positions/normals/UVs, source transforms, semantic
# connected components, source albedo baked to linear vertex RGB, two bounded LODs.
import sys,io,base64,re,hashlib,subprocess,shutil,os
from PIL import Image
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components
from scipy.spatial import cKDTree
sys.path.insert(0,str(R/'artifacts/model-tools'))
import fast_simplification

def boundary_metrics(a):
 # Positional weld is used only for auditing, never for attribute transfer.
 p,inv=np.unique(a['p'],axis=0,return_inverse=True);f=inv.reshape(-1,3)
 edges=np.concatenate([f[:,[0,1]],f[:,[1,2]],f[:,[2,0]]]);edges=np.sort(edges,axis=1)
 edges,counts=np.unique(edges,axis=0,return_counts=True);edges=edges[counts==1]
 segments={tuple(sorted((tuple(p[i]),tuple(p[j])))) for i,j in edges if i!=j}
 length=sum(float(np.linalg.norm(np.array(a,dtype=float)-b))/8192 for a,b in segments)
 return segments,length

def guard_low_structure(records,meta,span):
 # Audit the actual quantized runtime triangles, after component aggregation.
 # A sparse sheet may be split into many small source components, so a local
 # simplification budget alone cannot guarantee the semantic part's coverage.
 dtype=np.dtype([('p','<i2',(3,)),('n','i1',(3,)),('c','u1',(3,)),('part','<u2'),('uv','<f4',(2,)),('tile','<u2')])
 arrays={v:np.frombuffer(b''.join(records[v]),dtype=dtype) for v in records}
 def metrics(a):
  p=a['p'].astype(float).reshape(-1,3,3)/8192
  face=np.cross(p[:,1]-p[:,0],p[:,2]-p[:,0]);area=np.linalg.norm(face,axis=1)/2
  normals=a['n'].astype(float).reshape(-1,3,3).sum(axis=1)/127
  return float(area.sum()),int((area<1e-12).sum()),int(((face*normals).sum(axis=1)<-area*.2).sum())
 fallback=[]
 for index,part in enumerate(meta):
  high=arrays['high'][arrays['high']['part']==index];low=arrays['low'][arrays['low']['part']==index]
  ha,hd,hn=metrics(high);la,ld,ln=metrics(low)
  structural=ha>.1 or max(np.array(part['bounds'][1])-part['bounds'][0])>=span*.3
  reasons=[]
  if structural and la<ha*.9:reasons.append('surface-coverage')
  if ld>hd:reasons.append('new-degenerate-faces')
  if ln>hn:reasons.append('new-opposing-normals')
  if part['id'].startswith('destroyer-'):
   hb,hl=boundary_metrics(high);lb,ll=boundary_metrics(low)
   new_edges=lb-hb
   # Border-locked source patches must not expose previously interior edges.
   # Ignore sub-quantization slivers already insignificant at packed precision.
   new_length=sum(float(np.linalg.norm(np.array(a,dtype=float)-b))/8192 for a,b in new_edges)
   if new_length>4/8192 and (structural or part['system']=='bridge'):reasons.append('new-open-boundaries')
  if reasons:fallback.append({'index':index,'id':part['id'],'reasons':reasons,'highTriangles':len(high)//3,'previousLowTriangles':len(low)//3})
 indices={p['index'] for p in fallback}
 records['low']=[arrays['low'][~np.isin(arrays['low']['part'],list(indices))].tobytes()]+[arrays['high'][arrays['high']['part']==i].tobytes() for i in sorted(indices)]
 return fallback

def convert(kind,existing_atlas=None):
 if kind=='battleship':
  import runpy
  return runpy.run_path(str(R/'scripts/prepare-iowa-fleet.py'))['convert_iowa'](load,guard_low_structure)
 g,buf,acc,parts=load(kind);images=[]
 meshopt=None
 if kind=='destroyer':
  node=shutil.which('node') or str(Path(os.environ['USERPROFILE'])/'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe')
  meshopt=subprocess.Popen([node,str(R/'artifacts/model-tools/meshopt-source-indices.mjs')],stdin=subprocess.PIPE,stdout=subprocess.PIPE,text=True)
 import runpy
 if existing_atlas is None:
  material_tiles,atlas=runpy.run_path(str(R/"scripts/source-fleet-atlas.py"))["build_atlas"](R,kind,g,buf)
 else:
  # Geometry-only rebuilds retain the approved source material atlas byte-for-byte.
  material_tiles={i:tile for tile,i in enumerate(i for i,m in enumerate(g.get('materials',[])) if 'baseColorTexture' in m.get('pbrMetallicRoughness',{}))}
  atlas=existing_atlas
 for im in g.get('images',[]):
  v=g['bufferViews'][im['bufferView']];images.append(np.asarray(Image.open(io.BytesIO(buf[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']])).convert('RGB'))/255.)
 allp=np.concatenate([p['p'] for p in parts]);lo=allp.min(0);hi=allp.max(0);span={'carrier':332.85/304.5*3.6,'battleship':251/304.5*3.6,'destroyer':153.92/304.5*3.6}[kind];scale=span/max(hi-lo);center=(lo+hi)/2;rotation=np.diag([-1,1,-1]) if kind in ('carrier','destroyer') else np.array([[0,0,1],[0,1,0],[-1,0,0]])
 # Naval forward -Z: Liaoning bow is -sourceZ; BB/DD bow is +sourceX.
 draft={'carrier':11.2/304.5*3.6,'battleship':9.3/304.5*3.6,'destroyer':-lo[1]*scale}[kind]
 meta=[];partmap={};records={'high':[],'medium':[],'low':[]}
 for pi,part in enumerate(parts):
  p,f,prim=part['p'],part['f'],part['prim'];name=part['name'];p=(p-center)@rotation.T*scale;p[:,1]+=(hi[1]-lo[1])*scale/2-draft
  normal=acc(prim['attributes']['NORMAL']) if 'NORMAL' in prim['attributes'] else np.zeros_like(p);normal=(np.linalg.inv(part['mat'][:3,:3]).T@normal.T).T@rotation.T;normal/=np.maximum(np.linalg.norm(normal,axis=1)[:,None],1e-10)
  m=g['materials'][prim.get('material',0)];pbr=m.get('pbrMetallicRoughness',{});c=np.tile(pbr.get('baseColorFactor',[.65,.68,.7,1])[:3],(len(p),1))
  source_uv=acc(prim['attributes']['TEXCOORD_0']) if 'TEXCOORD_0' in prim['attributes'] else np.zeros((len(p),2))
  source_tile=material_tiles.get(prim.get('material',0),65535)
  # Weld positions for component connectivity only; original normals/UV seam colors remain.
  unique,inv=np.unique(np.round(p,6),axis=0,return_inverse=True);ff=inv[f];edges=np.concatenate([ff[:,[0,1]],ff[:,[1,2]],ff[:,[2,0]]]);_,labels=connected_components(coo_matrix((np.ones(len(edges)),(edges[:,0],edges[:,1])),shape=(len(unique),len(unique))).tocsr(),directed=False);flabel=labels[ff[:,0]]
  # Every source turret remains a connected detachable unit, with material sections linked spatially later.
  tags=np.zeros(len(f),dtype=int)
  if kind=='carrier':
   source_triangles=part['p'][f]
   # Split upper island from the connected hull before component grouping.
   tags[np.all(source_triangles[:,:,1]>131,axis=1)]=2
   tags[np.all(source_triangles[:,:,1]>440,axis=1)]=5
   tags[np.all(np.abs(source_triangles[:,:,1]-128.0448)<2,axis=1)]=6
  if kind=='destroyer':
   centers=part['p'][f].mean(axis=1)
   source_triangles=part['p'][f]
   def within(lower,upper):return np.all((source_triangles>=lower)&(source_triangles<=upper),axis=(1,2))
   if pi==0:tags[:]=3
   elif pi==2:tags[:]=1
   elif pi==3:tags[:]=4
   elif pi==5:tags[:]=5
   else:
    tags[within([-8.9,11,22.5],[8.9,19.6,35.2])]=2
    tags[within([-8.2,12.4,26.2],[-4.3,17.1,30.1])|within([4.3,12.4,26.2],[8.2,17.1,30.1])]=5
    tags[within([-3.7,6.7,39.7],[3.7,8.0,44.8])|within([-3.6,6.2,-43.2],[3.6,7.3,-34.5])|within([-1.9,7.4,47.1],[1.9,12,57.0])]=1
  if kind in ('carrier','destroyer'):
   # Partition semantic subsets before computing attachments. Fore/aft launcher
   # islands share the original hull component but are disconnected after tagging.
   offset=0
   for tag in np.unique(tags):
    mask=tags==tag;sub=ff[mask]
    edge=np.concatenate([sub[:,[0,1]],sub[:,[1,2]],sub[:,[2,0]]])
    _,component_labels=connected_components(coo_matrix((np.ones(len(edge)),(edge[:,0],edge[:,1])),shape=(len(unique),len(unique))).tocsr(),directed=False)
    flabel[mask]=component_labels[sub[:,0]]+offset
    offset+=int(component_labels.max())+1
  for component,tag in np.unique(np.stack([flabel,tags],axis=1),axis=0):
   faces=f[(flabel==component)&(tags==tag)];ids=np.unique(faces);cp=p[ids];bounds=np.stack([cp.min(0),cp.max(0)]);mid=bounds.mean(0);extent=bounds[1]-bounds[0];lowname=name.lower();system=None;role='fitting'
   if 'hull' in lowname or kind=='carrier' and pi in [1,2]:role='hull'
   if re.search(r'38 cm skc34|15cm|maingun|minelauncher',lowname):system='weapon';role='weapon'
   elif re.search(r'flak|antiaircraft|10.5cm|38cm skc',lowname):system='airDefense';role='air-defense'
   elif 'rangefinder' in lowname:system='radar';role='director'
   elif 'superstructure' in lowname or kind=='carrier' and pi in [0,5]:
    system='radar' if mid[1]>(hi[1]-lo[1])*scale*.67-draft else 'bridge';role=system
   elif mid[1]>.18 and extent[1]>.08 and extent[0]<span*.2 and extent[2]<span*.25:system='radar';role='mast'
   if kind=='destroyer' and role=='fitting' and mid[1]>.035 and -.28<mid[2]<-.07 and extent[2]>.025:system='bridge';role='bridge'
   if bounds[1,1]<.015 and abs(mid[2])>span*.3:system='engine';role='propulsion'
   if kind=='carrier':
    system={2:'bridge',5:'radar',6:'flightDeck'}.get(int(tag));role=system if system else 'hull'
   if kind=='destroyer':
    system={1:'weapon',2:'bridge',3:'airDefense',4:'engine',5:'radar'}.get(int(tag))
    role=system if system else 'hull' if max(extent)>=span*.12 else 'fitting'
   group=(role,pi,tuple(np.floor(mid/(span*.075)).astype(int)));index=partmap.get(group)
   if index is None:
    index=len(meta);partmap[group]=index;meta.append({'id':f'{kind}-{role}-{pi}-{int(component)}','source':name,'system':system,'detachable':bool(role!='hull' and max(extent[[0,2]])<span*.35),'bounds':bounds.tolist()})
   else:
    meta[index]['bounds']=np.stack([np.minimum(meta[index]['bounds'][0],bounds[0]),np.maximum(meta[index]['bounds'][1],bounds[1])]).tolist()
   remap=np.full(len(p),-1,dtype=np.int32);remap[ids]=np.arange(len(ids));local=remap[faces]
   if kind=='destroyer':
    # glTF exports may repeat identical corners. Merge only full attribute
    # identities, never positional duplicates across UV or hard-normal seams.
    _,representatives,weld=np.unique(np.c_[cp,normal[ids],source_uv[ids]],axis=0,return_index=True,return_inverse=True)
    cp=cp[representatives];ids=ids[representatives];local=weld[local]
   tree=cKDTree(cp)
   for variant,fraction in [('high',1.),('medium',.4 if kind=='destroyer' else .20),('low',.055)]:
    # Retain hull silhouettes and all low-poly source pieces; dense curved guns get quadric LOD.
    if variant=='low' and kind!='carrier' and max(extent)<span*.018 and system is None:continue
    # The carrier's deck and hull are sparse, open hard-surface sheets.
    # A percentage-only QEM budget collapses these into disconnected wedges
    # (the 51-face flight deck previously became four faces). Keep their
    # authored topology; reduce dense fittings, not load-bearing silhouettes.
    carrier_structure=kind=='carrier' or max(extent)>=span*.12 or kind=='destroyer' and system=='bridge'
    target=len(faces) if carrier_structure else max(4,round(len(faces)*fraction));q=cp;fq=local
    # Source UV and hard-normal seams are deliberately unwelded. Their vertices
    # are patch borders: unrestricted QEM moves each side independently, opening
    # the bridge and other planar panels despite retaining aggregate surface area.
    # Freeze these borders and retain the bridge's sparse authored shell exactly.
    if len(faces)>target+8:
     try:
      if meshopt is not None:
       request=dict(p=cp.reshape(-1).tolist(),f=local.reshape(-1).tolist(),attributes=np.c_[normal[ids],source_uv[ids]].reshape(-1).tolist(),target=target,error=.025 if variant=='medium' else .05)
       meshopt.stdin.write(json.dumps(request)+'\n');meshopt.stdin.flush();answer=json.loads(meshopt.stdout.readline())
       fq=np.array(answer['indices'],dtype=np.int32).reshape(-1,3)
       # Meshoptimizer emits original indices, so exact source corner attributes
       # remain paired; q deliberately stays cp and bypasses nearest transfer.
      else:q,fq=fast_simplification.simplify(cp,local.astype('int32'),target_count=target,agg=7)
     except Exception:pass
    if not len(fq) and system is not None:q=cp;fq=local
    if not len(fq):continue
    flat=fq.reshape(-1);qp=q[flat]
    if q is cp:
     # Original vertices include coincident UV seams and hard-normal corners.
     # A position-only nearest lookup destroys that per-corner identity.
     nearest=ids[flat]
    else:
     # Transfer attributes per output face, choosing the nearest source corner
     # on a face with compatible orientation instead of crossing hard seams.
     source_face=np.cross(cp[local[:,1]]-cp[local[:,0]],cp[local[:,2]]-cp[local[:,0]])
     source_face/=np.maximum(np.linalg.norm(source_face,axis=1)[:,None],1e-15)
     output_face=np.cross(q[fq[:,1]]-q[fq[:,0]],q[fq[:,2]]-q[fq[:,0]])
     output_face/=np.maximum(np.linalg.norm(output_face,axis=1)[:,None],1e-15)
     corners=local.reshape(-1);corner_tree=cKDTree(cp[corners])
     distances,candidates=corner_tree.query(qp,k=min(24,len(corners)))
     if candidates.ndim==1:candidates=candidates[:,None];distances=distances[:,None]
     alignment=(source_face[candidates//3]*np.repeat(output_face,3,axis=0)[:,None,:]).sum(axis=2)
     score=distances+np.maximum(0,1-alignment)*max(float(max(extent))*.1,1e-5)
     nearest=ids[corners[candidates[np.arange(len(qp)),np.argmin(score,axis=1)]]]
    qn=normal[nearest];qc=c[nearest]
    # packed world positions use 1/8192 unit precision, sufficient for sub-mm detail at game scale.
    packed=np.empty(len(qp),dtype=[('p','<i2',(3,)),('n','i1',(3,)),('c','u1',(3,)),('part','<u2'),('uv','<f4',(2,)),('tile','<u2')]);packed['p']=np.clip(np.round(qp*8192),-32767,32767);packed['n']=np.clip(np.round(qn*127),-127,127);packed['c']=np.clip(np.round(qc*255),0,255);packed['part']=index;packed['uv']=source_uv[nearest];packed['tile']=source_tile;records[variant].append(packed.tobytes())
 if meshopt is not None:meshopt.stdin.close();meshopt.wait()
 medium_records={'high':records['high'],'low':records['medium']}
 medium_fallback=guard_low_structure(medium_records,meta,span)
 records['medium']=medium_records['low']
 (R/f'artifacts/external-assets/{kind}-medium-fallback.json').write_text(json.dumps(medium_fallback,indent=2))
 fallback=guard_low_structure(records,meta,span)
 (R/f'artifacts/external-assets/{kind}-lod-fallback.json').write_text(json.dumps(fallback,indent=2))
 result={'stride':24,'atlas':atlas,'parts':meta,'span':span,'scale':scale,'sourceSize':((hi-lo)@np.abs(rotation).T).tolist(),'sourceMeshes':len(parts),'sourceTriangles':sum(len(p['f']) for p in parts)}
 for variant in records:result[variant]=base64.b64encode(b''.join(records[variant])).decode()
 print(kind,'parts',len(meta),'source triangles',result['sourceTriangles'],'runtime', {v:sum(len(x) for x in records[v])//72 for v in records},flush=True)
 return result

if __name__=='__main__':
 import argparse
 parser=argparse.ArgumentParser();parser.add_argument('--kind',choices=['carrier','battleship','destroyer'],action='append');parser.add_argument('--reuse-atlas',action='store_true');args=parser.parse_args()
 out=R/'src/naval/generated/fleet-external.ts'
 data=json.loads(out.read_text(encoding='utf8').split(' = ',1)[1].rstrip(';\n')) if args.kind or args.reuse_atlas else {}
 for kind in args.kind or ['carrier','battleship','destroyer']:
  data[kind]=convert(kind,data.get(kind,{}).get('atlas') if args.reuse_atlas else None)
 out.write_text('/** Imported ships; individual provenance/licensing is recorded per source. See public/models/fleet-source-notice.txt and scripts/prepare-external-fleet.py. */\nexport interface ImportedShip {parts:{id:string;source:string;system:string|null;detachable:boolean;bounds:number[][]}[];span:number;scale:number;sourceSize:number[];sourceMeshes:number;sourceTriangles:number;stride?:number;atlas?:{columns:number;rows:number;tileSize:number;width:number;height:number;padding:number;colorPath:string;pbrPath:string;normalPath?:string};high:string;medium?:string;low:string}\nexport const externalFleet:Record<"carrier"|"battleship"|"destroyer",ImportedShip> = '+json.dumps(data,separators=(',',':'))+';\n',encoding='utf8');(R/'artifacts/external-assets/fleet-conversion-report.json').write_text(json.dumps({k:{n:v for n,v in d.items() if n not in ['high','medium','low']} for k,d in data.items()},indent=2))

