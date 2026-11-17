import type { Exercise, Tier } from '@hc/core-domain';
import { EXERCISES } from './exercises';
import { REPDB_CREDIT, REPDB_FRAMES, REPDB_MUSCLE_IMG, REPDB_URL } from './repdb.generated';

export * from './recommend';
export { patternOf, type Pattern } from './exercises';
export { REPDB_CREDIT, REPDB_URL };

/** 라이브러리 데이터 버전 — 운동 추가 시 증가 (앱 업데이트 없이 데이터만 교체 가능하도록) */
export const LIBRARY_VERSION = '2026.10-60';

/**
 * 인기 순위를 1..N 정수로 정규화하고, RepDB 포즈 프레임(시작·정점)을 모션에 연결한 라이브러리.
 * 썸네일 = 시작 프레임.
 */
export const LIBRARY: Exercise[] = [...EXERCISES]
  .sort((a, b) => a.popularityRank - b.popularityRank)
  .map((e, i) => {
    const frames = REPDB_FRAMES[e.id];
    return {
      ...e,
      popularityRank: i + 1,
      motion: frames ? { ...e.motion, frames, thumb: e.motion.thumb ?? frames.start, credit: REPDB_CREDIT } : e.motion,
    };
  });

/** 근육 이미지 경로 (RepDB 근육 일러스트) */
export function muscleImage(m: string): string | undefined {
  return REPDB_MUSCLE_IMG[m];
}

/**
 * 포즈 프레임 전환 곡선 — 회당 시간 안에서 시작→정점→시작.
 * 반환값 = 정점 프레임 불투명도(0~1). 시작 자세 유지 → 빠르게 전환 → 정점 유지 → 복귀.
 * 두 컷은 카메라 위치가 조금 달라 길게 겹치면 잔상이 보이므로 전환 구간을 짧게(각 15%) 둠.
 */
export function peakOpacity(repProgress: number): number {
  const t = ((repProgress % 1) + 1) % 1;
  const ss = (a: number, b: number, x: number) => {
    const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return k * k * (3 - 2 * k);
  };
  return ss(0.25, 0.4, t) - ss(0.8, 0.95, t);
}

const BY_ID = new Map(LIBRARY.map((e) => [e.id, e]));

export function getExercise(id: string): Exercise {
  const e = BY_ID.get(id);
  if (!e) throw new Error(`Unknown exercise id: ${id}`);
  return e;
}

export function findExercise(id: string): Exercise | undefined {
  return BY_ID.get(id);
}

/**
 * 유료 기능 게이트. 썸네일·요령은 항상 무료.
 * 모션 재생은 motionTier === 'free'이거나 pro 이용권이 있을 때만.
 */
export function canPlayMotion(e: Exercise, entitlement: Tier): boolean {
  return e.motionTier === 'free' || entitlement === 'pro';
}

/** 영상 재생 속도 = 원본 루프 길이 / 설정한 회당 시간 */
export function motionPlaybackRate(e: Exercise, secPerRep: number): number {
  const r = e.motion.loopBaseSec / secPerRep;
  return Math.max(0.25, Math.min(4, r));
}
