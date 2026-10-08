import { resolveBlackout } from '../../core/blackout';
import type { Chapter, Line } from '../../core/content';
import { applyEffect } from '../../core/effects';
import { CONJUNCTION_END, CONJUNCTION_START, DEPARTURE_DAY, solOf } from '../../core/orbit';
import { dustFactor, rates } from '../../core/rates';
import { has, hasFlag, random } from '../../core/state';
import { passTime } from '../../core/time';
import type { Effect, MissionState } from '../../core/types';
import { crew, isActive, L, pct, sciMult } from '../helpers';
import { CONJ_FAULTS, CONJ_POOL } from '../presets';

// 授权度过低：事事请示地球，每件事都要多等一个往返
const askingCost = (s: MissionState): Effect => (s.autonomy === 0 ? { crew: { all: { morale: -4 } } } : {});

const AUTONOMY_TEXT = [
  '0 · 事事请示：所有操作等待地面批准',
  '1 · 按规程：常规操作自主，异常情况请示',
  '2 · 现场优先：指令长可在规程外临机决断',
  '3 · 完全授权：乘组自主决定，地面提供建议',
];

const fieldMate = (s: MissionState) => (isActive(s, 'rin') ? 'rin' : 'amara');

// 按当前产耗推演到返程日，找出最先见底的物资
function shortfall(s: MissionState): { name: string; days: number } | null {
  const horizon = DEPARTURE_DAY - s.day;
  let probe = s;
  for (let d = 0; d < horizon; d += 10) {
    probe = passTime(probe, Math.min(10, horizon - d));
    const empty = [['氧气', probe.o2], ['水', probe.water], ['食物', probe.food]].find(([, v]) => (v as number) <= 0);
    if (empty) return { name: empty[0] as string, days: DEPARTURE_DAY - probe.day };
  }
  return null;
}

export const ch4: Chapter = {
  id: 4,
  title: '第四章 · 红土',
  subtitle: '火星表面 · 第 1–440 火星日',
  teach: '授权度：你愿意放手多少？',
  scene: 'surface',
  beats: [
    {
      id: 'build',
      title: '建站',
      scene: 'surface',
      lines: (s) => {
        const r = rates(s);
        return [
          L('sys', `第 ${solOf(s.day)} 火星日 · 日均发电 ${r.powerGen.toFixed(1)} kW / 需求 ${r.powerNeed.toFixed(1)} kW`),
          L('amara', '预置营地状态良好，推进剂工厂已经在工作了——它会一直生产到我们离开的那天。'),
          L('amara', '营地的四足搬运机器人也醒了。凛给它起了个名字，叫“笨笨”。'),
          L('rin', '因为它走路总是先迈错腿。不过它从来没摔过。'),
          L('amara', '记住：工厂要电，也要水。我们缺什么，回家的燃料就缺什么。'),
          L('rin', '我可以先把实验室架起来吗？北边那片层状沉积看着太诱人了。'),
          L('lin', '先定个顺序吧。人手就这么多。'),
        ];
      },
      decision: {
        kind: 'choice',
        prompt: '建站优先级',
        options: [
          { id: 'life', label: '生保优先：制氧、提水、温室全速运转', detail: '氧气 +15 天 · 水 +15 天 · 士气 +4',
            effect: { o2: 15, water: 15, crew: { all: { morale: 4 } } }, lines: [L('amara', '先让大家喘口气——字面意思。')] },
          { id: 'science', label: '科研优先：先建实验室', detail: '科研 +12 · 氧气 −10 天 · 凛士气 +8',
            effect: { science: 12, o2: -10, archive: ['perchlorate'], crew: { rin: { morale: 8, trust: 5 } } }, lines: [L('rin', '谢谢！第一批样本今晚就能进分析仪。'), L('andrei', '分析结果：土壤里有高氯酸盐。从今天起，进舱前必须彻底除尘。')] },
          { id: 'shield', label: '防护优先：先用风化层覆盖居住舱', detail: '需要风化层机具；信任 +4 · 士气 +3',
            requires: (s) => has(s, 'regolith'), lockedReason: '没有携带风化层覆盖机具',
            effect: { crew: { all: { trust: 4, morale: 3 } }, flags: ['shield_first'] }, lines: [L('andrei', '睡觉的地方头顶有两米土，我终于能安心了。')] },
          { id: 'balance', label: '平衡推进', detail: '科研 +5 · 氧气 +5 天', effect: { science: 5, o2: 5 }, lines: [L('lin', '收到，各线并行。')] },
        ],
      },
      archive: ['moxie', 'ice', 'sabatier'],
      days: 30,
    },
    {
      id: 'autonomy',
      title: '老秦的最后一个班',
      scene: 'control',
      key: true,
      lines: [
        L('qin', '今天是我最后一个班。走之前，有件事得交给你定。', { voice: 'ch4_01' }),
        L('qin', '现在单程延迟十几分钟，凡事请示地球，每件事都要多等半个小时。'),
        L('qin', '给他们多大的自主权？给多了，他们可能做出你不认同的决定；给少了，他们会被你拖慢，也会觉得你不信任他们。'),
        L('qin', '在日凌和意外里，他们越被信任，就越敢自己拿主意。'),
        L('lin', '无论你怎么定，我们都会执行。'),
      ],
      decision: { kind: 'autonomy', prompt: '设定乘组授权度' },
      resolve: (s) => {
        const eff: Effect[] = [{ crew: { all: { trust: -8, morale: -4 } } }, {}, { crew: { all: { trust: 6 } } }, { crew: { all: { trust: 12 } } }];
        const lines: Line[] = [L('sys', `授权度：${AUTONOMY_TEXT[s.autonomy]}`)];
        if (s.autonomy === 0) lines.push(L('lin', '……明白。我们每一步都会先问你。'), L('qin', '你会累的。他们也会。'));
        if (s.autonomy === 1) lines.push(L('lin', '按规程办，收到。'), L('qin', '中规中矩。挺好。'));
        if (s.autonomy === 2) lines.push(L('lin', '谢谢你的信任。我们不会乱来。'), L('qin', '嗯。'));
        if (s.autonomy === 3) lines.push(L('lin', '……这份信任很重。我们接住了。'), L('qin', '我当年要是有你这份胆量……算了。', { voice: 'ch4_02' }));
        lines.push(L('qin', '好了，我该走了。椅子是你的了。'));
        return { state: applyEffect(s, { ...eff[s.autonomy], flags: ['qin_left'] }), lines };
      },
    },
    {
      id: 'sampling',
      title: '断崖下的岩层',
      scene: 'surface',
      enter: askingCost,
      when: (s) => isActive(s, 'rin') || isActive(s, 'amara'),
      lines: (s) => [
        L('sys', `第 ${solOf(s.day)} 火星日`),
        L('rin', '十二公里外有一处断崖，岩层像书页一样一层一层露出来，可能记录着几亿年的气候。'),
        L('rin', '坡度大约 25°，有落石。但是——这可能是整个任务最重要的样本。'),
        L('lin', '我的意见是可以去，但要控制时间。'),
        ...(s.autonomy >= 2 ? [L('lin', '按现在的授权，如果你不批准，我会自己权衡一个折中方案。')] : []),
      ],
      decision: {
        kind: 'choice',
        prompt: '是否批准断崖采样？',
        options: [
          { id: 'full', label: '批准完整考察（8 小时）',
            detail: (s) => `成功则科研 +${Math.round(30 * sciMult(s))}；漫游车与直升机降低风险`,
            effect: (s) => ({ crew: { [fieldMate(s)]: { trust: 6 } } as Effect['crew'] }),
            risk: { base: 0.28, useSafety: true, label: '落石或滑坠', mod: (s) => (s.site === 'jezero' ? 0.05 : 0),
              ok: (s) => ({ science: 30 * sciMult(s), archive: ['strata'] }),
              fail: (s) => ({ science: 8 * sciMult(s), integrity: -5, crew: { [fieldMate(s)]: { health: -45, status: 'injured' } } as Effect['crew'] }),
              okLines: [L('rin', '拿到了！三十七块定向岩芯。总师，你一定要看看这些纹理。', { voice: 'ch4_03', tone: 'warm' }),
                L('rin', '岩芯箱是笨笨驮下坡的。它今天一次都没迈错腿。')],
              failLines: [L('sys', '坡面落石。考察队员一人被砸伤腿部，靠同伴拖回漫游车。', { tone: 'alert' })] },
            lines: [L('rin', '出发！')] },
          { id: 'short', label: '批准短途考察（4 小时）',
            detail: (s) => `成功则科研 +${Math.round(15 * sciMult(s))}；风险较低`,
            risk: { base: 0.14, useSafety: true, label: '轻微事故',
              ok: (s) => ({ science: 15 * sciMult(s) }),
              fail: (s) => ({ crew: { [fieldMate(s)]: { health: -20 } } as Effect['crew'] }),
              okLines: [L('rin', '时间太紧了……但我还是带回了几块好东西。')],
              failLines: [L('sys', '返程途中扭伤脚踝，无大碍。', { tone: 'alert' })] },
            lines: [L('lin', '四个小时，到点就撤。')] },
          { id: 'deny', label: '不批准',
            detail: (s) => (s.autonomy >= 2 ? '由林照决定折中方案（科研小幅增加）' : '凛信任 −15 · 士气 −10'),
            effect: (s) => (s.autonomy >= 2
              ? { science: 10 * sciMult(s), crew: { rin: { trust: -3 }, lin: { trust: 4 } } }
              : { crew: { rin: { trust: -15, morale: -10 } } }),
            lines: (s) => (s.autonomy >= 2
              ? [L('lin', '收到你的意见。我决定让凛用直升机拍照、在坡脚取样，不上坡。'), L('rin', '……也行。')]
              : [L('rin', '……明白了。'), L('andrei', '她一晚上没说话。')]) },
        ],
      },
      days: 60,
    },
    {
      id: 'storm',
      title: '全球沙尘暴',
      scene: 'storm',
      key: true,
      enter: (s) => ({ ...askingCost(s), dustTau: 9 }),
      lines: (s) => {
        const r = rates(s);
        return [
          L('sys', '大气光学厚度 τ 升至 9.0。2018 年让机遇号失联的那场沙尘暴，峰值约 10.8。', { tone: 'alert' }),
          L('sys', `太阳能输出降至晴天的 ${pct(dustFactor(9))}。当前发电 ${r.powerGen.toFixed(1)} kW / 需求 ${r.powerNeed.toFixed(1)} kW。`),
          r.powerGen >= r.powerNeed
            ? L('amara', '裂变堆稳得像块石头。外面天昏地暗，我们这儿灯火通明。')
            : L('amara', '电不够。储能撑不了几天。这场沙暴可能要刮两三个月。', { tone: 'alert' }),
          r.powerGen >= r.powerNeed
            ? L('amara', '笨笨还在外面巡检，回来时浑身是土，像一块会走路的红砖。')
            : L('amara', '笨笨自己进了休眠。省下的每一瓦，都留给了生保。'),
          L('lin', '天是橙黑色的，正午像黄昏。'),
        ];
      },
      decision: {
        kind: 'choice',
        prompt: '沙尘暴持续约 90 天，如何分配电力？',
        options: [
          { id: 'shed', label: '关停科研载荷，保生命支持', detail: '用电 −6 kW；沙暴期间科研减半', effect: { flags: ['load_shed'], science: -3 },
            lines: [L('rin', '……光谱仪关了。我会用纸和笔记录。')] },
          { id: 'plant', label: '暂停推进剂工厂，把电让给生保', detail: '储能回充（至电池上限）· 推进剂 −8%',
            effect: { storage: 300, propellant: -8 }, lines: [L('amara', '工厂停了。回家的燃料……以后再追吧。')] },
          { id: 'hold', label: '维持全部运行，赌沙暴快点过去',
            detail: '如果电力不足，系统与乘员都会受损',
            risk: { base: 0.08, label: '断电与低温', mod: (s) => { const r = rates(s); return r.powerGen >= r.powerNeed ? -0.05 : 0.55; },
              fail: { integrity: -20, o2: -30, crew: { all: { health: -12, morale: -10 } } },
              failLines: [L('sys', '储能耗尽。舱温降至 4℃，制氧机停机 3 天。', { tone: 'alert' }), L('andrei', '大家都钻进睡袋了。我在挨个量体温。')],
              okLines: [L('amara', '扛住了。')] },
            lines: [L('lin', '全部维持，收到。')] },
        ],
      },
      archive: ['dust2018', 'solar_mars'],
      days: 90,
    },
    {
      id: 'storm_end',
      title: '天晴',
      scene: 'surface',
      enter: { dustTau: 0.8, clearFlags: ['load_shed'] },
      lines: (s) => [
        L('sys', `第 ${solOf(s.day)} 火星日 · 光学厚度回落至 0.8`),
        L('amara', '太阳出来了。我第一次觉得火星的太阳这么好看。'),
        L('lin', `推进剂工厂进度：${Math.round(s.propellant)}%。`),
      ],
    },
    {
      id: 'supply',
      title: '补给核算',
      scene: 'surface',
      when: (s) => shortfall(s) !== null,
      key: true,
      lines: (s) => {
        const f = shortfall(s)!;
        return [
          L('andrei', `我按现在的消耗算了一下：${f.name}会在返程前 ${f.days} 天左右见底。`, { tone: 'alert' }),
          L('amara', '上升器里有一份应急储备——氧气和水。但那是回家路上的保命钱，也会影响推进剂。'),
          L('lin', '要么现在开始勒紧裤带，要么想别的办法。'),
        ];
      },
      decision: {
        kind: 'choice',
        prompt: '物资预计在返程前耗尽，怎么办？',
        options: [
          { id: 'ration', label: '实行配给制', detail: '食物与水按七到八成供应 · 士气持续下降',
            effect: { flags: ['rationing'], crew: { all: { morale: -5 } } },
            lines: [L('andrei', '我会盯着每个人的体重和血糖。')] },
          { id: 'mav', label: '动用上升器应急储备', detail: '氧气 +60 天 · 水 +40 天 · 食物 +30 天 · 推进剂 −12%',
            effect: { o2: 60, water: 40, food: 30, propellant: -12 },
            lines: [L('amara', '储备拆出来了。回家的燃料又少了一截，推进剂工厂得多加把劲。')] },
          { id: 'both', label: '两者都做', detail: '最稳妥，代价也最大',
            effect: { flags: ['rationing'], o2: 60, water: 40, food: 30, propellant: -12, crew: { all: { morale: -8 } } },
            lines: [L('lin', '收到。紧日子，我们过得了。')] },
          { id: 'gamble', label: '暂不处理，相信后续产出', detail: '如果真的耗尽，乘员健康会快速恶化',
            lines: [L('lin', '……收到。')] },
        ],
      },
    },
    {
      id: 'andrei_known',
      title: '医生',
      scene: 'surface',
      when: (s) => hasFlag(s, 'andrei_found') && isActive(s, 'andrei'),
      lines: [
        L('andrei', '最新血象：白细胞稳定在下限附近。比我预想的好。'),
        L('andrei', '多亏你们早发现。在地球上这不算什么，在这里，早一周都很重要。'),
      ],
      decision: {
        kind: 'choice',
        prompt: '沃尔科夫的身体状况',
        options: [
          { id: 'rest', label: '安排他低强度工作，继续治疗', detail: '科研 −4 · 沃尔科夫信任 +6', effect: { science: -4, crew: { andrei: { trust: 6, health: 5 } } },
            lines: [L('andrei', '好吧，我当一回病人。')] },
          { id: 'work', label: '让他照常工作', detail: '科研 +4 · 沃尔科夫健康 −20', effect: { science: 4, crew: { andrei: { health: -20 } } },
            lines: [L('andrei', '我没问题。真的。')] },
        ],
      },
      days: (s) => Math.max(0, CONJUNCTION_START - s.day),
    },
    {
      id: 'andrei_collapse',
      title: '倒下',
      scene: 'surface',
      key: true,
      when: (s) => hasFlag(s, 'andrei_symptom') && !hasFlag(s, 'andrei_found') && isActive(s, 'andrei'),
      enter: { flags: ['andrei_untreated'], crew: { andrei: { health: -45, status: 'injured' } } },
      lines: [
        L('lin', '沃尔科夫在温室里晕倒了。', { tone: 'alert' }),
        L('amara', '他在发烧，牙龈出血……他的血常规报告，他已经三个月没上传过了。', { tone: 'alert' }),
        L('andrei', '……太阳风暴那天，我最后一个进舱。我以为我能自己处理。', { tone: 'cold' }),
      ],
      decision: {
        kind: 'choice',
        prompt: '乘组医生病倒了，怎么救？',
        options: [
          { id: 'allhands', label: '全员停工，地面专家远程会诊，舱内全力抢救', detail: '科研 −10；成功率中等',
            effect: { science: -10, crew: { all: { morale: -4 } } },
            risk: { base: 0.35, label: '抢救失败', mod: (s) => (crew(s, 'andrei').dose > 600 ? 0.1 : 0),
              ok: { clearFlags: ['andrei_untreated'], crew: { andrei: { health: 20 } } },
              fail: { crew: { andrei: { health: -100 } } },
              okLines: [L('andrei', '……我欠你们一条命。'), L('amara', '你欠我们三个月的体检报告。')],
              failLines: [L('lin', '第 3 天凌晨，安德烈走了。', { tone: 'cold' }), L('lin', '他最后说的是：“别告诉我妈妈是在火星上。”', { tone: 'cold' })] } },
          { id: 'amara', label: '授权阿玛拉按应急手册自主处置', detail: '需要授权度 ≥ 2；不等地面回复，处置更快',
            requires: (s) => s.autonomy >= 2, lockedReason: '授权度不足：乘组必须等待地面指令',
            risk: { base: 0.25, label: '处置失败', mod: (s) => -(crew(s, 'amara').trust - 60) / 200,
              ok: { clearFlags: ['andrei_untreated'], crew: { andrei: { health: 25 }, amara: { trust: 6 } } },
              fail: { crew: { andrei: { health: -100 } } },
              okLines: [L('amara', '我按手册一步一步来，没等你们回话。他退烧了。'), L('andrei', '……阿玛拉，你应该去当医生。')],
              failLines: [L('amara', '我尽力了……我真的尽力了。', { tone: 'cold' })] } },
          { id: 'protocol', label: '按规程：逐步远程诊断后再处置', detail: '每一步都要等一个通信往返；风险最高',
            risk: { base: 0.5, label: '延误致死',
              ok: { clearFlags: ['andrei_untreated'], crew: { andrei: { health: 15 } } },
              fail: { crew: { andrei: { health: -100 } } },
              okLines: [L('andrei', '……挺过来了。谢谢你们。')],
              failLines: [L('sys', '第三轮会诊意见送达时，A. 沃尔科夫已于 14 分钟前停止呼吸。', { tone: 'cold' })] } },
        ],
      },
      days: (s) => Math.max(0, CONJUNCTION_START - s.day),
    },
    {
      id: 'pre_conj',
      title: '等待',
      scene: 'surface',
      when: (s) => s.day < CONJUNCTION_START,
      lines: [L('capcom', '距离日凌还有一段时间，乘组按计划工作。')],
      days: (s) => Math.max(0, CONJUNCTION_START - s.day),
    },
    {
      id: 'conjunction',
      title: '日凌',
      scene: 'conjunction',
      key: true,
      lines: [
        L('capcom', '日凌开始：太阳运行到地球与火星之间，太阳等离子体会吞掉我们的信号。', { tone: 'alert' }),
        L('capcom', '接下来 15 天，我们和乘组之间不会有任何通信。'),
        L('capcom', '老秦退休前给你留了张纸条：“该说的话，提前说完。”'),
        L('lin', '我们准备好了。把你想说的写下来吧。'),
      ],
      decision: { kind: 'presets', prompt: '日凌预案：选择 3 张', pool: CONJ_POOL, pick: 3 },
      resolve: (s) => {
        const pre = s.presets.includes('cj_evalock') ? applyEffect(s, { science: -8 }) : s;
        const r = resolveBlackout(pre, CONJ_FAULTS);
        return {
          state: r.state,
          lines: [L('sys', '— 日凌 · 通信中断 15 天 —', { tone: 'cold' }), ...r.lines,
            L('ai', '日凌期间乘组的处置，与本机推演的最优解不完全一致。'),
            L('capcom', '信号恢复。他们还在。', { tone: 'warm' })],
        };
      },
      archive: ['conjunction'],
      days: (s) => Math.max(0, CONJUNCTION_END - s.day),
    },
    {
      id: 'late',
      title: '最后的长驻',
      scene: 'surface',
      enter: askingCost,
      lines: (s) => [
        L('sys', `第 ${solOf(s.day)} 火星日 · 距离返程窗口约 ${DEPARTURE_DAY - s.day} 天`),
        L('zhou', '回家前还有半年多。总体部希望最后再搞一次大规模科考——这可能是十年内唯一的机会。'),
        L('lin', '乘组有点累了。设备也在老化。'),
        ...(isActive(s, 'rin') ? [L('rin', '我列了二十个想去的地方。挑五个也行。')] : []),
      ],
      decision: {
        kind: 'choice',
        prompt: '返程前的最后半年怎么安排？',
        options: [
          { id: 'campaign', label: '大规模科考', detail: (s) => `成功则科研 +${Math.round(40 * sciMult(s))}；有受伤风险`,
            risk: { base: 0.28, useSafety: true, label: '野外事故',
              ok: (s) => ({ science: 40 * sciMult(s), flags: ['zhou_pleased'], archive: ['organics'] }),
              fail: (s) => ({ science: 15 * sciMult(s), integrity: -8, crew: { [fieldMate(s)]: { health: -35, status: 'injured' } } as Effect['crew'] }),
              okLines: [L('zhou', '……干得漂亮。'), L('rin', '这些样本够全世界研究二十年。')],
              failLines: [L('sys', '漫游车在沟壑中侧翻，一名乘员受伤。', { tone: 'alert' })] },
            lines: [L('lin', '出发。')] },
          { id: 'moderate', label: '适度科考', detail: (s) => `科研 +${Math.round(20 * sciMult(s))}`,
            effect: (s) => ({ science: 20 * sciMult(s) }), lines: [L('lin', '按部就班。')] },
          { id: 'maintain', label: '休整与维护，为返程做准备', detail: '完好度 +15 · 士气 +8 · 推进剂 +4%',
            effect: { integrity: 15, propellant: 4, crew: { all: { morale: 8 } } },
            lines: [L('amara', '我要把上升器的每一颗螺丝都摸一遍。'), L('zhou', '……好吧。')] },
        ],
      },
      resolve: (s) => {
        if (s.autonomy < 3) return { state: s, lines: [] };
        const [r, s1] = random(s);
        if (r < 0.3) {
          return { state: applyEffect(s1, { crew: { amara: { health: -20 } } }),
            lines: [L('lin', '完全授权下，我们自己加了一次夜间出舱。阿玛拉摔了一跤，伤得不重。是我的决定。')] };
        }
        return { state: applyEffect(s1, { science: 10 * sciMult(s1) }),
          lines: [L('lin', '完全授权下，我们自己加了两次短途考察。收获不错。')] };
      },
      days: (s) => Math.max(0, DEPARTURE_DAY - 5 - s.day),
    },
  ],
};
