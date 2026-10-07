import { describe, expect, test } from 'vitest';
import { createState } from '../src/core/state';
import { applyEffect } from '../src/core/effects';
import { determineEnding, rateMission, SCI_HIGH, SCI_GOOD } from '../src/core/endings';
import type { MissionState } from '../src/core/types';

const base = (): MissionState => ({ ...createState(1), day: 1000 });

describe('结局判定（按优先级）', () => {
  test('全员失去 → 寂静红土', () => {
    const s = applyEffect(base(), { crew: { all: { health: -200 } } });
    expect(determineEnding(s)).toBe('silent');
  });
  test('主动或被迫中止 → 中止', () => {
    expect(determineEnding(applyEffect(base(), { flags: ['aborted'] }))).toBe('abort');
  });
  test('失去一人 → 代价（优先于留守与满载）', () => {
    const s = applyEffect(base(), { science: SCI_HIGH + 10, crew: { andrei: { health: -200 }, rin: { status: 'stayed' } } });
    expect(determineEnding(s)).toBe('cost');
  });
  test('有人留守 → 留守者', () => {
    expect(determineEnding(applyEffect(base(), { crew: { rin: { status: 'stayed' } } }))).toBe('stayed');
  });
  test('放手：解开导师线 + 高信任 + 高授权 + 科研达标', () => {
    let s = applyEffect(base(), { flags: ['qin_resolved'], science: SCI_GOOD, crew: { all: { trust: 40 } } });
    s = { ...s, autonomyLog: [2, 3, 2] };
    expect(determineEnding(s)).toBe('letgo');
  });
  test('放手条件缺一不可：授权不足则不是放手', () => {
    let s = applyEffect(base(), { flags: ['qin_resolved'], science: SCI_HIGH, crew: { all: { trust: 40 } } });
    s = { ...s, autonomyLog: [1, 1] };
    expect(determineEnding(s)).toBe('triumph');
  });
  test('科研高 → 满载而归；否则平安归来', () => {
    expect(determineEnding(applyEffect(base(), { science: SCI_HIGH }))).toBe('triumph');
    expect(determineEnding(base())).toBe('safe');
  });
});

describe('评级', () => {
  test('寂静红土只能是 D', () => {
    const s = applyEffect(base(), { crew: { all: { health: -200 } } });
    expect(rateMission(s, 'silent').grade).toBe('D');
  });
  test('完美状态的满载而归是 S', () => {
    const s = applyEffect(base(), { science: SCI_HIGH * 1.5, crew: { all: { trust: 40 } } });
    expect(rateMission(s, 'triumph').grade).toBe('S');
  });
  test('代价结局最高 B', () => {
    const s = applyEffect(base(), { science: SCI_HIGH * 2, crew: { andrei: { health: -200 }, all: { trust: 40 } } });
    expect(['B', 'C', 'D']).toContain(rateMission(s, 'cost').grade);
  });
  test('超出剂量上限扣分', () => {
    const ok = applyEffect(base(), { science: SCI_HIGH });
    const hot = applyEffect(ok, { crew: { all: { dose: 1400 } } });
    expect(rateMission(hot, 'triumph').score).toBeLessThan(rateMission(ok, 'triumph').score);
  });
});
