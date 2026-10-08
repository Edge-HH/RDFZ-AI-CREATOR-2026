import type { Line, Speaker } from '../core/content';
import { isSolarConjunction, lightDelayMinutes } from '../core/orbit';
import type { MissionState } from '../core/types';
import { CAST } from '../content/cast';
import { playVoice, stopVoice } from '../audio/voice';
import { sfx } from '../audio/synth';
import type { Backlog } from './backlog';
import { append, clear, h, ICON, svg } from './dom';
import { portraitUrl } from './portraits';
import type { Settings } from './store';

const SPEED = { slow: 0.6, normal: 1, fast: 2.2, instant: 1000 } as const;
const CPS = 40; // 正常速度下每秒打出的字数

export const mmss = (min: number) => {
  const m = Math.floor(min);
  const s = Math.round((min - m) * 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// 当前句的状态：闸门模型要求上一句“已确认”后才显示下一句
type Phase = 'none' | 'typing' | 'shown' | 'acked';
type Kind = 'line' | 'sys' | 'you' | 'prompt';

interface Show {
  kind: Kind;
  text: string;
  face: Speaker | 'sys' | 'prompt';
  name: string;
  callsign?: string;
  role?: string;
  ts?: string;
  lag?: boolean;
  tone?: string;
  alert?: boolean;
  recv?: string; // 火星来信：先显示“接收中”
  uplink?: boolean;
}

export class Dialogue {
  readonly el: HTMLElement;
  private face: HTMLElement;
  private meta: HTMLElement;
  private textEl: HTMLElement;
  private typed: Text;
  private caret: HTMLElement;
  private widget: HTMLElement;
  private live: HTMLElement;
  private next: HTMLElement;
  private autoBtn: HTMLElement;
  private phase: Phase = 'none';
  private finishReveal: (() => void) | null = null;
  private ackWaiter: (() => void) | null = null;
  private autoTimer = 0;
  private voiceP: Promise<void> | null = null;
  private readMs = 0;

  constructor(private settings: () => Settings, private backlog: Backlog, private onAuto: (on: boolean) => void, onLog: () => void) {
    this.face = h('div.dlg-face');
    this.typed = document.createTextNode('');
    this.caret = h('span.caret', { 'aria-hidden': 'true' });
    this.textEl = h('div.text', { 'aria-hidden': 'true' }, this.typed);
    this.widget = h('div.dlg-widget', { hidden: true });
    this.live = h('div.sr-only', { 'aria-live': 'polite' });
    this.next = h('div.dlg-next');
    this.autoBtn = h('button.dlg-tool', { type: 'button', 'aria-pressed': String(settings().auto), title: '自动推进（A）' }, '自动', h('kbd', {}, 'A'));
    this.autoBtn.addEventListener('click', (e) => { e.stopPropagation(); this.toggleAuto(); });
    const logBtn = h('button.dlg-tool', { type: 'button', 'aria-label': '通信记录', title: '通信记录（L）' }, svg(ICON.book), '记录', h('kbd', {}, 'L'));
    logBtn.addEventListener('click', (e) => { e.stopPropagation(); onLog(); });
    this.meta = h('div.dlg-meta');
    this.el = h('section.dialogue.frame.active.idle', { 'aria-label': '通信对话框' },
      this.face,
      h('div.dlg-main', {}, h('div', { style: 'display:flex;gap:8px;align-items:flex-start' }, this.meta, h('span.spacer', { style: 'flex:1' }), h('div.dlg-tools', {}, logBtn, this.autoBtn)), this.textEl, this.widget),
      this.next, this.live);
    this.el.addEventListener('click', () => this.advance());
  }

  private get speed(): number { return SPEED[this.settings().speed]; }
  private get instant(): boolean { return this.settings().speed === 'instant'; }

  toggleAuto(): void {
    const on = !this.settings().auto;
    this.onAuto(on);
    this.syncAuto();
  }

  // 自动模式可能在设置页里被改动：同步按钮状态与计时
  syncAuto(): void {
    const on = this.settings().auto;
    this.autoBtn.setAttribute('aria-pressed', String(on));
    if (on && this.ackWaiter && !this.instant) this.armAuto();
    if (!on) clearTimeout(this.autoTimer);
  }

  // 点击、空格、回车：打字中则补全整句，已显示则确认
  advance(): void {
    if (this.phase === 'typing') { this.finishReveal?.(); return; }
    if (this.ackWaiter) { stopVoice(); this.ackWaiter(); }
  }

  reset(): void {
    clearTimeout(this.autoTimer);
    stopVoice();
    this.ackWaiter = null;
    this.finishReveal = null;
    this.phase = 'none';
    this.typed.data = '';
    this.caret.remove();
    this.showWidget(null);
    clear(this.next);
    clear(this.meta);
    clear(this.face);
    this.el.className = 'dialogue frame active idle';
  }

  divider(text: string): void {
    this.backlog.push({ kind: 'divider', text });
  }

  private armAuto(): void {
    clearTimeout(this.autoTimer);
    const done = () => this.ackWaiter?.();
    if (this.voiceP) void Promise.race([this.voiceP, new Promise((r) => setTimeout(r, 15000))]).then(() => { if (this.settings().auto) this.autoTimer = window.setTimeout(done, 400); });
    else this.autoTimer = window.setTimeout(done, Math.max(600, this.readMs));
  }

  // 等待玩家确认当前句；自动模式下按阅读时间放行，极速模式立即放行
  private waitAck(allowInstant = true): Promise<void> {
    return new Promise((resolve) => {
      const done = () => {
        clearTimeout(this.autoTimer);
        this.ackWaiter = null;
        this.phase = 'acked';
        this.el.classList.add('idle');
        clear(this.next);
        resolve();
      };
      if (allowInstant && this.instant) return done();
      this.ackWaiter = done;
      this.el.classList.remove('idle');
      if (this.settings().auto && !this.instant) this.armAuto();
    });
  }

  private async gate(): Promise<void> {
    if (this.phase !== 'shown') return;
    clear(this.next).append(h('span.tri', { 'aria-hidden': 'true' }, '▼'));
    await this.waitAck();
  }

  private renderMeta(o: Show): void {
    clear(this.face);
    this.face.className = 'dlg-face';
    if (o.face === 'sys') { this.face.classList.add('sys'); this.face.append(h('span.glyph', {}, '◆')); }
    else if (o.face === 'prompt') this.face.append(h('span.glyph', {}, '?'));
    else this.face.append(h('img', { src: portraitUrl(o.face), alt: '' }));
    this.face.append(h('div.wave', { 'aria-hidden': 'true' }, Array.from({ length: 6 }, () => h('i'))));
    append(clear(this.meta), [
      h('b', {}, o.name),
      o.callsign ? h('span.cs', {}, o.callsign) : null,
      o.role ? h('span.role', {}, o.role) : null,
      o.ts ? h('span.ts', { class: o.lag ? 'lag' : '' }, o.ts) : null]);
    this.el.className = `dialogue frame active kind-${o.kind}${o.tone ? ` tone-${o.tone}` : ''}`;
    if (o.alert) { void this.el.offsetWidth; this.el.classList.add('alert', 'alert-flash'); }
  }

  // 显示一句：可选“接收中”前奏，然后打字
  private async reveal(o: Show): Promise<void> {
    this.showWidget(null);
    clear(this.next);
    this.renderMeta(o);
    this.live.textContent = `${o.name}：${o.text}`;
    this.phase = 'typing';
    this.typed.data = '';
    this.caret.remove();
    const quick = this.instant || reducedMotion();
    this.readMs = (350 + o.text.length * 22) / this.speed;
    for (const n of [...this.textEl.childNodes]) if (n !== this.typed) n.remove();
    let skipped = false;
    if (o.recv && !quick) {
      const recv = h('div.dlg-recv', {}, h('span.bars', {}, h('i'), h('i'), h('i'), h('i')), o.recv);
      this.textEl.append(recv);
      await new Promise<void>((r) => {
        const t = setTimeout(r, 420);
        this.finishReveal = () => { clearTimeout(t); skipped = true; r(); };
      });
      recv.remove();
    }
    if (o.uplink && !quick) this.textEl.after(h('div.dlg-up', {}, h('i')));
    this.el.classList.add('speaking');
    if (quick || skipped) this.typed.data = o.text;
    else {
      this.textEl.append(this.caret);
      await new Promise<void>((resolve) => {
        const t0 = performance.now();
        let raf = 0;
        const finish = () => { cancelAnimationFrame(raf); this.typed.data = o.text; this.caret.remove(); resolve(); };
        const step = () => {
          const n = Math.min(o.text.length, Math.floor(((performance.now() - t0) / 1000) * CPS * this.speed) + 1);
          this.typed.data = o.text.slice(0, n);
          if (n >= o.text.length) finish(); else raf = requestAnimationFrame(step);
        };
        this.finishReveal = finish;
        raf = requestAnimationFrame(step);
      });
    }
    this.finishReveal = null;
    this.textEl.scrollTop = 0;
    if (!this.voiceP) this.el.classList.remove('speaking');
    document.querySelectorAll('.dlg-up').forEach((u) => setTimeout(() => u.remove(), 900));
    this.phase = 'shown';
  }

  async play(lines: Line[], s: MissionState): Promise<void> {
    const delay = lightDelayMinutes(s.day);
    const conj = isSolarConjunction(s.day);
    for (const line of lines) {
      if (!line.text) continue;
      await this.gate();
      const cast = CAST[line.speaker];
      let ts = '地面';
      let lag = false;
      if (cast.onMars && delay > 0.2) { ts = conj ? '日凌 · 延迟记录' : `火星时间 T−${mmss(delay)}`; lag = true; }
      else if (cast.onMars) ts = '实时';
      this.backlog.push({ kind: 'line', speaker: line.speaker, text: line.text, ts, tone: line.tone });
      const sys = line.speaker === 'sys';
      sfx(sys && line.tone === 'alert' ? 'alert' : 'blip', this.settings());
      this.voiceP = null;
      const voiced = line.voice && this.settings().voice && !this.instant ? playVoice(line.voice) : null;
      if (voiced) {
        this.voiceP = voiced;
        void voiced.then(() => { if (this.voiceP === voiced) { this.voiceP = null; if (this.phase !== 'typing') this.el.classList.remove('speaking'); } });
      }
      await this.reveal(sys
        ? { kind: 'sys', face: 'sys', name: '遥测', callsign: 'QC-01', text: line.text, tone: line.tone, alert: line.tone === 'alert' }
        : { kind: 'line', face: line.speaker, name: cast.name, callsign: cast.callsign, role: cast.role, ts, lag, tone: line.tone,
          text: line.text, recv: lag && !conj ? `接收中 · 信号经 ${delay.toFixed(1)} 分钟抵达` : undefined });
    }
  }

  async you(text: string, s: MissionState): Promise<void> {
    await this.gate();
    const delay = lightDelayMinutes(s.day);
    const ts = delay > 0.2 ? `上行 · 约 ${mmss(delay)} 后抵达火星` : '地面';
    this.backlog.push({ kind: 'you', text, ts });
    this.voiceP = null;
    await this.reveal({ kind: 'you', face: 'you', name: '你 · 飞控总师', ts, text, uplink: delay > 0.2 });
  }

  // 决策提问：选项出现后即视为已确认
  async prompt(text: string): Promise<void> {
    await this.gate();
    this.backlog.push({ kind: 'prompt', text });
    this.voiceP = null;
    await this.reveal({ kind: 'prompt', face: 'prompt', name: '决策', callsign: '等待你的指令', text });
    this.phase = 'acked';
    this.el.classList.add('idle');
  }

  // 弹出全屏覆盖层（章节结算、章节卡）前调用：当前句视为已读
  settle(): void {
    if (this.phase === 'shown' && !this.ackWaiter) { this.phase = 'acked'; clear(this.next); this.el.classList.add('idle'); }
  }

  waitContinue(label = '继续'): Promise<void> {
    const btn = h('button.btn.primary', { type: 'button' }, label, svg(ICON.next));
    btn.addEventListener('click', (e) => { e.stopPropagation(); stopVoice(); this.ackWaiter?.(); });
    if (this.phase === 'none') this.el.classList.remove('idle');
    clear(this.next).append(btn);
    this.phase = 'shown';
    return this.waitAck(false);
  }

  // 临时替换正文区域（上行链路动画），传 null 恢复
  showWidget(el: HTMLElement | null): void {
    clear(this.widget);
    this.widget.hidden = !el;
    this.textEl.hidden = !!el;
    if (el) this.widget.append(el);
  }
}
