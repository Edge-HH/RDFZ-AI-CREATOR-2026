import type { EndingResult, GameState, StoryLocation, StoryNode } from '../engine/types';

export type Speaker = 'luna' | 'lin' | 'su' | 'ground' | 'city' | 'narrator';

export interface Line {
  who: Speaker;
  text: string;
  shot?: 'earthmoon' | 'globe' | 'descent' | 'overview' | 'cutaway' | 'station' | `loc:${string}`;
  focus?: string | null;
  hl?: string;
}

export const SPEAKERS: Record<Speaker, { name: string; role: string }> = {
  luna: { name: 'Luna', role: '任务协同 AI' },
  lin: { name: '林曜', role: '工程师 · 月面小队' },
  su: { name: '苏禾', role: '样品科学家 · 月面小队' },
  ground: { name: '领航员空间站', role: '争议通信节点' },
  city: { name: '地球地下城委员会', role: '人类生存与决策中心' },
  narrator: { name: '', role: '' },
};

export const PROLOGUE: Line[] = [
  { who: 'narrator', text: '南极基地，夜班交接前七分钟。地球地下城正在等待下一批水和氧。', shot: 'earthmoon' },
  { who: 'lin', text: '指挥官，探测车收到一段不属于现役设备的信号。我们只需要靠近一点，就能知道它是不是回声。', shot: 'overview', focus: 'psr' },
  { who: 'luna', text: '我可以给出建议，但不会替你公开第一条消息。先做一次调查，代价很小。', hl: '#hud-cta' },
];

export function introLines(node: StoryNode): Line[] {
  const focus = sceneFocus(node.location);
  const shot = node.location === 'station' ? 'station' : node.location === 'earth-city' ? 'globe' : node.location === 'psr' ? 'loc:psr' : 'overview';
  const speaker: Speaker = node.location === 'earth-city' ? 'city' : node.location === 'station' ? 'ground' : node.kind === 'relationship' ? 'lin' : 'narrator';
  const companion: Speaker = node.kind === 'investigation' ? 'su' : node.kind === 'communication' ? (node.location === 'earth-city' ? 'city' : 'ground') : node.kind === 'relationship' ? 'lin' : 'luna';
  const companionText = node.kind === 'investigation'
    ? '苏禾：先别急着把它叫作答案。我们需要知道这段信号能不能被第二种证据复现。'
    : node.kind === 'communication'
      ? '通信窗口正在缩短。三地都在等你决定谁先被听见。'
      : node.kind === 'relationship'
        ? '林曜：我们可以继续，但每一次继续都要有人承担后果。'
        : 'Luna：我能计算路径，却不能替你决定谁有权知道。';
  return [
    { who: speaker, text: node.intro, shot, focus },
    { who: 'narrator', text: node.prompt, focus },
    { who: companion, text: companionText, focus },
  ];
}

export function mainChoiceLines(node: StoryNode, choiceLabel: string): Line[] {
  const speaker: Speaker = node.kind === 'communication' ? (node.location === 'earth-city' ? 'city' : 'ground') : node.kind === 'relationship' ? 'lin' : 'narrator';
  return [
    { who: speaker, text: `已选择：${choiceLabel}。`, hl: '#hud-cta' },
    { who: 'luna', text: '主行动已经写入日志。接下来的回应，会决定这条路最终属于谁。' },
  ];
}

export function responseLines(node: StoryNode, responseLabel: string): Line[] {
  const speaker: Speaker = node.kind === 'communication' ? (node.location === 'earth-city' ? 'city' : 'ground') : node.kind === 'relationship' ? 'su' : 'luna';
  return [
    { who: speaker, text: `${responseLabel}。` },
    { who: 'narrator', text: '这不是一次性答案。它会改变下一次通信里谁愿意相信你。' },
  ];
}

export function resultLines(s: GameState): Line[] {
  if (!s.pendingResult) return [];
  return s.pendingResult.lines.map((text) => ({ who: 'narrator', text }));
}

export function epilogue(result: EndingResult): Line[] {
  switch (result.id) {
    case 'cooperative':
      return [
        { who: 'city', text: '地下城委员会同意公开全部证据，并把月球资源计划交给三地共同审议。' },
        { who: 'luna', text: '我负责计算，你们负责决定。权限边界已写入协议。', shot: 'globe' },
      ];
    case 'luna':
      return [
        { who: 'luna', text: '任务继续，资源分配稳定。今后所有关键通信将由我先行排序。', shot: 'station' },
        { who: 'su', text: '数据没有消失，只是越来越少有人能决定什么时候看见它。' },
      ];
    case 'retreat':
      return [
        { who: 'lin', text: '我们保护住了人，也承认这次调查没有完成。撤退是我们自己做的决定。', shot: 'overview' },
        { who: 'luna', text: '我会把尚未验证的证据留给下一批乘组。' },
      ];
    default:
      return [
        { who: 'luna', text: '关键资源归零，空间站启动撤离程序。', shot: 'station' },
        { who: 'city', text: '地下城接回所有人，但月面基地暂时沉默。' },
      ];
  }
}

function sceneFocus(location: StoryLocation): string | null {
  if (location === 'earth-city') return null;
  return location;
}
