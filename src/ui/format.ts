import { RULES } from '../engine/rules';
import type { Effects, ResourceKey } from '../engine/types';

export function esc(s: string | number): string {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}

export function effectChips(e: Effects, extraClass = ''): string {
  const items = Object.entries(e).filter(([, v]) => typeof v === 'number' && Math.round(v) !== 0) as [string, number][];
  if (!items.length) return '';
  const labels: Record<string, string> = {
    ...RULES.resourceLabels,
    autonomy: '自主性',
    lin: '林曜关系',
    su: '苏禾关系',
    earthSupport: '地下城支持',
    stationControl: '空间站控制',
    lunaAuthority: 'Luna 权限',
  };
  return `<div class="effects ${extraClass}">${items
    .map(([key, value]) => `<span class="eff ${value > 0 ? 'up' : 'down'}">${esc(labels[key] ?? key)} ${value > 0 ? '+' : ''}${Math.round(value)}</span>`)
    .join('')}</div>`;
}

export function resourceLabel(key: ResourceKey): string {
  return RULES.resourceLabels[key];
}
