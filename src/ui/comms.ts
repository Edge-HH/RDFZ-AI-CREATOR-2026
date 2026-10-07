import type { Line } from '../core/content';
import { isSolarConjunction, lightDelayMinutes } from '../core/orbit';
import type { MissionState } from '../core/types';
import { CAST } from '../content/cast';
import { h } from './dom';
import { portrait } from './portraits';
import type { Settings } from './store';
import { playVoice, stopVoice } from '../audio/voice';
import { sfx } from '../audio/synth';

const SPEED = { slow: 0.6, normal: 1, fast: 2.2, instant: 1000 } as const;

const mmss = (min: number) => {
  const m = Math.floor(min);
  const s = Math.round((min - m) * 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

export class Comms {
  private skipping = false;
  private wake: (() => void) | null = null;

  constructor(public feed: HTMLElement, private settings: () => Settings) {
    feed.addEventListener('click', () => this.skip());
  }

  skip(): void {
    this.skipping = true;
    stopVoice();
    this.wake?.();
  }

  private wait(ms: number): Promise<void> {
    if (this.skipping) return Promise.resolve();
    return new Promise((resolve) => {
      const t = setTimeout(done, ms);
      function done() { clearTimeout(t); resolve(); }
      this.wake = done;
    });
  }

  divider(text: string): void {
    this.feed.append(h('div.msg.divider', {}, `— ${text} —`));
    this.scroll();
  }

  you(text: string, s: MissionState): void {
    const delay = lightDelayMinutes(s.day);
    const meta = delay > 0.2 ? `上行 · 约 ${mmss(delay)} 后抵达火星` : '地面';
    this.feed.append(h('div.msg.you', {}, portrait('you'), h('div.body', {},
      h('div.meta', {}, h('b', {}, '你 · 飞控总师'), h('span', {}, meta)),
      h('div.text', {}, text))));
    this.scroll();
  }

  async play(lines: Line[], s: MissionState): Promise<void> {
    this.skipping = false;
    const speed = SPEED[this.settings().speed];
    const delay = lightDelayMinutes(s.day);
    for (const line of lines) {
      if (!line.text) continue;
      const cast = CAST[line.speaker];
      const typing = line.speaker !== 'sys'
        ? h('div.msg', {}, portrait(line.speaker), h('div.body', {}, h('div.meta', {}, h('b', {}, cast.name)), h('span.typing', {}, h('i'), h('i'), h('i'))))
        : null;
      if (typing) { this.feed.append(typing); this.scroll(); }
      await this.wait((350 + line.text.length * 22) / speed);
      typing?.remove();
      this.feed.append(this.render(line, delay, s));
      this.scroll();
      if (line.speaker === 'sys' && line.tone === 'alert') sfx('alert', this.settings());
      else sfx('blip', this.settings());
      const voiced = line.voice && this.settings().voice && !this.skipping ? playVoice(line.voice) : null;
      if (voiced) await Promise.race([voiced, this.wait(15000)]);
      else await this.wait(260 / speed);
    }
    this.skipping = false;
  }

  private render(line: Line, delay: number, s: MissionState): HTMLElement {
    const cast = CAST[line.speaker];
    if (line.speaker === 'sys') {
      return h('div.msg.sys', { class: line.tone ?? '' }, h('div.text', {}, line.text));
    }
    let ts = '地面';
    if (cast.onMars && delay > 0.2) ts = isSolarConjunction(s.day) ? '日凌 · 延迟记录' : `火星时间 T−${mmss(delay)}`;
    else if (cast.onMars) ts = '实时';
    return h('div.msg', { class: line.tone ? `tone-${line.tone}` : '' },
      portrait(line.speaker),
      h('div.body', {},
        h('div.meta', {}, h('b', {}, cast.name), h('span', {}, cast.callsign), h('span.ts', {}, ts),
          line.voice && this.settings().voice ? h('span.wave', { 'aria-hidden': 'true' }, h('i'), h('i', { style: 'animation-delay:.2s' }), h('i', { style: 'animation-delay:.4s' })) : null),
        h('div.text', {}, line.text)));
  }

  private scroll(): void {
    this.feed.scrollTop = this.feed.scrollHeight;
  }
}
