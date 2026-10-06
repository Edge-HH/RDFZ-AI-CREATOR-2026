# AI 使用和第三方素材披露表

> 标注 **【待作者填写】** 的内容需由作者如实补充。

## 一、AI 工具使用

| 工具 | 版本 / 使用日期 | 辅助内容 | 成品位置 | 人工工作 |
| --- | --- | --- | --- | --- |
| Claude Code | 模型 Claude Opus 5.5（claude-opus-5-5），2026-10-06 | 依据策划文档 `plan.md` 实现：规则引擎、Luna 决策模型、Three.js 场景、界面、测试、构建与部署脚本 | `src/`、`tests/`、`scripts/`、`.github/workflows/` | 【待作者填写】 |
| Claude Code | 同上 | 编写方案卡、事件、Luna 台词、地点说明与结局文本 | `src/data/*.json` | 【待作者填写：审读、修改、取舍】 |
| Claude Code | 同上 | 检索参考资料，用 Crossref 核对论文 DOI 与标题，用网络请求确认 NASA 网页可访问 | `src/data/sources.json`、`docs/science-and-rules.md` | 【待作者填写：本人复核】 |
| Claude Code | 同上 | 文档初稿：README、科学依据与规则说明、创作说明草稿、本披露表、演示脚本 | `README.md`、`docs/` | 【待作者填写】 |
| 【待作者填写】 | | 如策划阶段使用其他 AI 工具 | `plan.md` | |

**运行时不使用 AI**：游戏中的 Luna 是预写台词 + 规则驱动的离线模型，不调用任何在线大模型或私有 API。

## 二、第三方素材与代码

| 名称 | 类型 | 来源 | 许可 | 用途 |
| --- | --- | --- | --- | --- |
| three.js r186（含 `OrbitControls`） | 代码库 | https://github.com/mrdoob/three.js | MIT | 三维渲染 |
| Vite | 开发工具 | https://vitejs.dev | MIT | 开发服务器与构建 |
| TypeScript | 开发工具 | https://www.typescriptlang.org | Apache-2.0 | 类型检查 |
| Vitest | 开发工具 | https://vitest.dev | MIT | 测试 |
| vite-plugin-singlefile | 开发工具 | https://github.com/richardtallent/vite-plugin-singlefile | MIT | 离线单文件打包 |

- **图片、音乐、音效、字体、配音**：无。三维模型、地形、图标均由代码生成；界面使用操作系统自带字体。
- **数据**：NASA 网页与同行评议论文中的科学信息以文字转述并标注来源（清单见 `docs/science-and-rules.md`），未使用其图片、地图或数据文件。
- **地图**：作品地形为原创程序化示意地形，不表示真实地理位置，无审图号。
- **影视台词彩蛋**：未使用。

## 三、隐私

不使用登录、后端服务、Cookie 或统计脚本，不收集任何个人信息。
