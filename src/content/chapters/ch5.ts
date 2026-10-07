import type { Chapter, Line } from '../../core/content';
import { avgAutonomy, avgTrust } from '../../core/endings';
import { lightDelayMinutes, RETURN_DAY } from '../../core/orbit';
import { activeCrew, hasFlag } from '../../core/state';
import type { CrewId, Effect, MissionState } from '../../core/types';
import { CAST } from '../cast';
import { fmtMin, isActive, L } from '../helpers';

const gap = (s: MissionState) => Math.max(0, Math.ceil(100 - s.propellant));
const anyStayed = (s: MissionState) => s.crew.some((c) => c.status === 'stayed');
const volunteer = (s: MissionState): CrewId | null =>
  (['rin', 'amara', 'lin', 'andrei'] as CrewId[]).find((id) => isActive(s, id)) ?? null;

function finalLines(s: MissionState): Line[] {
  const home = activeCrew(s);
  const out: Line[] = [L('sys', `任务第 ${s.day} 天 · 返回舱溅落 · 南海预定海域`)];
  if (home.length === 0) return out;
  out.push(L('lin', '这里是祝融一号。我们……回来了。', { voice: 'ch5_05', tone: 'warm' }));
  const stayed = s.crew.find((c) => c.status === 'stayed');
  if (stayed) out.push(L(stayed.id, '（火星，延迟 14 分钟）替我看看海。下一个窗口见。', { tone: 'warm' }));
  const lost = s.crew.filter((c) => c.status === 'lost');
  for (const c of lost) out.push(L('sys', `${CAST[c.id].name}的名字，被刻在了着陆点的一块石头上。`, { tone: 'cold' }));
  return out;
}

export const ch5: Chapter = {
  id: 5,
  title: '第五章 · 归途',
  subtitle: '火星表面 · 返程窗口前 5 天',
  teach: '最终抉择：带谁、带什么回家',
  scene: 'ascent',
  beats: [
    {
      id: 'fuel',
      title: '推进剂核算',
      scene: 'ascent',
      when: (s) => gap(s) > 0,
      key: true,
      lines: (s) => [
        L('amara', `推进剂工厂最终产量：${Math.round(s.propellant)}%。上升器需要 100% 才能进入与返回飞船交会的轨道。`, { tone: 'alert' }),
        L('amara', `还差 ${gap(s)}%。要么减重，要么想办法补上。`),
        L('lin', '窗口只有五天。错过了，下一次是 26 个月以后。'),
      ],
      decision: {
        kind: 'choice',
        prompt: '推进剂缺口怎么补？',
        options: [
          { id: 'dump', label: '抛弃部分样本与设备减重', detail: (s) => `科研 −${gap(s) * 3}（缺口不超过 15% 时可用）`,
            requires: (s) => gap(s) <= 15, lockedReason: '缺口太大，减重补不上',
            effect: (s) => ({ science: -gap(s) * 3, propellant: gap(s) }),
            lines: [L('rin', '……我来挑哪些留下。别看我，我没事。', { tone: 'cold' })] },
          { id: 'water', label: '电解储备水，应急补充推进剂', detail: (s) => `水 −${gap(s) * 4} 天（需要足够的水）`,
            requires: (s) => s.water >= gap(s) * 4 + 20, lockedReason: '储备水不够',
            effect: (s) => ({ water: -gap(s) * 4, propellant: gap(s) }),
            lines: [L('amara', '电解槽全速运转三天三夜。我们会渴一点，但能回家。')] },
          { id: 'stay', label: '一人留守火星，等待下一个窗口', detail: '减重补足缺口；留守者将在火星独自等待 26 个月',
            requires: (s) => gap(s) <= 30 && activeCrew(s).length >= 2, lockedReason: '缺口太大或人数不足',
            effect: (s) => ({ propellant: gap(s), crew: { [volunteer(s)!]: { status: 'stayed', trust: 10 } } as Effect['crew'] }),
            lines: (s) => [L(volunteer(s) ?? 'lin', '我留下。下一批人来的时候，总得有人去接他们。', { voice: 'ch5_01' }), L('lin', '……我们会回来接你的。')] },
          { id: 'risk', label: '以低余量冒险起飞', detail: '上升段失败的风险大幅上升',
            effect: { flags: ['low_fuel_ascent'] }, lines: [L('lin', '……收到。我们赌一把。')] },
        ],
      },
    },
    {
      id: 'stay_request',
      title: '凛的请求',
      scene: 'surface',
      when: (s) => !anyStayed(s) && isActive(s, 'rin') && s.crew.find((c) => c.id === 'rin')!.trust >= 70 && s.science >= 100,
      lines: [
        L('rin', '总师，我有个请求。下一批补给和乘组 26 个月后就到，营地的生保可以支撑一个人。'),
        L('rin', '我想留下来，把三角洲……不，把这里的研究做完。我知道这很自私。'),
        L('andrei', '一个人在火星上待两年多。我作为医生，反对。作为朋友……我理解她。'),
      ],
      decision: {
        kind: 'choice',
        prompt: '早川凛请求留守火星',
        options: [
          { id: 'accept', label: '同意她留下', detail: '科研 +30（持续研究计入本任务）；凛将留在火星',
            effect: { science: 30, crew: { rin: { status: 'stayed', trust: 15 } } },
            lines: [L('rin', '谢谢你。我会每天给你们发照片——延迟十几分钟的那种。', { voice: 'ch5_02', tone: 'warm' })] },
          { id: 'refuse', label: '不同意，大家一起回家', detail: '凛信任 −8',
            effect: { crew: { rin: { trust: -8 } } }, lines: [L('rin', '……我明白。下次吧。')] },
          { id: 'lin_decides', label: '交给指令长决定', detail: '需要授权度 ≥ 2',
            requires: (s) => s.autonomy >= 2, lockedReason: '授权度不足',
            effect: { crew: { lin: { trust: 5 } } },
            lines: [L('lin', '我们四个一起来的，就四个一起走。凛，下一个窗口，我陪你回来。'), L('rin', '……说好了。')] },
        ],
      },
    },
    {
      id: 'qin',
      title: '远航一号',
      scene: 'control',
      key: true,
      lines: [
        L('capcom', '总师，有人找你。'),
        L('qin', '退休了，闲不住，就回来看看。', { voice: 'ch5_03' }),
        L('qin', '2025 年的“远航一号”，我一直没说完。'),
        L('qin', '着陆前四分钟，我看到落点附近有一片可疑的阴影，就发了一条修正指令。'),
        L('qin', '指令飞了十一分钟。到的时候，着陆器已经自己找到了安全点——我的指令把它拽回了那片乱石里。'),
        L('qin', '它本来能活下来的。如果我没有伸手。'),
        L('qin', '所以这三年，我一直在看你。看你什么时候伸手，什么时候放手。'),
      ],
      decision: {
        kind: 'choice',
        prompt: '你想对老秦说什么？',
        options: [
          { id: 'letgo', label: '“我学会了放手。”', detail: '需要整局平均授权度 ≥ 2，且乘组信任 ≥ 60',
            requires: (s) => avgAutonomy(s) >= 2 && avgTrust(s) >= 60, lockedReason: '你一直没有真正放手过',
            effect: { flags: ['qin_resolved'] },
            lines: [L('qin', '……嗯。那条指令，我终于可以不再想了。', { voice: 'ch5_04', tone: 'warm' }), L('qin', '谢谢你。')] },
          { id: 'hold', label: '“我还是选择握紧。”',
            lines: [L('qin', '也好。握紧的人，也救过很多人。每个总师都得自己找答案。')] },
          { id: 'silent', label: '（沉默）',
            lines: [L('qin', '……不用说。我都懂。'), L('sys', '老秦拍了拍你的肩膀，走了。')] },
        ],
      },
    },
    {
      id: 'ascent',
      title: '上升',
      scene: 'ascent',
      key: true,
      lines: (s) => [
        L('sys', `返程窗口 · 上升器推进剂 ${Math.round(s.propellant)}% · 完好度 ${Math.round(s.integrity)}%`),
        L('amara', '所有检查完成。说实话，我有点舍不得这里。'),
        L('lin', `等你的“点火”。它会在 ${fmtMin(lightDelayMinutes(s.day))} 后到达——我们准备好了。`),
      ],
      decision: {
        kind: 'choice',
        prompt: '上升器点火',
        options: [
          { id: 'go', label: '批准点火',
            risk: { base: 0.04, label: '上升段失败',
              mod: (s) => (hasFlag(s, 'low_fuel_ascent') ? 0.35 : 0) + (s.integrity < 50 ? 0.12 : 0),
              fail: (s) => (hasFlag(s, 'low_fuel_ascent')
                ? { flags: ['silent'] }
                : { integrity: -20, crew: { all: { health: -15 } } }),
              failLines: (s) => (hasFlag(s, 'low_fuel_ascent')
                ? [L('sys', '上升器在 41 公里高度推进剂耗尽，未能进入交会轨道。', { tone: 'cold' }), L('sys', '最后一帧遥测：舱内四人，心率平稳。', { tone: 'cold' })]
                : [L('sys', '上升段一台发动机提前关机，返回飞船启用备份燃料完成捕获。乘员受到冲击。', { tone: 'alert' })]),
              okLines: [L('lin', '入轨。交会对接完成。'), L('amara', '再见了，火星。')] },
            lines: [L('lin', '点火！')] },
        ],
      },
      days: (s) => Math.max(0, RETURN_DAY - s.day),
      archive: ['sabatier'],
    },
    {
      id: 'home',
      title: '回家',
      scene: 'home',
      lines: finalLines,
    },
  ],
};

