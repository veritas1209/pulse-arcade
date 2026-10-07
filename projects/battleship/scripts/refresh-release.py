"""Refresh an existing local static release package without deleting older assets."""
from pathlib import Path
from datetime import datetime, timezone
import hashlib, json, shutil, sys

project = Path(sys.argv[1]).resolve() if len(sys.argv)>1 else Path(__file__).resolve().parents[1]
workspace = Path('C:/Users/hajin/IT_Projects').resolve()
assert project.is_relative_to(workspace) and project.is_dir()
release = project/'release/pulse'
catalog_path = release/'catalog-entry.json'
manifest_path = release/'manifest.json'
catalog = json.loads(catalog_path.read_text('utf-8-sig'))
game = catalog['id']
assert game in ('battleship','screw-harbor')
dist = (project/'dist').resolve()
package = (release/game).resolve()
assert dist.is_relative_to(project) and package.is_relative_to(project)
backup = project/'artifacts/release-packages'/datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')
backup.mkdir(parents=True, exist_ok=False)
for file in (catalog_path, manifest_path): shutil.copy2(file, backup/file.name)
allowed={'.html','.js','.css','.json','.webp','.png','.jpg','.jpeg','.svg','.ico','.woff','.woff2','.mp3','.ogg','.wav','.glb','.gltf','.bin','.txt'}
records=[]
for file in sorted(dist.rglob('*')):
 if not file.is_file(): continue
 rel=file.relative_to(dist)
 assert not file.is_symlink() and not any(part.startswith('.') for part in rel.parts)
 assert file.suffix.lower() in allowed, str(rel)
 target=package/rel
 assert target.resolve().is_relative_to(package)
 target.parent.mkdir(parents=True,exist_ok=True)
 shutil.copy2(file,target)
 data=file.read_bytes()
 assert target.read_bytes()==data
 records.append({'path':rel.as_posix(),'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()})
assert any(record['path']=='index.html' for record in records)
catalog['files']=[record['path'] for record in records]
if game=='battleship': catalog['description']='정찰하고 함대를 지휘하세요.'
catalog_path.write_text(json.dumps(catalog,ensure_ascii=False,indent=2)+'\n','utf8')
manifest_path.write_text(json.dumps({'id':game,'source':'dist','files':records},indent=2)+'\n','utf8')
print('Verified local package:',game,len(records),'files')
