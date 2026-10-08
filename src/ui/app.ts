import type { SceneCue } from '../core/content';
import { Game, type ChooseResult, type Input, type View } from '../core/flow';
import { earthMarsDelayMinutes } from '../core/orbit';
import type { Mode } from '../core/types';
import { CHAPTERS } from '../content';
import { setAmbience, sfx } from '../audio/synth';
import { stopVoice } from '../audio/voice';
import type { Stage } from '../render/stage';
import { Backlog } from './backlog';
import { choiceOptions, openAutonomy, openLoadout, openPresets, openSite, uplink } from './decisions';
import { Dialogue } from './dialogue';
import { clear, h, ICON, svg } from './dom';
import { SceneFrame } from './frame';
import { Drawer } from './hud';
import { StatusBar } from './statusbar';
import { archiveScreen, chapterCard, chapterEnd, discoveryCard, endingScreen, rulesScreen, settingsScreen, titleScreen, toast } from './screens';
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
  private layout: HTMLElement;
  private bar: StatusBar;
  private drawer: Drawer;
  private frame: SceneFrame;
  private dialogue: Dialogue;
  private backlog = new Backlog();
  private choices: HTMLElement;
  private chapterShown = -1;
  private chapterStartHist = 0;
  private running = 0;
  private seenArchive = new Set<string>();

  constructor(root: HTMLElement, private stage: Stage) {
    this.frame = new SceneFrame();
    this.drawer = new Drawer();
    this.bar = new StatusBar({
      sfxOn: this.settings.sfx,
      onDrawer: () => this.drawer.toggle(),
      onArchive: () => archiveScreen(this.unlocked(), () => {}),
      onRules: () => rulesScreen(() => {}),
      onSettings: () => settingsScreen(this.settings, (s) => this.applySettings(s), () => {}),
      onMute: () => { this.applySettings({ ...this.settings, sfx: !this.settings.sfx }); return this.settings.sfx; },
    });
    this.dialogue = new Dialogue(() => this.settings, this.backlog, (on) => this.applySettings({ ...this.settings, auto: on }), () => this.backlog.open());
    this.choices = h('div.choices', { role: 'group', 'aria-label': '可选指令' });
    this.layout = h('main.layout.off', {}, this.bar.el, this.choices, this.dialogue.el);
    root.append(this.frame.el, this.layout, this.drawer.scrim, this.drawer.el);
    // 状态条与对话框的实际高度写入 CSS 变量，供取景框、选项面板定位
    const setVar = (name: string, el: HTMLElement) => new ResizeObserver(() => document.documentElement.style.setProperty(name, `${Math.round(el.getBoundingClientRect().height)}px`)).observe(el);
    setVar('--top-h', this.bar.el);
    setVar('--dlg-h', this.dialogue.el);
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
    if (!s.voice || !s.sfx) stopVoice();
    this.dialogue?.syncAuto();
  }

  private onKey(e: KeyboardEvent): void {
    const t = e.target as HTMLElement | null;
    if (t?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
    if (e.key === 'Escape') {
      if (this.drawer.isOpen) { e.preventDefault(); this.drawer.close(); }
      this.bar.closeMenu();
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (document.querySelector('.overlay, .title-screen')) return;
    const k = e.key.toLowerCase();
    if (k === 't') { e.preventDefault(); this.drawer.toggle(); return; }
    if (this.drawer.isOpen || this.bar.menuOpen) return;
    if (e.key === ' ' || e.key === 'Enter') {
      if (e.key === 'Enter' && (t?.tagName === 'BUTTON' || t?.tagName === 'A')) return;
      e.preventDefault();
      this.dialogue.advance();
      return;
    }
    if (/^[1-9]$/.test(e.key)) {
      const opt = this.choices.querySelectorAll<HTMLButtonElement>('button.opt')[Number(e.key) - 1];
      if (opt && !opt.disabled) opt.click();
      return;
    }
    if (k === 'a') this.dialogue.toggleAuto();
    else if (k === 'l') this.backlog.open();
  }

  showTitle(): void {
    setAmbience('control', this.settings);
    this.stage.setScene('control', null);
    this.frame.setScene('control', CAPTIONS.control);
    this.layout.classList.add('off');
    this.frame.el.classList.add('off');
    this.drawer.close();
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

  private resetShell(): void {
    this.clearScreens();
    this.layout.classList.remove('off');
    this.frame.el.classList.remove('off');
    this.backlog.clear();
    this.dialogue.reset();
    clear(this.choices);
    this.bar.reset();
    this.drawer.reset();
    this.drawer.close();
  }

  // 新解锁的知识：逐张弹出，并立即写入跨局的知识档案集
  private async showDiscoveries(): Promise<void> {
    const fresh = this.game.state.archive.filter((id) => !this.seenArchive.has(id));
    if (!fresh.length) return;
    for (const id of fresh) this.seenArchive.add(id);
    save('archive', [...new Set([...this.unlocked(), ...fresh])]);
    const cards = fresh.map((id) => archiveById(id)).filter((a) => !!a);
    this.dialogue.settle();
    for (let i = 0; i < cards.length; i++) {
      sfx('chapter', this.settings);
      await new Promise<void>((r) => discoveryCard(cards[i]!, i + 1, cards.length, r));
    }
  }

  private newGame(mode: Mode): void {
    this.resetShell();
    this.seenArchive = new Set();
    const fixed = Number(new URLSearchParams(location.search).get('seed'));
    const seed = Number.isFinite(fixed) && fixed > 0 ? fixed : Math.floor(Math.random() * 1e9);
    this.game = new Game(CHAPTERS, seed, mode);
    this.chapterShown = -1;
    this.chapterStartHist = 0;
    void this.loop();
  }

  private continueGame(json: string): void {
    this.resetShell();
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
    this.bar.setChapter(this.game.view().chapter.title);
    this.dialogue.divider('从存档恢复');
    void this.loop();
  }

  private refresh(): void {
    const s = this.game.state;
    this.bar.render(s);
    this.drawer.render(s);
    this.frame.update(s);
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
        this.dialogue.settle();
        const decisions = this.game.state.history.slice(this.chapterStartHist);
        await new Promise<void>((r) => chapterEnd(v.chapter, this.game.state.history[this.chapterStartHist - 1], this.game.state, decisions, r));
        this.game.next();
        continue;
      }
      if (v.chapter.id !== this.chapterShown) {
        this.chapterShown = v.chapter.id;
        this.chapterStartHist = this.game.state.history.length;
        this.bar.setChapter(v.chapter.title);
        sfx('chapter', this.settings);
        const cue = v.beat.scene ?? v.chapter.scene ?? 'control';
        this.stage.setScene(cue, this.game.state);
        this.frame.setScene(cue, CAPTIONS[cue]);
        this.refresh();
        this.dialogue.settle();
        await new Promise<void>((r) => chapterCard(v.chapter, r));
        this.dialogue.divider(v.chapter.title);
      }
      await this.playBeat(v);
    }
  }

  private async playBeat(v: View): Promise<void> {
    const cue = v.beat.scene ?? v.chapter.scene ?? 'control';
    this.stage.setScene(cue, this.game.state, v.beat.id);
    setAmbience(AMBIENCE[cue] ?? 'none', this.settings);
    this.frame.setScene(cue, CAPTIONS[cue], v.beat.title);
    this.refresh();
    if (v.beat.title) this.dialogue.divider(v.beat.title);
    await this.dialogue.play(v.lines, this.game.state);

    const d = v.beat.decision;
    if (!d) {
      await this.dialogue.waitContinue();
      this.game.next();
      this.refresh();
      await this.showDiscoveries();
      return;
    }
    const input = await this.decide(v);
    sfx('confirm', this.settings);
    const res: ChooseResult = this.game.choose(input);
    this.refresh();
    await this.dialogue.you(this.describeInput(input, res.label), this.game.state);
    await this.dialogue.play(res.lines, this.game.state);
    if (this.game.view().stage === 'beat' || res.lines.length) await this.dialogue.waitContinue();
    await this.showDiscoveries();
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
      const done = (input: Input) => { clear(this.choices); resolve(input); };
      const openBtn = (label: string, open: () => void) => {
        const b = h('button.btn.primary.block', { type: 'button' }, svg(ICON.cube), label);
        b.addEventListener('click', open);
        clear(this.choices).append(b);
        open();
      };
      const ask = (text: string, then: () => void) => void this.dialogue.prompt(text).then(then);
      switch (d.kind) {
        case 'choice':
          ask(d.prompt, () => choiceOptions(this.choices, v.options!, (id) => { sfx('select', this.settings); done({ kind: 'choice', optionId: id }); }));
          break;
        case 'loadout':
          ask(d.prompt ?? '配载清单已就绪，等待你的确认。', () => openBtn('打开配载清单', () => openLoadout(this.game.state, (modules) => done({ kind: 'loadout', modules }))));
          break;
        case 'site':
          ask(d.prompt ?? '三个候选着陆点，等待你的选择。', () => openBtn('打开着陆点对比', () => openSite((site) => done({ kind: 'site', site }), (id) => this.stage.previewSite(id))));
          break;
        case 'presets':
          ask(d.prompt, () => openBtn('打开预案卡', () => openPresets(d, (ids) => done({ kind: 'presets', ids }))));
          break;
        case 'autonomy':
          ask(d.prompt, () => openBtn('设定授权度', () => openAutonomy(this.game.state.autonomy, (level) => done({ kind: 'autonomy', level }))));
          break;
        case 'command': {
          const delay = earthMarsDelayMinutes(this.game.state.day);
          ask(d.prompt, () => uplink(this.choices, d.prompt, delay, (el) => this.dialogue.showWidget(el),
            () => sfx('uplink', this.settings), () => { sfx('downlink', this.settings); done({ kind: 'command' }); }));
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
    this.dialogue.settle();
    clear(this.choices);
    const cue: SceneCue = this.game.ending === 'silent' ? 'surface' : 'home';
    this.stage.setScene(cue, s);
    this.frame.setScene(cue, CAPTIONS[cue]);
    endingScreen(s, this.game.ending!, s.archive.filter((a) => !before.has(a)),
      () => this.newGame(s.mode), () => this.showTitle());
  }
}
