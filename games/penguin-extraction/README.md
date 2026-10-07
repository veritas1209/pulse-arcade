# Penguin Royale / Bluecap

Pulse Arcade의 펭귄 익스트랙션 게임입니다. 이 폴더는 운영 릴리스 `20260929-laptop-ui-150`의 클라이언트 원본·공통 규칙·서버·현재 실행본을 포함합니다. 기존 단독 저장소 자료도 이 게임 폴더에 보존했습니다.

## 실행

Node.js 24 환경에서 `npm ci` 후 `npm run server`를 실행합니다. 기본 주소는 `127.0.0.1:18090`, 정적 파일은 `dist/`, 개발 DB는 `data/`입니다. 포털의 Origin을 `PENGUIN_ALLOWED_ORIGINS`에 설정하고 루트 포털과 함께 실행하세요. 자세한 명령은 [Pulse Arcade README](../../README.md)를 참고하세요.

```text
src/          클라이언트 원본
shared/       월드·장비·아이템·이동 규칙
server/       계정·원정·AI·전투·SQLite·WebSocket
server/tests/ 서버 테스트
public/       원본 정적 자산
dist/         현재 제공하는 클라이언트·자산
tools/        유지보수 도구
training-ground/ 과거 개발 자료; 현재 실행본의 진입점과 구분
docs/         이전 개발·배포 문서
```

현재 진입점은 `dist/index.html`이며 `index-terrain-squad-146.js` 등을 참조합니다. 운영 DB, 비밀번호, `node_modules`, 이전 클라이언트 번들은 게시하지 않습니다. 현재 서버는 `../shared/*.ts`를 직접 불러오므로 Node.js 24를 사용하세요.

서버 테스트 명령은 `npm run server:test`입니다. 이 폴더는 운영본 보관 스냅샷이며, 기존 테스트의 전체 통과나 클라이언트 재빌드를 이번 저장소 동기화에서 확인한 것은 아닙니다. 과거 번들을 지칭하는 테스트는 오래된 검증 자료일 수 있습니다.
