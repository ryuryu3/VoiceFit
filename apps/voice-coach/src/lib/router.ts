import { useEffect, useState } from 'react';

/**
 * 해시 라우터 — 안드로이드 뒤로가기가 앱 종료가 아니라 이전 화면으로 가도록 history 사용.
 * 경로 예: #/home, #/workout, #/summary/abc
 */
export type Route =
  | { name: 'survey' }
  | { name: 'proposal' }
  | { name: 'picker' }
  | { name: 'routine' }
  | { name: 'home' }
  | { name: 'workout' }
  | { name: 'summary'; id: string }
  | { name: 'calendar' }
  | { name: 'settings' }
  | { name: 'pro' }
  | { name: 'exercise'; id: string };

export function parse(hash: string): Route | null {
  const [, name, arg] = hash.replace(/^#/, '').split('/');
  switch (name) {
    case 'survey': case 'proposal': case 'picker': case 'routine': case 'home':
    case 'workout': case 'calendar': case 'settings': case 'pro':
      return { name } as Route;
    case 'summary': return arg ? { name, id: arg } : null;
    case 'exercise': return arg ? { name, id: arg } : null;
    default: return null;
  }
}

export function toHash(r: Route): string {
  return '#/' + r.name + ('id' in r ? `/${r.id}` : '');
}

export function go(r: Route, opts: { replace?: boolean } = {}) {
  const h = toHash(r);
  if (opts.replace) history.replaceState(null, '', h);
  else history.pushState(null, '', h);
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

export function back(fallback: Route = { name: 'home' }) {
  if (history.length > 1) history.back();
  else go(fallback, { replace: true });
}

export function useRoute(): Route | null {
  const [r, setR] = useState(() => parse(location.hash));
  useEffect(() => {
    const on = () => setR(parse(location.hash));
    window.addEventListener('hashchange', on);
    window.addEventListener('popstate', on);
    return () => { window.removeEventListener('hashchange', on); window.removeEventListener('popstate', on); };
  }, []);
  return r;
}
