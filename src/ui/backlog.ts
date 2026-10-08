import type { Speaker } from '../core/content';
import { CAST } from '../content/cast';
import { h, ICON, svg } from './dom';
import { portrait } from './portraits';

export type BacklogEntry =
  | { kind: 'divider'; text: string }
  | { kind: 'line'; speaker: Speaker; text: string; ts: string; tone?: string }
  | { kind: 'you'; text: string; ts: string }
  | { kind: 'prompt'; text: string };

// 通信记录：本局会话的全部消息，只保存在内存里
export class Backlog {
  private entries: BacklogEntry[] = [];

  push(e: BacklogEntry): void { this.entries.push(e); }
  clear(): void { this.entries = []; }
  get size(): number { return this.entries.length; }

  private render(e: BacklogEntry): HTMLElement {
    switch (e.kind) {
      case 'divider': return h('div.msg.divider', {}, e.text);
      case 'prompt': return h('div.msg.prompt', {}, portrait('you'), h('div.body', {},
        h('div.meta', {}, h('b', {}, '决策'), h('span', {}, '等待你的指令')), h('div.text', {}, e.text)));
      case 'you': return h('div.msg.you', {}, portrait('you'), h('div.body', {},
        h('div.meta', {}, h('b', {}, '你 · 飞控总师'), h('span.ts', {}, e.ts)), h('div.text', {}, e.text)));
      case 'line': {
        if (e.speaker === 'sys') return h('div.msg.sys', { class: e.tone ?? '' }, h('div.text', {}, `◆ ${e.text}`));
        const cast = CAST[e.speaker];
        return h('div.msg', { class: e.tone ? `tone-${e.tone}` : '' }, portrait(e.speaker), h('div.body', {},
          h('div.meta', {}, h('b', {}, cast.name), h('span', {}, cast.callsign), h('span.ts', {}, e.ts)),
          h('div.text', {}, e.text)));
      }
    }
  }

  open(): void {
    if (document.querySelector('.overlay.backlog')) return;
    const prev = document.activeElement as HTMLElement | null;
    const feed = h('div.feed', { role: 'log', 'aria-label': '通信记录' }, this.entries.map((e) => this.render(e)));
    const close = () => { o.remove(); document.removeEventListener('keydown', onKey, true); prev?.focus?.({ preventScroll: true }); };
    const onKey = (ev: KeyboardEvent) => { if (ev.key === 'Escape' || ev.key === 'l' || ev.key === 'L') { ev.preventDefault(); ev.stopPropagation(); close(); } };
    const closeBtn = h('button.btn.primary', { type: 'button', onclick: close }, '关闭');
    const sheet = h('div.sheet.narrow.frame.active.scan-in', {},
      h('div.sheet-head', {}, h('div', {}, h('span.code', {}, 'COMM LOG'), h('h2', {}, '通信记录'), h('p', {}, `本局共 ${this.entries.filter((e) => e.kind !== 'divider').length} 条消息 · 按 Esc 关闭`))),
      feed,
      h('div.sheet-foot', {}, h('span.hint', {}, svg(ICON.signal), ' 火星消息的时间戳为发出时刻，到达地面时已经过去了一个光速延迟。'), h('span.spacer'), closeBtn));
    const o = h('div.overlay.backlog', { role: 'dialog', 'aria-modal': 'true', 'aria-label': '通信记录' }, sheet);
    o.addEventListener('click', (ev) => { if (ev.target === o) close(); });
    document.body.append(o);
    document.addEventListener('keydown', onKey, true);
    closeBtn.focus({ preventScroll: true });
    sheet.scrollTop = sheet.scrollHeight;
  }
}
