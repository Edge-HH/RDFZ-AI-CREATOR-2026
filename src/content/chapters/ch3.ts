import { resolveBlackout } from '../../core/blackout';
import type { Chapter, Line } from '../../core/content';
import { lightDelayMinutes } from '../../core/orbit';
import { activeCrew } from '../../core/state';
import type { MissionState } from '../../core/types';
import { fmtMin, isActive, L } from '../helpers';
import { EDL_FAULTS, EDL_POOL } from '../presets';
import { siteById } from '../sites';

function landingReport(s: MissionState): Line[] {
  const site = siteById(s.site)!;
  if (s.flags.includes('edl_abort')) {
    return [
      L('sys', '着陆器重新入轨。乘组安全，任务中止。', { tone: 'alert' }),
      L('lin', '我们离火星表面最近的时候只有 1.8 公里。'),
    ];
  }
  const injured = s.crew.filter((c) => c.status === 'injured').length;
  const lost = s.crew.filter((c) => c.status === 'lost').length;
  const out = [L('sys', `着陆确认：${site.name}。着陆器完好度 ${Math.round(s.integrity)}%。`)];
  if (lost) out.push(L('lin', '……着陆了。但是……我们失去了一位同伴。', { tone: 'cold' }));
  else if (injured) out.push(L('lin', `着陆了。有 ${injured} 人受伤，正在处理。`, { tone: 'alert' }));
  else out.push(L('lin', '祝融一号……着陆。四个人，都在。', { voice: 'ch3_04', tone: 'warm' }));
  return out;
}

export const ch3: Chapter = {
  id: 3,
  title: '第三章 · 恐怖七分钟',
  subtitle: '火星大气层外 125 公里 · 进入前 6 小时',
  teach: '预案卡：在失去联系之前，把要说的话说完',
  march: '信任：看不见的时候，靠事先说好的话。',
  scene: 'edl',
  beats: [
    {
      id: 'brief',
      title: '进入角',
      scene: 'edl',
      lines: (s) => [
        L('capcom', `单程延迟 ${fmtMin(lightDelayMinutes(s.day))}。`),
        L('qin', '着陆器会以每秒 5.8 公里的速度撞进大气。隔热罩、降落伞、反推——七分钟后，要么停在地面上，要么不。', { voice: 'ch3_01' }),
        L('qin', `而信号要走 ${Math.round(lightDelayMinutes(s.day))} 分钟。当你收到“进入大气”的那一刻，一切已经结束了。`),
        L('lin', '先定进入角吧。陡一点，落点准，但隔热罩要多吃点苦头；缓一点，温和，但落点会散开。'),
      ],
      decision: {
        kind: 'choice',
        prompt: '选择大气进入角',
        options: [
          { id: 'steep', label: '陡峭进入（−15.5°）', detail: '着陆器完好度 −8；落点精确，障碍风险大幅降低',
            effect: { flags: ['steep'], integrity: -8 }, lines: [L('lin', '陡峭进入。抓稳了。')] },
          { id: 'nominal', label: '标准进入（−14.5°）', detail: '无额外影响', effect: {}, lines: [L('lin', '标准剖面，收到。')] },
          { id: 'shallow', label: '平缓进入（−13.5°）', detail: '热负荷小；落点散布大，障碍风险上升',
            effect: { flags: ['shallow'] }, lines: [L('lin', '平缓进入，对乘员最温柔。')] },
        ],
      },
      archive: ['edl'],
    },
    {
      id: 'presets',
      title: '写入预案',
      scene: 'edl',
      key: true,
      lines: [
        L('qin', '六张卡，选三张。盲区里遇到的事，有预案就按预案办；没有的——就看他们自己了。'),
        L('qin', '你平时给他们多少信任，这时候他们就有多少底气。'),
        L('amara', '我们会照着你写的做。写清楚点，拜托了。'),
      ],
      decision: { kind: 'presets', prompt: '着陆预案：选择 3 张', pool: EDL_POOL, pick: 3 },
      resolve: (s) => {
        const r = resolveBlackout(s, EDL_FAULTS);
        const head: Line[] = [
          L('sys', '— 通信盲区 · 着陆器已进入大气 —', { tone: 'cold' }),
          L('ai', '着陆器自主程序运行中。本机无权干预，也来不及干预。'),
          L('sys', 'E+0:00 进入大气 · E+1:20 等离子体黑障 · E+4:10 开伞 · E+5:40 抛隔热罩 · E+6:30 动力下降'),
        ];
        return { state: r.state, lines: [...head, ...r.lines, ...landingReport(r.state)] };
      },
      days: 1,
    },
    {
      id: 'wait',
      title: '十三分钟',
      scene: 'landing',
      when: (s) => !s.flags.includes('aborted'),
      lines: (s) => [
        L('qin', '……你知道吗，2025 年，我也坐在这个位置上，等一个着陆器的信号。'),
        L('qin', '那次是无人的，叫“远航一号”。着陆前四分钟，我发了一条修正指令。'),
        L('qin', '……先不说了。看看他们吧。'),
        activeCrew(s).length === 4
          ? L('rin', '我能看见地平线了。总师——这里是火星。', { voice: 'ch3_05', tone: 'warm' })
          : L('andrei', '我们会照顾好彼此。', { tone: 'cold' }),
      ],
    },
    {
      id: 'first_step',
      title: '第一步',
      scene: 'landing',
      when: (s) => !s.flags.includes('aborted'),
      lines: [
        L('lin', '舱外检查完毕。谁先踏出去？这是人类在另一颗行星上的第一步。'),
        L('zhou', '全世界都在看。按礼仪，应该是指令长。'),
      ],
      decision: {
        kind: 'choice',
        prompt: '谁迈出人类在火星上的第一步？',
        options: [
          { id: 'lin', label: '指令长林照', requires: (s) => isActive(s, 'lin'), lockedReason: '林照无法出舱', detail: '林照信任 +6', effect: { crew: { lin: { trust: 6, morale: 5 } } },
            lines: [L('lin', '这一步，属于所有仰望过星空的人。', { voice: 'ch3_06' })] },
          { id: 'rin', label: '地质学家早川凛', requires: (s) => isActive(s, 'rin'), lockedReason: '凛无法出舱', detail: '凛士气 +10 · 科研 +3', effect: { science: 3, crew: { rin: { morale: 10, trust: 6 } } },
            lines: [L('rin', '我……我先摸摸这块石头。对不起，我太激动了。')] },
          { id: 'all', label: '四个人手拉手一起', detail: '全员士气 +5 · 信任 +3', effect: { crew: { all: { morale: 5, trust: 3 } } },
            lines: [L('amara', '一、二、三——！'), L('andrei', '这是我见过最不标准、也最好的第一步。')] },
        ],
      },
      archive: ['sol'],
    },
  ],
};
