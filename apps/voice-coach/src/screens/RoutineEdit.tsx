import { useEffect, useState } from 'react';
import { DndContext, PointerSensor, TouchSensor, KeyboardSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { SEC_PER_REP_OPTIONS, uid, type RoutineItem, type SecPerRep } from '@hc/core-domain';
import { buildRoutineItems, estimateItemSec, getExercise } from '@hc/exercise-library';
import { Chips, Stepper, TopBar } from '../components/ui';
import { currentAnswers, useApp } from '../state/app';
import { go } from '../lib/router';
import { amountLabel, durationKo, weightLabel } from '../lib/format';

/**
 * 머신별 세트·횟수·중량·회당 시간·휴식 설정 (F3)
 * 이미 설정했던 운동은 기존 값 유지(설정 기억), 새로 추가된 운동만 기본값으로 채움.
 */
export function RoutineEdit() {
  const { routine, draftSelected, saveRoutine, setDraft, showToast } = useApp();
  const a = currentAnswers();
  const [items, setItems] = useState<RoutineItem[]>(() => {
    const ids = draftSelected ?? routine?.items.map((i) => i.exerciseId) ?? [];
    const existing = new Map((routine?.items ?? []).map((i) => [i.exerciseId, i]));
    const kept = (routine?.items ?? []).filter((i) => ids.includes(i.exerciseId));
    const fresh = ids.filter((id) => !existing.has(id));
    const freshItems = a ? buildRoutineItems(fresh.map(getExercise), a, (kept[0]?.secPerRep ?? 3) as SecPerRep) : [];
    // 새 루틴이면 큰 근육 순서(buildRoutineItems), 편집이면 기존 순서 + 새 운동 뒤에
    return kept.length ? [...kept, ...freshItems] : freshItems;
  });
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => { if (!items.length) go({ name: a ? 'picker' : 'survey' }, { replace: true }); }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const onDragEnd = (ev: DragEndEvent) => {
    const { active, over } = ev;
    if (!over || active.id === over.id) return;
    const from = items.findIndex((i) => i.exerciseId === active.id);
    const to = items.findIndex((i) => i.exerciseId === over.id);
    setItems(arrayMove(items, from, to));
  };
  const patch = (id: string, p: Partial<RoutineItem>) => setItems((xs) => xs.map((x) => (x.exerciseId === id ? { ...x, ...p } : x)));
  const allSec = items.every((i) => i.secPerRep === items[0]?.secPerRep) ? items[0]?.secPerRep : undefined;
  const total = items.reduce((t, i) => t + estimateItemSec(i), 0);

  const save = async () => {
    await saveRoutine({ id: routine?.id ?? uid('r_'), name: '내 루틴', items });
    setDraft({ answers: undefined, selected: undefined });
    useApp.setState({ draftAnswers: undefined });
    showToast('루틴을 저장했어요. 다음부터는 시작만 누르면 돼요');
    go({ name: 'home' }, { replace: true });
  };

  return (
    <div className="screen">
      <TopBar title="루틴 설정" />
      <div className="card stack" style={{ gap: 10 }}>
        <h3>회당 시간</h3>
        <p className="muted small">"하나, 둘" 세는 간격이에요. 전체에 한 번에 적용하거나 운동마다 바꿀 수 있어요.</p>
        <Chips label="모든 운동의 회당 시간" options={SEC_PER_REP_OPTIONS} value={(allSec ?? 0) as SecPerRep}
          render={(v) => `${v}초`} onChange={(v) => setItems((xs) => xs.map((x) => ({ ...x, secPerRep: v })))} />
      </div>

      <div className="row">
        <h3 className="grow">운동 {items.length}개</h3>
        <span className="muted small">예상 {durationKo(total)}</span>
      </div>
      <p className="muted small">손잡이를 길게 눌러 순서를 바꿀 수 있어요.</p>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={items.map((i) => i.exerciseId)} strategy={verticalListSortingStrategy}>
          <div className="stack" style={{ gap: 8 }}>
            {items.map((it) => (
              <Item key={it.exerciseId} it={it} open={open === it.exerciseId}
                onOpen={() => setOpen(open === it.exerciseId ? null : it.exerciseId)}
                onPatch={(p) => patch(it.exerciseId, p)}
                onRemove={() => setItems((xs) => xs.filter((x) => x.exerciseId !== it.exerciseId))} />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      <button className="btn ghost block" onClick={() => { setDraft({ selected: items.map((i) => i.exerciseId) }); go({ name: 'picker' }); }}>
        운동 추가하거나 빼기
      </button>

      <div className="bottom-bar">
        <button className="btn primary block" disabled={!items.length} onClick={save}>이대로 저장</button>
      </div>
    </div>
  );
}

function Item({ it, open, onOpen, onPatch, onRemove }: {
  it: RoutineItem; open: boolean; onOpen: () => void; onPatch: (p: Partial<RoutineItem>) => void; onRemove: () => void;
}) {
  const e = getExercise(it.exerciseId);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: it.exerciseId });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.7 : 1, zIndex: isDragging ? 5 : undefined };
  return (
    <div ref={setNodeRef} style={style} className="routine-item">
      <div className="row" style={{ gap: 8 }}>
        <span className="drag-handle" {...attributes} {...listeners} aria-label={`${e.nameKo} 순서 바꾸기`}>⠿</span>
        <button className="grow" onClick={onOpen} aria-expanded={open}
          style={{ border: 0, background: 'none', textAlign: 'left', padding: '4px 0' }}>
          <b style={{ fontSize: 16 }}>{e.nameKo}</b>
          <div className="muted small">
            {it.sets}세트 × {amountLabel(it)}, {weightLabel(e, it.weightKg)}{it.durationSec ? '' : `, ${it.secPerRep}초 간격`}, 휴식 {it.restSec}초
          </div>
        </button>
        <span className="muted" aria-hidden>{open ? '▴' : '▾'}</span>
      </div>
      {open && (
        <div className="stack" style={{ gap: 14 }}>
          <div className="field-grid">
            <div className="field"><label>세트</label><Stepper label="세트" value={it.sets} min={1} max={10} onChange={(v) => onPatch({ sets: v })} /></div>
            {it.durationSec
              ? <div className="field"><label>시간</label><Stepper label="시간" value={it.durationSec} step={10} min={10} max={300} unit="초" onChange={(v) => onPatch({ durationSec: v })} /></div>
              : <div className="field"><label>반복</label><Stepper label="반복" value={it.reps} min={1} max={30} onChange={(v) => onPatch({ reps: v })} /></div>}
            <div className="field"><label>{e.assisted ? '보조 무게' : e.category === 'bodyweight' ? '추가 중량 (0 = 맨몸)' : '중량'}</label><Stepper label="중량" value={it.weightKg} step={e.weightStepKg} min={0} max={500} unit="kg" onChange={(v) => onPatch({ weightKg: v })} /></div>
            <div className="field"><label>휴식</label><Stepper label="휴식" value={it.restSec} step={15} min={15} max={300} unit="초" onChange={(v) => onPatch({ restSec: v })} /></div>
          </div>
          {!it.durationSec && <div className="field">
            <label>회당 시간</label>
            <Chips label={`${e.nameKo} 회당 시간`} options={SEC_PER_REP_OPTIONS} value={it.secPerRep} render={(v) => `${v}초`} onChange={(v) => onPatch({ secPerRep: v })} />
          </div>}
          <button className="btn danger" onClick={onRemove}>루틴에서 빼기</button>
        </div>
      )}
    </div>
  );
}
