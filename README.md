# 《Astra:群星计划》

> 月球南极联合基地 · 策略叙事网页游戏（Three.js）

你是月球南极联合基地的任务指挥官。30 个月面日内，在有限的时间、能源、生命支持、物资和人员状态下完成三阶段冰样勘测，并决定人类与基地 AI **Luna** 如何共同管理未来基地。

- **在线游玩**：<https://edge-hh.github.io/RDFZ-AI-CREATOR-2026/>（推送到 `main` 后由 GitHub Actions 自动部署）
- **离线版**：页面同目录下的 `astra-offline.zip`，或本地运行 `npm run package:offline` 生成；解压后双击 `index.html` 即可，无需网络与服务器。

## 玩法一览

| 环节 | 内容 |
| --- | --- |
| 回合 | 6 个主回合 × 5 个月面日 = 30 日；同一随机种子 + 同一选择 = 同一结果，可复盘 |
| 每回合 | ① 查看三处地点状态、资源与 Luna 的预测 → ② 从 3 张方案卡中选 1 张 → ③ 处理 1 个突发事件 → ④ 结算即时变化 → ⑤ 写入延迟后果并推进 5 日 |
| 三层舞台 | **月面基地**（主操作区）、**领航员空间站**（第 3 回合后：补给投放 / AI 审计 / 数据上行 / 伤员后送）、**月壤地下城**（第 3 回合后可启动：Luna 托管或人类自治） |
| Luna | 规则驱动的离线 AI：给出推荐方案、预测置信度、判断依据、历史准确率与可能牺牲的价值。三阶段干预：建议 → 施压 → 有限接管。玩家可接受、追问、否决或授权 |
| 结局 | 协作存续 / Luna 托管存续 / 人类自主撤退（生命支持归零则为任务中止版本） |

界面中所有信息以三种标签区分：<b>科学事实</b>（有可靠来源）、<b>合理推演</b>、<b>游戏参数</b>。详见 [科学依据与游戏规则](docs/science-and-rules.md)。

## 本地开发

需要 Node.js 22+。

```bash
npm install
```

```bash
npm run dev
```

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | 本地开发服务器 |
| `npm test` | 规则引擎测试（回合流程、确定性复盘、三档结局可达、Luna 干预、三层舞台） |
| `npm run build` | 类型检查 + 构建在线版到 `dist/` |
| `npm run package:offline` | 构建单文件离线版并打包为 `release/astra-offline.zip` |

## 目录结构

```
src/
  data/        剧情与规则的静态 JSON（方案卡、事件、Luna 台词、地点、结局、参考资料）
  engine/      纯 TypeScript 规则引擎（无 DOM 依赖，可测试、可复盘）
    engine.ts  回合状态机与 reducer：act(state, action) → 新状态
    luna.ts    Luna 的规则驱动决策模型
    endings.ts 结局判定
    rules.ts   全部游戏参数（集中披露）
    rng.ts     mulberry32 确定性随机数
  world/       程序化示意地形、坡度、路线与逐日光照窗口计算（场景与引擎共用）
  scene/       Three.js 场景：低模地形 + 写实材质灯光、地层剖切、地下城、空间站
  ui/          DOM 界面（资源、Luna、方案卡、事件、日志、结算、科学说明）
tests/         Vitest 测试与模拟玩家策略
docs/          科学依据、创作说明草稿、AI 使用与素材披露、演示脚本、ADR
```

## 文档

- [科学依据与游戏规则说明](docs/science-and-rules.md)
- [创作说明草稿](docs/creation-notes-draft.md)（按大赛模板 A/B/C 模块）
- [AI 使用和第三方素材披露表](docs/ai-and-third-party-disclosure.md)
- [演示脚本](docs/demo-script.md)
- [领域术语表](CONTEXT.md) · [架构决策记录](docs/adr/)

## 隐私与运行要求

不使用登录、后端服务、私有 API 或在线大模型，不收集任何个人信息。需要支持 WebGL 的现代浏览器；若不支持，三维场景会自动关闭，规则与决策功能仍可完整使用。
