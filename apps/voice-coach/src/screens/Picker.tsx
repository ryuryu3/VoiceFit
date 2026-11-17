import { useEffect, useMemo, useState } from 'react';
import { BODY_PARTS, BODY_PART_LABEL, type Exercise } from '@hc/core-domain';
import { LIBRARY, estimateItemSec, prescription, recommendExercises, type ScoredExercise } from '@hc/exercise-library';
import { partSetShare } from '@hc/metrics';
import { ExerciseDetail, ExerciseThumb, muscleList } from '../components/Exercise';
import { Sheet, TopBar } from '../components/ui';
import { currentAnswers, useApp } from '../state/app';
import { repo } from '../lib/repo';
import { go } from '../lib/router';

/** 운동 후보 제시 → 선택 (추천 운동은 미리 체크) */
export function Picker() {
  const a = currentAnswers();
  const { tier, draftSelected, draftAnswers, routine, setDraft } = useApp();
  // 설문을 방금 (다시) 했으면 새 추천, 아니면(루틴 편집에서 진입) 현재 루틴 운동을 체크
  const useRoutineItems = !draftAnswers && !!routine;
  const [share, setShare] = useState<ReturnType<typeof partSetShare>>();
  const [detail, setDetail] = useState<Exercise>();

  // 프로: 최근 4주 기록으로 부족한 부위 보정
  useEffect(() => {
    if (tier !== 'pro') return;
    const since = new Date(Date.now() - 28 * 864e5);
    const key = `${since.getFullYear()}-${String(since.getMonth() + 1).padStart(2, '0')}-${String(since.getDate()).padStart(2, '0')}`;
    void repo.sessionsSince(key).then((ss) => ss.length >= 3 && setShare(partSetShare(ss)));
  }, [tier]);

  const scored = useMemo(() => (a ? recommendExercises(LIBRARY, a, share) : []), [a?.goal, a?.level, a?.freqPerWeek, a?.minutesPerSession, a?.focusParts.join(), a?.avoidParts.join(), share]);
  const [selected, setSelected] = useState<string[]>(() =>
    draftSelected ?? (useRoutineItems ? routine!.items.map((i) => i.exerciseId) : scored.filter((s) => s.recommended).map((s) => s.exercise.id)));

  // 추천이 늦게(프로 보정) 도착하면, 사용자가 아직 손대지 않았을 때만 갱신
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (!touched && !draftSelected && !useRoutineItems) setSelected(scored.filter((s) => s.recommended).map((s) => s.exercise.id));
  }, [scored]);

  useEffect(() => { if (!a) go({ name: 'survey' }, { replace: true }); }, [a]);
  if (!a) return null;

  const toggle = (id: string) => {
    setTouched(true);
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  };

  const groups = BODY_PARTS.map((p) => ({ part: p, items: scored.filter((s) => s.part === p) }))
    .filter((g) => g.items.length)
    .sort((x, y) => (y.items[0]?.score ?? 0) - (x.items[0]?.score ?? 0));

  const rx = prescription(a.goal, a.level);
  const minutes = Math.round(selected.length * estimateItemSec({ sets: rx.sets, reps: rx.reps, secPerRep: 3, restSec: 75 }) / 60);

  return (
    <div className="screen">
      <TopBar title="운동 고르기" />
      <p className="muted">설문에 맞춰 추천한 운동을 미리 골라 뒀어요. 빼거나 더할 수 있어요.</p>
      {tier === 'pro' && share && <div className="notice">최근 기록을 반영해 덜 한 부위를 더 추천했어요</div>}

      {groups.map((g) => (
        <section key={g.part} className="stack" style={{ gap: 8 }}>
          <h3>{BODY_PART_LABEL[g.part]}</h3>
          {g.items.map((s) => <Card key={s.exercise.id} s={s} checked={selected.includes(s.exercise.id)} onToggle={toggle} onInfo={setDetail} />)}
        </section>
      ))}

      <div className="bottom-bar">
        <button className="btn primary block" disabled={!selected.length}
          onClick={() => { setDraft({ selected }); go({ name: 'routine' }); }}>
          {selected.length}개로 루틴 만들기 (약 {minutes}분)
        </button>
      </div>

      {detail && (
        <Sheet label={detail.nameKo} onClose={() => setDetail(undefined)}>
          <ExerciseDetail e={detail} tier={tier} />
          <button className="btn primary block" onClick={() => { toggle(detail.id); setDetail(undefined); }}>
            {selected.includes(detail.id) ? '루틴에서 빼기' : '루틴에 넣기'}
          </button>
        </Sheet>
      )}
    </div>
  );
}

function Card({ s, checked, onToggle, onInfo }: { s: ScoredExercise; checked: boolean; onToggle: (id: string) => void; onInfo: (e: Exercise) => void }) {
  const e = s.exercise;
  return (
    <div className="ex-card" role="checkbox" aria-checked={checked} tabIndex={0}
      onClick={() => onToggle(e.id)} onKeyDown={(k) => (k.key === ' ' || k.key === 'Enter') && onToggle(e.id)}>
      <button aria-label={`${e.nameKo} 자세히 보기`} onClick={(ev) => { ev.stopPropagation(); onInfo(e); }} style={{ border: 0, padding: 0, background: 'none' }}>
        <ExerciseThumb e={e} />
      </button>
      <div className="grow stack" style={{ gap: 4 }}>
        <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
          <b style={{ fontSize: 16 }}>{e.nameKo}</b>
          {s.recommended && <span className="tag rec">추천</span>}
        </div>
        <span className="muted small">{muscleList(e.primary)}</span>
        <button className="link" onClick={(ev) => { ev.stopPropagation(); onInfo(e); }}>운동요령 보기</button>
      </div>
      <span className="check">{checked ? '✓' : ''}</span>
    </div>
  );
}
