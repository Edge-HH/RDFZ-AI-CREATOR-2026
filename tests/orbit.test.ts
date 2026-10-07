import { describe, expect, test } from 'vitest';
import {
  TRANSFER_DAYS, STAY_DAYS, ARRIVAL_DAY, DEPARTURE_DAY, RETURN_DAY,
  lightDelayMinutes, sunEarthMarsElongationDeg, isSolarConjunction, phaseOf,
} from '../src/core/orbit';

describe('霍曼转移几何', () => {
  test('地火霍曼转移约 259 天', () => {
    expect(TRANSFER_DAYS).toBeGreaterThan(255);
    expect(TRANSFER_DAYS).toBeLessThan(262);
  });
  test('合冲型任务火星停留约 454 天', () => {
    expect(STAY_DAYS).toBeGreaterThan(440);
    expect(STAY_DAYS).toBeLessThan(470);
  });
  test('时间轴首尾相接', () => {
    expect(ARRIVAL_DAY).toBe(TRANSFER_DAYS);
    expect(DEPARTURE_DAY).toBe(ARRIVAL_DAY + STAY_DAYS);
    expect(RETURN_DAY).toBe(DEPARTURE_DAY + TRANSFER_DAYS);
  });
});

describe('光速延迟', () => {
  test('发射当天几乎没有延迟', () => {
    expect(lightDelayMinutes(0)).toBeLessThan(0.1);
  });
  test('抵达火星时单程延迟约 13 分钟', () => {
    const d = lightDelayMinutes(ARRIVAL_DAY);
    expect(d).toBeGreaterThan(12);
    expect(d).toBeLessThan(14.5);
  });
  test('驻留期间最大延迟约 21 分钟（日凌附近）', () => {
    let max = 0;
    for (let day = ARRIVAL_DAY; day <= DEPARTURE_DAY; day++) max = Math.max(max, lightDelayMinutes(day));
    expect(max).toBeGreaterThan(20);
    expect(max).toBeLessThan(22);
  });
  test('巡航期间延迟单调增长', () => {
    expect(lightDelayMinutes(60)).toBeLessThan(lightDelayMinutes(150));
    expect(lightDelayMinutes(150)).toBeLessThan(lightDelayMinutes(ARRIVAL_DAY - 1));
  });
});

describe('日凌', () => {
  test('抵达后约 227 天发生日凌（日-地-火夹角接近 0）', () => {
    let minDay = ARRIVAL_DAY, minEl = 999;
    for (let day = ARRIVAL_DAY; day <= DEPARTURE_DAY; day++) {
      const el = sunEarthMarsElongationDeg(day);
      if (el < minEl) { minEl = el; minDay = day; }
    }
    expect(minEl).toBeLessThan(1);
    expect(minDay - ARRIVAL_DAY).toBeGreaterThan(215);
    expect(minDay - ARRIVAL_DAY).toBeLessThan(240);
    expect(isSolarConjunction(minDay)).toBe(true);
    expect(isSolarConjunction(ARRIVAL_DAY)).toBe(false);
  });
});

describe('任务阶段', () => {
  test('按任务日给出阶段', () => {
    expect(phaseOf(-1)).toBe('earth');
    expect(phaseOf(10)).toBe('cruise');
    expect(phaseOf(ARRIVAL_DAY + 1)).toBe('surface');
    expect(phaseOf(DEPARTURE_DAY + 1)).toBe('return');
  });
});

describe('日凌窗口', () => {
  test('窗口约两周，且全部落在驻留期内', async () => {
    const { CONJUNCTION_START, CONJUNCTION_END, ARRIVAL_DAY, DEPARTURE_DAY, isSolarConjunction } = await import('../src/core/orbit');
    expect(CONJUNCTION_END - CONJUNCTION_START).toBeGreaterThanOrEqual(10);
    expect(CONJUNCTION_END - CONJUNCTION_START).toBeLessThanOrEqual(20);
    expect(CONJUNCTION_START).toBeGreaterThan(ARRIVAL_DAY);
    expect(CONJUNCTION_END).toBeLessThan(DEPARTURE_DAY);
    expect(isSolarConjunction(CONJUNCTION_START)).toBe(true);
    expect(isSolarConjunction(CONJUNCTION_START - 1)).toBe(false);
    expect(isSolarConjunction(CONJUNCTION_END)).toBe(false);
  });
  test('地火距离延迟：发射前约 11–12 分钟', async () => {
    const { earthMarsDelayMinutes } = await import('../src/core/orbit');
    expect(earthMarsDelayMinutes(-40)).toBeGreaterThan(10);
    expect(earthMarsDelayMinutes(-40)).toBeLessThan(13);
  });
});
