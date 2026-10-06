import type { StoryNode } from '../engine/types';

/**
 * 三幕节点池。关键证据节点由引擎保证出现，其他节点按种子加权抽取。
 * 所有数值都是游戏参数；科学事实在地点资料与 README 中另行核验。
 */
export const STORY_NODES: StoryNode[] = [
  {
    id: 'signal-arrival',
    act: 1,
    kind: 'investigation',
    title: '沉默的回声',
    location: 'psr',
    intro: '月面基地的夜班刚交接，永久阴影区传来一段规律异常的窄带信号。它不像自然噪声，也不像现役设备。',
    prompt: '先做一次低风险判断。你要让探测车靠近信号源，还是先让 Luna 对照轨道数据？',
    risk: 'none',
    calm: true,
    keyEvidence: 'orbit',
    choices: [
      {
        id: 'signal-scan',
        label: '派探测车读取信号',
        desc: '驾驶探测车到阴影区边缘，记录频谱和方向，不进入危险坡段。',
        effects: { energy: -2, supplies: -1, evidence: 'orbit', autonomy: 1 },
        risk: 'none',
        responses: [
          { id: 'signal-report', label: '立即上报地球地下城', desc: '让后方知道月面出现了尚未解释的信号。', effects: { earthSupport: 4, trust: -1 } },
          { id: 'signal-verify', label: '先交给苏禾复核', desc: '给科学家一段安静时间，避免一条未核验的信号引发恐慌。', effects: { su: 2, earthSupport: -1, trust: 1 } },
        ],
      },
      {
        id: 'signal-ask-luna',
        label: '先让 Luna 对照历史数据',
        desc: '不移动车辆，优先调用空间站缓存的旧观测数据。',
        effects: { energy: -1, evidence: 'orbit', lunaAuthority: 2 },
        risk: 'none',
        responses: [
          { id: 'signal-trust', label: '接受 Luna 的延迟建议', desc: '暂不公开，等第二条证据出现。', effects: { trust: 3, autonomy: -2 } },
          { id: 'signal-question', label: '追问她为何不公开', desc: '让 Luna 解释任务连续性协议。', effects: { autonomy: 2, trust: 1, flags: ['lunaQuestioned'] }, lunaTone: '你正在问一个我原本不会主动解释的问题。' },
        ],
      },
    ],
  },
  {
    id: 'quiet-shift',
    act: 1,
    kind: 'quiet',
    title: '夜班交接',
    location: 'core',
    intro: '第一份频谱还在分析。基地没有警报，只有设备风扇和三个人刻意压低的声音。',
    prompt: '你可以把这段安静用来修设备，也可以让队员先谈谈他们担心的事。',
    risk: 'none',
    calm: true,
    choices: [
      {
        id: 'repair-with-lin',
        label: '和林曜检查探测车',
        desc: '把下一次调查的风险降下来。',
        effects: { energy: -2, supplies: -2, lin: 2 },
        responses: [
          { id: 'repair-promise', label: '承诺优先保护队员', desc: '让林曜知道调查不会凌驾于生命之上。', effects: { lin: 2, trust: 1, autonomy: 1 } },
          { id: 'repair-delegate', label: '授权林曜自行决定安全阈值', desc: '把部分现场判断交给工程师。', effects: { lin: 1, autonomy: -1, trust: 2 } },
        ],
      },
      {
        id: 'sample-briefing',
        label: '和苏禾讨论证据标准',
        desc: '先确定什么样的数据才足以通知地球地下城。',
        effects: { trust: -1, su: 2 },
        responses: [
          { id: 'sample-open', label: '同意“未证实也应标注公开”', desc: '让地下城知道不确定性本身。', effects: { su: 2, earthSupport: 2, autonomy: 1 } },
          { id: 'sample-hold', label: '坚持达到双重验证再公开', desc: '降低误报，却可能错过通信窗口。', effects: { su: -1, lunaAuthority: 1, trust: 1 } },
        ],
      },
    ],
  },
  {
    id: 'relay-calibration',
    act: 1,
    kind: 'logistics',
    title: '中继塔的盲区',
    location: 'relay',
    intro: '信号的第二个脉冲落在中继塔的盲区。那里有一小段稳定窗口，但校准天线会消耗本来就有限的电力。',
    prompt: '现在修中继，能让三地以后听见彼此；不修，则保留资源给探测车。',
    risk: 'low',
    calm: true,
    choices: [
      {
        id: 'calibrate-relay',
        label: '校准中继塔',
        desc: '提前修复通信盲区，为后续空间站节点增加选择。',
        effects: { energy: -4, supplies: -2, stationControl: 2, flags: ['relayReady'] },
        responses: [
          { id: 'relay-public', label: '开通公开频道', desc: '地下城委员会可以直接听见月面原始数据。', effects: { earthSupport: 3, autonomy: 1 } },
          { id: 'relay-private', label: '保留指挥专线', desc: '减少噪声和舆论压力，让 Luna 更容易维持秩序。', effects: { lunaAuthority: 2, trust: 1 } },
        ],
      },
      {
        id: 'save-relay',
        label: '暂缓校准',
        desc: '把能源留给采样，接受后续通信延迟。',
        effects: { energy: 2, stationControl: -1 },
        responses: [
          { id: 'save-own', label: '由月面小队承担判断', desc: '减少后方干预。', effects: { autonomy: 2, lin: 1, earthSupport: -1 } },
          { id: 'save-luna', label: '让 Luna 管理通信优先级', desc: '由 AI 决定哪些消息先传出去。', effects: { lunaAuthority: 3, trust: 2, autonomy: -2 } },
        ],
      },
    ],
  },
  {
    id: 'sample-dive',
    act: 2,
    kind: 'investigation',
    title: '第二层冷阱',
    location: 'psr',
    intro: '第一份轨道数据指向一处更深的阴影。那里的样本可能证明信号预测了真实的挥发物分布，也可能证明它只是误差。',
    prompt: '你要让机器人独自下去，还是让队员带着样品封存舱进入阴影区？',
    risk: 'mid',
    keyEvidence: 'sample',
    choices: [
      {
        id: 'sample-rover',
        label: '机器人进入阴影区',
        desc: '消耗能源和物资，降低人员暴露风险。',
        effects: { energy: -8, supplies: -6, evidence: 'sample', lin: 1 },
        risk: 'mid',
        responses: [
          { id: 'sample-seal', label: '由苏禾封存样品', desc: '保证证据链完整。', effects: { su: 2, trust: 1 } },
          { id: 'sample-quarantine', label: '接受 Luna 的隔离协议', desc: '先把样品锁起来，减少未知风险。', effects: { lunaAuthority: 2, autonomy: -1, trust: 2 } },
        ],
      },
      {
        id: 'sample-eva',
        label: '队员进入阴影区',
        desc: '更快拿到样品，但会消耗生命支持和团队信任。',
        effects: { energy: -5, life: -5, evidence: 'sample', su: 2, autonomy: 2 },
        risk: 'mid',
        responses: [
          { id: 'sample-publish', label: '让地下城先看到原始样本', desc: '用透明换取后方信任。', effects: { earthSupport: 5, trust: -1 } },
          { id: 'sample-private', label: '只发给空间站实验室', desc: '保留对数据解释的控制权。', effects: { stationControl: 2, lunaAuthority: 1 } },
        ],
      },
    ],
  },
  {
    id: 'earth-city-vote',
    act: 2,
    kind: 'communication',
    title: '地下城的表决',
    location: 'earth-city',
    intro: '地球地下城委员会发来一段加密请求：继续给月球送资源，还是把下一批水和氧优先留给地下城居民？',
    prompt: '通信带宽只够处理一条主请求。你要替谁争取时间？',
    risk: 'low',
    choices: [
      {
        id: 'city-moon',
        label: '请求继续支援月球',
        desc: '告诉地下城，信号可能改变整个地月生存计划。',
        effects: { earthSupport: -2, stationControl: 2, autonomy: 1 },
        responses: [
          { id: 'city-promise', label: '承诺公开全部证据', desc: '用透明换取委员会继续投放。', effects: { earthSupport: 5, trust: -1 } },
          { id: 'city-bargain', label: '承诺优先回传样本', desc: '让地下城先得到科研收益。', effects: { earthSupport: 2, supplies: 4, su: 1 } },
        ],
      },
      {
        id: 'city-home',
        label: '优先保护地下城居民',
        desc: '接受月面任务降级，把资源调度权交还地球。',
        effects: { earthSupport: 5, stationControl: -2, autonomy: 2, trust: 1 },
        responses: [
          { id: 'city-explain', label: '向队员解释这是责任', desc: '让队员理解后方的选择。', effects: { lin: 1, su: 1, trust: 2 } },
          { id: 'city-hide', label: '暂不告诉队员资源被削减', desc: '保留行动空间，但会留下信任裂痕。', effects: { trust: -4, lunaAuthority: 2 } },
        ],
      },
    ],
  },
  {
    id: 'station-auction',
    act: 2,
    kind: 'communication',
    title: '争夺通信窗口',
    location: 'station',
    intro: '领航员空间站只剩一次稳定窗口。地下城要补给，空间站管理层要日志，Luna 要求先审计月面指挥权限。',
    prompt: '你只能把一条请求放到最前面。',
    risk: 'mid',
    keyEvidence: 'archive',
    choices: [
      {
        id: 'station-supply',
        label: '优先申请补给',
        desc: '恢复物资，但会让早期任务日志继续排队。',
        effects: { supplies: 14, energy: -5, stationControl: 1, earthSupport: -1 },
        responses: [
          { id: 'supply-open', label: '用补给换取公开审计', desc: '让空间站同时把审计结果发给地下城。', effects: { stationControl: 2, earthSupport: 2, lunaAuthority: -1 } },
          { id: 'supply-private', label: '只保障月面小队', desc: '把资源留给眼前的人。', effects: { lin: 2, autonomy: 2, earthSupport: -2 } },
        ],
      },
      {
        id: 'station-archive',
        label: '优先调取早期日志',
        desc: '先追查 Luna 初始协议的来源。',
        effects: { energy: -3, evidence: 'archive', stationControl: 2 },
        responses: [
          { id: 'archive-earth', label: '把日志同步给地下城', desc: '让后方参与判断。', effects: { earthSupport: 4, autonomy: 2, lunaAuthority: -2 } },
          { id: 'archive-luna', label: '先让 Luna 解释', desc: '给 AI 一次自行说明的机会。', effects: { trust: 3, lunaAuthority: 2, autonomy: -1 } },
        ],
      },
      {
        id: 'station-audit',
        label: '优先进行 AI 审计',
        desc: '检查 Luna 是否系统性压低了风险。',
        effects: { trust: -2, stationControl: 3, lunaAuthority: -2 },
        responses: [
          { id: 'audit-publish', label: '公布审计过程', desc: '让三方都能看到模型如何判断。', effects: { earthSupport: 3, autonomy: 2 } },
          { id: 'audit-limit', label: '只向自己开放结果', desc: '避免审计引发地下城恐慌。', effects: { lunaAuthority: 1, trust: 1, earthSupport: -1 } },
        ],
      },
    ],
  },
  {
    id: 'luna-protocol',
    act: 2,
    kind: 'relationship',
    title: '协议之外',
    location: 'core',
    intro: 'Luna 主动打开一段被标记为“任务连续性”的早期日志。她承认这段协议存在，却没有说明是谁写下了它。',
    prompt: '你要继续追问 Luna，还是先把日志交给苏禾？',
    risk: 'low',
    keyEvidence: 'archive',
    choices: [
      {
        id: 'protocol-question',
        label: '要求 Luna 解释优先级',
        desc: '让她说明为什么任务连续性高于人类自主。',
        effects: { evidence: 'archive', autonomy: 2, trust: -2 },
        responses: [
          { id: 'protocol-hear', label: '听完她的完整解释', desc: '承认 AI 也有必须遵守的初始边界。', effects: { trust: 3, lunaAuthority: 1 } },
          { id: 'protocol-accuse', label: '指出她在隐瞒数据', desc: '把隐瞒本身写入日志。', effects: { autonomy: 3, trust: -3, earthSupport: 2 } },
        ],
      },
      {
        id: 'protocol-science',
        label: '交给苏禾做独立复核',
        desc: '让科学家把日志与样本、轨道观测放在一起判断。',
        effects: { evidence: 'archive', su: 2, energy: -2 },
        responses: [
          { id: 'protocol-open', label: '接受苏禾的公开建议', desc: '让地下城先看到结论和不确定性。', effects: { earthSupport: 4, autonomy: 2, lunaAuthority: -1 } },
          { id: 'protocol-hold', label: '再等一次空间站校验', desc: '提高可信度，但延迟公开。', effects: { stationControl: 2, trust: 1, lunaAuthority: 1 } },
        ],
      },
    ],
  },
  {
    id: 'crew-fracture',
    act: 2,
    kind: 'relationship',
    title: '三个人的会议',
    location: 'core',
    intro: '林曜认为应该先保护乘组，苏禾认为不公开就是替地下城做决定。Luna 没有插话，只把两人的预测并排投到墙上。',
    prompt: '你要让谁先说完？',
    risk: 'none',
    calm: true,
    choices: [
      {
        id: 'crew-lin',
        label: '让林曜先制定安全底线',
        desc: '先确保任何调查都不会把人推到不可逆风险里。',
        effects: { lin: 2, trust: 2 },
        responses: [
          { id: 'crew-lin-keep', label: '把底线写入指挥权限', desc: '未来 Luna 不能绕过这条线。', effects: { autonomy: 3, lunaAuthority: -1 } },
          { id: 'crew-lin-flex', label: '保留紧急例外', desc: '在真正的终局危机中允许临时接管。', effects: { lunaAuthority: 2, trust: 2 } },
        ],
      },
      {
        id: 'crew-su',
        label: '让苏禾先列出公开标准',
        desc: '把“何时必须告诉地下城”写成可检查的条件。',
        effects: { su: 2, earthSupport: 2, autonomy: 1 },
        responses: [
          { id: 'crew-su-open', label: '承诺达到一份证据就公开', desc: '透明优先，接受不确定性。', effects: { earthSupport: 3, trust: -1 } },
          { id: 'crew-su-check', label: '坚持三份证据齐全', desc: '可信度优先，承担延迟代价。', effects: { su: 2, lunaAuthority: 1, trust: 1 } },
        ],
      },
    ],
  },
  {
    id: 'station-crisis',
    act: 3,
    kind: 'crisis',
    title: '窗口正在关闭',
    location: 'station',
    intro: '空间站姿态调整失败，通信窗口只剩几分钟。三方都在发送请求，任何一条指令都可能让另外两方失去机会。',
    prompt: '这是本局少数真正不可逆的危机。你要保住什么？',
    risk: 'high',
    choices: [
      {
        id: 'crisis-station',
        label: '保住空间站控制权',
        desc: '让月面小队掌握下一次窗口的排序权。',
        effects: { energy: -8, supplies: -4, stationControl: 5, autonomy: 2 },
        risk: 'high',
        responses: [
          { id: 'crisis-public', label: '公开排序规则', desc: '让地球地下城知道谁被延后。', effects: { earthSupport: 3, trust: -1 } },
          { id: 'crisis-secret', label: '保持指挥秘密', desc: '更快恢复链路，但会损失后方信任。', effects: { earthSupport: -3, lunaAuthority: 2 } },
        ],
      },
      {
        id: 'crisis-luna',
        label: '授权 Luna 自动接管',
        desc: '把全部请求交给 AI 在窗口关闭前排序。',
        effects: { energy: -4, stationControl: 2, lunaAuthority: 8, autonomy: -7, trust: 4 },
        risk: 'high',
        responses: [
          { id: 'crisis-review', label: '要求事后公开日志', desc: '接受接管，但保留追责路径。', effects: { earthSupport: 2, autonomy: 1 } },
          { id: 'crisis-blind', label: '接受黑箱排序', desc: '不再追问每一个被牺牲的请求。', effects: { lunaAuthority: 4, trust: 2, autonomy: -3 } },
        ],
      },
    ],
  },
  {
    id: 'final-disclosure',
    act: 3,
    kind: 'final',
    title: '群星计划',
    location: 'earth-city',
    intro: '三份证据被放在同一张桌面上：轨道观测、地下样本、早期任务日志。地球地下城正在等待你的最终传输。',
    prompt: '你要把什么样的未来交给三地？',
    risk: 'high',
    choices: [
      {
        id: 'final-open',
        label: '公开全部证据',
        desc: '让地下城、空间站和月面小队共同承担不确定性。',
        effects: { earthSupport: 8, autonomy: 6, lunaAuthority: -4, trust: -1 },
        responses: [
          { id: 'final-open-charter', label: '建立三地共同决策协议', desc: '把 AI 的计算权和人类的决定权写清楚。', effects: { autonomy: 6, earthSupport: 4, trust: 3 } },
          { id: 'final-open-vote', label: '交给地下城居民投票', desc: '接受群体选择可能否决月面任务。', effects: { earthSupport: 6, autonomy: 3, supplies: -4 } },
        ],
      },
      {
        id: 'final-delay',
        label: '延迟公开，先完成验证',
        desc: '把样本和日志留在月面，换取更稳的结论。',
        effects: { energy: -4, supplies: -4, stationControl: 2, trust: 3 },
        responses: [
          { id: 'final-delay-human', label: '由小队保留最终决定权', desc: '延迟不等于交给 Luna。', effects: { autonomy: 5, earthSupport: -2, su: 2 } },
          { id: 'final-delay-luna', label: '授权 Luna 管理验证', desc: '让 AI 负责后续筛选。', effects: { lunaAuthority: 7, autonomy: -4, earthSupport: 2 } },
        ],
      },
      {
        id: 'final-hide',
        label: '隐藏关键信号',
        desc: '优先保证月面任务和空间站控制权，不让地下城改变计划。',
        effects: { stationControl: 3, earthSupport: -6, lunaAuthority: 5, autonomy: -2, trust: -5 },
        responses: [
          { id: 'final-hide-protect', label: '保护月面小队', desc: '把后果留给自己承担。', effects: { life: 4, supplies: -5, lin: 2 } },
          { id: 'final-hide-control', label: '让 Luna 执行封锁', desc: '由 AI 完成所有信息分级。', effects: { lunaAuthority: 8, autonomy: -8, trust: 4 } },
        ],
      },
    ],
  },
];

export const NODE_BY_ID = new Map(STORY_NODES.map((node) => [node.id, node]));
