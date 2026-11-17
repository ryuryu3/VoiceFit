/**
 * @hc/workout-engine — 입력 소스와 무관한 운동 진행 상태머신 (음성앱·비전앱 공용)
 *
 * 설계 원칙
 * - 순수 리듀서: reduce(state, action, nowMs) → { state, cues }
 *   · 시계는 밖에서 주입(now) → 테스트에서 가짜 시계 사용, 앱이 백그라운드에서 돌아와도 경과 시간으로 따라잡음
 *   · state는 JSON 직렬화 가능 → 매 이벤트마다 저장해두면 앱이 죽어도 이어서 진행
 * - repSource
 *   · 'timer'   : 회당 시간(secPerRep)마다 엔진이 스스로 반복을 진행 (음성앱)
 *   · 'external': REP 액션이 들어올 때만 반복 진행 (비전앱 포즈 추정)
 * - 화면·음성은 cues(이벤트)만 받아서 처리 → UI/음성 교체 시 엔진 수정 불필요
 */
import type { RepSource, RoutineItem, SetLog } from '@hc/core-domain';

export const COUNTDOWN_SEC = 3;
export const REST_WARN_SEC = 10;

export type Phase = 'ready' | 'countdown' | 'working' | 'rest' | 'finished';

export interface EngineItem extends RoutineItem {
  key: string;
  setsDone: number;
  skipped: boolean;
}

export interface EngineState {
  v: 1;
  repSource: 'timer' | 'external';
  autoStartNextSet: boolean;
  items: EngineItem[];
  /** 진행 순서 (key). order[0]이 현재 운동. 완료된 항목은 doneOrder로 이동 */
  order: string[];
  doneOrder: string[];
  phase: Phase;
  phaseStartedAt: number;
  /** external 모드에서 현재 세트의 반복 수 */
  extReps: number;
  /** timer 모드에서 마지막으로 큐를 낸 반복 번호 (중복 큐 방지) */
  lastRepCued: number;
  restWarned: boolean;
  paused: boolean;
  pausedAt: number;
  startedAt: number;
  endedAt: number;
  /** 일시정지를 제외한 순수 경과 시간 계산용 */
  pausedTotalMs: number;
  logs: SetLog[];
}

export type Action =
  | { type: 'START' } // ready → countdown
  | { type: 'TICK' }
  | { type: 'REP' } // external 모드 반복 1회
  | { type: 'COMPLETE_SET' } // 탭 = 세트 즉시 완료
  | { type: 'SKIP_REST' }
  | { type: 'DEFER' } // 점유중 → 나중에
  | { type: 'SWITCH_TO'; key: string } // 다른 운동을 지금 하기 (현재 운동은 다음으로)
  | { type: 'REORDER'; upcoming: string[] } // 현재 운동 이후 순서 변경
  | { type: 'SET_WEIGHT'; key: string; weightKg: number }
  | { type: 'SKIP_EXERCISE' }
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  | { type: 'FINISH' };

export type Cue =
  | { type: 'announce'; key: string; setNo: number; sets: number; reps: number; weightKg: number; durationSec?: number }
  | { type: 'countdown'; n: number }
  | { type: 'go' }
  | { type: 'rep'; n: number; total: number; lastThree: boolean }
  | { type: 'timeLeft'; sec: number }
  | { type: 'setDone'; key: string; setNo: number }
  | { type: 'restStart'; sec: number; nextKey: string; nextIsNewExercise: boolean }
  | { type: 'restWarn'; sec: number; autoStart: boolean }
  | { type: 'exerciseDone'; key: string }
  | { type: 'nextExercise'; key: string }
  | { type: 'finished' };

export interface Result {
  state: EngineState;
  cues: Cue[];
}

export interface CreateOptions {
  repSource?: 'timer' | 'external';
  autoStartNextSet?: boolean;
}

export function createSession(items: RoutineItem[], now: number, opt: CreateOptions = {}): EngineState {
  const engineItems = items.map((it, i) => ({ ...it, key: `k${i}`, setsDone: 0, skipped: false }));
  return {
    v: 1,
    repSource: opt.repSource ?? 'timer',
    autoStartNextSet: opt.autoStartNextSet ?? true,
    items: engineItems,
    order: engineItems.map((i) => i.key),
    doneOrder: [],
    phase: engineItems.length ? 'ready' : 'finished',
    phaseStartedAt: now,
    extReps: 0,
    lastRepCued: 0,
    restWarned: false,
    paused: false,
    pausedAt: 0,
    startedAt: now,
    endedAt: engineItems.length ? 0 : now,
    pausedTotalMs: 0,
    logs: [],
  };
}

// ───────────────────────── helpers ─────────────────────────
export function itemByKey(s: EngineState, key: string): EngineItem {
  const it = s.items.find((i) => i.key === key);
  if (!it) throw new Error(`no item ${key}`);
  return it;
}
export function currentItem(s: EngineState): EngineItem | undefined {
  const k = s.order[0];
  return k ? itemByKey(s, k) : undefined;
}
function isTime(it: RoutineItem) {
  return it.durationSec != null && it.durationSec > 0;
}
/** 한 세트 작업 시간(초) — timer 모드 */
export function workSec(it: RoutineItem): number {
  return isTime(it) ? it.durationSec! : it.reps * it.secPerRep;
}

function clone(s: EngineState): EngineState {
  return {
    ...s,
    items: s.items.map((i) => ({ ...i })),
    order: [...s.order],
    doneOrder: [...s.doneOrder],
    logs: [...s.logs],
  };
}

function setPhase(s: EngineState, phase: Phase, at: number) {
  s.phase = phase;
  s.phaseStartedAt = at;
  s.lastRepCued = 0;
  s.extReps = 0;
  s.restWarned = false;
}

function announce(s: EngineState, cues: Cue[]) {
  const it = currentItem(s);
  if (!it) return;
  cues.push({
    type: 'announce', key: it.key, setNo: it.setsDone + 1, sets: it.sets,
    reps: it.reps, weightKg: it.weightKg, durationSec: it.durationSec,
  });
}

function beginCountdown(s: EngineState, at: number, cues: Cue[]) {
  setPhase(s, 'countdown', at);
  announce(s, cues);
  cues.push({ type: 'countdown', n: COUNTDOWN_SEC });
}

function finish(s: EngineState, at: number, cues: Cue[]) {
  setPhase(s, 'finished', at);
  s.endedAt = at;
  cues.push({ type: 'finished' });
}

/** 현재 세트를 기록하고 다음 단계로 (휴식 / 다음 운동 / 종료) */
function completeSet(s: EngineState, at: number, reps: number, source: RepSource, cues: Cue[]) {
  const it = currentItem(s);
  if (!it) return;
  it.setsDone += 1;
  s.logs.push({
    exerciseId: it.exerciseId, setNo: it.setsDone, reps, weightKg: it.weightKg,
    source, skipped: false, endedAt: new Date(at).toISOString(),
  });
  cues.push({ type: 'setDone', key: it.key, setNo: it.setsDone });

  if (it.setsDone >= it.sets) {
    cues.push({ type: 'exerciseDone', key: it.key });
    s.order.shift();
    s.doneOrder.push(it.key);
    const next = currentItem(s);
    if (!next) return finish(s, at, cues);
    // 운동 사이: 이동·세팅 시간이 사람마다 달라 자동 시작하지 않고 대기(ready). 휴식 타이머는 표시.
    setPhase(s, 'rest', at);
    cues.push({ type: 'restStart', sec: it.restSec, nextKey: next.key, nextIsNewExercise: true });
    cues.push({ type: 'nextExercise', key: next.key });
    return;
  }
  setPhase(s, 'rest', at);
  cues.push({ type: 'restStart', sec: it.restSec, nextKey: it.key, nextIsNewExercise: false });
}

/** 휴식을 마친 직후 어떤 휴식이었는지 판단: 현재 항목이 아직 한 세트도 안 했으면 '운동 사이' 휴식 */
function restIsBetweenExercises(s: EngineState): boolean {
  const it = currentItem(s);
  return !!it && it.setsDone === 0;
}

function restSecOf(s: EngineState): number {
  // 운동 사이 휴식은 직전 완료 운동의 휴식 시간, 세트 사이는 현재 운동의 휴식 시간
  if (restIsBetweenExercises(s)) {
    const prevKey = s.doneOrder[s.doneOrder.length - 1];
    return prevKey ? itemByKey(s, prevKey).restSec : 60;
  }
  return currentItem(s)?.restSec ?? 60;
}

/** 기록·화면 갱신에 필요한 큐 (지나간 것이어도 버리지 않음) */
const STATE_CUES = new Set<Cue['type']>(['setDone', 'exerciseDone', 'finished']);
/** 단계 진입을 알리는 큐 */
const PHASE_ENTRY = new Set<Cue['type']>(['go', 'restStart', 'announce', 'finished']);
function lastIndexOfPhaseEntry(cues: Cue[]): number {
  for (let i = cues.length - 1; i >= 0; i--) if (PHASE_ENTRY.has(cues[i]!.type)) {
    // announce 직후 countdown 큐가 붙으므로 announce부터 포함
    return i;
  }
  return 0;
}

// ───────────────────────── reducer ─────────────────────────
export function reduce(prev: EngineState, action: Action, now: number): Result {
  const s = clone(prev);
  const cues: Cue[] = [];
  if (s.phase === 'finished') return { state: prev, cues };

  // 일시정지 중에는 RESUME/FINISH/편집 액션만
  if (s.paused && !['RESUME', 'FINISH', 'SET_WEIGHT', 'REORDER'].includes(action.type)) {
    return { state: prev, cues };
  }

  switch (action.type) {
    case 'START': {
      if (s.phase === 'ready' || s.phase === 'rest') beginCountdown(s, now, cues);
      break;
    }
    case 'TICK': {
      const startPhaseAt = s.phaseStartedAt;
      advanceTime(s, now, cues);
      // 한 번의 TICK에서 단계가 여러 번 바뀌었다면(백그라운드 복귀) 지나간 단계의 음성성 큐는 버림
      if (s.phaseStartedAt !== startPhaseAt && cues.filter((c) => PHASE_ENTRY.has(c.type)).length >= 2) {
        const lastPhaseIdx = lastIndexOfPhaseEntry(cues);
        const kept = cues.filter((c, i) => i >= lastPhaseIdx || STATE_CUES.has(c.type));
        cues.length = 0;
        cues.push(...kept);
      }
      break;
    }
    case 'REP': {
      if (s.repSource !== 'external' || s.phase !== 'working') break;
      const it = currentItem(s)!;
      s.extReps += 1;
      cues.push({ type: 'rep', n: s.extReps, total: it.reps, lastThree: it.reps - s.extReps <= 3 && s.extReps < it.reps });
      if (s.extReps >= it.reps) completeSet(s, now, s.extReps, 'vision', cues);
      break;
    }
    case 'COMPLETE_SET': {
      if (s.phase === 'working' || s.phase === 'countdown') {
        const it = currentItem(s)!;
        completeSet(s, now, isTime(it) ? 1 : it.reps, 'manual', cues);
      }
      break;
    }
    case 'SKIP_REST': {
      if (s.phase === 'rest') beginCountdown(s, now, cues);
      break;
    }
    case 'DEFER': {
      if (s.order.length < 2) break;
      // 진행 중이던 세트는 기록하지 않고 버림, 완료한 세트는 유지
      const k = s.order.shift()!;
      s.order.push(k);
      setPhase(s, 'ready', now);
      const next = currentItem(s)!;
      cues.push({ type: 'nextExercise', key: next.key });
      announce(s, cues);
      break;
    }
    case 'SWITCH_TO': {
      const idx = s.order.indexOf(action.key);
      if (idx <= 0) break;
      s.order.splice(idx, 1);
      const cur = s.order.shift()!;
      s.order.unshift(action.key, cur);
      setPhase(s, 'ready', now);
      cues.push({ type: 'nextExercise', key: action.key });
      announce(s, cues);
      break;
    }
    case 'REORDER': {
      const upcoming = s.order.slice(1);
      const same = upcoming.length === action.upcoming.length && upcoming.every((k) => action.upcoming.includes(k));
      if (!same) break;
      s.order = [s.order[0]!, ...action.upcoming];
      break;
    }
    case 'SET_WEIGHT': {
      const it = s.items.find((i) => i.key === action.key);
      if (it && action.weightKg >= 0) it.weightKg = action.weightKg;
      break;
    }
    case 'SKIP_EXERCISE': {
      const it = currentItem(s);
      if (!it) break;
      for (let n = it.setsDone + 1; n <= it.sets; n++) {
        s.logs.push({
          exerciseId: it.exerciseId, setNo: n, reps: 0, weightKg: it.weightKg,
          source: 'manual', skipped: true, endedAt: new Date(now).toISOString(),
        });
      }
      it.skipped = true;
      s.order.shift();
      s.doneOrder.push(it.key);
      if (!currentItem(s)) { finish(s, now, cues); break; }
      setPhase(s, 'ready', now);
      cues.push({ type: 'nextExercise', key: s.order[0]! });
      announce(s, cues);
      break;
    }
    case 'PAUSE': {
      if (!s.paused) { s.paused = true; s.pausedAt = now; }
      break;
    }
    case 'RESUME': {
      if (s.paused) {
        const d = now - s.pausedAt;
        s.phaseStartedAt += d;
        s.pausedTotalMs += d;
        s.paused = false;
      }
      break;
    }
    case 'FINISH':
      if (s.paused) { s.pausedTotalMs += now - s.pausedAt; s.paused = false; }
      finish(s, now, cues);
      break;
  }
  return { state: s, cues };
}

/** 경과 시간에 따라 단계 진행. 백그라운드에서 오래 멈췄다 돌아와도 여러 단계를 한 번에 따라잡음. */
function advanceTime(s: EngineState, now: number, cues: Cue[]) {
  for (let guard = 0; guard < 500; guard++) {
    const el = (now - s.phaseStartedAt) / 1000;
    const it = currentItem(s);
    if (!it) return;

    if (s.phase === 'countdown') {
      if (el >= COUNTDOWN_SEC) {
        const at = s.phaseStartedAt + COUNTDOWN_SEC * 1000;
        setPhase(s, 'working', at);
        cues.push({ type: 'go' });
        continue;
      }
      const n = COUNTDOWN_SEC - Math.floor(el);
      if (n < COUNTDOWN_SEC && n !== s.lastRepCued * -1 && n > 0) {
        // lastRepCued를 음수로 재사용해 카운트다운 중복 방지
        s.lastRepCued = -n;
        cues.push({ type: 'countdown', n });
      }
      return;
    }

    if (s.phase === 'working') {
      if (s.repSource === 'external') return;
      const total = workSec(it);
      if (isTime(it)) {
        // 10초마다 남은 시간 안내
        const passed = Math.floor(el / 10);
        if (passed > s.lastRepCued && passed * 10 < total) {
          s.lastRepCued = passed;
          cues.push({ type: 'timeLeft', sec: total - passed * 10 });
        }
      } else {
        // 반복 n은 n*secPerRep 시점에 '완료' → 그때 "n" 호명 (완료한 횟수를 셈)
        const repsDone = Math.min(it.reps, Math.floor(el / it.secPerRep + 1e-9));
        // 백그라운드에서 오래 멈췄다 돌아온 경우 지난 반복을 몰아서 부르지 않음
        if (repsDone - s.lastRepCued > 1) s.lastRepCued = repsDone - 1;
        if (s.lastRepCued < repsDone) {
          s.lastRepCued = repsDone;
          cues.push({ type: 'rep', n: repsDone, total: it.reps, lastThree: it.reps - repsDone <= 3 && repsDone < it.reps });
        }
      }
      if (el >= total) {
        completeSet(s, s.phaseStartedAt + total * 1000, isTime(it) ? 1 : it.reps, 'timer', cues);
        continue;
      }
      return;
    }

    if (s.phase === 'rest') {
      const rest = restSecOf(s);
      if (!s.restWarned && rest > REST_WARN_SEC && el >= rest - REST_WARN_SEC && el < rest) {
        s.restWarned = true;
        cues.push({ type: 'restWarn', sec: REST_WARN_SEC, autoStart: s.autoStartNextSet && !restIsBetweenExercises(s) });
      }
      if (el >= rest) {
        const at = s.phaseStartedAt + rest * 1000;
        if (s.autoStartNextSet && !restIsBetweenExercises(s)) {
          beginCountdown(s, at, cues);
          continue;
        }
        setPhase(s, 'ready', at);
        announce(s, cues);
        return;
      }
      return;
    }
    return; // ready
  }
}

// ───────────────────────── view model ─────────────────────────
export interface Snapshot {
  phase: Phase;
  paused: boolean;
  current?: EngineItem;
  setNo: number;
  /** 완료한 반복 수 */
  rep: number;
  /** 진행 중인 반복의 진행률 0~1 (timer 모드) */
  repProgress: number;
  /** 현재 단계 남은 초 (countdown / working / rest) */
  phaseLeftSec: number;
  phaseTotalSec: number;
  upcoming: EngineItem[];
  done: EngineItem[];
  totalSets: number;
  doneSets: number;
  /** 남은 예상 시간(초) */
  remainingSec: number;
  activeSec: number;
}

export function snapshot(s: EngineState, now: number): Snapshot {
  const ref = s.paused ? s.pausedAt : now;
  const el = Math.max(0, (ref - s.phaseStartedAt) / 1000);
  const cur = currentItem(s);
  let phaseTotal = 0;
  let rep = 0;
  let repProgress = 0;
  if (s.phase === 'countdown') phaseTotal = COUNTDOWN_SEC;
  else if (s.phase === 'working' && cur) {
    phaseTotal = workSec(cur);
    if (s.repSource === 'external') rep = s.extReps;
    else if (!isTime(cur)) {
      rep = Math.min(cur.reps, Math.floor(el / cur.secPerRep + 1e-9));
      repProgress = rep >= cur.reps ? 1 : (el % cur.secPerRep) / cur.secPerRep;
    }
  } else if (s.phase === 'rest') phaseTotal = restSecOf(s);
  const phaseLeft = s.phase === 'ready' || s.phase === 'finished' ? 0 : Math.max(0, Math.ceil(phaseTotal - el));

  const upcoming = s.order.slice(1).map((k) => itemByKey(s, k));
  const done = s.doneOrder.map((k) => itemByKey(s, k));
  const totalSets = s.items.reduce((a, i) => a + i.sets, 0);
  const doneSets = s.logs.length;

  // 남은 시간: 현재 단계 남은 시간 + 현재 운동 남은 세트 + 이후 운동 (세트 작업+휴식+이동 60초)
  let remaining = phaseLeft;
  if (cur) {
    const curLeftSets = cur.sets - cur.setsDone - (s.phase === 'working' || s.phase === 'countdown' ? 1 : 0);
    remaining += Math.max(0, curLeftSets) * (workSec(cur) + cur.restSec + COUNTDOWN_SEC);
    if (s.phase === 'working') remaining += cur.restSec;
  }
  for (const u of upcoming) remaining += u.sets * (workSec(u) + COUNTDOWN_SEC) + (u.sets - 1) * u.restSec + 60;
  if (s.phase === 'finished') remaining = 0;

  const end = s.endedAt || ref;
  const activeSec = Math.max(0, Math.round((end - s.startedAt - s.pausedTotalMs) / 1000));

  return {
    phase: s.phase, paused: s.paused, current: cur, setNo: cur ? Math.min(cur.sets, cur.setsDone + 1) : 0,
    rep, repProgress, phaseLeftSec: phaseLeft, phaseTotalSec: phaseTotal, upcoming, done,
    totalSets, doneSets, remainingSec: Math.round(remaining), activeSec,
  };
}

/**
 * 세션 종료 후 루틴에 되돌려 저장할 중량(설정 기억).
 * 마지막 세트만 지쳐서 낮춘 경우가 다음 기본값이 되지 않도록, 완료 세트에서 가장 많이 쓴 중량(동률이면 무거운 쪽)을 사용.
 * 완료 세트가 없으면 운동 중 마지막으로 설정한 중량.
 */
export function weightChanges(s: EngineState): Record<string, number> {
  const out: Record<string, number> = {};
  for (const it of s.items) {
    const logs = s.logs.filter((l) => l.exerciseId === it.exerciseId && !l.skipped);
    if (!logs.length) { out[it.exerciseId] = it.weightKg; continue; }
    const count = new Map<number, number>();
    for (const l of logs) count.set(l.weightKg, (count.get(l.weightKg) ?? 0) + 1);
    out[it.exerciseId] = [...count.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]![0];
  }
  return out;
}
