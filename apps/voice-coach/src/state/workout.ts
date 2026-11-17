import { create } from 'zustand';
import { localDateKey, uid, type Routine, type Session } from '@hc/core-domain';
import { createSession, itemByKey, reduce, snapshot, weightChanges, type Action, type EngineState, type Snapshot } from '@hc/workout-engine';
import { estimateKcal, totalVolume, DEFAULT_BODY_WEIGHT_KG } from '@hc/metrics';
import { repo } from '../lib/repo';
import { nameOfExercise, playCues, say, unlockAudio } from '../lib/voice';
import { bindMediaSession, startKeepAlive, stopKeepAlive, updateMediaSession } from '../lib/keepAlive';
import { diag, diagTick } from '../lib/diag';
import { mmss } from '../lib/format';
import { useApp } from './app';

/**
 * 운동 실행기 — 엔진(순수 리듀서)을 시계·음성·저장에 연결.
 *  - 200ms TICK (화면 갱신용 스냅샷은 매 TICK 갱신)
 *  - 화면 복귀(visibilitychange) 시 즉시 TICK → 경과 시간 따라잡기
 *  - 상태가 바뀌는 액션마다 activeSession 저장 → 앱이 종료돼도 이어서
 */
interface WorkoutState {
  engine?: EngineState;
  snap?: Snapshot;
  sessionId?: string;
  routineId?: string;
  finishedSessionId?: string;

  start(routine: Routine): Promise<void>;
  resume(): Promise<boolean>;
  dispatch(a: Action): void;
  finishAndSave(): Promise<string | undefined>;
  discard(): Promise<void>;
}

let timer: ReturnType<typeof setInterval> | undefined;
let lastSaved = 0;

function persist(force = false) {
  const s = useWorkout.getState();
  if (!s.engine || !s.sessionId || !s.routineId) return;
  const now = Date.now();
  if (!force && now - lastSaved < 3000) return;
  lastSaved = now;
  void repo.saveActive({ sessionId: s.sessionId, routineId: s.routineId, app: 'voice', engineState: s.engine });
}

function run(a: Action) {
  const st = useWorkout.getState();
  if (!st.engine) return;
  const now = Date.now();
  if (a.type === 'TICK') diagTick(now);
  const { state, cues } = reduce(st.engine, a, now);
  const settings = useApp.getState().settings;
  if (cues.length) {
    playCues(cues, {
      settings, phase: state.phase,
      nameOf: (key) => nameOfExercise(itemByKey(state, key).exerciseId),
    });
  }
  const snap = snapshot(state, now);
  useWorkout.setState({ engine: state, snap });
  syncMedia(snap);
  if (state !== st.engine && (a.type !== 'TICK' || cues.length)) persist(a.type !== 'TICK');
  else persist(false);
  if (state.phase === 'finished' && st.engine.phase !== 'finished') stopLoop();
}

function syncMedia(s: Snapshot) {
  const cur = s.current;
  if (!cur) return;
  const name = nameOfExercise(cur.exerciseId);
  const status =
    s.phase === 'rest' ? `휴식 ${mmss(s.phaseLeftSec)}` :
    s.phase === 'working' ? `${s.setNo}/${cur.sets}세트 · ${s.rep}/${cur.reps}회` :
    s.phase === 'countdown' ? '곧 시작' : '대기 중';
  updateMediaSession(name, status, s.paused);
}

function onVisibility() {
  if (document.visibilityState === 'visible') run({ type: 'TICK' });
}

function startLoop() {
  stopLoop();
  timer = setInterval(() => run({ type: 'TICK' }), 200);
  document.addEventListener('visibilitychange', onVisibility);
  bindMediaSession({
    onPlay: () => {
      const e = useWorkout.getState().engine;
      if (e?.paused) run({ type: 'RESUME' });
      else if (e?.phase === 'ready') run({ type: 'START' });
    },
    onPause: () => run({ type: 'PAUSE' }),
    // 이어폰 '다음' = 지금 단계에서 자연스러운 다음 동작
    onNext: () => {
      const e = useWorkout.getState().engine;
      if (!e) return;
      if (e.phase === 'ready') run({ type: 'START' });
      else if (e.phase === 'rest') run({ type: 'SKIP_REST' });
      else run({ type: 'COMPLETE_SET' });
    },
    onPrev: () => run({ type: 'DEFER' }),
  });
}

function stopLoop() {
  clearInterval(timer);
  timer = undefined;
  document.removeEventListener('visibilitychange', onVisibility);
}

export const useWorkout = create<WorkoutState>((set, get) => ({
  async start(routine) {
    unlockAudio();
    const settings = useApp.getState().settings;
    await startKeepAlive(settings.backgroundAudio);
    const now = Date.now();
    const engine = createSession(routine.items, now, { repSource: 'timer', autoStartNextSet: settings.autoStartNextSet });
    set({ engine, snap: snapshot(engine, now), sessionId: uid('s_'), routineId: routine.id, finishedSessionId: undefined });
    diag('session', 'start');
    persist(true);
    startLoop();
    // 첫 운동은 기구로 이동할 시간이 필요하므로 대기 상태로 안내만
    const first = engine.items[0];
    if (first && settings.voiceEnabled) say(`첫 운동은 ${nameOfExercise(first.exerciseId)}. 준비되면 시작을 누르세요`);
  },

  async resume() {
    const rec = await repo.getActive();
    if (!rec) return false;
    const engine = rec.engineState as EngineState;
    if (!engine || engine.v !== 1 || engine.phase === 'finished') { await repo.clearActive(); return false; }
    set({ engine, sessionId: rec.sessionId, routineId: rec.routineId, snap: snapshot(engine, Date.now()) });
    diag('session', 'resume');
    unlockAudio();
    await startKeepAlive(useApp.getState().settings.backgroundAudio);
    startLoop();
    run({ type: 'TICK' });
    return true;
  },

  dispatch(a) {
    if (a.type === 'START' || a.type === 'RESUME') unlockAudio();
    run(a);
  },

  async finishAndSave() {
    const st = get();
    if (!st.engine || !st.sessionId || !st.routineId) return undefined;
    let engine = st.engine;
    if (engine.phase !== 'finished') engine = reduce(engine, { type: 'FINISH' }, Date.now()).state;
    stopLoop();
    stopKeepAlive();
    const snap = snapshot(engine, Date.now());
    const done = engine.logs.filter((l) => !l.skipped);
    if (!done.length) {
      await repo.clearActive();
      set({ engine: undefined, snap: undefined, sessionId: undefined });
      return undefined;
    }
    const bw = useApp.getState().profile?.weightKg ?? DEFAULT_BODY_WEIGHT_KG;
    const session: Omit<Session, 'schemaVersion'> = {
      id: st.sessionId,
      date: localDateKey(new Date(engine.startedAt)),
      routineId: st.routineId,
      app: 'voice',
      startedAt: new Date(engine.startedAt).toISOString(),
      endedAt: new Date(engine.endedAt || Date.now()).toISOString(),
      activeSec: snap.activeSec,
      logs: engine.logs,
      totalVolumeKg: totalVolume(engine.logs, bw),
      kcal: estimateKcal(engine.logs, snap.activeSec, bw),
    };
    await repo.addSession(session);
    // 설정 기억: 운동 중 바꾼 중량을 다음 회차 기본값으로
    await repo.applyWeights(st.routineId, weightChanges(engine));
    await repo.clearActive();
    await useApp.getState().reloadRoutine();
    set({ engine: undefined, snap: undefined, finishedSessionId: session.id });
    diag('session', 'saved');
    return session.id;
  },

  async discard() {
    stopLoop();
    stopKeepAlive();
    await repo.clearActive();
    set({ engine: undefined, snap: undefined, sessionId: undefined });
  },
}));
