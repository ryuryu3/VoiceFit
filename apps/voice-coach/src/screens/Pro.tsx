import { useEffect, useState } from 'react';
import { TopBar } from '../components/ui';
import { PURCHASE_ENABLED, billingAvailable, productPrices, purchase, setDevPro, type ProductKey, PRODUCTS } from '../lib/billing';
import { useApp } from '../state/app';

/**
 * 프로 — 테스트 기간(PURCHASE_ENABLED=false)에는 구입 버튼을 숨기고 '테스트용 프로' 스위치만 보여줌.
 * 출시 빌드에서는 월 구독 / 평생 이용권 (Google Play 결제).
 */
export function Pro() {
  const { tier, setTier, showToast } = useApp();
  const [avail, setAvail] = useState<boolean>();
  const [prices, setPrices] = useState<Partial<Record<ProductKey, string>>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!PURCHASE_ENABLED) return;
    void billingAvailable().then(setAvail);
    void productPrices().then(setPrices);
  }, []);

  const buy = async (k: ProductKey) => {
    setBusy(true);
    try {
      const t = await purchase(k);
      setTier(t);
      showToast('프로가 적용됐어요');
    } catch (e) {
      const msg = (e as Error).message;
      if (!/abort|cancel/i.test(msg)) showToast(msg);
    } finally { setBusy(false); }
  };

  const toggleTest = async () => {
    const t = await setDevPro(tier !== 'pro');
    setTier(t);
    showToast(t === 'pro' ? '프로 모드를 켰어요' : '프로 모드를 껐어요');
  };

  return (
    <div className="screen">
      <TopBar title="프로" />
      <h2>운동 모션으로 자세까지 따라 하기</h2>
      <div className="card stack" style={{ gap: 10 }}>
        <div className="row"><span className="grow">운동요령, 근육 썸네일</span><b>무료</b></div>
        <div className="row"><span className="grow">운동 중 모션 화면 (전 운동)</span><b style={{ color: 'var(--orange-ink)' }}>프로</b></div>
        <div className="row"><span className="grow">내 기록으로 덜 한 부위 추천</span><b style={{ color: 'var(--orange-ink)' }}>프로</b></div>
        <div className="row"><span className="grow">새로 추가되는 운동 모션</span><b style={{ color: 'var(--orange-ink)' }}>프로</b></div>
      </div>

      {!PURCHASE_ENABLED ? (
        <div className="card stack" style={{ gap: 10 }}>
          <button className="row setting" role="switch" aria-checked={tier === 'pro'} onClick={toggleTest} style={{ borderBottom: 0 }}>
            <span className="grow" style={{ textAlign: 'left' }}>
              <b>프로 모드 (테스트)</b>
              <small className="muted">테스트 기간에는 결제 없이 켜고 끌 수 있어요</small>
            </span>
            <span className={`switch ${tier === 'pro' ? 'on' : ''}`} aria-hidden />
          </button>
        </div>
      ) : tier === 'pro' ? (
        <div className="notice">프로를 이용 중이에요.</div>
      ) : (
        <div className="stack">
          <button className="btn primary block" disabled={busy || !avail} onClick={() => buy('monthly')}>
            {PRODUCTS.monthly.label}{prices.monthly ? ` ${prices.monthly}` : ''}
          </button>
          <button className="btn ghost block" disabled={busy || !avail} onClick={() => buy('lifetime')}>
            {PRODUCTS.lifetime.label}{prices.lifetime ? ` ${prices.lifetime}` : ''}
          </button>
          {avail === false && (
            <p className="muted small">결제는 Play 스토어에서 설치한 앱에서 할 수 있어요.</p>
          )}
        </div>
      )}
    </div>
  );
}
