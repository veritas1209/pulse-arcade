"""Apply the conversion cleanup to existing packed Iowa data only."""
from pathlib import Path
import base64, json, runpy, hashlib

root = Path(__file__).resolve().parents[1]
path = root/'src/naval/generated/fleet-external.ts'
source = path.read_text(encoding='utf8')
start = source.index(' = ') + 3
data = json.loads(source[start:].strip().rstrip(';'))
backup = root/'artifacts/iowa-deck-fix/fleet-before-cleanup.ts'
backup.parent.mkdir(parents=True, exist_ok=True)
if not backup.exists():
    backup.write_text(source, encoding='utf8')
other = {kind: hashlib.sha256(json.dumps(model, sort_keys=True).encode()).hexdigest()
         for kind, model in data.items() if kind != 'battleship'}
clean = runpy.run_path(str(root/'scripts/iowa-surface-cleanup.py'))['clean_iowa_surfaces']
model, report = data['battleship'], {}
for variant in ('high', 'medium', 'low'):
    packed, report[variant] = clean(base64.b64decode(model[variant]), model['parts'])
    model[variant] = base64.b64encode(packed).decode()
assert other == {kind: hashlib.sha256(json.dumps(value, sort_keys=True).encode()).hexdigest()
                 for kind, value in data.items() if kind != 'battleship'}
path.write_text(source[:start]+json.dumps(data, separators=(',', ':'))+';\n', encoding='utf8')
(root/'artifacts/iowa-deck-fix/cleanup-report.json').write_text(json.dumps(report, indent=2), encoding='utf8')
print(json.dumps(report))
