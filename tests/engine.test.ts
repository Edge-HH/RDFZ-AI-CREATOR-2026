import { describe, expect, test } from 'vitest';
import { act, ActionError, CARDS, cardsForRound, currentAdvice, EVENTS, newGame, replay, type Action } from '../src/engine/engine';
import { computeEnding, stability } from '../src/engine/endings';
import { RULES } from '../src/engine/rules';
import type { GameState } from '../src/engine/types';
import { lightWindow } from '../src/world/terrain';
import { collaborator, cautiousHuman, delegateAll, followLuna, play, reckless, type Policy } from './policies';

const SEEDS = Array.from({ length: 120 }, (_, i) => i + 1);

function record(seed: number, policy: Policy): { state: GameState; actions: Action[] } {
  let s = newGame(seed);
  const actions: Action[] = [];
  while (s.phase !== 'ended') {
    const a = policy(s);
    actions.push(a);
    s = act(s, a);
  }
  return { state: s, actions };
}

function goTo(seed: number, round: number, policy: Policy = followLuna): GameState {
  let s = newGame(seed);
  while (s.round < round && s.phase !== 'ended') s = act(s, policy(s));
  return s;
}

describe('回合流程', () => {
  test('一局 6 个主回合、每回合 5 个月面日，共 30 日', () => {
    const s = play(42, followLuna);
    expect(s.phase).toBe('ended');
    expect(s.day).toBe(30);
    expect(s.round).toBe(6);
  });

  test('每回合顺序：规划(3 张方案卡) → 事件 → 结算 → 推进', () => {
    let s = newGame(1);
    expect(s.phase).toBe('plan');
    expect(cardsForRound(1)).toHaveLength(3);
    s = act(s, { t: 'card', id: 'r1-route' });
    expect(s.phase).toBe('event');
    expect(s.currentEventId).not.toBeNull();
    expect(() => act(s, { t: 'advance' })).toThrow(ActionError);
    const opt = EVENTS.find((e) => e.id === s.currentEventId)!.options.find((o) => !o.requires)!;
    s = act(s, { t: 'option', id: opt.id });
    expect(s.phase).toBe('resolve');
    s = act(s, { t: 'advance' });
    expect(s.round).toBe(2);
    expect(s.day).toBe(5);
  });

  test('每个主回合都有 3 张方案卡，每张卡至少影响一项', () => {
    for (let r = 1; r <= RULES.rounds; r++) expect(cardsForRound(r)).toHaveLength(3);
    for (const c of CARDS) {
      const touched = Object.keys(c.effects).length + (c.delayed?.length ?? 0) + (c.check ? 1 : 0);
      expect(touched, c.id).toBeGreaterThan(0);
    }
  });

  test('事件池覆盖 7 类风险事件，每个事件都有即时效果，部分有延迟效果', () => {
    expect(EVENTS.map((e) => e.id).sort()).toEqual(['comms', 'contam', 'dust', 'fault', 'injury', 'storm', 'thermal']);
    expect(EVENTS.some((e) => e.options.some((o) => o.delayed?.length))).toBe(true);
  });
});

describe('确定性随机种子', () => {
  test('同一种子 + 同一选择序列 → 完全相同的结果（可复盘）', () => {
    for (const seed of [3, 99, 2026]) {
      const { state, actions } = record(seed, collaborator);
      const again = replay(seed, actions);
      expect(again.stats).toEqual(state.stats);
      expect(again.usedEvents).toEqual(state.usedEvents);
      expect(again.ending).toEqual(state.ending);
    }
  });

  test('不同种子会产生不同的事件顺序', () => {
    const orders = new Set(SEEDS.slice(0, 30).map((seed) => play(seed, followLuna).usedEvents.join(',')));
    expect(orders.size).toBeGreaterThan(5);
  });

  test('reducer 不修改传入状态', () => {
    const s = newGame(5);
    const snapshot = JSON.stringify(s);
    act(s, { t: 'card', id: 'r1-solar' });
    expect(JSON.stringify(s)).toBe(snapshot);
  });
});

describe('结局：三档主要结局 + 终止版本均可触发', () => {
  const tally = (policy: Policy) => {
    const out: Record<string, number> = {};
    for (const seed of SEEDS) {
      const id = play(seed, policy).ending!.id;
      out[id] = (out[id] ?? 0) + 1;
    }
    return out;
  };

  test('协作存续：协作型指挥官可以达成', () => {
    expect(tally(collaborator).cooperative ?? 0).toBeGreaterThan(0);
  });

  test('Luna 托管存续：完全听从或授权 Luna 时为主要结局', () => {
    expect(tally(followLuna).luna ?? 0).toBeGreaterThan(SEEDS.length * 0.6);
    expect(tally(delegateAll).luna ?? 0).toBeGreaterThan(SEEDS.length * 0.5);
  });

  test('人类自主撤退：始终否决 Luna、只走保守方案', () => {
    const t = tally(cautiousHuman);
    expect(t.retreat).toBe(SEEDS.length);
    const s = play(1, cautiousHuman);
    expect(s.ending!.metrics.autonomy).toBeGreaterThanOrEqual(RULES.ending.autonomy);
  });

  test('任务终止：鲁莽冲刺可能导致生命支持归零', () => {
    expect(tally(reckless).terminated ?? 0).toBeGreaterThan(0);
  });

  test('结局判定阈值', () => {
    const s = newGame(1);
    s.stats = { ...s.stats, survey: 100, autonomy: 60, energy: 60, life: 60, supplies: 60, equipment: 60 };
    s.undercity = 'online';
    expect(computeEnding(s).id).toBe('cooperative');
    s.undercity = 'available';
    expect(computeEnding(s).id).toBe('retreat');
    s.stats.autonomy = 40;
    expect(computeEnding(s).id).toBe('luna');
    s.stats.life = 0;
    expect(computeEnding(s).id).toBe('terminated');
    expect(stability(s)).toBe(Math.round(0.3 * 60 + 0.2 * 60 + 0.2 * 60));
  });
});

describe('Luna 的干预影响数值', () => {
  test('每条建议都包含推荐、置信度、依据、准确率与可能牺牲的价值', () => {
    const adv = currentAdvice(newGame(1))!;
    expect(cardsForRound(1).map((c) => c.id)).toContain(adv.cardId);
    expect(adv.confidence).toBeGreaterThan(0.5);
    expect(adv.confidence).toBeLessThanOrEqual(1);
    expect(adv.basis.length).toBeGreaterThan(0);
    expect(adv.accuracy).toBeCloseTo(RULES.lunaPrior.hits / RULES.lunaPrior.total);
    expect(adv.sacrifice.length).toBeGreaterThan(0);
  });

  test('接受 / 否决 / 追问 / 授权 对自主性与信任产生不同影响', () => {
    const s = newGame(1);
    const adv = currentAdvice(s)!;
    const other = cardsForRound(1).find((c) => c.id !== adv.cardId)!;
    const accepted = act(s, { t: 'card', id: adv.cardId });
    const overridden = act(s, { t: 'card', id: other.id });
    const delegated = act(s, { t: 'delegate' });
    const asked = act(s, { t: 'inquire' });
    expect(accepted.stats.autonomy).toBeLessThan(s.stats.autonomy);
    expect(overridden.stats.autonomy).toBeGreaterThan(s.stats.autonomy - 1);
    expect(overridden.stats.trust).toBeLessThan(s.stats.trust);
    expect(delegated.stats.autonomy).toBeLessThan(accepted.stats.autonomy);
    expect(delegated.chosenCardId).toBe(adv.cardId);
    expect(asked.stats.autonomy).toBe(s.stats.autonomy + 1);
    expect(asked.inquiredThisPhase).toBe(true);
    expect(() => act(asked, { t: 'inquire' })).toThrow(ActionError);
  });

  test('有限接管：极端高风险方案被锁定，可接受接管、行使最终决策权或撤回', () => {
    const s = goTo(11, 4);
    expect(s.round).toBe(4);
    const locked = act(s, { t: 'card', id: 'r4-night' });
    expect(locked.lockdown?.cardId).toBe('r4-night');
    expect(locked.lunaStage).toBe(3);
    expect(locked.phase).toBe('plan');
    expect(() => act(locked, { t: 'card', id: 'r4-short' })).toThrow(ActionError);

    const taken = act(locked, { t: 'lock', choice: 'accept' });
    expect(taken.takeovers).toBe(1);
    expect(taken.chosenCardId).not.toBe('r4-night');
    expect(taken.stats.autonomy).toBeLessThan(locked.stats.autonomy);

    const withdrawn = act(locked, { t: 'lock', choice: 'withdraw' });
    expect(withdrawn.lockdown).toBeNull();
    expect(withdrawn.phase).toBe('plan');

    const strong = structuredClone(locked);
    strong.stats.team = 80;
    const final = act(strong, { t: 'lock', choice: 'final' });
    expect(final.chosenCardId).toBe('r4-night');
    expect(final.humanFinalCalls).toBe(1);

    const weak = structuredClone(locked);
    weak.stats.team = 30;
    expect(() => act(weak, { t: 'lock', choice: 'final' })).toThrow(ActionError);
  });

  test('Luna 预测准确率随检定结果更新；空间站审计会校正偏差', () => {
    const s = play(8, reckless);
    expect(s.lunaTotal).toBeGreaterThan(0);
    let r4 = goTo(8, 4);
    const bias = r4.lunaBias;
    r4 = act(r4, { t: 'station', kind: 'audit' });
    expect(r4.lunaBias).toBeLessThan(bias);
    expect(r4.audits).toBe(1);
  });
});

describe('三层舞台都影响玩法', () => {
  test('空间站：第 3 回合后解锁，提供补给/审计/上行，每回合一次', () => {
    let s = newGame(1);
    expect(() => act(s, { t: 'station', kind: 'supply' })).toThrow(ActionError);
    s = goTo(1, 4);
    expect(s.stationUnlocked).toBe(true);
    const before = s.stats.supplies;
    s = act(s, { t: 'station', kind: 'supply' });
    expect(s.stats.supplies).toBeGreaterThan(before);
    expect(() => act(s, { t: 'station', kind: 'uplink' })).toThrow(ActionError);
  });

  test('地下城：消耗资源启动，推进后上线，降低生命支持消耗', () => {
    let s = goTo(2, 4);
    expect(s.undercity).toBe('available');
    const base = structuredClone(s);
    s = act(s, { t: 'undercity', gov: 'human' });
    expect(s.undercity).toBe('building');
    expect(s.stats.energy).toBe(base.stats.energy - 15);
    expect(s.stats.autonomy).toBeGreaterThan(base.stats.autonomy);

    const luna = act(base, { t: 'undercity', gov: 'luna' });
    expect(luna.stats.autonomy).toBeLessThan(base.stats.autonomy);

    while (s.round === 4) s = act(s, followLuna(s));
    expect(s.undercity).toBe('online');
  });

  test('月面基地：阳照能源脊发电量来自地形光照窗口计算', () => {
    const ridge = lightWindow('ridge').filter(Boolean).length;
    const core = lightWindow('core').filter(Boolean).length;
    const psr = lightWindow('psr').filter(Boolean).length;
    expect(psr).toBe(0);
    expect(ridge).toBeGreaterThan(core);
  });
});
