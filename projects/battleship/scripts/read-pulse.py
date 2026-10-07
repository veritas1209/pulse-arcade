from pathlib import Path
import getpass,json,paramiko
out=Path(__file__).resolve().parents[1]/'integration'/'baseline'
out.mkdir(parents=True,exist_ok=True)
c=paramiko.SSHClient()
c.load_system_host_keys(str(Path.home()/'.ssh/known_hosts'))
c.set_missing_host_key_policy(paramiko.RejectPolicy())
c.connect('100.119.23.4',username='hajin',password=getpass.getpass('SSH password: '),look_for_keys=False,allow_agent=False,timeout=15)
_,stdout,_=c.exec_command('readlink -f /home/hajin/services/pulse-arcade/current')
root=stdout.read().decode().strip()
assert root.startswith('/home/hajin/services/pulse-arcade/releases/')
s=c.open_sftp()
for name in ['server/app.py','server/games.json','server/board_rooms.py']:
    target=out/name
    target.parent.mkdir(parents=True,exist_ok=True)
    target.write_bytes(s.file(root+'/'+name).read())
(out/'release.txt').write_text(root)
print(json.dumps({'baseline':root,'files':['server/app.py','server/games.json','server/board_rooms.py']}))
s.close();c.close()
