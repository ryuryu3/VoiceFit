import { describe, expect, it } from 'vitest';
import type { RoutineItem } from '@hc/core-domain';
import { COUNTDOWN_SEC, createSession, reduce, snapshot, weightChanges, type Action, type Cue, type EngineState } from './index';

const item = (id: string, over: Partial<RoutineItem> = {}): RoutineItem => ({
  exerciseId: id, sets: 2, reps: 4, weightKg: 50, secPerRep: 2, restSec: 20, ...over,
});

/** 가짜 시계 드라이버 */
function driver(items: RoutineItem[], opt?: Parameters<typeof createSession>[2]) {
  let now = 1_000_000;
  let state: EngineState = createSession(items, now, opt);
  const cues: Cue[] = [];
  return {
    get s() { return state; },
    get now() { return now; },
    cues,
    act(a: Action) { const r = reduce(state, a, now); state = r.state; cues.push(...r.cues); return r.cues; },
    /** dt초 동안 step초 간격으로 TICK */
    advance(dt: number, step = 0.25) {
      const end = now + dt * 1000;
      while (now < end) { now = Math.min(end, now + step * 1000); this.act({ type: 'TICK' }); }
    },
    jump(dt: number) { now += dt * 1000; return this.act({ type: 'TICK' }); },
    snap() { return snapshot(state, now); },
  };
}

const types = (c: Cue[]) => c.map((x) => x.type);

describe('기본 흐름 (timer 모드)', () => {
  it('ready → 카운트다운 3초 → 작업 → 휴식 → 다음 세트 자동 시작 → 운동 사이 대기 → 종료', () => {
    const d = driver([item('A'), item('B', { sets: 1 })]);
    expect(d.s.phase).toBe('ready');
    d.act({ type: 'START' });
    expect(d.s.phase).toBe('countdown');
    d.advance(COUNTDOWN_SEC);
    expect(d.s.phase).toBe('working');
    // 4회 × 2초 = 8초
    d.advance(8);
    expect(d.s.phase).toBe('rest');
    expect(d.s.logs).toHaveLength(1);
    d.advance(20);
    expect(d.s.phase).toBe('countdown'); // 세트 사이 자동 시작
    d.advance(3 + 8);
    // A 완료 → B로 넘어가며 휴식(이동 시간) 후 대기
    expect(d.s.phase).toBe('rest');
    expect(d.snap().current!.exerciseId).toBe('B');
    d.advance(20);
    expect(d.s.phase).toBe('ready'); // 운동 사이는 자동 시작하지 않음
    d.act({ type: 'START' });
    d.advance(3 + 8);
    expect(d.s.phase).toBe('finished');
    expect(d.s.logs.map((l) => l.exerciseId)).toEqual(['A', 'A', 'B']);
    expect(d.s.logs.every((l) => l.source === 'timer' && l.reps === 4)).toBe(true);
  });

  it('완료한 반복만 정확히 1번씩 호명: 1,2,3,4', () => {
    const d = driver([item('A', { sets: 1 })]);
    d.act({ type: 'START' });
    d.advance(3 + 8, 0.1);
    const reps = d.cues.filter((c) => c.type === 'rep').map((c) => (c as { n: number }).n);
    expect(reps).toEqual([1, 2, 3, 4]);
    const cds = d.cues.filter((c) => c.type === 'countdown').map((c) => (c as { n: number }).n);
    expect(cds).toEqual([3, 2, 1]);
  });

  it('회당 시간 2~6초가 세트 시간에 반영', () => {
    for (const sec of [2, 3, 4, 5, 6] as const) {
      const d = driver([item('A', { sets: 1, reps: 10, secPerRep: sec })]);
      d.act({ type: 'START' });
      d.advance(3 + sec * 10 - 0.5);
      expect(d.s.phase).toBe('working');
      d.advance(0.5);
      expect(d.s.phase).toBe('finished');
    }
  });

  it('마지막 3회 신호', () => {
    const d = driver([item('A', { sets: 1, reps: 6 })]);
    d.act({ type: 'START' });
    d.advance(3 + 12, 0.1);
    const flags = d.cues.filter((c) => c.type === 'rep').map((c) => (c as { lastThree: boolean }).lastThree);
    // 완료 3회 후 남은 3 → true, 4·5 true, 6(끝) false
    expect(flags).toEqual([false, false, true, true, true, false]);
  });

  it('휴식 10초 전 경고 1회', () => {
    const d = driver([item('A', { restSec: 30 })]);
    d.act({ type: 'START' });
    d.advance(3 + 8 + 30);
    expect(d.cues.filter((c) => c.type === 'restWarn')).toHaveLength(1);
  });

  it('autoStartNextSet=false면 세트 사이에도 대기', () => {
    const d = driver([item('A')], { autoStartNextSet: false });
    d.act({ type: 'START' });
    d.advance(3 + 8 + 20);
    expect(d.s.phase).toBe('ready');
  });
});

describe('사용자 조작', () => {
  it('탭 = 세트 즉시 완료 (계획 반복 수로 기록, source manual)', () => {
    const d = driver([item('A')]);
    d.act({ type: 'START' });
    d.advance(4);
    d.act({ type: 'COMPLETE_SET' });
    expect(d.s.phase).toBe('rest');
    expect(d.s.logs[0]).toMatchObject({ reps: 4, source: 'manual' });
  });

  it('휴식 건너뛰기', () => {
    const d = driver([item('A')]);
    d.act({ type: 'START' });
    d.advance(11);
    d.act({ type: 'SKIP_REST' });
    expect(d.s.phase).toBe('countdown');
  });

  it('점유중 → 나중에: 현재 운동을 맨 뒤로, 완료 세트는 유지, 진행 중 세트는 버림', () => {
    const d = driver([item('A'), item('B'), item('C')]);
    d.act({ type: 'START' });
    d.advance(3 + 8); // A 1세트 완료
    d.act({ type: 'SKIP_REST' });
    d.advance(3 + 2); // A 2세트 진행 중
    d.act({ type: 'DEFER' });
    expect(d.s.order.map((k) => d.s.items.find((i) => i.key === k)!.exerciseId)).toEqual(['B', 'C', 'A']);
    expect(d.s.phase).toBe('ready');
    expect(d.s.logs).toHaveLength(1);
    expect(d.s.items[0]!.setsDone).toBe(1);
  });

  it('남은 운동이 하나뿐이면 나중에 불가', () => {
    const d = driver([item('A')]);
    d.act({ type: 'DEFER' });
    expect(d.s.order).toEqual(['k0']);
  });

  it('SWITCH_TO: 선택 운동을 지금, 현재 운동은 바로 다음', () => {
    const d = driver([item('A'), item('B'), item('C')]);
    d.act({ type: 'SWITCH_TO', key: 'k2' });
    expect(d.s.order).toEqual(['k2', 'k0', 'k1']);
  });

  it('REORDER: 현재 이후만 변경, 항목 집합이 다르면 무시', () => {
    const d = driver([item('A'), item('B'), item('C')]);
    d.act({ type: 'REORDER', upcoming: ['k2', 'k1'] });
    expect(d.s.order).toEqual(['k0', 'k2', 'k1']);
    d.act({ type: 'REORDER', upcoming: ['k0', 'k1'] });
    expect(d.s.order).toEqual(['k0', 'k2', 'k1']);
  });

  it('운동 중 중량 변경 → 이후 세트 기록과 루틴 저장값에 반영', () => {
    const d = driver([item('A')]);
    d.act({ type: 'START' });
    d.advance(11);
    d.act({ type: 'SET_WEIGHT', key: 'k0', weightKg: 55 });
    d.act({ type: 'SKIP_REST' });
    d.advance(11);
    expect(d.s.logs.map((l) => l.weightKg)).toEqual([50, 55]);
    expect(weightChanges(d.s)).toEqual({ A: 55 });
  });

  it('운동 건너뛰기: 남은 세트를 skipped로 기록', () => {
    const d = driver([item('A', { sets: 3 }), item('B')]);
    d.act({ type: 'SKIP_EXERCISE' });
    expect(d.s.logs.filter((l) => l.skipped)).toHaveLength(3);
    expect(d.snap().current!.exerciseId).toBe('B');
  });

  it('일시정지 동안 시간 정지, 재개 후 이어서', () => {
    const d = driver([item('A', { sets: 1 })]);
    d.act({ type: 'START' });
    d.advance(3 + 4);
    d.act({ type: 'PAUSE' });
    d.jump(120);
    expect(d.s.phase).toBe('working');
    d.act({ type: 'RESUME' });
    d.advance(3.9);
    expect(d.s.phase).toBe('working');
    d.advance(0.2);
    expect(d.s.phase).toBe('finished');
    expect(d.snap().activeSec).toBeLessThan(20);
  });

  it('중간 종료 시 완료한 세트만 남음', () => {
    const d = driver([item('A'), item('B')]);
    d.act({ type: 'START' });
    d.advance(11);
    d.act({ type: 'FINISH' });
    expect(d.s.phase).toBe('finished');
    expect(d.s.logs).toHaveLength(1);
  });
});

describe('설정 기억 중량', () => {
  it('마지막 세트만 낮춘 경우 → 가장 많이 쓴 중량을 기억', () => {
    const d = driver([item('A', { sets: 3 })]);
    d.act({ type: 'START' });
    d.advance(11); d.act({ type: 'SKIP_REST' }); d.advance(11);
    d.act({ type: 'SET_WEIGHT', key: 'k0', weightKg: 40 });
    d.act({ type: 'SKIP_REST' }); d.advance(11);
    expect(d.s.logs.map((l) => l.weightKg)).toEqual([50, 50, 40]);
    expect(weightChanges(d.s)).toEqual({ A: 50 });
  });
  it('운동 전에 중량만 바꾸고 안 했으면 바꾼 값 유지', () => {
    const d = driver([item('A'), item('B')]);
    d.act({ type: 'SET_WEIGHT', key: 'k1', weightKg: 70 });
    expect(weightChanges(d.s).B).toBe(70);
  });
});

describe('백그라운드 복귀·복원', () => {
  it('화면 꺼짐 등으로 tick이 끊겼다가 돌아와도 경과 시간만큼 따라잡음, 반복 호명은 몰아서 하지 않음', () => {
    const d = driver([item('A', { sets: 3 })]);
    d.act({ type: 'START' });
    const before = d.cues.length;
    // 3 + 8 + 20 + 3 + 3초 → 2세트 작업 중
    const cues = d.jump(37);
    expect(d.s.logs).toHaveLength(1);
    expect(d.s.phase).toBe('working');
    expect(cues.filter((c) => c.type === 'rep').length).toBeLessThanOrEqual(1);
    expect(d.cues.length).toBeGreaterThan(before);
  });

  it('state는 JSON 직렬화 후 그대로 이어서 진행 가능', () => {
    const d = driver([item('A')]);
    d.act({ type: 'START' });
    d.advance(5);
    const restored: EngineState = JSON.parse(JSON.stringify(d.s));
    const r = reduce(restored, { type: 'TICK' }, d.now + 6000);
    expect(r.state.phase).toBe('rest');
  });
});

describe('external 모드 (비전앱)', () => {
  it('REP 이벤트로만 반복 진행, 시간이 지나도 세트 완료 안 됨', () => {
    const d = driver([item('A', { sets: 1, reps: 3 })], { repSource: 'external' });
    d.act({ type: 'START' });
    d.advance(3 + 60);
    expect(d.s.phase).toBe('working');
    d.act({ type: 'REP' });
    d.act({ type: 'REP' });
    expect(d.snap().rep).toBe(2);
    d.act({ type: 'REP' });
    expect(d.s.phase).toBe('finished');
    expect(d.s.logs[0]!.source).toBe('vision');
  });
});

describe('스냅샷', () => {
  it('남은 시간은 진행할수록 감소, 종료 시 0', () => {
    const d = driver([item('A'), item('B')]);
    const t0 = d.snap().remainingSec;
    d.act({ type: 'START' });
    d.advance(10);
    const t1 = d.snap().remainingSec;
    expect(t1).toBeLessThan(t0);
    d.act({ type: 'FINISH' });
    expect(d.snap().remainingSec).toBe(0);
  });
  it('반복 진행률 0~1', () => {
    const d = driver([item('A', { sets: 1 })]);
    d.act({ type: 'START' });
    d.advance(3 + 3);
    const s = d.snap();
    expect(s.rep).toBe(1);
    expect(s.repProgress).toBeCloseTo(0.5, 1);
  });
  it('종료 후 액션은 무시', () => {
    const d = driver([item('A', { sets: 1 })]);
    d.act({ type: 'FINISH' });
    expect(types(d.act({ type: 'START' }))).toEqual([]);
  });
});
