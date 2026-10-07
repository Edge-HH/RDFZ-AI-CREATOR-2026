import type { Chapter } from '../../core/content';
import { earthMarsDelayMinutes } from '../../core/orbit';
import { fmtMin, L } from '../helpers';

export const ch0: Chapter = {
  id: 0,
  title: '序章 · 交接班',
  subtitle: '北京航天飞控中心 · 发射前 40 天 · 凌晨 2:17',
  teach: '光速延迟：你看到的一切，都是过去',
  scene: 'control',
  beats: [
    {
      id: 'arrive',
      title: '接班',
      scene: 'control',
      lines: [
        L('sys', '燧火计划 · 祝融一号载人火星任务 · 飞控大厅'),
        L('qin', '来了？坐吧。这把椅子，从明天起就是你的了。', { voice: 'ch0_01' }),
        L('qin', '四个人，九百七十多天，最远的时候离我们三亿多公里。'),
        L('qin', '在这间屋子里，你最先要学会的不是操作，是等待。', { voice: 'ch0_02' }),
        L('capcom', '总师，火星中继星「烽燧」链路在线。'),
      ],
    },
    {
      id: 'ping',
      title: '第一条指令',
      scene: 'control',
      lines: (s) => [
        L('capcom', `当前地火单程光速延迟：${fmtMin(earthMarsDelayMinutes(s.day))}。`),
        L('qin', '给中继星发一条自检指令。然后——看着那个倒计时。'),
      ],
      decision: { kind: 'command', prompt: '向火星中继星「烽燧」发送自检指令' },
      resolve: (s) => {
        const d = earthMarsDelayMinutes(s.day);
        return {
          state: s,
          lines: [
            L('sys', `回执到达。「烽燧」状态：正常。往返耗时 ${fmtMin(d * 2)}。`),
            L('qin', `你刚才看到的“正常”，是它 ${Math.round(d)} 分钟前的样子。`),
            L('qin', '在那之后发生了什么，你不知道。谁也不知道。'),
          ],
        };
      },
      archive: ['light_delay'],
    },
    {
      id: 'question',
      title: '老秦的问题',
      scene: 'control',
      lines: [L('qin', '那我问你：如果它就在这几分钟里出了故障，你该怎么做？')],
      decision: {
        kind: 'choice',
        prompt: '如果远方的设备在信号途中出了故障……',
        options: [
          { id: 'command', label: '立刻发指令，让它重启',
            effect: { flags: ['qin_q_control'] },
            lines: [L('qin', '等你的指令到了，又是十几分钟以后。来回半个小时，什么都可能发生了。'), L('qin', '……我年轻的时候，也是这么回答的。')] },
          { id: 'preset', label: '让它按预先写好的程序自己处理',
            effect: { flags: ['qin_q_trust'] },
            lines: [L('qin', '对。我们能做的，是在它出事之前，把该说的话说完。', { voice: 'ch0_04' }), L('qin', '这句话，我花了很多年才学会。')] },
          { id: 'wait', label: '先等更多数据再判断',
            effect: { flags: ['qin_q_wait'] },
            lines: [L('qin', '等待也是一种决定。有时候是对的，有时候……'), L('qin', '算了，以后你会知道的。')] },
        ],
      },
    },
    {
      id: 'panels',
      title: '控制台',
      scene: 'control',
      lines: [
        L('qin', '看左边。时间、能源、物资、人员、安全——五样东西，少了哪样，他们都回不来。'),
        L('qin', '右边是通信频道。从火星来的每句话，都标着它是几分钟前说的。'),
        L('qin', '你的每个决定，都会有人替你在火星上把它活一遍。'),
        L('capcom', '乘组视频连线接入。他们还在文昌，没有延迟。'),
        L('lin', '总师好，我是林照。以后我们的命就交给你们了——开玩笑的，交给我们自己。'),
        L('amara', '阿玛拉！我负责把坏掉的东西修好，包括心情。'),
        L('andrei', '沃尔科夫，乘组医生。请提醒他们按时睡觉，他们不会听我的。'),
        L('rin', '早川凛。火星上的每一块石头都在等我——啊，还有，请多指教。'),
        L('qin', '去吧。先把他们的行李装好。'),
      ],
    },
  ],
};
