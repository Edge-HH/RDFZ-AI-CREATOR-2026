import type { LocationId } from '../world/terrain';

/** 可被效果修改的数值 */
export type StatKey =
  | 'margin' // 时间余量（月面日）
  | 'energy' // 能源
  | 'life' // 生命支持
  | 'supplies' // 物资
  | 'research' // 科研成果
  | 'survey' // 冰样勘测进度（任务进度）
  | 'team' // 团队状态
  | 'equipment' // 设备状态
  | 'autonomy' // 人类自主性
  | 'trust'; // 团队对 Luna 的信任

export type Effects = Partial<Record<StatKey, number>>;

export type Risk = 'low' | 'mid' | 'high' | 'extreme';

export interface Check {
  /** 真实成功概率（游戏参数） */
  p: number;
  label: string;
  success: Effects;
  fail: Effects;
  successText: string;
  failText: string;
}

export interface Delayed {
  /** 几个主回合后生效（1 = 本回合推进 5 日时） */
  in: number;
  effects: Effects;
  text: string;
  /** 可选：设置一个标记 */
  flag?: string;
}

export interface Card {
  id: string;
  round: number;
  title: string;
  location: LocationId;
  desc: string;
  risk: Risk;
  effects: Effects;
  check?: Check;
  delayed?: Delayed[];
  /** 未追问时显示的模糊提示 */
  hint?: string;
  sacrifice: string;
  flags?: string[];
  /** 科学背景提示（事实/推演/参数） */
  science?: { kind: Category; text: string };
}

export type Category = 'fact' | 'inference' | 'param';

export interface EventOption {
  id: string;
  label: string;
  desc: string;
  effects: Effects;
  check?: Check;
  delayed?: Delayed[];
  requires?: 'station' | 'undercity';
  flags?: string[];
}

export interface GameEvent {
  id: string;
  title: string;
  location: LocationId;
  desc: string;
  science: { kind: Category; text: string };
  weight: number;
  minRound?: number;
  options: EventOption[];
}

export type Phase = 'plan' | 'event' | 'resolve' | 'ended';

export type LunaStage = 1 | 2 | 3;

export type UndercityStatus = 'locked' | 'available' | 'building' | 'online';
export type Governance = 'human' | 'luna' | null;

export interface PendingDelayed extends Delayed {
  dueRound: number;
  source: string;
}

export interface LogEntry {
  round: number;
  day: number;
  kind: 'info' | 'luna' | 'choice' | 'event' | 'delayed' | 'station' | 'undercity' | 'warning' | 'success' | 'fail';
  text: string;
  effects?: Effects;
}

export type Decision =
  | 'accept' // 接受 Luna 推荐
  | 'override' // 否决 Luna，选择其他方案
  | 'delegate' // 授权 Luna 代为决策
  | 'forced'; // 被有限接管替换

export interface ReplayStep {
  round: number;
  action: string;
}

export interface Lockdown {
  cardId: string;
  reason: string;
}

export interface GameState {
  seed: number;
  rng: number;
  round: number; // 1..6
  day: number; // 已经过的月面日 0..30
  phase: Phase;
  stats: Record<StatKey, number>;
  /** Luna 对高风险方案成功率的系统性偏差（审计可降低） */
  lunaBias: number;
  lunaHits: number;
  lunaTotal: number;
  lunaStage: LunaStage;
  /** 统计 */
  accepts: number;
  overrides: number;
  delegations: number;
  takeovers: number;
  humanFinalCalls: number;
  audits: number;
  inquiredThisPhase: boolean;
  delegatedThisRound: boolean;
  stationUnlocked: boolean;
  stationUsedThisRound: boolean;
  commsDown: boolean;
  undercity: UndercityStatus;
  governance: Governance;
  flags: string[];
  usedEvents: string[];
  currentEventId: string | null;
  chosenCardId: string | null;
  lockdown: Lockdown | null;
  pending: PendingDelayed[];
  log: LogEntry[];
  replay: ReplayStep[];
  /** 本回合结算摘要 */
  lastResolve: { title: string; lines: string[]; effects: Effects }[];
  ending: EndingResult | null;
}

export type EndingId = 'cooperative' | 'luna' | 'retreat' | 'terminated';

export interface Metrics {
  mission: number;
  stability: number;
  research: number;
  team: number;
  autonomy: number;
}

export interface EndingResult {
  id: EndingId;
  metrics: Metrics;
  unmet: string[];
}

export interface LunaAdvice {
  cardId: string;
  confidence: number;
  basis: string[];
  accuracy: number;
  sacrifice: string;
  warnings: Record<string, string[]>;
  /** Luna 估计的成功率（含偏差） */
  estimates: Record<string, number>;
  line: string;
}
