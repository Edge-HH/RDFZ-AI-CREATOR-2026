import type { CrewDelta, Effect, MissionState } from './types';

const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));

// 叙事模式：负面效果减半（信任除外）
const soften = (s: MissionState, v: number) => (s.mode === 'story' && v < 0 ? v / 2 : v);

function applyCrewDelta(s: MissionState, c: MissionState['crew'][number], d: CrewDelta) {
  if (d.health !== undefined) c.health = clamp(c.health + soften(s, d.health));
  if (d.morale !== undefined) c.morale = clamp(c.morale + soften(s, d.morale));
  if (d.trust !== undefined) c.trust = clamp(c.trust + d.trust);
  if (d.dose !== undefined) c.dose = Math.max(0, c.dose + d.dose);
  if (d.status !== undefined) c.status = d.status;
  if (c.health <= 0 && c.status !== 'stayed') c.status = 'lost';
}

export function applyEffect(state: MissionState, e: Effect): MissionState {
  const s = structuredClone(state);
  if (e.day) s.day += e.day;
  if (e.storage) s.storage = Math.max(0, s.storage + soften(s, e.storage));
  if (e.o2) s.o2 = Math.max(0, s.o2 + soften(s, e.o2));
  if (e.water) s.water = Math.max(0, s.water + soften(s, e.water));
  if (e.food) s.food = Math.max(0, s.food + soften(s, e.food));
  if (e.spares) s.spares = Math.max(0, s.spares + e.spares);
  if (e.integrity) s.integrity = clamp(s.integrity + soften(s, e.integrity));
  if (e.science) s.science = Math.max(0, s.science + e.science);
  if (e.propellant) s.propellant = clamp(s.propellant + soften(s, e.propellant), 0, 120);
  if (e.dustTau !== undefined) s.dustTau = e.dustTau;
  if (e.autonomy !== undefined) {
    s.autonomy = clamp(e.autonomy, 0, 3);
    s.autonomyLog.push(s.autonomy);
  }
  if (e.site) s.site = e.site;
  if (e.presets) s.presets = [...e.presets];
  if (e.loadout) s.loadout = [...s.loadout, ...e.loadout];
  if (e.crew) {
    for (const [key, delta] of Object.entries(e.crew)) {
      if (!delta) continue;
      const targets = key === 'all'
        ? s.crew.filter((c) => c.status === 'ok' || c.status === 'injured')
        : s.crew.filter((c) => c.id === key);
      for (const c of targets) applyCrewDelta(s, c, delta);
    }
  }
  if (e.flags) for (const f of e.flags) if (!s.flags.includes(f)) s.flags.push(f);
  if (e.clearFlags) s.flags = s.flags.filter((f) => !e.clearFlags!.includes(f));
  if (e.archive) for (const a of e.archive) if (!s.archive.includes(a)) s.archive.push(a);
  return s;
}

export function applyEffects(state: MissionState, effects: (Effect | undefined)[]): MissionState {
  return effects.reduce<MissionState>((s, e) => (e ? applyEffect(s, e) : s), state);
}
