import { RULES } from './rules';
import type { EndingResult, GameState, Metrics } from './types';

export function stability(s: GameState): number {
  const { energy, life, supplies, equipment } = s.stats;
  return Math.round(0.3 * energy + 0.3 * life + 0.2 * supplies + 0.2 * equipment);
}

export function metrics(s: GameState): Metrics {
  return {
    mission: s.stats.survey,
    stability: stability(s),
    research: s.stats.research,
    team: s.stats.team,
    autonomy: s.stats.autonomy,
  };
}

export function surveyStage(survey: number): number {
  return RULES.surveyStages.filter((t) => survey >= t).length;
}

/**
 * 结局判定（游戏参数）：
 * - 生命支持归零 → 任务终止（第三档的终止版本）
 * - 协作存续：勘测 100%、稳定度 ≥ 40、自主性 ≥ 50、地下城已上线
 * - Luna 托管存续：勘测 ≥ 67%、稳定度 ≥ 40、自主性 < 50
 * - 其余 → 人类自主撤退 / 任务中止
 */
export function computeEnding(s: GameState): EndingResult {
  const m = metrics(s);
  const E = RULES.ending;
  if (s.stats.life <= 0) return { id: 'terminated', metrics: m, unmet: ['生命支持归零'] };

  const coopUnmet: string[] = [];
  if (m.mission < E.coopSurvey) coopUnmet.push(`勘测进度 ${m.mission}% < ${E.coopSurvey}%`);
  if (m.stability < E.stability) coopUnmet.push(`基地稳定度 ${m.stability} < ${E.stability}`);
  if (m.autonomy < E.autonomy) coopUnmet.push(`人类自主性 ${m.autonomy} < ${E.autonomy}`);
  if (s.undercity !== 'online') coopUnmet.push('地下城未上线');
  if (!coopUnmet.length) return { id: 'cooperative', metrics: m, unmet: [] };

  if (m.autonomy < E.autonomy && m.mission >= E.lunaSurvey && m.stability >= E.stability) {
    return { id: 'luna', metrics: m, unmet: coopUnmet };
  }
  return { id: 'retreat', metrics: m, unmet: coopUnmet };
}
