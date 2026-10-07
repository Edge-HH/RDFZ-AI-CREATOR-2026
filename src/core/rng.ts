// mulberry32：状态是一个 32 位整数，可序列化进存档，保证同种子可复现
export function seedFrom(n: number): number {
  return (Math.floor(n) ^ 0x9e3779b9) >>> 0;
}

export function rngNext(state: number): [number, number] {
  const next = (state + 0x6d2b79f5) >>> 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return [value, next];
}
