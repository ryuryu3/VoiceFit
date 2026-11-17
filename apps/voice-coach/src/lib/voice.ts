/**
 * 음성·비프·진동 출력 — 엔진 Cue를 사람이 듣는 신호로 변환.
 * 출력 수단을 바꿀 때(사전 녹음 파일 등) 이 파일만 교체하면 됨. 엔진·화면은 그대로.
 */
import type { Cue } from '@hc/workout-engine';
import { getExercise } from '@hc/exercise-library';
import type { AppSettings } from '@hc/core-domain';
import { nativeCount, weightSpeech } from './format';
import { diag } from './diag';

let ctx: AudioContext | null = null;
let koVoice: SpeechSynthesisVoice | null = null;

function pickVoice() {
  if (!('speechSynthesis' in window)) return;
  const vs = speechSynthesis.getVoices();
  koVoice = vs.find((v) => v.lang === 'ko-KR' && /google/i.test(v.name)) ?? vs.find((v) => v.lang.startsWith('ko')) ?? null;
}
if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  pickVoice();
  speechSynthesis.addEventListener?.('voiceschanged', pickVoice);
}

/** 사용자 탭 안에서 1회 호출 — 오디오·음성 잠금 해제 */
export function unlockAudio() {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
  } catch { /* noop */ }
  if ('speechSynthesis' in window) {
    const u = new SpeechSynthesisUtterance(' ');
    u.volume = 0;
    speechSynthesis.speak(u);
  }
}

export function hasKoreanVoice(): boolean {
  pickVoice();
  return !!koVoice;
}

export function beep(freq = 880, ms = 120, gain = 0.25) {
  if (!ctx) return;
  try {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = freq;
    o.type = 'sine';
    g.gain.setValueAtTime(gain, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + ms / 1000);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + ms / 1000 + 0.02);
  } catch { /* noop */ }
}

function vibrate(pattern: number | number[]) {
  try { navigator.vibrate?.(pattern); } catch { /* noop */ }
}

interface SayOpt { interrupt?: boolean; pitch?: number; rate?: number }

export function say(text: string, opt: SayOpt = {}) {
  if (!('speechSynthesis' in window) || !text) return;
  if (opt.interrupt) speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'ko-KR';
  if (koVoice) u.voice = koVoice;
  u.rate = opt.rate ?? 1.1;
  u.pitch = opt.pitch ?? 1;
  u.onerror = (e) => diag('tts-error', e.error);
  speechSynthesis.speak(u);
}

export interface CueContext {
  settings: AppSettings;
  /** 이 큐들이 처리된 뒤 엔진 단계 */
  phase: string;
  nameOf: (key: string) => string;
}

/** 한 번의 리듀스에서 나온 큐 묶음을 출력 */
export function playCues(cues: Cue[], c: CueContext) {
  const { voiceEnabled: V, beepEnabled: B, vibrateEnabled: H } = c.settings;
  for (const cue of cues) {
    switch (cue.type) {
      case 'announce': {
        if (!V) break;
        if (c.phase === 'ready') {
          say(`다음은 ${c.nameOf(cue.key)}. 준비되면 시작을 누르세요`);
        } else {
          const w = weightSpeech(cue.weightKg);
          const body = cue.durationSec ? `${cue.durationSec}초` : `${cue.reps}회`;
          say(`${c.nameOf(cue.key)}, ${cue.setNo}세트, ${body}${w ? ', ' + w : ''}`);
        }
        break;
      }
      case 'countdown':
        if (B) beep(660, 100);
        if (H) vibrate(40);
        break;
      case 'go':
        if (B) beep(990, 260);
        if (H) vibrate(120);
        if (V) say('시작', { interrupt: false });
        break;
      case 'rep':
        if (V) say(nativeCount(cue.n), { interrupt: true, pitch: cue.lastThree ? 1.25 : 1, rate: 1.2 });
        else if (B) beep(cue.lastThree ? 1100 : 880, 80);
        break;
      case 'timeLeft':
        if (V) say(`${cue.sec}초`, { interrupt: true });
        break;
      case 'setDone':
        if (B) { beep(880, 120); setTimeout(() => beep(1320, 180), 140); }
        if (H) vibrate([80, 60, 160]);
        break;
      case 'restStart':
        if (!V) break;
        if (cue.nextIsNewExercise) say(`잘했어요. 다음 운동은 ${c.nameOf(cue.nextKey)}`);
        else say(`세트 끝. 휴식 ${cue.sec}초`);
        break;
      case 'restWarn':
        if (V) say(cue.autoStart ? '10초 후 시작합니다' : '휴식 10초 남았어요');
        if (H) vibrate(60);
        break;
      case 'finished':
        if (V) say('운동 완료. 수고하셨어요', { interrupt: true });
        if (H) vibrate([100, 80, 100, 80, 300]);
        break;
      default:
        break;
    }
  }
}

export function nameOfExercise(exerciseId: string): string {
  try { return getExercise(exerciseId).nameKo; } catch { return exerciseId; }
}
