import locationsData from '../data/locations.json';
import sourcesData from '../data/sources.json';
import { act, ActionError, availableChoices, availableResponses, currentAdvice, currentNode, newGame, type Action } from '../engine/engine';
import { metrics } from '../engine/endings';
import { RESOURCE_COLORS, RESOURCE_KEYS } from '../engine/rules';
import type { GameState, ResourceKey } from '../engine/types';
import type { SceneApi, Shot, ViewMode } from '../scene/scene';
import { epilogue, introLines, mainChoiceLines, PROLOGUE, responseLines, resultLines, type Line } from '../story/story';
import { randomSeed } from '../engine/rng';
import { Dialogue } from './dialogue';
import { effectChips, esc, pct, resourceLabel } from './format';

interface LocationInfo {
  name: string;
  layer: string;
  role: string;
  facts: { kind: string; text: string; src: string | null }[];
}

type Tab = 'act' | 'status' | 'place' | 'log';

const $ = <T extends HTMLElement = HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const ACT_NAMES = { 1: '沉默的回声', 2: '谁有权知道', 3: '群星计划' } as const;
const PLACES = locationsData as Record<string, LocationInfo>;
const SOURCES = sourcesData as { id: string; title: string; org: string; year: number; url: string; usedFor: string }[];

export class App {
  private state: GameState;
  private tab: Tab = 'act';
  private selected = 'core';
  private toastTimer = 0;
  private bannerTimer = 0;
  private dialogue: Dialogue;

  constructor(private scene: SceneApi | null) {
    this.state = newGame(randomSeed());
    this.dialogue = new Dialogue($('#dialogue'), (line) => this.onLine(line));
    this.bindStatic();
    scene?.onSelect((id) => {
      this.selected = id;
      this.scene?.setFocus(id);
      this.openDrawer('place');
    });
    this.renderAll();
    this.showTitle();
  }

  private bindStatic() {
    $('#btn-menu').addEventListener('click', () => this.showMenu());
    $('#btn-help').addEventListener('click', () => this.showHelp());
    document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((button) => button.addEventListener('click', () => this.setView(button.dataset.view as ViewMode)));
    document.querySelectorAll<HTMLButtonElement>('[data-open]').forEach((button) => button.addEventListener('click', () => this.openDrawer(button.dataset.open as Tab)));
    document.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((button) => button.addEventListener('click', () => this.openDrawer(button.dataset.tab as Tab)));
    $('#drawer-close').addEventListener('click', () => this.closeDrawer());
    $('#hud-res').addEventListener('click', () => this.openDrawer('status'));
    $('#hud-luna').addEventListener('click', () => this.openDrawer('act'));
    $('#hud-cta').addEventListener('click', (event) => {
      const target = (event.target as HTMLElement).closest<HTMLElement>('[data-cta]');
      if (!target) return;
      const key = target.dataset.cta;
      if (key === 'open') this.openDrawer('act');
      if (key === 'continue') this.dispatch({ t: 'continue' });
      if (key === 'ending') this.showEnding();
    });
    $('#drawer-body').addEventListener('click', (event) => {
      const target = (event.target as HTMLElement).closest<HTMLElement>('[data-act]');
      if (target && !(target as HTMLButtonElement).disabled) this.dispatch(JSON.parse(target.dataset.act!) as Action);
      const place = (event.target as HTMLElement).closest<HTMLElement>('[data-place]');
      if (place) {
        this.selected = place.dataset.place!;
        this.scene?.setFocus(this.selected === 'earth-city' ? null : (this.selected as never));
        this.renderDrawer();
      }
      if ((event.target as HTMLElement).closest('[data-ui="ending"]')) this.showEnding();
    });
    $('#overlay').addEventListener('click', (event) => this.onOverlayClick(event));
    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !this.dialogue.active && $('#overlay').hidden && !$('#drawer').hidden) this.closeDrawer();
    });
  }

  private setView(mode: ViewMode) {
    document.querySelectorAll('[data-view]').forEach((item) => item.classList.toggle('is-active', (item as HTMLElement).dataset.view === mode));
    this.scene?.setView(mode);
    if (mode === 'globe') this.selected = 'station';
    else if (mode === 'cutaway') this.selected = 'core';
    else this.selected = 'core';
    this.scene?.setFocus(this.selected as never);
  }

  private onLine(line: Line | null) {
    document.querySelectorAll('.is-hl').forEach((item) => item.classList.remove('is-hl'));
    if (!line) return;
    if (line.shot) void this.shot(line.shot as Shot);
    if (line.focus) {
      this.selected = line.focus;
      this.scene?.setFocus(line.focus as never);
    }
    if (line.hl) document.querySelector(line.hl)?.classList.add('is-hl');
  }

  private async story(lines: Line[]) {
    await this.dialogue.play(lines);
    this.renderCta();
  }

  private shot(shot: Shot) {
    const view = shot === 'globe' || shot === 'earthmoon' || shot === 'station' ? 'globe' : shot === 'cutaway' ? 'cutaway' : 'overview';
    this.setView(view);
    return this.scene?.shot(shot);
  }

  private dispatch(action: Action) {
    const previous = this.state;
    try {
      this.state = act(previous, action);
    } catch (error) {
      if (error instanceof ActionError) return this.toast(error.message);
      throw error;
    }
    this.renderAll();
    void this.afterAction(action);
  }

  private async afterAction(action: Action) {
    const node = currentNode(this.state);
    if (this.state.phase === 'ended' && this.state.ending) {
      this.closeDrawer();
      await this.story(epilogue(this.state.ending));
      this.showEnding();
      return;
    }
    if (action.t === 'main') {
      const choice = node.choices.find((item) => item.id === this.state.chosenChoiceId);
      if (choice) await this.story(mainChoiceLines(node, choice.label));
      this.openDrawer('act');
      return;
    }
    if (action.t === 'response') {
      const response = availableResponses(this.state).find((item) => item.id === action.choiceId);
      if (response) await this.story(responseLines(node, response.label));
      await this.story(resultLines(this.state));
      if (this.state.phase === 'transition') {
        this.toast('剧情将自动进入下一节点', 'info');
        window.setTimeout(() => {
          if (this.state.phase === 'transition') this.dispatch({ t: 'continue' });
        }, 520);
      } else {
        this.openDrawer('act');
      }
      return;
    }
    if (action.t === 'continue' && this.state.phase === 'node') {
      const next = currentNode(this.state);
      this.banner(`第 ${this.state.nodeCount} 个节点`, ACT_NAMES[next.act]);
      await this.story(introLines(next));
      return;
    }
    if (action.t === 'inquire') {
      await this.story([{ who: 'luna', text: '我能公开判断依据，但不会替你决定哪些人有权知道。' }]);
      return;
    }
    this.openDrawer('act');
  }

  private toast(message: string, kind: 'error' | 'info' = 'error') {
    const toast = $('#toast');
    toast.textContent = message;
    toast.dataset.kind = kind;
    toast.classList.add('is-show');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => toast.classList.remove('is-show'), Math.max(2200, message.length * 80));
  }

  private banner(title: string, subtitle: string) {
    const banner = $('#banner');
    banner.innerHTML = `<b>${esc(title)}</b><span>${esc(subtitle)}</span>`;
    banner.classList.remove('is-show');
    void banner.offsetWidth;
    banner.classList.add('is-show');
    clearTimeout(this.bannerTimer);
    this.bannerTimer = window.setTimeout(() => banner.classList.remove('is-show'), 2400);
  }

  private openDrawer(tab: Tab) {
    this.tab = tab;
    $('#drawer').hidden = false;
    document.body.classList.add('drawer-open');
    this.renderDrawer();
  }

  private closeDrawer() {
    $('#drawer').hidden = true;
    document.body.classList.remove('drawer-open');
  }

  private renderAll() {
    const node = currentNode(this.state);
    this.scene?.setDay(this.state.nodeCount * 4);
    this.scene?.setStation(this.state.act >= 2);
    this.scene?.setUndercity('locked', null);
    this.renderTime();
    this.renderResources();
    this.renderLuna();
    this.renderCta();
    if (!$('#drawer').hidden) this.renderDrawer();
    $('#dock-delayed').textContent = this.state.evidence.length ? String(this.state.evidence.length) : '';
    if (node.location === 'station') this.selected = 'station';
  }

  private renderTime() {
    const s = this.state;
    const progress = Math.min(100, Math.round((s.nodeCount / s.targetNodes) * 100));
    const bars = Array.from({ length: 9 }, (_, i) => `<i class="${i < s.nodeCount ? 'past' : i === s.nodeCount ? 'now' : ''}"></i>`).join('');
    $('#hud-time').innerHTML = `<div class="ht__row"><b>调查节点 <small>${s.nodeCount}/${s.targetNodes}</small></b><span>${esc(ACT_NAMES[s.act])}</span></div><div class="days" aria-label="剧情进度 ${progress}%">${bars}</div>`;
  }

  private renderResources() {
    const s = this.state;
    const values = RESOURCE_KEYS.map((key) => s.resources[key]);
    const critical = Math.min(...values);
    const status = critical < 25 ? '需要立即调整' : critical < 45 ? '正在承压' : '运行稳定';
    const klass = critical < 25 ? 'is-danger' : critical < 45 ? 'is-warn' : '';
    const metric = (key: ResourceKey) => `<span class="status__metric"><small>${resourceLabel(key)}</small><b>${s.resources[key]}</b></span>`;
    $('#hud-res').className = `hud-res ${klass}`;
    $('#hud-res').innerHTML = `<span class="status__signal"></span><span class="status__main"><b>基地${status}</b><small>证据 ${s.evidence.length}/3 · 信任 ${s.resources.trust}</small></span>${metric('life')}${metric('energy')}<span class="status__open">状态 <span>↗</span></span>`;
  }

  private renderLuna() {
    const stage = this.state.lunaAuthority >= 60 ? 3 : this.state.lunaAuthority >= 38 ? 2 : 1;
    const label = stage === 3 ? '权限扩大' : stage === 2 ? '开始施压' : '提供建议';
    $('#hud-luna').dataset.stage = String(stage);
    $('#hud-luna').innerHTML = `<span class="orb"></span><span class="hl__txt"><b>Luna</b><small>${label} · 置信度 ${Math.round(currentAdvice(this.state).confidence * 100)}%</small></span>`;
  }

  private renderCta() {
    const s = this.state;
    let kicker = `第 ${s.nodeCount} 个节点 · ${ACT_NAMES[s.act]}`;
    let label = currentNode(s).title;
    let button = '查看行动 ▸';
    let key = 'open';
    if (s.phase === 'response') {
      kicker = '回应阶段';
      label = '选择你的立场和后果';
      button = '查看回应 ▸';
    } else if (s.phase === 'transition') {
      kicker = '节点结算';
      label = s.pendingResult?.lines[0] ?? '后果已记录';
      button = '立即进入下一段 ▸';
      key = 'continue';
    } else if (s.phase === 'ended') {
      kicker = '调查结束';
      label = '查看三地决策报告';
      button = '查看结算 ▸';
      key = 'ending';
    }
    $('#hud-cta').innerHTML = `<div class="cta__txt"><small>${esc(kicker)}</small><b>${esc(label)}</b></div><div class="cta__btns"><button class="btn btn--primary cta__btn" type="button" data-cta="${key}">${button}</button></div>`;
  }

  private renderDrawer() {
    document.querySelectorAll('[data-tab]').forEach((item) => item.classList.toggle('is-active', (item as HTMLElement).dataset.tab === this.tab));
    const body = $('#drawer-body');
    if (this.tab === 'act') body.innerHTML = this.renderActionPanel();
    else if (this.tab === 'status') body.innerHTML = this.renderStatusPanel();
    else if (this.tab === 'place') body.innerHTML = this.renderPlacePanel();
    else body.innerHTML = this.renderLogPanel();
  }

  private renderActionPanel(): string {
    const s = this.state;
    const node = currentNode(s);
    const advice = currentAdvice(s);
    const buttons = s.phase === 'node' ? availableChoices(s).map((choice) => `<button class="choice" type="button" data-act='${JSON.stringify({ t: 'main', choiceId: choice.id })}'><b>${esc(choice.label)}</b><span>${esc(choice.desc)}</span>${effectChips(choice.effects)}<small>${choice.risk === 'none' || choice.risk === 'low' ? '可逆风险' : `风险：${choice.risk === 'mid' ? '中' : '高'}`}</small></button>`).join('') : s.phase === 'response' ? availableResponses(s).map((response) => `<button class="choice" type="button" data-act='${JSON.stringify({ t: 'response', choiceId: response.id })}'><b>${esc(response.label)}</b><span>${esc(response.desc)}</span>${effectChips(response.effects)}</button>`).join('') : s.phase === 'transition' ? `<button class="btn btn--primary" type="button" data-act='{"t":"continue"}'>进入下一个剧情节点</button>` : `<button class="btn btn--primary" type="button" data-ui="ending">查看结算报告</button>`;
    const ask = s.phase === 'node' || s.phase === 'response' ? `<button class="btn btn--ghost btn--sm" type="button" data-act='{"t":"inquire"}'>追问 Luna</button>` : '';
    return `<section class="panel-section"><div class="section-kicker">ACT ${s.act} · ${esc(ACT_NAMES[s.act])}</div><h2>${esc(node.title)}</h2><p class="lead">${esc(node.prompt)}</p><div class="luna-advice"><b>Luna 建议</b><span>${esc(advice.line)}</span><div class="luna__rec"><span>置信度 <b>${pct(advice.confidence)}</b></span><span>历史准确率 <b>${pct(advice.accuracy)}</b></span></div><small>${advice.basis.map(esc).join(' · ')}</small></div><div class="choice-list">${buttons}</div>${ask}</section>`;
  }

  private renderStatusPanel(): string {
    const s = this.state;
    const m = metrics(s);
    const resources = RESOURCE_KEYS.map((key) => `<div class="metric"><span>${resourceLabel(key)}</span><div class="bar"><i style="width:${s.resources[key]}%;background:${RESOURCE_COLORS[key]}"></i></div><b>${s.resources[key]}</b></div>`).join('');
    const evidence = ['orbit', 'sample', 'archive'].map((id) => `<span class="evidence ${s.evidence.includes(id as never) ? 'is-found' : ''}">${id === 'orbit' ? '轨道观测' : id === 'sample' ? '地下样本' : '早期任务日志'}</span>`).join('');
    return `<section class="panel-section"><div class="section-kicker">当前状态</div><h2>四项核心变量</h2>${resources}<div class="state-grid"><div><small>证据</small><b>${m.evidence}/3</b></div><div><small>自主性</small><b>${m.autonomy}</b></div><div><small>地下城支持</small><b>${m.earthSupport}</b></div><div><small>Luna 权限</small><b>${s.lunaAuthority}</b></div></div><h3>证据链</h3><div class="evidence-list">${evidence}</div><h3>小队关系</h3><p>林曜 ${relationText(s.relations.lin)} · 苏禾 ${relationText(s.relations.su)}</p></section>`;
  }

  private renderPlacePanel(): string {
    const id = this.selected === 'station' ? 'station' : this.selected === 'earth-city' ? 'earth-city' : this.selected;
    if (id === 'earth-city') return `<section class="panel-section"><div class="section-kicker">地球地下城</div><h2>人类生存与决策中心</h2><p class="lead">地下城居民依赖有限的水、氧和能源。每一次公开或延迟，都会改变他们是否继续支援月球。</p><div class="place-chips"><button class="loc" data-place="core">月面基地</button><button class="loc" data-place="station">领航员空间站</button></div></section>`;
    const info = PLACES[id] ?? PLACES.core;
    const facts = info.facts.slice(0, 3).map((fact) => `<li><span>${fact.kind}</span>${esc(fact.text)}</li>`).join('');
    return `<section class="panel-section"><div class="section-kicker">${esc(info.layer)}</div><h2>${esc(info.name)}</h2><p class="lead">${esc(info.role)}</p><ul class="facts">${facts}</ul><div class="place-chips"><button class="loc" data-place="earth-city">地球地下城</button><button class="loc" data-place="station">领航员空间站</button><button class="loc" data-place="core">基地核心舱</button></div></section>`;
  }

  private renderLogPanel(): string {
    const items = this.state.log.slice().reverse().map((entry) => `<li><time>N${entry.node} · A${entry.act}</time><span>${esc(entry.text)}${entry.effects ? effectChips(entry.effects, 'effects--inline') : ''}</span></li>`).join('');
    return `<section class="panel-section"><div class="section-kicker">调查记录</div><h2>日志</h2><ol class="log">${items}</ol></section>`;
  }

  private showTitle() {
    document.body.classList.add('on-title');
    this.openOverlay(`<div class="title"><p class="eyebrow">FUTURE INFERENCE · STRATEGY NARRATIVE</p><h1>Astra:<span>群星计划</span></h1><p class="title__lead">月面异常信号改变了地球地下城的生存计划。调查真相、守住三地通信，再决定谁有权知道未来。</p><div class="title__flow"><span><i>01</i><b>发现信号</b><small>低风险上手</small></span><span><i>02</i><b>收集证据</b><small>关系与通信</small></span><span><i>03</i><b>交付未来</b><small>多种结局</small></span></div><div class="title__btns"><button class="btn btn--primary btn--lg" data-ov="start">开始调查</button><button class="btn btn--ghost btn--lg" data-ov="quick">快速开始</button></div><div class="title__links"><button class="link-btn" data-ov="help">玩法说明</button><button class="link-btn" data-ov="science">科学依据</button></div></div>`, 'overlay--title');
  }

  private showHelp() {
    this.openOverlay(`<div class="dialog dialog--sm"><button class="icon-btn dialog__close" data-ov="close">×</button><p class="eyebrow">HOW TO PLAY</p><h2>三地之间做决定</h2><p>每个剧情节点只有一个主行动和一个回应。你会在月面基地、领航员空间站和地球地下城之间分配注意力。</p><ul class="help-keys"><li>前两节点不会因资源不足失败。</li><li>危机不会每次出现，风险会在选择前提示。</li><li>集齐轨道观测、地下样本和早期日志，才能判断 Luna 的真实协议。</li><li>按自己的选择继续，节点数量会因种子和行动不同而变化。</li></ul><button class="btn btn--primary" data-ov="close">返回调查</button></div>`);
  }

  private showScience() {
    const links = SOURCES.slice(0, 5).map((source) => `<li><a href="${source.url}" target="_blank" rel="noreferrer">${esc(source.title)}</a><small>${esc(source.usedFor)}</small></li>`).join('');
    this.openOverlay(`<div class="dialog dialog--wide"><button class="icon-btn dialog__close" data-ov="close">×</button><p class="eyebrow">SCIENCE NOTES</p><h2>科学依据与推演边界</h2><p>月面地形、极区光照、永久阴影区和水冰证据参考公开科学资料；信号、三地制度、Luna 协议和资源数值属于合理推演或游戏参数。</p><ul class="source-list">${links}</ul><button class="btn btn--primary" data-ov="close">返回</button></div>`);
  }

  private showMenu() {
    this.openOverlay(`<div class="dialog dialog--sm"><button class="icon-btn dialog__close" data-ov="close">×</button><p class="eyebrow">CONTROL</p><h2>调查控制</h2><label class="field">种子<input id="seed-input" inputmode="numeric" placeholder="留空则随机" /></label><div class="menu-list"><button class="btn btn--primary" data-ov="same-seed">用当前种子重来</button><button class="btn btn--ghost" data-ov="title">返回标题</button></div></div>`);
  }

  private showEnding() {
    if (!this.state.ending) return;
    const result = this.state.ending;
    const title = result.id === 'cooperative' ? '公开协作' : result.id === 'luna' ? 'Luna 托管' : result.id === 'retreat' ? '人类自主撤退' : '任务中止';
    const m = metrics(this.state);
    this.openOverlay(`<div class="dialog dialog--wide"><p class="eyebrow">FINAL REPORT · ${this.state.nodeCount} NODES</p><h2>${title}</h2><p>证据 ${m.evidence}/3 · 稳定度 ${m.stability} · 信任 ${m.trust} · 自主性 ${m.autonomy} · 地下城支持 ${m.earthSupport}</p><p>${result.unmet.length ? `未满足：${result.unmet.join('；')}` : '三地共享了同一份证据，并共同承担了选择。'}</p><div class="title__btns"><button class="btn btn--primary" data-ov="same-seed">同一种子重试</button><button class="btn btn--ghost" data-ov="title">返回标题</button></div></div>`);
  }

  private openOverlay(html: string, variant = '') {
    const overlay = $('#overlay');
    overlay.className = `overlay ${variant}`;
    overlay.innerHTML = html;
    overlay.hidden = false;
    overlay.querySelector<HTMLElement>('button, input')?.focus();
  }

  private closeOverlay() {
    $('#overlay').hidden = true;
    $('#overlay').innerHTML = '';
  }

  private startGame(seed: number, withPrologue: boolean) {
    this.state = newGame(seed);
    this.selected = 'core';
    this.closeOverlay();
    this.closeDrawer();
    document.body.classList.remove('on-title');
    this.renderAll();
    void this.shot('overview');
    if (withPrologue) void this.story([...PROLOGUE, ...introLines(currentNode(this.state))]);
    else void this.story(introLines(currentNode(this.state)));
  }

  private onOverlayClick(event: Event) {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-ov]');
    if (!target) return;
    const key = target.dataset.ov;
    const input = ($('#seed-input') as HTMLInputElement | null)?.value.trim();
    const seed = input && /^\d+$/.test(input) ? Number(input) : randomSeed();
    if (key === 'close') this.closeOverlay();
    else if (key === 'start') this.startGame(seed, true);
    else if (key === 'quick') this.startGame(seed, false);
    else if (key === 'same-seed') this.startGame(this.state.seed, false);
    else if (key === 'title') this.showTitle();
    else if (key === 'help') this.showHelp();
    else if (key === 'science') this.showScience();
  }
}

function relationText(value: number): string {
  return value >= 3 ? '高度信任' : value >= 1 ? '保持合作' : value <= -1 ? '明显分歧' : '关系未定';
}
