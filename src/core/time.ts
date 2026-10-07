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
  // 配给制：食物与水按七到八成供应，士气持续受损
  const ration = s.flags.includes('rationing');
  const foodUse = FOOD_USE * (ration ? 0.7 : 1);
  const waterUse = WATER_USE * (ration ? 0.8 : 1);
  if (ration) for (const c of active) c.morale = clamp(c.morale - 0.05);

  if (phase === 'cruise' || phase === 'return') {
    if (phase === 'cruise') {
      s.o2 = Math.max(0, s.o2 - O2_USE * crewFactor * ease);
      s.water = Math.max(0, s.water - waterUse * crewFactor * ease);
      s.food = Math.max(0, s.food - foodUse * crewFactor * ease);
    }
    for (const c of active) {
      c.dose += CRUISE_DOSE * r.cruiseShield;
      c.morale = clamp(c.morale - 0.03 * ease);
    }
  } else {
    // 地表：能源平衡 → 生产效率
    const deficit = r.powerNeed - r.powerGen;
    const cap = storageCap(s);
    s.storage = Math.min(s.storage, cap); // 超出电池容量的部分无法储存
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
    s.water = Math.max(0, s.water + r.waterGen * powerRatio - waterUse * crewFactor * ease);
    s.food = Math.max(0, s.food + r.foodGen * powerRatio - foodUse * crewFactor * ease);

    // 富余电力驱动更多实验与电解（最多 +30%）
    const surplus = 1 + Math.min(0.3, Math.max(0, r.powerGen - r.powerNeed) / 20);

    // 萨巴蒂尔推进剂工厂：自带氢源保底生产，本地水冰充足时更快
    const hydro = s.water > 40 ? Math.min(1, r.waterGen / 0.6) : 0;
    s.propellant = clamp(s.propellant + (0.08 + 0.06 * hydro) * powerRatio * surplus, 0, 120);

    s.science += 0.15 * r.scienceMult * powerRatio * surplus * (active.length / 4);

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

// 地表断粮危及生命、且推进剂足以起飞时，乘组按应急程序撤离
const EVAC_HEALTH = 35;
const EVAC_PROPELLANT = 70;

function mustEvacuate(s: MissionState): boolean {
  if (phaseOf(s.day) !== 'surface' || s.propellant < EVAC_PROPELLANT) return false;
  if (Math.min(s.o2, s.water, s.food) > 0) return false;
  return s.crew.some((c) => (c.status === 'ok' || c.status === 'injured') && c.health < EVAC_HEALTH);
}

export function passTime(state: MissionState, days: number): MissionState {
  const s = structuredClone(state);
  for (let i = 0; i < days; i++) {
    stepDay(s);
    s.day += 1;
    if (mustEvacuate(s)) {
      s.flags.push('aborted', 'emergency_evac');
      break;
    }
  }
  return s;
}
