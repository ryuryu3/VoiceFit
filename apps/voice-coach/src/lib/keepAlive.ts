/**
 * 운동 중 화면 꺼짐·백그라운드 대응 (MVP 확정 ②)
 *  1) Screen Wake Lock — 화면이 켜져 있는 동안 자동 꺼짐 방지
 *  2) 저음량 루프 오디오 — '소리 나는 페이지'로 유지해 백그라운드 스로틀 완화 + Media Session 활성화 조건
 *  3) Media Session — 잠금화면·알림창·이어폰 버튼으로 다음/일시정지
 * ⚠️ Android Chrome의 실제 동작은 실기기 검증 필요(리포트 참고). 진단 로그로 확인.
 */
import { diag } from './diag';

let wakeLock: WakeLockSentinel | null = null;
let audio: HTMLAudioElement | null = null;
let active = false;

async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator && document.visibilityState === 'visible') {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => diag('wakelock', 'released'));
      diag('wakelock', 'acquired');
    }
  } catch (e) {
    diag('wakelock', `fail ${(e as Error).message}`);
  }
}

function onVisible() {
  // 화면을 다시 켜면 Wake Lock이 자동 해제되어 있으므로 재요청
  if (active && document.visibilityState === 'visible' && (!wakeLock || wakeLock.released)) void requestWakeLock();
}

/** 아주 작은 노이즈(-60dBFS 수준) 1초 WAV — 완전 무음은 브라우저가 '소리 없음'으로 판단할 수 있어 미세 노이즈 사용 */
function makeKeepAliveWav(): string {
  const rate = 8000, n = rate;
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, 'data'); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.round((Math.random() * 2 - 1) * 30), true);
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}

/** 반드시 사용자 탭 이벤트 안에서 호출 (자동재생 정책) */
export async function startKeepAlive(withAudio = true) {
  active = true;
  await requestWakeLock();
  document.addEventListener('visibilitychange', onVisible);
  if (!withAudio) { diag('keepalive-audio', 'off (설정)'); return; }
  try {
    if (!audio) {
      audio = new Audio(makeKeepAliveWav());
      audio.loop = true;
      audio.volume = 0.05;
    }
    await audio.play();
    diag('keepalive-audio', 'playing');
  } catch (e) {
    diag('keepalive-audio', `fail ${(e as Error).message}`);
  }
}

export function stopKeepAlive() {
  active = false;
  document.removeEventListener('visibilitychange', onVisible);
  void wakeLock?.release().catch(() => {});
  wakeLock = null;
  audio?.pause();
  if ('mediaSession' in navigator) {
    navigator.mediaSession.metadata = null;
    navigator.mediaSession.playbackState = 'none';
  }
}

export interface MediaHandlers {
  onPlay: () => void;
  onPause: () => void;
  onNext: () => void;
  onPrev: () => void;
}

export function bindMediaSession(h: MediaHandlers) {
  if (!('mediaSession' in navigator)) return;
  const ms = navigator.mediaSession;
  const set = (a: MediaSessionAction, fn: () => void) => { try { ms.setActionHandler(a, fn); } catch { /* 미지원 액션 */ } };
  set('play', h.onPlay);
  set('pause', h.onPause);
  set('nexttrack', h.onNext);
  set('previoustrack', h.onPrev);
}

let lastMeta = '';
export function updateMediaSession(title: string, artist: string, paused: boolean) {
  if (!('mediaSession' in navigator)) return;
  const key = title + '|' + artist;
  if (key !== lastMeta) {
    lastMeta = key;
    navigator.mediaSession.metadata = new MediaMetadata({
      title, artist, album: '보이스 헬스코치',
      artwork: [{ src: './icon-512.png', sizes: '512x512', type: 'image/png' }],
    });
  }
  navigator.mediaSession.playbackState = paused ? 'paused' : 'playing';
}
