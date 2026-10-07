import type { EndingId } from '../core/endings';
import { activeCrew } from '../core/state';
import type { MissionState } from '../core/types';
import { CAST } from './cast';

export interface EndingText {
  title: string;
  epigraph: string;
  body: (s: MissionState) => string[];
  tone: 'bright' | 'warm' | 'grey' | 'dark';
}

const names = (s: MissionState, f: (st: MissionState['crew'][number]['status']) => boolean) =>
  s.crew.filter((c) => f(c.status)).map((c) => CAST[c.id].name).join('、');

export const ENDINGS: Record<EndingId, EndingText> = {
  triumph: {
    title: '满载而归', tone: 'bright',
    epigraph: '他们带回了火星，也带回了自己。',
    body: (s) => [
      `四名乘员全部返回地球，带回的样本与数据将让全世界的实验室忙上二十年。`,
      `科研产出 ${Math.round(s.science)}。在新闻发布会上，林照把话筒递给了凛。`,
      '你在飞控大厅里坐了很久。屏幕上的延迟读数，终于归零了。',
    ],
  },
  safe: {
    title: '平安归来', tone: 'warm',
    epigraph: '有些胜利，只是所有人都回来了。',
    body: (s) => [
      `${names(s, (st) => st === 'ok' || st === 'injured')}平安返回地球。`,
      `科研产出 ${Math.round(s.science)}，比计划少了一些。周岚在报告里写下了“基本完成”。`,
      '但在溅落现场，阿玛拉抱着你哭了。你觉得这就够了。',
    ],
  },
  stayed: {
    title: '留守者', tone: 'warm',
    epigraph: '火星上第一盏不灭的灯。',
    body: (s) => [
      `${names(s, (st) => st === 'stayed')}留在了火星上，等待 26 个月后的下一批同伴。`,
      `${names(s, (st) => st === 'ok' || st === 'injured')}返回了地球。`,
      '每天早上，你都会收到一张延迟十几分钟的照片：同一个地平线，不同的天色。',
    ],
  },
  cost: {
    title: '代价', tone: 'grey',
    epigraph: '他们把一个名字留在了那片红色的土地上。',
    body: (s) => [
      `${names(s, (st) => st === 'lost')}没有回来。`,
      activeCrew(s).length ? `${names(s, (st) => st === 'ok' || st === 'injured')}带着样本和那个人的日志回到了地球。` : '',
      '火星上的第一座纪念碑，是一块没有刻字的石头。乘组说，名字刻在他们心里。',
      '你一遍遍回看那一天的遥测，想知道哪一个决定可以不同。',
    ].filter(Boolean),
  },
  abort: {
    title: '中止', tone: 'grey',
    epigraph: '活着回来，本身就是一种勇气。',
    body: (s) => [
      s.flags.includes('edl_abort')
        ? '着陆器在离地 1.8 公里处点火返回轨道。乘组在火星轨道上漂流，等待返程窗口。'
        : '任务在火星表面被迫中止，乘组提前搭乘上升器撤离。',
      `${names(s, (st) => st === 'ok' || st === 'injured')}最终回到了地球。他们离火星那么近。`,
      '下一个窗口，会有人再去。也许还是他们。',
    ],
  },
  silent: {
    title: '寂静红土', tone: 'dark',
    epigraph: '最后一帧遥测：舱内一切平稳。',
    body: () => [
      '飞控大厅里没有人说话。',
      '延迟读数还在跳动，像是在等一个不会再来的回音。',
      '多年以后，下一批乘组在那片红土上找到了他们的旗帜。旗帜旁边，整整齐齐码着一排岩石样本。',
    ],
  },
  letgo: {
    title: '放手', tone: 'bright',
    epigraph: '你看到的都是过去。但未来，是他们自己走出来的。',
    body: (s) => [
      '四名乘员全部返回地球。',
      `科研产出 ${Math.round(s.science)}。在授权最多的那些日子里，他们做出了最好的决定。`,
      '老秦把一枚旧的“远航一号”任务徽章放在你的控制台上，什么也没说。',
      '你终于明白：总师的工作，不是替他们活一遍，而是让他们能够自己活下去。',
    ],
  },
};
