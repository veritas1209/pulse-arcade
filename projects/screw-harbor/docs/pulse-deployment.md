# Pulse Arcade 배포

운영 게임: https://222.96.173.194/games/screw-harbor/

2026-09-30 사용자가 업로드와 이후 패치의 Pulse Arcade 반영을 직접 요청했다. 기존 로컬 승인 대기 절차는 이 요청으로 대체한다. 이후 수정은 빌드·검증 후 운영에 반영한다.

## 패치 순서

1. 빌드와 변경 범위에 맞는 테스트를 실행한다.
2. `node scripts/refresh-pulse.mjs`로 기존 패키지를 보관하고 최신 `dist/`를 패키징한다.
3. 배포용 Tailscale 계정으로 연결하고 `python scripts/deploy-pulse.py`를 실행한다. SSH 비밀번호는 실행 중 입력하며 파일에 저장하지 않는다.
4. 로컬 프로덕션 미리보기를 4188 포트에서 실행하고 `node scripts/verify-public.mjs`로 실제 HTTPS 게임을 확인한다.
5. Tailscale을 작업 전 계정으로 복원한다.

현재 PC에서 npm 명령이 없으면 번들 pnpm 실행기를 사용한다:

```powershell
& 'C:/Users/hajin/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback/pnpm.cmd' run build
```

최초 패키지만 `node scripts/prepare-pulse.mjs`로 생성한다. 이후에는 `refresh-pulse.mjs`가 `release/history/`에 이전 패키지를 보관한다. 배포 스크립트는 패키지와 최신 빌드의 파일 목록·내용·SHA-256 일치를 검사한다.

## 서버 반영

SSH: `hajin@100.119.23.4`. 운영 링크: `/home/hajin/services/pulse-arcade/current`. 서비스: `pulse-arcade`.

매번 최신 운영 릴리스를 복제하고 새 게임 파일과 카탈로그 항목만 병합한다. 기존 게임 파일의 해시를 비교하고 운영 DB는 수정하지 않는다. 이전 해시 이름의 JS/CSS도 보존하여 기존 페이지가 계속 자산을 받을 수 있게 한다.

별도 포트 18092와 임시 DB로 스테이징 HTTP를 검사한다. 전환 직전에 운영 기준선과 활성 연결을 확인하고, 링크를 원자적으로 전환한 뒤 서비스를 재시작한다. 실패 시 현재 링크가 해당 배포를 가리킬 때만 이전 기준선으로 되돌린다.

## 최근 배포

- 릴리스: `20261001-screw-harbor-042822`.
- 이전 릴리스: `20261001-screw-harbor-041257`.
- 공개 빌드 파일 29개, 기존 게임 6개와 파일 58개 보존. 스테이징·운영 HTTP 해시 검증 통과.
- 외벽·실내·선체 개구부 닫기, 나사 머리·와셔 겹침 검사, 카메라 벽 관통 차단과 모바일 시점 초기화 반영. 자세한 검증은 `docs/enclosure-patch.md`.
- 사용자 직접 제공 인증정보로 배포하고 임시 인증 메모리를 지웠다. Tailscale 원래 계정 복원 완료.
- 공개 HTTPS PC·모바일: 현재 번들·29개 파일 해시, 실제 선택·재시작·일시정지, 이동·확대, 목록·허브 복귀 통과. 게임 오류 없음.
- 자세한 기록: `artifacts/deployment/deployment.json`, `artifacts/deployment/public-verification.json`.
