import { describe, expect, test } from 'vitest';
import { createState, applyLoadout, loadoutSlots } from '../src/core/state';
import { applyEffect } from '../src/core/effects';
import { rates } from '../src/core/rates';
import { passTime } from '../src/core/time';
import { riskWindow, rollRisk } from '../src/core/risk';
import { ARRIVAL_DAY } from '../src/core/orbit';
import type { MissionState } from '../src/core/types';

const onSurface = (s: MissionState, site: MissionState['site'] = 'utopia'): MissionState =>
  ({ ...s, day: ARRIVAL_DAY + 5, site });

describe('初始状态与配载', () => {
  test('初始状态：四名乘员健康、发射前', () => {
    const s = createState(1);
    expect(s.crew).toHaveLength(4);
    expect(s.crew.every((c) => c.health === 100 && c.status === 'ok')).toBe(true);
    expect(s.day).toBeLessThan(0);
    expect(s.propellant).toBeGreaterThan(0);
  });
  test('配载超过 12 槽位被拒绝', () => {
    expect(() => applyLoadout(createState(1), ['fission', 'solar', 'rover', 'ice_drill', 'lab', 'med', 'sensors', 'spares', 'drone'])).toThrow();
  });
  test('配载写入状态，并把储备类模块加到物资上', () => {
    const base = createState(1);
    const s = applyLoadout(base, ['fission', 'o2_tank', 'spares']);
    expect(s.loadout).toEqual(['fission', 'o2_tank', 'spares']);
    expect(s.o2).toBe(base.o2 + 150);
    expect(s.spares).toBe(base.spares + 3);
    expect(loadoutSlots(s.loadout)).toBe(4);
  });
});

describe('效果应用', () => {
  test('数值被钳制在 0-100', () => {
    const s = applyEffect(createState(1), { integrity: 50, crew: { all: { morale: 80 } } });
    expect(s.integrity).toBe(100);
    expect(s.crew[0].morale).toBe(100);
  });
  test('健康归零的乘员状态变为 lost', () => {
    const s = applyEffect(createState(1), { crew: { rin: { health: -150 } } });
    expect(s.crew.find((c) => c.id === 'rin')!.status).toBe('lost');
  });
  test('all 不作用于已失去的乘员', () => {
    let s = applyEffect(createState(1), { crew: { rin: { health: -150 } } });
    s = applyEffect(s, { crew: { all: { health: 50 } } });
    expect(s.crew.find((c) => c.id === 'rin')!.health).toBe(0);
  });
  test('flags 去重，clearFlags 移除', () => {
    let s = applyEffect(createState(1), { flags: ['a', 'a', 'b'] });
    expect(s.flags).toEqual(['a', 'b']);
    s = applyEffect(s, { clearFlags: ['a'] });
    expect(s.flags).toEqual(['b']);
  });
  test('叙事模式下负面效果减半', () => {
    const s = applyEffect(createState(1, 'story'), { integrity: -40, crew: { lin: { health: -40 } } });
    expect(s.integrity).toBe(80);
    expect(s.crew[0].health).toBe(80);
  });
  test('不修改原状态', () => {
    const s = createState(1);
    applyEffect(s, { o2: -100 });
    expect(s.o2).toBe(createState(1).o2);
  });
});

describe('产出速率', () => {
  test('裂变电源不受沙尘影响，太阳能在全球沙尘暴下跌到一成以下', () => {
    const clear = applyLoadout(onSurface(createState(1)), ['fission', 'solar']);
    const storm = { ...clear, dustTau: 10 };
    const r0 = rates(clear), r1 = rates(storm);
    expect(r1.powerGen).toBeGreaterThanOrEqual(10);
    const solarClear = r0.powerGen - 10, solarStorm = r1.powerGen - 10;
    expect(solarStorm).toBeLessThan(solarClear * 0.1);
  });
  test('高纬度着陆点太阳能更弱', () => {
    const u = applyLoadout(onSurface(createState(1), 'utopia'), ['solar']);
    const a = applyLoadout(onSurface(createState(1), 'arcadia'), ['solar']);
    expect(rates(a).powerGen).toBeLessThan(rates(u).powerGen);
  });
  test('模块用电计入需求', () => {
    const s0 = onSurface(createState(1));
    const s1 = applyLoadout(s0, ['moxie', 'ice_drill']);
    expect(rates(s1).powerNeed - rates(s0).powerNeed).toBe(7);
  });
});

describe('时间推进', () => {
  test('巡航 100 天：剂量约 180 mSv，水墙降到约 126 mSv', () => {
    const s = { ...createState(1), day: 0 };
    const a = passTime(s, 100);
    const b = passTime(applyLoadout(s, ['water_wall']), 100);
    expect(a.day).toBe(100);
    expect(a.crew[0].dose).toBeCloseTo(180, 0);
    expect(b.crew[0].dose).toBeCloseTo(126, 0);
    expect(a.o2).toBeLessThan(s.o2);
  });
  test('地表电力不足时储能下降', () => {
    const s = applyLoadout(onSurface(createState(1)), ['moxie', 'ice_drill', 'greenhouse']);
    const after = passTime(s, 3);
    expect(after.storage).toBeLessThan(s.storage);
  });
  test('电力充足时 MOXIE 产氧，推进剂工厂持续生产', () => {
    const s = applyLoadout(onSurface(createState(1)), ['fission', 'solar', 'moxie']);
    const a = passTime(s, 30);
    const noMoxie = passTime(applyLoadout(onSurface(createState(1)), ['fission', 'solar']), 30);
    expect(a.o2).toBeGreaterThan(noMoxie.o2);
    expect(a.propellant).toBeGreaterThan(s.propellant);
  });
  test('物资耗尽后乘员健康下降', () => {
    const s = { ...onSurface(createState(1)), food: 0 };
    const a = passTime(s, 10);
    expect(a.crew[0].health).toBeLessThan(100);
  });
  test('叙事模式消耗减半', () => {
    const std = passTime({ ...createState(1), day: 0 }, 100);
    const story = passTime({ ...createState(1, 'story'), day: 0 }, 100);
    expect(createState(1).food - story.food).toBeCloseTo((createState(1).food - std.food) / 2, 5);
  });
});

describe('风险判定', () => {
  const risk = { base: 0.3 };
  test('风险区间包含基础概率；预警阵列让区间变窄', () => {
    const s = { ...createState(1), day: 200 };
    const w0 = riskWindow(s, risk);
    const w1 = riskWindow(applyLoadout(s, ['sensors']), risk);
    expect(w0.low).toBeLessThanOrEqual(0.3);
    expect(w0.high).toBeGreaterThanOrEqual(0.3);
    expect(w1.high - w1.low).toBeLessThan(w0.high - w0.low);
  });
  test('同一种子判定结果可复现，且推进随机数状态', () => {
    const s = createState(99);
    const a = rollRisk(s, risk), b = rollRisk(s, risk);
    expect(a.failed).toBe(b.failed);
    expect(a.state.rng).not.toBe(s.rng);
  });
  test('长期失败频率接近基础概率', () => {
    let s = { ...createState(5), day: 0 };
    let fails = 0;
    for (let i = 0; i < 4000; i++) { const r = rollRisk(s, risk); s = r.state; if (r.failed) fails++; }
    expect(fails / 4000).toBeGreaterThan(0.26);
    expect(fails / 4000).toBeLessThan(0.34);
  });
  test('修正项改变概率，并被钳制在 [0.01, 0.95]', () => {
    const s = createState(1);
    expect(riskWindow(s, { base: 0.3, mod: () => -1 }).high).toBeLessThanOrEqual(0.05);
    expect(riskWindow(s, { base: 0.3, mod: () => 1 }).low).toBeGreaterThanOrEqual(0.9);
  });
});
