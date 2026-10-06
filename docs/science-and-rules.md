# 科学依据与实际规则

## 现实依据 / 未来假设

- NASA 热控制： https://www.nasa.gov/smallsat-institute/sst-soa/thermal-control/ 。设备需要保持工作温区、排出废热；本作转为冷却物资和降功率方案。
- NASA ECLSS： https://www.nasa.gov/reference/environmental-control-and-life-support-systems-eclss/ 。人员生命保障涉及系统约束；本作抽象为健康、疲劳与保障预算。
- NASA VIPER： https://science.nasa.gov/mission/viper/rover-and-instruments/ 。地形、坡度、土壤影响车辆移动；本作路线显示距离、坡度和环境差异。
- ESA Moonlight： https://www.esa.int/Applications/Connectivity_and_Secure_Communications/Moonlight2 。地形和视距影响通信，中继可以改善链路；本作模拟公共频道与远程对齐。

行星级推进、轨道迁移、点火芯能力是原创科幻前提，未被上述资料证明。白弧盆地是虚构局部态势模型，没有现实中国地图。数字、坡度、温度、距离与资源差值均为游戏缩放值。

## 数据与判定

初始：时间 1080 分钟、能源 100（容量 120）、物资 80、安全 80、发动机稳定度 42、信任 60、五名成员健康 100/疲劳 0。全部变化由 reducer 执行，三维窗不直接改资源。

八次主决策各推进 12.5%：出发检查、装载、路线、险阻、链路、预校准、维修、点火。修好设备不等于已经点火。

- 保障能源 0/4/8：消耗对应能源，安全 +0/2/4，事件概率下降 0/5/10 个百分点。
- 每次负责人疲劳 +8；沈葵负责校准/维修/点火时稳定度 +3；裴衡负责路线/险阻时安全 +3；阿阮负责时通信 +4；周砾负责塔下维修时节约 20 分钟。
- 事件风险 = 路线风险/200 + (100−安全)/250 + 负责人疲劳/400 + 危险方案系数 − 保障能源/80 − 已做准备系数；限制为 2%–85%。随机流由本局种子、当前节点、选择 ID 固定，预览不会消耗随机数。
- 事件超阈值会增加 30 分钟消耗、损伤当前负责人、削减安全；医疗包减轻伤势。合法代价与实际误差写入维修日志。
- 资源不足时不能确认。时间/能源/安全归零或可用成员少于 3 人，立即进入撤离结算。健康小于 25 的成员不能继续作业。

## 结局优先级

1. 已超出任务生存边界、未真正点火、或稳定度小于 60：静默灯。
2. 真正点火且稳定度至少 75、安全小于 35：冷启动成功（高代价）。
3. 真正点火、稳定度至少 75、安全至少 45、可用成员至少 4、所有成员健康至少 60：稳态迁移。
4. 其余真正点火且稳定度至少 60：带伤续航。

## 当前选择差值

下表来自 `src/data/decisions.json`，不含负责人、保障投入与事件产生的额外变化。

| 方案 | 基础差值 | 下个节点 |
|---|---|---|
| 暂停扫描运输舱 | time -8；commsConfidence +10；progress +12.5 | loadout |
| 装舱，边走边测 | energy -4；safety -4；progress +12.5 | loadout |
| 先问塔区：为何缺了一段记录？ | time -5；trust +5；commsConfidence +4；progress +12.5 | loadout |
| 装载备用冷却桶 | supplies -8；energy -6；engineStability +12；progress +12.5 | route |
| 装载加大电池包 | energy +18；supplies -10；safety -5；progress +12.5 | route |
| 装载医疗包与锚索 | supplies -10；safety +8；progress +12.5 | route |
| 南坡冰脊：短线切入 | time -90；energy -10；safety -8；progress +12.5 | ice-event |
| 西侧地热沟：缓坡绕行 | time -150；energy -12；safety +2；progress +12.5 | steam-event |
| 把剩余锚索打进冰架 | time -24；supplies -4；safety +5；progress +12.5 | relay |
| 让无人机先探路 | time -18；energy -8；safety +5；commsConfidence +8；progress +12.5 | relay |
| 不停车，压过错层带 | energy -8；supplies -3；safety -18；crewFatigue +12；progress +12.5 | relay |
| 启用备用中继 | energy -12；supplies -4；trust +4；commsConfidence +14；progress +12.5 | relay |
| 低信号行驶 | energy -6；safety -8；commsConfidence -20；progress +12.5 | relay |
| 相信周砾的旧井道 | time -32；supplies -3；safety +2；trust +3；progress +12.5 | relay |
| 停车完成低温预校准 | time -60；energy -5；safety +5；engineStability +15；progress +12.5 | mount |
| 边走边校准 | energy -10；safety -10；engineStability +3；commsConfidence -4；progress +12.5 | mount |
| 跳过预校准，直接进塔区 | engineStability -15；progress +12.5 | mount |
| 泄压净化后降功率重启 | time -90；energy -18；supplies -3；safety +10；engineStability +18；progress +12.5 | ignition |
| 旁路直连点火 | time -18；energy -8；safety -20；engineStability +10；progress +12.5；crewHealth -18 | ignition |
| 远程分工对齐 | energy -12；supplies -4；safety +6；engineStability +10；progress +12.5 | ignition |
| 投入全部冷却芯，稳态点火 | supplies -20；energy -15；engineStability +22；progress +12.5；safety +4；time -50 | ending |
| 保留一半冷却芯给下一座塔 | supplies -10；energy -10；safety +4；engineStability +12；progress +12.5；time -50 | ending |
| 撤出队员，取消本次点火 | time -60；safety +12；trust +4；progress +12.5 | ending |
| 架设中继，再交接校准数据 | time -45；energy -8；supplies -4；commsConfidence +24；progress +12.5 | calibration |
| 走有线接口 | time -70；supplies -5；commsConfidence +18；trust +5；progress +12.5 | calibration |
| 保留电量，凭本地读数继续 | time -20；commsConfidence -25；safety -8；progress +12.5 | calibration |
| 旁路增压：强行拉起点火曲线 | time -20；energy -10；supplies -14；safety -18；engineStability +26；crewHealth -15；progress +12.5 | ending |
