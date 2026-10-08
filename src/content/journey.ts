// 结算页的“征程”长卷：前人走过的路，加上玩家这一局，再交给下一程。史实核对见 docs/SCIENCE.md 第 11 节
import type { MissionState } from '../core/types';
import { CAST } from './cast';

export interface JourneyStop {
  year: string;
  title: string;
  note: string;
  kind: 'past' | 'now' | 'next';
}

const PAST: JourneyStop[] = [
  { year: '1936', title: '长征', note: '三大主力红军会宁会师', kind: 'past' },
  { year: '1970', title: '长征一号', note: '送东方红一号上天', kind: 'past' },
  { year: '2003', title: '长征二号 F', note: '送神舟五号与杨利伟进入太空', kind: 'past' },
  { year: '2020', title: '长征五号', note: '送天问一号奔向火星', kind: 'past' },
];

export function journey(s: MissionState, endingTitle: string, grade: string): JourneyStop[] {
  const stayed = s.crew.find((c) => c.status === 'stayed');
  return [
    ...PAST,
    { year: '2035', title: '祝融一号', note: `你的这一程：${endingTitle} · 评级 ${grade}`, kind: 'now' },
    { year: '约 2037', title: '下一个窗口',
      note: stayed ? `${CAST[stayed.id].name}在火星等着接下一批人` : '第二批乘组接过这条路', kind: 'next' },
  ];
}
