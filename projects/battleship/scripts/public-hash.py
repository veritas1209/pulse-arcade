from pathlib import Path
import json,hashlib,urllib.request,sys
root=Path(sys.argv[1]).resolve() if len(sys.argv)>1 else Path(__file__).resolve().parents[1]
assert root.is_relative_to(Path('C:/Users/hajin/IT_Projects').resolve())
manifest=json.loads((root/'release/pulse/manifest.json').read_text('utf-8-sig'))
game=manifest['id']
assert game in ('battleship','screw-harbor')
base='https://222.96.173.194'
records=[]
for f in manifest['files']:
 with urllib.request.urlopen(base+'/games/'+game+'/'+f['path'],timeout=15) as r:
  assert r.status==200
  assert hashlib.sha256(r.read()).hexdigest()==f['sha256'],f['path']
  records.append({'path':f['path'],'status':r.status,'type':r.headers.get('Content-Type')})
with urllib.request.urlopen(base+'/api/games',timeout=15) as r:
 games=json.load(r)['games']
assert len(games)==8 and {'battleship','screw-harbor','tetris','gomoku','janggi','chess','tidebreak-legion','penguin-extraction'}=={g['id'] for g in games}
(root/'artifacts/public').mkdir(parents=True,exist_ok=True)
(root/'artifacts/public/asset-hashes.json').write_text(json.dumps({'verified':records,'gameIds':[g['id'] for g in games]},indent=2),'utf8')
print('Public HTTPS:',game,len(records),'asset hashes and all 8 catalog entries PASS')
