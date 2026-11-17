import { describe, expect, it } from 'vitest';
import { BODY_PARTS, MUSCLE_TO_PART } from '@hc/core-domain';
import {
  LIBRARY, muscleImage, peakOpacity, buildRoutineItems, canPlayMotion, estimateItemSec, getExercise, motionPlaybackRate,
  partPriorities, recommendExercises, suggestSplit, type SurveyAnswers,
} from './index';

const base: SurveyAnswers = {
  goal: 'hypertrophy', level: 'novice', freqPerWeek: 3, minutesPerSession: 60,
  focusParts: [], avoidParts: [],
};

describe('라이브러리 데이터 무결성', () => {
  it('60종: 머신 30 + 프리웨이트 23 + 맨몸 7', () => {
    expect(LIBRARY).toHaveLength(60);
    expect(LIBRARY.filter((e) => e.category === 'machine')).toHaveLength(30);
    expect(LIBRARY.filter((e) => e.category === 'free')).toHaveLength(23);
    expect(LIBRARY.filter((e) => e.category === 'bodyweight')).toHaveLength(7);
  });
  it('ID·RepDB id 중복 없음, 인기 순위 1..60 정수', () => {
    expect(new Set(LIBRARY.map((e) => e.id)).size).toBe(60);
    expect(new Set(LIBRARY.map((e) => e.repdb)).size).toBe(60);
    expect(LIBRARY.map((e) => e.popularityRank).sort((a, b) => a - b)).toEqual(Array.from({ length: 60 }, (_, i) => i + 1));
  });
  it('모든 운동에 포즈 프레임·썸네일·출처', () => {
    for (const e of LIBRARY) {
      expect(e.motion.frames?.start, e.id).toMatch(/^repdb\/.+\.webp$/);
      expect(e.motion.thumb).toBe(e.motion.frames!.start);
      expect(e.motion.credit).toContain('RepDB');
      // 반복 운동은 시작·정점 2컷, 시간 운동(플랭크)은 1컷
      if (e.mode === 'reps') expect(e.motion.frames?.peak, e.id).toBeTruthy();
    }
  });
  it('주동근마다 근육 이미지가 있음', () => {
    for (const e of LIBRARY) for (const m of e.primary) expect(muscleImage(m), m).toBeTruthy();
  });
  it('모든 운동: 주동근 1개 이상, 요령 3줄, 양수 값', () => {
    for (const e of LIBRARY) {
      expect(e.primary.length).toBeGreaterThan(0);
      expect(e.tips.every((t) => t.length > 5)).toBe(true);
      expect(e.met).toBeGreaterThan(2);
      expect(e.weightStepKg).toBeGreaterThan(0);
      expect(e.defaultSets).toBeGreaterThan(0);
      for (const mu of [...e.primary, ...e.secondary]) expect(MUSCLE_TO_PART[mu]).toBeDefined();
    }
  });
  it('모든 부위를 최소 1종 이상 커버', () => {
    const covered = new Set(LIBRARY.flatMap((e) => e.primary.map((mu) => MUSCLE_TO_PART[mu])));
    for (const p of BODY_PARTS) expect(covered.has(p)).toBe(true);
  });
  it('무료 체험 모션이 일부 존재', () => {
    expect(LIBRARY.some((e) => e.motionTier === 'free')).toBe(true);
    expect(LIBRARY.some((e) => e.motionTier === 'pro')).toBe(true);
  });
});

describe('부위 우선순위', () => {
  it('강화 부위가 1순위, 회피 부위는 0점', () => {
    const p = partPriorities({ ...base, focusParts: ['arm'], avoidParts: ['legs'] });
    expect(p[0]!.part).toBe('arm');
    expect(p.find((x) => x.part === 'legs')!.score).toBe(0);
    expect(p.find((x) => x.part === 'legs')!.stars).toBe(0);
  });
  it('기록상 부족한 부위는 점수 상승', () => {
    const a = partPriorities(base);
    const b = partPriorities(base, { core: 0, chest: 0.5 });
    const s = (arr: typeof a, part: string) => arr.find((x) => x.part === part)!.score;
    expect(s(b, 'core')).toBeGreaterThan(s(a, 'core'));
    expect(s(b, 'chest')).toBeLessThan(s(a, 'chest'));
  });
});

describe('분할 제안', () => {
  it('빈도별 분할', () => {
    expect(suggestSplit({ ...base, freqPerWeek: 2 }).key).toBe('full');
    expect(suggestSplit({ ...base, freqPerWeek: 3, level: 'beginner' }).key).toBe('full');
    expect(suggestSplit({ ...base, freqPerWeek: 4 }).key).toBe('upperLower');
    expect(suggestSplit({ ...base, freqPerWeek: 6 }).key).toBe('ppl');
  });
});

describe('운동 추천', () => {
  it('회피 부위가 주동근인 운동은 후보에서 제외', () => {
    const r = recommendExercises(LIBRARY, { ...base, avoidParts: ['legs'] });
    for (const c of r) expect(c.exercise.primary.some((mu) => MUSCLE_TO_PART[mu] === 'legs')).toBe(false);
  });
  it('추천 수는 3~8개, 시간이 길수록 많거나 같음', () => {
    const short = recommendExercises(LIBRARY, { ...base, minutesPerSession: 30 }).filter((c) => c.recommended).length;
    const long = recommendExercises(LIBRARY, { ...base, minutesPerSession: 90 }).filter((c) => c.recommended).length;
    expect(short).toBeGreaterThanOrEqual(3);
    expect(long).toBeLessThanOrEqual(8);
    expect(long).toBeGreaterThanOrEqual(short);
  });
  it('추천 결과가 한 부위에 몰리지 않음 (60분 기준 3개 부위 이상)', () => {
    const rec = recommendExercises(LIBRARY, base).filter((c) => c.recommended);
    expect(new Set(rec.map((c) => c.part)).size).toBeGreaterThanOrEqual(3);
  });
  it('강화 부위를 고르면 그 부위 운동이 추천에 포함', () => {
    const rec = recommendExercises(LIBRARY, { ...base, focusParts: ['arm'] }).filter((c) => c.recommended);
    expect(rec.some((c) => c.part === 'arm')).toBe(true);
  });
  it('입문자에게는 컨벤셔널 데드리프트를 추천하지 않음', () => {
    const rec = recommendExercises(LIBRARY, { ...base, level: 'beginner', focusParts: ['back', 'glutes'] }).filter((c) => c.recommended);
    expect(rec.some((c) => c.exercise.id === 'F02')).toBe(false);
  });
});

describe('루틴 생성', () => {
  it('큰 근육부터 정렬, 회당 시간 반영, 중량은 증량 단위 배수', () => {
    const sel = ['M14', 'M01', 'M07'].map(getExercise);
    const items = buildRoutineItems(sel, base, 4);
    expect(items.map((i) => i.exerciseId)).toEqual(['M01', 'M07', 'M14']);
    for (const it of items) {
      expect(it.secPerRep).toBe(4);
      const step = getExercise(it.exerciseId).weightStepKg;
      expect(Math.abs(it.weightKg / step - Math.round(it.weightKg / step))).toBeLessThan(1e-9);
    }
  });
  it('예상 시간 계산', () => {
    // 3세트 × 10회 × 3초 = 90 + 휴식 2×60 = 120 + 세팅 60 = 270
    expect(estimateItemSec({ sets: 3, reps: 10, secPerRep: 3, restSec: 60 })).toBe(270);
  });
});

describe('유료 게이트·모션 속도', () => {
  it('pro 모션은 무료 사용자에게 잠김', () => {
    const pro = LIBRARY.find((e) => e.motionTier === 'pro')!;
    const free = LIBRARY.find((e) => e.motionTier === 'free')!;
    expect(canPlayMotion(pro, 'free')).toBe(false);
    expect(canPlayMotion(pro, 'pro')).toBe(true);
    expect(canPlayMotion(free, 'free')).toBe(true);
  });
  it('재생 속도 = 원본 루프 / 회당 시간', () => {
    const e = getExercise('M01');
    expect(motionPlaybackRate(e, 3)).toBeCloseTo(1);
    expect(motionPlaybackRate(e, 6)).toBeCloseTo(0.5);
    expect(motionPlaybackRate(e, 2)).toBeCloseTo(1.5);
  });
});

describe('추천 품질 규칙', () => {
  it('같은 동작 패턴(예: 힌지 2종)이 중복 추천되지 않음 — 중급 근력 90분', () => {
    const a: SurveyAnswers = { ...base, goal: 'strength', level: 'intermediate', minutesPerSession: 90, focusParts: ['chest', 'back'] };
    const rec = recommendExercises(LIBRARY, a).filter((c) => c.recommended).map((c) => c.exercise.id);
    expect(rec.filter((id) => ['F02', 'F03', 'F05'].includes(id)).length).toBeLessThanOrEqual(1);
  });
  it('근력 목표에서도 고립 운동은 10회 이상', () => {
    const items = buildRoutineItems([getExercise('F12'), getExercise('F06')], { ...base, goal: 'strength' });
    expect(items.find((i) => i.exerciseId === 'F12')!.reps).toBeGreaterThanOrEqual(10);
    expect(items.find((i) => i.exerciseId === 'F06')!.reps).toBe(6);
  });
  it('60분이면 5~7종, 30분이면 3종', () => {
    const n = (m: number) => recommendExercises(LIBRARY, { ...base, minutesPerSession: m }).filter((c) => c.recommended).length;
    expect(n(60)).toBeGreaterThanOrEqual(5);
    expect(n(60)).toBeLessThanOrEqual(7);
    expect(n(30)).toBe(3);
  });
});

describe('포즈 전환 곡선 (타이머 동기화)', () => {
  it('시작 자세 → 정점 → 시작 자세, 1회 반복마다 반복', () => {
    expect(peakOpacity(0)).toBe(0);
    expect(peakOpacity(0.2)).toBe(0);
    expect(peakOpacity(0.6)).toBe(1);
    expect(peakOpacity(0.97)).toBe(0);
    expect(peakOpacity(1.6)).toBe(1);
    for (let t = 0; t < 1; t += 0.01) { expect(peakOpacity(t)).toBeGreaterThanOrEqual(0); expect(peakOpacity(t)).toBeLessThanOrEqual(1); }
  });
});
