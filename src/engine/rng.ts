/** mulberry32：确定性随机数，状态是一个 32 位整数，保存在游戏状态中，保证同种子+同选择可复盘 */
export function nextRandom(state: number): [number, number] {
  let t = (state + 0x6d2b79f5) | 0;
  const next = t;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return [value, next];
}

export function seedFrom(input: string | number): number {
  if (typeof input === 'number') return input >>> 0;
  let h = 2166136261;
  for (const ch of input) {
    h ^= ch.codePointAt(0)!;
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 900000) + 100000;
}
