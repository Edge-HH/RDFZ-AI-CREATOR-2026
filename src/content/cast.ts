import type { Speaker } from '../core/content';

export interface CastMember {
  name: string;
  role: string;
  callsign: string;
  color: string; // 徽章主色
  glyph: string; // 程序头像上的字
  onMars: boolean; // 消息是否带光速延迟标记
  bio?: string;
}

export const CAST: Record<Speaker, CastMember> = {
  qin: { name: '秦岳', role: '前任总师', callsign: '老秦', color: '#c9a86a', glyph: '秦', onMars: false,
    bio: '63 岁，飞控中心的老总师。今天是他最后一个班。' },
  lin: { name: '林照', role: '指令长', callsign: '燧火-1', color: '#5b8cff', glyph: '林', onMars: true,
    bio: '42 岁，前空军试飞员。话不多，你说的每句话他都会认真想。' },
  amara: { name: '阿玛拉·奥孔科', role: '飞行工程师', callsign: '燧火-2', color: '#ff9b3d', glyph: '阿', onMars: true,
    bio: '34 岁，来自拉各斯。相信没有修不好的东西，只有还没找到的扳手。' },
  andrei: { name: '安德烈·沃尔科夫', role: '乘组医生', callsign: '燧火-3', color: '#5fd3a6', glyph: '安', onMars: true,
    bio: '45 岁，来自新西伯利亚。习惯照顾所有人，除了他自己。' },
  rin: { name: '早川凛', role: '地质学家', callsign: '燧火-4', color: '#ff5f7a', glyph: '凛', onMars: true,
    bio: '31 岁，来自札幌。为一块好石头，她可以走到天黑。' },
  zhou: { name: '周岚', role: '工程总体部副主任', callsign: '总体部', color: '#9aa3b5', glyph: '周', onMars: false,
    bio: '50 岁，管预算，也管压力。' },
  capcom: { name: '许航', role: '通信调度', callsign: 'CAPCOM', color: '#7fd1ff', glyph: '许', onMars: false },
  // 致敬《流浪地球》：550 系列量子计算机的“预览版”，2035 年时正式型号还在图纸上
  ai: { name: '550A-Preview', role: '量子计算工程样机', callsign: '推演', color: '#ff3b2f', glyph: '◉', onMars: false,
    bio: '联合计算中心借调来的工程样机，负责轨道与风险推演。' },
  sys: { name: '系统', role: '遥测', callsign: 'SYS', color: '#e04f3a', glyph: '◆', onMars: false },
  you: { name: '你', role: '飞控总师', callsign: '总师', color: '#e8e8e8', glyph: '你', onMars: false },
};
