import { useEffect, useRef, useState } from 'react';
import { BODY_PART_LABEL, MUSCLE_TO_PART, type Exercise, type Muscle, type Tier } from '@hc/core-domain';
import { REPDB_CREDIT, REPDB_URL, canPlayMotion, motionPlaybackRate, muscleImage, peakOpacity } from '@hc/exercise-library';
import { BodyMap } from './BodyMap';
import { go } from '../lib/router';

const MUSCLE_LABEL: Record<Muscle, string> = {
  pecs: '대흉근', upperPecs: '상부 대흉근', lats: '광배근', rhomboids: '능형근', traps: '승모근', erectors: '척추기립근',
  frontDelts: '전면 삼각근', sideDelts: '측면 삼각근', rearDelts: '후면 삼각근', biceps: '이두근', triceps: '삼두근',
  brachioradialis: '상완요골근', forearms: '전완근', abs: '복직근', obliques: '복사근', quads: '대퇴사두근',
  hamstrings: '햄스트링', glutes: '대둔근', gluteMed: '중둔근', calves: '종아리', adductors: '내전근',
};

export function muscleList(ms: Muscle[]): string {
  return ms.map((m) => MUSCLE_LABEL[m]).join(', ');
}

export function partOf(e: Exercise): string {
  return BODY_PART_LABEL[MUSCLE_TO_PART[e.primary[0]!]];
}

/** 썸네일 — 시작 자세 프레임 (항상 무료) */
export function ExerciseThumb({ e }: { e: Exercise }) {
  return (
    <div className="ex-thumb" aria-hidden>
      {e.motion.thumb
        ? <img src={e.motion.thumb} alt="" width={72} height={88} loading="lazy" decoding="async" />
        : <BodyMap primary={e.primary} secondary={e.secondary} />}
    </div>
  );
}

/**
 * 반복 진행률을 매 프레임 계산 (부드러운 전환).
 * - syncFrom: 엔진의 작업 단계 시작 시각(ms) → 음성 카운트와 같은 시계로 동기화
 * - 없으면 화면이 뜬 시점부터 회당 시간 주기로 자체 반복 (상세 화면·휴식 중 미리보기)
 */
function useLoopProgress(active: boolean, secPerRep: number, syncFrom?: number): number {
  const [p, setP] = useState(0);
  const t0 = useRef(Date.now());
  useEffect(() => {
    if (!active) return;
    let raf = 0;
    const base = syncFrom ?? t0.current;
    const tick = () => {
      setP(Math.max(0, (Date.now() - base) / 1000 / secPerRep) % 1);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, secPerRep, syncFrom]);
  return p;
}

/**
 * 모션 — 타이머와 통합된 포즈 애니메이션
 *  1) 3D 루프 영상이 있으면 회당 시간에 맞춘 재생 속도로 재생 (향후)
 *  2) 포즈 프레임(시작·정점)이 있으면 반복 진행률에 맞춰 시작→정점→시작 전환
 *     - syncFrom(엔진 작업 시작 시각)을 주면 음성 카운트와 같은 시계로 동기화, 안 주면 회당 시간 주기로 자체 반복
 *  3) 잠김(프로 아님): 시작 자세 정지 화면 + 프로 안내
 */
export function MotionView({ e, tier, secPerRep, syncFrom, hold, compact, paused }: {
  e: Exercise; tier: Tier; secPerRep: number;
  /** 엔진 작업 단계 시작 시각 — 주면 타이머와 동기화 */
  syncFrom?: number;
  /** true면 시작 자세로 멈춤 (준비·카운트다운) */
  hold?: boolean;
  compact?: boolean; paused?: boolean;
}) {
  const playable = canPlayMotion(e, tier);
  const frames = e.motion.frames;
  const animate = playable && !!frames?.peak && !hold;
  const progress = useLoopProgress(animate && !paused, secPerRep, syncFrom);
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.playbackRate = motionPlaybackRate(e, secPerRep);
  }, [e, secPerRep]);

  let stage;
  if (playable && e.motion.video) {
    stage = <video ref={ref} src={e.motion.video} autoPlay loop muted playsInline />;
  } else if (frames) {
    const op = animate ? peakOpacity(progress) : 0;
    stage = (
      <div className="pose" role="img" aria-label={`${e.nameKo} 동작`}>
        <img src={frames.start} alt="" decoding="async" />
        {frames.peak && <img src={frames.peak} alt="" decoding="async" className="pose-peak" style={{ opacity: op }} />}
      </div>
    );
  } else {
    stage = <BodyMap primary={e.primary} secondary={e.secondary} view={compact ? 'auto' : 'both'} title={`${e.nameKo} 강화 부위`} />;
  }

  return (
    <div className={`motion ${compact ? 'compact' : ''} ${frames ? 'has-frames' : ''}`}>
      {stage}
      {!playable && (
        <button className="motion-lock" onClick={(ev) => { ev.stopPropagation(); go({ name: 'pro' }); }}>
          🔒 움직이는 동작은 프로에서 볼 수 있어요
        </button>
      )}
    </div>
  );
}

export function MuscleChips({ e }: { e: Exercise }) {
  const items = [...e.primary.map((m) => ({ m, main: true })), ...e.secondary.map((m) => ({ m, main: false }))];
  // 같은 이미지(대흉근/상부 대흉근 등) 중복 제거
  const seen = new Set<string>();
  const list = items.filter(({ m }) => { const k = muscleImage(m) ?? m; if (seen.has(k)) return false; seen.add(k); return true; });
  return (
    <ul className="muscles">
      {list.map(({ m, main }) => (
        <li key={m} className={main ? 'main' : ''}>
          {muscleImage(m) && <img src={muscleImage(m)} alt="" width={56} height={56} loading="lazy" />}
          <span>{MUSCLE_LABEL[m]}</span>
          <small>{main ? '주동근' : '보조근'}</small>
        </li>
      ))}
    </ul>
  );
}

export function Credit() {
  return (
    <p className="credit">
      Exercise data by <a href={REPDB_URL} target="_blank" rel="noreferrer">RepDB (repdb.co)</a>
    </p>
  );
}

export function ExerciseDetail({ e, tier }: { e: Exercise; tier: Tier }) {
  return (
    <div className="stack">
      <div className="row" style={{ alignItems: 'baseline' }}>
        <h2 className="grow" style={{ margin: 0 }}>{e.nameKo}</h2>
        <span className="tag">{e.category === 'machine' ? '머신' : e.category === 'free' ? '프리웨이트' : '맨몸'}</span>
      </div>
      <MotionView e={e} tier={tier} secPerRep={3} />
      <MuscleChips e={e} />
      <div className="card stack" style={{ gap: 10 }}>
        <h3>운동요령</h3>
        <p><b>자세</b> {e.tips[0]}</p>
        <p><b>포인트</b> {e.tips[1]}</p>
        <p><b>주의</b> {e.tips[2]}</p>
      </div>
      {e.motion.credit && <Credit />}
    </div>
  );
}

export { REPDB_CREDIT };
