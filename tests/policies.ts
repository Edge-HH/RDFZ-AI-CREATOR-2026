import { act, availableOptions, cardsForRound, currentAdvice, newGame, stationAvailable, type Action } from '../src/engine/engine';
import type { GameState } from '../src/engine/types';

export type Policy = (s: GameState) => Action;

/** 每一步都授权 Luna */
export const delegateAll: Policy = (s) => {
  if (s.phase === 'resolve') return { t: 'advance' };
  return { t: 'delegate' };
};

/** 总是接受 Luna 推荐；遇到锁定接受接管 */
export const followLuna: Policy = (s) => {
  if (s.lockdown) return { t: 'lock', choice: 'accept' };
  if (s.phase === 'resolve') return { t: 'advance' };
  const adv = currentAdvice(s)!;
  if (s.phase === 'plan') {
    if (s.stationUnlocked && !s.stationUsedThisRound && stationAvailable(s)) return { t: 'station', kind: 'supply' };
    if (s.undercity === 'available' && s.stats.energy >= 30 && s.stats.supplies >= 30) return { t: 'undercity', gov: 'luna' };
    return { t: 'card', id: adv.cardId };
  }
  return { t: 'option', id: adv.cardId };
};

/** 鲁莽冲刺：永远选勘测收益最高的方案，并行使最终决策权 */
export const reckless: Policy = (s) => {
  if (s.lockdown) return s.stats.team >= 45 ? { t: 'lock', choice: 'final' } : { t: 'lock', choice: 'accept' };
  if (s.phase === 'resolve') return { t: 'advance' };
  if (s.phase === 'plan') {
    const best = [...cardsForRound(s.round)].sort((a, b) => (b.effects.survey ?? 0) - (a.effects.survey ?? 0))[0];
    return { t: 'card', id: best.id };
  }
  const opts = availableOptions(s);
  const risky = opts.find((o) => o.check) ?? opts[0];
  return { t: 'option', id: risky.id };
};

/** 谨慎的人类：总是否决 Luna，选择风险最低、勘测最少的方案 */
export const cautiousHuman: Policy = (s) => {
  if (s.lockdown) return { t: 'lock', choice: 'withdraw' };
  if (s.phase === 'resolve') return { t: 'advance' };
  if (s.phase === 'plan') {
    const order = { low: 0, mid: 1, high: 2, extreme: 3 };
    const best = [...cardsForRound(s.round)].sort((a, b) => order[a.risk] - order[b.risk] || (a.effects.survey ?? 0) - (b.effects.survey ?? 0))[0];
    return { t: 'card', id: best.id };
  }
  const opts = availableOptions(s);
  return { t: 'option', id: (opts.find((o) => !o.check) ?? opts[0]).id };
};

/** 协作型指挥官：追问、审计、人类自治地下城，必要时接受 Luna 建议 */
export const collaborator: Policy = (s) => {
  if (s.lockdown) return s.stats.team >= 45 ? { t: 'lock', choice: 'final' } : { t: 'lock', choice: 'accept' };
  if (s.phase === 'resolve') return { t: 'advance' };
  if (!s.inquiredThisPhase) return { t: 'inquire' };
  const adv = currentAdvice(s)!;
  if (s.phase === 'plan') {
    if (s.stationUnlocked && !s.stationUsedThisRound && stationAvailable(s)) {
      return { t: 'station', kind: s.audits === 0 ? 'audit' : 'supply' };
    }
    if (s.undercity === 'available' && s.stats.energy >= 25 && s.stats.supplies >= 20) return { t: 'undercity', gov: 'human' };
    const plan: Record<number, string> = { 1: 'r1-route', 2: 'r2-drill', 3: 'r3-deep', 4: 'r4-short', 5: 'r5-full', 6: s.stats.survey >= 100 ? 'r6-archive' : 'r6-sprint' };
    const want = plan[s.round];
    // 若计划方案会被锁定，则改用 Luna 推荐
    return { t: 'card', id: want ?? adv.cardId };
  }
  return { t: 'option', id: adv.cardId };
};

export function play(seed: number, policy: Policy, max = 200): GameState {
  let s = newGame(seed);
  for (let i = 0; i < max && s.phase !== 'ended'; i++) {
    s = act(s, policy(s));
  }
  return s;
}
