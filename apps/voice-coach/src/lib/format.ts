import { BODY_PART_LABEL, type BodyPart } from '@hc/core-domain';

export function mmss(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

export function durationKo(sec: number): string {
  const m = Math.round(sec / 60);
  if (m < 60) return `${m}분`;
  return `${Math.floor(m / 60)}시간 ${m % 60}분`;
}

export function kg(v: number): string {
  return `${Number.isInteger(v) ? v : v.toFixed(1)}kg`;
}

export function num(v: number): string {
  return v.toLocaleString('ko-KR');
}

export function clockAfter(sec: number, from = Date.now()): string {
  const d = new Date(from + sec * 1000);
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function partsLabel(parts: BodyPart[]): string {
  return parts.map((p) => BODY_PART_LABEL[p]).join('+');
}

const NATIVE = ['', '하나', '둘', '셋', '넷', '다섯', '여섯', '일곱', '여덟', '아홉'];
const TENS = ['', '열', '스물', '서른', '마흔', '쉰'];

/** 운동 카운트용 고유어 수사 (1~59) */
export function nativeCount(n: number): string {
  if (n <= 0 || n >= 60) return String(n);
  return TENS[Math.floor(n / 10)]! + NATIVE[n % 10]!;
}

export function weightSpeech(v: number): string {
  if (v <= 0) return '';
  const s = Number.isInteger(v) ? String(v) : v.toFixed(1).replace('.', '점');
  return `${s}킬로`;
}

/** 받침 유무에 따라 조사 선택: josa('근력', '을', '를') → '근력을' */
export function josa(word: string, withBatchim: string, without: string): string {
  const c = word.charCodeAt(word.length - 1);
  const has = c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 !== 0;
  return word + (has ? withBatchim : without);
}

/** 중량 표시: 맨몸 운동 0kg = '맨몸', 추가 중량 = '+5kg', 어시스티드 = '보조 30kg' */
export function weightLabel(e: { category: string; assisted?: boolean }, w: number): string {
  if (e.assisted) return `보조 ${kg(w)}`;
  if (e.category === 'bodyweight') return w > 0 ? `+${kg(w)}` : '맨몸';
  return kg(w);
}

/** 반복/시간 표시: 플랭크 등 시간 운동은 '30초' */
export function amountLabel(it: { reps: number; durationSec?: number }): string {
  return it.durationSec ? `${it.durationSec}초` : `${it.reps}회`;
}
