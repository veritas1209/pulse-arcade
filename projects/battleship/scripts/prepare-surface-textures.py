from pathlib import Path
import urllib.request, json, hashlib
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'public/materials'; CACHE=ROOT/'artifacts/texture-sources'
OUT.mkdir(parents=True,exist_ok=True); CACHE.mkdir(parents=True,exist_ok=True)
ledger={'license':'CC0-1.0','source':'https://polyhaven.com/a/coast_land_rocks_01','licenseUrl':'https://polyhaven.com/license','authors':['Rob Tuytel','Rico Cilliers'],'sourceMaps':[],'runtime':[]}
# Use the source photograph and actual OpenGL normals. Conversion is offline only.
for suffix,semantic in [('diff','color'),('nor_gl','normal'),('rough','roughness')]:
    url=f'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/coast_land_rocks_01/coast_land_rocks_01_{suffix}_1k.jpg'
    source=CACHE/f'coast_land_rocks_01_{suffix}_1k.jpg'
    if not source.exists():
        req=urllib.request.Request(url,headers={'User-Agent':'BattleshipTexturePreparation/1.0'})
        with urllib.request.urlopen(req,timeout=45) as response: source.write_bytes(response.read())
    im=Image.open(source).convert('RGB')
    if semantic=='color':
        a=np.asarray(im,dtype=np.float32)/255
        lum=a@np.array([.2126,.7152,.0722])
        # Neutral detail multiplier: terrain vertex colors control sand/vegetation zones.
        a=np.clip(.47+.46*lum[...,None]+.12*a,0,1)
        im=Image.fromarray((a*255).astype('uint8'))
    target=OUT/f'coast-v2-{semantic}.webp'
    im.save(target,quality=86 if semantic=='color' else 93,method=6)
    ledger['sourceMaps'].append({'url':url,'sha256':hashlib.sha256(source.read_bytes()).hexdigest()})
    ledger['runtime'].append({'file':target.name,'dimensions':list(im.size),'bytes':target.stat().st_size,'colorSpace':'sRGB' if semantic=='color' else 'NoColorSpace'})
# Eight role tiles in a shared 4x2 atlas. Each tile has a 12px wrap gutter.
N=512; G=12; S=N-G*2; rng=np.random.default_rng(49127)
atlas={k:Image.new('RGB',(N*4,N*2)) for k in ('color','normal','roughness')}
y,x=np.mgrid[:S,:S]; fine=rng.normal(0,1,(S,S))
for tile in range(8):
    coarse=np.asarray(Image.fromarray(rng.integers(80,176,(20,20),dtype='uint8')).resize((S,S),Image.Resampling.BICUBIC),dtype=float)-128
    h=fine*.5; tone=236+coarse*.16+fine*.6; rough=np.full((S,S),190.)
    if tile in (0,5,6,7):
        # Rolled/welded steel with subtle paint chalking; all seams stay tileable.
        seam=(x<2)|(x>S-3)|(y<2)|(y>S-3)|((y>S//2-1)&(y<S//2+1))
        h-=seam*9; tone-=seam*38
        streak=np.asarray(Image.fromarray(rng.integers(0,32,(12,60),dtype='uint8')).resize((S,S),Image.Resampling.BICUBIC),dtype=float)
        tone-=streak*.24; rough+=coarse*.3
        if tile==6: rough-=24
        if tile==7: tone-=14;rough+=26
    elif tile==1:
        # Non-skid deck grit, tie-down circles, and broad maintenance seams.
        h+=rng.normal(0,1.2,(S,S)); tone+=fine*3; rough[:]=237+fine*5
        seam=(x<2)|(y<2);tone-=seam*24;h-=seam*6
        for px in (S*.25,S*.75):
            for py in (S*.25,S*.75):
                d=np.hypot(x-px,y-py);ring=(d>6)&(d<9);tone-=ring*65;h-=ring*6
    elif tile==2:
        # Teak planks use vertex color for timber hue; mild grain follows ship length.
        grain=np.sin(x*.24+np.sin(y*.026)*.3)+np.sin(x*.83+y*.004)*.28
        seams=x%61<2;tone+=grain*9-seams*55;h+=grain*.8-seams*8;rough[:]=224
        stagger=((y+(x//61%2)*244)%S)<2;tone-=stagger*25
    elif tile==3:
        tone=223+coarse*.25+fine*1.4+np.sin(y*2)*2;h+=np.sin(y*2)*.4;rough[:]=127+coarse*.8
    else:
        # Glass remains smooth. Real window shape comes from authored ship geometry.
        tone=242+np.sin(x/S*np.pi*2)*5+fine*.15;rough[:]=62;h[:]=0
    color=np.repeat(np.clip(tone,0,255)[...,None],3,axis=2)
    if tile in (0,6,7):
        # Sparse, restrained exposed primer; no high-contrast decorative noise.
        wear=(coarse>27)&((y%244)<20)
        color[...,0]-=wear*4;color[...,1]-=wear*16;color[...,2]-=wear*22;rough+=wear*20
    dx=(np.roll(h,-1,1)-np.roll(h,1,1))*.09;dy=(np.roll(h,-1,0)-np.roll(h,1,0))*.09
    normal=np.stack([-dx,dy,np.ones_like(dx)],axis=2);normal/=np.linalg.norm(normal,axis=2)[...,None];normal=(normal*.5+.5)*255
    ims={'color':color,'normal':normal,'roughness':np.repeat(np.clip(rough,0,255)[...,None],3,axis=2)}
    for semantic,array in ims.items():
        padded=np.pad(np.clip(array,0,255).astype('uint8'),((G,G),(G,G),(0,0)),mode='wrap')
        atlas[semantic].paste(Image.fromarray(padded),((tile%4)*N,(tile//4)*N))
for semantic,im in atlas.items():
    target=OUT/f'naval-v2-{semantic}.webp';im.save(target,quality=90 if semantic=='color' else 95,method=6)
    ledger['runtime'].append({'file':target.name,'dimensions':list(im.size),'bytes':target.stat().st_size,'colorSpace':'sRGB' if semantic=='color' else 'NoColorSpace'})
ledger['atlas']={'roles':['painted steel','non-skid flight/deck','teak deck','bare machinery','glass','white trim','anti-fouling','interior steel'],'tileSize':512,'gutter':12,'source':'Authored deterministic surface process in scripts/prepare-surface-textures.py','seed':49127}
ledger['estimatedRGBA8MipMemoryMiB']=round(sum(w*h*4*4/3 for w,h in (i['dimensions'] for i in ledger['runtime']))/(1024*1024),2)
(OUT/'surface-v2-sources.json').write_text(json.dumps(ledger,indent=2)+'\n')
print(json.dumps({'runtime':ledger['runtime'],'estimatedRGBA8MipMemoryMiB':ledger['estimatedRGBA8MipMemoryMiB']},indent=2))
