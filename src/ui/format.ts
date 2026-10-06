import { STAT_LABEL } from '../engine/rules';
import type { Category, Effects, Risk, StatKey } from '../engine/types';

export function esc(s: string | number): string {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export const CATEGORY_LABEL: Record<Category, string> = { fact: '科学事实', inference: '合理推演', param: '游戏参数' };

export function tag(kind: Category): string {
  return `<span class="tag tag--${kind}">${CATEGORY_LABEL[kind]}</span>`;
}

export const RISK_LABEL: Record<Risk, string> = { low: '低风险', mid: '中风险', high: '高风险', extreme: '极端高风险' };

/** 对 Luna 而言是“好”的方向；自主性与信任单独着色 */
export function effectChips(e: Effects, extraClass = ''): string {
  const items = (Object.entries(e) as [StatKey, number][]).filter(([, v]) => Math.round(v) !== 0);
  if (!items.length) return '';
  return `<div class="effects ${extraClass}">${items
    .map(([k, v]) => {
      const cls = k === 'autonomy' || k === 'trust' ? 'auto' : v > 0 ? 'up' : 'down';
      return `<span class="eff ${cls}">${STAT_LABEL[k]} ${v > 0 ? '+' : ''}${Math.round(v)}</span>`;
    })
    .join('')}</div>`;
}

export function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}
