import { useEffect, useMemo } from 'react';
import { BODY_PART_LABEL, MUSCLE_TO_PART, type Muscle } from '@hc/core-domain';
import { GOAL_LABEL, partPriorities, suggestSplit } from '@hc/exercise-library';
import { BodyMap } from '../components/BodyMap';
import { Stars, TopBar } from '../components/ui';
import { currentAnswers, useApp } from '../state/app';
import { go } from '../lib/router';
import { josa } from '../lib/format';

/** 설문 → 부위별 강화 방향 제안 */
export function Proposal() {
  const a = currentAnswers();
  const saveProfile = useApp((s) => s.saveProfile);
  const pri = useMemo(() => (a ? partPriorities(a) : []), [a]);
  useEffect(() => { if (!a) go({ name: 'survey' }, { replace: true }); }, [a]);
  if (!a) return null;
  const split = suggestSplit(a);
  const top = pri.filter((p) => p.stars === 3).map((p) => p.part);
  const topMuscles = (Object.keys(MUSCLE_TO_PART) as Muscle[]).filter((m) => top.includes(MUSCLE_TO_PART[m]));
  const midMuscles = (Object.keys(MUSCLE_TO_PART) as Muscle[]).filter((m) => pri.find((p) => p.part === MUSCLE_TO_PART[m])?.stars === 2);

  return (
    <div className="screen">
      <TopBar title="강화 방향" />
      <h2>{josa(GOAL_LABEL[a.goal], '을', '를')} 위해 이렇게 운동해 보세요</h2>
      <div className="card" style={{ background: '#eceae6', display: 'grid', placeItems: 'center' }}>
        <BodyMap primary={topMuscles} secondary={midMuscles} view="both" className="proposal-map" title="강화 우선 부위" />
      </div>
      <div className="card stack" style={{ gap: 10 }}>
        <h3>부위별 우선순위</h3>
        {pri.map((p) => (
          <div key={p.part} className="row">
            <span className="grow">{BODY_PART_LABEL[p.part]}</span>
            {p.stars === 0 ? <span className="muted small">제외</span> : <Stars n={p.stars} />}
          </div>
        ))}
      </div>
      <div className="card stack" style={{ gap: 6 }}>
        <h3>추천 분할: {split.label}</h3>
        <p className="muted">{split.description}</p>
      </div>
      <div className="bottom-bar">
        <button className="btn primary block" onClick={async () => { await saveProfile(a); go({ name: 'picker' }); }}>
          추천 운동 보기
        </button>
      </div>
    </div>
  );
}
