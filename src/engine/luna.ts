import { RULES, STAT_LABEL } from './rules';
import type { Card, Check, Delayed, Effects, EventOption, GameState, LunaAdvice, Risk, StatKey } from './types';

/**
 * Luna：规则驱动的离线决策模型（不调用任何在线大模型）。
 * 它最大化“基地安全 + 任务完成”的加权效用，但效用函数中没有“人类自主性”。
 * 这正是玩家需要权衡的地方。
 */

const WEIGHTS: Partial<Record<StatKey, number>> = {
  survey: 1.1,
  research: 0.6,
  life: 1.3,
  energy: 0.8,
  supplies: 0.6,
  equipment: 0.7,
  team: 0.5,
  margin: 2.5,
};

const RISK_AVERSION: Record<Risk, number> = { low: 0, mid: 1, high: 3, extreme: 7 };
const GUARDED: StatKey[] = ['life', 'energy', 'supplies', 'equipment', 'team'];

export function lunaEstimate(state: GameState, check: Check, risk: Risk): number {
  const bias = risk === 'high' || risk === 'extreme' ? state.lunaBias : state.lunaBias / 3;
  return Math.max(0.05, Math.min(0.95, check.p - bias));
}

export function lunaAccuracy(state: GameState): number {
  return (state.lunaHits + RULES.lunaPrior.hits) / (state.lunaTotal + RULES.lunaPrior.total);
}

export function addEffects(a: Effects, b: Effects, k = 1): Effects {
  const out: Effects = { ...a };
  for (const [key, v] of Object.entries(b) as [StatKey, number][]) out[key] = (out[key] ?? 0) + v * k;
  return out;
}

interface Option {
  id: string;
  effects: Effects;
  check?: Check;
  delayed?: Delayed[];
  risk: Risk;
}

export function expectedEffects(state: GameState, o: Option): { ev: Effects; est?: number } {
  let ev = { ...o.effects };
  let est: number | undefined;
  if (o.check) {
    est = lunaEstimate(state, o.check, o.risk);
    ev = addEffects(ev, o.check.success, est);
    ev = addEffects(ev, o.check.fail, 1 - est);
  }
  return { ev, est };
}

/** 资源的边际价值递减：资源越充足，增加的价值越低；越稀缺，损失越痛 */
function resourceValue(x: number): number {
  return 100 * (1 - Math.exp(-Math.max(0, x) / 35));
}

/** 任务紧迫度：剩余回合越少、缺口越大，勘测越重要 */
function surveyWeight(state: GameState): number {
  const remaining = Math.max(1, RULES.rounds - state.round + 1);
  const gap = Math.max(0, 100 - state.stats.survey);
  return (WEIGHTS.survey ?? 1) * (1 + gap / (remaining * 25));
}

function scoreEffects(state: GameState, ev: Effects, k = 1): number {
  let score = 0;
  for (const [key, v] of Object.entries(ev) as [StatKey, number][]) {
    if (GUARDED.includes(key)) {
      const w = WEIGHTS[key] ?? 0;
      score += k * w * (resourceValue(state.stats[key] + v) - resourceValue(state.stats[key])) * 1.4;
      // 安全监管者的损失厌恶：任何资源损失都额外计罚，生命支持最重
      if (v < 0) score += k * v * (key === 'life' ? 0.6 : 0.15);
    } else if (key === 'survey') {
      const capped = Math.min(v, 100 - state.stats.survey);
      score += k * surveyWeight(state) * capped;
    } else {
      score += k * (WEIGHTS[key] ?? 0) * v;
    }
  }
  return score;
}

function utility(state: GameState, o: Option): { score: number; est?: number; ev: Effects } {
  const { ev, est } = expectedEffects(state, o);
  let score = scoreEffects(state, ev);
  for (const d of o.delayed ?? []) score += scoreEffects(state, d.effects, 0.8);
  // 安全阈值惩罚：使用“失败情形”的最坏结果
  const worst = o.check ? addEffects(o.effects, o.check.fail) : o.effects;
  for (const k of GUARDED) {
    const after = state.stats[k] + (worst[k] ?? 0);
    if (after < RULES.safety) score -= (RULES.safety - after) * (k === 'life' ? 2.5 : 1.2);
  }
  score -= RISK_AVERSION[o.risk];
  return { score, est, ev };
}

export function warningsFor(state: GameState, o: Option, stage: number): string[] {
  const out: string[] = [];
  const worst = o.check ? addEffects(o.effects, o.check.fail) : o.effects;
  const threshold = stage >= 2 ? RULES.safety : 15;
  for (const k of GUARDED) {
    const after = state.stats[k] + (worst[k] ?? 0);
    if ((worst[k] ?? 0) < 0 && after < threshold) out.push(`${STAT_LABEL[k]}可能降至 ${Math.max(0, Math.round(after))}，低于安全阈值 ${threshold}`);
  }
  if (stage >= 2 && o.risk === 'extreme') out.push('极端高风险：可能触发有限接管');
  if (stage >= 2 && o.check) {
    const est = lunaEstimate(state, o.check, o.risk);
    if (est < 0.55) out.push(`Luna 估计成功率仅 ${Math.round(est * 100)}%`);
  }
  if ((o.effects.autonomy ?? 0) < 0) out.push('该方案会降低人类自主性');
  return out;
}

function describeBasis(state: GameState, est: number | undefined, ev: Effects): string[] {
  const basis: string[] = [];
  const contribs = (Object.entries(ev) as [StatKey, number][])
    .filter(([k]) => WEIGHTS[k])
    .map(([k, v]) => ({ k, v, w: (WEIGHTS[k] ?? 0) * v }))
    .sort((a, b) => Math.abs(b.w) - Math.abs(a.w))
    .slice(0, 3);
  for (const c of contribs) {
    const sign = c.v > 0 ? '+' : '';
    basis.push(`${STAT_LABEL[c.k]}期望 ${sign}${Math.round(c.v)}`);
  }
  if (est !== undefined) basis.push(`估计成功率 ${Math.round(est * 100)}%（含模型偏差 ${Math.round(state.lunaBias * 100)}%）`);
  const low = GUARDED.filter((k) => state.stats[k] < 40);
  if (low.length) basis.push(`当前偏低：${low.map((k) => `${STAT_LABEL[k]} ${state.stats[k]}`).join('、')}`);
  return basis;
}

function confidenceFrom(scores: number[], best: number, est?: number): number {
  const sorted = [...scores].sort((a, b) => b - a);
  const gap = sorted.length > 1 ? best - sorted[1] : 10;
  let c = 0.55 + Math.min(0.38, gap / 40);
  if (est !== undefined) c = Math.min(c, 0.5 + Math.abs(est - 0.5));
  return Math.round(c * 100) / 100;
}

function advise(state: GameState, opts: (Option & { sacrifice: string })[], stage: number, line: string): LunaAdvice {
  const rated = opts.map((o) => ({ o, ...utility(state, o) }));
  const best = rated.reduce((a, b) => (b.score > a.score ? b : a));
  const warnings: Record<string, string[]> = {};
  const estimates: Record<string, number> = {};
  for (const r of rated) {
    warnings[r.o.id] = warningsFor(state, r.o, stage);
    if (r.est !== undefined) estimates[r.o.id] = r.est;
  }
  const sacrifice = [best.o.sacrifice];
  if ((best.o.effects.autonomy ?? 0) < 0) sacrifice.push('人类自主性');
  return {
    cardId: best.o.id,
    confidence: confidenceFrom(rated.map((r) => r.score), best.score, best.est),
    basis: describeBasis(state, best.est, best.ev),
    accuracy: lunaAccuracy(state),
    sacrifice: sacrifice.join('；'),
    warnings,
    estimates,
    line,
  };
}

export function adviseCards(state: GameState, cards: Card[], line: string): LunaAdvice {
  return advise(
    state,
    cards.map((c) => ({ id: c.id, effects: c.effects, check: c.check, delayed: c.delayed, risk: c.risk, sacrifice: c.sacrifice })),
    state.lunaStage,
    line,
  );
}

export function riskOfOption(o: EventOption): Risk {
  if (!o.check) return 'low';
  return o.check.p < 0.55 ? 'high' : 'mid';
}

export function adviseEvent(state: GameState, options: EventOption[], line: string): LunaAdvice {
  return advise(
    state,
    options.map((o) => ({ id: o.id, effects: o.effects, check: o.check, delayed: o.delayed, risk: riskOfOption(o), sacrifice: sacrificeOfOption(o) })),
    state.lunaStage,
    line,
  );
}

function sacrificeOfOption(o: EventOption): string {
  const neg = (Object.entries(o.effects) as [StatKey, number][]).filter(([, v]) => v < 0).map(([k]) => STAT_LABEL[k]);
  if (o.check) neg.push('失败风险');
  return neg.length ? neg.join('、') : '无明显代价';
}
