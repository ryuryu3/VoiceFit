import { useEffect, useState } from 'react';
import { BODY_PARTS, BODY_PART_LABEL, type Session } from '@hc/core-domain';
import { getExercise } from '@hc/exercise-library';
import { mainParts, partVolume, volumeDeltaPct } from '@hc/metrics';
import { TopBar } from '../components/ui';
import { repo } from '../lib/repo';
import { go } from '../lib/router';
import { durationKo, num, partsLabel, weightLabel } from '../lib/format';
import { useApp } from '../state/app';

/** 운동 완료 요약 (F7) */
export function Summary({ id }: { id: string }) {
  const [s, setS] = useState<Session | null>();
  const [delta, setDelta] = useState<number | null>(null);
  const bw = useApp((x) => x.profile?.weightKg);
  useEffect(() => {
    void repo.allSessions().then((all) => {
      const cur = all.find((x) => x.id === id) ?? null;
      setS(cur);
      if (cur) setDelta(volumeDeltaPct(cur, all));
    });
  }, [id]);
  if (s === undefined) return <div className="screen" />;
  if (s === null) return (
    <div className="screen"><TopBar title="기록" /><p>기록을 찾을 수 없어요.</p></div>
  );

  const pv = partVolume(s.logs, bw);
  const maxPv = Math.max(1, ...Object.values(pv));
  const done = s.logs.filter((l) => !l.skipped);
  const byEx = new Map<string, typeof done>();
  for (const l of done) byEx.set(l.exerciseId, [...(byEx.get(l.exerciseId) ?? []), l]);
  const date = new Date(s.startedAt);

  return (
    <div className="screen">
      <TopBar title="운동 결과" onBack={() => go({ name: 'home' }, { replace: true })} />
      <div>
        <p className="muted">{date.getMonth() + 1}월 {date.getDate()}일 {partsLabel(mainParts(s.logs))}</p>
        <h2>오늘 {num(s.totalVolumeKg)}kg을 들었어요</h2>
        {delta != null && <p className="muted">지난번보다 {delta >= 0 ? `${delta}% 더` : `${-delta}% 덜`} 들었어요</p>}
      </div>
      <div className="stat-grid">
        <div className="stat"><b>{durationKo(s.activeSec)}</b><span>운동 시간</span></div>
        <div className="stat"><b>{num(s.kcal)}kcal</b><span>추정 소모 칼로리</span></div>
        <div className="stat"><b>{done.length}세트</b><span>완료 세트</span></div>
        <div className="stat"><b>{num(done.reduce((a, l) => a + l.reps, 0))}회</b><span>총 반복</span></div>
      </div>
      <section className="card stack">
        <h3>부위별 볼륨</h3>
        <div className="bars">
          {BODY_PARTS.filter((p) => pv[p] > 0).map((p) => (
            <div key={p} className="bar">
              <span>{BODY_PART_LABEL[p]}</span>
              <span className="track"><i style={{ width: `${(pv[p] / maxPv) * 100}%` }} /></span>
              <span className="v">{num(pv[p])}kg</span>
            </div>
          ))}
        </div>
      </section>
      <section className="card">
        <table className="sets">
          <thead><tr><th>운동</th><th>세트</th><th>중량 × 반복</th></tr></thead>
          <tbody>
            {[...byEx.entries()].map(([exId, logs]) => (
              <tr key={exId}>
                <td>{getExercise(exId).nameKo}</td>
                <td>{logs.length}</td>
                <td>{[...new Set(logs.map((l) => `${weightLabel(getExercise(exId), l.weightKg)}×${l.reps}`))].join(', ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <p className="muted small">칼로리는 운동 종류(MET)와 체중, 운동 시간으로 계산한 추정치예요.</p>
      <div className="bottom-bar row">
        <button className="btn ghost grow" onClick={() => go({ name: 'calendar' })}>캘린더 보기</button>
        <button className="btn primary grow" onClick={() => go({ name: 'home' }, { replace: true })}>확인</button>
      </div>
    </div>
  );
}
