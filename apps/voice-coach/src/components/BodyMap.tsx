import type { Muscle } from '@hc/core-domain';

/**
 * 단순화된 인체 근육 맵 (앞/뒤). 3D 모션 영상이 준비되기 전 썸네일·모션 모드의 대체 표현.
 * 주동근 = 주황, 보조근 = 연주황. pulse(0~1)로 수축 느낌의 강약을 줌.
 */
type View = 'front' | 'back';

const FRONT: Partial<Record<Muscle, string[]>> = {
  frontDelts: ['M29 30 Q21 31 21 41 Q27 41 33 36 Z', 'M71 30 Q79 31 79 41 Q73 41 67 36 Z'],
  sideDelts: ['M21 41 Q19 46 21 50 Q24 46 24 42 Z', 'M79 41 Q81 46 79 50 Q76 46 76 42 Z'],
  pecs: ['M49 34 Q38 31 33 37 Q32 49 40 52 Q46 53 49 50 Z', 'M51 34 Q62 31 67 37 Q68 49 60 52 Q54 53 51 50 Z'],
  upperPecs: ['M49 34 Q38 31 33 37 L34 41 Q42 39 49 41 Z', 'M51 34 Q62 31 67 37 L66 41 Q58 39 51 41 Z'],
  biceps: ['M22 50 Q19 60 21 68 Q25 69 26 60 Q26 53 24 49 Z', 'M78 50 Q81 60 79 68 Q75 69 74 60 Q74 53 76 49 Z'],
  brachioradialis: ['M20 70 Q17 78 18 86 Q21 84 23 76 Q23 71 22 69 Z', 'M80 70 Q83 78 82 86 Q79 84 77 76 Q77 71 78 69 Z'],
  forearms: ['M18 86 Q17 94 18 100 L21 100 Q22 92 21 85 Z', 'M82 86 Q83 94 82 100 L79 100 Q78 92 79 85 Z'],
  abs: ['M44 55 h12 v33 q-6 4 -12 0 Z'],
  obliques: ['M38 56 Q36 72 39 88 L43 88 L43 56 Z', 'M62 56 Q64 72 61 88 L57 88 L57 56 Z'],
  quads: ['M37 106 Q33 124 38 146 Q44 148 47 144 Q49 124 48 108 Z', 'M63 106 Q67 124 62 146 Q56 148 53 144 Q51 124 52 108 Z'],
  calves: ['M38 156 Q36 170 39 184 L43 184 Q44 168 43 156 Z', 'M62 156 Q64 170 61 184 L57 184 Q56 168 57 156 Z'],
  adductors: ['M47 110 Q45 122 46 136 L49 134 L49 111 Z', 'M53 110 Q55 122 54 136 L51 134 L51 111 Z'],
};

const BACK: Partial<Record<Muscle, string[]>> = {
  traps: ['M50 22 L37 32 L44 36 L50 54 L56 36 L63 32 Z'],
  rearDelts: ['M30 31 Q21 32 21 42 Q27 42 33 37 Z', 'M70 31 Q79 32 79 42 Q73 42 67 37 Z'],
  rhomboids: ['M44 37 L49 40 L49 52 L45 48 Z', 'M56 37 L51 40 L51 52 L55 48 Z'],
  lats: ['M35 42 Q32 62 41 80 L47 72 Q46 56 43 46 Z', 'M65 42 Q68 62 59 80 L53 72 Q54 56 57 46 Z'],
  erectors: ['M45 70 h4 v24 h-4 Z', 'M51 70 h4 v24 h-4 Z'],
  triceps: ['M22 44 Q18 56 21 68 Q25 66 26 56 Q26 48 24 43 Z', 'M78 44 Q82 56 79 68 Q75 66 74 56 Q74 48 76 43 Z'],
  forearms: ['M20 70 Q17 82 18 98 L21 98 Q23 84 22 70 Z', 'M80 70 Q83 82 82 98 L79 98 Q77 84 78 70 Z'],
  gluteMed: ['M36 94 Q34 100 37 104 L42 98 Z', 'M64 94 Q66 100 63 104 L58 98 Z'],
  glutes: ['M37 100 Q36 114 43 117 Q49 116 49 104 Q45 97 40 98 Z', 'M63 100 Q64 114 57 117 Q51 116 51 104 Q55 97 60 98 Z'],
  hamstrings: ['M37 120 Q35 134 39 148 L46 148 Q48 134 47 120 Z', 'M63 120 Q65 134 61 148 L54 148 Q52 134 53 120 Z'],
  calves: ['M37 154 Q34 166 39 180 Q43 178 44 166 Q44 158 42 154 Z', 'M63 154 Q66 166 61 180 Q57 178 56 166 Q56 158 58 154 Z'],
};

const SILHOUETTE = [
  'M50 4a10 10 0 1 1 0 20a10 10 0 1 1 0-20Z', // head
  'M45 22h10v8h-10Z',
  // torso + arms + legs (하나의 패스)
  'M30 29 Q50 25 70 29 Q81 31 82 44 L84 70 L85 100 L80 104 L77 74 L74 52 L66 56 L65 92 Q67 100 65 108 L64 150 L63 192 L55 194 L54 150 L52 112 L48 112 L46 150 L45 194 L37 192 L36 150 L35 108 Q33 100 35 92 L34 56 L26 52 L23 74 L20 104 L15 100 L16 70 L18 44 Q19 31 30 29 Z',
];

export interface BodyMapProps {
  primary: Muscle[];
  secondary?: Muscle[];
  view?: View | 'both' | 'auto';
  pulse?: number;
  className?: string;
  title?: string;
}

function pickView(primary: Muscle[]): View {
  const f = primary.filter((m) => FRONT[m]).length;
  const b = primary.filter((m) => BACK[m]).length;
  return b > f ? 'back' : 'front';
}

function Figure({ view, primary, secondary, pulse, x }: { view: View; primary: Muscle[]; secondary: Muscle[]; pulse: number; x: number }) {
  const map = view === 'front' ? FRONT : BACK;
  const hiOpacity = 0.75 + 0.25 * pulse;
  return (
    <g transform={`translate(${x} 0)`}>
      {SILHOUETTE.map((d, i) => <path key={i} d={d} fill="#bfbab3" />)}
      {Object.entries(map).map(([m, paths]) => {
        const isP = primary.includes(m as Muscle);
        const isS = !isP && secondary.includes(m as Muscle);
        const fill = isP ? '#FF6B1A' : isS ? '#FFA36F' : '#a8a39c';
        const op = isP ? hiOpacity : isS ? 0.85 : 0.7;
        return paths!.map((d, i) => <path key={m + i} d={d} fill={fill} opacity={op} />);
      })}
    </g>
  );
}

export function BodyMap({ primary, secondary = [], view = 'auto', pulse = 1, className, title }: BodyMapProps) {
  const v = view === 'auto' ? pickView(primary) : view;
  const both = v === 'both';
  return (
    <svg viewBox={both ? '0 0 200 200' : '0 0 100 200'} className={className} role="img" aria-label={title}>
      {(both || v === 'front') && <Figure view="front" primary={primary} secondary={secondary} pulse={pulse} x={0} />}
      {(both || v === 'back') && <Figure view="back" primary={primary} secondary={secondary} pulse={pulse} x={both ? 100 : 0} />}
    </svg>
  );
}
