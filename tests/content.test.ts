import { describe, expect, test } from 'vitest';
import { CHAPTERS } from '../src/content';
import { autoplay, randomPolicy, heuristicPolicy } from '../src/sim/autoplay';
import { ARRIVAL_DAY, RETURN_DAY } from '../src/core/orbit';
import { ARCHIVE } from '../src/content/archive';
import { MODULES } from '../src/content/modules';
import { PRESETS } from '../src/content/presets';

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
  test('档案链接都是 https 地址', () => {
    for (const a of ARCHIVE) for (const l of a.links ?? []) expect(l.url).toMatch(/^https:\/\//);
  });
});
