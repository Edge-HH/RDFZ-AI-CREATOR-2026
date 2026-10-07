import { moduleById } from '../content/modules';
import { siteById } from '../content/sites';
import type { MissionState } from './types';

// 预置设备：随上升器提前着陆的小型太阳能与推进剂工厂
export const BASE_SOLAR_KW = 5;
export const HABITAT_KW = 6;
export const PLANT_KW = 3;

export interface Rates {
  powerGen: number;
  powerNeed: number;
  o2Gen: number;
  waterGen: number;
  foodGen: number;
  cruiseShield: number;
  surfaceShield: number;
  scienceMult: number;
  detect: number;
  safety: number;
  moralePer30: number;
}

// 光学厚度 τ 对太阳能的衰减；τ≈0.5 为晴朗基线。τ=10.8 时约为 3%（参照机遇号 2018）
export const dustFactor = (tau: number) => Math.min(1, Math.exp(-0.33 * (tau - 0.5)));

export function rates(s: MissionState): Rates {
  const site = siteById(s.site);
  const solarFactor = (site?.solarFactor ?? 1) * dustFactor(s.dustTau);
  const r: Rates = {
    powerGen: BASE_SOLAR_KW * solarFactor,
    powerNeed: HABITAT_KW + PLANT_KW,
    o2Gen: 0, waterGen: 0, foodGen: 0,
    cruiseShield: 1, surfaceShield: 1,
    scienceMult: 1, detect: 1, safety: 0, moralePer30: 0,
  };
  for (const id of s.loadout) {
    const m = moduleById(id);
    if (!m) continue;
    r.powerGen += (m.powerKW ?? 0) + (m.solarKW ?? 0) * solarFactor;
    r.powerNeed += m.drawKW ?? 0;
    r.o2Gen += m.o2Gen ?? 0;
    r.waterGen += (m.waterGen ?? 0) * (site?.ice ?? 0);
    r.foodGen += m.foodGen ?? 0;
    r.cruiseShield *= m.cruiseShield ?? 1;
    r.surfaceShield *= m.surfaceShield ?? 1;
    r.scienceMult += m.scienceMult ?? 0;
    r.detect *= m.detect ?? 1;
    r.safety += m.safety ?? 0;
    r.moralePer30 += m.morale ?? 0;
  }
  if (s.flags.includes('load_shed')) r.powerNeed = Math.max(HABITAT_KW, r.powerNeed - 3);
  r.scienceMult *= site?.science ?? 1;
  if (s.flags.includes('load_shed')) r.scienceMult *= 0.5;
  return r;
}
