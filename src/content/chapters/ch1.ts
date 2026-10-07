import type { Chapter } from '../../core/content';
import { rates } from '../../core/rates';
import { has } from '../../core/state';
import { L } from '../helpers';
import { siteById } from '../sites';

export const ch1: Chapter = {
  id: 1,
  title: '第一章 · 窗口',
  subtitle: '发射前 40 天 · 海南文昌',
  teach: '取舍：十二个槽位，永远不够',
  scene: 'orbit',
  beats: [
    {
      id: 'window',
      title: '发射窗口',
      scene: 'orbit',
      lines: [
        L('qin', '地球和火星，每 26 个月才排成一次合适的角度。错过这次，下一次是 2037 年。', { voice: 'ch1_01' }),
        L('qin', '沿着一条椭圆，从地球轨道“滑”到火星轨道——霍曼转移，单程 259 天。'),
        L('qin', '到了火星，还要再等 454 天，等地球转回合适的位置，才能回家。'),
        L('zhou', '我是周岚，总体部。预算我只说一次：着陆器一共十二个配载槽位，一个都不会多。'),
        L('zhou', '核电、太阳能、制氧、科研……你想要的，大概能装下一半。'),
        L('amara', '居住舱、上升器和推进剂工厂已经提前送到火星了。剩下的，就看你给我们带什么。'),
      ],
      decision: { kind: 'loadout', prompt: '为祝融一号配载：12 个槽位' },
      archive: ['hohmann'],
      days: 10,
      key: true,
    },
    {
      id: 'loadout_review',
      title: '配载复核',
      scene: 'orbit',
      lines: (s) => {
        const r = rates({ ...s, site: 'utopia' });
        const out = [L('capcom', '配载清单已提交，乘组正在复核。')];
        if (r.powerGen < r.powerNeed) out.push(L('amara', `我算了一下，晴天日均发电 ${r.powerGen.toFixed(1)} kW，需求 ${r.powerNeed.toFixed(1)} kW。电不够——你确定吗？`, { tone: 'alert' }));
        else out.push(L('amara', `日均发电 ${r.powerGen.toFixed(1)} kW，需求 ${r.powerNeed.toFixed(1)} kW。电够用，前提是天上别起沙尘暴。`));
        if (!has(s, 'moxie') && !has(s, 'o2_tank')) out.push(L('andrei', '氧气只有基础储备。到了火星，我们每一口呼吸都要省着用。', { tone: 'alert' }));
        if (!has(s, 'water_wall')) out.push(L('andrei', '没有水墙。巡航期间如果碰上太阳风暴，我们没有像样的避难所。'));
        if (!has(s, 'greenhouse') && !has(s, 'food_pack')) out.push(L('lin', '食物按天算，刚刚够撑到返程前……前提是什么都不出错。', { tone: 'alert' }));
        if (has(s, 'rover') || has(s, 'lab')) out.push(L('rin', '有漫游车和实验室！你懂我。'));
        if (has(s, 'fission')) out.push(L('zhou', '裂变堆的审批文件有我半个人那么高。希望它值得。'));
        out.push(L('qin', '没有完美的配载。只有你愿意为哪种风险负责。'));
        return out;
      },
    },
    {
      id: 'site',
      title: '选择着陆点',
      scene: 'orbit',
      lines: [
        L('rin', '杰泽罗！古河流三角洲，如果火星上曾经有过生命，证据很可能就埋在那里。'),
        L('lin', '杰泽罗坑底到处是悬崖和巨石。我投乌托邦平原——祝融号去过的地方，平得像机场。'),
        L('amara', '阿卡迪亚的冰离地表不到一米。冰就是水，水就是氧气和回家的燃料。只是那里冷，太阳也弱。'),
        L('zhou', '我个人倾向杰泽罗。全世界都在看——第一批人类，总得带回点了不起的东西。'),
        L('qin', '最稳的那个，不一定最对。最对的那个，也不一定稳。', { voice: 'ch1_02' }),
      ],
      decision: { kind: 'site', prompt: '选择祝融一号的着陆点' },
      days: 10,
      key: true,
    },
    {
      id: 'site_react',
      title: '着陆点确认',
      scene: 'orbit',
      lines: (s) => {
        const site = siteById(s.site)!;
        const out = [L('capcom', `着陆点锁定：${site.name}（${site.coord}）。`)];
        if (s.site === 'jezero') out.push(L('rin', '谢谢！我保证带回最好的样本。'), L('lin', '……那我得好好练练避障了。'), L('zhou', '明智的选择。'));
        if (s.site === 'utopia') out.push(L('lin', '稳妥。我喜欢稳妥。'), L('rin', '乌托邦也有很多有意思的东西……我会找到的。'), L('qin', '我当年，也总是选最稳的那个。'));
        if (s.site === 'arcadia') out.push(L('amara', '冰原！我已经开始想象钻头下去的声音了。'), L('andrei', '多带几件保暖层。那里的冬天会很长。'));
        if (s.site === 'arcadia' && (has(s, 'solar') || has(s, 'solar_ext')) && !has(s, 'fission'))
          out.push(L('amara', '不过……阿卡迪亚纬度高，我们的太阳能板会吃不饱。', { tone: 'alert' }));
        return out;
      },
      enter: (s) => (s.site === 'jezero' ? { flags: ['zhou_pleased'] } : {}),
    },
    {
      id: 'launch',
      title: '发射日',
      scene: 'launch',
      lines: [
        L('sys', '发射日 T−3 小时 · 长征九号重型运载火箭 · 文昌航天发射场'),
        L('capcom', '高空风切变 27 米/秒，接近 30 米/秒的发射限值，而且还在增大。'),
        L('capcom', '窗口还剩 9 天。推迟一天，转移轨道需要额外加速，着陆时的燃料余量会变少。'),
        L('lin', '乘组状态良好。你说走，我们就走。'),
      ],
      decision: {
        kind: 'choice',
        prompt: '风切变接近限值，是否按时发射？',
        options: [
          { id: 'go', label: '按时发射',
            detail: '士气 +5；有概率箭体振动损伤设备',
            effect: { crew: { all: { morale: 5 } } },
            risk: { base: 0.2, label: '振动超标', fail: (s) => ({ integrity: -12, spares: s.spares > 0 ? -1 : 0 }),
              failLines: [L('sys', '一级飞行段振动超标，着陆器一份备件与部分管路受损。', { tone: 'alert' })],
              okLines: [L('sys', '飞行正常，各级分离正常。', { tone: 'calm' })] },
            lines: [L('lin', '收到。点火。')] },
          { id: 'slip', label: '推迟 24 小时',
            detail: '士气 −4；着陆燃料余量减少（着陆时燃料告警概率上升）',
            effect: { flags: ['low_margin'], crew: { all: { morale: -4 } } },
            lines: [L('capcom', '发射推迟 24 小时。轨道组正在重算转移轨道。'), L('qin', '慢一点没关系。燃料少一点，就得在别的地方多想一步。')] },
        ],
      },
      days: (s) => -s.day,
      key: true,
    },
    {
      id: 'orbit',
      title: '入轨',
      scene: 'cruise',
      lines: [
        L('lin', '祝融一号，地火转移轨道入轨成功。', { voice: 'ch1_03' }),
        L('rin', '地球……真蓝啊。'),
        L('qin', '从现在开始，你和他们之间的距离，每天都在变长。', { voice: 'ch1_04' }),
      ],
    },
  ],
};
