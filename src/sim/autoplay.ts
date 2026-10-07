// 自动游玩：内容集成测试与蒙特卡洛平衡共用
import type { Chapter } from '../core/content';
import type { EndingId } from '../core/endings';
import { Game, type Input, type View } from '../core/flow';
import { rngNext, seedFrom } from '../core/rng';
import { loadoutSlots } from '../core/state';
import type { MissionState, SiteId } from '../core/types';
import { MODULES, SLOT_BUDGET } from '../content/modules';

export type Rand = () => number;
export type Policy = (view: View, state: MissionState, rand: Rand) => Input;

const pick = <T>(arr: T[], rand: Rand): T => arr[Math.floor(rand() * arr.length)];

function shuffle<T>(arr: T[], rand: Rand): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function randomLoadout(rand: Rand): string[] {
  const out: string[] = [];
  for (const m of shuffle(MODULES, rand)) {
    if (loadoutSlots([...out, m.id]) <= SLOT_BUDGET) out.push(m.id);
  }
  return out;
}

const SITES: SiteId[] = ['utopia', 'jezero', 'arcadia'];

function genericInput(view: View, rand: Rand, choose: (view: View) => string): Input {
  const d = view.beat.decision!;
  switch (d.kind) {
    case 'command': return { kind: 'command' };
    case 'loadout': return { kind: 'loadout', modules: randomLoadout(rand) };
    case 'site': return { kind: 'site', site: pick(SITES, rand) };
    case 'presets': return { kind: 'presets', ids: shuffle(d.pool, rand).slice(0, d.pick) };
    case 'autonomy': return { kind: 'autonomy', level: Math.floor(rand() * 4) };
    case 'choice': return { kind: 'choice', optionId: choose(view) };
  }
}

export const randomPolicy: Policy = (view, _s, rand) =>
  genericInput(view, rand, (v) => pick(v.options!.filter((o) => o.enabled), rand).id);

// 启发式：像一个谨慎但不死板的玩家
const SENSIBLE_LOADOUTS = [
  ['fission', 'solar', 'moxie', 'water_wall', 'regolith', 'spares', 'lab', 'greenhouse', 'sensors', 'med'],
  ['solar', 'solar_ext', 'battery', 'moxie', 'ice_drill', 'water_wall', 'food_pack', 'rover', 'spares'],
  ['fission', 'ice_drill', 'moxie', 'greenhouse', 'water_wall', 'rover', 'lab', 'spares', 'sensors'],
  ['fission', 'solar', 'moxie', 'ice_drill', 'greenhouse', 'water_wall', 'lab', 'drone', 'spares'],
];
const PREFERRED = new Set(['shelter', 'spare', 'together', 'balance', 'life', 'short', 'shed', 'allhands', 'amara',
  'rest', 'water', 'dump', 'moderate', 'go', 'nominal', 'all', 'ask_lin', 'preset', 'family', 'full', 'campaign',
  'refuse', 'lin_decides', 'ration', 'both']);
const EDL_PREF = ['edl_divert', 'edl_fuel', 'edl_chute', 'edl_radar', 'edl_abort', 'edl_link'];
const CONJ_PREF = ['cj_power', 'cj_medical', 'cj_leak', 'cj_quarrel', 'cj_dust', 'cj_evalock'];

export const heuristicPolicy: Policy = (view, _s, rand) => {
  const d = view.beat.decision!;
  if (d.kind === 'loadout') return { kind: 'loadout', modules: pick(SENSIBLE_LOADOUTS, rand) };
  if (d.kind === 'autonomy') return { kind: 'autonomy', level: rand() < 0.5 ? 2 + Math.floor(rand() * 2) : Math.floor(rand() * 2) };
  if (d.kind === 'presets') {
    const pref = d.pool[0].startsWith('edl_') ? EDL_PREF : CONJ_PREF;
    const ranked = [...pref].sort((a, b) => pref.indexOf(a) + rand() * 3 - (pref.indexOf(b) + rand() * 3));
    return { kind: 'presets', ids: ranked.slice(0, d.pick) };
  }
  return genericInput(view, rand, (v) => {
    const scored = v.options!.filter((o) => o.enabled).map((o) => ({
      id: o.id,
      score: rand() * 0.6 + (PREFERRED.has(o.id) ? 0.5 : 0) - (o.risk ? (o.risk.low + o.risk.high) / 2 : 0),
    }));
    return scored.sort((a, b) => b.score - a.score)[0].id;
  });
};

export interface AutoplayResult {
  ending: EndingId;
  steps: number;
  beats: string[];
  state: MissionState;
  chapterStartDays: Record<number, number>;
  reachedHome: boolean;
}

export function autoplay(chapters: Chapter[], seed: number, policy: Policy, mode: 'standard' | 'story' = 'standard'): AutoplayResult {
  const g = new Game(chapters, seed, mode);
  let r = seedFrom(seed * 31 + 7);
  const rand: Rand = () => { const [v, n] = rngNext(r); r = n; return v; };
  const beats: string[] = [];
  const chapterStartDays: Record<number, number> = {};
  let steps = 0;
  while (g.stage !== 'ending' && steps < 500) {
    steps++;
    const view = g.view();
    if (view.stage === 'chapterEnd') { g.next(); continue; }
    beats.push(`${view.chapter.id}:${view.beat.id}`);
    if (chapterStartDays[view.chapter.id] === undefined) chapterStartDays[view.chapter.id] = g.state.day;
    if (view.beat.decision) g.choose(policy(view, g.state, rand));
    else g.next();
  }
  return { ending: g.ending!, steps, beats, state: g.state, chapterStartDays, reachedHome: beats.includes('5:home') };
}

// 新手：大体认真，但三分之一的决定凭直觉
export const novicePolicy: Policy = (view, s, rand) =>
  rand() < 0.35 ? randomPolicy(view, s, rand) : heuristicPolicy(view, s, rand);
