# VoiceFit — 작업 규칙

타이머에 맞춰 음성으로 세어주는 헬스 루틴 코치 PWA (구 voice-coach, v0.2.0). 허브: `C:\dev\solo-main` (지도 `C:\dev\solo-main\docs\context\INDEX.md`).
- 라이브: https://voicefit.alexsryu.workers.dev/ · 저장소 ryuryu3/VoiceFit(public)

## 구조
pnpm 모노레포. 앱 `apps/voice-coach/`(Vite, `base: './'`), 공용 패키지 `packages/{core-domain,exercise-library,metrics,storage,workout-engine}`, E2E `e2e/flow.py`, 문서 `docs/MVP_REPORT.md`·`docs/PLAN_v0.2.md`. 배포 폴더 `public/`은 **빌드 결과물**이라 직접 고치지 않는다.

## 명령
- 테스트 `pnpm test`(vitest) · 타입 `pnpm typecheck` · 개발 `pnpm dev`
- 빌드·배포 폴더 갱신: `bash scripts/build.sh` (테스트 → 빌드 → `public/` 교체). 이후 `npx wrangler deploy`(Worker `voicefit`) 또는 main push.

## 규칙
- 운동 이미지는 RepDB 무료 등급(출처 표기 필수). 표기를 지우지 않는다.
- 설계 원칙: 타이머 기준 카운트(2~6초), 설정은 한 번 저장 후 유지, Android·Z 플립 커버화면 대응.
- main push·배포는 Alex 지시가 있을 때만.

## 알아둘 것
- solo-main에서 옮기면서 `README.md`만 새로 쓰고 코드는 그대로. 옛 주소 `solo-main.alexsryu.workers.dev/voicecoach/`는 사라졌다.
- GitHub 연동 자동 배포는 아직 안 걸려 있다(2026-11-17 wrangler로 수동 배포).

## 다음에 손볼 만한 것 (마이너)
- Workers Builds 연결(main push 자동 배포)
- `docs/PLAN_v0.2.md` 미구현 항목 정리, MVP_REPORT 이후 변경 반영
- 앱 내 표기 이름 voice-coach/보이스 헬스코치 → VoiceFit 통일 여부 확인
