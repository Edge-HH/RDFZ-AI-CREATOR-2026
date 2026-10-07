import { phaseOf } from './orbit';
import { rates } from './rates';
import { storageCap } from './state';
import type { MissionState } from './types';

// 剂量率（mSv/天）：好奇号 RAD 实测（Zeitlin 2013；Hassler 2014）
export const CRUISE_DOSE = 1.8;
export const SURFACE_DOSE = 0.64;

// 每人每天消耗的“储备天数”（已计入环控生保再生）：四人满员时为 1 份
const O2_USE = 0.5; // 电解再生补回约一半
const WATER_USE = 0.25; // 水回收约 98%，但有排放与损耗
const FOOD_USE = 1;

const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));

function stepDay(s: MissionState): void {
  const phase = phaseOf(s.day);
  if (phase === 'earth' || phase === 'home') return;
  const active = s.crew.filter((c) => c.status === 'ok' || c.status === 'injured');
  const crewFactor = active.length / 4;
  const ease = s.mode === 'story' ? 0.5 : 1;
  const r = rates(s);

  if (phase === 'cruise' || phase === 'return') {
    if (phase === 'cruise') {
      s.o2 = Math.max(0, s.o2 - O2_USE * crewFactor * ease);
      s.water = Math.max(0, s.water - WATER_USE * crewFactor * ease);
      s.food = Math.max(0, s.food - FOOD_USE * crewFactor * ease);
    }
    for (const c of active) {
      c.dose += CRUISE_DOSE * r.cruiseShield;
      c.morale = clamp(c.morale - 0.03 * ease);
    }
  } else {
    // 地表：能源平衡 → 生产效率
    const deficit = r.powerNeed - r.powerGen;
    const cap = storageCap(s);
    let powerRatio = 1;
    if (deficit > 0) {
      const need = deficit * 24;
      if (s.storage >= need) s.storage -= need;
      else {
        powerRatio = clamp((r.powerGen + s.storage / 24) / r.powerNeed, 0, 1);
        s.storage = 0;
      }
    } else {
      s.storage = Math.min(cap, s.storage - deficit * 24);
    }

    s.o2 = Math.max(0, s.o2 + r.o2Gen * powerRatio - O2_USE * crewFactor * ease);
    s.water = Math.max(0, s.water + r.waterGen * powerRatio - WATER_USE * crewFactor * ease);
    s.food = Math.max(0, s.food + r.foodGen * powerRatio - FOOD_USE * crewFactor * ease);

    // 萨巴蒂尔推进剂工厂：自带氢源保底生产，本地水冰充足时翻倍
    const hydro = s.water > 40 ? Math.min(1, r.waterGen / 0.6) : 0;
    s.propellant = clamp(s.propellant + (0.06 + 0.07 * hydro) * powerRatio, 0, 120);

    s.science += 0.15 * r.scienceMult * powerRatio * (active.length / 4);

    if (powerRatio < 0.6) {
      s.integrity = clamp(s.integrity - 0.15 * ease);
      for (const c of active) c.health = clamp(c.health - 0.1 * ease);
    }
    for (const c of active) {
      c.dose += SURFACE_DOSE * r.surfaceShield;
      c.morale = clamp(c.morale - 0.01 * ease + r.moralePer30 / 30);
    }
  }

  // 物资耗尽：健康快速恶化
  const starving = (s.o2 <= 0 ? 1 : 0) + (s.water <= 0 ? 1 : 0) + (s.food <= 0 ? 1 : 0);
  if (starving) {
    for (const c of active) {
      c.health = clamp(c.health - 1.5 * starving * ease);
      c.morale = clamp(c.morale - 1);
      if (c.health <= 0) c.status = 'lost';
    }
  }
}

export function passTime(state: MissionState, days: number): MissionState {
  const s = structuredClone(state);
  for (let i = 0; i < days; i++) {
    stepDay(s);
    s.day += 1;
  }
  return s;
}
