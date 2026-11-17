import { describe, expect, it } from 'vitest';
import type { Session, SetLog } from '@hc/core-domain';
import { calendarDays, estimateKcal, mainParts, monthCount, partSetShare, partVolume, setVolume, streak, totalVolume, volumeDeltaPct } from './index';

const log = (id: string, w: number, reps = 10, skipped = false): SetLog => ({
  exerciseId: id, setNo: 1, reps, weightKg: w, source: 'timer', skipped, endedAt: '',
});
const sess = (id: string, date: string, vol: number, endedAt = `${date}T10:00:00Z`, logs: SetLog[] = []): Session => ({
  schemaVersion: 1, id, date, routineId: 'r', app: 'voice', startedAt: endedAt, endedAt, activeSec: 1800, logs, totalVolumeKg: vol, kcal: 100,
});

describe('볼륨', () => {
  it('중량×반복, 건너뛴 세트 제외', () => {
    expect(totalVolume([log('M01', 60), log('M01', 60), log('M07', 30, 10, true)])).toBe(1200);
  });
  it('어시스티드는 체중-보조 무게', () => {
    expect(setVolume(log('M09', 30), 70)).toBe(400);
    expect(setVolume(log('M09', 80), 70)).toBe(0);
  });
  it('부위 분포: 복합 주동근은 균등 배분', () => {
    const pv = partVolume([log('M04', 20)]); // quads(legs)+glutes
    expect(pv.legs).toBe(100);
    expect(pv.glutes).toBe(100);
  });
  it('대표 부위', () => {
    expect(mainParts([log('M01', 60), log('M01', 60), log('M07', 30)])).toEqual(['legs', 'back']);
  });
});

describe('칼로리', () => {
  it('MET × 체중 × 시간', () => {
    // M01 MET 5.0 × 70kg × 0.5h = 175
    expect(estimateKcal([log('M01', 60)], 1800, 70)).toBe(175);
    expect(estimateKcal([], 1800)).toBe(0);
  });
});

describe('캘린더·스트릭', () => {
  it('같은 날 합산 + 강도 3단계', () => {
    const m = calendarDays([sess('a', '2026-10-01', 1000), sess('b', '2026-10-01', 500), sess('c', '2026-10-02', 3000), sess('d', '2026-10-03', 200)]);
    expect(m.get('2026-10-01')!.volume).toBe(1500);
    expect(m.get('2026-10-02')!.level).toBe(3);
    expect(m.get('2026-10-03')!.level).toBe(1);
  });
  it('연속 운동일: 오늘 미운동이면 어제까지, 월 경계 통과', () => {
    const d = ['2026-09-30', '2026-10-01', '2026-10-02'];
    expect(streak(d, '2026-10-02')).toBe(3);
    expect(streak(d, '2026-10-03')).toBe(3);
    expect(streak(d, '2026-10-04')).toBe(0);
    expect(monthCount([...d, '2026-10-02'], '2026-10')).toBe(2);
  });
  it('직전 같은 루틴 대비 증감', () => {
    const a = sess('a', '2026-10-01', 1000);
    const b = sess('b', '2026-10-03', 1100);
    expect(volumeDeltaPct(b, [a, b])).toBe(10);
    expect(volumeDeltaPct(a, [a, b])).toBeNull();
  });
  it('부위 세트 비중 합 = 1', () => {
    const share = partSetShare([sess('a', '2026-10-01', 0, undefined, [log('M01', 1), log('M07', 1), log('M04', 1)])]);
    const sum = Object.values(share).reduce((x, y) => x + (y ?? 0), 0);
    expect(sum).toBeCloseTo(1);
    expect(share.legs).toBeCloseTo(0.5);
  });
});
