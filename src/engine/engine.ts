import cardsData from '../data/cards.json';
import eventsData from '../data/events.json';
import lunaData from '../data/luna.json';
import { sunlitFraction } from '../world/terrain';
import { adviseCards, adviseEvent, lunaEstimate, riskOfOption } from './luna';
import { nextRandom } from './rng';
import { CLAMP, RULES, STAT_LABEL } from './rules';
import { computeEnding } from './endings';
import type { Card, Check, Delayed, Effects, EventOption, GameEvent, GameState, LogEntry, LunaAdvice, Risk, StatKey } from './types';

export const CARDS = cardsData as Card[];
export const EVENTS = eventsData as GameEvent[];
export const LUNA = lunaData;

export type StationKind = 'supply' | 'audit' | 'uplink';

export type Action =
  | { t: 'inquire' }
  | { t: 'station'; kind: StationKind }
  | { t: 'undercity'; gov: 'human' | 'luna' }
  | { t: 'card'; id: string }
  | { t: 'delegate' }
  | { t: 'lock'; choice: 'accept' | 'final' | 'withdraw' }
  | { t: 'option'; id: string }
  | { t: 'advance' };

export class ActionError extends Error {}

export function newGame(seed: number): GameState {
  const s: GameState = {
    seed,
    rng: seed >>> 0,
    round: 1,
    day: 0,
    phase: 'plan',
    stats: { ...RULES.start },
    lunaBias: RULES.lunaBias,
    lunaHits: 0,
    lunaTotal: 0,
    lunaStage: 1,
    accepts: 0,
    overrides: 0,
    delegations: 0,
    takeovers: 0,
    humanFinalCalls: 0,
    audits: 0,
    inquiredThisPhase: false,
    delegatedThisRound: false,
    stationUnlocked: false,
    stationUsedThisRound: false,
    commsDown: false,
    undercity: 'locked',
    governance: null,
    flags: [],
    usedEvents: [],
    currentEventId: null,
    chosenCardId: null,
    lockdown: null,
    pending: [],
    log: [],
    replay: [],
    lastResolve: [],
    ending: null,
  };
  log(s, 'luna', LUNA.intro);
  log(s, 'luna', roundLine(1));
  return s;
}

function roundLine(round: number): string {
  return (LUNA.roundOpen as Record<string, string>)[String(round)] ?? '';
}

function pickLine(lines: string[], s: GameState): string {
  return lines[(s.round + s.replay.length) % lines.length];
}

function log(s: GameState, kind: LogEntry['kind'], text: string, effects?: Effects) {
  s.log.push({ round: s.round, day: s.day, kind, text, effects });
}

function rand(s: GameState): number {
  const [v, next] = nextRandom(s.rng);
  s.rng = next;
  return v;
}

export function applyEffects(s: GameState, e: Effects) {
  for (const [k, v] of Object.entries(e) as [StatKey, number][]) {
    const [lo, hi] = CLAMP[k];
    s.stats[k] = Math.max(lo, Math.min(hi, Math.round(s.stats[k] + v)));
  }
}

export function formatEffects(e: Effects): string {
  return (Object.entries(e) as [StatKey, number][])
    .filter(([, v]) => Math.round(v) !== 0)
    .map(([k, v]) => `${STAT_LABEL[k]} ${v > 0 ? '+' : ''}${Math.round(v)}`)
    .join('，');
}

export function cardsForRound(round: number): Card[] {
  return CARDS.filter((c) => c.round === round);
}

export function eventById(id: string | null): GameEvent | undefined {
  return EVENTS.find((e) => e.id === id);
}

export function cardById(id: string | null): Card | undefined {
  return CARDS.find((c) => c.id === id);
}

export function stationAvailable(s: GameState): boolean {
  return s.stationUnlocked && !s.commsDown;
}

export function optionAvailable(s: GameState, o: EventOption): boolean {
  if (o.requires === 'station') return stationAvailable(s);
  if (o.requires === 'undercity') return s.undercity === 'online';
  return true;
}

/** 太阳风暴时若地下城上线，“全员进入屏蔽舱”几乎无代价 */
export function effectiveOption(s: GameState, ev: GameEvent, o: EventOption): EventOption {
  if (ev.id === 'storm' && o.id === 'shelter' && s.undercity === 'online') {
    return { ...o, desc: '地下城已上线：全员转入月壤屏蔽层，作业照常进行。', effects: { team: 1 } };
  }
  return o;
}

export function availableOptions(s: GameState): EventOption[] {
  const ev = eventById(s.currentEventId);
  if (!ev) return [];
  return ev.options.filter((o) => optionAvailable(s, o)).map((o) => effectiveOption(s, ev, o));
}

export function computeStage(s: GameState): 1 | 2 | 3 {
  if (s.lockdown) return 3;
  const low = (['life', 'energy', 'supplies', 'equipment', 'team'] as StatKey[]).some((k) => s.stats[k] < 35);
  return s.round >= 3 || low ? 2 : 1;
}

/** 当前阶段的 Luna 建议（纯函数，不改变状态） */
export function currentAdvice(s: GameState): LunaAdvice | null {
  if (s.phase === 'plan') {
    const line = s.lunaStage >= 2 ? pickLine(LUNA.pressure, s) : (LUNA.stage as Record<string, string>)['1'];
    return adviseCards(s, cardsForRound(s.round), line);
  }
  if (s.phase === 'event') {
    const ev = eventById(s.currentEventId);
    if (!ev) return null;
    return adviseEvent(s, availableOptions(s), `事件「${ev.title}」：我的建议如下。`);
  }
  return null;
}

/** 掷骰并记录 Luna 预测是否命中 */
function rollCheck(s: GameState, check: Check, risk: Risk, label: string): boolean {
  const est = lunaEstimate(s, check, risk);
  const success = rand(s) < check.p;
  const predicted = est >= 0.5;
  s.lunaTotal++;
  if (predicted === success) s.lunaHits++;
  log(s, success ? 'success' : 'fail', `【${label}·${check.label}】${success ? check.successText : check.failText}`, success ? check.success : check.fail);
  log(s, 'luna', `预测${predicted ? '成功' : '失败'}（估计 ${Math.round(est * 100)}%）→ ${predicted === success ? LUNA.hit : LUNA.miss}`);
  applyEffects(s, success ? check.success : check.fail);
  s.lastResolve.push({
    title: `${check.label}：${success ? '成功' : '失败'}`,
    lines: [success ? check.successText : check.failText, `Luna 预测${predicted ? '成功' : '失败'}，${predicted === success ? '命中' : '失误'}`],
    effects: success ? check.success : check.fail,
  });
  return success;
}

function schedule(s: GameState, delayed: Delayed[] | undefined, source: string) {
  for (const d of delayed ?? []) {
    s.pending.push({ ...d, dueRound: s.round + d.in - 1, source });
    log(s, 'delayed', `写入延迟后果（${d.in === 1 ? '5 日后' : `${d.in * 5} 日内`}）：${d.text}`);
  }
}

function decisionEffects(s: GameState, kind: 'accept' | 'override' | 'delegate' | 'forced') {
  const D = RULES.decision;
  if (kind === 'accept') {
    s.accepts++;
    applyEffects(s, D.accept);
    log(s, 'luna', pickLine(LUNA.accept, s), D.accept);
  } else if (kind === 'override') {
    s.overrides++;
    const e = s.lunaStage >= 2 ? D.overridePressure : D.override;
    applyEffects(s, e);
    log(s, 'luna', pickLine(s.lunaStage >= 2 ? LUNA.overridePressure : LUNA.override, s), e);
  } else if (kind === 'delegate') {
    s.delegations++;
    applyEffects(s, D.delegate);
    log(s, 'luna', pickLine(LUNA.delegate, s), D.delegate);
  }
}

function lockdownReason(s: GameState, card: Card): string | null {
  if (card.risk !== 'extreme') return null;
  const est = card.check ? lunaEstimate(s, card.check, card.risk) : 1;
  const worstLife = s.stats.life + (card.effects.life ?? 0) + (card.check?.fail.life ?? 0);
  if (est < 0.5) return `Luna 估计成功率仅 ${Math.round(est * 100)}%，低于 50% 的接管阈值。`;
  if (worstLife < 40) return `失败情形下生命支持将降至 ${Math.max(0, worstLife)}，低于接管阈值 40。`;
  return null;
}

function executeCard(s: GameState, card: Card) {
  s.chosenCardId = card.id;
  s.lastResolve = [];
  applyEffects(s, card.effects);
  log(s, 'choice', `执行方案「${card.title}」`, card.effects);
  s.lastResolve.push({ title: `方案：${card.title}`, lines: [card.desc], effects: card.effects });
  if (card.check) rollCheck(s, card.check, card.risk, card.title);
  schedule(s, card.delayed, card.title);
  for (const f of card.flags ?? []) if (!s.flags.includes(f)) s.flags.push(f);
  if (s.stats.life <= 0) {
    endGame(s);
    return;
  }
  drawEvent(s);
}

function eventWeight(s: GameState, ev: GameEvent): number {
  let w = ev.weight;
  if (ev.id === 'fault') {
    if (s.stats.equipment < 50) w += 3;
    if (s.flags.includes('safeRoute')) w *= 0.4;
  }
  if (ev.id === 'dust' && s.stats.equipment < 60) w += 1;
  if (ev.id === 'storm' && s.round >= 3) w += 1;
  if (ev.id === 'comms' && s.stationUnlocked) w += 1;
  if (ev.id === 'injury' && s.stats.team < 50) w += 2;
  return w;
}

function drawEvent(s: GameState) {
  let pool = EVENTS.filter((e) => !s.usedEvents.includes(e.id) && (e.minRound ?? 1) <= s.round);
  if (!pool.length) pool = EVENTS.filter((e) => (e.minRound ?? 1) <= s.round);
  const weights = pool.map((e) => eventWeight(s, e));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rand(s) * total;
  let chosen = pool[pool.length - 1];
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i];
    if (r < 0) {
      chosen = pool[i];
      break;
    }
  }
  s.usedEvents.push(chosen.id);
  s.currentEventId = chosen.id;
  s.phase = 'event';
  s.inquiredThisPhase = false;
  log(s, 'event', `突发事件：${chosen.title}——${chosen.desc}`);
}

function resolveOption(s: GameState, o: EventOption) {
  const ev = eventById(s.currentEventId)!;
  applyEffects(s, o.effects);
  log(s, 'choice', `应对「${ev.title}」：${o.label}`, o.effects);
  s.lastResolve.push({ title: `事件：${ev.title}`, lines: [`应对：${o.label}`], effects: o.effects });
  if (o.check) rollCheck(s, o.check, riskOfOption(o), ev.title);
  schedule(s, o.delayed, ev.title);
  for (const f of o.flags ?? []) {
    if (f === 'commsDown') s.commsDown = true;
    else if (!s.flags.includes(f)) s.flags.push(f);
  }
  s.phase = 'resolve';
  if (s.stats.life <= 0) endGame(s);
}

function endGame(s: GameState) {
  s.phase = 'ended';
  s.ending = computeEnding(s);
  log(s, 'info', `任务结束：${s.ending.id}`);
}

function advance(s: GameState) {
  const from = s.day;
  const to = s.day + RULES.daysPerRound;
  const lines: string[] = [];
  const total: Effects = {};
  const add = (e: Effects) => {
    for (const [k, v] of Object.entries(e) as [StatKey, number][]) total[k] = (total[k] ?? 0) + v;
    applyEffects(s, e);
  };

  // 1. 基础消耗
  add(RULES.upkeep);
  lines.push(`基础消耗：${formatEffects(RULES.upkeep)}`);

  // 2. 阳照能源脊发电（由地形光照窗口计算）
  const lit = sunlitFraction('ridge', from, to);
  const dustPenalty = s.flags.includes('dusty') ? 0.7 : 1;
  const solar = Math.round(RULES.solarPerRound * lit * dustPenalty);
  add({ energy: solar });
  lines.push(`阳照能源脊受照 ${Math.round(lit * 100)}%，发电 +${solar}${dustPenalty < 1 ? '（月尘覆盖，效率 70%）' : ''}`);
  s.flags = s.flags.filter((f) => f !== 'dusty');

  // 3. 延迟后果
  const due = s.pending.filter((p) => p.dueRound <= s.round);
  s.pending = s.pending.filter((p) => p.dueRound > s.round);
  for (const p of due) {
    add(p.effects);
    lines.push(`延迟后果（${p.source}）：${p.text}`);
    log(s, 'delayed', `延迟后果生效：${p.text}`, p.effects);
    if (p.flag === 'undercityOnline') {
      s.undercity = 'online';
      log(s, 'undercity', LUNA.undercityOnline);
    }
  }

  // 4. 地下城运行
  if (s.undercity === 'online') {
    add(RULES.undercityUpkeep);
    lines.push(`地下城屏蔽与保温：${formatEffects(RULES.undercityUpkeep)}`);
    if (s.governance === 'luna') {
      add(RULES.undercityLunaBonus);
      lines.push(`Luna 托管地下城：${formatEffects(RULES.undercityLunaBonus)}`);
    }
  }

  // 5. 时间余量透支
  if (s.stats.margin < 0) {
    const pen = { survey: s.stats.margin * RULES.overrunPenalty } as Effects;
    add(pen);
    lines.push(`时间余量透支 ${-s.stats.margin} 日：勘测进度 ${pen.survey}`);
  }

  s.lastResolve.push({ title: `推进 5 个月面日（第 ${from + 1}–${to} 日）`, lines, effects: total });
  log(s, 'info', `推进至第 ${to} 日。${lines.join('；')}`);
  s.day = to;

  if (s.stats.life <= 0 || s.round >= RULES.rounds) {
    endGame(s);
    return;
  }

  s.round++;
  s.phase = 'plan';
  s.chosenCardId = null;
  s.currentEventId = null;
  s.inquiredThisPhase = false;
  s.delegatedThisRound = false;
  s.stationUsedThisRound = false;
  s.commsDown = false;
  if (s.round === 4) {
    s.stationUnlocked = true;
    if (s.undercity === 'locked') s.undercity = 'available';
    log(s, 'station', '领航员空间站进入稳定通信窗口：补给投放、AI 审计与数据上行已解锁。地下城核心舱启动程序已解锁。');
  }
  s.lunaStage = computeStage(s);
  log(s, 'luna', roundLine(s.round));
}

function stationAction(s: GameState, kind: StationKind) {
  if (!stationAvailable(s)) throw new ActionError('空间站当前不可用');
  if (s.stationUsedThisRound) throw new ActionError('本回合已使用空间站支援');
  s.stationUsedThisRound = true;
  const e = RULES.station[kind];
  applyEffects(s, e);
  if (kind === 'supply') log(s, 'station', `补给投放：${LUNA.supply}`, e);
  if (kind === 'uplink') log(s, 'station', `数据上行：${LUNA.uplink}`, e);
  if (kind === 'audit') {
    s.audits++;
    s.lunaBias = Math.round(s.lunaBias * RULES.auditFactor * 1000) / 1000;
    log(s, 'station', `AI 审计：${LUNA.audit}`, e);
    if (s.delegations + s.takeovers >= 2) {
      applyEffects(s, { autonomy: 4 });
      log(s, 'station', LUNA.auditPower, { autonomy: 4 });
    }
  }
}

function startUndercity(s: GameState, gov: 'human' | 'luna') {
  if (s.undercity !== 'available') throw new ActionError('地下城尚不可启动');
  if (s.stats.energy < 15 || s.stats.supplies < 15) throw new ActionError('能源或物资不足 15，无法启动地下城');
  applyEffects(s, RULES.undercityCost);
  s.undercity = 'building';
  s.governance = gov;
  log(s, 'undercity', `启动地下城核心舱建设：${formatEffects(RULES.undercityCost)}`, RULES.undercityCost);
  if (gov === 'luna') {
    applyEffects(s, RULES.undercityLuna);
    log(s, 'luna', LUNA.undercityLuna, RULES.undercityLuna);
  } else {
    const claim = s.delegations + s.takeovers >= 3;
    const e: Effects = claim ? { ...RULES.undercityHuman, team: (RULES.undercityHuman.team ?? 0) - 4, margin: -1 } : RULES.undercityHuman;
    if (claim) log(s, 'luna', LUNA.undercityClaim);
    applyEffects(s, e);
    log(s, 'luna', LUNA.undercityHuman, e);
  }
  s.pending.push({ in: 1, dueRound: s.round, effects: {}, text: '地下城核心舱建成上线', source: '地下城', flag: 'undercityOnline' });
}

/** 纯函数式 reducer：返回新状态 */
export function act(prev: GameState, a: Action): GameState {
  const s: GameState = structuredClone(prev);
  if (s.phase === 'ended') throw new ActionError('游戏已结束');
  switch (a.t) {
    case 'inquire': {
      if (s.inquiredThisPhase) throw new ActionError('本阶段已追问');
      if (s.phase !== 'plan' && s.phase !== 'event') throw new ActionError('当前无需追问');
      s.inquiredThisPhase = true;
      applyEffects(s, RULES.decision.inquire);
      log(s, 'luna', pickLine(LUNA.inquire, s), RULES.decision.inquire);
      break;
    }
    case 'station':
      if (s.phase !== 'plan') throw new ActionError('只能在规划阶段使用空间站');
      stationAction(s, a.kind);
      break;
    case 'undercity':
      if (s.phase !== 'plan') throw new ActionError('只能在规划阶段启动地下城');
      startUndercity(s, a.gov);
      break;
    case 'card': {
      if (s.phase !== 'plan' || s.lockdown) throw new ActionError('当前不能选择方案');
      const card = cardsForRound(s.round).find((c) => c.id === a.id);
      if (!card) throw new ActionError('无效方案');
      const reason = lockdownReason(s, card);
      if (reason) {
        s.lockdown = { cardId: card.id, reason };
        s.lunaStage = 3;
        log(s, 'warning', `有限接管：${LUNA.takeover} ${reason}`);
        break;
      }
      const advice = currentAdvice(s)!;
      decisionEffects(s, advice.cardId === card.id ? 'accept' : 'override');
      executeCard(s, card);
      break;
    }
    case 'lock': {
      if (!s.lockdown) throw new ActionError('当前没有锁定');
      const card = cardById(s.lockdown.cardId)!;
      if (a.choice === 'withdraw') {
        s.lockdown = null;
        s.lunaStage = computeStage(s);
        log(s, 'info', '指挥官撤回了该方案，重新选择。');
        break;
      }
      if (a.choice === 'final') {
        if (s.stats.team < RULES.finalCallTeam) throw new ActionError(LUNA.finalCallDenied);
        s.humanFinalCalls++;
        s.overrides++;
        applyEffects(s, RULES.decision.finalCall);
        log(s, 'luna', LUNA.finalCall, RULES.decision.finalCall);
        s.lockdown = null;
        s.lunaStage = computeStage(s);
        executeCard(s, card);
        break;
      }
      // accept takeover
      s.takeovers++;
      applyEffects(s, RULES.decision.takeover);
      log(s, 'luna', LUNA.takeoverAccept, RULES.decision.takeover);
      s.lockdown = null;
      const safer = cardsForRound(s.round).filter((c) => c.risk !== 'extreme');
      const alt = cardById(adviseCards(s, safer, '').cardId)!;
      s.lunaStage = computeStage(s);
      executeCard(s, alt);
      break;
    }
    case 'delegate': {
      const advice = currentAdvice(s);
      if (!advice || s.lockdown) throw new ActionError('当前不能授权');
      decisionEffects(s, 'delegate');
      s.delegatedThisRound = true;
      if (s.phase === 'plan') executeCard(s, cardById(advice.cardId)!);
      else resolveOption(s, availableOptions(s).find((o) => o.id === advice.cardId)!);
      break;
    }
    case 'option': {
      if (s.phase !== 'event') throw new ActionError('当前没有待处理事件');
      const o = availableOptions(s).find((x) => x.id === a.id);
      if (!o) throw new ActionError('该应对方案不可用');
      const advice = currentAdvice(s)!;
      decisionEffects(s, advice.cardId === o.id ? 'accept' : 'override');
      resolveOption(s, o);
      break;
    }
    case 'advance':
      if (s.phase !== 'resolve') throw new ActionError('请先处理本回合事件');
      s.lastResolve = s.lastResolve.filter((r) => !r.title.startsWith('推进'));
      advance(s);
      break;
  }
  if (!s.lockdown && !s.ending) s.lunaStage = computeStage(s);
  s.replay.push({ round: prev.round, action: JSON.stringify(a) });
  return s;
}

/** 由种子与动作序列复盘整局 */
export function replay(seed: number, actions: Action[]): GameState {
  return actions.reduce((st, a) => act(st, a), newGame(seed));
}
