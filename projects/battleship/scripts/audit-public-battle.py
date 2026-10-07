from pathlib import Path
import paramiko,getpass,hashlib
c=paramiko.SSHClient();c.load_system_host_keys(str(Path.home()/'.ssh/known_hosts'));c.set_missing_host_key_policy(paramiko.RejectPolicy());c.connect('100.119.23.4',username='hajin',password=getpass.getpass('SSH password: '),look_for_keys=False,allow_agent=False,timeout=15)
f=c.open_sftp();root='/home/hajin/services/pulse-arcade/current'
a=f.file(root+'/server/app.py').read().decode();b=f.file(root+'/server/battleship_rooms.py').read();print('MODULE_HASH',hashlib.sha256(b).hexdigest());print('LOCAL_HASH',hashlib.sha256(Path('server/battleship_rooms.py').read_bytes()).hexdigest())
lines=a.splitlines()
for i,l in enumerate(lines):
 if 'battleship' in l.lower():print('APP',i+1,'\n'.join(lines[max(0,i-3):i+5]))
for cmd in ['systemctl show pulse-arcade --property=ExecStart,WorkingDirectory,MainPID','readlink -f /home/hajin/services/pulse-arcade/current','journalctl -u pulse-arcade --since "15 minutes ago" --no-pager -n 65']:
 _,o,e=c.exec_command(cmd);print(__import__('re').sub(r'token=[A-Za-z0-9_-]+','token=REDACTED',o.read().decode()));print(e.read().decode())
c.close()
