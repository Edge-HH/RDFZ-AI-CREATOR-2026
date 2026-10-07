import { describe, expect, test } from 'vitest';
import { Game } from '../src/core/flow';
import type { Chapter } from '../src/core/content';

// 最小假内容：两章，覆盖台词条件、选择、风险、时间推进、章节切换、中止与结局
const chapters: Chapter[] = [
  {
    id: 0, title: '测试一', subtitle: '', teach: '',
    beats: [
      { id: 'a', lines: [{ speaker: 'qin', text: '你好' }, { speaker: 'lin', text: '隐藏', when: (s) => s.flags.includes('x') }] },
      {
        id: 'b',
        lines: [{ speaker: 'lin', text: '选择吧' }],
        decision: {
          kind: 'choice', prompt: '?', options: [
            { id: 'safe', label: '稳妥', effect: { flags: ['x'] }, lines: [{ speaker: 'lin', text: '收到' }] },
            { id: 'locked', label: '锁定', requires: () => false, lockedReason: '不可用' },
            { id: 'gamble', label: '冒险', risk: { base: 0.95, label: '失败', fail: { integrity: -50 }, failLines: [{ speaker: 'sys', text: '失败了' }] } },
            { id: 'quit', label: '中止', effect: { flags: ['aborted'] } },
            { id: 'sure', label: '必成', risk: { base: 0.01, label: '失败', fail: {}, ok: { science: 9 } } },
          ],
        },
        days: 10,
      },
      { id: 'c', when: (s) => s.flags.includes('x'), lines: [{ speaker: 'qin', text: '只在稳妥后出现' }] },
    ],
  },
  {
    id: 1, title: '测试二', subtitle: '', teach: '',
    beats: [{ id: 'd', lines: [{ speaker: 'qin', text: '第二章' }], decision: { kind: 'autonomy', prompt: '授权' } }],
  },
];

describe('流程引擎', () => {
  test('开局位于第一章第一个节拍，按条件过滤台词', () => {
    const g = new Game(chapters, 1);
    const view = g.view();
    expect(view.chapter.id).toBe(0);
    expect(view.beat.id).toBe('a');
    expect(view.lines.map((l) => l.text)).toEqual(['你好']);
  });

  test('无决策节拍用 next() 推进', () => {
    const g = new Game(chapters, 1);
    g.next();
    expect(g.view().beat.id).toBe('b');
  });

  test('锁定选项不可选并给出原因', () => {
    const g = new Game(chapters, 1);
    g.next();
    const locked = g.view().options!.find((o) => o.id === 'locked')!;
    expect(locked.enabled).toBe(false);
    expect(locked.lockedReason).toBe('不可用');
    expect(() => g.choose({ kind: 'choice', optionId: 'locked' })).toThrow();
  });

  test('选择后应用效果、推进时间、记录历史，并跳到满足条件的下一个节拍', () => {
    const g = new Game(chapters, 1);
    g.next();
    const day0 = g.state.day;
    const res = g.choose({ kind: 'choice', optionId: 'safe' });
    expect(res.lines.map((l) => l.text)).toContain('收到');
    expect(g.state.flags).toContain('x');
    expect(g.state.day).toBe(day0 + 10);
    expect(g.state.history.at(-1)!.label).toContain('稳妥');
    expect(g.view().beat.id).toBe('c');
  });

  test('条件不满足的节拍被跳过；章末进入章节结算，再进入下一章', () => {
    const g = new Game(chapters, 1);
    g.next();
    g.choose({ kind: 'choice', optionId: 'gamble' });
    expect(g.view().stage).toBe('chapterEnd');
    g.next();
    expect(g.view().chapter.id).toBe(1);
  });

  test('风险选项给出不确定区间，失败时应用失败效果与台词', () => {
    const g = new Game(chapters, 1);
    g.next();
    const opt = g.view().options!.find((o) => o.id === 'gamble')!;
    expect(opt.risk!.high).toBeGreaterThan(0.5);
    const res = g.choose({ kind: 'choice', optionId: 'gamble' });
    expect(res.riskFailed).toBe(true);
    expect(g.state.integrity).toBe(50);
    expect(res.lines.map((l) => l.text)).toContain('失败了');
  });

  test('风险成功时应用成功效果', () => {
    const g = new Game(chapters, 1);
    g.next();
    const res = g.choose({ kind: 'choice', optionId: 'sure' });
    expect(res.riskFailed).toBe(false);
    expect(g.state.science).toBe(9);
  });

  test('中止标记立即进入结局', () => {
    const g = new Game(chapters, 1);
    g.next();
    g.choose({ kind: 'choice', optionId: 'quit' });
    expect(g.view().stage).toBe('ending');
    expect(g.view().ending).toBe('abort');
  });

  test('最后一章结束后进入结局', () => {
    const g = new Game(chapters, 1);
    g.next();
    g.choose({ kind: 'choice', optionId: 'safe' });
    g.next(); // c
    g.next(); // chapterEnd → 第二章
    g.choose({ kind: 'autonomy', level: 3 });
    expect(g.state.autonomy).toBe(3);
    expect(g.view().stage).toBe('chapterEnd');
    g.next();
    expect(g.view().stage).toBe('ending');
  });

  test('存档与读档还原进度和状态', () => {
    const g = new Game(chapters, 1);
    g.next();
    g.choose({ kind: 'choice', optionId: 'safe' });
    const saved = g.serialize();
    const h = Game.restore(chapters, saved);
    expect(h.view().beat.id).toBe('c');
    expect(h.state).toEqual(g.state);
  });

  test('同一种子同一选择序列得到完全相同的状态', () => {
    const run = () => {
      const g = new Game(chapters, 77);
      g.next();
      g.choose({ kind: 'choice', optionId: 'gamble' });
      return g.state;
    };
    expect(run()).toEqual(run());
  });
});
