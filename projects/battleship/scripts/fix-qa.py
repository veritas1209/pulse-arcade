from pathlib import Path
p=Path(__file__).with_name('browser-qa.mjs')
s=p.read_text('utf8').replace("await m.locator('#menu').tap();","await m.locator('#help-toggle').tap();await m.locator('#exit-action').tap();")
p.write_text(s,'utf8')
