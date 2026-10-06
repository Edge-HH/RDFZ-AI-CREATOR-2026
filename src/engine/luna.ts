import type { GameState, LunaAdvice, NodeChoice, StoryNode } from './types';

function scoreChoice(choice: NodeChoice): number {
  const e = choice.effects;
  let score = 0;
  score += (e.energy ?? 0) * 0.7 + (e.life ?? 0) * 1.1 + (e.supplies ?? 0) * 0.6 + (e.trust ?? 0) * 0.9;
  score += (e.evidence ? 9 : 0) + (e.lunaAuthority ?? 0) * 0.35;
  score -= (e.autonomy ?? 0) * 0.15;
  if (choice.risk === 'high') score -= 5;
  if (choice.risk === 'mid') score -= 2;
  return score;
}

export function currentAdvice(s: GameState, node: StoryNode): LunaAdvice {
  const ranked = [...node.choices].sort((a, b) => scoreChoice(b) - scoreChoice(a));
  const choice = ranked[0] ?? node.choices[0];
  const risk = choice.risk ?? node.risk;
  const confidence = Math.max(0.54, Math.min(0.94, 0.72 + scoreChoice(choice) / 100));
  const sacrifice = Object.entries(choice.effects)
    .filter(([, v]) => typeof v === 'number' && v < 0)
    .map(([k, v]) => `${k} ${v}`)
    .join('、') || '暂未发现直接资源损耗';
  const basis = [
    node.kind === 'investigation' ? '信号证据链完整度' : '当前基地稳定度',
    risk === 'none' || risk === 'low' ? '可逆性较高' : '存在不可逆后果',
    s.evidence.length ? `已掌握证据 ${s.evidence.length}/3` : '证据仍不完整',
  ];
  return {
    choiceId: choice.id,
    confidence,
    basis,
    accuracy: s.lunaTotal ? s.lunaHits / s.lunaTotal : 0.75,
    sacrifice,
    line: risk === 'high' ? '我建议先确认代价，再决定是否承担这条路径。' : '这条路径的后果相对可控，但我不能替你决定公开什么。',
  };
}

export function updatePrediction(s: GameState, followed: boolean): void {
  s.lunaTotal += 1;
  if (followed) s.lunaHits += 1;
}
