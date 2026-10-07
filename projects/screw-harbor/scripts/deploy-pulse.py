"""Deploy this game's verified build into the latest Pulse release. No stored credentials."""
from pathlib import Path
from datetime import datetime, timezone
import getpass, hashlib, json, shlex, time, posixpath, re
import paramiko

PROJECT = Path(__file__).resolve().parents[1]
ROOT = '/home/hajin/services/pulse-arcade'
HOST = '100.119.23.4'
GAME = 'screw-harbor'
PUBLIC = 'https://222.96.173.194'
OUT = PROJECT / 'artifacts' / 'deployment'
OUT.mkdir(parents=True, exist_ok=True)
manifest = json.loads((PROJECT / 'release/pulse/manifest.json').read_text('utf-8'))
entry = json.loads((PROJECT / 'release/pulse/catalog-entry.json').read_text('utf-8'))
package = PROJECT / 'release/pulse' / GAME
assert entry['id'] == GAME and entry['source'] == 'games/' + GAME
assert set(entry['files']) == {f['path'] for f in manifest['files']}
assert set(entry['files']) == {p.relative_to(PROJECT/'dist').as_posix() for p in (PROJECT/'dist').rglob('*') if p.is_file()}, 'Package is stale; refresh it from dist' 
for record in manifest['files']:
    path = (package / record['path']).resolve()
    assert path.is_relative_to(package.resolve())
    assert hashlib.sha256(path.read_bytes()).hexdigest() == record['sha256']
    assert path.read_bytes() == (PROJECT/'dist'/record['path']).read_bytes(), 'Package is stale: '+record['path']

password = getpass.getpass('SSH password: ')
client = paramiko.SSHClient()
client.load_system_host_keys(str(Path.home() / '.ssh/known_hosts'))
client.set_missing_host_key_policy(paramiko.RejectPolicy())
client.connect(HOST, username='hajin', password=password, timeout=15, banner_timeout=15, auth_timeout=15,
               look_for_keys=False, allow_agent=False)
sftp = client.open_sftp()
preview_pid = None
activated = False
baseline = stage = None
stamp = datetime.now(timezone.utc).strftime('%Y%m%d-screw-harbor-%H%M%S')
report = {'release': stamp, 'public': PUBLIC+'/games/'+GAME+'/', 'fileCount': len(manifest['files'])}

def run(command, sudo=False):
    if sudo:
        command = 'sudo -S -p "" ' + command
    stdin, stdout, stderr = client.exec_command(command, timeout=45)
    if sudo:
        stdin.write(password + '\n')
        stdin.flush()
    stdin.channel.shutdown_write()
    result = stdout.read().decode('utf-8', 'replace')
    error = stderr.read().decode('utf-8', 'replace')
    code = stdout.channel.recv_exit_status()
    if code:
        raise RuntimeError(f'Remote command failed ({code}): {error.strip()}')
    return result.strip()

def remote_python(code):
    return run('python3 - <<\'PY\'\n'+code+'\nPY')

def tree_hash(path):
    code = f'''from pathlib import Path
import hashlib,json
root=Path({path!r})
print(json.dumps({{p.relative_to(root).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in root.rglob('*') if p.is_file() and '__pycache__' not in p.parts and p.suffix!='.pyc'}},sort_keys=True))'''
    return json.loads(remote_python(code))

def write_remote(path, data):
    with sftp.file(path, 'wb') as f:
        f.write(data.encode('utf-8'))

def health(port):
    for attempt in range(40):
        try:
            return json.loads(run(f'curl -fsS --max-time 2 http://127.0.0.1:{port}/api/health'))
        except RuntimeError:
            time.sleep(0.25)
    raise RuntimeError(f'Health check failed on {port}')

try:
    baseline = run('readlink -f '+ROOT+'/current')
    assert baseline.startswith(ROOT+'/releases/'), baseline
    base_hashes = tree_hash(baseline)
    report['baseline'] = baseline
    catalog = json.loads(sftp.file(baseline+'/server/games.json').read().decode('utf-8-sig'))
    original_entries = {g['id']:g for g in catalog if g['id'] != GAME}
    assert {'tetris','gomoku','janggi','chess','tidebreak-legion','penguin-extraction'} <= set(original_entries)
    prior = next((g for g in catalog if g['id']==GAME), None)
    new_entry = {**(prior or {}), **entry}
    if prior:
        old_assets = [f for f in prior['files'] if re.fullmatch(r'assets/[\w.-]+\.(js|css)', f)]
        new_entry['files'] = sorted(set(new_entry['files'] + old_assets))
        catalog = [new_entry if g['id']==GAME else g for g in catalog]
    else:
        catalog.append(new_entry)
    assert len({g['id'] for g in catalog}) == len(catalog)
    stage = ROOT+'/releases/'+stamp
    run('test ! -e '+shlex.quote(stage)+' && mkdir '+shlex.quote(stage)+' && cp -a '+shlex.quote(baseline+'/.')+' '+shlex.quote(stage+'/'))
    write_remote(stage+'.baseline', baseline+'\n')
    game_path = stage+'/games/'+GAME
    run('mkdir -p '+shlex.quote(game_path))
    for record in manifest['files']:
        remote = game_path+'/'+record['path']
        run('mkdir -p '+shlex.quote(posixpath.dirname(remote)))
        sftp.put(str(package/record['path']), remote)
    write_remote(stage+'/server/games.json', json.dumps(catalog,ensure_ascii=False,indent=2)+'\n')
    write_remote(stage+'.screw-manifest.json', json.dumps(manifest,indent=2)+'\n')
    staged_hashes = tree_hash(stage)
    for path, digest in base_hashes.items():
        if path != 'server/games.json' and not path.startswith('games/'+GAME+'/'):
            assert staged_hashes.get(path) == digest, 'Existing file changed: '+path
    for record in manifest['files']:
        assert staged_hashes['games/'+GAME+'/'+record['path']] == record['sha256']
    validate = f'''from pathlib import Path
import json
root=Path({stage!r}).resolve()
catalog=json.loads((root/'server/games.json').read_text('utf8'))
for game in catalog:
 source=(root/game['source']).resolve()
 assert source.is_relative_to(root)
 for file in game['files']:
  path=(source/file).resolve()
  assert path.is_relative_to(source) and path.is_file(),(game['id'],file)
print('Catalog validated:',len(catalog))'''
    print(remote_python(validate), flush=True)
    assert not run("ss -Hln 'sport = :18092'"), 'Preview port occupied'
    preview_log = '/tmp/'+stamp+'.log'
    preview_db = '/tmp/'+stamp+'.sqlite3'
    command = ('cd '+shlex.quote(stage)+'; PULSE_NODE='+ROOT+'/node/bin/node nohup '+ROOT+'/venv/bin/python server/app.py '
               '--host 127.0.0.1 --port 18092 --origin http://127.0.0.1:18092 --database '+shlex.quote(preview_db)+
               ' </dev/null >'+shlex.quote(preview_log)+' 2>&1 & echo $!')
    preview_pid = int(run(command))
    assert health(18092)['ok']
    probe = f'''import urllib.request,hashlib,json
manifest=json.loads({json.dumps(manifest)!r})
for record in manifest['files']:
 url='http://127.0.0.1:18092/games/{GAME}/'+record['path']
 with urllib.request.urlopen(url) as response:
  assert response.status==200
  assert hashlib.sha256(response.read()).hexdigest()==record['sha256']
print('Staging HTTP:',len(manifest['files']),'files verified')'''
    print(remote_python(probe), flush=True)
    run('kill -TERM '+str(preview_pid))
    preview_pid = None
    assert run('readlink -f '+ROOT+'/current') == baseline, 'Another release was deployed'
    assert tree_hash(baseline) == base_hashes, 'Baseline changed during staging'
    connections = run("ss -Hnt state established '( sport = :18080 )'")
    if connections:
        raise RuntimeError('Portal has active connections; release prepared but not activated')
    link = ROOT+'/current-'+stamp
    run('test ! -e '+shlex.quote(link)+' && ln -s '+shlex.quote(stage)+' '+shlex.quote(link)+' && mv -Tf '+shlex.quote(link)+' '+ROOT+'/current')
    activated = True
    run('systemctl restart pulse-arcade', sudo=True)
    assert run('systemctl is-active pulse-arcade') == 'active'
    assert health(18080)['ok']
    live = json.loads(run('curl -fsS http://127.0.0.1:18080/api/games'))['games']
    assert {g['id'] for g in live} == {g['id'] for g in catalog}
    live_probe = probe.replace(':18092/', ':18080/')
    print(remote_python(live_probe).replace('Staging HTTP','Production HTTP'),flush=True)
    report['status']='deployed'
    report['gameIds']=[g['id'] for g in catalog]
    report['preservedFileCount']=sum(p!='server/games.json' and not p.startswith('games/'+GAME+'/') for p in base_hashes)
    report['completedAt']=datetime.now(timezone.utc).isoformat()
    (OUT/'deployment.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n','utf8')
    print('Published: '+report['public'],flush=True)
except Exception as exc:
    report['error']=str(exc)
    report['status']='failed'
    if activated and stage and baseline:
        if run('readlink -f '+ROOT+'/current') == stage:
            link=ROOT+'/rollback-'+stamp
            run('ln -s '+shlex.quote(baseline)+' '+shlex.quote(link)+' && mv -Tf '+shlex.quote(link)+' '+ROOT+'/current')
            run('systemctl restart pulse-arcade',sudo=True)
            report['rolledBack']=bool(health(18080).get('ok'))
    (OUT/'deployment.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n','utf8')
    raise
finally:
    if preview_pid:
        try: run('kill -TERM '+str(preview_pid))
        except Exception: pass
    sftp.close()
    client.close()
    password=None
