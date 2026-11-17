import { useEffect, useState } from 'react';
import { localDateKey, type Session } from '@hc/core-domain';
import { estimateItemSec, getExercise } from '@hc/exercise-library';
import { calendarDays, streak } from '@hc/metrics';
import { useApp } from '../state/app';
import { useWorkout } from '../state/workout';
import { repo } from '../lib/repo';
import { go } from '../lib/router';
import { durationKo, weightLabel } from '../lib/format';

const WD = ['일', '월', '화', '수', '목', '금', '토'];

export function Home() {
  const { routine, profile } = useApp();
  const start = useWorkout((s) => s.start);
  const [sessions, setSessions] = useState<Session[]>([]);
  useEffect(() => { void repo.allSessions().then(setSessions); }, []);
  useEffect(() => { if (!profile) go({ name: 'survey' }, { replace: true }); }, [profile]);
  if (!routine) {
    return (
      <div className="screen">
        <h2>루틴이 아직 없어요</h2>
        <button className="btn primary block" onClick={() => go({ name: profile ? 'picker' : 'survey' })}>루틴 만들기</button>
      </div>
    );
  }

  const today = localDateKey(new Date());
  const days = calendarDays(sessions);
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - 6 + i);
    const k = localDateKey(d);
    return { k, wd: WD[d.getDay()]!, day: d.getDate(), level: days.get(k)?.level };
  });
  const total = routine.items.reduce((t, i) => t + estimateItemSec(i), 0);
  const st = streak(days.keys(), today);
  const doneToday = days.has(today);

  return (
    <div className="screen">
      <div className="topbar">
        <h1>오늘의 운동</h1>
        <button className="icon-btn" aria-label="캘린더" onClick={() => go({ name: 'calendar' })}>📅</button>
        <button className="icon-btn" aria-label="설정" onClick={() => go({ name: 'settings' })}>⚙︎</button>
      </div>

      <section className="home-hero">
        <div className="row">
          <div className="grow">
            <b style={{ fontSize: 18 }}>{routine.name}</b>
            <div className="muted small">운동 {routine.items.length}개, 약 {durationKo(total)}</div>
          </div>
          <button className="link" onClick={() => go({ name: 'routine' })}>편집</button>
        </div>
        <ul className="today-list">
          {routine.items.map((it) => {
            const e = getExercise(it.exerciseId);
            return (
              <li key={it.exerciseId}>
                <span>{e.nameKo}</span>
                <span className="muted">{it.sets}×{it.durationSec ? `${it.durationSec}초` : it.reps}, {weightLabel(e, it.weightKg)}</span>
              </li>
            );
          })}
        </ul>
        <button className="btn primary huge block" onClick={async () => { await start(routine); go({ name: 'workout' }); }}>
          {doneToday ? '한 번 더 운동 시작' : '오늘 루틴 시작'}
        </button>
      </section>

      <section className="card stack" style={{ gap: 10 }}>
        <div className="row">
          <h3 className="grow">최근 7일</h3>
          {st > 0 && <span className="small" style={{ color: 'var(--orange-ink)', fontWeight: 700 }}>{st}일 연속</span>}
        </div>
        <div className="week">
          {week.map((d) => (
            <div key={d.k}>
              <div className="d">{d.wd}</div>
              <div className={`dot ${d.level ? 'l' + d.level : ''} ${d.k === today ? 'today' : ''}`}>{d.day}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
