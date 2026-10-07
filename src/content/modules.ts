// 第一章配载：12 个槽位。数值被 core/rates.ts 读取
export interface ModuleDef {
  id: string;
  name: string;
  slots: number;
  group: '能源' | '生保' | '安全' | '科研';
  desc: string;
  basis: string; // 科学依据一句话
  archive?: string;
  powerKW?: number; // 恒定发电
  solarKW?: number; // 名义太阳能发电（受纬度与沙尘影响）
  drawKW?: number; // 用电
  storageKWh?: number;
  o2Gen?: number; // 满功率时每天产出的氧气（以“可维持天数”计）
  waterGen?: number; // 乘以着陆点冰储量系数
  foodGen?: number;
  o2?: number;
  water?: number;
  food?: number;
  spares?: number;
  cruiseShield?: number; // 巡航剂量乘数
  surfaceShield?: number; // 地表剂量乘数
  scienceMult?: number; // 科研加成（加法叠加）
  detect?: number; // 风险不确定区间乘数
  safety?: number; // 风险概率修正（负为更安全）
  morale?: number; // 每 30 天士气
}

export const SLOT_BUDGET = 12;

export const MODULES: ModuleDef[] = [
  { id: 'fission', name: '裂变电源', slots: 2, group: '能源', powerKW: 10,
    desc: '10 kWe 小型核裂变堆，昼夜与沙尘暴下都稳定供电。',
    basis: 'NASA Kilopower/KRUSTY 2018 年地面试验验证了 1–10 kWe 级裂变电源。', archive: 'kilopower' },
  { id: 'solar', name: '大型太阳能阵列', slots: 2, group: '能源', solarKW: 16,
    desc: '名义 16 kW，但受纬度和沙尘影响，全球沙尘暴时几乎归零。',
    basis: '火星轨道太阳辐照约 590 W/m²，约为地球的 43%。', archive: 'solar_mars' },
  { id: 'solar_ext', name: '柔性太阳翼扩展', slots: 1, group: '能源', solarKW: 6,
    desc: '轻量化补充阵列，名义 6 kW。',
    basis: '沙尘沉积会持续降低太阳能板效率。' },
  { id: 'battery', name: '储能电池组', slots: 1, group: '能源', storageKWh: 400,
    desc: '增加 400 kWh 储能，用来熬过短期沙尘与夜间。',
    basis: '机遇号在 2018 年全球沙尘暴中因电量耗尽而失联。', archive: 'dust2018' },
  { id: 'moxie', name: 'MOXIE-X 制氧机', slots: 1, group: '生保', o2Gen: 0.7, drawKW: 3,
    desc: '电解大气 CO₂ 制氧，满功率时覆盖 70% 用氧。',
    basis: '毅力号搭载的 MOXIE 在 2021–2023 年共制氧 122 g，峰值 12 g/h。', archive: 'moxie' },
  { id: 'ice_drill', name: '冰层钻探提水', slots: 2, group: '生保', waterGen: 1.2, drawKW: 4,
    desc: '开采地下水冰，产量取决于着陆点冰储量。水也是推进剂工厂的氢源。',
    basis: 'SWIM 项目绘制了火星中纬度浅层地下冰的分布。', archive: 'ice' },
  { id: 'greenhouse', name: '密闭温室', slots: 1, group: '生保', foodGen: 0.25, drawKW: 2, morale: 3,
    desc: '补充 25% 食物，并持续提升士气。',
    basis: '空间站 Veggie 实验已在轨种植生菜等作物。' },
  { id: 'o2_tank', name: '液氧储罐', slots: 1, group: '生保', o2: 150,
    desc: '额外 150 天氧气储备。', basis: '以储代产：用质量换安全裕度。' },
  { id: 'water_tank', name: '额外水储备', slots: 1, group: '生保', water: 150,
    desc: '额外 150 天水储备。', basis: '水同时是良好的辐射屏蔽材料。' },
  { id: 'food_pack', name: '额外食物储备', slots: 1, group: '生保', food: 150,
    desc: '额外 150 天食物。', basis: '首批任务的食物几乎全部需要从地球带去。' },
  { id: 'water_wall', name: '水墙屏蔽舱', slots: 1, group: '安全', cruiseShield: 0.7,
    desc: '巡航期辐射剂量 ×0.7，太阳粒子事件时充当避难所。',
    basis: '好奇号 RAD 实测巡航剂量率约 1.8 mSv/天。', archive: 'rad' },
  { id: 'regolith', name: '风化层覆盖机具', slots: 1, group: '安全', surfaceShield: 0.5,
    desc: '用火星土壤覆盖居住舱，地表剂量 ×0.5。',
    basis: 'RAD 实测火星表面剂量率约 0.64 mSv/天。' },
  { id: 'spares', name: '备件包', slots: 1, group: '安全', spares: 3,
    desc: '+3 份关键备件，故障时可直接更换。', basis: '空间站经验：在轨维修高度依赖备件储备。' },
  { id: 'med', name: '医疗舱升级', slots: 1, group: '安全', safety: -0.03,
    desc: '血液分析仪与远程医疗终端，更容易发现隐藏的健康问题。',
    basis: '长期辐射暴露会影响造血系统。' },
  { id: 'sensors', name: '预警与遥测阵列', slots: 1, group: '安全', detect: 0.5,
    desc: '风险判断的不确定区间减半，太阳粒子事件提前预警。',
    basis: '高能太阳粒子从耀发到抵达可能只需数十分钟。', archive: 'spe' },
  { id: 'rover', name: '加压漫游车', slots: 2, group: '科研', scienceMult: 0.4, safety: -0.05,
    desc: '科研产出 +40%，出舱采样更安全。', basis: '阿波罗 15–17 号的月球车大幅扩展了考察半径。' },
  { id: 'lab', name: '原位分析实验室', slots: 1, group: '科研', scienceMult: 0.3,
    desc: '科研产出 +30%。', basis: '就地分析可以筛选出最有价值的样本带回地球。' },
  { id: 'drone', name: '侦察直升机', slots: 1, group: '科研', scienceMult: 0.1, safety: -0.04,
    desc: '先飞后走：降低出舱与着陆风险，科研 +10%。',
    basis: '机智号在火星完成了 72 次飞行（2021–2024）。', archive: 'ingenuity' },
];

export const moduleById = (id: string) => MODULES.find((m) => m.id === id);
