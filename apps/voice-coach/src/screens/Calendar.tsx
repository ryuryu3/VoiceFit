import { useEffect, useMemo, useState } from 'react';
import { localDateKey, type Session } from '@hc/core-domain';
import { calendarDays, mainParts, monthCount, streak } from '@hc/metrics';
import { TopBar } from '../components/ui';
import { repo } from '../lib/repo';
import { go } from '../lib/router';
import { durationKo, num, partsLabel } from '../lib/format';

const WD = ['일', '월', '화', '수', '목', '금', '토'];

/** 자체 캘린더 (F8) — 외부 연동 없이 결과만 */
export function Calendar() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [ym, setYm] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });
  const today = localDateKey(new Date());
  const [sel, setSel] = useState(today);
  useEffect(() => { void repo.allSessions().then(setSessions); }, []);
  const days = useMemo(() => calendarDays(sessions), [sessions]);

  const first = new Date(ym.y, ym.m, 1);
  const len = new Date(ym.y, ym.m + 1, 0).getDate();
  const cells: (string | null)[] = [...Array(first.getDay()).fill(null), ...Array.from({ length: len }, (_, i) => localDateKey(new Date(ym.y, ym.m, i + 1)))];
  const ymKey = `${ym.y}-${String(ym.m + 1).padStart(2, '0')}`;
  const shift = (d: number) => setYm(({ y, m }) => { const n = new Date(y, m + d, 1); return { y: n.getFullYear(), m: n.getMonth() }; });
  const selDay = days.get(sel);

  return (
    <div className="screen">
      <TopBar title="운동 캘린더" />
      <div className="stat-grid">
        <div className="stat"><b>{monthCount(days.keys(), ymKey)}일</b><span>{ym.m + 1}월 운동한 날</span></div>
        <div className="stat"><b>{streak(days.keys(), today)}일</b><span>연속 운동</span></div>
      </div>
      <div className="card stack">
        <div className="row">
          <button className="icon-btn" aria-label="이전 달" onClick={() => shift(-1)}>‹</button>
          <h3 className="grow" style={{ textAlign: 'center' }}>{ym.y}년 {ym.m + 1}월</h3>
          <button className="icon-btn" aria-label="다음 달" onClick={() => shift(1)}>›</button>
        </div>
        <div className="month" role="grid">
          {WD.map((w) => <div key={w} className="wd">{w}</div>)}
          {cells.map((k, i) => k ? (
            <button key={k} aria-selected={k === sel} className={k === today ? 'today' : ''} onClick={() => setSel(k)}
              aria-label={`${Number(k.slice(8))}일${days.has(k) ? ', 운동함' : ''}`}>
              {Number(k.slice(8))}
              <span className={`pip ${days.get(k) ? 'l' + days.get(k)!.level : ''}`} />
            </button>
          ) : <span key={'e' + i} className="empty" />)}
        </div>
      </div>

      <section className="stack" style={{ gap: 8 }}>
        <h3>{Number(sel.slice(5, 7))}월 {Number(sel.slice(8))}일</h3>
        {!selDay && <p className="muted">이 날은 운동 기록이 없어요.</p>}
        {selDay?.sessions.map((s) => (
          <button key={s.id} className="card row" style={{ border: 0, textAlign: 'left', width: '100%' }} onClick={() => go({ name: 'summary', id: s.id })}>
            <div className="grow">
              <b>{partsLabel(mainParts(s.logs)) || '운동'}</b>
              <div className="muted small">{num(s.totalVolumeKg)}kg, {durationKo(s.activeSec)}, {num(s.kcal)}kcal</div>
            </div>
            <span className="muted">›</span>
          </button>
        ))}
      </section>
    </div>
  );
}
