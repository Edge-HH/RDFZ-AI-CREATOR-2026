import { DOSE_LIMIT } from '../core/endings';
import { ARRIVAL_DAY, CONJUNCTION_START, DEPARTURE_DAY, earthMarsDelayMinutes, isSolarConjunction, lightDelayMinutes, phaseOf, RETURN_DAY, solOf } from '../core/orbit';
import { rates } from '../core/rates';
import { storageCap } from '../core/state';
import type { MissionState } from '../core/types';
import { CAST } from '../content/cast';
import { siteById } from '../content/sites';
import { clear, h, ICON, svg } from './dom';
import { portrait } from './portraits';

type Prev = Record<string, number>;

const fmt = (v: number, d = 0) => v.toFixed(d);
const level = (v: number, warn: number, danger: number, higherIsBetter = true) =>
  higherIsBetter ? (v <= danger ? 'danger' : v <= warn ? 'warn' : 'ok') : v >= danger ? 'danger' : v >= warn ? 'warn' : 'ok';

function bar(pct: number, cls = '', mark?: number) {
  const b = h('div.bar', { class: cls, role: 'presentation' }, h('i', { style: `width:${Math.max(0, Math.min(100, pct))}%` }));
  if (mark !== undefined) b.append(h('span.mark', { style: `left:${mark}%` }));
  return b;
}

export function milestone(s: MissionState): string {
  const p = phaseOf(s.day);
  if (p === 'earth') return `距发射 ${-s.day} 天`;
  if (p === 'cruise') return `距抵达火星 ${ARRIVAL_DAY - s.day} 天`;
  if (p === 'surface') {
    if (s.day < CONJUNCTION_START) return `距日凌 ${CONJUNCTION_START - s.day} 天 · 距返程 ${DEPARTURE_DAY - s.day} 天`;
    return `距返程窗口 ${DEPARTURE_DAY - s.day} 天`;
  }
  if (p === 'return') return `距地球 ${RETURN_DAY - s.day} 天`;
  return '已返回地球';
}

export class Hud {
  private prev: Prev | null = null;
  constructor(public root: HTMLElement) {}

  private delta(key: string, now: number, digits = 0, higherIsBetter = true) {
    const before = this.prev?.[key];
    if (before === undefined) return null;
    const d = now - before;
    if (Math.abs(d) < (digits ? 0.5 : 1)) return null;
    const good = higherIsBetter ? d > 0 : d < 0;
    return h('span.delta', { class: good ? 'up' : 'down' }, `${d > 0 ? '+' : ''}${fmt(d, digits)}`);
  }

  render(s: MissionState): void {
    const r = rates(s);
    const phase = phaseOf(s.day);
    const active = s.crew.filter((c) => c.status === 'ok' || c.status === 'injured');
    const avgDose = s.crew.reduce((a, c) => a + c.dose, 0) / s.crew.length;
    const cap = storageCap(s);
    const site = siteById(s.site);
    const now: Prev = { o2: s.o2, water: s.water, food: s.food, integrity: s.integrity, dose: avgDose, science: s.science, propellant: s.propellant, spares: s.spares };

    const time = h('section.card', { 'aria-label': '时间' },
      h('h3', {}, svg(ICON.clock), '时间'),
      h('div.stat-row', {}, h('span', {}, '任务日'), h('span.num', {}, s.day < 0 ? `T${s.day}` : `第 ${s.day} 天`)),
      phase === 'surface' ? h('div.stat-row', {}, h('span', {}, '火星日'), h('span.num', {}, `Sol ${solOf(s.day)}`)) : null,
      phase === 'earth'
        ? h('div.stat-row', {}, h('span', {}, '地火光速延迟'), h('span.num', { style: 'color:var(--cyan)' }, `${fmt(earthMarsDelayMinutes(s.day), 1)} 分钟`))
        : h('div.stat-row', {}, h('span', {}, '单程光速延迟'), h('span.num', { style: 'color:var(--cyan)' },
          isSolarConjunction(s.day) ? '日凌中断' : `${fmt(lightDelayMinutes(s.day), 1)} 分钟`)),
      h('div.hint', {}, milestone(s)),
    );

    const energy = h('section.card', { 'aria-label': '能源' },
      h('h3', {}, svg(ICON.bolt), '能源'),
      phase === 'surface'
        ? [
          h('div.stat-row', {}, h('span', {}, '发电 / 需求'), h('span.num', { class: r.powerGen >= r.powerNeed ? 'tag-ok' : 'tag-danger' }, `${fmt(r.powerGen, 1)} / ${fmt(r.powerNeed, 1)} kW`)),
          h('div.stat-row', {}, h('span', {}, '储能'), h('span.num', {}, `${Math.round((s.storage / cap) * 100)}%`)),
          bar((s.storage / cap) * 100, level((s.storage / cap) * 100, 40, 15)),
          h('div.stat-row', {}, h('span', {}, '大气光学厚度 τ'), h('span.num', { class: s.dustTau > 3 ? 'tag-danger' : '' }, fmt(s.dustTau, 1))),
        ]
        : [
          h('div.stat-row', {}, h('span', {}, phase === 'earth' ? '着陆器电力' : '飞船电力'), h('span.num.tag-ok', {}, '正常')),
          h('div.hint', {}, s.loadout.length ? `地表预计晴天发电 ${fmt(rates({ ...s, site: s.site ?? 'utopia', dustTau: 0.5 }).powerGen, 1)} kW` : '尚未配载'),
        ],
    );

    const supRow = (name: string, key: 'o2' | 'water' | 'food') => [
      h('div.stat-row', {}, h('span', {}, name), h('span', {}, h('span.num', {}, `${Math.round(s[key])} 天`), this.delta(key, s[key]))),
      bar((s[key] / 600) * 100, level(s[key], 120, 40)),
    ];
    const supplies = h('section.card', { 'aria-label': '物资' },
      h('h3', {}, svg(ICON.box), '物资'),
      supRow('氧气', 'o2'), supRow('水', 'water'), supRow('食物', 'food'),
      h('div.stat-row', {}, h('span', {}, '关键备件'), h('span', {}, h('span.num', {}, `${s.spares} 份`), this.delta('spares', s.spares))),
      s.flags.includes('rationing') ? h('div.hint.tag-warn', {}, '配给制执行中') : null,
    );

    const crewCard = h('section.card.crew-card', { 'aria-label': '乘员' },
      h('h3', {}, svg(ICON.users), `乘员 · ${active.length}/4 在任`),
      h('div.crew-list', {}, s.crew.map((c) => h('div.crew-item', { class: c.status },
        portrait(c.id),
        h('div', {},
          h('div.who', {}, h('b', {}, CAST[c.id].name.split('·')[0]), h('span', { class: c.status === 'injured' ? 'tag-warn' : c.status === 'lost' ? 'tag-danger' : 'hint' },
            c.status === 'lost' ? '失去' : c.status === 'injured' ? '受伤' : CAST[c.id].role)),
          h('div.mini', {},
            h('div', { title: `健康 ${Math.round(c.health)}` }, '健康', bar(c.health, level(c.health, 60, 30))),
            h('div', { title: `士气 ${Math.round(c.morale)}` }, '士气', bar(c.morale, 'mars')),
            h('div', { title: `信任 ${Math.round(c.trust)}` }, '信任', bar(c.trust, '')),
          ),
        ),
      ))),
    );

    const safety = h('section.card', { 'aria-label': '安全' },
      h('h3', {}, svg(ICON.shield), '安全'),
      h('div.stat-row', {}, h('span', {}, '系统完好度'), h('span', {}, h('span.num', {}, `${Math.round(s.integrity)}%`), this.delta('integrity', s.integrity))),
      bar(s.integrity, level(s.integrity, 60, 30)),
      h('div.stat-row', {}, h('span', {}, '平均累计剂量'), h('span', {}, h('span.num', {}, `${Math.round(avgDose)} mSv`), this.delta('dose', avgDose, 0, false))),
      bar((avgDose / (DOSE_LIMIT * 1.2)) * 100, level(avgDose, DOSE_LIMIT * 0.7, DOSE_LIMIT, false), (1 / 1.2) * 100),
      h('div.hint', {}, `红线：任务剂量上限 ${DOSE_LIMIT} mSv`),
    );

    const output = h('section.card', { 'aria-label': '任务产出' },
      h('h3', {}, svg(ICON.flask), '任务产出'),
      h('div.stat-row', {}, h('span', {}, '科研产出'), h('span', {}, h('span.num', {}, fmt(s.science)), this.delta('science', s.science))),
      h('div.stat-row', {}, h('span', {}, '上升器推进剂'), h('span', {}, h('span.num', {}, `${Math.round(s.propellant)}%`), this.delta('propellant', s.propellant))),
      bar(s.propellant, s.propellant >= 100 ? 'ok' : 'mars', 100 / 1.2 * 1.2),
      site ? h('div.hint', {}, `着陆点：${site.name}`) : null,
      h('div.hint', {}, `授权度：${s.autonomy}`),
    );

    clear(this.root).append(time, energy, supplies, crewCard, safety, output);
    this.prev = now;
  }
}
