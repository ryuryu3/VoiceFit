import { useEffect, type ReactNode } from 'react';
import { back } from '../lib/router';

export function TopBar({ title, onBack, right }: { title: string; onBack?: (() => void) | false; right?: ReactNode }) {
  return (
    <div className="topbar">
      {onBack !== false && (
        <button className="icon-btn" aria-label="뒤로" onClick={() => (onBack ? onBack() : back())}>‹</button>
      )}
      <h1>{title}</h1>
      {right}
    </div>
  );
}

export function Stepper({ value, onChange, step = 1, min = 0, max = 999, unit, label }: {
  value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number; unit?: string; label: string;
}) {
  const fix = (v: number) => Math.min(max, Math.max(min, Math.round(v * 100) / 100));
  return (
    <div className="stepper" role="group" aria-label={label}>
      <button aria-label={`${label} 줄이기`} onClick={() => onChange(fix(value - step))} disabled={value <= min}>−</button>
      <output aria-live="polite">{value}{unit && <small>{unit}</small>}</output>
      <button aria-label={`${label} 늘리기`} onClick={() => onChange(fix(value + step))} disabled={value >= max}>+</button>
    </div>
  );
}

export function Chips<T extends string | number>({ options, value, onChange, render, label }: {
  options: readonly T[]; value: T; onChange: (v: T) => void; render?: (v: T) => ReactNode; label: string;
}) {
  return (
    <div className="chips" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={String(o)} className="chip" role="radio" aria-checked={o === value} aria-pressed={o === value} onClick={() => onChange(o)}>
          {render ? render(o) : String(o)}
        </button>
      ))}
    </div>
  );
}

export function Sheet({ onClose, children, label }: { onClose: () => void; children: ReactNode; label: string }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="sheet-back" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={label} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

export function Stars({ n }: { n: number }) {
  return (
    <span className="stars" aria-label={`중요도 ${n}점`}>
      {[1, 2, 3].map((i) => <span key={i} className={i <= n ? '' : 'off'}>★</span>)}
    </span>
  );
}
