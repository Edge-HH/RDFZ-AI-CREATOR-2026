/** Deterministic pseudo-random helpers used by replayable route events. */

export type Rng = () => number;

/** Mulberry32 is tiny, deterministic, and good enough for game balancing. */
export function createRng(seed: number): Rng {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function normalizeSeed(seed: number): number {
  const normalized = Number.isFinite(seed) ? Math.trunc(seed) : 17062026;
  return normalized >>> 0;
}

export function seededInt(rng: Rng, min: number, max: number): number {
  const lo = Math.ceil(Math.min(min, max));
  const hi = Math.floor(Math.max(min, max));
  return Math.floor(rng() * (hi - lo + 1)) + lo;
}

export function seededRange(rng: Rng, min: number, max: number): number {
  return min + (max - min) * rng();
}

export function pick<T>(rng: Rng, values: readonly T[]): T {
  if (values.length === 0) throw new Error("Cannot pick from an empty list");
  return values[Math.min(values.length - 1, Math.floor(rng() * values.length))];
}

/** Stable string hash for deriving independent event streams from one mission seed. */
export function hashSeed(seed: number, label: string): number {
  let hash = normalizeSeed(seed) ^ 0x811c9dc5;
  for (let index = 0; index < label.length; index += 1) {
    hash ^= label.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function stream(seed: number, label: string): Rng {
  return createRng(hashSeed(seed, label));
}
