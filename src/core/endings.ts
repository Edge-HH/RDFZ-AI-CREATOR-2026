import { phaseOf } from './orbit';
import type { MissionState } from './types';

export type EndingId = 'triumph' | 'safe' | 'stayed' | 'cost' | 'abort' | 'silent' | 'letgo';

// 科研阈值（由 scripts/simulate.ts 校准）
export const SCI_HIGH = 200;
export const SCI_GOOD = 140;
export const DOSE_LIMIT = 1000; // mSv，参照 ESA 职业上限 1 Sv

const lost = (s: MissionState) => s.crew.filter((c) => c.status === 'lost').length;
const stayed = (s: MissionState) => s.crew.filter((c) => c.status === 'stayed').length;

export const avgTrust = (s: MissionState) => {
  const alive = s.crew.filter((c) => c.status !== 'lost');
  return alive.length ? alive.reduce((a, c) => a + c.trust, 0) / alive.length : 0;
};

export const avgAutonomy = (s: MissionState) =>
  s.autonomyLog.length ? s.autonomyLog.reduce((a, b) => a + b, 0) / s.autonomyLog.length : s.autonomy;

export function determineEnding(s: MissionState): EndingId {
  if (lost(s) === s.crew.length || s.flags.includes('silent')) return 'silent';
  if (s.flags.includes('aborted')) return 'abort';
  if (lost(s) > 0) return 'cost';
  if (stayed(s) > 0) return 'stayed';
  if (s.flags.includes('qin_resolved') && avgTrust(s) >= 75 && avgAutonomy(s) >= 2 && s.science >= SCI_GOOD) return 'letgo';
  if (s.science >= SCI_HIGH) return 'triumph';
  return 'safe';
}

// 每个节拍结束后检查：是否必须立即结束任务
export function terminalEnding(s: MissionState): EndingId | null {
  if (lost(s) === s.crew.length) return 'silent';
  if (s.flags.includes('aborted') || s.flags.includes('silent')) return determineEnding(s);
  // 物资耗尽不立即终止，而是持续伤害健康（见 time.ts）；舱体完好度归零才是灾难
  if (s.integrity <= 0) {
    // 推进剂足以紧急上升则撤离，否则寂静
    if (phaseOf(s.day) === 'surface' && s.propellant >= 70) return 'abort';
    return 'silent';
  }
  return null;
}

export type Grade = 'S' | 'A' | 'B' | 'C' | 'D';

export interface Rating {
  grade: Grade;
  score: number;
  parts: { label: string; value: number; max: number }[];
}

const CAP: Partial<Record<EndingId, number>> = { silent: 0, abort: 54, cost: 69 };

export function rateMission(s: MissionState, ending: EndingId): Rating {
  const all = s.crew;
  const health = all.reduce((a, c) => a + (c.status === 'lost' ? 0 : c.health), 0) / all.length;
  const avgDose = all.reduce((a, c) => a + c.dose, 0) / all.length;
  const parts = [
    { label: '科研产出', value: Math.min(40, (s.science / (SCI_HIGH * 1.25)) * 40), max: 40 },
    { label: '乘员健康', value: (health / 100) * 30, max: 30 },
    { label: '辐射安全', value: Math.max(0, 15 - Math.max(0, avgDose - DOSE_LIMIT * 0.6) / (DOSE_LIMIT * 0.6) * 15), max: 15 },
    { label: '团队信任', value: (avgTrust(s) / 100) * 15, max: 15 },
  ].map((p) => ({ ...p, value: Math.round(p.value) }));
  let score = parts.reduce((a, p) => a + p.value, 0);
  const cap = CAP[ending];
  if (cap !== undefined) score = Math.min(score, cap);
  const grade: Grade = score >= 85 ? 'S' : score >= 70 ? 'A' : score >= 55 ? 'B' : score >= 40 ? 'C' : 'D';
  return { grade, score, parts };
}
