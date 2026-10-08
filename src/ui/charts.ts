// 纯 SVG 图表：高程剖面、结算曲线
import type { HistoryEntry } from '../core/types';

const NS = 'http://www.w3.org/2000/svg';
const el = (tag: string, attrs: Record<string, string | number>) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
};

export function profileChart(profile: number[], spanKm: number, label: string): SVGSVGElement {
  const W = 300, H = 90, pad = 18;
  const min = Math.min(...profile) - 0.15, max = Math.max(...profile) + 0.15;
  const x = (i: number) => pad + (i / (profile.length - 1)) * (W - pad * 2);
  const y = (v: number) => 8 + (1 - (v - min) / (max - min)) * (H - 28);
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'profile', role: 'img', 'aria-label': label }) as SVGSVGElement;
  const pts = profile.map((v, i) => `${x(i)},${y(v)}`).join(' ');
  svg.append(el('polygon', { points: `${x(0)},${H - 20} ${pts} ${x(profile.length - 1)},${H - 20}`, fill: 'rgba(224,112,58,0.16)' }));
  svg.append(el('polyline', { points: pts, fill: 'none', stroke: '#e0703a', 'stroke-width': 1.6 }));
  svg.append(el('line', { x1: pad, x2: W - pad, y1: H - 20, y2: H - 20, stroke: 'rgba(220,224,230,0.3)' }));
  const t1 = el('text', { x: pad, y: H - 6, fill: '#7b8187', 'font-size': 10 }); t1.textContent = '0';
  const t2 = el('text', { x: W - pad, y: H - 6, fill: '#7b8187', 'font-size': 10, 'text-anchor': 'end' }); t2.textContent = `${spanKm} km`;
  const t3 = el('text', { x: W / 2, y: H - 6, fill: '#7b8187', 'font-size': 10, 'text-anchor': 'middle' }); t3.textContent = `高程 ${max.toFixed(1)} ~ ${min.toFixed(1)} km`;
  svg.append(t1, t2, t3);
  return svg;
}

// 550 色板只有白、灰、琥珀、红、火星橙，靠线型区分六条曲线
export const SERIES = [
  { key: 'energy', name: '能源储备', color: '#ffb020', dash: '', max: 100 },
  { key: 'supplies', name: '物资（最低项·天）', color: '#e6e8ea', dash: '', max: 600 },
  { key: 'crew', name: '乘员健康', color: '#a9aeb4', dash: '6 3', max: 100 },
  { key: 'safety', name: '系统完好度', color: '#e6e8ea', dash: '2 3', max: 100 },
  { key: 'dose', name: '平均剂量 mSv', color: '#ff3b30', dash: '', max: 1200 },
  { key: 'science', name: '科研产出', color: '#e0703a', dash: '6 3', max: 300 },
] as const;

export function historyChart(history: HistoryEntry[]): { svg: SVGSVGElement; legend: HTMLElement } {
  const W = 640, H = 200, padL = 10, padR = 10, padT = 10, padB = 22;
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img', 'aria-label': '五维资源随任务推进的变化曲线' }) as SVGSVGElement;
  const n = Math.max(2, history.length);
  const x = (i: number) => padL + (i / (n - 1)) * (W - padL - padR);
  const y = (v: number, max: number) => padT + (1 - Math.min(1, Math.max(0, v / max))) * (H - padT - padB);
  for (let g = 0; g <= 4; g++) svg.append(el('line', { x1: padL, x2: W - padR, y1: padT + (g / 4) * (H - padT - padB), y2: padT + (g / 4) * (H - padT - padB), stroke: 'rgba(220,224,230,0.08)' }));
  history.forEach((h, i) => {
    if (h.key) svg.append(el('line', { x1: x(i), x2: x(i), y1: padT, y2: H - padB, stroke: '#ff3b30', 'stroke-opacity': 0.3, 'stroke-dasharray': '3 3' }));
  });
  for (const s of SERIES) {
    const pts = history.map((h, i) => `${x(i)},${y(h.snapshot[s.key], s.max)}`).join(' ');
    svg.append(el('polyline', { points: pts, fill: 'none', stroke: s.color, 'stroke-width': 1.6, 'stroke-linejoin': 'round', 'stroke-dasharray': s.dash || 'none' }));
  }
  const t = el('text', { x: padL, y: H - 6, fill: '#7b8187', 'font-size': 11 }); t.textContent = `第 ${history[0]?.day ?? 0} 天`;
  const t2 = el('text', { x: W - padR, y: H - 6, fill: '#7b8187', 'font-size': 11, 'text-anchor': 'end' }); t2.textContent = `第 ${history.at(-1)?.day ?? 0} 天 · 虚线为关键决策`;
  svg.append(t, t2);
  const legend = document.createElement('div');
  legend.className = 'legend';
  legend.innerHTML = SERIES.map((s) => `<span><svg viewBox="0 0 18 6" aria-hidden="true"><line x1="0" y1="3" x2="18" y2="3" stroke="${s.color}" stroke-width="2" stroke-dasharray="${s.dash || 'none'}"/></svg>${s.name}</span>`).join('');
  return { svg, legend };
}
