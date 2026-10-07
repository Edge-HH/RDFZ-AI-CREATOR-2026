import type { SceneCue } from '../core/content';
import { Game, type ChooseResult, type Input, type View } from '../core/flow';
import { isSolarConjunction, lightDelayMinutes, earthMarsDelayMinutes, phaseOf } from '../core/orbit';
import type { Mode } from '../core/types';
import { CHAPTERS } from '../content';
import { setAmbience, sfx } from '../audio/synth';
import { stopVoice } from '../audio/voice';
import type { Stage } from '../render/stage';
import { Comms } from './comms';
import { choiceOptions, openAutonomy, openLoadout, openPresets, openSite, uplink } from './decisions';
import { clear, h, ICON, svg } from './dom';
import { Hud } from './hud';
import { archiveScreen, chapterCard, chapterEnd, discoveryCard, endingScreen, repoLink, rulesScreen, settingsScreen, titleScreen, toast } from './screens';
import { archiveById } from '../content/archive';
import { load, loadSettings, remove, save, saveSettings, type Settings } from './store';

const CAPTIONS: Record<SceneCue, string> = {
  control: '北京航天飞控中心 · 主控大厅',
  orbit: '太阳系 · 地火转移轨道（圆轨道近似，按真实周期推演）',
  launch: '文昌航天发射场',
  cruise: '祝融一号 · 地火转移轨道',
  spe: '太阳粒子事件 · 高能质子流',
  edl: '进入、下降与着陆 · 延迟回放',
  landing: '火星表面 · 着陆点',
  surface: '火星表面 · 燧火基地',
  storm: '全球沙尘暴 · 光学厚度 τ≈9',
  conjunction: '日凌 · 太阳位于地球与火星之间',
  ascent: '火星上升器 · 返程窗口',
  home: '地球 · 南海预定溅落区',
};

const AMBIENCE: Partial<Record<SceneCue, 'control' | 'cabin' | 'wind' | 'storm'>> = {
  control: 'control', orbit: 'control', launch: 'wind', cruise: 'cabin', spe: 'cabin', edl: 'cabin', landing: 'wind',
  surface: 'wind', storm: 'storm', conjunction: 'control', ascent: 'wind', home: 'control',
};

export class App {
  private game!: Game;
  private settings: Settings = { ...loadSettings(), ...(new URLSearchParams(location.search).has('fast') ? { speed: 'instant' as const, voice: false } : {}) };
  private hud: Hud;
  private comms: Comms;
  private area: HTMLElement;
  private chapterLabel: HTMLElement;
  private delayChip: HTMLElement;
  private caption: HTMLElement;
  private liveDot: HTMLElement;
  private chapterShown = -1;
  private chapterStartHist = 0;
  private advance: (() => void) | null = null;
  private running = 0;
  private seenArchive = new Set<string>();

  constructor(root: HTMLElement, private stage: Stage) {
    this.chapterLabel = h('div.chapter', {}, '');
    this.delayChip = h('span.chip.delay', {}, svg(ICON.signal), h('strong.num', {}, '—'));
    this.liveDot = h('span.live');
    const muteBtn = h('button.icon-btn', { type: 'button', 'aria-label': '音效开关', title: '音效开关' }, svg(this.settings.sfx ? ICON.sound : ICON.mute));
    muteBtn.addEventListener('click', () => {
      this.applySettings({ ...this.settings, sfx: !this.settings.sfx, voice: !this.settings.sfx });
      clear(muteBtn).append(svg(this.settings.sfx ? ICON.sound : ICON.mute));
    });
    const topbar = h('header.topbar', {},
      h('div.brand', {}, '光速之隔', h('small', {}, '燧火计划 · 祝融一号')),
      this.chapterLabel,
      h('span.spacer'),
      h('div.chips', {}, this.delayChip),
      h('button.icon-btn', { type: 'button', 'aria-label': '知识档案集', title: '知识档案集', onclick: () => archiveScreen(this.unlocked(), () => {}) }, svg(ICON.book)),
      repoLink('icon-btn', false),
      h('button.icon-btn', { type: 'button', 'aria-label': '玩法与依据', title: '玩法与依据', onclick: () => rulesScreen(() => {}) }, svg(ICON.info)),
      muteBtn,
      h('button.icon-btn', { type: 'button', 'aria-label': '设置', title: '设置', onclick: () => settingsScreen(this.settings, (s) => this.applySettings(s), () => {}) }, svg(ICON.gear)));
    const hudEl = h('aside.hud', { 'aria-label': '任务遥测' });
    this.caption = h('div.scene-caption', { 'aria-live': 'polite' });
    const feed = h('div.feed', { role: 'log', 'aria-live': 'polite', 'aria-label': '通信频道' });
    this.area = h('div.action-area');
    const comms = h('section.comms', { 'aria-label': '通信频道' },
      h('div.comms-head', {}, this.liveDot, '通信频道', h('span.spacer', { style: 'flex:1' }), h('span.hint', {}, '点击或按空格加速')),
      feed, this.area);
    root.append(h('main.layout', {}, topbar, hudEl, h('div.stage-col', {}, this.caption), comms));
    this.hud = new Hud(hudEl);
    this.comms = new Comms(feed, () => this.settings);
    new MutationObserver(() => this.comms.follow()).observe(this.area, { childList: true, subtree: true });
    document.addEventListener('keydown', (e) => this.onKey(e));
  }

  private unlocked(): Set<string> {
    return new Set(load<string[]>('archive', []));
  }

  private applySettings(s: Settings): void {
    const qualityChanged = s.quality !== this.settings.quality;
    this.settings = s;
    saveSettings(s);
    if (qualityChanged) {
      // 已降级为 2D 时无法就地重建 3D，提示刷新
      if (this.stage.tier === 'off' && s.quality !== 'off') toast('刷新页面后启用 3D 画面（进度已自动保存）');
      else this.stage.setQuality(s.quality);
    }
    if (!s.sfx) setAmbience('none', s);
    if (!s.voice) stopVoice();
  }

  private onKey(e: KeyboardEvent): void {
    if (document.querySelector('.overlay, .title-screen')) return;
    if (e.key === ' ' || e.key === 'Enter') {
      if ((e.target as HTMLElement)?.tagName === 'BUTTON' && e.key === 'Enter') return;
      e.preventDefault();
      if (this.advance) this.advance(); else this.comms.skip();
    }
    if (/^[1-4]$/.test(e.key)) {
      const opts = this.area.querySelectorAll<HTMLButtonElement>('button.opt:not(:disabled)');
      opts[Number(e.key) - 1]?.click();
    }
  }

  showTitle(): void {
    setAmbience('control', this.settings);
    this.stage.setScene('control', null);
    document.querySelectorAll('.title-screen, .overlay').forEach((el) => el.remove());
    const saved = load<string | null>('save', null);
    titleScreen({
      hasSave: !!saved,
      onNew: (mode) => this.newGame(mode),
      onContinue: () => this.continueGame(load<string | null>('save', null) ?? ''),
      onArchive: () => archiveScreen(this.unlocked(), () => {}),
      onRules: () => rulesScreen(() => {}),
      onSettings: () => settingsScreen(this.settings, (s) => this.applySettings(s), () => {}),
    });
  }

  private clearScreens(): void {
    document.querySelectorAll('.title-screen, .overlay').forEach((el) => el.remove());
  }

  // 新解锁的知识：逐张弹出，并立即写入跨局的知识档案集
  private async showDiscoveries(): Promise<void> {
    const fresh = this.game.state.archive.filter((id) => !this.seenArchive.has(id));
    if (!fresh.length) return;
    for (const id of fresh) this.seenArchive.add(id);
    save('archive', [...new Set([...this.unlocked(), ...fresh])]);
    const cards = fresh.map((id) => archiveById(id)).filter((a) => !!a);
    for (let i = 0; i < cards.length; i++) {
      sfx('chapter', this.settings);
      await new Promise<void>((r) => discoveryCard(cards[i]!, i + 1, cards.length, r));
    }
  }

  private newGame(mode: Mode): void {
    this.clearScreens();
    this.seenArchive = new Set();
    const fixed = Number(new URLSearchParams(location.search).get('seed'));
    const seed = Number.isFinite(fixed) && fixed > 0 ? fixed : Math.floor(Math.random() * 1e9);
    this.game = new Game(CHAPTERS, seed, mode);
    this.chapterShown = -1;
    this.chapterStartHist = 0;
    clear(this.comms.feed);
    void this.loop();
  }

  private continueGame(json: string): void {
    this.clearScreens();
    try {
      this.game = Game.restore(CHAPTERS, json);
    } catch {
      remove('save');
      toast('存档无法读取，已开始新任务');
      return this.newGame('standard');
    }
    this.chapterShown = this.game.chapterIdx;
    this.chapterStartHist = this.game.state.history.length;
    this.seenArchive = new Set(this.game.state.archive);
    clear(this.comms.feed);
    this.comms.divider('从存档恢复');
    void this.loop();
  }

  private waitContinue(label = '继续'): Promise<void> {
    return new Promise((resolve) => {
      const btn = h('button.btn.primary.block', { type: 'button' }, svg(ICON.next), label);
      const done = () => { this.advance = null; clear(this.area); resolve(); };
      btn.addEventListener('click', done);
      this.advance = done;
      clear(this.area).append(btn);
    });
  }

  private refresh(): void {
    const s = this.game.state;
    const conj = isSolarConjunction(s.day);
    const delay = phaseOf(s.day) === 'earth' ? earthMarsDelayMinutes(s.day) : lightDelayMinutes(s.day);
    this.delayChip.classList.toggle('blackout', conj);
    clear(this.delayChip).append(svg(ICON.signal), phaseOf(s.day) === 'earth' ? '地火延迟 ' : '单程延迟 ',
      h('strong.num', {}, conj ? '中断' : `${delay.toFixed(1)} 分`));
    this.liveDot.classList.toggle('off', conj);
    this.hud.render(s);
    this.stage.update(s);
  }

  private async loop(): Promise<void> {
    const token = ++this.running;
    while (token === this.running) {
      const v = this.game.view();
      save('save', this.game.serialize());
      if (v.stage === 'ending') { await this.showDiscoveries(); return this.finish(); }
      if (v.stage === 'chapterEnd') {
        this.refresh();
        await this.showDiscoveries();
        const decisions = this.game.state.history.slice(this.chapterStartHist);
        await new Promise<void>((r) => chapterEnd(v.chapter, this.game.state.history[this.chapterStartHist - 1], this.game.state, decisions, r));
        this.game.next();
        continue;
      }
      if (v.chapter.id !== this.chapterShown) {
        this.chapterShown = v.chapter.id;
        this.chapterStartHist = this.game.state.history.length;
        this.chapterLabel.textContent = v.chapter.title;
        sfx('chapter', this.settings);
        this.stage.setScene(v.beat.scene ?? v.chapter.scene ?? 'control', this.game.state);
        this.refresh();
        await new Promise<void>((r) => chapterCard(v.chapter, r));
        this.comms.divider(v.chapter.title);
      }
      await this.playBeat(v);
    }
  }

  private async playBeat(v: View): Promise<void> {
    const cue = v.beat.scene ?? v.chapter.scene ?? 'control';
    this.stage.setScene(cue, this.game.state);
    setAmbience(AMBIENCE[cue] ?? 'none', this.settings);
    this.caption.innerHTML = '';
    this.caption.append(h('b', {}, CAPTIONS[cue]), v.beat.title ? ` · ${v.beat.title}` : '');
    this.refresh();
    if (v.beat.title) this.comms.divider(v.beat.title);
    await this.comms.play(v.lines, this.game.state);

    const d = v.beat.decision;
    if (!d) {
      await this.waitContinue();
      this.game.next();
      this.refresh();
      await this.showDiscoveries();
      return;
    }
    const input = await this.decide(v);
    sfx('confirm', this.settings);
    const res: ChooseResult = this.game.choose(input);
    this.comms.you(this.describeInput(input, res.label), this.game.state);
    this.refresh();
    await this.comms.play(res.lines, this.game.state);
    await this.showDiscoveries();
    if (this.game.view().stage === 'beat' || res.lines.length) await this.waitContinue();
    this.refresh();
  }

  private describeInput(input: Input, label: string): string {
    switch (input.kind) {
      case 'loadout': return `配载清单已上传（${input.modules.length} 个模块）。`;
      case 'site': return `着陆点确认。`;
      case 'presets': return `预案已写入：${input.ids.length} 条。`;
      case 'autonomy': return `授权度设定为 ${input.level}。`;
      case 'command': return '自检指令已发送。';
      default: return label;
    }
  }

  private decide(v: View): Promise<Input> {
    const d = v.beat.decision!;
    return new Promise((resolve) => {
      const done = (input: Input) => { clear(this.area); resolve(input); };
      const openBtn = (label: string, open: () => void) => {
        const b = h('button.btn.primary.block', { type: 'button' }, svg(ICON.cube), label);
        b.addEventListener('click', open);
        clear(this.area).append(b);
        open();
      };
      switch (d.kind) {
        case 'choice':
          choiceOptions(this.area, d.prompt, v.options!, (id) => { sfx('select', this.settings); done({ kind: 'choice', optionId: id }); });
          break;
        case 'loadout':
          openBtn('打开配载清单', () => openLoadout(this.game.state, (modules) => done({ kind: 'loadout', modules })));
          break;
        case 'site':
          openBtn('打开着陆点对比', () => openSite((site) => done({ kind: 'site', site }), (id) => this.stage.previewSite(id)));
          break;
        case 'presets':
          openBtn('打开预案卡', () => openPresets(d, (ids) => done({ kind: 'presets', ids })));
          break;
        case 'autonomy':
          openBtn('设定授权度', () => openAutonomy(this.game.state.autonomy, (level) => done({ kind: 'autonomy', level })));
          break;
        case 'command': {
          const delay = earthMarsDelayMinutes(this.game.state.day);
          uplink(this.area, d.prompt, delay, () => sfx('uplink', this.settings), () => { sfx('downlink', this.settings); done({ kind: 'command' }); });
          break;
        }
      }
    });
  }

  private finish(): void {
    const s = this.game.state;
    const before = new Set(load<string[]>('endingArchiveBase', []));
    save('archive', [...new Set([...this.unlocked(), ...s.archive])]);
    save('endingArchiveBase', [...new Set([...before, ...s.archive])]);
    remove('save');
    const endings = new Set(load<string[]>('endings', []));
    endings.add(this.game.ending!);
    save('endings', [...endings]);
    this.refresh();
    this.stage.setScene(this.game.ending === 'silent' ? 'surface' : 'home', s);
    endingScreen(s, this.game.ending!, s.archive.filter((a) => !before.has(a)),
      () => this.newGame(s.mode), () => this.showTitle());
  }
}
