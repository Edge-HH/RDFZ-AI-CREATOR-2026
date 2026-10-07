import { expect, test } from 'vitest';
import { rngNext, seedFrom } from '../src/core/rng';

test('同一种子产生相同序列', () => {
  let a = seedFrom(42), b = seedFrom(42);
  for (let i = 0; i < 20; i++) {
    const [va, na] = rngNext(a); const [vb, nb] = rngNext(b);
    expect(va).toBe(vb); a = na; b = nb;
  }
});

test('取值在 [0,1) 且分布大致均匀', () => {
  let s = seedFrom(7); let sum = 0;
  for (let i = 0; i < 10000; i++) {
    const [v, n] = rngNext(s); s = n;
    expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1); sum += v;
  }
  expect(sum / 10000).toBeGreaterThan(0.48);
  expect(sum / 10000).toBeLessThan(0.52);
});

test('不同种子产生不同序列', () => {
  expect(rngNext(seedFrom(1))[0]).not.toBe(rngNext(seedFrom(2))[0]);
});
