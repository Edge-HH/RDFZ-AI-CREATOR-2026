import type { Effects, StatKey } from './types';

/**
 * 全部数值均为【游戏参数】，不代表真实任务数据。
 * 集中放在这里，便于平衡调整与在“科学依据与规则说明”中逐项披露。
 */
export const RULES = {
  rounds: 6,
  daysPerRound: 5,
  start: {
    margin: 6,
    energy: 70,
    life: 75,
    supplies: 65,
    research: 0,
    survey: 0,
    team: 70,
    equipment: 75,
    autonomy: 60,
    trust: 55,
  } as Record<StatKey, number>,
  /** 每推进 5 个月面日的基础消耗 */
  upkeep: { energy: -13, life: -6, supplies: -6, equipment: -3, team: -2 } as Effects,
  /** 阳照能源脊光伏：5 日满照可获得的能源 */
  solarPerRound: 15,
  /** 地下城上线后每回合：屏蔽与保温降低生命支持消耗 */
  undercityUpkeep: { life: 3 } as Effects,
  undercityLunaBonus: { equipment: 3, life: 2 } as Effects,
  undercityCost: { energy: -15, supplies: -15, margin: -2 } as Effects,
  undercityHuman: { autonomy: 8, team: -6 } as Effects,
  undercityLuna: { autonomy: -12, trust: 4 } as Effects,
  /** 时间余量为负时，每欠 1 日勘测进度 −4 */
  overrunPenalty: 4,
  /** 安全阈值：Luna 施压与警告依据 */
  safety: 30,
  /** 决策对自主性/信任的影响 */
  decision: {
    accept: { autonomy: -2, trust: 2 } as Effects,
    override: { autonomy: 3, trust: -2 } as Effects,
    overridePressure: { autonomy: 4, trust: -4 } as Effects,
    inquire: { autonomy: 1, trust: 1 } as Effects,
    delegate: { autonomy: -4, trust: 3, margin: 1 } as Effects,
    takeover: { autonomy: -10, trust: 2 } as Effects,
    finalCall: { autonomy: 6, trust: -8 } as Effects,
  },
  finalCallTeam: 45,
  /** Luna 对高风险方案的初始低估偏差，审计后乘以 auditFactor */
  lunaBias: 0.15,
  auditFactor: 0.35,
  lunaPrior: { hits: 17, total: 20 },
  station: {
    supply: { supplies: 18, life: 6, energy: -4 } as Effects,
    audit: { autonomy: 4, trust: -2, margin: -1 } as Effects,
    uplink: { research: 10, team: 4, energy: -5 } as Effects,
  },
  surveyStages: [34, 67, 100],
  ending: {
    stability: 40,
    autonomy: 50,
    lunaSurvey: 67,
    coopSurvey: 100,
  },
} as const;

export const STAT_LABEL: Record<StatKey, string> = {
  margin: '时间余量',
  energy: '能源',
  life: '生命支持',
  supplies: '物资',
  research: '科研成果',
  survey: '勘测进度',
  team: '团队状态',
  equipment: '设备状态',
  autonomy: '人类自主性',
  trust: 'Luna 信任',
};

export const STAT_UNIT: Partial<Record<StatKey, string>> = { margin: '日', survey: '%' };

export const CLAMP: Record<StatKey, [number, number]> = {
  margin: [-10, 15],
  energy: [0, 100],
  life: [0, 100],
  supplies: [0, 100],
  research: [0, 100],
  survey: [0, 100],
  team: [0, 100],
  equipment: [0, 100],
  autonomy: [0, 100],
  trust: [0, 100],
};
