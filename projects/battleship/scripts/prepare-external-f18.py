"""Reproducible CC-BY-4.0 external F/A-18E ingestion. Requires numpy, Pillow, fast-simplification."""
from pathlib import Path
import sys,json,urllib.request,hashlib,concurrent.futures,base64,re,struct
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[1];SRC=ROOT/'artifacts/imported/f18';sys.path.insert(0,str(ROOT/'artifacts/model-tools'))
import fast_simplification
BASE='https://raw.githubusercontent.com/cinascorp/opensky/main/boeing-f18/'
def fetch(path):
    dest=SRC/path
    if not dest.exists():
        dest.parent.mkdir(parents=True,exist_ok=True)
        with urllib.request.urlopen(BASE+path,timeout=45) as r:dest.write_bytes(r.read())
    return dest
for file in ['scene.gltf','scene.bin','license.txt']:fetch(file)
g=json.loads((SRC/'scene.gltf').read_text());buf=(SRC/'scene.bin').read_bytes()
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:list(pool.map(fetch,[im['uri'] for im in g['images']]))
images=[np.asarray(Image.open(SRC/im['uri']).convert('RGB'))/255 for im in g['images']]
def acc(i):
    a=g['accessors'][i];v=g['bufferViews'][a['bufferView']];dtype={5121:'u1',5123:'<u2',5125:'<u4',5126:'<f4'}[a['componentType']];n={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']];off=v.get('byteOffset',0)+a.get('byteOffset',0)
    return np.ndarray((a['count'],n),dtype=dtype,buffer=buf,offset=off,strides=(v.get('byteStride',np.dtype(dtype).itemsize*n),np.dtype(dtype).itemsize)).copy()
def matrix(n):
    if 'matrix' in n:return np.array(n['matrix']).reshape(4,4).T
    m=np.eye(4);m[:3,3]=n.get('translation',[0,0,0]);m[:3,:3]*=n.get('scale',[1,1,1]);return m
parts=[]
def walk(i,parent):
    node=g['nodes'][i];mat=parent@matrix(node)
    if 'mesh' in node:
      mesh=g['meshes'][node['mesh']]
      for prim in mesh['primitives']:
        p=acc(prim['attributes']['POSITION']);p=(mat@np.c_[p,np.ones(len(p))].T).T[:,:3];f=acc(prim['indices']).reshape(-1,3).astype('int32');m=g['materials'][prim.get('material',0)];pbr=m.get('pbrMetallicRoughness',{});c=np.tile(pbr.get('baseColorFactor',[.7,.73,.72,1])[:3],(len(p),1))
        if 'baseColorTexture' in pbr:
          im=images[g['textures'][pbr['baseColorTexture']['index']]['source']];uv=acc(prim['attributes']['TEXCOORD_0']);xx=np.clip((uv[:,0]%1*im.shape[1]).astype(int),0,im.shape[1]-1);yy=np.clip((uv[:,1]%1*im.shape[0]).astype(int),0,im.shape[0]-1);c=im[yy,xx]
        if m.get('alphaMode')=='BLEND':c=np.tile([.16,.27,.33],(len(p),1))
        c=np.where(c<=.04045,c/12.92,((c+.055)/1.055)**2.4)
        normal=acc(prim['attributes']['NORMAL']);normal=(np.linalg.inv(mat[:3,:3]).T@normal.T).T;normal/=np.maximum(np.linalg.norm(normal,axis=1)[:,None],1e-10)
        parts.append(dict(name=mesh.get('name','part'),p=p,f=f,c=c,n=normal,material=m['name']))
    for child in node.get('children',[]):walk(child,mat)
for i in g['scenes'][g.get('scene',0)]['nodes']:walk(i,np.eye(4))
points=np.concatenate([p['p'] for p in parts]);lo=points.min(0);hi=points.max(0);center=(lo+hi)/2;extent=hi-lo
for part in parts:
    p,f,c=part['p'],part['f'],part['c'];uni,idx,inv=np.unique(p.round(5),axis=0,return_index=True,return_inverse=True);faces=inv[f];target=min(len(f),max(6,round(len(f)*.02)))
    q,ff=uni,faces
    if not len(ff):q,ff=uni,faces
    nearest=np.concatenate([np.argmin(((q[j:j+128,None,:]-p[None,:,:])**2).sum(2),axis=1) for j in range(0,len(q),128)])
    part['q']=q;part['ff']=ff;part['cc']=c[nearest];part['nn']=part['n'][nearest]
variants={};variant_report={}
for variant,grid in [('flight',.002),('parked',.006)]:
    pp=[];nn=[];cc=[]
    for part in parts:
        # Source pieces 181-195 and Rg* are the deployed landing gear, validated in 3-view QA.
        match=re.match(r'Meshpart(\d+)',part['name']);gear=bool(match and 181<=int(match[1])<=195) or part['name'].startswith('Rg')
        if variant=='flight' and gear:continue
        q,ff,norm,col=part['q'],part['ff'],part['nn'],part['cc']
        if variant=='parked' and len(ff)>60:
            reduced,faces=fast_simplification.simplify(q,ff.astype('int32'),target_count=max(16,round(len(ff)*.22)),agg=5)
            nearest=np.concatenate([np.argmin(((reduced[j:j+128,None,:]-q[None,:,:])**2).sum(2),axis=1) for j in range(0,len(reduced),128)])
            q,ff,norm,col=reduced,faces,norm[nearest],col[nearest]
        ids=ff.reshape(-1);pp.append((q[ids]-center)/max(extent));nn.append(norm[ids]);cc.append(col[ids])
    pp=np.concatenate(pp);nn=np.concatenate(nn);cc=np.concatenate(cc)
    clusters,inv=np.unique(np.round(pp/grid).astype('int32'),axis=0,return_inverse=True);counts=np.bincount(inv);means=np.stack([np.bincount(inv,weights=pp[:,j])/counts for j in range(3)],axis=1)
    ids=inv.reshape(-1,3);valid=(ids[:,0]!=ids[:,1])&(ids[:,0]!=ids[:,2])&(ids[:,1]!=ids[:,2]);candidate=np.flatnonzero(valid);_,unique=np.unique(np.sort(ids[valid],axis=1),axis=0,return_index=True);valid[:]=False;valid[candidate[unique]]=True;keep=np.repeat(valid,3);pp=means[inv][keep];nn=nn[keep];cc=cc[keep]
    # Pure rotation: source nose -X to naval nose -Z. One uniform scale retains proportions.
    pp=pp[:,[2,1,0]]*[-1,1,1];nn=nn[:,[2,1,0]]*[-1,1,1];pp[:,1]+=(-.09-pp[:,1].min()) if variant=='parked' else .045
    out=bytearray()
    for xyz,normal,color in zip(pp,nn,cc):out.extend(struct.pack('<hhhbbbBBB',*(np.clip(np.round(xyz*32767),-32767,32767).astype(int)),*(np.clip(np.round(normal*127),-127,127).astype(int)),*(np.clip(np.round(color*255),0,255).astype(int))))
    variants[variant]=base64.b64encode(out).decode();variant_report[variant]={'triangles':len(pp)//3,'vertices':len(pp),'packedBytes':len(out),'grid':grid,'bounds':[pp.min(0).tolist(),pp.max(0).tolist()]}
OUT=ROOT/'src/naval/generated';OUT.mkdir(exist_ok=True)
(OUT/'f18-external.ts').write_text('/** CC-BY-4.0 KOG_THORNS F/A-18E. See public/models/f18-source-notice.txt; scripts/prepare-external-f18.py. */\nexport const externalHornet = '+json.dumps(variants,separators=(',',':'))+' as const;\n',encoding='utf8')
report={'source':g['asset'],'mirror':BASE,'license':'CC-BY-4.0','sourceTriangles':sum(len(p['f']) for p in parts),'sourceParts':len(parts),'sourceSize':extent.tolist(),'runtimeVariants':variant_report,'sourceSha256':hashlib.sha256(buf).hexdigest(),'modifications':['Baked glTF node transforms','Per-source-part quadric simplification plus bounded vertex clustering','Source texture colors baked into linear vertex colors; original normals retained','Source gear parts omitted for flight','Centered, rotated and uniformly normalized; no aspect-ratio distortion']}
(SRC/'conversion-report.json').write_text(json.dumps(report,indent=2),encoding='utf8')
public=ROOT/'public/models';public.mkdir(exist_ok=True)
(public/'f18-source-notice.txt').write_text((SRC/'license.txt').read_text()+"\nAdaptations: "+'; '.join(report['modifications'])+". Conversion: scripts/prepare-external-f18.py.\n",encoding='utf8')
(public/'f18-import-report.json').write_text(json.dumps(report,indent=2),encoding='utf8');print(json.dumps(variant_report,indent=2))


# Derive a thin-surface-safe distant flight LOD after preparing the detailed source.
import runpy
runpy.run_path(str(ROOT/'scripts/prepare-aircraft-lod.py'))
