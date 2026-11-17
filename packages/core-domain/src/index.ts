/**
 * @hc/core-domain — 음성앱·비전앱 공통 도메인 타입 (단일 소스)
 * 스키마가 바뀌면 SCHEMA_VERSION을 올리고 storage 패키지에 마이그레이션을 추가한다.
 */
export const SCHEMA_VERSION = 1;

export type BodyPart = 'chest' | 'back' | 'shoulder' | 'arm' | 'core' | 'legs' | 'glutes';

export const BODY_PARTS: readonly BodyPart[] = ['chest', 'back', 'shoulder', 'arm', 'core', 'legs', 'glutes'];

export const BODY_PART_LABEL: Record<BodyPart, string> = {
  chest: '가슴',
  back: '등',
  shoulder: '어깨',
  arm: '팔',
  core: '복부',
  legs: '하체',
  glutes: '둔근',
};

/** 세부 근육 (모션 하이라이트·바디맵용) */
export type Muscle =
  | 'pecs' | 'upperPecs' | 'lats' | 'rhomboids' | 'traps' | 'erectors'
  | 'frontDelts' | 'sideDelts' | 'rearDelts' | 'biceps' | 'triceps' | 'brachioradialis' | 'forearms'
  | 'abs' | 'obliques' | 'quads' | 'hamstrings' | 'glutes' | 'gluteMed' | 'calves' | 'adductors';

export const MUSCLE_TO_PART: Record<Muscle, BodyPart> = {
  pecs: 'chest', upperPecs: 'chest',
  lats: 'back', rhomboids: 'back', traps: 'back', erectors: 'back',
  frontDelts: 'shoulder', sideDelts: 'shoulder', rearDelts: 'shoulder',
  biceps: 'arm', triceps: 'arm', brachioradialis: 'arm', forearms: 'arm',
  abs: 'core', obliques: 'core',
  quads: 'legs', hamstrings: 'legs', calves: 'legs', adductors: 'legs',
  glutes: 'glutes', gluteMed: 'glutes',
};

export type Goal = 'hypertrophy' | 'strength' | 'fatLoss' | 'health' | 'rehab';
export type Level = 'beginner' | 'novice' | 'intermediate';
export type ExerciseCategory = 'machine' | 'free' | 'bodyweight';
export type ExerciseMode = 'reps' | 'time';
export type Tier = 'free' | 'pro';

/** 회당 시간 선택지 (요구사항: 2~6초, 1초 단위) */
export const SEC_PER_REP_OPTIONS = [2, 3, 4, 5, 6] as const;
export type SecPerRep = (typeof SEC_PER_REP_OPTIONS)[number];

export interface Profile {
  schemaVersion: number;
  goal: Goal;
  level: Level;
  freqPerWeek: number;
  minutesPerSession: number;
  focusParts: BodyPart[];
  avoidParts: BodyPart[];
  weightKg?: number;
  surveyDoneAt: string; // ISO
}

export interface ExerciseMotion {
  /** 루프 영상 경로(WebM). 미제작이면 undefined → 앱은 프레임 또는 근육 맵 표시 */
  video?: string;
  /** 포즈 프레임 (시작·정점 2컷, 정적 동작은 start만). 회당 시간에 맞춰 전환 */
  frames?: { start: string; peak?: string };
  /** 이미지 출처 표기 (라이선스 조건) */
  credit?: string;
  /** 정지 썸네일(WebP). 무료 티어 */
  thumb?: string;
  /** 영상 1루프 = 1회 반복의 원본 길이(초). playbackRate = loopBaseSec / secPerRep */
  loopBaseSec: number;
}

/** 비전앱이 채우는 자세 기준 (같은 운동 ID 공유) */
export interface VisionRef {
  keypointAngleRanges: Record<string, [number, number]>;
}

export interface Exercise {
  id: string; // 'M01' | 'F01' | 'B01' ...
  /** RepDB 무료 데이터셋 id (이미지·MET 출처) */
  repdb?: string;
  nameKo: string;
  nameEn: string;
  category: ExerciseCategory;
  mode: ExerciseMode;
  primary: Muscle[];
  secondary: Muscle[];
  met: number;
  defaultSets: number;
  defaultReps: number;
  defaultDurationSec?: number;
  defaultRestSec: number;
  defaultWeightKg: number;
  weightStepKg: number;
  /** true면 weightKg는 '보조 무게'(어시스티드 머신) — 볼륨은 체중-보조로 계산 */
  assisted?: boolean;
  /** 운동요령 3줄: 세팅, 포인트, 흔한 실수 */
  tips: [string, string, string];
  popularityRank: number;
  /** 모션 재생 티어 (썸네일·요령은 항상 무료) */
  motionTier: Tier;
  motion: ExerciseMotion;
  visionRef?: VisionRef;
}

export interface RoutineItem {
  exerciseId: string;
  sets: number;
  reps: number;
  durationSec?: number;
  weightKg: number;
  secPerRep: SecPerRep;
  restSec: number;
}

export interface Routine {
  schemaVersion: number;
  id: string;
  name: string;
  items: RoutineItem[];
  updatedAt: string;
}

export type RepSource = 'timer' | 'vision' | 'manual';

export interface SetLog {
  exerciseId: string;
  setNo: number;
  reps: number;
  weightKg: number;
  source: RepSource;
  skipped: boolean;
  rpe?: number;
  endedAt: string;
}

export interface Session {
  schemaVersion: number;
  id: string;
  date: string; // YYYY-MM-DD (local)
  routineId: string;
  app: 'voice' | 'vision';
  startedAt: string;
  endedAt: string;
  activeSec: number;
  logs: SetLog[];
  totalVolumeKg: number;
  kcal: number;
}

export interface AppSettings {
  schemaVersion: number;
  voiceEnabled: boolean;
  beepEnabled: boolean;
  vibrateEnabled: boolean;
  autoStartNextSet: boolean;
  workoutScreen: 'progress' | 'motion';
  /** 백그라운드 유지용 저음량 오디오. 음악 앱이 멈추면 끌 수 있음 */
  backgroundAudio: boolean;
  /** 화면 탭으로 세트 완료 (주머니 오작동 시 끔) */
  tapToComplete: boolean;
  coverGuideSeen: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  schemaVersion: SCHEMA_VERSION,
  voiceEnabled: true,
  beepEnabled: true,
  vibrateEnabled: true,
  autoStartNextSet: true,
  workoutScreen: 'progress',
  backgroundAudio: true,
  tapToComplete: true,
  coverGuideSeen: false,
};

export function localDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function uid(prefix = ''): string {
  const r = Math.random().toString(36).slice(2, 10);
  return `${prefix}${Date.now().toString(36)}${r}`;
}
