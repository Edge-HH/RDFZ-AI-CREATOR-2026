import { CREW_IDS, type MissionState, type Mode, type Snapshot } from './types';
import { moduleById, SLOT_BUDGET } from '../content/modules';
import { rngNext, seedFrom } from './rng';

export const START_DAY = -40;
export const BASE_STORAGE_KWH = 200;

export function createState(seed: number, mode: Mode = 'standard'): MissionState {
  return {
    version: 1,
    seed,
    rng: seedFrom(seed),
    mode,
    day: START_DAY,
    storage: BASE_STORAGE_KWH,
    o2: 300,
    water: 240,
    food: 600,
    spares: 2,
    integrity: 100,
    dustTau: 0.5,
    science: 0,
    propellant: 50,
    autonomy: 1,
    autonomyLog: [],
    crew: CREW_IDS.map((id) => ({ id, health: 100, morale: 75, trust: 60, dose: 0, status: 'ok' as const })),
    loadout: [],
    site: null,
    presets: [],
    flags: [],
    archive: [],
    history: [],
  };
}

export function loadoutSlots(ids: string[]): number {
  return ids.reduce((sum, id) => sum + (moduleById(id)?.slots ?? 0), 0);
}

export function applyLoadout(state: MissionState, ids: string[]): MissionState {
  const unknown = ids.find((id) => !moduleById(id));
  if (unknown) throw new Error(`未知模块：${unknown}`);
  if (loadoutSlots(ids) > SLOT_BUDGET) throw new Error('超出配载槽位');
  const s = structuredClone(state);
  s.loadout = [...ids];
  for (const id of ids) {
    const m = moduleById(id)!;
    s.o2 += m.o2 ?? 0;
    s.water += m.water ?? 0;
    s.food += m.food ?? 0;
    s.spares += m.spares ?? 0;
    if (m.archive && !s.archive.includes(m.archive)) s.archive.push(m.archive);
  }
  return s;
}

export function has(state: MissionState, moduleId: string): boolean {
  return state.loadout.includes(moduleId);
}

export function hasFlag(state: MissionState, flag: string): boolean {
  return state.flags.includes(flag);
}

export function random(state: MissionState): [number, MissionState] {
  const [v, next] = rngNext(state.rng);
  return [v, { ...state, rng: next }];
}

export const activeCrew = (s: MissionState) => s.crew.filter((c) => c.status === 'ok' || c.status === 'injured');

export function storageCap(s: MissionState): number {
  return BASE_STORAGE_KWH + s.loadout.reduce((sum, id) => sum + (moduleById(id)?.storageKWh ?? 0), 0);
}

export function snapshot(s: MissionState): Snapshot {
  const active = activeCrew(s);
  const avg = (f: (c: (typeof s.crew)[number]) => number, list = active) =>
    list.length ? list.reduce((a, c) => a + f(c), 0) / list.length : 0;
  return {
    energy: Math.round((s.storage / storageCap(s)) * 100),
    supplies: Math.round(Math.min(s.o2, s.water, s.food)),
    crew: Math.round(avg((c) => c.health)),
    safety: Math.round(s.integrity),
    dose: Math.round(avg((c) => c.dose, s.crew)),
    science: Math.round(s.science),
  };
}
