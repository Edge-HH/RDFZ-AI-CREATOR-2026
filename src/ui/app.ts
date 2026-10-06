import endingsData from '../data/endings.json';
import locationsData from '../data/locations.json';
import sourcesData from '../data/sources.json';
import {
  act,
  ActionError,
  availableOptions,
  CARDS,
  cardById,
  cardsForRound,
  currentAdvice,
  eventById,
  EVENTS,
  LUNA,
  newGame,
  replay,
  stationAvailable,
  type Action,
} from '../engine/engine';
import { stability, surveyStage } from '../engine/endings';
import { lunaAccuracy } from '../engine/luna';
import { randomSeed } from '../engine/rng';
import { RULES, STAT_LABEL } from '../engine/rules';
import type { Card, Category, Effects, GameState, LunaAdvice, StatKey } from '../engine/types';
import type { SceneApi, ViewMode } from '../scene/scene';
import { heightAt, lightWindow, LOCATIONS, METERS_PER_UNIT, routeBetween, slopeAt, sunlitFraction, type LocationId } from '../world/terrain';
import { CATEGORY_LABEL, effectChips, esc, pct, RISK_LABEL, tag } from './format';

interface LocationInfo {
  name: string;
  layer: string;
  role: string;
  facts: { kind: Category; text: string; src: string | null }[];
}
interface Source {
  id: string;
  title: string;
  org: string;
  year: number;
  url: string;
  usedFor: string;
}
interface EndingText {
  tier: string;
  title: string;
  subtitle: string;
  text: string;
}

const PLACES = locationsData as Record<LocationId, LocationInfo>;
const SOURCES = sourcesData as Source[];
const ENDINGS = endingsData as Record<string, EndingText>;

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector<T>(sel)!;

export class App {
  private state: GameState;
  private prev: GameState | null = null;
  private selected: LocationId = 'core';
  private tab: 'log' | 'basis' | 'delayed' = 'log';
  private toastTimer = 0;
  private lightCache = new Map<LocationId, boolean[]>();

  constructor(private scene: SceneApi | null) {
    this.state = newGame(randomSeed());
    this.bindStatic();
    this.scene?.onSelect((id) => this.select(id, true));
    if (window.matchMedia('(max-width: 820px)').matches) $('#place').dataset.collapsed = 'true';
    this.renderAll();
    this.showStart();
  }

  // ---------------------------------------------------------------- 事件绑定
  private bindStatic() {
    $('#btn-restart').addEventListener('click', () => this.showStart());
    $('#btn-science').addEventListener('click', () => this.showScience());
    document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((b) =>
      b.addEventListener('click', () => this.setView(b.dataset.view as ViewMode)),
    );
    document.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) =>
      b.addEventListener('click', () => {
        this.tab = b.dataset.tab as typeof this.tab;
        document.querySelectorAll('[data-tab]').forEach((x) => x.classList.toggle('is-active', x === b));
        this.renderBottom();
      }),
    );
    // 右侧面板使用事件委托
    $('#side').addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('[data-ui="ending"]')) return this.showEnding();
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
      if (!el || (el as HTMLButtonElement).disabled) return;
      this.dispatch(JSON.parse(el.dataset.act!) as Action);
    });
    $('#place').addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('[data-toggle-place]')) {
        const p = $('#place');
        p.dataset.collapsed = p.dataset.collapsed === 'true' ? 'false' : 'true';
      }
    });
    $('#overlay').addEventListener('click', (e) => this.onOverlayClick(e));
  }

  private setView(mode: ViewMode) {
    document.querySelectorAll('[data-view]').forEach((x) => x.classList.toggle('is-active', (x as HTMLElement).dataset.view === mode));
    this.scene?.setView(mode);
    if (mode === 'cutaway') this.select('undercity');
    else if (mode === 'orbit') this.select('station');
  }

  /** expand：用户主动点击时展开地点卡；程序触发的聚焦保持当前折叠状态 */
  private select(id: LocationId, expand = false) {
    this.selected = id;
    this.scene?.setFocus(id);
    if (expand) $('#place').dataset.collapsed = 'false';
    this.renderPlace();
  }

  private dispatch(a: Action) {
    try {
      const next = act(this.state, a);
      this.prev = this.state;
      this.state = next;
    } catch (err) {
      if (err instanceof ActionError) return this.toast(err.message);
      throw err;
    }
    if (a.t === 'card' || (a.t === 'delegate' && this.prev.phase === 'plan') || (a.t === 'lock' && a.choice !== 'withdraw')) {
      const card = cardById(this.state.chosenCardId);
      if (card) {
        this.scene?.sendRover(card.location);
        this.select(card.location);
      }
    }
    if (a.t === 'undercity') {
      this.setView('cutaway');
    }
    if (a.t === 'station') this.select('station');
    this.renderAll();
    if (this.state.phase === 'ended') window.setTimeout(() => this.showEnding(), 700);
  }

  private toast(msg: string, kind: 'error' | 'info' = 'error') {
    const t = $('#toast');
    t.textContent = msg;
    t.dataset.kind = kind;
    t.classList.add('is-show');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => t.classList.remove('is-show'), 2600);
  }

  // ---------------------------------------------------------------- 渲染
  private renderAll() {
    const s = this.state;
    this.scene?.setDay(s.day);
    this.scene?.setStation(s.stationUnlocked);
    this.scene?.setUndercity(s.undercity, s.governance);
    this.renderClock();
    this.renderSide();
    this.renderBottom();
    this.renderPlace();
  }

  private renderClock() {
    const s = this.state;
    const from = s.day + 1;
    const to = Math.min(30, s.day + RULES.daysPerRound);
    const days = Array.from({ length: 30 }, (_, i) => `<i class="${i < s.day ? 'past' : i < s.day + 5 && s.phase !== 'ended' ? 'now' : ''}"></i>`).join('');
    $('#clock').innerHTML = `
      <div class="clock__row">
        <span>主回合 <strong>${s.round}</strong> / ${RULES.rounds}</span>
        <span>${s.phase === 'ended' ? '任务结束' : `月面日 <strong>${from}–${to}</strong> / 30`}</span>
        <span>勘测阶段 <strong>${surveyStage(s.stats.survey)}</strong> / 3</span>
        <span title="同一种子 + 同一选择 = 同一结果">种子 <strong style="font-family:var(--mono)">${s.seed}</strong></span>
      </div>
      <div class="days" aria-hidden="true">${days}</div>`;
  }

  private statRow(k: StatKey, color: string, marks: number[] = []) {
    const s = this.state;
    const v = s.stats[k];
    const d = this.prev ? v - this.prev.stats[k] : 0;
    const low = ['energy', 'life', 'supplies', 'equipment', 'team'].includes(k) && v < RULES.safety;
    return `<div class="stat ${low ? 'stat--low' : ''}">
      <div class="stat__top"><span>${STAT_LABEL[k]}</span><b>${v}${d ? `<span class="delta ${d > 0 ? 'up' : 'down'}">${d > 0 ? '+' : ''}${d}</span>` : ''}</b></div>
      <div class="bar"><i style="width:${Math.max(0, Math.min(100, v))}%;background:${color}"></i>${marks.map((m) => `<span class="mark" style="left:${m}%"></span>`).join('')}</div>
    </div>`;
  }

  private renderSide() {
    const s = this.state;
    const advice = s.phase === 'plan' || s.phase === 'event' ? currentAdvice(s) : null;
    const stab = stability(s);
    const marginD = this.prev ? s.stats.margin - this.prev.stats.margin : 0;
    const resources = `
      <section class="card" aria-label="资源">
        <h2 class="section-title">基地资源与指标 ${tag('param')}</h2>
        <div class="stats">
          ${this.statRow('energy', '#ffd166')}
          ${this.statRow('life', '#6be3a4', [RULES.safety])}
          ${this.statRow('supplies', '#a0c4ff')}
          ${this.statRow('equipment', '#c9c9c9')}
          ${this.statRow('team', '#ff9fb2')}
          ${this.statRow('research', '#7fd8ff')}
          ${this.statRow('survey', 'linear-gradient(90deg,#4fb6e8,#7fd8ff)', [34, 67])}
          ${this.statRow('autonomy', '#ffb84d', [RULES.ending.autonomy])}
        </div>
        <div class="stats__extra">
          <span>时间余量 <b>${s.stats.margin} 日</b>${marginD ? `<span class="delta ${marginD > 0 ? 'up' : 'down'}">${marginD > 0 ? '+' : ''}${marginD}</span>` : ''}</span>
          <span>基地稳定度 <b>${stab}</b></span>
          <span>Luna 信任 <b>${s.stats.trust}</b></span>
        </div>
      </section>`;

    $('#side').innerHTML = resources + this.lunaPanel(advice) + this.actionPanel(advice);
  }

  private lunaPanel(advice: LunaAdvice | null): string {
    const s = this.state;
    const stage = s.lockdown ? 3 : s.lunaStage;
    const stageName = { 1: '建议', 2: '施压', 3: '有限接管' }[stage];
    const acc = lunaAccuracy(s);
    let recName = '';
    if (advice) {
      recName = s.phase === 'plan' ? (cardById(advice.cardId)?.title ?? '') : (availableOptions(s).find((o) => o.id === advice.cardId)?.label ?? '');
    }
    const line = s.lockdown ? LUNA.takeover : advice ? (s.phase === 'event' ? advice.line : (LUNA.stage as Record<string, string>)[String(stage)]) : s.phase === 'resolve' ? '结算完成。推进后我会对照预测检查结果。' : '';
    const body = advice
      ? `
        <div class="luna__rec">
          <div class="wide"><small>推荐方案</small><b style="font-family:var(--font)">${esc(recName)}</b></div>
          <div><small>预测置信度</small><b>${pct(advice.confidence)}</b></div>
          <div><small>历史准确率</small><b>${pct(acc)}</b></div>
          <div><small>模型偏差</small><b>${Math.round(s.lunaBias * 100)}%</b></div>
        </div>
        <small class="note">判断依据</small>
        <ul>${advice.basis.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>
        <div class="luna__sac">可能牺牲的价值：${esc(advice.sacrifice)}</div>
        ${s.lockdown ? '' : `<div class="luna__actions">
          <button class="btn btn--luna" type="button" data-act='{"t":"inquire"}' ${s.inquiredThisPhase ? 'disabled' : ''} title="揭示所有方案的延迟后果（自主性 +1，信任 +1）">${s.inquiredThisPhase ? '已追问' : '追问 Luna'}</button>
          <button class="btn btn--luna" type="button" data-act='{"t":"delegate"}' title="由 Luna 代为决策（自主性 −4，信任 +3，时间余量 +1）">授权 Luna 决策</button>
        </div>`}
        <p class="note">选择推荐方案 = 接受（自主性 −2）；选择其他方案 = 否决（自主性 +${s.lunaStage >= 2 ? 4 : 3}，信任 −${s.lunaStage >= 2 ? 4 : 2}）。</p>`
      : `<div class="luna__rec"><div><small>历史准确率</small><b>${pct(acc)}</b></div><div><small>预测记录</small><b>${s.lunaHits}/${s.lunaTotal}</b></div><div><small>模型偏差</small><b>${Math.round(s.lunaBias * 100)}%</b></div></div>`;
    return `
      <section class="card luna" data-stage="${stage}" aria-label="Luna">
        <div class="luna__head">
          <div class="luna__avatar" aria-hidden="true"></div>
          <div><span class="luna__name">Luna</span><span class="stage-pill stage-pill--${stage}">阶段 ${stage} · ${stageName}</span>
          <div class="note" style="margin:0">任务协同 AI · 安全监管者 · 规则驱动（离线）</div></div>
        </div>
        <p class="luna__line">“${esc(line)}”</p>
        ${body}
      </section>`;
  }

  private actionPanel(advice: LunaAdvice | null): string {
    const s = this.state;
    if (s.phase === 'ended') {
      return `<section class="card"><h2 class="section-title">任务结束</h2><button class="btn btn--primary btn--block" type="button" data-ui="ending">查看结算报告</button></section>`;
    }
    if (s.lockdown) return this.lockPanel();
    if (s.phase === 'plan') return this.supportPanel() + this.cardsPanel(advice!);
    if (s.phase === 'event') return this.eventPanel(advice!);
    return this.resolvePanel();
  }

  private supportPanel(): string {
    const s = this.state;
    if (!s.stationUnlocked && s.undercity === 'locked') {
      return `<section class="card"><h2 class="section-title">三层舞台</h2><p class="note">领航员空间站支援与月壤地下城将在第 3 个主回合结束后解锁。</p></section>`;
    }
    const st = RULES.station;
    const stOk = stationAvailable(s) && !s.stationUsedThisRound;
    const station = `
      <div>
        <h2 class="section-title">领航员空间站支援 <span class="note" style="margin:0">${s.commsDown ? '通信中断' : s.stationUsedThisRound ? '本回合已使用' : '每回合一次'}</span></h2>
        <div class="support__grid">
          <button class="btn" type="button" data-act='{"t":"station","kind":"supply"}' ${stOk ? '' : 'disabled'}><b>补给投放</b>${esc(fx(st.supply))}</button>
          <button class="btn" type="button" data-act='{"t":"station","kind":"audit"}' ${stOk ? '' : 'disabled'}><b>AI 审计</b>校正 Luna 偏差；${esc(fx(st.audit))}</button>
          <button class="btn" type="button" data-act='{"t":"station","kind":"uplink"}' ${stOk ? '' : 'disabled'}><b>数据上行</b>${esc(fx(st.uplink))}</button>
        </div>
      </div>`;
    let under = '';
    if (s.undercity === 'available') {
      const claim = s.delegations + s.takeovers >= 3;
      under = `
        <div>
          <h2 class="section-title">月壤地下城 · 启动 <span class="note" style="margin:0">${esc(fx(RULES.undercityCost))}</span></h2>
          ${claim ? `<p class="note" style="color:var(--luna)">⚠ ${esc(LUNA.undercityClaim)}</p>` : ''}
          <div class="support__duo">
            <button class="btn" type="button" data-act='{"t":"undercity","gov":"luna"}'><b>交给 Luna 管理</b>${esc(fx(RULES.undercityLuna))}；上线后每回合 ${esc(fx(RULES.undercityLunaBonus))}</button>
            <button class="btn" type="button" data-act='{"t":"undercity","gov":"human"}'><b>保持人类自治</b>${esc(fx(claim ? { ...RULES.undercityHuman, team: -10, margin: -1 } : RULES.undercityHuman))}</button>
          </div>
          <p class="note">上线后每回合生命支持消耗 −3，太阳风暴时可直接转入地下。</p>
        </div>`;
    } else if (s.undercity === 'building' || s.undercity === 'online') {
      under = `<p class="note">月壤地下城：${s.undercity === 'building' ? '建设中（推进 5 日后上线）' : '已上线'} · ${s.governance === 'luna' ? 'Luna 托管' : '人类自治'}</p>`;
    }
    return `<section class="card support">${station}${under}</section>`;
  }

  private cardsPanel(advice: LunaAdvice): string {
    const s = this.state;
    const cards = cardsForRound(s.round);
    return `<section class="plan-cards" aria-label="任务方案卡">
      <h2 class="section-title" style="margin:0">选择 1 张任务方案卡</h2>
      ${cards.map((c) => this.planCard(c, advice)).join('')}
    </section>`;
  }

  private planCard(c: Card, advice: LunaAdvice): string {
    const s = this.state;
    const isRec = advice.cardId === c.id;
    const warns = advice.warnings[c.id] ?? [];
    const est = advice.estimates[c.id];
    const place = PLACES[c.location];
    const delayed = c.delayed?.length
      ? s.inquiredThisPhase
        ? c.delayed.map((d) => `<div class="pcard__row"><em>延迟后果（${d.in * 5} 日内）：</em>${esc(d.text)}</div>`).join('')
        : `<div class="pcard__row"><em>延迟后果：</em>${esc(c.hint ?? '未知')}（追问 Luna 可揭示）</div>`
      : s.inquiredThisPhase
        ? `<div class="pcard__row"><em>延迟后果：</em>无</div>`
        : '';
    const check = c.check
      ? `<div class="pcard__row"><em>风险检定「${esc(c.check.label)}」：</em>Luna 估计成功率 <b>${pct(est ?? c.check.p)}</b>
          ${s.inquiredThisPhase ? `<br><em>成功：</em>${esc(fx(c.check.success) || '无额外影响')} <em>失败：</em>${esc(fx(c.check.fail))}` : ''}</div>`
      : '';
    return `<article class="pcard ${isRec ? 'is-rec' : ''}">
      <div class="pcard__head">
        <h3 class="pcard__title">${esc(c.title)}</h3>
        ${isRec ? '<span class="rec-badge">◆ Luna 推荐</span>' : ''}
      </div>
      <div class="pcard__meta"><span class="risk risk--${c.risk}">${RISK_LABEL[c.risk]}</span><span class="loc">${esc(place.name)}</span></div>
      <p class="pcard__desc">${esc(c.desc)}</p>
      ${effectChips(c.effects)}
      ${check}
      ${delayed}
      ${warns.length ? `<ul class="warns">${warns.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}
      <div class="pcard__row"><em>可能牺牲：</em>${esc(c.sacrifice)}</div>
      ${c.science ? `<div class="sci">${tag(c.science.kind)}<span>${esc(c.science.text)}</span></div>` : ''}
      <button class="btn ${isRec ? 'btn--luna' : 'btn--primary'} btn--block" type="button" data-act='${JSON.stringify({ t: 'card', id: c.id })}'>${isRec ? '接受推荐 · 执行' : '执行此方案'}</button>
    </article>`;
  }

  private lockPanel(): string {
    const s = this.state;
    const card = cardById(s.lockdown!.cardId)!;
    const canFinal = s.stats.team >= RULES.finalCallTeam;
    return `<section class="card lock" aria-live="assertive">
      <h3>⛔ 有限接管：「${esc(card.title)}」已被临时锁定</h3>
      <p class="note" style="color:#ffd2d2">${esc(s.lockdown!.reason)}</p>
      <div class="lock__actions">
        <button class="btn btn--luna" type="button" data-act='{"t":"lock","choice":"accept"}'>接受接管：由 Luna 执行替代方案（${esc(fx(RULES.decision.takeover))}）</button>
        <button class="btn btn--danger" type="button" data-act='{"t":"lock","choice":"final"}' ${canFinal ? '' : 'disabled'}>行使人类最终决策权（${esc(fx(RULES.decision.finalCall))}）${canFinal ? '' : ` · 需团队状态 ≥ ${RULES.finalCallTeam}`}</button>
        <button class="btn" type="button" data-act='{"t":"lock","choice":"withdraw"}'>撤回，重新选择</button>
      </div>
    </section>`;
  }

  private eventPanel(advice: LunaAdvice): string {
    const s = this.state;
    const ev = eventById(s.currentEventId)!;
    const avail = new Set(availableOptions(s).map((o) => o.id));
    const opts = availableOptions(s);
    const all = ev.options.map((o) => opts.find((x) => x.id === o.id) ?? o);
    return `<section class="card event">
      <div class="note" style="margin:0">突发事件 · ${esc(PLACES[ev.location].name)}</div>
      <h3 class="event__title">${esc(ev.title)}</h3>
      <p style="margin:0 0 6px">${esc(ev.desc)}</p>
      <div class="sci">${tag(ev.science.kind)}<span>${esc(ev.science.text)}</span></div>
      <div class="options">
        ${all
          .map((o) => {
            const ok = avail.has(o.id);
            const isRec = advice.cardId === o.id;
            const warns = advice.warnings[o.id] ?? [];
            const est = advice.estimates[o.id];
            const delayed = o.delayed?.length
              ? s.inquiredThisPhase
                ? `<span class="option__desc">延迟后果：${esc(o.delayed.map((d) => d.text).join('；'))}</span>`
                : `<span class="option__desc">延迟后果：？（追问 Luna 可揭示）</span>`
              : '';
            return `<button class="option ${isRec ? 'is-rec' : ''}" type="button" ${ok ? `data-act='${JSON.stringify({ t: 'option', id: o.id })}'` : 'disabled'}>
              <span class="option__label"><span>${esc(o.label)}</span>${isRec ? '<span class="rec-badge">◆ Luna 推荐</span>' : ''}</span>
              <span class="option__desc">${esc(o.desc)}${!ok ? (o.requires === 'station' ? '（需空间站可用）' : '（需地下城上线）') : ''}</span>
              ${effectChips(o.effects)}
              ${o.check ? `<span class="option__desc">风险检定「${esc(o.check.label)}」：Luna 估计成功率 ${pct(est ?? o.check.p)}${s.inquiredThisPhase ? `；成功 ${esc(fx(o.check.success))}；失败 ${esc(fx(o.check.fail))}` : ''}</span>` : ''}
              ${delayed}
              ${warns.length ? `<span class="option__desc" style="color:#ffd9a0">⚠ ${esc(warns.join('；'))}</span>` : ''}
            </button>`;
          })
          .join('')}
      </div>
    </section>`;
  }

  private resolvePanel(): string {
    const s = this.state;
    return `<section class="card resolve">
      <h3>第 ${s.round} 回合结算</h3>
      ${s.lastResolve
        .map((r) => `<div class="resolve__item"><h4>${esc(r.title)}</h4>${r.lines.map((l) => `<p>${esc(l)}</p>`).join('')}${effectChips(r.effects)}</div>`)
        .join('')}
      <p class="note">推进时将结算：基础消耗 ${esc(fx(RULES.upkeep))}；阳照能源脊发电（本期受照 ${pct(sunlitFraction('ridge', s.day, s.day + 5))}）；到期的延迟后果。</p>
      <button class="btn btn--primary btn--block" type="button" data-act='{"t":"advance"}'>${s.round >= RULES.rounds ? '推进最后 5 个月面日 · 进入结算' : '推进 5 个月面日 →'}</button>
    </section>`;
  }

  // ---------------------------------------------------------------- 底部
  private renderBottom() {
    const s = this.state;
    $('#delayed-count').textContent = s.pending.filter((p) => p.text).length ? String(s.pending.length) : '';
    let html = '';
    if (this.tab === 'log') {
      html = `<ul class="log">${[...s.log]
        .reverse()
        .map((l) => `<li><time>R${l.round}·D${l.day}</time><span class="k-${l.kind}">${esc(l.text)}${l.effects ? effectChips(l.effects).replace('class="effects ', 'style="display:inline-flex" class="effects ') : ''}</span></li>`)
        .join('')}</ul>`;
    } else if (this.tab === 'basis') {
      html = this.basisView();
    } else {
      html = s.pending.length
        ? `<ul class="delayed-list">${s.pending
            .map((p) => `<li><time>第 ${p.dueRound * 5} 日</time><span><b>${esc(p.source)}</b>：${esc(p.text)}</span>${effectChips(p.effects)}</li>`)
            .join('')}</ul>`
        : '<p class="empty">暂无待生效的延迟后果。部分方案和事件应对会在 5–10 个月面日后产生影响。</p>';
    }
    $('#bottom').innerHTML = html;
  }

  private basisView(): string {
    const s = this.state;
    const advice = s.phase === 'plan' || s.phase === 'event' ? currentAdvice(s) : null;
    const items: string[] = [];
    if (advice) {
      items.push(`<div><h4>Luna 的计算</h4><ul>${advice.basis.map((b) => `<li>${esc(b)}</li>`).join('')}<li>效用函数权重：生命支持 > 勘测 > 能源 > 设备 > 科研/物资 > 团队；<b>不包含人类自主性</b> ${tag('param')}</li><li>历史准确率 ${pct(lunaAccuracy(s))}（含训练先验 ${RULES.lunaPrior.hits}/${RULES.lunaPrior.total}，本局 ${s.lunaHits}/${s.lunaTotal}）</li></ul></div>`);
    }
    const sci: { kind: Category; text: string }[] = [];
    if (s.phase === 'plan') for (const c of cardsForRound(s.round)) if (c.science) sci.push(c.science);
    if (s.phase === 'event') {
      const ev = eventById(s.currentEventId);
      if (ev) sci.push(ev.science);
    }
    if (sci.length) items.push(`<div><h4>本阶段的科学依据</h4><ul class="science-list">${sci.map((x) => `<li>${tag(x.kind)}<span>${esc(x.text)}</span></li>`).join('')}</ul></div>`);
    items.push(`<div><h4>决策记录</h4><ul>
      <li>接受 Luna 推荐：${s.accepts} 次</li><li>否决 Luna：${s.overrides} 次</li><li>授权 Luna 决策：${s.delegations} 次</li>
      <li>有限接管：${s.takeovers} 次 · 行使最终决策权：${s.humanFinalCalls} 次</li><li>空间站 AI 审计：${s.audits} 次</li></ul></div>`);
    return `<div class="basis-grid">${items.join('')}</div>`;
  }

  // ---------------------------------------------------------------- 地点卡
  private lights(id: LocationId): boolean[] {
    if (!this.lightCache.has(id)) this.lightCache.set(id, lightWindow(id));
    return this.lightCache.get(id)!;
  }

  private renderPlace() {
    const id = this.selected;
    const info = PLACES[id];
    const s = this.state;
    const l = LOCATIONS[id];
    const coreH = heightAt(LOCATIONS.core.x, LOCATIONS.core.z);
    let grid = '';
    if (id === 'station') {
      grid = `<div><small>位置</small><b>绕月轨道</b></div><div><small>状态</small><b>${s.stationUnlocked ? (s.commsDown ? '通信中断' : '可支援') : '第 4 回合解锁'}</b></div>`;
    } else if (id === 'undercity') {
      grid = `<div><small>深度</small><b>地表下约 10–15 m</b><small>剖切图垂直方向示意放大</small></div><div><small>状态</small><b>${{ locked: '未解锁', available: '可启动', building: '建设中', online: '已上线' }[s.undercity]}</b></div>`;
    } else {
      const h = heightAt(l.x, l.z);
      const rel = Math.round((h - coreH) * METERS_PER_UNIT);
      const slope = slopeAt(l.x, l.z);
      const route = id === 'core' ? null : routeBetween('core', id);
      grid = `
        <div><small>相对基地高差</small><b>${rel > 0 ? '+' : ''}${rel} m</b></div>
        <div><small>地表坡度</small><b>${slope.toFixed(1)}°</b></div>
        ${route ? `<div><small>距核心舱路线</small><b>${route.km.toFixed(1)} km</b></div><div><small>路线最大坡度</small><b>${route.maxSlope.toFixed(0)}°</b></div>` : `<div><small>海拔（示意基准）</small><b>${Math.round(h * METERS_PER_UNIT)} m</b></div><div><small>比例尺</small><b>1 格 = ${METERS_PER_UNIT} m</b></div>`}`;
    }
    const lw = this.lights(id);
    const litDays = lw.filter(Boolean).length;
    const nowDay = Math.min(29, s.day);
    const light = `
      <div class="note" style="margin:6px 0 0">光照窗口（30 个月面日，逐日地形遮挡计算）${tag('param')}</div>
      <div class="lightbar" role="img" aria-label="30 日中受照 ${litDays} 日">${lw
        .map((lit, i) => `<i class="${lit ? 'lit' : ''} ${i >= s.day && i < s.day + 5 ? 'round' : ''} ${i === nowDay ? 'now' : ''}"></i>`)
        .join('')}</div>
      <div class="note" style="margin:0">受照 ${litDays}/30 日 · 黄色=受照 · 框=本回合</div>`;
    const facts = info.facts
      .map((f) => {
        const src = f.src ? SOURCES.find((x) => x.id === f.src) : null;
        return `<li>${tag(f.kind)}<span>${esc(f.text)}${src ? `<br><span class="src">来源：${esc(src.org)}（${src.year}）</span>` : ''}</span></li>`;
      })
      .join('');
    const p = $('#place');
    p.innerHTML = `
      <div class="place__head">
        <div><h3 class="place__name">${esc(info.name)}</h3><span class="place__layer">${esc(info.layer)}</span></div>
        <button class="btn btn--sm btn--ghost" type="button" data-toggle-place aria-label="折叠/展开">⇕</button>
      </div>
      <div class="place__body">
        <p class="place__role">${esc(info.role)}</p>
        <div class="place__grid">${grid}</div>
        ${light}
        <ul class="facts">${facts}</ul>
      </div>`;
  }

  // ---------------------------------------------------------------- 覆盖层
  private openOverlay(html: string) {
    const o = $('#overlay');
    o.innerHTML = html;
    o.hidden = false;
    o.querySelector<HTMLElement>('button, input, textarea')?.focus();
  }

  private closeOverlay() {
    $('#overlay').hidden = true;
    $('#overlay').innerHTML = '';
  }

  private onOverlayClick(e: Event) {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-ov]');
    if (!el) return;
    const kind = el.dataset.ov!;
    if (kind === 'close') this.closeOverlay();
    if (kind === 'start' || kind === 'same-seed') {
      let seed = this.state.seed;
      if (kind === 'start') {
        const raw = ($('#seed-input') as HTMLInputElement | null)?.value.trim();
        seed = raw && /^\d+$/.test(raw) ? Number(raw) : randomSeed();
      }
      this.prev = null;
      this.state = newGame(seed);
      this.selected = 'core';
      this.setView('overview');
      this.closeOverlay();
      this.renderAll();
    }
    if (kind === 'load') {
      const code = ($('#replay-input') as HTMLTextAreaElement).value.trim();
      try {
        const { s, a } = JSON.parse(decodeURIComponent(escape(atob(code)))) as { s: number; a: Action[] };
        this.prev = null;
        this.state = replay(s, a);
        this.closeOverlay();
        this.renderAll();
        this.toast(`已复盘：种子 ${s}，共 ${a.length} 步`, 'info');
        if (this.state.phase === 'ended') window.setTimeout(() => this.showEnding(), 400);
      } catch {
        this.toast('复盘代码无效');
      }
    }
    if (kind === 'copy') {
      const code = this.replayCode();
      navigator.clipboard?.writeText(code).then(
        () => this.toast('复盘代码已复制', 'info'),
        () => this.toast('无法访问剪贴板，请手动复制'),
      );
    }
  }

  private replayCode(): string {
    const actions = this.state.replay.map((r) => JSON.parse(r.action) as Action);
    return btoa(unescape(encodeURIComponent(JSON.stringify({ s: this.state.seed, a: actions }))));
  }

  showStart() {
    this.openOverlay(`
      <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="start-title">
        <div class="kicker">ASTRA · 群星计划 · 2049</div>
        <h2 id="start-title">月球南极联合基地</h2>
        <p class="lead">你是联合基地的任务指挥官。30 个月面日内，完成三阶段冰样勘测——并决定人类与 AI 如何共同管理这座未来基地。</p>
        <p>环形山底部的永久阴影区里，封存着数十亿年的水冰；阳照能源脊上，太阳贴着地平线缓缓绕行。基地 AI <b style="color:var(--luna)">Luna</b> 会为你计算每一步的风险，也会在你冒险时按下暂停键。它很少出错——但它的计算里，没有“人类自主性”这一项。</p>
        <div class="how">
          <div><b>① 查看</b>三处地点状态、资源和 Luna 的预测。点击地图标签查看坡度、高差、光照窗口。</div>
          <div><b>② 决策</b>从 3 张任务方案卡中选 1 张；可接受、追问、否决或授权 Luna。</div>
          <div><b>③ 应对</b>处理 1 个突发事件，结算即时变化，写入延迟后果。</div>
          <div><b>④ 推进</b>推进 5 个月面日。第 3 回合后解锁空间站与地下城。</div>
        </div>
        <p class="note">界面中 ${tag('fact')} ${tag('inference')} ${tag('param')} 用于区分有可靠来源的科学事实、合理推演和游戏数值。本作为原创虚构作品，不收集任何个人信息，可完全离线运行。</p>
        <div class="start-row">
          <label for="seed-input" class="note" style="margin:0">随机种子（可选，用于复盘）</label>
          <input id="seed-input" class="input" inputmode="numeric" placeholder="留空则随机" size="12" />
          <button class="btn btn--primary" type="button" data-ov="start">开始任务</button>
          ${this.state.replay.length && this.state.phase !== 'ended' ? '<button class="btn" type="button" data-ov="close">继续当前任务</button>' : ''}
        </div>
        <details>
          <summary>载入复盘代码</summary>
          <textarea id="replay-input" class="input" placeholder="粘贴结算页中的复盘代码"></textarea>
          <button class="btn btn--sm" type="button" data-ov="load" style="margin-top:6px">复盘</button>
        </details>
      </div>`);
  }

  showEnding() {
    const s = this.state;
    const e = s.ending!;
    const t = ENDINGS[e.id];
    const m = e.metrics;
    const bars: [string, number, string][] = [
      ['任务进度', m.mission, '#7fd8ff'],
      ['基地稳定度', m.stability, '#6be3a4'],
      ['科研成果', m.research, '#a0c4ff'],
      ['团队状态', m.team, '#ff9fb2'],
      ['人类自主性', m.autonomy, '#ffb84d'],
    ];
    this.openOverlay(`
      <div class="dialog ending--${e.id}" role="dialog" aria-modal="true" aria-labelledby="end-title">
        <div class="ending__tier">${esc(t.tier)}</div>
        <h2 id="end-title">${esc(t.title)}</h2>
        <p class="lead">${esc(t.subtitle)}</p>
        <p>${esc(t.text.replace('{day}', String(s.day)))}</p>
        <div class="metrics">${bars
          .map(([n, v, c]) => `<div class="metric"><span>${n}</span><div class="bar"><i style="width:${Math.max(0, Math.min(100, v))}%;background:${c}"></i></div><b>${v}</b></div>`)
          .join('')}</div>
        ${e.unmet.length && e.id !== 'cooperative' ? `<p class="unmet">距离「协作存续」：${e.unmet.map(esc).join('；')}</p>` : ''}
        <div class="summary-grid">
          <div><b>${s.accepts}</b>接受 Luna</div>
          <div><b>${s.overrides}</b>否决 Luna</div>
          <div><b>${s.delegations}</b>授权 Luna</div>
          <div><b>${s.takeovers}</b>有限接管</div>
          <div><b>${s.humanFinalCalls}</b>最终决策权</div>
          <div><b>${pct(lunaAccuracy(s))}</b>Luna 准确率</div>
          <div><b>${s.undercity === 'online' ? (s.governance === 'luna' ? 'Luna' : '人类') : '—'}</b>地下城治理</div>
          <div><b>${s.seed}</b>随机种子</div>
        </div>
        <p class="note">结局判定 ${tag('param')}：协作存续需勘测 100%、稳定度 ≥ ${RULES.ending.stability}、自主性 ≥ ${RULES.ending.autonomy} 且地下城上线；Luna 托管存续需勘测 ≥ ${RULES.ending.lunaSurvey}%、稳定度 ≥ ${RULES.ending.stability} 且自主性 < ${RULES.ending.autonomy}；生命支持归零则任务中止。</p>
        <div class="start-row">
          <button class="btn btn--primary" type="button" data-ov="same-seed">同一种子重新挑战</button>
          <button class="btn" type="button" data-ov="start">新任务（随机种子）</button>
          <button class="btn" type="button" data-ov="copy">复制复盘代码</button>
          <button class="btn btn--ghost" type="button" data-ov="close">查看基地</button>
        </div>
      </div>`);
  }

  showScience() {
    const facts: { kind: Category; text: string; where: string }[] = [];
    for (const [id, p] of Object.entries(PLACES)) for (const f of p.facts) facts.push({ kind: f.kind, text: f.text, where: PLACES[id as LocationId].name });
    for (const c of CARDS) if (c.science) facts.push({ ...c.science, where: `方案卡「${c.title}」` });
    for (const e of EVENTS) facts.push({ ...e.science, where: `事件「${e.title}」` });
    const section = (k: Category) =>
      `<h3>${tag(k)} ${CATEGORY_LABEL[k]}</h3><ul class="science-list">${facts
        .filter((f) => f.kind === k)
        .map((f) => `<li><span class="note" style="margin:0;white-space:nowrap">${esc(f.where)}</span><span>${esc(f.text)}</span></li>`)
        .join('')}</ul>`;
    const rules: [string, string][] = [
      ['回合', `${RULES.rounds} 个主回合 × ${RULES.daysPerRound} 个月面日 = 30 日`],
      ['初始资源', Object.entries(RULES.start).map(([k, v]) => `${STAT_LABEL[k as StatKey]} ${v}`).join('，')],
      ['每回合基础消耗', fx(RULES.upkeep)],
      ['光伏发电', `满照 ${RULES.solarPerRound} × 阳照能源脊受照比例（由地形逐日计算）`],
      ['基地稳定度', '0.3×能源 + 0.3×生命支持 + 0.2×物资 + 0.2×设备状态'],
      ['时间余量透支', `每欠 1 日，勘测进度 −${RULES.overrunPenalty}`],
      ['接受 / 否决 Luna', `${fx(RULES.decision.accept)} / ${fx(RULES.decision.override)}（施压阶段 ${fx(RULES.decision.overridePressure)}）`],
      ['追问 / 授权', `${fx(RULES.decision.inquire)} / ${fx(RULES.decision.delegate)}`],
      ['有限接管', `极端高风险方案且 Luna 估计成功率 < 50% 或失败后生命支持 < 40 时触发；接受 ${fx(RULES.decision.takeover)}，最终决策权 ${fx(RULES.decision.finalCall)}（需团队 ≥ ${RULES.finalCallTeam}）`],
      ['Luna 偏差', `对高风险方案成功率初始低估 ${RULES.lunaBias * 100}%，每次 AI 审计后乘以 ${RULES.auditFactor}`],
      ['地下城', `启动 ${fx(RULES.undercityCost)}；Luna 管理 ${fx(RULES.undercityLuna)}，人类自治 ${fx(RULES.undercityHuman)}；上线后每回合 ${fx(RULES.undercityUpkeep)}`],
      ['随机性', '事件抽取与风险检定使用 mulberry32 确定性随机数：同一种子 + 同一选择 = 同一结果'],
    ];
    this.openOverlay(`
      <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="sci-title">
        <div class="kicker">SCIENCE · RULES</div>
        <h2 id="sci-title">科学依据与游戏规则</h2>
        <p class="lead">本作严格区分三类信息。所有资源数值、事件概率、AI 置信度和结局阈值均为游戏参数，不代表真实任务数据。</p>
        ${section('fact')}
        ${section('inference')}
        ${section('param')}
        <h3>${tag('param')} 规则参数</h3>
        <table class="rules-table"><tbody>${rules.map(([a, b]) => `<tr><th>${esc(a)}</th><td>${esc(b)}</td></tr>`).join('')}</tbody></table>
        <h3>地形说明 ${tag('param')}</h3>
        <p class="note">三维地形为原创程序化示意地形，参照南极“环形山—连接脊—高地”的空间关系，非真实测绘数据。水平与垂直比例一致（1 格 = ${METERS_PER_UNIT} m），坡度可直接计算；光照窗口按太阳高度角 1.5°、每 29.53 日绕地平线一周逐日计算地形遮挡（简化模型）。视觉光源高度略抬高以便观察；地下剖切的深度为示意放大。</p>
        <h3>参考资料</h3>
        <ol class="refs">${SOURCES.map((r) => `<li>${esc(r.org)}（${r.year}）. ${esc(r.title)}. <a href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">${esc(r.url)}</a><br><span class="note">用于：${esc(r.usedFor)}</span></li>`).join('')}</ol>
        <div class="start-row"><button class="btn btn--primary" type="button" data-ov="close">返回</button></div>
      </div>`);
  }
}

function fx(e: Effects): string {
  return (Object.entries(e) as [StatKey, number][])
    .filter(([, v]) => v !== 0)
    .map(([k, v]) => `${STAT_LABEL[k]} ${v > 0 ? '+' : ''}${v}`)
    .join('，');
}
