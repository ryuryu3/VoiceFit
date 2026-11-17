import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Session } from '@hc/core-domain';
import { HcDB, Repo, validateBackup } from './index';

let repo: Repo;
let n = 0;
beforeEach(() => { repo = new Repo(new HcDB(`test-${n++}`)); });

const sess = (id: string, date: string, endedAt: string): Omit<Session, 'schemaVersion'> => ({
  id, date, routineId: 'r1', app: 'voice', startedAt: endedAt, endedAt, activeSec: 1800,
  logs: [], totalVolumeKg: 1000, kcal: 200,
});

describe('설정 기억', () => {
  it('설문 저장 후 그대로 읽힘 (schemaVersion 부여)', async () => {
    expect(await repo.getProfile()).toBeUndefined();
    await repo.saveProfile({ goal: 'health', level: 'beginner', freqPerWeek: 3, minutesPerSession: 45, focusParts: ['legs'], avoidParts: [], surveyDoneAt: 'x' });
    const p = await repo.getProfile();
    expect(p?.goal).toBe('health');
    expect(p?.schemaVersion).toBe(1);
  });
  it('설정 기본값 + 부분 변경 유지', async () => {
    expect((await repo.getSettings()).voiceEnabled).toBe(true);
    await repo.patchSettings({ workoutScreen: 'motion' });
    await repo.patchSettings({ beepEnabled: false });
    const s = await repo.getSettings();
    expect(s.workoutScreen).toBe('motion');
    expect(s.beepEnabled).toBe(false);
  });
  it('운동 중 바꾼 중량이 루틴 기본값으로 저장되고 다른 값은 유지', async () => {
    await repo.saveRoutine({ id: 'r1', name: '내 루틴', items: [
      { exerciseId: 'M01', sets: 3, reps: 10, weightKg: 60, secPerRep: 3, restSec: 90 },
      { exerciseId: 'M07', sets: 3, reps: 10, weightKg: 30, secPerRep: 4, restSec: 75 },
    ] });
    await repo.applyWeights('r1', { M01: 65, M07: 30 });
    const r = await repo.getCurrentRoutine();
    expect(r!.items[0]!.weightKg).toBe(65);
    expect(r!.items[1]).toMatchObject({ weightKg: 30, secPerRep: 4 });
  });
});

describe('세션·복구', () => {
  it('날짜로 조회', async () => {
    await repo.addSession(sess('a', '2026-10-01', '2026-10-01T10:00:00Z'));
    await repo.addSession(sess('b', '2026-10-05', '2026-10-05T10:00:00Z'));
    expect((await repo.sessionsSince('2026-10-03')).map((s) => s.id)).toEqual(['b']);
    expect((await repo.sessionsOn('2026-10-01'))).toHaveLength(1);
    expect((await repo.allSessions()).map((s) => s.id)).toEqual(['a', 'b']);
  });
  it('진행 중 세션 저장·복원·삭제', async () => {
    await repo.saveActive({ sessionId: 's1', routineId: 'r1', app: 'voice', engineState: { phase: 'rest' } });
    expect((await repo.getActive())?.engineState).toEqual({ phase: 'rest' });
    await repo.clearActive();
    expect(await repo.getActive()).toBeUndefined();
  });
});

describe('백업', () => {
  it('내보내기 → 다른 DB로 가져오기', async () => {
    await repo.saveRoutine({ id: 'r1', name: 'x', items: [] });
    await repo.addSession(sess('a', '2026-10-01', '2026-10-01T10:00:00Z'));
    const file = JSON.parse(JSON.stringify(await repo.exportBackup()));
    const other = new Repo(new HcDB(`test-${n++}`));
    expect(await other.importBackup(file)).toEqual({ routines: 1, sessions: 1 });
    expect(await other.allSessions()).toHaveLength(1);
  });
  it('형식 오류·미래 버전 거부', () => {
    expect(() => validateBackup({})).toThrow();
    expect(() => validateBackup({ format: 'hc-backup', schemaVersion: 99, routines: [], sessions: [] })).toThrow(/업데이트/);
  });
});
