/**
 * 결제 — Play 스토어 등록(TWA) + Google Play 결제
 *  - TWA 안에서는 Digital Goods API + Payment Request API(https://play.google.com/billing)로 결제
 *  - 브라우저(일반 Chrome)에서는 결제 불가 → "Play 스토어 앱에서 구매" 안내
 *
 * ⚠️ 출시 전 필수(리포트 참고): 구매 토큰 서버 검증 + acknowledge
 *    Play는 3일 안에 acknowledge되지 않은 구매를 자동 환불함. 클라이언트만으로는 처리 불가 → 서버(예: Cloudflare Worker) 필요.
 *    VERIFY_ENDPOINT를 설정하면 구매 직후 토큰을 서버로 보내고, 서버가 검증·acknowledge 후 tier를 돌려주는 구조.
 */
import type { Tier } from '@hc/core-domain';
import { repo } from './repo';
import { diag } from './diag';

export const PLAY_BILLING = 'https://play.google.com/billing';
export const PRODUCTS = {
  monthly: { id: 'pro_monthly', type: 'subs' as const, label: '월 구독' },
  lifetime: { id: 'pro_lifetime', type: 'inapp' as const, label: '평생 이용권' },
};
export type ProductKey = keyof typeof PRODUCTS;

/**
 * 앱 구입 기능 노출 여부. 테스트 기간에는 숨김(기본값 false).
 * 출시 빌드에서 VITE_PURCHASE_ENABLED=true 로 켬. 켜지 않으면 프로 화면에 '테스트용 프로' 스위치만 보임.
 */
export const PURCHASE_ENABLED = import.meta.env.VITE_PURCHASE_ENABLED === 'true';

/** 서버 검증 엔드포인트 (미설정 = MVP 테스트 모드) */
const VERIFY_ENDPOINT: string | undefined = import.meta.env.VITE_BILLING_VERIFY_URL;

interface ItemDetails { itemId: string; title: string; price: { currency: string; value: string } }
interface PurchaseDetails { itemId: string; purchaseToken: string }
interface DigitalGoodsService {
  getDetails(ids: string[]): Promise<ItemDetails[]>;
  listPurchases(): Promise<PurchaseDetails[]>;
}
declare global {
  interface Window { getDigitalGoodsService?: (url: string) => Promise<DigitalGoodsService> }
}

let svc: DigitalGoodsService | null | undefined;

export async function getService(): Promise<DigitalGoodsService | null> {
  if (svc !== undefined) return svc;
  try {
    svc = window.getDigitalGoodsService ? await window.getDigitalGoodsService(PLAY_BILLING) : null;
  } catch (e) {
    diag('billing', `service unavailable ${(e as Error).message}`);
    svc = null;
  }
  return svc;
}

export async function billingAvailable(): Promise<boolean> {
  return (await getService()) != null;
}

export async function productPrices(): Promise<Partial<Record<ProductKey, string>>> {
  const s = await getService();
  if (!s) return {};
  try {
    const details = await s.getDetails(Object.values(PRODUCTS).map((p) => p.id));
    const out: Partial<Record<ProductKey, string>> = {};
    for (const [k, p] of Object.entries(PRODUCTS) as [ProductKey, (typeof PRODUCTS)[ProductKey]][]) {
      const d = details.find((x) => x.itemId === p.id);
      if (d) out[k] = new Intl.NumberFormat('ko-KR', { style: 'currency', currency: d.price.currency }).format(Number(d.price.value));
    }
    return out;
  } catch { return {}; }
}

async function verify(token: string, itemId: string): Promise<Tier> {
  if (!VERIFY_ENDPOINT) {
    diag('billing', 'VERIFY_ENDPOINT 미설정 — 테스트 모드로 로컬 승인');
    return 'pro';
  }
  const r = await fetch(VERIFY_ENDPOINT, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ purchaseToken: token, itemId, packageName: import.meta.env.VITE_PLAY_PACKAGE }),
  });
  if (!r.ok) throw new Error('구매 확인에 실패했어요. 잠시 후 다시 시도해 주세요');
  return ((await r.json()) as { tier: Tier }).tier;
}

export async function purchase(key: ProductKey): Promise<Tier> {
  const p = PRODUCTS[key];
  if (!(await billingAvailable())) throw new Error('결제는 Play 스토어에서 설치한 앱에서만 할 수 있어요');
  const req = new PaymentRequest(
    [{ supportedMethods: PLAY_BILLING, data: { sku: p.id } }],
    { total: { label: '합계', amount: { currency: 'KRW', value: '0' } } },
  );
  const res = await req.show();
  const { purchaseToken } = res.details as { purchaseToken: string };
  try {
    const tier = await verify(purchaseToken, p.id);
    await res.complete('success');
    await repo.saveEntitlement({ tier, source: key === 'monthly' ? 'subscription' : 'lifetime', checkedAt: Date.now() });
    return tier;
  } catch (e) {
    await res.complete('fail');
    throw e;
  }
}

/** 앱 시작 시: 보유 구매 확인 → 이용권 갱신. 오프라인이면 캐시 사용 */
export async function refreshEntitlement(): Promise<Tier> {
  const cached = await repo.getEntitlement();
  if (cached?.source === 'dev' || !PURCHASE_ENABLED) return cached?.tier ?? 'free';
  const s = await getService();
  if (!s) return cached?.tier ?? 'free';
  try {
    const owned = await s.listPurchases();
    const ids: string[] = Object.values(PRODUCTS).map((p) => p.id);
    const has = owned.find((o) => ids.includes(o.itemId));
    const tier: Tier = has ? 'pro' : 'free';
    await repo.saveEntitlement({ tier, source: has?.itemId === PRODUCTS.lifetime.id ? 'lifetime' : has ? 'subscription' : 'none', checkedAt: Date.now() });
    return tier;
  } catch {
    return cached?.tier ?? 'free';
  }
}

/** 개발·실기기 테스트용 프로 토글 (설정 > 앱 버전 7번 탭) */
export async function setDevPro(on: boolean): Promise<Tier> {
  const tier: Tier = on ? 'pro' : 'free';
  await repo.saveEntitlement({ tier, source: on ? 'dev' : 'none', checkedAt: Date.now() });
  return tier;
}
