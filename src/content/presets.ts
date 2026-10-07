// 预案卡与通信盲区故障表
import type { Fault } from '../core/blackout';
import { avgTrust } from '../core/endings';
import { rates } from '../core/rates';
import { has, hasFlag } from '../core/state';
import type { MissionState } from '../core/types';
import { siteById } from './sites';

export interface PresetCard {
  id: string;
  cond: string; // 若……
  action: string; // 则……
  note: string;
}

export const PRESETS: PresetCard[] = [
  // EDL
  { id: 'edl_radar', cond: '雷达高度计失效', action: '切换为视觉地形相对导航', note: '毅力号首次使用地形相对导航避开危险区。' },
  { id: 'edl_divert', cond: '落点障碍超标', action: '允许最大 2 km 机动避障', note: '多消耗约 3% 燃料。' },
  { id: 'edl_chute', cond: '主伞开伞异常', action: '提前切伞并点燃反推', note: '高速段点火，热和振动都更大。' },
  { id: 'edl_fuel', cond: '燃料余量低于 8%', action: '放弃精确落点，就近着陆', note: '安全第一，但可能离预置物资很远。' },
  { id: 'edl_link', cond: '着陆后链路中断', action: '保持静默，自主执行安全检查单', note: '避免乘组在恐慌中做多余操作。' },
  { id: 'edl_abort', cond: '下降段出现致命异常', action: '放弃着陆，点火返回轨道', note: '保住乘组，但任务就此中止。' },
  // 日凌
  { id: 'cj_power', cond: '储能低于 30%', action: '自动关停科研载荷', note: '保生命支持，牺牲部分科研。' },
  { id: 'cj_medical', cond: '乘员体征异常', action: '医生拥有最高处置权', note: '医疗决策不必等待指令长。' },
  { id: 'cj_evalock', cond: '通信中断期间', action: '禁止一切出舱活动', note: '最安全，但两周没有野外科考（科研 −8）。' },
  { id: 'cj_dust', cond: '局地沙暴来袭', action: '收拢太阳翼，风停后清洁面板', note: '保护脆弱的太阳能阵列。' },
  { id: 'cj_leak', cond: '舱压异常下降', action: '立即隔离受影响舱段', note: '损失舱内空间，保住全舱压力。' },
  { id: 'cj_quarrel', cond: '乘员发生冲突', action: '指令长拥有最终裁决权', note: '避免小矛盾在孤立中发酵。' },
];

export const presetById = (id: string) => PRESETS.find((p) => p.id === id);
export const EDL_POOL = PRESETS.filter((p) => p.id.startsWith('edl_')).map((p) => p.id);
export const CONJ_POOL = PRESETS.filter((p) => p.id.startsWith('cj_')).map((p) => p.id);

const hazardP = (s: MissionState) => {
  const base = siteById(s.site)?.edlRisk ?? 0.1;
  const angle = hasFlag(s, 'steep') ? 0.6 : hasFlag(s, 'shallow') ? 1.5 : 1;
  return Math.min(0.6, base * 2.2 * angle * (has(s, 'drone') ? 0.6 : 1));
};

export const EDL_FAULTS: Fault[] = [
  { id: 'radar', name: '雷达高度计失效', p: 0.22, coveredBy: ['edl_radar'],
    good: {}, bad: { integrity: -15, crew: { all: { health: -10 } } },
    goodLine: { speaker: 'lin', text: '雷达掉了，视觉导航接管。相机看得很清楚。' },
    improviseLine: { speaker: 'lin', text: '雷达读数乱跳……我手动接管，凭目测判断高度！' },
    badLine: { speaker: 'sys', text: '高度判断偏差，着陆冲击超出设计值。乘员轻伤，着陆腿受损。', tone: 'alert' } },
  { id: 'hazard', name: '落点障碍超标', p: hazardP, coveredBy: ['edl_divert'],
    good: { propellant: -3 }, bad: { integrity: -25, crew: { amara: { health: -30, status: 'injured' } } },
    goodLine: { speaker: 'lin', text: '下方全是巨石。按预案向东机动 1.4 公里……找到平地了。' },
    improviseLine: { speaker: 'lin', text: '落点有石头！没有授权机动，我……自己决定往左偏！' },
    badLine: { speaker: 'sys', text: '着陆器一条腿压上岩块，舱体倾斜 11°。阿玛拉在冲击中受伤。', tone: 'alert' } },
  { id: 'chute', name: '主伞开伞异常', p: 0.15, coveredBy: ['edl_chute'],
    good: { propellant: -2, integrity: -5 }, bad: { integrity: -20, crew: { all: { health: -15 } } },
    goodLine: { speaker: 'amara', text: '主伞缠绕！切伞——反推点火！好家伙，这一脚踩得真狠。' },
    improviseLine: { speaker: 'amara', text: '伞没完全打开！我们……我们还在等什么？点火，现在点火！' },
    badLine: { speaker: 'sys', text: '反推点火过晚，着陆速度 4.1 m/s，超出限值。全员受到冲击。', tone: 'alert' } },
  { id: 'fuel', name: '燃料余量告警', p: (s) => 0.12 + (hasFlag(s, 'low_margin') ? 0.14 : 0) + (s.presets.includes('edl_divert') ? 0.05 : 0),
    coveredBy: ['edl_fuel'],
    good: { science: -6, crew: { all: { morale: -3 } } }, bad: { integrity: -30, crew: { all: { health: -20 } } },
    goodLine: { speaker: 'lin', text: '燃料 7.6%。放弃原定落点，就地着陆。离预置营地 9 公里，走过去就是了。' },
    improviseLine: { speaker: 'lin', text: '燃料见底了……还差一点就到营地，我想再撑一下……' },
    badLine: { speaker: 'sys', text: '最后 12 米燃料耗尽，着陆器自由下落。结构受损严重。', tone: 'alert' } },
  { id: 'link', name: '着陆后链路中断', p: 0.3, coveredBy: ['edl_link'],
    good: { crew: { all: { trust: 4 } } }, bad: { integrity: -5, crew: { all: { morale: -10 } } },
    goodLine: { speaker: 'lin', text: '天线没信号。按预案静默，逐项检查。舱压正常，大家都在。' },
    improviseLine: { speaker: 'rin', text: '地球听不到我们……我们要不要出去看看天线？' },
    badLine: { speaker: 'sys', text: '乘组在慌乱中提前泄压出舱检查天线，打乱了着陆后安全检查流程。', tone: 'alert' } },
  { id: 'critical', name: '下降段致命异常', p: (s) => 0.03 + (s.integrity < 85 ? 0.04 : 0), coveredBy: ['edl_abort'],
    good: { flags: ['aborted', 'edl_abort'] },
    bad: (s) => (avgTrust(s) > 70 ? { integrity: -45, crew: { all: { health: -45 } } } : { integrity: -60, crew: { all: { health: -70 } } }),
    goodLine: { speaker: 'lin', text: '下降发动机推力不对称……按预案中止着陆！点火——我们回轨道。对不起，火星。' },
    improviseLine: { speaker: 'lin', text: '姿态失控！我……我试试手动……' },
    badLine: { speaker: 'sys', text: '着陆器以严重偏离的姿态坠落。舱体破损，多人重伤。', tone: 'alert' } },
];

const powerShort = (s: MissionState) => {
  const r = rates(s);
  return r.powerGen < r.powerNeed;
};

export const CONJ_FAULTS: Fault[] = [
  { id: 'power', name: '储能告急', p: (s) => (powerShort(s) ? 0.7 : 0.15), coveredBy: ['cj_power'],
    good: { science: -4, storage: 100 }, bad: { o2: -25, integrity: -10, crew: { all: { health: -8 } } },
    goodLine: { speaker: 'amara', text: '储能跌破 30%，科研载荷自动关停。暖气还在，我们没事。' },
    improviseLine: { speaker: 'amara', text: '电不够了。关掉哪个？光谱仪还是温室？凛快跟我吵起来了……' },
    badLine: { speaker: 'sys', text: '制氧机断电 31 小时，舱温降至 9℃。', tone: 'alert' } },
  { id: 'medical', name: '乘员体征异常', p: (s) => (hasFlag(s, 'andrei_untreated') ? 0.6 : 0.2), coveredBy: ['cj_medical'],
    good: { crew: { andrei: { trust: 5 }, all: { health: 3 } } }, bad: { crew: { andrei: { health: -25 }, all: { morale: -6 } } },
    goodLine: { speaker: 'andrei', text: '按预案，我直接处置了。不需要等任何人批准——谢谢你提前想到这一点。' },
    improviseLine: { speaker: 'andrei', text: '有人在发烧……按规程我该先报告指令长，再等地面会诊……可地面听不见。' },
    badLine: { speaker: 'sys', text: '处置延误，病情加重。沃尔科夫连续 40 小时没有合眼。', tone: 'alert' } },
  { id: 'eva', name: '盲区出舱', p: (s) => (s.presets.includes('cj_evalock') ? 0 : 0.3), coveredBy: [],
    good: { science: 8 }, bad: { crew: { rin: { health: -30, status: 'injured' } }, integrity: -5 },
    goodLine: { speaker: 'rin', text: '' },
    improviseLine: { speaker: 'rin', text: '日凌两周，什么都不做太浪费了。我和阿玛拉去北边的断崖看看，很快回来。' },
    badLine: { speaker: 'sys', text: '早川凛在断崖边滑倒，宇航服左腿受损，靠阿玛拉拖回舱内。', tone: 'alert' } },
  { id: 'dust', name: '局地沙暴', p: 0.3, coveredBy: ['cj_dust'],
    good: {}, bad: (s) => (s.loadout.some((m) => m.startsWith('solar')) ? { integrity: -12, storage: -150 } : { integrity: -4 }),
    goodLine: { speaker: 'amara', text: '起风了。太阳翼已经收拢——风停后我去擦板子。' },
    improviseLine: { speaker: 'amara', text: '风越来越大……收不收太阳翼？收了今晚就没电。' },
    badLine: { speaker: 'sys', text: '太阳翼被沙粒打出划痕，发电效率永久下降。', tone: 'alert' } },
  { id: 'leak', name: '舱压下降', p: (s) => 0.15 + (s.integrity < 60 ? 0.2 : 0), coveredBy: ['cj_leak'],
    good: { integrity: -4 }, bad: { integrity: -20, o2: -30, crew: { all: { health: -6 } } },
    goodLine: { speaker: 'lin', text: '二号舱压力在掉。按预案隔离，损失了一个储物舱，其余正常。' },
    improviseLine: { speaker: 'lin', text: '有漏气声……先找漏点还是先隔离？大家意见不一致。' },
    badLine: { speaker: 'sys', text: '寻找漏点耗时过长，舱压一度降至 62 kPa。', tone: 'alert' } },
  { id: 'quarrel', name: '乘员冲突', p: (s) => {
      const active = s.crew.filter((c) => c.status === 'ok' || c.status === 'injured');
      const morale = active.reduce((a, c) => a + c.morale, 0) / Math.max(1, active.length);
      return morale < 50 ? 0.55 : 0.2;
    }, coveredBy: ['cj_quarrel'],
    good: { crew: { all: { morale: 4 } } }, bad: { crew: { all: { morale: -12, trust: -6 } } },
    goodLine: { speaker: 'lin', text: '凛和阿玛拉为了电力分配吵起来了。我做了裁决。两个人都不太高兴，但都接受了。' },
    improviseLine: { speaker: 'amara', text: '凭什么她的样本比我的温室重要？……算了，没人说了算。' },
    badLine: { speaker: 'sys', text: '冲突持续三天，乘员分开用餐，交流降到最低。', tone: 'alert' } },
];
