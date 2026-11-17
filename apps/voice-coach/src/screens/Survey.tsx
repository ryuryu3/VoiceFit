import { useState } from 'react';
import { BODY_PARTS, BODY_PART_LABEL, type BodyPart, type Goal, type Level } from '@hc/core-domain';
import { GOAL_LABEL, LEVEL_LABEL, type SurveyAnswers } from '@hc/exercise-library';
import { TopBar } from '../components/ui';
import { currentAnswers, useApp } from '../state/app';
import { go } from '../lib/router';

const GOAL_HINT: Record<Goal, string> = {
  hypertrophy: '근육을 키우고 싶어요', strength: '더 무겁게 들고 싶어요', fatLoss: '체지방을 줄이고 싶어요',
  health: '꾸준히 건강하게', rehab: '자세 교정, 무리 없는 운동',
};

const DEFAULT: SurveyAnswers = {
  goal: 'hypertrophy', level: 'beginner', freqPerWeek: 3, minutesPerSession: 60, focusParts: [], avoidParts: [],
};

type Step = 'goal' | 'level' | 'freq' | 'minutes' | 'focus' | 'avoid' | 'weight';
const STEPS: Step[] = ['goal', 'level', 'freq', 'minutes', 'focus', 'avoid', 'weight'];

export function Survey() {
  const setDraft = useApp((s) => s.setDraft);
  const [a, setA] = useState<SurveyAnswers>(() => currentAnswers() ?? DEFAULT);
  const [i, setI] = useState(0);
  const step = STEPS[i]!;
  const next = () => {
    if (i < STEPS.length - 1) setI(i + 1);
    else { setDraft({ answers: a, selected: undefined }); go({ name: 'proposal' }); }
  };
  const pick = <K extends keyof SurveyAnswers>(k: K, v: SurveyAnswers[K], auto = true) => {
    setA((p) => ({ ...p, [k]: v }));
    if (auto) setTimeout(next, 160);
  };
  const toggle = (k: 'focusParts' | 'avoidParts', p: BodyPart) =>
    setA((s) => {
      const other = k === 'focusParts' ? 'avoidParts' : 'focusParts';
      const has = s[k].includes(p);
      return { ...s, [k]: has ? s[k].filter((x) => x !== p) : [...s[k], p], [other]: s[other].filter((x) => x !== p) };
    });

  return (
    <div className="screen">
      <TopBar title="" onBack={i === 0 ? undefined : () => setI(i - 1)} right={<span className="muted small">{i + 1} / {STEPS.length}</span>} />
      <div className="progress" aria-hidden><i style={{ width: `${((i + 1) / STEPS.length) * 100}%` }} /></div>

      {step === 'goal' && (
        <>
          <h2>운동 목표가 무엇인가요?</h2>
          <div className="options">
            {(Object.keys(GOAL_LABEL) as Goal[]).map((g) => (
              <button key={g} className="opt" aria-pressed={a.goal === g} onClick={() => pick('goal', g)}>
                {GOAL_LABEL[g]}<small>{GOAL_HINT[g]}</small>
              </button>
            ))}
          </div>
        </>
      )}
      {step === 'level' && (
        <>
          <h2>운동한 지 얼마나 되었나요?</h2>
          <div className="options">
            {(Object.keys(LEVEL_LABEL) as Level[]).map((l) => (
              <button key={l} className="opt" aria-pressed={a.level === l} onClick={() => pick('level', l)}>{LEVEL_LABEL[l]}</button>
            ))}
          </div>
        </>
      )}
      {step === 'freq' && (
        <>
          <h2>일주일에 몇 번 운동하나요?</h2>
          <div className="options cols-2">
            {[2, 3, 4, 5].map((n) => (
              <button key={n} className="opt" aria-pressed={a.freqPerWeek === n} onClick={() => pick('freqPerWeek', n)}>
                {n === 5 ? '5회 이상' : `${n}회`}
              </button>
            ))}
          </div>
        </>
      )}
      {step === 'minutes' && (
        <>
          <h2>한 번에 운동할 수 있는 시간은요?</h2>
          <div className="options cols-2">
            {[30, 45, 60, 90].map((n) => (
              <button key={n} className="opt" aria-pressed={a.minutesPerSession === n} onClick={() => pick('minutesPerSession', n)}>{n}분</button>
            ))}
          </div>
        </>
      )}
      {step === 'focus' && (
        <>
          <h2>특히 키우고 싶은 부위를 골라 주세요</h2>
          <p className="muted">여러 개 골라도 돼요. 없으면 그냥 다음으로 넘어가세요.</p>
          <div className="options cols-2">
            {BODY_PARTS.map((p) => (
              <button key={p} className="opt" aria-pressed={a.focusParts.includes(p)} onClick={() => toggle('focusParts', p)}>{BODY_PART_LABEL[p]}</button>
            ))}
          </div>
        </>
      )}
      {step === 'avoid' && (
        <>
          <h2>불편하거나 피하고 싶은 부위가 있나요?</h2>
          <p className="muted">고른 부위가 주로 쓰이는 운동은 추천에서 빠져요.</p>
          <div className="options cols-2">
            {BODY_PARTS.map((p) => (
              <button key={p} className="opt" aria-pressed={a.avoidParts.includes(p)} onClick={() => toggle('avoidParts', p)}>{BODY_PART_LABEL[p]}</button>
            ))}
          </div>
        </>
      )}
      {step === 'weight' && (
        <>
          <h2>체중을 알려주시면 칼로리를 더 정확히 계산해요</h2>
          <p className="muted">입력하지 않으면 70kg 기준으로 추정해요. 기기에만 저장돼요.</p>
          <div className="row">
            <input
              type="number" inputMode="decimal" min={30} max={200} placeholder="예: 72"
              value={a.weightKg ?? ''} aria-label="체중(kg)"
              onChange={(e) => setA({ ...a, weightKg: e.target.value ? Number(e.target.value) : undefined })}
              style={{ flex: 1, minHeight: 56, borderRadius: 14, border: '1.5px solid var(--line)', background: 'var(--rubber)', padding: '0 16px', fontSize: 20 }}
            />
            <span className="muted">kg</span>
          </div>
        </>
      )}

      {(step === 'focus' || step === 'avoid' || step === 'weight') && (
        <div className="bottom-bar">
          <button className="btn primary block" onClick={next}>{step === 'weight' ? '추천 받기' : '다음'}</button>
        </div>
      )}
    </div>
  );
}
