/**
 * @hc/storage — IndexedDB(Dexie) 저장소. 음성앱·비전앱이 같은 origin이면 같은 DB를 공유.
 * - 오프라인 우선, 모든 레코드에 schemaVersion
 * - activeSession: 진행 중 엔진 state를 저장 → 앱이 죽어도 이어서 운동
 * - 백업 내보내기/가져오기(JSON)
 */
import Dexie, { type Table } from 'dexie';
import {
  DEFAULT_SETTINGS, SCHEMA_VERSION,
  type AppSettings, type Profile, type Routine, type Session, type Tier,
} from '@hc/core-domain';

export const DB_NAME = 'hc-db';

interface KV<T> { key: string; value: T }

export interface ActiveSessionRecord {
  key: 'active';
  sessionId: string;
  routineId: string;
  app: 'voice' | 'vision';
  /** workout-engine의 EngineState (JSON) — storage는 엔진 타입에 의존하지 않음 */
  engineState: unknown;
  savedAt: number;
}

export interface EntitlementRecord {
  key: 'entitlement';
  tier: Tier;
  /** 'subscription' | 'lifetime' | 'dev' */
  source: string;
  checkedAt: number;
  expiresAt?: number;
}

export class HcDB extends Dexie {
  profile!: Table<KV<Profile>, string>;
  settings!: Table<KV<AppSettings>, string>;
  routines!: Table<Routine, string>;
  sessions!: Table<Session, string>;
  active!: Table<ActiveSessionRecord, string>;
  entitlement!: Table<EntitlementRecord, string>;

  constructor(name = DB_NAME) {
    super(name);
    this.version(1).stores({
      profile: 'key',
      settings: 'key',
      routines: 'id, updatedAt',
      sessions: 'id, date, routineId, endedAt, app',
      active: 'key',
      entitlement: 'key',
    });
    // 스키마 변경 시: this.version(2).stores({...}).upgrade(tx => ...) 를 여기 추가
  }
}

export class Repo {
  constructor(readonly db: HcDB = new HcDB()) {}

  // ── 프로필(설문) — 한 번 하면 유지
  async getProfile(): Promise<Profile | undefined> {
    return (await this.db.profile.get('me'))?.value;
  }
  async saveProfile(p: Omit<Profile, 'schemaVersion'>): Promise<Profile> {
    const value: Profile = { ...p, schemaVersion: SCHEMA_VERSION };
    await this.db.profile.put({ key: 'me', value });
    return value;
  }

  // ── 설정
  async getSettings(): Promise<AppSettings> {
    const v = (await this.db.settings.get('app'))?.value;
    return { ...DEFAULT_SETTINGS, ...v };
  }
  async patchSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
    const next = { ...(await this.getSettings()), ...patch, schemaVersion: SCHEMA_VERSION };
    await this.db.settings.put({ key: 'app', value: next });
    return next;
  }

  // ── 루틴 — MVP는 '현재 루틴' 1개 사용(여러 개 저장 구조는 준비됨)
  async getCurrentRoutine(): Promise<Routine | undefined> {
    return this.db.routines.orderBy('updatedAt').last();
  }
  async saveRoutine(r: Omit<Routine, 'schemaVersion' | 'updatedAt'>): Promise<Routine> {
    const value: Routine = { ...r, schemaVersion: SCHEMA_VERSION, updatedAt: new Date().toISOString() };
    await this.db.routines.put(value);
    return value;
  }
  /** 설정 기억: 운동 중 바꾼 중량을 루틴 기본값으로 되돌려 저장 (순서·세트 등은 유지) */
  async applyWeights(routineId: string, weights: Record<string, number>): Promise<void> {
    const r = await this.db.routines.get(routineId);
    if (!r) return;
    let changed = false;
    const items = r.items.map((it) => {
      const w = weights[it.exerciseId];
      if (w != null && w !== it.weightKg) { changed = true; return { ...it, weightKg: w }; }
      return it;
    });
    if (changed) await this.db.routines.put({ ...r, items, updatedAt: new Date().toISOString() });
  }

  // ── 세션 기록
  async addSession(s: Omit<Session, 'schemaVersion'>): Promise<Session> {
    const value: Session = { ...s, schemaVersion: SCHEMA_VERSION };
    await this.db.sessions.put(value);
    return value;
  }
  async allSessions(): Promise<Session[]> {
    return this.db.sessions.orderBy('endedAt').toArray();
  }
  async sessionsSince(dateKey: string): Promise<Session[]> {
    return this.db.sessions.where('date').aboveOrEqual(dateKey).toArray();
  }
  async sessionsOn(dateKey: string): Promise<Session[]> {
    return this.db.sessions.where('date').equals(dateKey).toArray();
  }
  async deleteSession(id: string): Promise<void> {
    await this.db.sessions.delete(id);
  }

  // ── 진행 중 세션(크래시 복구)
  async saveActive(rec: Omit<ActiveSessionRecord, 'key' | 'savedAt'>): Promise<void> {
    await this.db.active.put({ ...rec, key: 'active', savedAt: Date.now() });
  }
  async getActive(): Promise<ActiveSessionRecord | undefined> {
    return this.db.active.get('active');
  }
  async clearActive(): Promise<void> {
    await this.db.active.delete('active');
  }

  // ── 이용권 캐시 (실제 검증은 결제 모듈이 담당)
  async getEntitlement(): Promise<EntitlementRecord | undefined> {
    return this.db.entitlement.get('entitlement');
  }
  async saveEntitlement(e: Omit<EntitlementRecord, 'key'>): Promise<void> {
    await this.db.entitlement.put({ ...e, key: 'entitlement' });
  }

  // ── 백업
  async exportBackup(): Promise<BackupFile> {
    return {
      format: 'hc-backup',
      schemaVersion: SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      profile: await this.getProfile(),
      settings: await this.getSettings(),
      routines: await this.db.routines.toArray(),
      sessions: await this.db.sessions.toArray(),
    };
  }
  /** 가져오기: 같은 id는 덮어쓰고, 기존 기록은 유지(병합) */
  async importBackup(raw: unknown): Promise<{ routines: number; sessions: number }> {
    const b = validateBackup(raw);
    await this.db.transaction('rw', [this.db.profile, this.db.settings, this.db.routines, this.db.sessions], async () => {
      if (b.profile) await this.db.profile.put({ key: 'me', value: b.profile });
      if (b.settings) await this.db.settings.put({ key: 'app', value: { ...DEFAULT_SETTINGS, ...b.settings } });
      await this.db.routines.bulkPut(b.routines);
      await this.db.sessions.bulkPut(b.sessions);
    });
    return { routines: b.routines.length, sessions: b.sessions.length };
  }

  async resetAll(): Promise<void> {
    await Promise.all(this.db.tables.map((t) => t.clear()));
  }
}

export interface BackupFile {
  format: 'hc-backup';
  schemaVersion: number;
  exportedAt: string;
  profile?: Profile;
  settings?: AppSettings;
  routines: Routine[];
  sessions: Session[];
}

export function validateBackup(raw: unknown): BackupFile {
  const b = raw as Partial<BackupFile> | null;
  if (!b || b.format !== 'hc-backup') throw new Error('백업 파일 형식이 아닙니다');
  if (typeof b.schemaVersion !== 'number' || b.schemaVersion > SCHEMA_VERSION) {
    throw new Error('더 새로운 버전 앱에서 만든 백업입니다. 앱을 업데이트해 주세요');
  }
  if (!Array.isArray(b.routines) || !Array.isArray(b.sessions)) throw new Error('백업 데이터가 손상되었습니다');
  return b as BackupFile;
}

/** 브라우저가 저장공간을 임의로 지우지 않도록 영구 저장 요청 (설치형 PWA에서 승인 확률 높음) */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.storage?.persist) {
      if (await navigator.storage.persisted()) return true;
      return await navigator.storage.persist();
    }
  } catch { /* noop */ }
  return false;
}
