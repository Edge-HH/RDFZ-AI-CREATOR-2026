import { lightDelayMinutes } from './orbit';
import { rates } from './rates';
import { random } from './state';
import type { MissionState } from './types';

export interface Risk {
  base: number; // 失败概率
  mod?: (s: MissionState) => number;
  useSafety?: boolean; // 是否计入安全类模块修正
}

export interface RiskWindow { low: number; high: number; p: number }

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// 信息滞后：延迟越久，你对现场的判断越模糊；预警阵列可以收窄区间
export function riskWindow(s: MissionState, risk: Risk): RiskWindow {
  const r = rates(s);
  const p = clamp(risk.base + (risk.mod?.(s) ?? 0) + (risk.useSafety ? r.safety : 0), 0.01, 0.95);
  const delayFactor = 0.4 + 0.6 * Math.min(1, lightDelayMinutes(s.day) / 13);
  const spread = 0.3 * 4 * p * (1 - p) * delayFactor * r.detect;
  return { p, low: clamp(p - spread / 2, 0.01, 0.95), high: clamp(p + spread / 2, 0.01, 0.95) };
}

export interface RiskResult { failed: boolean; p: number; window: RiskWindow; state: MissionState }

export function rollRisk(state: MissionState, risk: Risk): RiskResult {
  const window = riskWindow(state, risk);
  const [r1, s1] = random(state);
  const [r2, s2] = random(s1);
  const p = window.low + r1 * (window.high - window.low);
  return { failed: r2 < p, p, window, state: s2 };
}
