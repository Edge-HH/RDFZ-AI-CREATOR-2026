import { describe, expect, test } from 'vitest';
import { createState } from '../src/core/state';
import { applyEffect } from '../src/core/effects';
import { resolveBlackout, improviseChance, type Fault } from '../src/core/blackout';

const fault: Fault = {
  id: 'f', name: '测试故障', p: 1, coveredBy: ['card'],
  good: { science: 5 }, bad: { integrity: -30 },
  goodLine: { speaker: 'lin', text: '按预案处理' },
  badLine: { speaker: 'sys', text: '处置失败' },
  improviseLine: { speaker: 'amara', text: '我们自己想办法' },
};

describe('通信盲区自动结算', () => {
  test('预案卡覆盖的故障按预案处理', () => {
    const s = applyEffect(createState(3), { presets: ['card'] });
    const r = resolveBlackout(s, [fault]);
    expect(r.state.science).toBe(5);
    expect(r.state.integrity).toBe(100);
    expect(r.lines.map((l) => l.text)).toContain('按预案处理');
  });

  test('未发生的故障不产生影响', () => {
    const s = createState(3);
    const r = resolveBlackout(s, [{ ...fault, p: 0 }]);
    expect(r.state.integrity).toBe(100);
    expect(r.lines.some((l) => l.text === '处置失败')).toBe(false);
  });

  test('高授权、高信任的乘组即兴处置成功率更高', () => {
    const low = applyEffect(createState(3), { autonomy: 0, crew: { all: { trust: -40 } } });
    const high = applyEffect(createState(3), { autonomy: 3, crew: { all: { trust: 40 } } });
    expect(improviseChance(high)).toBeGreaterThan(improviseChance(low) + 0.4);
    let okHigh = 0, okLow = 0;
    for (let seed = 0; seed < 400; seed++) {
      if (resolveBlackout({ ...high, rng: seed * 7919 }, [fault]).state.integrity === 100) okHigh++;
      if (resolveBlackout({ ...low, rng: seed * 7919 }, [fault]).state.integrity === 100) okLow++;
    }
    expect(okHigh).toBeGreaterThan(okLow + 100);
  });

  test('概率可以是状态的函数', () => {
    const s = createState(3);
    const r = resolveBlackout(s, [{ ...fault, p: (st) => (st.flags.includes('never') ? 1 : 0) }]);
    expect(r.state.integrity).toBe(100);
  });
});
