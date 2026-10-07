from pathlib import Path
import io, math
import numpy as np
from PIL import Image

def build_atlas(root, kind, g, buf):
    materials=g.get('materials',[])
    textured=[i for i,m in enumerate(materials) if 'baseColorTexture' in m.get('pbrMetallicRoughness',{})]
    tile_size=1024 if kind in ('carrier','destroyer') else 768
    columns=math.ceil(math.sqrt(max(1,len(textured))))
    rows=math.ceil(max(1,len(textured))/columns)
    width=columns*tile_size
    height=rows*tile_size
    color=Image.new('RGBA' if kind=='battleship' else 'RGB',(width,height),(190,195,198,255) if kind=='battleship' else (190,195,198))
    pbr=Image.new('RGB',(width,height),(255,166,0))
    normal=Image.new('RGB',(width,height),(128,128,255))
    material_tiles={}
    def image(index,mode='RGB'):
        im=g['images'][g['textures'][index]['source']]
        v=g['bufferViews'][im['bufferView']]
        return Image.open(io.BytesIO(buf[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']])).convert(mode)
    def paste_padded(atlas,tile,index):
        padding=8
        tile=tile.resize((tile_size-padding*2,tile_size-padding*2),Image.Resampling.LANCZOS)
        expanded=Image.fromarray(np.pad(np.asarray(tile),((padding,padding),(padding,padding),(0,0)),mode='edge'))
        atlas.paste(expanded,((index%columns)*tile_size,(index//columns)*tile_size))
    for index,material_id in enumerate(textured):
        material_tiles[material_id]=index
        m=materials[material_id]['pbrMetallicRoughness']
        paste_padded(color,image(m['baseColorTexture']['index'],'RGBA' if kind=='battleship' else 'RGB'),index)
        rough=m.get('roughnessFactor',1.0);metal=m.get('metallicFactor',1.0)
        if 'metallicRoughnessTexture' in m:
            data=np.array(image(m['metallicRoughnessTexture']['index']),copy=True)
            data[:,:,1]=np.clip(data[:,:,1]*rough,0,255)
            data[:,:,2]=np.clip(data[:,:,2]*metal,0,255)
            mr=Image.fromarray(data)
        else:
            mr=Image.new('RGB',(16,16),(255,round(255*rough),round(255*metal)))
        paste_padded(pbr,mr,index)
        normal_info=materials[material_id].get('normalTexture')
        # One original base UV per corner: do not reinterpret a distinct normal UV set.
        if normal_info and normal_info.get('texCoord',0)==m['baseColorTexture'].get('texCoord',0):
            normal_image=image(normal_info['index'])
            normal_scale=normal_info.get('scale',1.0)
            if normal_scale!=1.0:
                data=np.asarray(normal_image,dtype=float)/127.5-1.0
                data[:,:,:2]*=normal_scale
                data/=np.maximum(np.linalg.norm(data,axis=2,keepdims=True),1e-10)
                normal_image=Image.fromarray(np.clip((data+1)*127.5,0,255).astype('uint8'))
            paste_padded(normal,normal_image,index)
    folder=root/'public/materials';folder.mkdir(parents=True,exist_ok=True)
    color_path=f'materials/{kind}-source-color.webp';pbr_path=f'materials/{kind}-source-pbr.webp'
    normal_path=f'materials/{kind}-source-normal.webp'
    normal.save(root/'public'/normal_path,lossless=True,method=6)
    color.save(root/'public'/color_path,quality=95,method=6)
    pbr.save(root/'public'/pbr_path,lossless=True,method=6)
    return material_tiles,dict(columns=columns,rows=rows,tileSize=tile_size,width=width,height=height,padding=8,colorPath=color_path,pbrPath=pbr_path,normalPath=normal_path)
