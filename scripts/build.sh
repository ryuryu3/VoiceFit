#!/usr/bin/env bash
# 테스트 → 빌드 → public/ 로 복사 (이후 main push = Cloudflare 자동 배포)
set -euo pipefail
cd "$(dirname "$0")/.."
pnpm install --frozen-lockfile
pnpm test
pnpm --filter voice-coach build
rm -rf public && cp -r apps/voice-coach/dist public
