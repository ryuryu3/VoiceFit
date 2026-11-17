#!/usr/bin/env python3
"""
RepDB 무료 데이터셋 → 앱에 필요한 것만 가져오기 (in-app 사용, 출처 표기 필수)

- exercises.ts의 `repdb: '<id>'`가 붙은 운동만 대상
- 이미지: images/flat/<id>-start|peak|main.webp → apps/voice-coach/public/repdb/
- 근육 이미지: 앱 근육 표시에 쓰는 것만 → apps/voice-coach/public/repdb/muscles/
- packages/exercise-library/src/repdb.generated.ts 생성 (프레임 경로)

라이선스 (LICENSE-DATA.md):
- 앱 안 사용(상업 포함) 가능, "Exercise data by RepDB (repdb.co)" 출처 표기 필수
- 데이터셋 자체를 재배포·재포장 금지 → 원본 JSON 전체는 저장소에 넣지 않음
- premium-samples(애니메이션)는 평가용 → 사용하지 않음
- 이미지를 생성형 AI 입력으로 쓰지 않음

실행: python3 scripts/import-repdb.py <exercise-dataset 클론 경로>
"""
import json, re, shutil, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = Path(sys.argv[1] if len(sys.argv) > 1 else ROOT.parent / 'vendor' / 'exercise-dataset')
EX_TS = ROOT / 'packages/exercise-library/src/exercises.ts'
OUT_IMG = ROOT / 'apps/voice-coach/public/repdb'
OUT_TS = ROOT / 'packages/exercise-library/src/repdb.generated.ts'

# 앱 근육 → RepDB 근육 이미지 파일명
MUSCLE_IMG = {
    'pecs': 'pectoralis-major', 'upperPecs': 'pectoralis-major', 'lats': 'latissimus-dorsi', 'rhomboids': 'rhomboids',
    'traps': 'trapezius', 'erectors': 'erector-spinae', 'frontDelts': 'anterior-deltoid', 'sideDelts': 'lateral-deltoid',
    'rearDelts': 'posterior-deltoid', 'biceps': 'biceps-brachii', 'triceps': 'triceps-brachii',
    'brachioradialis': 'brachioradialis', 'forearms': 'forearm-flexors', 'abs': 'rectus-abdominis', 'obliques': 'obliques',
    'quads': 'quadriceps', 'hamstrings': 'hamstrings', 'glutes': 'gluteus-maximus', 'gluteMed': 'gluteus-medius',
    'calves': 'gastrocnemius', 'adductors': 'adductors',
}

data = {e['id']: e for e in json.loads((SRC / 'exercises.json').read_text())['exercises']}
pairs = re.findall(r"id: '([A-Z]\d{2})', repdb: '([a-z0-9-]+)'", EX_TS.read_text())
assert pairs, 'exercises.ts에서 repdb id를 찾지 못했습니다'

if OUT_IMG.exists():
    shutil.rmtree(OUT_IMG)
(OUT_IMG / 'muscles').mkdir(parents=True)

frames = {}
missing = []
for app_id, rid in pairs:
    e = data.get(rid)
    if not e:
        missing.append(rid)
        continue
    flat = e['images']['flat']
    fr = {}
    for pose in ('start', 'peak', 'main'):
        if pose in flat:
            src = SRC / flat[pose]
            dst = OUT_IMG / src.name
            shutil.copyfile(src, dst)
            fr['start' if pose == 'main' else pose] = f'repdb/{src.name}'
    frames[app_id] = fr

for name in sorted(set(MUSCLE_IMG.values())):
    shutil.copyfile(SRC / 'images/muscles' / f'{name}.webp', OUT_IMG / 'muscles' / f'{name}.webp')

if missing:
    sys.exit(f'데이터셋에 없는 id: {missing}')

lines = [
    '// 자동 생성 파일 — scripts/import-repdb.py 로 다시 만들 것. 직접 수정 금지.',
    '// 이미지 출처: Exercise data by RepDB (repdb.co) — 무료 등급, 앱 안 사용·출처 표기 조건',
    'export const REPDB_CREDIT = \'Exercise data by RepDB (repdb.co)\';',
    'export const REPDB_URL = \'https://repdb.co\';',
    'export const REPDB_FRAMES: Record<string, { start: string; peak?: string }> = ' + json.dumps(frames, indent=1, ensure_ascii=False) + ';',
    'export const REPDB_MUSCLE_IMG: Record<string, string> = ' + json.dumps({k: f'repdb/muscles/{v}.webp' for k, v in MUSCLE_IMG.items()}, indent=1) + ';',
    '',
]
OUT_TS.write_text('\n'.join(lines))
size = sum(f.stat().st_size for f in OUT_IMG.rglob('*.webp'))
print(f'운동 {len(frames)}종, 이미지 {len(list(OUT_IMG.rglob("*.webp")))}개, {size / 1024:.0f} KB → {OUT_IMG}')
