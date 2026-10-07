# Pulse Arcade 새 게임 개발·연결 가이드

운영 서버 확인일: **2026-10-07**. 다른 개발 세션에 이 문서를 전달하면 됩니다. 현재 운영에는 8개 게임이 등록되어 있습니다. 이 문서는 연결 방법을 정리한 인수인계 문서이며, 새 게임 등록이나 운영 서비스 변경을 자동 실행하지 않습니다.

## 1. 먼저 알아둘 운영 환경

| 항목 | 확인된 값 |
| --- | --- |
| 공개 포털 / 공식 Origin | `https://222.96.173.194` |
| 관리용 SSH | `ssh hajin@100.119.23.4` |
| 운영 호스트 | Jetson Orin Nano / Ubuntu 22.04 / ARM64 |
| 공유기 연결 | 외부 TCP 443 → Jetson `192.168.0.15:9443` |
| nginx 설정 | `/etc/nginx/conf.d/penguin-https.conf` |
| 포털 서비스 | `pulse-arcade.service` |
| 포털 HTTP | `http://127.0.0.1:18080` |
| 포털 배포 루트 | `/home/hajin/services/pulse-arcade` |
| 포털 실행 경로 | `/home/hajin/services/pulse-arcade/current` |
| 확인 당시 포털 릴리스 | `releases/20261004-battleship-174954` |
| Python 환경 | `/home/hajin/services/pulse-arcade/venv/bin/python` |
| Node 실행 파일 | `/home/hajin/services/pulse-arcade/node/bin/node` |
| 포털 기록 DB | `/home/hajin/.local/share/pulse-arcade/scores.sqlite3` |
| Bluecap 서비스 / HTTP | `bluecap-extraction.service` / `127.0.0.1:18090` |
| Bluecap 배포 루트 | `/home/hajin/services/bluecap-extraction` |
| 로컬 기존 포털 프로젝트 | `C:\Users\hajin\IT_Projects\tetris` |

**현재 운영본을 기준으로 작업하세요.** 로컬 `tetris/server/app.py`와 운영본에 차이가 있습니다. 로컬 전체를 그대로 덮어쓰면 기존 게임·프록시 변경이 되돌아갈 수 있습니다. 위 릴리스 이름, IP, 포트는 다음 작업 시작 시 다시 확인합니다.

현재 공개 경로:

```text
브라우저 → https://222.96.173.194 → 공유기 → nginx :9443
  /                                  → Pulse Arcade :18080 → portal/
  /api/games                         → Pulse Arcade :18080 → 게임 목록
  /games/tetris/                     → Pulse Arcade :18080 → 등록된 정적 파일
  /games/gomoku/                     → Pulse Arcade :18080
  /games/janggi/                     → Pulse Arcade :18080
  /games/chess/                      → Pulse Arcade :18080
  /games/tidebreak-legion/            → Pulse Arcade :18080
  /games/screw-harbor/                → Pulse Arcade :18080
  /games/battleship/                  → Pulse Arcade :18080
  /games/penguin-extraction/          → Bluecap :18090 직접 프록시
```

Tailscale은 관리용 SSH 경로로 사용할 수 있습니다. 예전 `https://hajin-desktop.tailfb939b.ts.net:10000/`를 새 게임의 공식 URL로 설정하거나 Funnel을 다시 활성화하지 마세요. 관리 연결 시 원래 Tailscale 프로필을 기록하고, 필요하면 기존에 승인된 `hajincreeper` 프로필로 전환한 뒤 작업 종료 시 원래 프로필로 복원합니다. SSH 비밀번호·API 키·개인키는 문서나 저장소에 넣지 않습니다.

## 2. 새 게임의 연결 방식 선택

### A. 브라우저에서 실행되는 정적 게임 — 기본 권장

Canvas / Three.js / React / 일반 JS 등으로 개발하고, 빌드 결과물을 `games/<game-id>/` 아래에 넣습니다. `server/games.json`에 파일을 등록하면 기존 포털 서버가 제공합니다. 추가 공유기 포트포워딩이나 nginx 수정은 필요 없습니다.

### B. 전용 백엔드가 필요한 게임

실시간 멀티플레이, 계정·인벤토리, 서버 판정 등이 필요하면 별도 서비스와 loopback 포트를 사용합니다. nginx에서 `/games/<game-id>/`만 해당 서비스로 전달하고, 포털 목록에도 등록합니다. Bluecap의 현재 공개 연결 방식이 이 경우입니다. Bluecap의 서비스·DB·18090 포트를 새 게임에 재사용하지 않습니다.

포털 등록만으로 계정 공유, 랭킹, 온라인 방, 게임 상태 저장이 구현되지는 않습니다. 필요한 기능은 별도로 연결합니다.

## 3. 프로젝트 구조와 수정할 파일

```text
Pulse Arcade 프로젝트 루트/
├─ portal/
│  ├─ index.html            # 허브 페이지
│  ├─ portal.js             # /api/games에서 카드·검색·장르 필터 생성
│  └─ portal.css
├─ server/
│  ├─ app.py                # aiohttp 서버·정적 파일·랭킹 API
│  ├─ games.json            # 새 게임 등록 위치
│  ├─ duel.py               # 테트리스 대전
│  ├─ board_rooms.py        # 기존 온라인 보드게임
│  ├─ board-worker.cjs      # 보드게임 규칙 실행
│  ├─ penguin_proxy.py      # 포털 내부 Penguin 프록시; 공개 nginx는 직접 연결
│  ├─ requirements.txt
│  └─ pulse-arcade.service
└─ games/
   ├─ gomoku/ · janggi/ · chess/ · tidebreak-legion/
   └─ <game-id>/
      ├─ index.html
      ├─ assets/            # 빌드된 JS·CSS·모델·텍스처·음원
      ├─ cover.webp         # 포털용 썸네일
      └─ licenses/         # 필요한 라이선스 고지
```

게임 ID는 중복 없는 영문 소문자·숫자·하이픈으로 정합니다. 이 문서의 `new-game`은 예시 ID이므로 실제 ID로 일괄 교체하세요.

개발 원본은 별도 프로젝트에 보관해도 됩니다. 포털의 `games/new-game/`에는 실행에 필요한 빌드 결과물만 넣으세요. `node_modules`, `.env`, DB, 개발 서버, 테스트 리포트는 공개 파일 목록에서 제외합니다.

## 4. 개발 때부터 맞춰야 하는 규칙

- 게임 URL은 `/games/new-game/`이며 마지막 `/`를 유지합니다.
- 자산 URL은 `./assets/...` 또는 `/games/new-game/assets/...`로 만듭니다. `/assets/...`는 포털 루트를 가리켜 404가 납니다.
- Vite라면 `base: '/games/new-game/'` 또는 상대 경로용 `base: './'`를 사용하고 최종 배포 경로에서 검증합니다. 웹 접근 경로와 빌드 파일 위치를 맞추세요.
- 게임용 API·WebSocket은 같은 공개 Origin을 사용합니다. `localhost`, Tailscale 주소, Jetson 내부 포트를 클라이언트에 하드코딩하지 않습니다.
- SPA는 우선 hash 라우팅을 사용합니다. 기본 정적 서버는 임의 URL을 `index.html`로 돌려주는 SPA fallback이 없습니다.
- 서버 실행 코드는 Linux ARM64에서 설치·실행할 수 있어야 합니다. Windows용 네이티브 패키지를 Jetson에 복사하지 않습니다.
- 소리는 클릭·키 입력 후 AudioContext를 활성화합니다. 에셋 로딩 화면은 필수 파일 준비 후 해제하고, 실패 시 재시도 UI를 제공합니다.
- 탭이 숨겨졌을 때 렌더 부하를 줄이고, 게임 종료·허브 복귀 시 이벤트·타이머·WebGL 리소스를 정리합니다.
- 이미지·음원·모델은 압축하고, 렌더 부하와 네트워크 전송량을 따로 측정합니다.

현재 포털의 CSP는 다음과 같습니다.

```text
default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';
img-src 'self' data:; connect-src 'self'; worker-src 'self' blob:;
object-src 'none'; base-uri 'none'; frame-ancestors 'none'
```

따라서 인라인 JS, 인라인 클릭 핸들러, `eval`, 런타임 CDN, 외부 폰트·음원 요청은 기본 구성에서 동작하지 않습니다. JS는 외부 파일로 분리하고 의존성·자산은 자체 호스팅합니다. iframe으로 게임을 넣는 구조도 현재 정책과 맞지 않습니다. 전용 서비스는 자체 응답에서도 필요한 보안 헤더를 제공해야 합니다.

## 5. 정적 게임 등록

최신 `server/games.json`의 기존 배열에 아래 항목을 **추가**합니다. 기존 8개 게임을 유지하세요.

```json
{
  "id": "new-game",
  "title": "NEW GAME",
  "subtitle": "게임 부제",
  "description": "한두 문장으로 게임 소개",
  "genre": "액션",
  "players": "1인",
  "controls": "키보드 · 마우스 · 터치",
  "href": "/games/new-game/",
  "source": "games/new-game",
  "files": [
    "index.html",
    "assets/game.js",
    "assets/style.css",
    "cover.webp"
  ],
  "search_terms": ["새 게임", "new game"],
  "leaderboard": false,
  "cover": "/games/new-game/cover.webp"
}
```

**`files`는 실제 공개 허용 목록입니다.** 폴더만 복사하면 파일이 공개되지 않습니다. 모든 import 청크, CSS, 텍스처, GLB, 음원, Worker, 썸네일을 경로별로 등록해야 합니다. 상대 경로는 `source` 폴더 기준이며 와일드카드는 지원하지 않습니다. 위 JS·CSS 이름은 예시입니다. 해시가 붙는 빌드라면 실제 파일명으로 교체하세요.

배포 파일만 있는 `games/new-game/`에서 목록을 자동 생성하는 예:

```python
from pathlib import Path
import json

root = Path('.')  # 포털 작업본 루트에서 실행
catalog_path = root / 'server/games.json'
catalog = json.loads(catalog_path.read_text(encoding='utf-8-sig'))
game = next(g for g in catalog if g['id'] == 'new-game')
folder = root / game['source']
game['files'] = sorted(p.relative_to(folder).as_posix()
                       for p in folder.rglob('*') if p.is_file())
catalog_path.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + '\n',
                        encoding='utf-8')
```

생성한 목록에 개발 원본·비밀 파일이 없는지 확인합니다. 새 장르는 `portal.js`에서 동적으로 필터에 추가되므로 보통 포털 HTML을 별도로 고칠 필요가 없습니다.

`online: "board"`는 기존 보드게임 서버를 자동 연결하는 값입니다. 임의 게임에 붙이면 안 됩니다. 온라인 링크가 필요하면 실제 구현한 경로를 `multiplayer_href`, 버튼 문구를 `multiplayer_label`로 지정하세요.

## 6. 로컬 통합 검증

최신 포털 작업본 루트에서 실행합니다. 기존 운영 DB 대신 임시 개발 DB를 사용하세요.

```powershell
python -m pip install -r server/requirements.txt
python server/app.py --host 127.0.0.1 --port 19000 --origin http://127.0.0.1:19000 --database ./dev-scores.sqlite3
```

확인할 URL:

- `http://127.0.0.1:19000/` — 새 카드·검색·장르 필터
- `http://127.0.0.1:19000/api/games` — 새 항목
- `http://127.0.0.1:19000/games/new-game/` — 실제 플레이

콘솔 오류, 404, CSP 차단, 파일 MIME 오류가 없는지 확인합니다. 데스크톱·작은 화면, 시작·종료·재시작·허브 복귀, 첫 소리 재생, 로딩 실패를 점검합니다. 전용 백엔드 방식이면 로컬에서도 해당 nginx/프록시 경로를 재현하거나 개발 프록시를 구성해야 합니다.

## 7. 현재 운영본 확보와 배포 준비

로컬 문서만 보고 과거 릴리스를 배포하지 않습니다. SSH 접속 후 현재 상태를 먼저 읽습니다.

```bash
readlink -f /home/hajin/services/pulse-arcade/current
systemctl cat pulse-arcade
cat /etc/nginx/conf.d/penguin-https.conf
curl -fsS http://127.0.0.1:18080/api/health
```

최신 포털 실행본을 로컬 작업본으로 가져오는 방법:

```bash
# Jetson에서 실행. 비밀·DB가 아닌 포털 실행 파일만 묶습니다.
tar --exclude='__pycache__' --exclude='*.pyc' \
  -czf /tmp/pulse-arcade-source-handoff.tar.gz \
  -C /home/hajin/services/pulse-arcade/current .
```

```powershell
# Windows에서 실행. 새 작업 폴더에 풀어 사용하세요.
scp hajin@100.119.23.4:/tmp/pulse-arcade-source-handoff.tar.gz ./pulse-arcade-source-handoff.tar.gz
```

운영 실행본에는 개발 원본이나 테스트가 모두 들어 있지는 않습니다. 새 게임 개발 원본과 테스트는 별도로 유지합니다. 운영본을 받을 때 릴리스 경로도 기록하고, 배포 직전에 `current`가 바뀌었으면 변경을 다시 합칩니다.

정적 게임만 추가할 때는 전체 구버전 포털을 배포하기보다 **현재 운영본을 새 릴리스 폴더에 복제한 뒤 새 게임 파일과 합친 목록만 추가**하는 방식이 안전합니다.

## 8. 정적 게임 배포 명령

아래는 정적 게임용 절차입니다. `RELEASE`와 `new-game`을 실제 값으로 교체하고, 다른 세션의 배포와 동시에 실행하지 마세요. 준비 단계는 운영 `current`를 바꾸지 않습니다.

### 8.1 새 릴리스 준비 — Jetson

```bash
set -eu
SERVICE_ROOT=/home/hajin/services/pulse-arcade
RELEASE=YYYYMMDD-new-game-01
STAGE="$SERVICE_ROOT/releases/$RELEASE"
BASELINE=$(readlink -f "$SERVICE_ROOT/current")
test ! -e "$STAGE"
mkdir -p "$STAGE"
cp -a "$BASELINE/." "$STAGE/"
printf '%s\n' "$BASELINE" > "$SERVICE_ROOT/releases/$RELEASE.baseline"
mkdir -p "$STAGE/games/new-game"
```

### 8.2 전송 — Windows

아래 로컬 경로는 **빌드 결과물 폴더**와 **최신 운영 목록에 새 게임을 추가한 JSON**으로 바꾸세요. `scp`가 원본 폴더까지 중첩하지 않도록 `/.`를 사용합니다.

```powershell
scp -r ./new-game-dist/. hajin@100.119.23.4:/home/hajin/services/pulse-arcade/releases/YYYYMMDD-new-game-01/games/new-game/
scp ./merged-games.json hajin@100.119.23.4:/home/hajin/services/pulse-arcade/releases/YYYYMMDD-new-game-01/server/games.json
```

### 8.3 목록·공개 파일 검증 — Jetson

```bash
python3 - /home/hajin/services/pulse-arcade/releases/YYYYMMDD-new-game-01 <<'PY'
import json, sys
from pathlib import Path
root = Path(sys.argv[1]).resolve()
catalog = json.loads((root / 'server/games.json').read_text(encoding='utf-8-sig'))
ids = [g['id'] for g in catalog]
assert len(ids) == len(set(ids)), '중복 게임 ID'
assert {'tetris','gomoku','janggi','chess','tidebreak-legion','penguin-extraction','screw-harbor','battleship','new-game'} <= set(ids)
for game in catalog:
    source = (root / game['source']).resolve()
    assert source.is_relative_to(root)
    for name in game['files']:
        target = (source / name).resolve()
        assert target.is_relative_to(source) and target.is_file(), (game['id'], name)
new = next(g for g in catalog if g['id'] == 'new-game')
assert 'index.html' in new['files']
print('목록과 공개 파일 검증 완료:', len(catalog), '게임')
PY
```

필요하면 스테이지를 별도 포트·임시 DB로 실행해 공개 경로와 동일한 `/games/new-game/` 아래에서 플레이 검증합니다. DB는 운영 폴더 밖의 임시 경로를 쓰고 검증 프로세스만 종료하세요.

### 8.4 실행본 전환 — Jetson

`pulse-arcade` 재시작은 진행 중인 테트리스·보드게임 온라인 방을 종료합니다. 플레이 현황과 사용자의 배포 승인 범위를 확인하고 실행합니다. 정적 게임 등록 때문에 Bluecap을 재시작할 필요는 없습니다.

```bash
set -eu
SERVICE_ROOT=/home/hajin/services/pulse-arcade
RELEASE=YYYYMMDD-new-game-01
STAGE="$SERVICE_ROOT/releases/$RELEASE"
BASELINE=$(cat "$SERVICE_ROOT/releases/$RELEASE.baseline")
# 다른 세션이 먼저 배포했으면 중단하고 최신 변경을 다시 합칩니다.
test "$(readlink -f "$SERVICE_ROOT/current")" = "$BASELINE"
test ! -e "$SERVICE_ROOT/current-new"
ln -s "$STAGE" "$SERVICE_ROOT/current-new"
mv -Tf "$SERVICE_ROOT/current-new" "$SERVICE_ROOT/current"
sudo systemctl restart pulse-arcade
systemctl is-active pulse-arcade
curl -fsS http://127.0.0.1:18080/api/health
curl -fsS http://127.0.0.1:18080/api/games
curl -fsS http://127.0.0.1:18080/games/new-game/ -o /dev/null
```

### 8.5 문제 발생 시 되돌리기 — Jetson

```bash
set -eu
SERVICE_ROOT=/home/hajin/services/pulse-arcade
RELEASE=YYYYMMDD-new-game-01
PREVIOUS=$(cat "$SERVICE_ROOT/releases/$RELEASE.baseline")
# 다른 후속 배포가 있으면 임의로 되돌리지 않습니다.
test "$(readlink -f "$SERVICE_ROOT/current")" = "$SERVICE_ROOT/releases/$RELEASE"
test ! -e "$SERVICE_ROOT/current-rollback"
ln -s "$PREVIOUS" "$SERVICE_ROOT/current-rollback"
mv -Tf "$SERVICE_ROOT/current-rollback" "$SERVICE_ROOT/current"
sudo systemctl restart pulse-arcade
curl -fsS http://127.0.0.1:18080/api/health
```

운영 DB는 코드 배포·롤백 시 덮어쓰거나 과거 백업으로 자동 복원하지 않습니다. 배포 준비·목록 검증은 위 절차만으로 가능하며, 이 문서 작성 과정에서는 실제 배포 명령을 실행하지 않았습니다.

## 9. 전용 백엔드 게임 연결 시 추가 작업

1. `ss -ltnp`와 서비스 설정으로 사용 중인 포트를 확인한 뒤 새 loopback 포트를 선택합니다. `18091`은 예시이며 사용 가능 여부는 아직 확인하지 않았습니다.
2. `/home/hajin/services/<game-id>/releases/...`, `current`, 별도 systemd 서비스, 별도 데이터 폴더를 만듭니다. 서버는 `127.0.0.1`에만 바인딩합니다.
3. 백엔드는 `/games/<game-id>/` 접두사가 있는 요청을 처리하도록 만듭니다. 정적 파일·API·WebSocket 모두 같은 경로 아래에서 제공합니다.
4. `games.json`에 카드 항목을 추가하되 `files: []`로 둘 수 있습니다. 이때 실제 파일 제공은 전용 서비스가 맡습니다. 목록 등록만 하면 게임은 아직 열리지 않습니다.
5. 기존 nginx **동일한 HTTPS server 블록 안에** 아래 location을 추가합니다. 기존 Bluecap location과 나머지 `/` 프록시는 유지합니다.

```nginx
# 예시: new-game 백엔드는 접두사가 포함된 원래 URI를 받아야 합니다.
location = /games/new-game {
    return 308 /games/new-game/;
}
location ^~ /games/new-game/ {
    proxy_pass http://127.0.0.1:18091;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Host $host;
    proxy_set_header X-Forwarded-Proto https;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection $penguin_connection_upgrade;
    proxy_buffering off;
    proxy_request_buffering off;
    proxy_socket_keepalive on;
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
}
```

현재 설정에 이미 있는 `$penguin_connection_upgrade` map을 사용한 예입니다. 별도 설정으로 분리하면 map의 존재도 확인하세요. `proxy_pass` 뒤에 `/`를 붙이면 URI 접두사 처리 방식이 달라지므로 백엔드의 경로 계약과 맞춰야 합니다.

nginx 파일을 백업하고 `sudo nginx -t` 성공 후 `sudo systemctl reload nginx`를 실행합니다. 새 내부 포트를 공유기에 추가 개방할 필요는 없습니다. Origin은 실제 공개 URL과 정확하게 맞추고, WebSocket은 `wss://`를 사용합니다. 인증·전송 크기·빈도 제한·연결 종료 처리는 새 백엔드에서도 구현해야 합니다.

실시간 게임은 Bluecap처럼 nginx에서 전용 서버로 바로 연결해 불필요한 포털 프록시 중계를 피하세요. 프로토콜·tick rate·스냅샷 전송량은 새 게임에 맞춰 측정하고 정합니다.

## 10. 랭킹을 붙일 경우 — 선택 사항

현재 공통 랭킹은 익명 브라우저 쿠키 기반이며 높은 점수가 우선입니다. Bluecap 계정 로그인과 통합된 시스템이 아닙니다.

| API | 용도 |
| --- | --- |
| `GET /api/games` | 목록 |
| `GET /api/games/new-game/scores` | 상위 20개 기록 |
| `POST /api/games/new-game/runs` | 시작 시 `{}` → `run_id` |
| `POST /api/games/new-game/scores` | 종료 후 `run_id`, `name`, `score`, `elapsed_ms` |

POST는 같은 Origin에서 `Content-Type: application/json`으로 보내고 시작 쿠키를 유지합니다. 점수와 시간은 정수입니다. 현재 허용 점수는 `1~50,000,000`, 시간은 `1~86,400,000ms`, 닉네임은 지정 문자로 `2~16자`입니다. 게임별 부정행위 검증은 따로 보완해야 합니다.

기록 저장을 실제로 구현·검증한 뒤에만 `leaderboard: true`로 바꿉니다. 시간 단축형 게임, 승패/Elo 방식은 기존 점수 내림차순 API를 그대로 사용하지 말고 게임별 규칙을 구현하세요. 운영 랭킹에 테스트 점수를 등록하지 않습니다.

## 11. 공개 배포 완료 기준

- 공개 HTTPS에서 허브 카드 → 게임 진입 → 플레이 → 재시작·허브 복귀 확인.
- 모든 자산 HTTP 200, 정상 MIME, JS·CSP 오류 없음. HTTPS 인증서 검증을 유지합니다.
- 새 게임과 기존 8개 게임의 카드·진입 경로 유지.
- 멀티플레이를 구현했다면 서로 다른 두 브라우저에서 연결·동기화·재연결·종료 확인.
- `systemctl is-active pulse-arcade`, 새 전용 서비스 상태 및 로그 확인.
- 변경한 릴리스 경로, 이전 릴리스, 파일 목록·해시, 검증 결과와 한계를 기록.
- DB·계정·인벤토리 보존. 새 게임이 Bluecap에 종속되지 않도록 확인.
- 임시 관리 연결을 종료하고 Tailscale을 시작 시 프로필로 복원.

이 문서에서 확인한 것은 운영 구조·설정·현재 health 응답입니다. 새 게임이나 예시 배포 스크립트를 실제 운영에 적용해 검증한 것은 아닙니다.

## 12. 다음 세션에 바로 붙여 넣을 요청

> `C:\Users\hajin\IT_Projects\tetris\PULSE_ARCADE_NEW_GAME_GUIDE.md`를 읽고 새 게임을 개발해 주세요. 게임 ID와 장르·플레이 방식에 맞춰 별도 개발 원본을 유지하고, `/games/<game-id>/` 하위 경로 및 기존 CSP에 맞는 실행물을 만드세요. Pulse Arcade의 최신 Jetson 운영본을 기준으로 게임 목록과 필요한 배포 파일을 합치고, 기존 게임·DB·Bluecap 연결을 보존하세요. 로컬 통합 검증 후 현재 배포 상태를 다시 확인해 연결·배포하고, 변경 경로·검증 결과·롤백 방법을 기록하세요. 서비스 재시작은 그 세션에서 확인한 사용자 승인 범위를 따르세요.
