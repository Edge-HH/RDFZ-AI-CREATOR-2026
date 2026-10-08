import { describe, expect, test } from 'vitest';
import { CHAPTERS } from '../src/content';
import { autoplay, randomPolicy, heuristicPolicy, type Policy } from '../src/sim/autoplay';
import { CAST } from '../src/content/cast';
import type { Line } from '../src/core/content';
import { Game } from '../src/core/flow';
import { rngNext, seedFrom } from '../src/core/rng';
import { ARRIVAL_DAY, RETURN_DAY } from '../src/core/orbit';
import { ARCHIVE } from '../src/content/archive';
import { MODULES } from '../src/content/modules';
import { PRESETS } from '../src/content/presets';
import { journey } from '../src/content/journey';
import { createState } from '../src/core/state';

const ENDING_IDS = ['triumph', 'safe', 'stayed', 'cost', 'abort', 'silent', 'letgo'];

describe('完整内容自动通关', () => {
  test('随机策略 300 局全部走到结局且不抛错', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const r = autoplay(CHAPTERS, seed, randomPolicy);
      expect(ENDING_IDS).toContain(r.ending);
      expect(r.steps).toBeLessThan(200);
    }
  });

  test('启发式策略同样能完整通关', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const r = autoplay(CHAPTERS, seed, heuristicPolicy);
      expect(ENDING_IDS).toContain(r.ending);
    }
  });

  test('几乎所有节拍都能被访问到', () => {
    const visited = new Set<string>();
    for (let seed = 1; seed <= 600; seed++) {
      for (const id of autoplay(CHAPTERS, seed, seed % 2 ? randomPolicy : heuristicPolicy).beats) visited.add(id);
    }
    const all = CHAPTERS.flatMap((c) => c.beats.map((b) => `${c.id}:${b.id}`));
    // pre_conj 是兜底节拍：仅在医生于第四章前已离开时触发，属于罕见路径
    const FALLBACK = new Set(['4:pre_conj']);
    const missing = all.filter((id) => !visited.has(id) && !FALLBACK.has(id));
    expect(missing).toEqual([]);
  });

  test('时间轴：着陆章从抵达日开始，正常返回时停在返回日', () => {
    let checked = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const r = autoplay(CHAPTERS, seed, heuristicPolicy);
      expect(r.chapterStartDays[3]).toBe(ARRIVAL_DAY);
      if (r.reachedHome) { expect(r.state.day).toBe(RETURN_DAY); checked++; }
    }
    expect(checked).toBeGreaterThan(10);
  });

  test('内容引用的档案、模块、预案都存在', () => {
    const archiveIds = new Set(ARCHIVE.map((a) => a.id));
    for (const m of MODULES) if (m.archive) expect(archiveIds.has(m.archive)).toBe(true);
    for (const c of CHAPTERS) for (const b of c.beats) for (const a of b.archive ?? []) expect(archiveIds.has(a)).toBe(true);
    for (const site of ['utopia', 'jezero', 'arcadia']) expect(archiveIds.has(`site_${site}`)).toBe(true);
    expect(PRESETS.length).toBeGreaterThanOrEqual(12);
  });
});

describe('知识档案', () => {
  test('每张档案卡在内容中都有解锁途径', async () => {
    const { readFileSync, readdirSync } = await import('node:fs');
    const src = ['src/content/modules.ts', ...readdirSync('src/content/chapters').map((f) => `src/content/chapters/${f}`)]
      .map((p) => readFileSync(p, 'utf8')).join('\n');
    const unreachable = ARCHIVE.map((a) => a.id).filter((id) => !id.startsWith('site_') && !src.includes(`'${id}'`));
    expect(unreachable).toEqual([]);
  });
  test('征程长卷：前人四程、你这一程、下一程，留守者会被写进下一程', () => {
    const s = createState(1);
    const j = journey(s, '平安归来', 'A');
    expect(j.map((x) => x.kind)).toEqual(['past', 'past', 'past', 'past', 'now', 'next']);
    expect(j[4].note).toContain('平安归来');
    expect(j[4].note).toContain('A');
    const stayed = { ...s, crew: s.crew.map((c) => (c.id === 'rin' ? { ...c, status: 'stayed' as const } : c)) };
    expect(journey(stayed, '留守者', 'B')[5].note).toContain(CAST.rin.name);
  });
  test('档案链接都是 https 地址', () => {
    for (const a of ARCHIVE) for (const l of a.links ?? []) expect(l.url).toMatch(/^https:\/\//);
  });
});

// 逐局收集频道里出现的全部台词
function playLines(seed: number, policy: Policy): Line[] {
  const g = new Game(CHAPTERS, seed, 'standard');
  let r = seedFrom(seed * 31 + 7);
  const rand = () => { const [v, n] = rngNext(r); r = n; return v; };
  const lines: Line[] = [];
  for (let steps = 0; g.stage !== 'ending' && steps < 500; steps++) {
    const view = g.view();
    if (view.stage === 'chapterEnd') { g.next(); continue; }
    lines.push(...view.lines);
    if (view.beat.decision) lines.push(...g.choose(policy(view, g.state, rand)).lines);
    else g.next();
  }
  return lines;
}

describe('致敬彩蛋（《流浪地球》）', () => {
  const runs = Array.from({ length: 40 }, (_, i) => playLines(i + 1, i % 2 ? randomPolicy : heuristicPolicy));

  test('所有台词的发言者都在角色表里', () => {
    for (const lines of runs) for (const l of lines) expect(CAST[l.speaker]).toBeDefined();
  });
  test('550A-Preview 每局都会在频道里发言', () => {
    expect(CAST.ai.name).toBe('550A-Preview');
    for (const lines of runs) expect(lines.some((l) => l.speaker === 'ai')).toBe(true);
  });
  test('走到火星地表的对局里都能见到笨笨', () => {
    const surface = runs.filter((lines) => lines.some((l) => l.text.includes('火星日')));
    expect(surface.length).toBeGreaterThan(20);
    for (const lines of surface) expect(lines.some((l) => l.text.includes('笨笨'))).toBe(true);
  });
});
