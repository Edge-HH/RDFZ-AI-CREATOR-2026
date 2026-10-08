import type { SceneCue } from '../core/content';
import { isSolarConjunction, lightDelayMinutes } from '../core/orbit';
import type { MissionState } from '../core/types';
import { sceneKind } from '../render/scenes/common';
import { append, clear, h } from './dom';
import { mmss } from './dialogue';

// 机位编号按场景类型固定（子项目 B 新增场景类型时在此补充）
const CAM: Record<ReturnType<typeof sceneKind>, string> = { globe: '01', orbit: '02', ship: '03', edl: '04', surface: '05', earth: '06' };

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// 3D 画面外的取景框：角标、机位读数、时间码、扫描线与“信号重建”转场
export class SceneFrame {
  readonly el: HTMLElement;
  private cam: HTMLElement;
  private tc: HTMLElement;
  private glitchEl: HTMLElement;
  private kind: string | null = null;
  private state: MissionState | null = null;

  constructor() {
    this.cam = h('div.frame-cam', { 'aria-live': 'polite' });
    this.tc = h('div.frame-tc', { 'aria-hidden': 'true' });
    this.glitchEl = h('div.fx-glitch', { 'aria-hidden': 'true' },
      [12, 31, 47, 66, 83].map((top, i) => h('i', { style: `top:${top}%;height:${[3, 7, 2, 5, 4][i]}%` })));
    this.el = h('div.scene-fx', {},
      h('div.scanlines', { 'aria-hidden': 'true' }), h('div.fx-vignette', { 'aria-hidden': 'true' }), this.glitchEl,
      h('span.fx-corner.tl'), h('span.fx-corner.tr'), h('span.fx-corner.bl'), h('span.fx-corner.br'), h('span.fx-cross'),
      this.cam, this.tc);
    setInterval(() => this.tick(), 1000);
  }

  setScene(cue: SceneCue, caption: string, segment?: string): void {
    const kind = sceneKind(cue);
    if (this.kind !== null && kind !== this.kind) this.glitch();
    this.kind = kind;
    append(clear(this.cam), [`CAM-${CAM[kind]} / 祝融一号`, h('b', {}, caption), segment ? h('span.seg', {}, `▸ ${segment}`) : null]);
  }

  update(s: MissionState): void {
    this.state = s;
    this.tick();
  }

  glitch(): void {
    if (reducedMotion()) return;
    this.glitchEl.classList.remove('run');
    void this.glitchEl.offsetWidth;
    this.glitchEl.classList.add('run');
  }

  private tick(): void {
    const s = this.state;
    if (!s) { this.tc.textContent = ''; return; }
    const delay = lightDelayMinutes(s.day);
    const conj = isSolarConjunction(s.day);
    // 时间码：秒数在延迟值附近循环走动，只作示意
    const wobble = ((Date.now() / 1000) % 60) / 60 / 60;
    const day = s.day < 0 ? `T${s.day}` : `D+${s.day}`;
    const bars = conj ? 0 : Math.max(1, 5 - Math.floor(delay / 5));
    clear(this.tc).append(
      `任务日 ${day}`, h('br'),
      delay > 0.2 ? `火星时间 T−${mmss(delay + wobble)}` : '地面时间 · 实时', h('br'),
      conj ? h('span.sig.lost', {}, 'SIG LOST') : h('span.sig', {}, `SIG ${'▮'.repeat(bars)}${'▯'.repeat(5 - bars)}`));
  }
}
