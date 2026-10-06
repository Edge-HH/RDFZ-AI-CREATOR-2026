import { RULES } from './rules';
import type { EndingResult, GameState, Metrics } from './types';

export function stability(s: GameState): number {
  const r = s.resources;
  return Math.round(0.35 * r.energy + 0.35 * r.life + 0.2 * r.supplies + 0.1 * r.trust);
}

export function metrics(s: GameState): Metrics {
  return {
    evidence: s.evidence.length,
    stability: stability(s),
    trust: s.resources.trust,
    autonomy: s.autonomy,
    earthSupport: s.earthSupport,
  };
}

export function computeEnding(s: GameState): EndingResult {
  const m = metrics(s);
  if (s.resources.life <= 0 || s.resources.energy <= 0) {
    return { id: 'terminated', metrics: m, unmet: ['能源或生命支持归零'] };
  }

  const unmet: string[] = [];
  if (m.evidence < RULES.ending.evidence) unmet.push(`证据 ${m.evidence}/3`);
  if (m.stability < RULES.ending.stability) unmet.push(`基地稳定度 ${m.stability} < ${RULES.ending.stability}`);
  if (m.earthSupport < RULES.ending.earthSupport) unmet.push(`地下城支持度 ${m.earthSupport} < ${RULES.ending.earthSupport}`);

  if (!unmet.length && s.autonomy >= RULES.ending.autonomy && s.lunaAuthority < 60) {
    return { id: 'cooperative', metrics: m, unmet: [] };
  }
  if (!unmet.length && s.lunaAuthority >= 60) {
    return { id: 'luna', metrics: m, unmet };
  }
  return { id: 'retreat', metrics: m, unmet };
}
