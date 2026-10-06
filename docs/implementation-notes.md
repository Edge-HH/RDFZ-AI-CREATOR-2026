# 实现说明

实现采用 Vite + 原生 TypeScript + Three.js；JSON 内容在 `core/catalog.ts` 一次性解析为规范化节点，reducer 对公开动作进行阶段、节点、条件和资源检查。

- `GameState` 增加 `allocation`（保障能源/负责人）、实际 before/after 决策记录、事件回声和通信置信度。
- 新增 `ALLOCATE` 与 `ABORT` 动作；RETRY 清空当前局状态，保存数据带版本号。
- `DECISION_CONFIRM` 只接受当前目录中的规范方案；传入伪造 effects 不生效。执行阶段拒绝地图/方案/分配操作，结算仅接受一次。
- UI 显示预估和前置条件，不把隐藏随机结果当成必然效果。队员反馈、资源变化和维修记录共同呈现因果。
- 地形、节点指标和文本按钮共用 `routes.json`；旧探针的 psr/ridge 名称仅作为兼容别名，不进入正式叙事。
- 模型本地 GLB + Meshopt 解码，远景使用低模；模型失败保留程序化模型。2D 回退显示相同节点、路线与车队位置。
- 手机地图抽屉、键盘/文字路线按钮、dialog 焦点、减少动画、页面隐藏暂停和本地刷新恢复已接入。
- 不采集/上传个人信息；本地存储只包含游戏状态。音效来自 Web Audio 本地合成。

修改机制时同步维护规则说明与实现说明。发布前执行 unit、浏览器和 production build；浏览器截图保存在 `releases/screenshots/`（不提交缓存产物）。
