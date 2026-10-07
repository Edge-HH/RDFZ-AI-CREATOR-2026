// 章节内容的数据格式：叙事与决策全部数据驱动
import type { Risk } from './risk';
import type { Effect, MissionState } from './types';

export type Speaker = 'qin' | 'lin' | 'amara' | 'andrei' | 'rin' | 'zhou' | 'capcom' | 'sys' | 'you';

export interface Line {
  speaker: Speaker;
  text: string;
  voice?: string; // 配音文件名（public/voice/）
  when?: (s: MissionState) => boolean;
  tone?: 'alert' | 'calm' | 'warm' | 'cold';
}

export type Lines = Line[] | ((s: MissionState) => Line[]);
export type Dyn<T> = T | ((s: MissionState) => T);

export interface OptionRisk extends Risk {
  label: string; // 风险描述，例如“剂量超标”
  fail: Dyn<Effect>;
  ok?: Dyn<Effect>;
  failLines?: Lines;
  okLines?: Lines;
}

export interface Option {
  id: string;
  label: string;
  detail?: Dyn<string>; // 后果提示
  basis?: string; // ⓘ 科学依据
  requires?: (s: MissionState) => boolean;
  lockedReason?: string;
  effect?: Dyn<Effect>;
  risk?: OptionRisk;
  lines?: Lines;
  key?: boolean; // 关键转折
}

export type Decision =
  | { kind: 'choice'; prompt: string; options: Option[] }
  | { kind: 'loadout'; prompt?: string }
  | { kind: 'site'; prompt?: string }
  | { kind: 'presets'; prompt: string; pool: string[]; pick: number }
  | { kind: 'autonomy'; prompt: string }
  | { kind: 'command'; prompt: string };

export type SceneCue =
  | 'control' | 'orbit' | 'launch' | 'cruise' | 'spe' | 'edl' | 'landing'
  | 'surface' | 'storm' | 'conjunction' | 'ascent' | 'home';

export interface AutoResult { state: MissionState; lines: Line[] }

export interface Beat {
  id: string;
  title?: string;
  when?: (s: MissionState) => boolean;
  scene?: SceneCue;
  enter?: Dyn<Effect>;
  lines?: Lines;
  decision?: Decision;
  resolve?: (s: MissionState) => AutoResult; // 决策后的自动结算（如通信盲区）
  days?: Dyn<number>;
  archive?: string[];
  key?: boolean;
}

export interface Chapter {
  id: number;
  title: string;
  subtitle: string;
  teach: string; // 本章新教的机制
  scene?: SceneCue;
  beats: Beat[];
}

export const dyn = <T>(v: Dyn<T> | undefined, s: MissionState): T | undefined =>
  typeof v === 'function' ? (v as (s: MissionState) => T)(s) : v;

export const evalLines = (v: Lines | undefined, s: MissionState): Line[] =>
  (dyn(v, s) ?? []).filter((l) => !l.when || l.when(s));
