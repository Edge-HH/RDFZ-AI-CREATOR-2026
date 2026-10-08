import { ARRIVAL_DAY, DEPARTURE_DAY, earthMarsDelayMinutes, isSolarConjunction, lightDelayMinutes, phaseOf, RETURN_DAY } from '../core/orbit';
import { storageCap } from '../core/state';
import type { MissionState } from '../core/types';
import { clear, h, ICON, svg } from './dom';
import { level } from './hud';
import { repoLink } from './screens';

interface GaugeRead { key: string; label: string; value: string; pct: number; lvl: 'ok' | 'warn' | 'danger'; cmp?: number }

function phasePct(day: number): number {
  switch (phaseOf(day)) {
    case 'cruise': return day / ARRIVAL_DAY;
    case 'surface': return (day - ARRIVAL_DAY) / (DEPARTURE_DAY - ARRIVAL_DAY);
    case 'return': return (day - DEPARTURE_DAY) / (RETURN_DAY - DEPARTURE_DAY);
    default: return 1;
  }
}

export function gaugeReads(s: MissionState): GaugeRead[] {
  const surface = phaseOf(s.day) === 'surface';
  const storePct = (s.storage / storageCap(s)) * 100;
  const minSup = Math.min(s.o2, s.water, s.food);
  const active = s.crew.filter((c) => c.status === 'ok' || c.status === 'injured');
  const health = active.length ? active.reduce((a, c) => a + c.health, 0) / active.length : 0;
  return [
    { key: 'time', label: '时间', value: s.day < 0 ? `T${s.day}` : `D+${s.day}`, pct: phasePct(s.day) * 100, lvl: 'ok' },
    surface
      ? { key: 'energy', label: '能源', value: `${Math.round(storePct)}%`, pct: storePct, lvl: level(storePct, 40, 15), cmp: storePct }
      : { key: 'energy', label: '能源', value: '正常', pct: 100, lvl: 'ok' },
    { key: 'supplies', label: '物资', value: `${Math.round(minSup)}天`, pct: (minSup / 600) * 100, lvl: level(minSup, 120, 40), cmp: minSup },
    { key: 'crew', label: '人员', value: `${active.length}/4`, pct: health, lvl: active.length < 4 ? (level(health, 60, 30) === 'danger' ? 'danger' : 'warn') : level(health, 60, 30), cmp: health },
    { key: 'safety', label: '安全', value: `${Math.round(s.integrity)}%`, pct: s.integrity, lvl: level(s.integrity, 60, 30), cmp: s.integrity },
  ];
}

export interface StatusBarOpts {
  sfxOn: boolean;
  onDrawer: () => void;
  onArchive: () => void;
  onRules: () => void;
  onSettings: () => void;
  onMute: () => boolean; // 返回切换后的音效状态
}

// 顶部状态条：五维迷你仪表 + 光速延迟 + 图标按钮（手机端收进菜单）
export class StatusBar {
  readonly el: HTMLElement;
  readonly gaugesBtn: HTMLElement;
  private chapter: HTMLElement;
  private delay: HTMLElement;
  private cells = new Map<string, { root: HTMLElement; val: HTMLElement; bar: HTMLElement; d: HTMLElement }>();
  private prev: Map<string, number> | null = null;
  private icons: HTMLElement;
  private menuBtn: HTMLElement;

  constructor(o: StatusBarOpts) {
    this.chapter = h('div.chapter', {}, '');
    this.delay = h('div.delay-read', {}, h('span.live'), '—');
    this.gaugesBtn = h('button.gauges', { type: 'button', 'aria-label': '打开遥测面板（T）', title: '遥测面板（T）', onclick: () => o.onDrawer() });
    for (const key of ['time', 'energy', 'supplies', 'crew', 'safety']) {
      const val = h('b', {}, '—');
      const d = h('span.d');
      const bar = h('i', { style: 'width:0%' });
      const lbl = h('span.lbl');
      const root = h('span.gauge', {}, h('span.g-top', {}, lbl, val, d), h('span.bar', {}, bar));
      this.cells.set(key, { root, val, bar, d });
      this.gaugesBtn.append(root);
    }
    const item = (label: string, icon: string, onclick: () => void) =>
      h('button.icon-btn', { type: 'button', 'aria-label': label, title: label, onclick: () => { this.closeMenu(); onclick(); } }, svg(icon), h('span.lbl', {}, label));
    const muteBtn = item('音效开关', o.sfxOn ? ICON.sound : ICON.mute, () => {
      const on = o.onMute();
      muteBtn.querySelector('.ico')!.replaceWith(svg(on ? ICON.sound : ICON.mute));
    });
    const repo = repoLink('icon-btn', false);
    repo.append(h('span.lbl', {}, '项目仓库'));
    this.icons = h('div.tb-icons', { id: 'tb-icons' },
      item('知识档案集', ICON.book, o.onArchive), repo, item('玩法与依据', ICON.info, o.onRules), muteBtn, item('设置', ICON.gear, o.onSettings));
    this.menuBtn = h('button.icon-btn.tb-menu', { type: 'button', 'aria-label': '菜单', 'aria-expanded': 'false', 'aria-controls': 'tb-icons' }, svg(ICON.menu));
    this.menuBtn.addEventListener('click', (e) => { e.stopPropagation(); this.toggleMenu(); });
    document.addEventListener('click', (e) => { if (!this.icons.contains(e.target as Node)) this.closeMenu(); });
    this.el = h('header.topbar', {},
      h('div.brand', {}, '光速之隔', h('span.code', {}, '// QC-01')),
      this.chapter, this.gaugesBtn, this.delay, this.icons, this.menuBtn);
    for (const [key, c] of this.cells) c.root.querySelector('.lbl')!.textContent = { time: '时间', energy: '能源', supplies: '物资', crew: '人员', safety: '安全' }[key]!;
  }

  get menuOpen(): boolean { return this.icons.classList.contains('open'); }

  toggleMenu(): void {
    const open = !this.menuOpen;
    this.icons.classList.toggle('open', open);
    this.menuBtn.setAttribute('aria-expanded', String(open));
    if (open) this.icons.querySelector<HTMLElement>('.icon-btn')?.focus({ preventScroll: true });
  }

  closeMenu(): void {
    if (!this.menuOpen) return;
    this.icons.classList.remove('open');
    this.menuBtn.setAttribute('aria-expanded', 'false');
  }

  setChapter(title: string): void { this.chapter.textContent = title; }

  reset(): void { this.prev = null; }

  render(s: MissionState): void {
    const conj = isSolarConjunction(s.day);
    const earth = phaseOf(s.day) === 'earth';
    const delay = earth ? earthMarsDelayMinutes(s.day) : lightDelayMinutes(s.day);
    this.delay.classList.toggle('blackout', conj);
    clear(this.delay).append(h('span.live'), earth ? '地火延迟 ' : '单程延迟 ', h('strong', {}, conj ? '中断' : `${delay.toFixed(1)} 分`));
    const next = new Map<string, number>();
    for (const g of gaugeReads(s)) {
      const c = this.cells.get(g.key)!;
      c.val.textContent = g.value;
      c.bar.style.width = `${Math.max(0, Math.min(100, g.pct))}%`;
      c.root.classList.toggle('warn', g.lvl === 'warn');
      c.root.classList.toggle('danger', g.lvl === 'danger');
      if (g.cmp === undefined) continue;
      next.set(g.key, g.cmp);
      const before = this.prev?.get(g.key);
      if (before === undefined) continue;
      const d = Math.round(g.cmp - before);
      if (Math.abs(d) < 1) continue;
      c.d.className = `d ${d < 0 ? 'down' : 'up'}`;
      c.d.textContent = `${d < 0 ? '▼' : '▲'}${Math.abs(d)}`;
      const stamp = String(performance.now());
      c.d.dataset.stamp = stamp;
      setTimeout(() => { if (c.d.dataset.stamp === stamp) c.d.textContent = ''; }, 4000);
      if (d < 0) { c.root.classList.remove('flash'); void c.root.offsetWidth; c.root.classList.add('flash'); }
    }
    this.prev = next;
  }
}
