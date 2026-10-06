import { STORY_NODES, NODE_BY_ID } from '../data/storyNodes';
import { computeEnding } from './endings';
import { currentAdvice as buildAdvice, updatePrediction } from './luna';
import { RULES, RESOURCE_KEYS } from './rules';
import { nextRandom } from './rng';
import type {
  Act,
  Action,
  Effects,
  GameState,
  NodeChoice,
  PendingNodeResult,
  Requirement,
  ResourceKey,
  ResponseChoice,
  StoryNode,
} from './types';

export type { Action } from './types';

export class ActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ActionError';
  }
}

export const NODES = STORY_NODES;

export function nodeById(id: string | null): StoryNode | null {
  return id ? NODE_BY_ID.get(id) ?? null : null;
}

export function currentNode(s: GameState): StoryNode {
  const node = nodeById(s.currentNodeId);
  if (!node) throw new ActionError('当前剧情节点不存在');
  return node;
}

function clampResource(key: ResourceKey, value: number): number {
  const [min, max] = RULES.clamp[key];
  return Math.max(min, Math.min(max, Math.round(value)));
}

function clampState(s: GameState) {
  for (const key of RESOURCE_KEYS) s.resources[key] = clampResource(key, s.resources[key]);
  s.autonomy = Math.max(0, Math.min(100, Math.round(s.autonomy)));
  s.earthSupport = Math.max(0, Math.min(100, Math.round(s.earthSupport)));
  s.stationControl = Math.max(0, Math.min(100, Math.round(s.stationControl)));
  s.lunaAuthority = Math.max(0, Math.min(100, Math.round(s.lunaAuthority)));
  for (const key of ['lin', 'su'] as const) s.relations[key] = Math.max(-2, Math.min(4, Math.round(s.relations[key])));
}

function addUnique(list: string[], value: string) {
  if (!list.includes(value)) list.push(value);
}

function applyEffects(s: GameState, effects: Effects): void {
  for (const key of RESOURCE_KEYS) {
    const value = effects[key];
    if (typeof value === 'number') s.resources[key] += value;
  }
  if (effects.evidence && !s.evidence.includes(effects.evidence)) s.evidence.push(effects.evidence);
  if (typeof effects.autonomy === 'number') s.autonomy += effects.autonomy;
  if (typeof effects.lin === 'number') s.relations.lin += effects.lin;
  if (typeof effects.su === 'number') s.relations.su += effects.su;
  if (typeof effects.earthSupport === 'number') s.earthSupport += effects.earthSupport;
  if (typeof effects.stationControl === 'number') s.stationControl += effects.stationControl;
  if (typeof effects.lunaAuthority === 'number') s.lunaAuthority += effects.lunaAuthority;
  for (const flag of effects.flags ?? []) addUnique(s.flags, flag);
  clampState(s);
}

function log(s: GameState, kind: GameState['log'][number]['kind'], text: string, effects?: Effects) {
  s.log.push({ node: s.nodeCount, act: s.act, kind, text, effects });
}

function random(s: GameState): number {
  const [value, next] = nextRandom(s.rng);
  s.rng = next;
  return value;
}

function meets(s: GameState, requires: Requirement[] | undefined): boolean {
  return (requires ?? []).every((r) => {
    if (r.resource && s.resources[r.resource.key] < r.resource.min) return false;
    if (r.evidence && !s.evidence.includes(r.evidence)) return false;
    if (r.relation && s.relations[r.relation.who] < r.relation.min) return false;
    if (r.flag && !s.flags.includes(r.flag)) return false;
    if (r.act && s.act < r.act) return false;
    return true;
  });
}

export function availableChoices(s: GameState): NodeChoice[] {
  if (s.phase !== 'node') return [];
  return currentNode(s).choices.filter((choice) => meets(s, choice.requires));
}

export function availableResponses(s: GameState): ResponseChoice[] {
  if (s.phase !== 'response' || !s.chosenChoiceId) return [];
  const choice = currentNode(s).choices.find((item) => item.id === s.chosenChoiceId);
  return choice?.responses.filter((response) => meets(s, response.requires)) ?? [];
}

export function currentAdvice(s: GameState) {
  return buildAdvice(s, currentNode(s));
}

function pickWeighted(s: GameState, nodes: StoryNode[]): StoryNode {
  if (!nodes.length) return NODE_BY_ID.get('final-disclosure')!;
  const weighted = nodes.map((node) => ({ node, weight: node.calm ? 1.2 : node.kind === 'crisis' ? 0.7 : 1 }));
  const total = weighted.reduce((sum, item) => sum + item.weight, 0);
  let cursor = random(s) * total;
  for (const item of weighted) {
    cursor -= item.weight;
    if (cursor <= 0) return item.node;
  }
  return weighted[weighted.length - 1].node;
}

function crisisAllowed(s: GameState): boolean {
  if (s.nodeCount <= RULES.firstSafeNodes) return false;
  if (s.act === 1) return s.crisisCount < 1 && random(s) > 0.82;
  if (s.act === 2) return s.crisisCount < 2 && random(s) > 0.52;
  return s.crisisCount < 1;
}

function nextNode(s: GameState): StoryNode {
  if (!s.evidence.includes('sample')) return NODE_BY_ID.get('sample-dive')!;
  if (!s.evidence.includes('archive')) return NODE_BY_ID.get('station-auction')!;
  if (s.nodeCount >= s.targetNodes) return NODE_BY_ID.get('final-disclosure')!;

  const current = currentNode(s);
  const candidates = STORY_NODES.filter((node) => {
    if (node.id === 'signal-arrival' || node.id === 'sample-dive' || node.id === 'station-auction' || node.id === 'final-disclosure') return false;
    if (s.usedNodeIds.includes(node.id)) return false;
    if (node.act < s.act) return false;
    if (node.kind === current.kind && node.kind !== 'crisis') return false;
    if (node.kind === 'crisis' && !crisisAllowed(s)) return false;
    return true;
  });
  const preferredAct: Act = s.nodeCount < 2 ? 1 : s.nodeCount < Math.ceil((s.targetNodes - 1) * 0.72) ? 2 : 3;
  const sameAct = candidates.filter((node) => node.act === preferredAct);
  if (sameAct.length || candidates.length) return pickWeighted(s, sameAct.length ? sameAct : candidates);

  const fallback = STORY_NODES.filter((item) => !s.usedNodeIds.includes(item.id) && item.id !== 'final-disclosure' && item.id !== 'signal-arrival' && item.id !== 'sample-dive' && item.id !== 'station-auction');
  return pickWeighted(s, fallback);
}

function setNode(s: GameState, node: StoryNode) {
  s.currentNodeId = node.id;
  s.act = node.act;
  s.usedNodeIds.push(node.id);
  s.chosenChoiceId = null;
  s.phase = 'node';
  if (node.kind === 'crisis') {
    s.crisisCount += 1;
    s.usedCrisisIds.push(node.id);
  }
  log(s, 'node', `${node.title}：${node.intro}`);
}

function resolveEffects(s: GameState, choice: NodeChoice | ResponseChoice): Effects {
  const effects = { ...choice.effects };
  const node = currentNode(s);
  if (node.keyEvidence && !s.evidence.includes(node.keyEvidence)) effects.evidence = node.keyEvidence;
  return effects;
}

function applyNodeUpkeep(s: GameState) {
  if (s.nodeCount > RULES.firstSafeNodes) applyEffects(s, RULES.upkeep);
}

function summary(node: StoryNode, choice: NodeChoice, response: ResponseChoice, effects: Effects): PendingNodeResult {
  const lines = [node.calm ? '这一节点没有触发灾难，但你的选择已经改变了后续关系和权限。' : '节点结算完成，后果会在后续调查和通信中继续出现。'];
  if (effects.evidence) lines.push(`获得证据：${effects.evidence === 'orbit' ? '轨道观测' : effects.evidence === 'sample' ? '地下样本' : '早期任务日志'}`);
  if (effects.lunaAuthority && effects.lunaAuthority > 0) lines.push('Luna 的权限边界扩大了。');
  if (effects.autonomy && effects.autonomy > 0) lines.push('人类最终决策权得到保留。');
  return { nodeTitle: node.title, choiceTitle: choice.label, responseTitle: response.label, effects, lines };
}

export function newGame(seed: number): GameState {
  const [roll, rng] = nextRandom(seed >>> 0);
  return {
    seed: seed >>> 0,
    rng,
    phase: 'node',
    act: 1,
    nodeCount: 1,
    targetNodes: RULES.minNodes + Math.floor(roll * (RULES.maxNodes - RULES.minNodes + 1)),
    currentNodeId: 'signal-arrival',
    chosenChoiceId: null,
    resources: { ...RULES.start },
    evidence: [],
    relations: { lin: 0, su: 0 },
    earthSupport: 50,
    stationControl: 0,
    lunaAuthority: 20,
    autonomy: 60,
    crisisCount: 0,
    usedNodeIds: ['signal-arrival'],
    usedCrisisIds: [],
    flags: [],
    lunaHits: 0,
    lunaTotal: 0,
    pendingResult: null,
    log: [{ node: 1, act: 1, kind: 'node', text: '月面基地收到一段来自永久阴影区附近的异常信号。' }],
    replay: [],
    ending: null,
  };
}

export function act(prev: GameState, action: Action): GameState {
  const s: GameState = structuredClone(prev);
  if (s.phase === 'ended') throw new ActionError('游戏已结束');
  const node = currentNode(s);

  if (action.t === 'inquire') {
    const flag = `asked:${node.id}`;
    if (s.flags.includes(flag)) throw new ActionError('这一节点已经追问过 Luna');
    addUnique(s.flags, flag);
    applyEffects(s, { trust: 1, autonomy: 1 });
    log(s, 'luna', 'Luna 展示了她愿意公开的依据，但仍保留了一段任务协议。');
  } else if (action.t === 'main') {
    if (s.phase !== 'node') throw new ActionError('当前应先完成回应');
    const choice = availableChoices(s).find((item) => item.id === action.choiceId);
    if (!choice) throw new ActionError('该主行动当前不可用');
    const advice = currentAdvice(s);
    updatePrediction(s, advice.choiceId === choice.id);
    const effects = resolveEffects(s, choice);
    applyEffects(s, effects);
    s.chosenChoiceId = choice.id;
    s.phase = 'response';
    log(s, 'choice', `主行动：${choice.label}`, effects);
    if (effects.evidence) log(s, 'evidence', `获得证据：${effects.evidence}`);
    if (choice.lunaLine) log(s, 'luna', choice.lunaLine);
  } else if (action.t === 'response') {
    if (s.phase !== 'response' || !s.chosenChoiceId) throw new ActionError('当前没有可回应的主行动');
    const choice = node.choices.find((item) => item.id === s.chosenChoiceId)!;
    const response = availableResponses(s).find((item) => item.id === action.choiceId);
    if (!response) throw new ActionError('该回应当前不可用');
    const effects = resolveEffects(s, response);
    applyEffects(s, effects);
    applyNodeUpkeep(s);
    s.pendingResult = summary(node, choice, response, effects);
    s.phase = 'transition';
    const kind = node.kind === 'communication' ? 'communication' : node.kind === 'relationship' ? 'relationship' : 'response';
    log(s, kind, `回应：${response.label}`, effects);
    if (s.resources.energy <= 0 || s.resources.life <= 0) log(s, 'warning', '关键资源已归零，下一步将进入任务中止判定。');
  } else if (action.t === 'continue') {
    if (s.phase !== 'transition') throw new ActionError('请先完成当前节点的回应');
    if (node.kind === 'final') {
      s.ending = computeEnding(s);
      s.phase = 'ended';
      log(s, 'ending', `任务结束：${s.ending.id}`);
    } else if (s.resources.energy <= 0 || s.resources.life <= 0) {
      s.ending = computeEnding(s);
      s.phase = 'ended';
      log(s, 'ending', '关键资源归零，任务中止。');
    } else {
      s.nodeCount += 1;
      setNode(s, nextNode(s));
      s.pendingResult = null;
    }
  }

  s.replay.push(action);
  return s;
}

export function replay(seed: number, actions: Action[]): GameState {
  return actions.reduce((state, action) => act(state, action), newGame(seed));
}
