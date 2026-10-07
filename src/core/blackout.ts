// 通信盲区（EDL 七分钟、日凌两周）：地面无法干预，故障按预案卡或乘组即兴处置结算
import type { AutoResult, Line } from './content';
import { applyEffect } from './effects';
import { avgTrust } from './endings';
import { random } from './state';
import type { Effect, MissionState } from './types';

export interface Fault {
  id: string;
  name: string;
  p: number | ((s: MissionState) => number);
  coveredBy: string[];
  good: Effect;
  bad: Effect | ((s: MissionState) => Effect);
  goodLine: Line;
  badLine: Line;
  improviseLine: Line;
}

// 乘组自主处置成功率：授权越高、越信任地面（也越被信任）越果断
export function improviseChance(s: MissionState): number {
  return Math.min(0.92, 0.15 + 0.15 * s.autonomy + 0.35 * (avgTrust(s) / 100));
}

export function resolveBlackout(state: MissionState, faults: Fault[]): AutoResult {
  let s = state;
  const lines: Line[] = [];
  let occurred = 0;
  for (const f of faults) {
    const p = typeof f.p === 'function' ? f.p(s) : f.p;
    let r: number;
    [r, s] = random(s);
    if (r >= p) continue;
    occurred++;
    if (f.coveredBy.some((id) => s.presets.includes(id))) {
      s = applyEffect(s, f.good);
      lines.push({ speaker: 'sys', text: `【${f.name}】触发 → 预案执行`, tone: 'alert' }, f.goodLine);
      continue;
    }
    let roll: number;
    [roll, s] = random(s);
    lines.push({ speaker: 'sys', text: `【${f.name}】触发 → 无对应预案，乘组自主处置`, tone: 'alert' }, f.improviseLine);
    if (roll < improviseChance(s)) {
      s = applyEffect(s, f.good);
      lines.push({ speaker: 'sys', text: '自主处置成功。', tone: 'calm' });
    } else {
      s = applyEffect(s, typeof f.bad === 'function' ? f.bad(s) : f.bad);
      lines.push(f.badLine);
    }
  }
  if (occurred === 0) lines.push({ speaker: 'sys', text: '盲区内未记录到异常事件。', tone: 'calm' });
  return { state: s, lines };
}
