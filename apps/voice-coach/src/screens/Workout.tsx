import { useEffect, useRef, useState, type PointerEvent as RPE } from 'react';
import { DndContext, KeyboardSensor, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { getExercise } from '@hc/exercise-library';
import type { EngineItem, Snapshot } from '@hc/workout-engine';
import { useWorkout } from '../state/workout';
import { useApp } from '../state/app';
import { useFormFactor, type FormFactor } from '../lib/formFactor';
import { go } from '../lib/router';
import { clockAfter, mmss, weightLabel } from '../lib/format';
import { RepRing } from '../components/RepRing';
import { MotionView } from '../components/Exercise';
import { Sheet } from '../components/ui';
import '../workout.css';

/**
 * 운동 중 화면 (F4·F5·F6)
 *  - 좌우 스와이프: 진행 모드 ↔ 모션 모드 (마지막 모드 기억)
 *  - 짧은 탭(링 영역): 세트 즉시 완료
 *  - 남은 운동: 길게 눌러 드래그로 순서 변경, '지금' = 이 운동 먼저
 *  - 폼팩터: mini(플립 커버) / base / wide(폴드 펼침)
 */
export function Workout() {
  const { engine, snap, dispatch, finishAndSave, resume } = useWorkout();
  const { settings, patchSettings, tier } = useApp();
  const [forceMini, setForceMini] = useState(false);
  const ff = useFormFactor(forceMini);
  const [page, setPage] = useState<0 | 1>(settings.workoutScreen === 'motion' ? 1 : 0);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const saving = useRef(false);

  // 새로고침 등으로 엔진이 없으면 저장된 진행 세션 복구 시도
  useEffect(() => {
    if (!engine) void resume().then((ok) => { if (!ok) go({ name: 'home' }, { replace: true }); });
  }, []);

  // 자동 종료 → 저장 → 요약
  useEffect(() => {
    if (engine?.phase === 'finished' && !saving.current) {
      saving.current = true;
      void finishAndSave().then((id) => go(id ? { name: 'summary', id } : { name: 'home' }, { replace: true }));
    }
  }, [engine?.phase]);

  if (!engine || !snap || !snap.current) return <div className="screen" />;

  const switchPage = (p: 0 | 1) => {
    setPage(p);
    void patchSettings({ workoutScreen: p === 1 ? 'motion' : 'progress' });
  };
  const end = async () => {
    saving.current = true;
    const id = await finishAndSave();
    go(id ? { name: 'summary', id } : { name: 'home' }, { replace: true });
  };

  const cur = snap.current;
  const e = getExercise(cur.exerciseId);
  const exIndex = snap.done.length + 1;
  const exTotal = snap.done.length + 1 + snap.upcoming.length;

  const header = (
    <header className="wo-head">
      <div className="progress" aria-label={`전체 ${snap.totalSets}세트 중 ${snap.doneSets}세트 완료`}>
        <i style={{ width: `${(snap.doneSets / Math.max(1, snap.totalSets)) * 100}%` }} />
      </div>
      <div className="row wo-meta">
        <span>운동 {exIndex}/{exTotal}</span>
        <span className="grow" />
        <span>남은 약 {Math.ceil(snap.remainingSec / 60)}분, {clockAfter(snap.remainingSec)} 종료</span>
      </div>
    </header>
  );

  const pager = (
    <Pager page={page} onPage={switchPage} onTap={() => {
      if (settings.tapToComplete && (snap.phase === 'working' || snap.phase === 'countdown')) dispatch({ type: 'COMPLETE_SET' });
    }}>
      <ProgressPage snap={snap} item={cur} ff={ff} tapHint={settings.tapToComplete} onWeight={(w) => dispatch({ type: 'SET_WEIGHT', key: cur.key, weightKg: w })} />
      <MotionStage snap={snap} item={cur} tier={tier} ff={ff} phaseStartedAt={engine.phaseStartedAt} />
    </Pager>
  );

  const actions = <Actions snap={snap} canDefer={snap.upcoming.length > 0} dispatch={dispatch} compact={ff === 'mini'} />;

  const upcoming = (
    <Upcoming items={snap.upcoming} onReorder={(keys) => dispatch({ type: 'REORDER', upcoming: keys })}
      onSwitch={(key) => dispatch({ type: 'SWITCH_TO', key })} />
  );

  const tools = (
    <div className="row wo-tools">
      <button className="btn ghost" onClick={() => dispatch({ type: snap.paused ? 'RESUME' : 'PAUSE' })}>{snap.paused ? '계속' : '일시정지'}</button>
      {ff !== 'wide' && <button className="btn ghost" onClick={() => setForceMini(!forceMini)}>{forceMini ? '기본 화면' : '미니 화면'}</button>}
      <span className="grow" />
      <button className="btn ghost" onClick={() => setConfirmEnd(true)}>운동 끝내기</button>
    </div>
  );

  return (
    <div className={`wo wo-${ff}`}>
      {ff === 'mini' ? (
        <>
          {pager}
          {actions}
          {forceMini && <button className="link wo-mini-exit" onClick={() => setForceMini(false)}>기본 화면</button>}
        </>
      ) : ff === 'wide' ? (
        <>
          {header}
          <div className="wo-wide-cols">
            <div className="wo-col">{pager}{actions}</div>
            <div className="wo-col">
              <h3>남은 운동</h3>
              {upcoming}
              {tools}
            </div>
          </div>
        </>
      ) : (
        <>
          {header}
          {pager}
          {actions}
          <section className="stack" style={{ gap: 8 }}>
            <h3>남은 운동</h3>
            {upcoming}
          </section>
          {tools}
        </>
      )}

      {snap.paused && (
        <div className="wo-paused" onClick={() => dispatch({ type: 'RESUME' })}>
          <b>일시정지</b><span>화면을 누르면 계속해요</span>
        </div>
      )}

      {confirmEnd && (
        <Sheet label="운동 끝내기" onClose={() => setConfirmEnd(false)}>
          <h2>운동을 끝낼까요?</h2>
          <p className="muted">지금까지 완료한 {snap.doneSets}세트는 저장돼요.</p>
          <button className="btn primary block" onClick={end}>끝내고 저장</button>
          <button className="btn ghost block" onClick={() => setConfirmEnd(false)}>계속 운동</button>
        </Sheet>
      )}
    </div>
  );
}

/**
 * 모션 모드 — 포즈 애니메이션과 타이머를 한 화면에 통합
 *  - 작업 중: 엔진 작업 시작 시각에 동기화된 포즈 전환 + 큰 반복 숫자 + 반복 조각 막대
 *  - 휴식 중: 다음 세트(또는 다음 운동) 동작을 회당 시간 주기로 미리 보여주며 남은 휴식 시간
 *  - 준비·카운트다운: 시작 자세로 멈춤 + 3·2·1
 */
function MotionStage({ snap, item, tier, ff, phaseStartedAt }: {
  snap: Snapshot; item: EngineItem; tier: import('@hc/core-domain').Tier; ff: FormFactor; phaseStartedAt: number;
}) {
  const e = getExercise(item.exerciseId);
  const working = snap.phase === 'working';
  const timed = !!item.durationSec;
  const total = timed ? 1 : item.reps;

  let big: React.ReactNode;
  let caption: string;
  if (working) {
    big = timed ? mmss(snap.phaseLeftSec) : <>{snap.rep}<small>/{item.reps}</small></>;
    caption = timed ? '버티는 중' : `${item.secPerRep}초 간격`;
  } else if (snap.phase === 'rest') {
    big = mmss(snap.phaseLeftSec);
    caption = item.setsDone === 0 ? '휴식, 다음 운동 미리보기' : `휴식, 다음 ${item.setsDone + 1}세트`;
  } else if (snap.phase === 'countdown') {
    big = String(snap.phaseLeftSec || 1);
    caption = '준비';
  } else {
    big = timed ? mmss(item.durationSec!) : <>{item.reps}<small>회</small></>;
    caption = '준비되면 시작';
  }

  const fill = (i: number) => {
    if (!working) return 0;
    if (timed) return snap.phaseTotalSec ? 1 - snap.phaseLeftSec / snap.phaseTotalSec : 0;
    return i < snap.rep ? 1 : i === snap.rep ? snap.repProgress : 0;
  };

  return (
    <div className={`wo-motion ${snap.phase}`}>
      <MotionView
        e={e} tier={tier} secPerRep={item.secPerRep}
        syncFrom={working ? phaseStartedAt : undefined}
        hold={snap.phase === 'ready' || snap.phase === 'countdown'}
        paused={snap.paused} compact={ff === 'mini'}
      />
      <div className="mo-top">
        <b>{e.nameKo}</b>
        <span>{snap.setNo}/{item.sets}세트</span>
      </div>
      <div className="mo-count" aria-live="off">
        <span className="mo-big">{big}</span>
        <span className="mo-cap">{caption}</span>
      </div>
      <div className="mo-bar" aria-hidden>
        {Array.from({ length: total }, (_, i) => (
          <i key={i}><b style={{ width: `${fill(i) * 100}%` }} /></i>
        ))}
      </div>
    </div>
  );
}

/** 좌우 스와이프 2페이지 + 짧은 탭 감지 */
function Pager({ page, onPage, onTap, children }: { page: 0 | 1; onPage: (p: 0 | 1) => void; onTap: () => void; children: [React.ReactNode, React.ReactNode] }) {
  const start = useRef<{ x: number; y: number; t: number } | null>(null);
  const [dx, setDx] = useState(0);
  const down = (ev: RPE) => {
    if ((ev.target as HTMLElement).closest('button, input, video')) return;
    start.current = { x: ev.clientX, y: ev.clientY, t: Date.now() };
  };
  const move = (ev: RPE) => {
    if (!start.current) return;
    const x = ev.clientX - start.current.x, y = ev.clientY - start.current.y;
    if (Math.abs(x) > Math.abs(y)) setDx(x);
  };
  const up = (ev: RPE) => {
    const s = start.current;
    start.current = null;
    setDx(0);
    if (!s) return;
    const x = ev.clientX - s.x, y = ev.clientY - s.y;
    if (Math.abs(x) > 50 && Math.abs(x) > Math.abs(y) * 1.2) {
      onPage(x < 0 ? 1 : 0);
    } else if (Math.abs(x) < 10 && Math.abs(y) < 10 && Date.now() - s.t < 500) {
      onTap();
    }
  };
  return (
    <div className="pager">
      <div className="pager-view" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => { start.current = null; setDx(0); }}>
        <div className="pager-track" style={{ transform: `translateX(calc(${-page * 50}% + ${dx / 2}px))` }}>
          <div className="pager-page" aria-hidden={page !== 0}>{children[0]}</div>
          <div className="pager-page" aria-hidden={page !== 1}>{children[1]}</div>
        </div>
      </div>
      <div className="pager-dots" role="tablist" aria-label="화면 모드">
        <button role="tab" aria-selected={page === 0} aria-label="진행 모드" onClick={() => onPage(0)} />
        <button role="tab" aria-selected={page === 1} aria-label="모션 모드" onClick={() => onPage(1)} />
      </div>
    </div>
  );
}

function ProgressPage({ snap, item, ff, tapHint, onWeight }: { snap: Snapshot; item: EngineItem; ff: FormFactor; tapHint: boolean; onWeight: (w: number) => void }) {
  const e = getExercise(item.exerciseId);
  let ring: React.ReactNode;
  if (snap.phase === 'working' && item.durationSec) {
    ring = <RepRing mode="timer" total={1} done={0} progress={snap.phaseTotalSec ? snap.phaseLeftSec / snap.phaseTotalSec : 0} label={mmss(snap.phaseLeftSec)} sub="버티기" />;
  } else if (snap.phase === 'working') {
    ring = <RepRing mode="reps" total={item.reps} done={snap.rep} progress={snap.repProgress} label={String(snap.rep)} sub={`/ ${item.reps}회`} />;
  } else if (snap.phase === 'rest') {
    ring = <RepRing mode="timer" total={1} done={0} progress={snap.phaseTotalSec ? snap.phaseLeftSec / snap.phaseTotalSec : 0} label={mmss(snap.phaseLeftSec)} sub="휴식" />;
  } else if (snap.phase === 'countdown') {
    ring = <RepRing mode="timer" total={1} done={0} progress={snap.phaseLeftSec / 3} label={String(snap.phaseLeftSec || 1)} sub="준비" />;
  } else {
    ring = <RepRing mode="reps" total={item.reps} done={0} progress={0} label={String(item.reps)} sub="회 준비" />;
  }
  return (
    <div className="wo-progress">
      <div className="wo-title">
        <h2>{e.nameKo}</h2>
        <div className="set-dots" aria-label={`${item.sets}세트 중 ${snap.setNo}세트`}>
          {Array.from({ length: item.sets }, (_, i) => (
            <i key={i} className={i < item.setsDone ? 'done' : i === item.setsDone ? 'now' : ''} />
          ))}
        </div>
      </div>
      {ring}
      {ff !== 'mini' && (
        <div className="row wo-weight">
          <button className="icon-btn" aria-label="중량 줄이기" onClick={() => onWeight(Math.max(0, +(item.weightKg - e.weightStepKg).toFixed(2)))}>−</button>
          <span>{weightLabel(e, item.weightKg)}</span>
          <button className="icon-btn" aria-label="중량 늘리기" onClick={() => onWeight(+(item.weightKg + e.weightStepKg).toFixed(2))}>+</button>
        </div>
      )}
      {tapHint && (snap.phase === 'working' || snap.phase === 'countdown') && ff !== 'mini' && <p className="wo-hint">화면을 톡 누르면 이 세트를 바로 끝내요</p>}
    </div>
  );
}

function Actions({ snap, canDefer, dispatch, compact }: { snap: Snapshot; canDefer: boolean; dispatch: (a: import('@hc/workout-engine').Action) => void; compact: boolean }) {
  const main =
    snap.phase === 'ready' ? { label: '시작', act: () => dispatch({ type: 'START' }) } :
    snap.phase === 'rest' ? { label: '휴식 건너뛰기', act: () => dispatch({ type: 'SKIP_REST' }) } :
    { label: '세트 완료', act: () => dispatch({ type: 'COMPLETE_SET' }) };
  return (
    <div className={`wo-actions ${compact ? 'compact' : ''}`}>
      <button className="btn ghost" disabled={!canDefer} onClick={() => dispatch({ type: 'DEFER' })}>
        {compact ? '나중에' : '기구 사용 중, 나중에'}
      </button>
      <button className="btn primary" onClick={main.act}>{main.label}</button>
    </div>
  );
}

function Upcoming({ items, onReorder, onSwitch }: { items: EngineItem[]; onReorder: (keys: string[]) => void; onSwitch: (key: string) => void }) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  if (!items.length) return <p className="muted small">마지막 운동이에요</p>;
  const keys = items.map((i) => i.key);
  const onEnd = (ev: DragEndEvent) => {
    if (!ev.over || ev.active.id === ev.over.id) return;
    onReorder(arrayMove(keys, keys.indexOf(String(ev.active.id)), keys.indexOf(String(ev.over.id))));
  };
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onEnd}>
      <SortableContext items={keys} strategy={verticalListSortingStrategy}>
        <ol className="wo-upcoming">
          {items.map((it) => <UpRow key={it.key} it={it} onSwitch={onSwitch} />)}
        </ol>
      </SortableContext>
    </DndContext>
  );
}

function UpRow({ it, onSwitch }: { it: EngineItem; onSwitch: (key: string) => void }) {
  const e = getExercise(it.exerciseId);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: it.key });
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.75 : 1 }}
      className={isDragging ? 'dragging' : ''} {...attributes} {...listeners}>
      <span className="grow">
        <b>{e.nameKo}</b>
        <span className="muted small"> {it.sets - it.setsDone}세트 남음, {weightLabel(e, it.weightKg)}</span>
      </span>
      <button className="chip" onPointerDown={(ev) => ev.stopPropagation()} onClick={() => onSwitch(it.key)}>지금</button>
    </li>
  );
}
