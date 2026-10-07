# PULSE ARCADE 운영 안내

## 공개 주소와 서버

- 게임 포털: https://hajin-desktop.tailfb939b.ts.net:10000/
- 테트리스: https://hajin-desktop.tailfb939b.ts.net:10000/games/tetris/
- 1대1 대전: https://hajin-desktop.tailfb939b.ts.net:10000/games/tetris/duel.html
- Jetson: `ssh hajin@100.119.23.4`
- 서비스: `pulse-arcade.service`, 부팅 시 자동 시작, 오류 종료 시 재시작
- 내부 주소: `http://127.0.0.1:18080`
- 실행본: `/home/hajin/services/pulse-arcade/current`
- 현재 대전 배포: `/home/hajin/services/pulse-arcade/releases/20260914-versus-01`
- 최초 배포: `/home/hajin/services/pulse-arcade/releases/20260914-094857`
- Python 환경: `/home/hajin/services/pulse-arcade/venv`
- 기록 DB: `/home/hajin/.local/share/pulse-arcade/scores.sqlite3`
- 기존 Funnel 설정 백업: `/home/hajin/services/pulse-arcade/backups/funnel-before-tetris.json`

| 외부 HTTPS 포트 | 서비스 | 내부 연결 |
| --- | --- | --- |
| 443 | 기존 버스트래커 | 127.0.0.1:8000 |
| 8443 | 기존 디스코드 봇 | 127.0.0.1:8001 |
| 10000 | PULSE ARCADE | 127.0.0.1:18080 |

Funnel 공개 포트는 443, 8443, 10000 중 선택합니다. 게임이 늘어도 10000 포트 안에서 경로만 추가하므로 게임마다 새 포트가 필요하지 않습니다. 기존 443·8443 설정은 보존했습니다. Tailscale 설치나 계정 인증을 하지 않은 방문자도 공개 URL로 접속할 수 있습니다.

## 로컬 실행

프로젝트 폴더에서 Python 3.10 이상으로 실행합니다.

```powershell
python -m pip install -r server/requirements.txt
python server/app.py
```

`http://127.0.0.1:18080/`는 포털, `/games/tetris/`는 게임입니다. 다른 호스트명이나 포트로 접속한다면 `--port`와 `--origin`을 맞추세요. 예: `python server/app.py --port 19000 --origin http://127.0.0.1:19000`.

게임만 오프라인으로 이용할 때는 기존처럼 루트 `index.html`을 열면 됩니다. 파일로 연 게임은 온라인 기록을 등록하지 않습니다.

## 랭킹 동작

게임 종료 후 온라인 랭킹을 열고 닉네임을 입력해 직접 기록을 등록합니다. 게임별 상위 20개 기록을 보여 주며, 같은 브라우저는 게임별 최고 점수 하나를 유지합니다. 동점은 먼저 등록한 기록이 앞섭니다. 닉네임은 공개됩니다.

사용자는 보안 쿠키로 구분합니다. 쿠키 삭제, 다른 브라우저·기기에서는 별도 사용자로 취급됩니다. 로그인과 계정 간 기록 동기화는 아직 없습니다. DB는 배포 폴더 밖에 두어 서비스 재시작과 코드 교체 후에도 유지됩니다.

출처 검사, 크기·빈도 제한, 닉네임 검증, 플레이 토큰과 기본 점수·시간 검증을 적용했습니다. 현재는 클라이언트가 계산한 기록을 받는 캐주얼 랭킹이며, 서버 리플레이로 점수를 재계산하는 완전한 부정행위 방지는 구현하지 않았습니다.

## 다음 게임 추가

기존 로컬 테트리스 경로는 유지했습니다. 이 프로젝트가 이제 포털과 게임 서버를 함께 포함합니다.

1. 예를 들어 `games/snake/` 아래에 새 게임의 `index.html`, JS, CSS와 필요한 이미지를 넣습니다. 게임 내부 자산은 상대 경로로 연결합니다.
2. `server/games.json`에 새 항목을 추가합니다. `id`는 중복 없는 영문 소문자·숫자·하이픈으로 정합니다.
3. 패키지를 다시 배포하고 서비스를 재시작합니다. 게임 카드, 검색, 장르 필터, 랭킹 게임 선택은 목록에서 생성됩니다.

```json
{
  "id": "snake",
  "title": "SNAKE / PULSE",
  "subtitle": "ARCADE EDITION",
  "description": "새 게임 소개",
  "genre": "아케이드",
  "players": "1인 플레이",
  "controls": "키보드 · 터치",
  "href": "/games/snake/",
  "source": "games/snake",
  "files": ["index.html", "game.js", "style.css"],
  "search_terms": ["스네이크", "snake"]
}
```

위 항목은 추가 방법 예시이며, 현재 배포된 게임은 테트리스 하나입니다. `files`에 등록한 자산만 공개합니다. 하위 이미지도 `assets/cover.webp`처럼 명시해야 합니다. 서버·DB·문서·테스트 파일은 웹에 노출하지 않습니다. 외부 CDN이나 인라인 스크립트를 쓰지 않는 자체 호스팅 게임을 기준으로 구성했습니다.

새 게임의 기록 저장은 다음 API에 연결합니다. 목록 등록만으로 플레이 결과가 자동 수집되지는 않습니다.

- `GET /api/games`: 공개 게임 목록
- `GET /api/games/{id}/scores`: 해당 게임의 상위 기록
- `POST /api/games/{id}/runs`: 시작 시 `{}`를 보내 `run_id` 수신
- `POST /api/games/{id}/scores`: 종료 후 `run_id`, `name`, `score`, `elapsed_ms` 전송
- 테트리스는 추가로 `lines`, `level`, `pieces`를 전송하고 규칙 일관성 검사

POST는 같은 출처에서 JSON으로 보내며 시작 시 받은 쿠키를 유지해야 합니다. 현재 공통 순위는 점수가 높을수록 유리한 방식입니다. 시간 단축형 게임은 별도 정렬·검증 규칙이 필요합니다. 게임별 판정 및 썸네일 디자인은 새 게임을 만들 때 확장할 수 있습니다.

## 상태 확인과 재시작

Jetson에서 실행합니다.

```sh
systemctl status pulse-arcade --no-pager
journalctl -u pulse-arcade -n 80 --no-pager
curl -fsS http://127.0.0.1:18080/api/health
sudo systemctl restart pulse-arcade
tailscale funnel status
```

Funnel 연결이 사라졌을 때 이 게임의 연결만 복원하는 명령입니다.

```sh
sudo tailscale funnel --bg --https=10000 http://127.0.0.1:18080
```

게임 공개만 중단하려면 `sudo tailscale funnel --https=10000 off`를 사용합니다. `funnel reset`은 기존 서비스 설정도 지우므로 사용하지 않습니다.

## 코드 배포와 되돌리기

로컬 프로젝트에서 `python server/package_release.py`를 실행하면 목록에 등록한 게임 파일과 서버 파일을 `server/release.tar.gz`로 묶고 SHA-256 목록을 생성합니다. 원본 폴더 전체나 기존 `tetris.zip`을 공개 서버 폴더에 그대로 복사할 필요가 없습니다.

새 압축 파일을 Jetson에 전송한 뒤 `/home/hajin/services/pulse-arcade/releases/새배포번호`에 풉니다. 기존 `current` 대상은 기록해 두고, 같은 디렉터리에서 임시 심볼릭 링크를 만든 다음 `mv -Tf`로 `current`를 교체합니다. `pulse-arcade`만 재시작하고 내부 health 및 공개 화면을 확인합니다. 문제가 있으면 기록해 둔 이전 릴리스로 `current`를 돌리고 재시작합니다. DB는 건드리지 않습니다.

Python 의존성이 바뀌면 먼저 별도 환경에서 확인합니다. 현재 Jetson에서 검증한 버전은 `requirements.lock`에 기록했습니다. systemd 설정을 변경했다면 `/etc/systemd/system/pulse-arcade.service`에 반영하고 `sudo systemctl daemon-reload` 후 재시작합니다.

## 기록 백업

실행 중인 SQLite는 파일 복사 대신 backup API를 사용합니다. Jetson에서 아래 코드를 실행하면 DB와 같은 보호된 폴더에 시각별 백업을 만듭니다.

```sh
python3 - <<'PY'
from pathlib import Path
import sqlite3, datetime
folder = Path('/home/hajin/.local/share/pulse-arcade')
target = folder / ('scores-' + datetime.datetime.now().strftime('%Y%m%d-%H%M%S') + '.sqlite3')
with sqlite3.connect(folder / 'scores.sqlite3') as source, sqlite3.connect(target) as backup:
    source.backup(backup)
target.chmod(0o600)
print(target)
PY
```

백업에는 닉네임과 기록 및 브라우저 식별자의 해시가 포함되므로 공개 폴더에 두지 않습니다. 자동 정기 백업은 아직 구성하지 않았습니다.

## 1대1 대전

포털의 **친구와 실시간 1대1**, 또는 테트리스 시작 화면의 **친구와 1대1**로 입장합니다. 이름을 입력하고 방을 만든 뒤 초대 링크를 친구에게 보냅니다. 두 사람이 준비하면 3초 카운트다운 후 같은 7-bag 블록 순서로 시작합니다.

- 내 이동·회전·낙하는 브라우저에서 즉시 처리합니다. 서버 응답을 기다리지 않습니다.
- 상대 보드는 초당 최대 10회 전송하고 짧은 이동을 보간합니다.
- 서버가 공격량, 상쇄, 방해 줄의 구멍과 전달 순서, 라운드 승패를 관리합니다.
- 더블 1줄, 트리플 2줄, 테트리스 4줄. 일반 T스핀 싱글/더블/트리플은 2/4/6줄, 미니 더블은 1줄입니다.
- 백투백 +1, 콤보는 2회마다 +1(최대 +4), 퍼펙트 클리어 +6. 한 번에 최대 12줄 공격입니다.
- 공격은 먼저 내 대기 공격을 상쇄합니다. 상대에게 도착한 공격은 0.9초 유예 후 줄을 지우지 않은 블록 고정에서 최대 8줄씩 상승이 확정되며, 클라이언트의 다음 블록 고정 후 올라옵니다.
- 먼저 쌓여 넘치면 패배합니다. 거의 동시에 넘친 경우 무승부를 판정하며, 10분 제한 시 무승부입니다.
- 두 사람이 다시 준비하면 새 시드로 재대결합니다. 방 안의 승수는 유지됩니다.
- 네트워크 단절은 최대 10초 복구 유예가 있고, 같은 페이지에서 자동 재연결 시 보드와 미확인 공격 처리를 유지합니다. 새로고침이나 탭 종료 후에는 현재 판을 복구하지 않습니다.
- 다른 탭으로 10초 넘게 이동하면 패배합니다. 대전 중 일시정지는 없습니다.
- 방과 대전 결과는 메모리에만 보관합니다. 서버 재시작 시 방이 종료되며 솔로 랭킹은 유지됩니다.
- 현재 32개 방·64개 연결 상한, 메시지 크기·빈도 제한, Origin 검사를 적용했습니다. 64명 실부하 검증을 했다는 의미는 아닙니다.

전송 경로는 `wss://hajin-desktop.tailfb939b.ts.net:10000/api/games/tetris/duel`입니다. 추가 공개 포트는 필요 없습니다. 새 게임은 별도의 실시간 규칙 모듈을 붙이면 같은 서버·포털 아래에 수용할 수 있습니다.

클라이언트가 보고하는 블록 고정·클리어·게임 오버를 이용하는 친구 간 캐주얼 대전입니다. 서버에서 입력 전체를 재실행해 보드의 진위를 검증하는 경쟁전 수준의 부정행위 방지는 아직 구현하지 않았습니다. 대전 점수는 솔로 랭킹과 분리합니다.

## 검증

- 게임 엔진 테스트 23개, 서버 테스트 22개(솔로 API 11개 + 대전 11개)
- 두 브라우저: 초대, 동일 블록 순서, 즉시 이동, 자동 재연결, 실제 회전으로 T스핀 더블·트리플 공격, 상쇄, 방해 줄 상승, 상대 보드, 승리, 재대결, 기권, 퇴장, 모바일 배치
- 솔로: 기록 등록과 DB 유지, 게임별 분리, 포털 검색, 닉네임 입력, 모바일 UI
- 2026-09-14 공개 Funnel echo 30회: 왕복 중앙값 75.9ms, p95 106.5ms, 최솟값 67.2ms, 최댓값 112.7ms
- 공개 대전 검증: 두 브라우저 초대·시작·일반 하드 드롭으로 게임 오버·승리·재대결·기권·퇴장 통과. 당시 화면 왕복 지연 186ms / 266ms. 결과는 `previews/duel-public-verification.json`.
- echo 측정 파일: `previews/public-verification.json`. 한 PC에서 한 시점에 측정했으며 접속 지역·회선·부하에 따라 달라집니다.

```powershell
node --test tests/engine.test.cjs
python -m unittest discover -s tests -p 'test_*.py'
node tests/leaderboard-browser-check.cjs
node tests/duel-browser-check.cjs
```

브라우저 검증에는 Playwright와 Chrome이 필요합니다. 경로는 `PLAYWRIGHT_MODULE`, `CHROME_PATH`로 지정합니다. 공개 검증에는 `PUBLIC_RELAY_IP`에 현재 공개 DNS의 Funnel IPv4를 지정합니다. `tests/public-check.cjs`는 포털·솔로·echo, `tests/duel-public-check.cjs`는 실제 인터넷 경로의 두 사람 대전을 확인합니다. 운영 랭킹에 테스트 점수를 등록하지 않습니다.

## 2026-09-14: THE TABLE COLLECTION (오목·장기·체스)

새 릴리스 `releases/20260914-tables-01`은 같은 10000 HTTPS 아래 4개 게임을 제공합니다.

- `/games/gomoku/` — GOMOKU / OBAN, 자유 오목(5개 이상, 금수 없음)
- `/games/janggi/` — JANGGI / PALACE, 한국 장기 친선 규칙
- `/games/chess/` — CHESS / OBSIDIAN, 캐슬링·앙파상·4종 승격과 무승부
- 세 게임 모두 컴퓨터 + 온라인 초대 대국. 한 기기 2인 모드는 없음.
- 각 폴더의 `{game}-offline.zip`은 독립 실행물. 전체 압축 해제 후 index.html 직접 실행. CDN, 설치, 웹서버가 필요하지 않습니다.

### 온라인 보드 서버

`server/board_rooms.py`가 `/api/board/{game}/ws`에서 방을 관리합니다. `server/board-worker.cjs`는 동일 게임 폴더의 비공개 `network-rules.cjs`를 사용합니다. 브라우저와 서버가 같은 엔진으로 수를 검증하며, 서버가 보드·차례·승패를 확정합니다. 요청 ID, 대국 ID와 판 버전으로 중복/지난 수를 방지합니다. 어댑터와 개발 소스는 공개 파일 목록에 포함하지 않습니다.

초대 → 양쪽 준비 → 3초 카운트다운 → 대국. 기권·합의 무승부·재대국 지원. 장기는 각자의 마상 배치를 받아 서버가 초기화합니다. 대국 상태는 서버 메모리에 보관하고 브라우저 sessionStorage의 복귀표로 새로고침 후에도 복구합니다. 연결 단절 유예는 30초, 상대가 끊기면 착수를 대기합니다. 서버 재시작 시 진행 중인 방은 사라지고 기존 SQLite 랭킹은 보존됩니다.

대국 2시간 상한, 대기/종료 방 30분 만료, 보드 게임 전체 32방/64연결 제한. 이는 동시 64명 부하를 검증했다는 뜻이 아닙니다. 보드 게임 승패의 영구 랭킹은 이번 범위에 포함하지 않으며 기존 테트리스 점수판을 그대로 제공합니다.

### 런타임과 패키징

- Jetson에 공식 Node.js v24.21.0 Linux arm64를 앱 전용 폴더에 설치하고 공식 SHASUMS256.txt로 SHA-256 검증했습니다.
- 경로 `/home/hajin/services/pulse-arcade/node/bin/node`; 시스템 전역 Node와 다른 서비스는 변경하지 않습니다.
- systemd `PULSE_NODE` 환경변수, Node heap 96MiB, 서비스 전체 MemoryMax 384M. 기존 제한과 사용자/그룹, 바인딩127.0.0.1:18080 유지.
- 기존 Funnel 443→8000, 8443→8001, 10000→18080 구성 유지. 새 공개 포트 없음.
- CSP `worker-src 'self' blob:`은 체스의 번들 내 AI Blob Worker에 필요합니다. 원격 스크립트는 허용하지 않습니다.

재빌드: 게임별 package.json의 build 명령 → `python server/package_offline.py` → `python server/package_release.py` 순서. 공용 온라인 코드는 platform/에서 각 폴더로 복사됩니다. 게임별 개발 도구가 달라도 최종본은 모두 일반 script 번들입니다. ZIP은 PUBLIC_FILES.json에 열거된 런타임 파일과 PLAY.txt/SOURCES.md만 담습니다.

### 추가 검증

- 서버 33개(보드11 + 기존22), 테트리스 엔진23개 통과.
- 게임 규칙/AI: 오목13, 장기15, 체스12묶음+AI전술2종 통과.
- 실제 오프라인 파일, 별도 ZIP 압축 해제, 인터넷 차단, 모바일 터치→AI응수, 승패/특수수/재시작.
- 실제 두 브라우저 초대·동기화·새로고침 복귀·기권·합의무승부·재대국·AI복귀.
- 별도 시각검토에서 발견한 오목 승리아이콘/체스 진영안내를 수정하고 재검증했습니다.
- 공개 검증: `BOARD_ORIGIN`을 공개 origin으로, `PUBLIC_RELAY_IP`를 현재 공개 DNS 응답으로 지정하고 `node tests/boards-platform.cjs`. 실제 Funnel IP와 TLS, 포털4게임, 다운로드3개, 세 게임 온라인 흐름을 검사합니다.
- ZIP 검증: `python tests/extract_offline.py`, `node tests/offline-zips.cjs`.
- 기록: previews/boards-public-verification.json, offline-zip-verification.json, board-visual-review.md와 각 게임 QA.md.

실제 iOS/Android 하드웨어는 별도 검증이 필요합니다. AI는 입문·친선 수준입니다. 장기는 대회식 점수/덤/반복장군 벌칙을 생략하고, 체스는 3반복/50수를 청구 없이 자동 무승부로 처리합니다. 오목은 렌주 금수·Swap2를 제공하지 않습니다. 생성형 에셋 API 키가 없어 직접 조형한 입체 말/텍스처와 합성 효과음을 사용했습니다.

## 2026-09-14: TIDEBREAK / LEGION V5.2 추가

릴리스 releases/20260914-tidebreak-01. 포털5게임. `/games/tidebreak-legion/`은1인용 해안 돌파 액션 게임이며 원본 Downloads/Tidebreak-Legion의 index.html/game.js/src/style.css/Three라이선스를 동일하게 복사했습니다. 개발폴더/node_modules/비공개문서는 정적공개하지 않습니다. 게임내용은 변경하지 않았으며, 실제 플레이 cover.jpg와 액션 장르 카드만 추가했습니다. 기존 네 게임의 온라인대전과 테트리스 랭킹은 유지합니다.

원본 해시: games/tidebreak-legion/IMPORT.json. 등록 설명: INTEGRATION.md. 검증: tests/tidebreak-platform.cjs 및 previews/tidebreak-{local,public}-verification.json. 로컬121.7초 실제입력에서914격파/최대6160병력/339진행/재시작1회, 페이지예외0·리소스실패0. 공개에서는 별도8초 플레이, 메뉴·정지/재시작·모바일·포털 클릭 경로를 확인합니다. 사용자 제공공유링크는403으로 열람하지 못했으며, 사용자가 추가반영사항 없이 폴더내용 그대로 등록하도록 확인했습니다.
