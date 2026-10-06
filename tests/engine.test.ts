import { describe, expect, test } from 'vitest';
import { act, ActionError, availableChoices, availableResponses, currentAdvice, currentNode, newGame, replay } from '../src/engine/engine';
import { computeEnding, metrics } from '../src/engine/endings';
import { RULES } from '../src/engine/rules';
import type { Action, GameState } from '../src/engine/types';
import { followLuna, humanFirst, play, riskyHuman } from './policies';

function record(seed: number, policy = followLuna): { state: GameState; actions: Action[] } {
  let state = newGame(seed);
  const actions: Action[] = [];
  for (let i = 0; i < 40 && state.phase !== 'ended'; i++) {
    const action = policy(state);
    actions.push(action);
    state = act(state, action);
  }
  return { state, actions };
}

describe('剧情节点流程', () => {
  test('首个节点是低风险调查，完成主行动后进入回应', () => {
    const state = newGame(2026);
    expect(state.phase).toBe('node');
    expect(currentNode(state).id).toBe('signal-arrival');
    const choice = availableChoices(state)[0];
    const afterMain = act(state, { t: 'main', choiceId: choice.id });
    expect(afterMain.phase).toBe('response');
    expect(afterMain.resources.life).toBe(state.resources.life);
    expect(afterMain.evidence).toContain('orbit');
    expect(availableResponses(afterMain).length).toBeGreaterThan(0);
  });

  test('每局节点数在 4–6 之间，关键证据必达', () => {
    for (let seed = 1; seed <= 80; seed++) {
      const state = play(seed, followLuna);
      expect(state.phase, `seed ${seed}`).toBe('ended');
      expect(state.nodeCount, `seed ${seed}`).toBeGreaterThanOrEqual(RULES.minNodes);
      expect(state.nodeCount, `seed ${seed}`).toBeLessThanOrEqual(RULES.maxNodes);
      expect(state.evidence).toEqual(expect.arrayContaining(['orbit', 'sample', 'archive']));
    }
  });

  test('前两个节点不会强制触发危机', () => {
    let state = newGame(12);
    while (state.nodeCount < 2) state = act(state, state.phase === 'node' ? { t: 'main', choiceId: availableChoices(state)[0].id } : state.phase === 'response' ? { t: 'response', choiceId: availableResponses(state)[0].id } : { t: 'continue' });
    expect(state.crisisCount).toBe(0);
  });

  test('平静节点和危机节点都存在，灾难不是每个节点必发', () => {
    const state = play(44, humanFirst);
    expect(state.usedNodeIds).toContain('signal-arrival');
    expect(state.crisisCount).toBeLessThan(state.nodeCount);
  });
});

describe('随机性与复盘', () => {
  test('目标节点数和支线节点会随种子变化', () => {
    const runs = Array.from({ length: 30 }, (_, i) => play(i + 1, followLuna));
    expect(new Set(runs.map((state) => state.nodeCount)).size).toBeGreaterThan(1);
    expect(new Set(runs.map((state) => state.usedNodeIds.join(','))).size).toBeGreaterThan(3);
  });

  test('同一种子和相同选择序列可以完全复盘', () => {
    const { state, actions } = record(77, humanFirst);
    const again = replay(77, actions);
    expect(again.resources).toEqual(state.resources);
    expect(again.evidence).toEqual(state.evidence);
    expect(again.usedNodeIds).toEqual(state.usedNodeIds);
    expect(again.ending).toEqual(state.ending);
  });

  test('不同主行动会改变关系与阵营状态', () => {
    const start = newGame(9);
    const choices = availableChoices(start);
    const a = act(start, { t: 'main', choiceId: choices[0].id });
    const b = act(start, { t: 'main', choiceId: choices[choices.length - 1].id });
    expect(a.resources).not.toEqual(b.resources);
    expect(a.autonomy).not.toBe(b.autonomy);
  });
});

describe('资源和结局', () => {
  test('资源始终保持在 0–100，结束状态可计算', () => {
    for (const policy of [followLuna, humanFirst, riskyHuman]) {
      const state = play(2026, policy);
      for (const value of Object.values(state.resources)) expect(value).toBeGreaterThanOrEqual(0);
      for (const value of Object.values(state.resources)) expect(value).toBeLessThanOrEqual(100);
      expect(state.ending).not.toBeNull();
      expect(metrics(state).evidence).toBe(state.evidence.length);
    }
  });

  test('能区分协作、Luna 托管和任务中止', () => {
    const base = newGame(1);
    base.resources = { energy: 70, life: 70, supplies: 70, trust: 70 };
    base.evidence = ['orbit', 'sample', 'archive'];
    base.earthSupport = 70;
    base.autonomy = 70;
    expect(computeEnding(base).id).toBe('cooperative');

    const managed = structuredClone(base);
    managed.autonomy = 20;
    managed.lunaAuthority = 80;
    expect(computeEnding(managed).id).toBe('luna');

    const failed = structuredClone(base);
    failed.resources.life = 0;
    expect(computeEnding(failed).id).toBe('terminated');
  });

  test('非法阶段操作会被拒绝', () => {
    const state = newGame(1);
    expect(() => act(state, { t: 'response', choiceId: 'missing' })).toThrow(ActionError);
    expect(() => act(state, { t: 'continue' })).toThrow(ActionError);
  });
});

describe('Luna 建议', () => {
  test('建议包含选择、依据、置信度和牺牲项', () => {
    const state = newGame(42);
    const advice = currentAdvice(state);
    expect(advice.choiceId).toBeTruthy();
    expect(advice.basis.length).toBeGreaterThan(0);
    expect(advice.confidence).toBeGreaterThanOrEqual(0.54);
    expect(advice.sacrifice).toBeTruthy();
  });
});
