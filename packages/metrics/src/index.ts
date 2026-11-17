/**
 * @hc/metrics — 볼륨·칼로리·부위 분포·캘린더·스트릭 (음성앱·비전앱 공용)
 */
import { BODY_PARTS, MUSCLE_TO_PART, localDateKey, type BodyPart, type Session, type SetLog } from '@hc/core-domain';
import { findExercise } from '@hc/exercise-library';

export const DEFAULT_BODY_WEIGHT_KG = 70;

/** 세트 1개의 볼륨(kg). 어시스티드는 (체중 - 보조), 건너뛴 세트는 0 */
export function setVolume(log: SetLog, bodyWeightKg = DEFAULT_BODY_WEIGHT_KG): number {
  if (log.skipped) return 0;
  const ex = findExercise(log.exerciseId);
  const load = ex?.assisted ? Math.max(0, bodyWeightKg - log.weightKg) : log.weightKg;
  return load * log.reps;
}

export function totalVolume(logs: SetLog[], bodyWeightKg?: number): number {
  return Math.round(logs.reduce((a, l) => a + setVolume(l, bodyWeightKg), 0));
}

/**
 * 추정 칼로리 = 가중평균 MET × 체중(kg) × 운동시간(h)
 * MET는 완료 세트 수로 가중 평균. 저항운동 MET는 세트 사이 휴식을 포함한 평균값이므로 전체 시간에 적용.
 */
export function estimateKcal(logs: SetLog[], activeSec: number, bodyWeightKg = DEFAULT_BODY_WEIGHT_KG): number {
  const done = logs.filter((l) => !l.skipped);
  if (!done.length || activeSec <= 0) return 0;
  const met = done.reduce((a, l) => a + (findExercise(l.exerciseId)?.met ?? 4.5), 0) / done.length;
  return Math.round(met * bodyWeightKg * (activeSec / 3600));
}

/** 부위별 볼륨 — 주동근 부위에 균등 배분 */
export function partVolume(logs: SetLog[], bodyWeightKg?: number): Record<BodyPart, number> {
  const out = Object.fromEntries(BODY_PARTS.map((p) => [p, 0])) as Record<BodyPart, number>;
  for (const l of logs) {
    const ex = findExercise(l.exerciseId);
    if (!ex) continue;
    const parts = [...new Set(ex.primary.map((m) => MUSCLE_TO_PART[m]))];
    const v = setVolume(l, bodyWeightKg);
    for (const p of parts) out[p] += v / parts.length;
  }
  for (const p of BODY_PARTS) out[p] = Math.round(out[p]);
  return out;
}

/** 부위별 '세트 수' 분포 — 볼륨은 하체가 과대평가되므로 추천 보정에는 세트 수 비중을 사용 */
export function partSetShare(sessions: Session[]): Partial<Record<BodyPart, number>> {
  const cnt = Object.fromEntries(BODY_PARTS.map((p) => [p, 0])) as Record<BodyPart, number>;
  let total = 0;
  for (const s of sessions) for (const l of s.logs) {
    if (l.skipped) continue;
    const ex = findExercise(l.exerciseId);
    if (!ex) continue;
    const parts = [...new Set(ex.primary.map((m) => MUSCLE_TO_PART[m]))];
    for (const p of parts) cnt[p] += 1 / parts.length;
    total += 1;
  }
  if (!total) return {};
  return Object.fromEntries(BODY_PARTS.map((p) => [p, cnt[p] / total]));
}

/** 세션 요약에서 대표 부위(볼륨 상위 2개) */
export function mainParts(logs: SetLog[], n = 2): BodyPart[] {
  const pv = partVolume(logs);
  const sets = Object.fromEntries(BODY_PARTS.map((p) => [p, 0])) as Record<BodyPart, number>;
  for (const l of logs) {
    if (l.skipped) continue;
    const ex = findExercise(l.exerciseId);
    if (ex) sets[MUSCLE_TO_PART[ex.primary[0]!]] += 1;
  }
  return BODY_PARTS.filter((p) => sets[p] > 0)
    .sort((a, b) => sets[b] - sets[a] || pv[b] - pv[a])
    .slice(0, n);
}

export interface DayEntry {
  date: string;
  sessions: Session[];
  volume: number;
  kcal: number;
  activeSec: number;
  /** 1~3: 사용자 본인 기록 대비 강도 (진하기) */
  level: 1 | 2 | 3;
}

/** 날짜별 집계 + 본인 기록 분위수 기준 강도 단계 */
export function calendarDays(sessions: Session[]): Map<string, DayEntry> {
  const map = new Map<string, DayEntry>();
  for (const s of sessions) {
    const e = map.get(s.date) ?? { date: s.date, sessions: [], volume: 0, kcal: 0, activeSec: 0, level: 1 as const };
    e.sessions.push(s);
    e.volume += s.totalVolumeKg;
    e.kcal += s.kcal;
    e.activeSec += s.activeSec;
    map.set(s.date, e);
  }
  // 본인 기록 내 순위(삼분위)로 1~3단계
  const vols = [...map.values()].map((e) => e.volume).sort((a, b) => a - b);
  for (const e of map.values()) {
    if (vols.length < 3) { e.level = 2; continue; }
    const rank = vols.indexOf(e.volume);
    e.level = (1 + Math.min(2, Math.floor((3 * rank) / vols.length))) as 1 | 2 | 3;
  }
  return map;
}

function addDays(key: string, d: number): string {
  const [y, m, day] = key.split('-').map(Number) as [number, number, number];
  return localDateKey(new Date(y, m - 1, day + d));
}

/** 연속 운동일. 오늘 아직 안 했으면 어제까지 이어진 연속일 */
export function streak(dates: Iterable<string>, today: string): number {
  const set = new Set(dates);
  let cur = set.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (set.has(cur)) { n++; cur = addDays(cur, -1); }
  return n;
}

export function monthCount(dates: Iterable<string>, yearMonth: string): number {
  let n = 0;
  for (const d of new Set(dates)) if (d.startsWith(yearMonth)) n++;
  return n;
}

/** 같은 루틴 직전 세션 대비 볼륨 증감(%) */
export function volumeDeltaPct(current: Session, history: Session[]): number | null {
  const prev = history
    .filter((s) => s.id !== current.id && s.routineId === current.routineId && s.endedAt < current.endedAt)
    .sort((a, b) => b.endedAt.localeCompare(a.endedAt))[0];
  if (!prev || prev.totalVolumeKg <= 0) return null;
  return Math.round(((current.totalVolumeKg - prev.totalVolumeKg) / prev.totalVolumeKg) * 100);
}
