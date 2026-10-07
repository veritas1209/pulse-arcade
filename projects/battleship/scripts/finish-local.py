from pathlib import Path
import json
root=Path(__file__).resolve().parents[1]
old=root.parent/'screw-harbor'
p=root/'scripts/inspect-threejs-canvas.mjs'
s=p.read_text('utf8').replace("channel: 'chromium'","channel: 'chrome'")
p.write_text(s,'utf8')
p=root/'package.json'
data=json.loads(p.read_text('utf8'))
data['dependencies'].pop('lil-gui',None)
data['scripts']['test']='playwright test tests/battle-visual.spec.ts tests/rules.spec.ts'
data['scripts']['verify:visual']='playwright test tests/battle-visual.spec.ts'
data['scripts']['prepare:pulse']='node scripts/prepare-pulse.mjs'
data['scripts']['test:server']='python -m unittest discover -s tests -p test_rooms.py'
p.write_text(json.dumps(data,indent=2)+'\n','utf8')
p=root/'src/main.ts'
s=p.read_text('utf8').replace("const value=document.createElement('b');value.textContent=s.sunk?", "const value=document.createElement('strong');value.textContent=s.sunk?").replace('row.append(text,track,value)','row.append(text,value,track)')
old_log="el('battle-log').textContent=`${shot.by===state.you?'공격':'적 공격'} ${label(shot)} · ${shot.sunk?`${SHIPS.find(s=>s.id===shot.sunk)?.label} 격침`:shot.hit?'명중':'빗나감'}`;"
new_log="const entry=document.createElement('li'),stamp=document.createElement('time'),message=document.createElement('span');stamp.textContent=label(shot);message.textContent=`${shot.by===state.you?'공격':'적 공격'} · ${shot.sunk?`${SHIPS.find(s=>s.id===shot.sunk)?.label} 격침`:shot.hit?'명중':'빗나감'}`;entry.append(stamp,message);el('battle-log').prepend(entry);while(el('battle-log').children.length>5)el('battle-log').lastElementChild!.remove();"
assert old_log in s
p.write_text(s.replace(old_log,new_log),'utf8')
p=root/'scripts/browser-qa.mjs'
s=p.read_text('utf8').replace("function monitor(page){", "function monitor(page){page.on('websocket',ws=>ws.on('framereceived',frame=>{try{const msg=JSON.parse(frame.payload);if(msg.type==='state'){report.privateSnapshots=(report.privateSnapshots||0)+1;const allowed=['phase','you','turn','winner','own','revealed','outgoing','incoming','ready','connected','revision','lastShot'];if(Object.keys(msg.state).some(k=>!allowed.includes(k))||msg.state.revealed.some(s=>!s.sunk))report.errors.push('Unredacted online snapshot');}}catch{}}));")
p.write_text(s,'utf8')
print('Local scripts and UI wiring finalized.')
