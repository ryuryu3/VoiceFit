/**
 * 백그라운드 진단 로그 — 실기기 테스트에서 "화면 꺼짐/다른 앱 전환 시 타이머·음성이 멈추는가"를 확인하기 위한 기록.
 * 설정 > 백그라운드 진단에서 확인. 메모리에만 보관(최근 300건).
 */
export interface DiagEntry { t: number; kind: string; detail?: string }

const log: DiagEntry[] = [];
let lastTick = 0;
let maxGapMs = 0;
let gapsOver2s = 0;

export function diag(kind: string, detail?: string) {
  log.push({ t: Date.now(), kind, detail });
  if (log.length > 300) log.shift();
}

/** 엔진 TICK 간격 측정 — 정상은 200~300ms, 백그라운드 스로틀이면 1초 이상 */
export function diagTick(now = Date.now()) {
  if (lastTick) {
    const gap = now - lastTick;
    if (gap > maxGapMs) maxGapMs = gap;
    if (gap > 2000) { gapsOver2s++; diag('tick-gap', `${(gap / 1000).toFixed(1)}초 (${document.visibilityState})`); }
  }
  lastTick = now;
}

export function diagReset() { log.length = 0; lastTick = 0; maxGapMs = 0; gapsOver2s = 0; }

export function diagSummary() {
  return { entries: [...log].reverse(), maxGapMs, gapsOver2s };
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => diag('visibility', document.visibilityState));
  window.addEventListener('pagehide', () => diag('pagehide'));
  window.addEventListener('freeze', () => diag('freeze'));
  window.addEventListener('resume', () => diag('resume'));
}
