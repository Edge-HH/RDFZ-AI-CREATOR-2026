export type CrewId = 'lin' | 'amara' | 'andrei' | 'rin';
export const CREW_IDS: CrewId[] = ['lin', 'amara', 'andrei', 'rin'];
export type CrewStatus = 'ok' | 'injured' | 'lost' | 'stayed';

export interface CrewMember {
  id: CrewId;
  health: number; // 0-100
  morale: number; // 0-100
  trust: number; // 0-100，对地面（玩家）的信任
  dose: number; // 累计剂量 mSv
  status: CrewStatus;
}

export type SiteId = 'utopia' | 'jezero' | 'arcadia';
export type Mode = 'standard' | 'story';

export interface MissionState {
  version: 1;
  seed: number;
  rng: number;
  mode: Mode;
  day: number; // 任务日，发射日为 0
  storage: number; // 储能 kWh（仅地表有意义）
  o2: number; // 物资：可维持天数
  water: number;
  food: number;
  spares: number;
  integrity: number; // 系统完好度 0-100
  dustTau: number; // 大气光学厚度
  science: number;
  propellant: number; // 上升器推进剂 %
  autonomy: number; // 授权度 0-3
  autonomyLog: number[];
  crew: CrewMember[];
  loadout: string[];
  site: SiteId | null;
  presets: string[];
  flags: string[];
  archive: string[];
  history: HistoryEntry[];
}

export interface HistoryEntry {
  day: number;
  label: string;
  snapshot: Snapshot;
  key?: boolean;
}

export interface Snapshot {
  energy: number; // 储能 %
  supplies: number; // 三项物资最小值（天）
  crew: number; // 在任乘员平均健康
  safety: number; // 完好度
  dose: number; // 平均剂量
  science: number;
}

export interface CrewDelta { health?: number; morale?: number; trust?: number; dose?: number; status?: CrewStatus }

export interface Effect {
  day?: number;
  storage?: number;
  o2?: number;
  water?: number;
  food?: number;
  spares?: number;
  integrity?: number;
  science?: number;
  propellant?: number;
  dustTau?: number; // 设定值
  autonomy?: number; // 设定值
  crew?: Partial<Record<CrewId | 'all', CrewDelta>>;
  flags?: string[];
  clearFlags?: string[];
  archive?: string[];
  loadout?: string[]; // 追加
  site?: SiteId;
  presets?: string[]; // 覆盖
}
