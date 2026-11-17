import { useRef, useState, type ReactNode } from 'react';
import type { AppSettings } from '@hc/core-domain';
import { LIBRARY_VERSION } from '@hc/exercise-library';
import { Sheet, TopBar } from '../components/ui';
import { useApp } from '../state/app';
import { repo } from '../lib/repo';
import { go } from '../lib/router';
import { setDevPro } from '../lib/billing';
import { diagReset, diagSummary } from '../lib/diag';
import { hasKoreanVoice, say, unlockAudio } from '../lib/voice';

export const APP_VERSION = '0.2.0';

function Toggle({ label, desc, k }: { label: string; desc?: string; k: keyof AppSettings }) {
  const { settings, patchSettings } = useApp();
  const on = settings[k] as boolean;
  return (
    <button className="row setting" role="switch" aria-checked={on} onClick={() => patchSettings({ [k]: !on })}>
      <span className="grow" style={{ textAlign: 'left' }}>{label}{desc && <small className="muted">{desc}</small>}</span>
      <span className={`switch ${on ? 'on' : ''}`} aria-hidden />
    </button>
  );
}

function Item({ label, onClick, right }: { label: string; onClick: () => void; right?: ReactNode }) {
  return (
    <button className="row setting" onClick={onClick}>
      <span className="grow" style={{ textAlign: 'left' }}>{label}</span>
      {right ?? <span className="muted">›</span>}
    </button>
  );
}

export function Settings() {
  const { tier, setTier, showToast, load } = useApp();
  const [sheet, setSheet] = useState<'cover' | 'diag' | 'reset' | null>(null);
  const taps = useRef(0);
  const fileRef = useRef<HTMLInputElement>(null);

  const exportBackup = async () => {
    const data = await repo.exportBackup();
    const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `헬스코치-백업-${data.exportedAt.slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    showToast('백업 파일을 저장했어요');
  };
  const importBackup = async (f?: File) => {
    if (!f) return;
    try {
      const r = await repo.importBackup(JSON.parse(await f.text()));
      await load();
      showToast(`기록 ${r.sessions}개를 불러왔어요`);
    } catch (e) { showToast((e as Error).message); }
  };
  const versionTap = async () => {
    taps.current += 1;
    if (taps.current >= 7) {
      taps.current = 0;
      const t = await setDevPro(tier !== 'pro');
      setTier(t);
      showToast(t === 'pro' ? '테스트용 프로를 켰어요' : '테스트용 프로를 껐어요');
    }
  };

  return (
    <div className="screen">
      <TopBar title="설정" />
      <section className="card settings">
        <h3>음성 코치</h3>
        <Toggle k="voiceEnabled" label="음성 카운트" desc="하나, 둘을 소리 내어 세요" />
        <Toggle k="beepEnabled" label="신호음" desc="카운트다운과 세트 끝을 비프음으로" />
        <Toggle k="vibrateEnabled" label="진동" />
        <Toggle k="autoStartNextSet" label="휴식 후 다음 세트 자동 시작" desc="끄면 휴식이 끝나도 시작을 눌러야 해요" />
        <Toggle k="tapToComplete" label="화면을 눌러 세트 끝내기" desc="주머니 속에서 잘못 눌리면 꺼 주세요" />
        <Toggle k="backgroundAudio" label="화면이 꺼져도 계속 세기" desc="듣던 음악이 멈추면 꺼 주세요. 대신 화면을 켜 두어야 해요" />
        <Item label="음성 들어보기" onClick={() => {
          unlockAudio();
          if (!hasKoreanVoice()) showToast('한국어 음성이 없어요. 기기 설정에서 Google 음성 데이터를 받아 주세요');
          say('레그 프레스, 1세트, 12회. 하나, 둘, 셋');
        }} />
      </section>

      <section className="card settings">
        <h3>내 운동</h3>
        <Item label="루틴 편집" onClick={() => go({ name: 'routine' })} />
        <Item label="운동 다시 고르기" onClick={() => go({ name: 'picker' })} />
        <Item label="설문 다시 하기" onClick={() => go({ name: 'survey' })} />
      </section>

      <section className="card settings">
        <h3>프로</h3>
        <Item label={tier === 'pro' ? '프로 모드 켜짐 (테스트)' : '프로 모드 켜기 (테스트)'} onClick={() => go({ name: 'pro' })} />
      </section>

      <section className="card settings">
        <h3>기기</h3>
        <Item label="갤럭시 플립 커버화면에서 쓰기" onClick={() => setSheet('cover')} />
        <Item label="백그라운드 진단" onClick={() => setSheet('diag')} />
      </section>

      <section className="card settings">
        <h3>데이터</h3>
        <Item label="백업 파일로 내보내기" onClick={exportBackup} />
        <Item label="백업 파일 불러오기" onClick={() => fileRef.current?.click()} />
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => importBackup(e.target.files?.[0])} />
        <Item label="모든 기록 지우기" onClick={() => setSheet('reset')} right={<span style={{ color: 'var(--danger)' }}>›</span>} />
      </section>

      <p className="credit">Exercise data by <a href="https://repdb.co" target="_blank" rel="noreferrer">RepDB (repdb.co)</a></p>
      <button className="muted small" onClick={versionTap} style={{ border: 0, background: 'none', padding: 8 }}>
        버전 {APP_VERSION}, 운동 데이터 {LIBRARY_VERSION}
      </button>

      {sheet === 'cover' && (
        <Sheet label="커버화면 사용법" onClose={() => setSheet(null)}>
          <h2>플립을 접은 채로 운동하기</h2>
          <ol className="steps">
            <li>먼저 이 앱을 홈 화면에 설치해 주세요 (Chrome 메뉴 → 홈 화면에 추가 또는 Play 스토어 설치).</li>
            <li>Galaxy Store에서 <b>Good Lock</b>을 설치하고, 그 안의 <b>MultiStar</b>를 추가해요.</li>
            <li>MultiStar → <b>I ♡ Galaxy Foldable</b> → <b>커버 화면에서 앱 실행</b>을 켜요.</li>
            <li>목록에서 <b>헬스코치</b>를 켜면 커버화면 런처 위젯에서 바로 열 수 있어요.</li>
            <li>운동 중 폰을 접으면 화면이 자동으로 <b>미니 화면</b>으로 바뀌어요. 진행은 끊기지 않아요.</li>
          </ol>
          <p className="muted small">One UI 버전에 따라 메뉴 이름이 조금 다를 수 있어요.</p>
          <button className="btn primary block" onClick={() => setSheet(null)}>확인</button>
        </Sheet>
      )}
      {sheet === 'diag' && <DiagSheet onClose={() => setSheet(null)} />}
      {sheet === 'reset' && (
        <Sheet label="모든 기록 지우기" onClose={() => setSheet(null)}>
          <h2>모든 기록을 지울까요?</h2>
          <p className="muted">설문, 루틴, 운동 기록이 모두 지워져요. 되돌릴 수 없으니 먼저 백업을 권해요.</p>
          <button className="btn danger block" onClick={async () => { await repo.resetAll(); await load(); go({ name: 'survey' }, { replace: true }); }}>모두 지우기</button>
          <button className="btn ghost block" onClick={() => setSheet(null)}>취소</button>
        </Sheet>
      )}
    </div>
  );
}

function DiagSheet({ onClose }: { onClose: () => void }) {
  const [d, setD] = useState(diagSummary());
  return (
    <Sheet label="백그라운드 진단" onClose={onClose}>
      <h2>백그라운드 진단</h2>
      <p className="muted small">운동 중 화면을 끄거나 다른 앱으로 갔을 때 타이머가 멈췄는지 확인해요. 정상이면 최대 간격이 1초 이하예요.</p>
      <div className="stat-grid">
        <div className="stat"><b>{(d.maxGapMs / 1000).toFixed(1)}초</b><span>최대 타이머 간격</span></div>
        <div className="stat"><b>{d.gapsOver2s}번</b><span>2초 넘게 멈춤</span></div>
      </div>
      <ul className="diag-log">
        {d.entries.slice(0, 80).map((e, i) => (
          <li key={i}><span className="muted">{new Date(e.t).toLocaleTimeString('ko-KR')}</span> {e.kind} {e.detail}</li>
        ))}
        {!d.entries.length && <li className="muted">아직 기록이 없어요. 운동을 시작한 뒤 확인해 주세요.</li>}
      </ul>
      <div className="row">
        <button className="btn ghost grow" onClick={() => { diagReset(); setD(diagSummary()); }}>기록 지우기</button>
        <button className="btn primary grow" onClick={onClose}>닫기</button>
      </div>
    </Sheet>
  );
}
