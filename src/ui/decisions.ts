import type { Decision } from '../core/content';
import type { OptionView } from '../core/flow';
import { rates } from '../core/rates';
import { applyLoadout, loadoutSlots } from '../core/state';
import type { MissionState, SiteId } from '../core/types';
import { MODULES, SLOT_BUDGET } from '../content/modules';
import { presetById } from '../content/presets';
import { SITES } from '../content/sites';
import { profileChart } from './charts';
import { clear, h, ICON, svg } from './dom';

const pct = (v: number) => `${Math.round(v * 100)}%`;

function overlay(...children: HTMLElement[]): HTMLElement {
  const o = h('div.overlay', { role: 'dialog', 'aria-modal': 'true' }, ...children);
  document.body.append(o);
  return o;
}

export function choiceOptions(area: HTMLElement, prompt: string, options: OptionView[], onPick: (id: string) => void): void {
  clear(area).append(h('div.prompt', {}, svg(ICON.send), prompt));
  for (const o of options) {
    const basisBox = h('div.basis', { hidden: true }, o.basis ?? '');
    const btn = h('button.opt', { class: o.enabled ? '' : 'locked', disabled: !o.enabled, type: 'button' },
      h('div.t', {}, o.enabled ? null : svg(ICON.lock), o.label),
      o.detail ? h('div.d', {}, o.detail) : null,
      o.risk ? h('div.risk', {},
        `${o.risk.label}：估计 ${pct(o.risk.low)} ~ ${pct(o.risk.high)}`,
        h('div.rbar', { title: '区间越宽，说明你手上的信息越旧、越模糊' },
          h('i', { style: `left:${o.risk.low * 100}%;width:${Math.max(1.5, (o.risk.high - o.risk.low) * 100)}%` }),
          h('b', { style: `left:${o.risk.p * 100}%` }))) : null,
      !o.enabled && o.lockedReason ? h('div.lock', {}, o.lockedReason) : null,
    );
    btn.addEventListener('click', () => onPick(o.id));
    const wrap = h('div', {}, btn);
    if (o.basis) {
      const tog = h('button.basis-toggle', { type: 'button', 'aria-expanded': 'false' }, svg(ICON.info), '科学依据');
      tog.addEventListener('click', () => {
        basisBox.hidden = !basisBox.hidden;
        tog.setAttribute('aria-expanded', String(!basisBox.hidden));
      });
      wrap.append(tog, basisBox);
    }
    area.append(wrap);
  }
}

export function openLoadout(state: MissionState, onConfirm: (ids: string[]) => void): void {
  const chosen = new Set<string>();
  const meter = h('div.slots-meter', { 'aria-hidden': 'true' });
  const meterText = h('span.num');
  const preview = h('div.preview');
  const confirm = h('button.btn.primary', { type: 'button' }, svg(ICON.check), '确认配载') as HTMLButtonElement;
  const buttons = new Map<string, HTMLElement>();

  const refresh = () => {
    const ids = [...chosen];
    const used = loadoutSlots(ids);
    clear(meter);
    for (let i = 0; i < Math.max(SLOT_BUDGET, used); i++) meter.append(h('i', { class: i < used ? (used > SLOT_BUDGET ? 'over' : 'on') : '' }));
    meterText.textContent = `${used} / ${SLOT_BUDGET} 槽位`;
    confirm.disabled = used > SLOT_BUDGET || used === 0;
    for (const [id, b] of buttons) b.setAttribute('aria-pressed', String(chosen.has(id)));
    const s = used <= SLOT_BUDGET ? applyLoadout(state, ids) : state;
    const clear0 = rates({ ...s, site: 'utopia', dustTau: 0.5 });
    const storm = rates({ ...s, site: 'utopia', dustTau: 9 });
    const cell = (k: string, v: string, cls = '') => h('div.card', {}, h('div.k', {}, k), h('div.v', { class: cls }, v));
    clear(preview).append(
      cell('晴天发电 / 需求（乌托邦）', `${clear0.powerGen.toFixed(1)} / ${clear0.powerNeed.toFixed(1)} kW`, clear0.powerGen >= clear0.powerNeed ? 'tag-ok' : 'tag-danger'),
      cell('全球沙尘暴时发电', `${storm.powerGen.toFixed(1)} kW`, storm.powerGen >= storm.powerNeed ? 'tag-ok' : 'tag-warn'),
      cell('氧 / 水 / 食物储备', `${s.o2} / ${s.water} / ${s.food} 天`),
      cell('巡航 / 地表剂量系数', `×${clear0.cruiseShield.toFixed(2)} / ×${clear0.surfaceShield.toFixed(2)}`),
      cell('科研加成', `×${(clear0.scienceMult / 1.15).toFixed(2)}`),
    );
  };

  const groups = ['能源', '生保', '安全', '科研'] as const;
  const grid = h('div.mod-groups', {}, groups.map((g) => h('div.mod-group', {},
    h('h4', {}, g),
    MODULES.filter((m) => m.group === g).map((m) => {
      const b = h('button.mod', { type: 'button', 'aria-pressed': 'false' },
        h('div.t', {}, h('span', {}, m.name), h('span.slots', {}, `${m.slots} 槽`)),
        h('div.d', {}, m.desc),
        h('div.b', {}, `依据：${m.basis}`));
      b.addEventListener('click', () => {
        if (chosen.has(m.id)) chosen.delete(m.id); else chosen.add(m.id);
        refresh();
      });
      buttons.set(m.id, b);
      return b;
    }))));

  const o = overlay(h('div.sheet', {},
    h('div.sheet-head', {}, h('div', {},
      h('h2', {}, '配载：十二个槽位'),
      h('p', {}, '居住舱、上升器与推进剂工厂已预置在火星。你带去的东西，会一直影响到返程那一天。')),
      h('div', { style: 'text-align:right' }, meterText, meter)),
    preview, grid,
    h('div.sheet-foot', {}, h('span.hint', {}, '提示：没有完美配载。注意电力、氧气、食物与辐射屏蔽。'), h('span.spacer'), confirm)));
  confirm.addEventListener('click', () => { o.remove(); onConfirm([...chosen]); });
  refresh();
}

export function openSite(onConfirm: (id: SiteId) => void, onHover?: (id: SiteId) => void): void {
  let chosen: SiteId | null = null;
  const confirm = h('button.btn.primary', { type: 'button', disabled: true }, svg(ICON.check), '锁定着陆点') as HTMLButtonElement;
  const cards = SITES.map((site) => {
    const meter = (label: string, v: number, cls = '') => [h('span', {}, label), h('div.bar', { class: cls }, h('i', { style: `width:${v * 100}%` }))];
    const b = h('button.site', { type: 'button', 'aria-pressed': 'false' },
      h('h4', {}, site.name), h('div.tagline', {}, site.tagline), h('div.hint', {}, `${site.coord} · 海拔 ${site.elevationKm} km`),
      profileChart(site.profile, site.profileKm, `${site.name}地形剖面`),
      h('div.meters', {},
        meter('光照', site.solarFactor, 'warn'),
        meter('地下冰', site.ice, ''),
        meter('科研价值', site.science / 1.5, 'mars'),
        meter('着陆风险', site.edlRisk / 0.25, 'danger')),
      h('ul', {}, site.pros.map((p) => h('li', {}, `+ ${p}`)), site.cons.map((c) => h('li', {}, `− ${c}`))),
      h('div.hint', {}, site.basis));
    b.addEventListener('click', () => {
      chosen = site.id;
      for (const c of cards) c.el.setAttribute('aria-pressed', String(c.id === chosen));
      confirm.disabled = false;
      onHover?.(site.id);
    });
    return { id: site.id, el: b };
  });
  const o = overlay(h('div.sheet', {},
    h('div.sheet-head', {}, h('div', {}, h('h2', {}, '选择着陆点'), h('p', {}, '剖面来自火星轨道激光高度计（MOLA）高程的示意简化。'))),
    h('div.sites', {}, cards.map((c) => c.el)),
    h('div.sheet-foot', {}, h('span.spacer'), confirm)));
  confirm.addEventListener('click', () => { if (chosen) { o.remove(); onConfirm(chosen); } });
}

export function openPresets(d: Extract<Decision, { kind: 'presets' }>, onConfirm: (ids: string[]) => void): void {
  const chosen = new Set<string>();
  const counter = h('span.num');
  const confirm = h('button.btn.primary', { type: 'button', disabled: true }, svg(ICON.send), '写入预案并上传') as HTMLButtonElement;
  const btns = d.pool.map((id) => {
    const p = presetById(id)!;
    const b = h('button.preset', { type: 'button', 'aria-pressed': 'false' },
      h('div.if', {}, '若'), h('div.cond', {}, p.cond), h('div.if', {}, '则'), h('div.then', {}, p.action), h('div.note', {}, p.note));
    b.addEventListener('click', () => {
      if (chosen.has(id)) chosen.delete(id);
      else if (chosen.size < d.pick) chosen.add(id);
      refresh();
    });
    return { id, b };
  });
  const refresh = () => {
    for (const { id, b } of btns) b.setAttribute('aria-pressed', String(chosen.has(id)));
    counter.textContent = `已选 ${chosen.size} / ${d.pick}`;
    confirm.disabled = chosen.size !== d.pick;
  };
  const o = overlay(h('div.sheet', {},
    h('div.sheet-head', {}, h('div', {}, h('h2', {}, d.prompt),
      h('p', {}, '通信盲区里，地面无法干预。有预案的故障按预案处理；没有预案的，交给乘组临场判断——成功率取决于授权度与信任。')), counter),
    h('div.presets', {}, btns.map((x) => x.b)),
    h('div.sheet-foot', {}, h('span.spacer'), confirm)));
  confirm.addEventListener('click', () => { o.remove(); onConfirm([...chosen]); });
  refresh();
}

const AUTONOMY = [
  { lv: 0, name: '事事请示', d: '所有操作等待地面批准。最可控，但每件事都要多等一个往返，乘组会觉得被捆住手脚。' },
  { lv: 1, name: '按规程', d: '常规操作自主，异常情况请示地面。' },
  { lv: 2, name: '现场优先', d: '指令长可在规程外临机决断。盲区里乘组更敢自己拿主意。' },
  { lv: 3, name: '完全授权', d: '乘组自主决定，地面只提供建议。最快、最受信任——但他们可能做出你不认同的选择。' },
];

export function openAutonomy(current: number, onConfirm: (lv: number) => void): void {
  let chosen = current;
  const confirm = h('button.btn.primary', { type: 'button' }, svg(ICON.check), '确认授权') as HTMLButtonElement;
  const btns = AUTONOMY.map((a) => {
    const b = h('button.auto-opt', { type: 'button', 'aria-pressed': String(a.lv === chosen) },
      h('div.lv', {}, a.lv), h('div', {}, h('b', {}, a.name), h('div.d', {}, a.d)));
    b.addEventListener('click', () => { chosen = a.lv; btns.forEach((x, i) => x.setAttribute('aria-pressed', String(i === chosen))); });
    return b;
  });
  const o = overlay(h('div.sheet.narrow', {},
    h('div.sheet-head', {}, h('div', {}, h('h2', {}, '乘组授权度'), h('p', {}, '这个设定会一直生效，直到任务结束。'))),
    h('div.autonomy', {}, btns),
    h('div.sheet-foot', {}, h('span.spacer'), confirm)));
  confirm.addEventListener('click', () => { o.remove(); onConfirm(chosen); });
}

// 指令上行：用“秒”演示“分钟”的光速延迟
export function uplink(area: HTMLElement, prompt: string, delayMin: number, onSend: () => void, onArrive: () => void): void {
  const btn = h('button.btn.primary.block', { type: 'button' }, svg(ICON.send), prompt) as HTMLButtonElement;
  clear(area).append(h('div.prompt', {}, svg(ICON.signal), '上行链路'), btn,
    h('div.hint', {}, `真实往返约 ${(delayMin * 2).toFixed(0)} 分钟；这里按 1 分钟 = 0.5 秒压缩演示。`));
  btn.addEventListener('click', () => {
    onSend();
    const fast = new URLSearchParams(location.search).has('fast');
    const total = fast ? 300 : delayMin * 1000; // 往返 2×delay 分钟 × 0.5 秒/分钟
    const count = h('div.count', {}, 'T+0.0 分钟');
    const dot = h('i');
    const label = h('div.hint', {}, '指令飞向火星……');
    clear(area).append(h('div.uplink', {}, count, h('div.track', {}, dot), h('div.ends', {}, h('span', {}, '地球 · 北京'), h('span', {}, '火星 · 中继星「烽燧」')), label));
    const t0 = performance.now();
    const tick = (t: number) => {
      const e = Math.min(total, t - t0);
      const half = e < total / 2;
      const f = half ? e / (total / 2) : 1 - (e - total / 2) / (total / 2);
      dot.style.left = `calc(${f * 100}% - ${f * 18}px)`;
      count.textContent = `T+${((e / 1000) * 2).toFixed(1)} 分钟`;
      label.textContent = half ? '指令飞向火星……' : '回执正在返回地球……';
      if (e < total) requestAnimationFrame(tick); else onArrive();
    };
    requestAnimationFrame(tick);
  });
}
