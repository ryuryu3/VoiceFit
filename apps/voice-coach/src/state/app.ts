import { create } from 'zustand';
import { DEFAULT_SETTINGS, type AppSettings, type Profile, type Routine, type Tier } from '@hc/core-domain';
import { requestPersistentStorage } from '@hc/storage';
import { repo } from '../lib/repo';
import { refreshEntitlement } from '../lib/billing';
import type { SurveyAnswers } from '@hc/exercise-library';

/**
 * 앱 전역 상태 — 저장소의 캐시. 쓰기는 항상 repo를 거쳐 영구 저장(설정 기억).
 * 온보딩 중 임시 상태(draft)는 저장 전까지 메모리에만.
 */
interface AppState {
  loaded: boolean;
  profile?: Profile;
  routine?: Routine;
  settings: AppSettings;
  tier: Tier;
  /** 온보딩 진행 중 임시값 */
  draftAnswers?: SurveyAnswers;
  draftSelected?: string[];
  toast?: string;

  load(): Promise<void>;
  saveProfile(a: SurveyAnswers): Promise<void>;
  saveRoutine(r: Omit<Routine, 'schemaVersion' | 'updatedAt'>): Promise<void>;
  patchSettings(p: Partial<AppSettings>): Promise<void>;
  setTier(t: Tier): void;
  setDraft(p: { answers?: SurveyAnswers; selected?: string[] }): void;
  showToast(msg: string): void;
  reloadRoutine(): Promise<void>;
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;

export const useApp = create<AppState>((set, get) => ({
  loaded: false,
  settings: DEFAULT_SETTINGS,
  tier: 'free',

  async load() {
    const [profile, routine, settings] = await Promise.all([repo.getProfile(), repo.getCurrentRoutine(), repo.getSettings()]);
    const cachedTier = (await repo.getEntitlement())?.tier ?? 'free';
    set({ profile, routine, settings, tier: cachedTier, loaded: true });
    void requestPersistentStorage();
    void refreshEntitlement().then((tier) => set({ tier }));
  },

  async saveProfile(a) {
    const profile = await repo.saveProfile({ ...a, surveyDoneAt: new Date().toISOString() });
    set({ profile });
  },

  async saveRoutine(r) {
    const routine = await repo.saveRoutine(r);
    set({ routine, draftSelected: undefined });
  },

  async reloadRoutine() {
    set({ routine: await repo.getCurrentRoutine() });
  },

  async patchSettings(p) {
    const settings = await repo.patchSettings(p);
    set({ settings });
  },

  setTier(tier) { set({ tier }); },

  setDraft({ answers, selected }) {
    set({
      draftAnswers: answers ?? get().draftAnswers,
      draftSelected: selected ?? get().draftSelected,
    });
  },

  showToast(msg) {
    clearTimeout(toastTimer);
    set({ toast: msg });
    toastTimer = setTimeout(() => set({ toast: undefined }), 2400);
  },
}));

/** 설문 답(임시값 우선, 없으면 저장된 프로필) */
export function currentAnswers(): SurveyAnswers | undefined {
  const s = useApp.getState();
  if (s.draftAnswers) return s.draftAnswers;
  if (!s.profile) return undefined;
  const { schemaVersion: _v, surveyDoneAt: _d, ...rest } = s.profile;
  return rest;
}
