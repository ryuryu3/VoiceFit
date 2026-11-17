import { useEffect, useState } from 'react';

/**
 * 폼팩터 판정 (F6)
 *  - mini : 플립 커버화면(Flex Window)처럼 낮거나 정사각형에 가까운 작은 화면
 *  - wide : 폴드 펼침·태블릿
 *  - base : 일반 바형, 플립·폴드 메인(접힘)
 * 화면이 바뀌어도(접기/펼치기) 운동 상태는 엔진이 들고 있어 끊기지 않음.
 */
export type FormFactor = 'mini' | 'base' | 'wide';

export function detectFormFactor(w = window.innerWidth, h = window.innerHeight): FormFactor {
  const ratio = w / h;
  if (h < 520 || (w < 520 && ratio > 0.78)) return 'mini';
  if (w >= 680) return 'wide';
  return 'base';
}

export function useFormFactor(forceMini = false): FormFactor {
  const [ff, setFf] = useState<FormFactor>(() => detectFormFactor());
  useEffect(() => {
    const on = () => setFf(detectFormFactor());
    window.addEventListener('resize', on);
    screen.orientation?.addEventListener?.('change', on);
    return () => { window.removeEventListener('resize', on); screen.orientation?.removeEventListener?.('change', on); };
  }, []);
  return forceMini ? 'mini' : ff;
}
