/**
 * 반복 링 — 반복 수만큼 조각으로 나뉜 원. 완료한 반복은 채워지고, 진행 중인 조각은 회당 시간에 맞춰 차오름.
 * 휴식 중에는 하나의 링이 줄어드는 타이머로 바뀜.
 */
export function RepRing({ mode, total, done, progress, label, sub }: {
  mode: 'reps' | 'timer';
  total: number;
  done: number;
  /** reps: 진행 중 조각 0~1 / timer: 남은 비율 0~1 */
  progress: number;
  label: string;
  sub?: string;
}) {
  const R = 44, C = 2 * Math.PI * R;
  const gap = total > 1 ? Math.min(2.2, (C / total) * 0.12) : 0;
  const seg = total > 0 ? C / total : C;
  return (
    <div className="rep-ring">
      <svg viewBox="0 0 100 100" aria-hidden>
        <g transform="rotate(-90 50 50)">
          {mode === 'timer' ? (
            <>
              <circle cx="50" cy="50" r={R} className="ring-track" />
              <circle cx="50" cy="50" r={R} className="ring-fill" strokeDasharray={`${C * progress} ${C}`} />
            </>
          ) : (
            Array.from({ length: total }, (_, i) => {
              const fill = i < done ? 1 : i === done ? progress : 0;
              const len = seg - gap;
              return (
                <g key={i}>
                  <circle cx="50" cy="50" r={R} className="ring-track" strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-i * seg} />
                  {fill > 0 && (
                    <circle cx="50" cy="50" r={R} className={i < done ? 'ring-fill' : 'ring-fill live'}
                      strokeDasharray={`${len * fill} ${C - len * fill}`} strokeDashoffset={-i * seg} />
                  )}
                </g>
              );
            })
          )}
        </g>
      </svg>
      <div className="rep-ring-center">
        <span className="rep-num">{label}</span>
        {sub && <span className="rep-sub">{sub}</span>}
      </div>
    </div>
  );
}
