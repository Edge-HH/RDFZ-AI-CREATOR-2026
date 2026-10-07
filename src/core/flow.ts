import { dyn, evalLines, type Beat, type Chapter, type Line, type Option } from './content';
import { applyEffect, applyEffects } from './effects';
import { determineEnding, terminalEnding, type EndingId } from './endings';
import { lightDelayMinutes } from './orbit';
import { riskWindow, rollRisk, type RiskWindow } from './risk';
import { applyLoadout, createState, snapshot } from './state';
import { passTime } from './time';
import type { MissionState, Mode, SiteId } from './types';

export type Stage = 'beat' | 'chapterEnd' | 'ending';

export type Input =
  | { kind: 'choice'; optionId: string }
  | { kind: 'loadout'; modules: string[] }
  | { kind: 'site'; site: SiteId }
  | { kind: 'presets'; ids: string[] }
  | { kind: 'autonomy'; level: number }
  | { kind: 'command' };

export interface OptionView {
  id: string;
  label: string;
  detail?: string;
  basis?: string;
  enabled: boolean;
  lockedReason?: string;
  risk?: RiskWindow & { label: string };
}

export interface View {
  stage: Stage;
  chapter: Chapter;
  beat: Beat;
  lines: Line[];
  options?: OptionView[];
  ending?: EndingId;
  delay: number;
}

export interface ChooseResult {
  label: string;
  lines: Line[];
  riskFailed?: boolean;
}

interface SaveData {
  v: 1;
  chapterIdx: number;
  beatIdx: number;
  stage: Stage;
  ending?: EndingId;
  state: MissionState;
}

export class Game {
  state: MissionState;
  chapterIdx = 0;
  beatIdx = 0;
  stage: Stage = 'beat';
  ending?: EndingId;

  constructor(private chapters: Chapter[], seed: number, mode: Mode = 'standard', skipInit = false) {
    this.state = createState(seed, mode);
    if (!skipInit) this.enterBeatFrom(0);
  }

  get chapter(): Chapter {
    return this.chapters[this.chapterIdx];
  }

  get beat(): Beat {
    return this.chapter.beats[this.beatIdx];
  }

  view(): View {
    const beat = this.beat;
    const d = beat.decision;
    return {
      stage: this.stage,
      chapter: this.chapter,
      beat,
      lines: this.stage === 'beat' ? evalLines(beat.lines, this.state) : [],
      options: this.stage === 'beat' && d?.kind === 'choice' ? d.options.map((o) => this.optionView(o)) : undefined,
      ending: this.ending,
      delay: lightDelayMinutes(this.state.day),
    };
  }

  private optionView(o: Option): OptionView {
    const enabled = !o.requires || o.requires(this.state);
    return {
      id: o.id,
      label: o.label,
      detail: dyn(o.detail, this.state),
      basis: o.basis,
      enabled,
      lockedReason: enabled ? undefined : o.lockedReason,
      risk: o.risk ? { ...riskWindow(this.state, o.risk), label: o.risk.label } : undefined,
    };
  }

  next(): void {
    if (this.stage === 'ending') return;
    if (this.stage === 'chapterEnd') {
      if (this.chapterIdx + 1 < this.chapters.length) {
        this.chapterIdx += 1;
        this.stage = 'beat';
        this.enterBeatFrom(0);
      } else {
        this.finish(determineEnding(this.state));
      }
      return;
    }
    if (this.beat.decision) throw new Error('当前节拍需要做出决策');
    this.finishBeat(this.beat.title ?? this.beat.id);
  }

  choose(input: Input): ChooseResult {
    if (this.stage !== 'beat') throw new Error('当前不在决策阶段');
    const d = this.beat.decision;
    if (!d || d.kind !== input.kind) throw new Error('决策类型不匹配');
    let s = this.state;
    let label = '';
    let lines: Line[] = [];
    let riskFailed: boolean | undefined;

    switch (input.kind) {
      case 'choice': {
        const o = (d as Extract<typeof d, { kind: 'choice' }>).options.find((x) => x.id === input.optionId);
        if (!o) throw new Error(`未知选项：${input.optionId}`);
        if (o.requires && !o.requires(s)) throw new Error('该选项当前不可用');
        label = o.label;
        s = applyEffects(s, [dyn(o.effect, s)]);
        lines = evalLines(o.lines, s);
        if (o.risk) {
          const r = rollRisk(s, o.risk);
          s = r.state;
          riskFailed = r.failed;
          if (r.failed) {
            s = applyEffect(s, dyn(o.risk.fail, s) ?? {});
            lines = [...lines, ...evalLines(o.risk.failLines, s)];
          } else {
            lines = [...lines, ...evalLines(o.risk.okLines, s)];
          }
        }
        break;
      }
      case 'loadout':
        s = applyLoadout(s, input.modules);
        label = '完成配载';
        break;
      case 'site':
        s = applyEffect(s, { site: input.site, archive: [`site_${input.site}`] });
        label = '选定着陆点';
        break;
      case 'presets': {
        const pd = d as Extract<typeof d, { kind: 'presets' }>;
        if (input.ids.length !== pd.pick || input.ids.some((id) => !pd.pool.includes(id))) throw new Error('预案卡选择无效');
        s = applyEffect(s, { presets: input.ids });
        label = '写入预案';
        break;
      }
      case 'autonomy':
        s = applyEffect(s, { autonomy: input.level });
        label = `授权度设为 ${input.level}`;
        break;
      case 'command':
        label = '发送指令';
        break;
    }

    if (this.beat.resolve) {
      const auto = this.beat.resolve(s);
      s = auto.state;
      lines = [...lines, ...auto.lines];
    }
    this.state = s;
    this.finishBeat(label, riskFailed !== undefined || this.beat.key);
    return { label, lines, riskFailed };
  }

  private finishBeat(label: string, key?: boolean): void {
    const beat = this.beat;
    let s = this.state;
    const days = dyn(beat.days, s) ?? 0;
    if (days > 0) s = passTime(s, days);
    if (beat.archive) s = applyEffect(s, { archive: beat.archive });
    s = { ...s, history: [...s.history, { day: s.day, label: `${this.chapter.title} · ${label}`, snapshot: snapshot(s), key: key || undefined }] };
    this.state = s;

    const terminal = terminalEnding(s);
    if (terminal) return this.finish(terminal);
    this.enterBeatFrom(this.beatIdx + 1);
  }

  // 从 idx 开始寻找下一个满足条件的节拍；没有则进入章节结算
  private enterBeatFrom(idx: number): void {
    const beats = this.chapter.beats;
    for (let i = idx; i < beats.length; i++) {
      const b = beats[i];
      if (b.when && !b.when(this.state)) continue;
      this.beatIdx = i;
      this.stage = 'beat';
      const enter = dyn(b.enter, this.state);
      if (enter) this.state = applyEffect(this.state, enter);
      return;
    }
    this.stage = 'chapterEnd';
  }

  private finish(ending: EndingId): void {
    this.stage = 'ending';
    this.ending = ending;
  }

  serialize(): string {
    const data: SaveData = { v: 1, chapterIdx: this.chapterIdx, beatIdx: this.beatIdx, stage: this.stage, ending: this.ending, state: this.state };
    return JSON.stringify(data);
  }

  static restore(chapters: Chapter[], json: string): Game {
    const data = JSON.parse(json) as SaveData;
    if (data.v !== 1) throw new Error('存档版本不兼容');
    const g = new Game(chapters, data.state.seed, data.state.mode, true);
    g.state = data.state;
    g.chapterIdx = data.chapterIdx;
    g.beatIdx = data.beatIdx;
    g.stage = data.stage;
    g.ending = data.ending;
    return g;
  }
}
