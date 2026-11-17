import {
  BODY_PARTS,
  MUSCLE_TO_PART,
  type BodyPart,
  type Exercise,
  type Goal,
  type Level,
  type Profile,
  type RoutineItem,
  type SecPerRep,
} from '@hc/core-domain';
import { patternOf } from './exercises';

export type SurveyAnswers = Omit<Profile, 'schemaVersion' | 'surveyDoneAt'>;

export interface PartPriority {
  part: BodyPart;
  score: number; // 0이면 제외
  stars: 0 | 1 | 2 | 3;
}

export type SplitKey = 'full' | 'upperLower' | 'ppl';
export interface SplitSuggestion {
  key: SplitKey;
  label: string;
  description: string;
}

/** 목표별 부위 기본 가중치 — 규칙 테이블 (v0.1) */
const GOAL_PART_WEIGHT: Record<Goal, Record<BodyPart, number>> = {
  hypertrophy: { chest: 1.2, back: 1.2, shoulder: 1.1, arm: 1.0, core: 0.6, legs: 1.1, glutes: 0.9 },
  strength: { chest: 1.2, back: 1.2, shoulder: 0.9, arm: 0.6, core: 0.7, legs: 1.4, glutes: 1.0 },
  fatLoss: { chest: 1.0, back: 1.2, shoulder: 0.8, arm: 0.6, core: 0.9, legs: 1.4, glutes: 1.2 },
  health: { chest: 1.0, back: 1.2, shoulder: 0.9, arm: 0.6, core: 1.0, legs: 1.2, glutes: 1.0 },
  rehab: { chest: 0.8, back: 1.2, shoulder: 0.8, arm: 0.6, core: 1.2, legs: 1.0, glutes: 1.2 },
};

export const GOAL_LABEL: Record<Goal, string> = {
  hypertrophy: '근비대', strength: '근력', fatLoss: '체지방 감량', health: '체력·건강 유지', rehab: '재활·자세',
};
export const LEVEL_LABEL: Record<Level, string> = {
  beginner: '입문 (3개월 미만)', novice: '초급 (3개월~1년)', intermediate: '중급 이상',
};

/**
 * 부위별 우선순위.
 * @param partVolumeShare (유료·선택) 최근 기록의 부위별 볼륨 비중 0~1. 적게 한 부위를 끌어올림.
 */
export function partPriorities(a: SurveyAnswers, partVolumeShare?: Partial<Record<BodyPart, number>>): PartPriority[] {
  const base = GOAL_PART_WEIGHT[a.goal];
  const raw = BODY_PARTS.map((part) => {
    if (a.avoidParts.includes(part)) return { part, score: 0 };
    let s = base[part];
    if (a.focusParts.includes(part)) s += 1.5;
    if (partVolumeShare) {
      const share = partVolumeShare[part] ?? 0;
      const fair = 1 / BODY_PARTS.length;
      s += Math.max(-0.5, Math.min(0.8, (fair - share) * 4)); // 부족하면 +, 과하면 -
    }
    return { part, score: Math.max(0.05, s) };
  });
  const max = Math.max(...raw.map((r) => r.score));
  return raw
    .map((r) => ({
      ...r,
      stars: (r.score === 0 ? 0 : r.score >= max * 0.8 ? 3 : r.score >= max * 0.55 ? 2 : 1) as 0 | 1 | 2 | 3,
    }))
    .sort((x, y) => y.score - x.score);
}

export function suggestSplit(a: SurveyAnswers): SplitSuggestion {
  if (a.freqPerWeek <= 2 || (a.level === 'beginner' && a.freqPerWeek <= 3)) {
    return { key: 'full', label: '무분할 (전신)', description: '매 회 전신을 골고루. 주 2~3회에 가장 효율적' };
  }
  if (a.freqPerWeek <= 4) {
    return { key: 'upperLower', label: '2분할 (상체 / 하체)', description: '상체·하체를 번갈아. 부위별 주 2회 자극' };
  }
  return { key: 'ppl', label: '3분할 (밀기 / 당기기 / 하체)', description: '주 5회 이상, 부위별 볼륨을 충분히' };
}

export interface Prescription {
  sets: number;
  reps: number;
  restDelta: number;
  weightFactor: number;
}

export function prescription(goal: Goal, level: Level): Prescription {
  const sets = level === 'beginner' ? 2 : 3;
  switch (goal) {
    case 'strength': return { sets: level === 'beginner' ? 3 : 4, reps: 6, restDelta: 30, weightFactor: 1 };
    case 'fatLoss': return { sets, reps: 15, restDelta: -15, weightFactor: 0.8 };
    case 'rehab': return { sets: 2, reps: 15, restDelta: 0, weightFactor: 0.6 };
    case 'health': return { sets, reps: 12, restDelta: 0, weightFactor: 0.9 };
    default: return { sets, reps: 10, restDelta: 0, weightFactor: 1 };
  }
}

/** 운동 1종 예상 소요(초): 세트 × (반복 × 회당시간 + 휴식) + 머신 이동·세팅 60초 */
export function estimateItemSec(item: Pick<RoutineItem, 'sets' | 'reps' | 'secPerRep' | 'restSec' | 'durationSec'>): number {
  const work = item.durationSec ?? item.reps * item.secPerRep;
  return item.sets * work + Math.max(0, item.sets - 1) * item.restSec + 60;
}

const PART_ORDER: BodyPart[] = ['legs', 'glutes', 'back', 'chest', 'shoulder', 'arm', 'core'];

export function exercisePart(e: Exercise): BodyPart {
  return MUSCLE_TO_PART[e.primary[0]!];
}

export interface ScoredExercise {
  exercise: Exercise;
  score: number;
  part: BodyPart;
  recommended: boolean;
}

/**
 * 운동 후보 점수화 + 추천 선택.
 * - 주동 부위가 회피 부위면 제외, 보조 부위가 회피 부위면 감점
 * - 입문자는 머신 가산, 고난도 프리웨이트 감점
 * - 같은 부위 반복 선택 시 감쇠 → 부위 다양성
 * - 운동 수는 1회 운동 시간에 맞춤
 */
export function recommendExercises(
  library: Exercise[],
  a: SurveyAnswers,
  partVolumeShare?: Partial<Record<BodyPart, number>>,
): ScoredExercise[] {
  const pri = new Map(partPriorities(a, partVolumeShare).map((p) => [p.part, p.score]));
  const HARD = new Set(['F01', 'F02', 'F09']);
  const scored: ScoredExercise[] = [];

  for (const e of library) {
    const part = exercisePart(e);
    const primaryParts = new Set(e.primary.map((mu) => MUSCLE_TO_PART[mu]));
    if ([...primaryParts].some((p) => a.avoidParts.includes(p))) continue;
    let s = 0;
    for (const p of primaryParts) s += pri.get(p) ?? 0;
    s = s / primaryParts.size + 0.15 * (primaryParts.size - 1);
    for (const mu of e.secondary) {
      const sp = MUSCLE_TO_PART[mu];
      s += a.avoidParts.includes(sp) ? -0.6 : 0.05 * (pri.get(sp) ?? 0);
    }
    s += (30 - Math.min(30, e.popularityRank)) * 0.01;
    if (a.level === 'beginner') {
      if (e.category === 'machine') s += 0.35;
      if (HARD.has(e.id)) s -= 0.6;
    }
    if (a.goal === 'strength' && e.category === 'free') s += 0.3;
    if (a.goal === 'rehab' && e.category === 'free') s -= 0.3;
    scored.push({ exercise: e, score: s, part, recommended: false });
  }

  // 시간 예산으로 운동 수 산정
  const rx = prescription(a.goal, a.level);
  // 워밍업 10분 제외, 운동당 이동·세팅·워밍업 세트 120초로 보수적으로 계산
  const avgWork = rx.sets * rx.reps * 3 + (rx.sets - 1) * (90 + rx.restDelta) + 120;
  const count = Math.max(3, Math.min(8, Math.floor(((a.minutesPerSession - 10) * 60) / avgWork)));

  // 그리디 + 부위 감쇠
  const pool = [...scored].sort((x, y) => y.score - x.score);
  const pickedPerPart = new Map<BodyPart, number>();
  const pickedPerPattern = new Map<string, number>();
  const picked = new Set<string>();
  while (picked.size < Math.min(count, pool.length)) {
    let best: ScoredExercise | undefined;
    let bestVal = -Infinity;
    for (const c of pool) {
      if (picked.has(c.exercise.id)) continue;
      const pat = patternOf(c.exercise.id);
      const patN = pat === 'isolation' ? 0 : pickedPerPattern.get(pat) ?? 0;
      const v = c.score * Math.pow(0.55, pickedPerPart.get(c.part) ?? 0) * Math.pow(0.4, patN);
      if (v > bestVal) { bestVal = v; best = c; }
    }
    if (!best) break;
    picked.add(best.exercise.id);
    pickedPerPart.set(best.part, (pickedPerPart.get(best.part) ?? 0) + 1);
    const bp = patternOf(best.exercise.id);
    pickedPerPattern.set(bp, (pickedPerPattern.get(bp) ?? 0) + 1);
  }
  for (const c of scored) c.recommended = picked.has(c.exercise.id);
  return scored.sort((x, y) => y.score - x.score);
}

/** 선택된 운동 → 루틴 아이템 (큰 근육 → 작은 근육, 같은 부위는 점수순) */
export function buildRoutineItems(selected: Exercise[], a: SurveyAnswers, secPerRep: SecPerRep = 3): RoutineItem[] {
  const rx = prescription(a.goal, a.level);
  const ordered = [...selected].sort((x, y) => {
    const d = PART_ORDER.indexOf(exercisePart(x)) - PART_ORDER.indexOf(exercisePart(y));
    if (d !== 0) return d;
    // 같은 부위: 프리웨이트(복합) 먼저
    return (x.category === 'free' ? 0 : 1) - (y.category === 'free' ? 0 : 1);
  });
  return ordered.map((e) => ({
    exerciseId: e.id,
    sets: rx.sets,
    // 고립 운동은 근력 목표여도 저반복 고중량이 부적합 → 최소 10회
    reps: e.mode === 'time' ? 1 : patternOf(e.id) === 'isolation' ? Math.max(rx.reps, 10) : rx.reps,
    durationSec: e.mode === 'time' ? e.defaultDurationSec ?? 30 : undefined,
    weightKg: roundToStep(e.defaultWeightKg * rx.weightFactor, e.weightStepKg),
    secPerRep,
    restSec: Math.max(30, e.defaultRestSec + rx.restDelta),
  }));
}

export function roundToStep(v: number, step: number): number {
  const r = Math.round(v / step) * step;
  return Math.max(0, Number(r.toFixed(2)));
}
