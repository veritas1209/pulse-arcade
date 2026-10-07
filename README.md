# Pulse Arcade

테트리스, 오목, 장기, 체스, Tidebreak Legion, Penguin Royale / Bluecap, Screw Harbor, Battleship을 제공하는 웹게임 포털입니다.

이 저장소는 **2026-10-07 확인한 운영 릴리스**를 모은 전체 프로젝트입니다. 기존 `penguin-Royale` 저장소의 커밋 기록은 유지하고, Penguin Royale을 `games/penguin-extraction/`으로 옮겼습니다.

## 게임

공개 포털: [Pulse Arcade](https://222.96.173.194/)

| 게임 | 공개 경로 | 구현 |
| --- | --- | --- |
| Tetris / Pulse | `/games/tetris/` | JavaScript, 솔로 랭킹·온라인 대전 |
| Gomoku / Oban | `/games/gomoku/` | Three.js, AI·온라인 오목 |
| Janggi / Palace | `/games/janggi/` | Three.js, AI·온라인 장기 |
| Chess / Obsidian | `/games/chess/` | Three.js, AI·온라인 체스 |
| Tidebreak Legion | `/games/tidebreak-legion/` | Three.js 액션 게임 |
| Penguin Royale / Bluecap | `/games/penguin-extraction/` | Three.js, Node.js, SQLite, WebSocket |
| Screw Harbor | `/games/screw-harbor/` | Three.js, cannon-es 물리 퍼즐 |
| Battleship | `/games/battleship/` | Three.js, aiohttp 온라인 해전 |

## 구조

```text
portal/                          포털 화면·검색·장르 필터
server/                          aiohttp 포털·랭킹·대전·보드·배틀쉽 서버
server/games.json                게임 목록과 공개 파일 허용 목록
games/gomoku/                    오목 실행본·서버 규칙
games/janggi/                    장기 실행본·서버 규칙
games/chess/                     체스 실행본·서버 규칙
games/tidebreak-legion/           Tidebreak 실행본
games/penguin-extraction/        Bluecap 클라이언트 원본·서버·공통 규칙·실행본
games/screw-harbor/               현재 Screw Harbor 실행본
games/battleship/                 현재 Battleship 실행본
projects/screw-harbor/            Screw Harbor 개발 원본·빌드 설정·테스트
projects/battleship/              Battleship 개발 원본·빌드 설정·테스트
docs/                            연결 가이드·릴리스 출처·파일 해시
index.html, engine.js, game.js…   테트리스 원본; 기존 등록 경로 유지
```

게임의 실행 URL과 저장소 위치는 다를 수 있습니다. 예를 들어 테트리스는 루트 파일을 `server/games.json`의 `source: "."` 설정으로 제공합니다. Bluecap은 별도 Node 서버가 `games/penguin-extraction/dist/`를 제공합니다.

## 로컬 실행

### 포털과 일반 게임

Python 3.10 이상과 Node.js 24를 사용합니다. 온라인 보드게임의 서버 규칙을 실행할 때 Node가 필요합니다.

```bash
python -m venv .venv
# Linux/macOS: source .venv/bin/activate
# Windows PowerShell: .\.venv\Scripts\Activate.ps1
python -m pip install -r server/requirements.txt
python server/app.py --host 127.0.0.1 --port 18080 --origin http://127.0.0.1:18080 --database ./data/pulse-scores.sqlite3
```

`http://127.0.0.1:18080/`에서 포털을 엽니다. Tetris, 보드게임, Tidebreak, Screw Harbor, Battleship은 포함된 실행본을 사용하므로 먼저 프론트엔드를 다시 빌드할 필요가 없습니다. 시스템 PATH에 Node가 없다면 `PULSE_NODE`에 Node 실행 파일의 절대 경로를 설정하세요.

### Penguin Royale / Bluecap

별도 터미널에서 실행합니다. Node.js 24와 npm이 필요합니다.

```bash
cd games/penguin-extraction
npm ci
```

Linux/macOS:

```bash
PENGUIN_ALLOWED_ORIGINS=http://127.0.0.1:18080 npm run server
```

Windows PowerShell:

```powershell
$env:PENGUIN_ALLOWED_ORIGINS = 'http://127.0.0.1:18080'
npm run server
```

Node 서버는 기본 `127.0.0.1:18090`에서 실행되고, 로컬 포털의 `/games/penguin-extraction/` 프록시를 통해 연결됩니다. 개발 DB는 해당 게임의 `data/`에 생성됩니다. 운영 계정·인벤토리·SQLite 데이터는 저장소에 포함하지 않았습니다.

Bluecap의 주요 환경변수는 `PENGUIN_HOST`, `PENGUIN_PORT`, `PENGUIN_DB_PATH`, `PENGUIN_STATIC_DIR`, `PENGUIN_ALLOWED_ORIGINS`, `PENGUIN_TRUST_PROXY`입니다. 실제 운영 환경은 nginx가 Bluecap으로 직접 프록시하고, 다른 경로는 포털 서버로 전달합니다.

## 개발 원본과 실행본

Screw Harbor와 Battleship의 `projects/`에는 현재 운영 빌드에 대응하는 로컬 개발 원본을 포함했습니다. 개발 머신의 빌드 JS·CSS와 게시한 실행본의 SHA-256 일치를 확인했습니다.

```bash
cd projects/battleship         # 또는 projects/screw-harbor
npm install                   # Screw Harbor는 pnpm-lock.yaml도 제공
npm run dev
npm run build
npm run prepare:pulse
```

`prepare:pulse`는 프로젝트의 `release/pulse/`에 등록용 실행본과 목록 초안을 생성합니다. 포털 업로드는 자동 실행하지 않습니다. Battleship에는 별도 로컬 백엔드 안내가 [개발 README](projects/battleship/README.md)에 있습니다.

보드게임·Tidebreak는 운영 실행 코드와 서버 규칙을 보관한 스냅샷이며, 모든 게임의 원래 개발 프로젝트를 완전히 복원한 것은 아닙니다. Bluecap도 배포된 클라이언트를 그대로 보관하므로 전체 클라이언트 재빌드 가능성을 이번 동기화에서 보장하지 않습니다.

## 새 게임 연결·배포

[새 게임 개발·연결 가이드](docs/PULSE_ARCADE_NEW_GAME_GUIDE.md)를 참고하세요. 게임 등록은 `server/games.json`에 추가하며, `files`에 열거된 파일만 공개됩니다. 자산은 `/games/<game-id>/` 하위 경로에서 동작하도록 빌드해야 합니다.

운영본 출처와 해시: [릴리스 manifest](docs/release-manifest.json). 개발 원본 출처: [개발 원본 manifest](docs/development-source-manifest.json).

이번 업로드는 GitHub 저장소 동기화이며, 운영 게임 서비스를 재시작하거나 DB를 변경하지 않았습니다. 이전 빌드·백업·의존성 설치 폴더는 제거하고 현재 실행본을 보관했습니다. 기존 개발 자료는 게임 하위 폴더에 유지했습니다.

## 검증과 라이선스

동기화 과정에서 운영 파일 해시, 8개 게임 목록, 공개 파일 경로, 포털 로컬 HTTP 응답, 서버 구문을 확인합니다. 게임 밸런스나 모든 게임의 전체 플레이테스트를 새로 수행한 릴리스라는 의미는 아닙니다. 과거의 테스트·배포 보고는 작성 당시 결과로 읽으세요.

외부 모델·텍스처·음원 및 라이브러리의 라이선스·출처 고지는 각 게임의 `licenses/`, `credits/`, `models/`, `audio/`, 개발 문서에 포함되어 있습니다. 코드와 에셋 전체에 단일한 오픈소스 라이선스를 새로 부여하지 않았습니다.
